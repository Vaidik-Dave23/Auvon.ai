import json

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone
import math

from app.database import (
    get_db,
    notes_col,
    user_notes_col,
    document_chunks_col,
    test_results_col,
    user_answers_col,
    goals_col,
    steps_col,
    tutor_sessions_col,
    tutor_usage_col,
    id_filter,
    to_object_id,
    serialize_doc,
)
from app.utils.dependencies import get_verified_user
from app.utils.embeddings import get_query_embedding
from app.routes.notes import cosine_similarity
from app.services.ai import ai, stream_ai
from app.core.limiter import limiter
from app.core.logging_config import get_logger

log = get_logger(__name__)

router = APIRouter(prefix="/tutor", tags=["tutor"])

DAILY_MESSAGE_LIMIT = 50


class TutorChatRequest(BaseModel):
    session_id: Optional[str] = None
    message: str
    note_id: Optional[str] = None
    test_id: Optional[str] = None
    goal_id: Optional[str] = None


class SourceItem(BaseModel):
    note_id: str
    title: str
    snippet: str


class TutorChatResponse(BaseModel):
    session_id: str
    reply: str
    sources: List[SourceItem]
    remaining_today: int


def _prepare_chat(body: TutorChatRequest, user) -> dict:
    """Validate, count quota, gather context and build the prompt (no model call)."""
    user_id_str = str(user.id)
    raw_message = (body.message or "").strip()

    if not raw_message:
        raise HTTPException(status_code=400, detail="Message cannot be empty")
    if len(body.message) > 2000:
        raise HTTPException(status_code=400, detail="Message exceeds maximum length of 2,000 characters")

    # ── Daily Usage & Cost Guardrail ──────────────────────────────────────────
    utc_today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    usage_doc = tutor_usage_col.find_one({"user_id": user_id_str, "date": utc_today})
    current_count = usage_doc.get("count", 0) if usage_doc else 0

    if current_count >= DAILY_MESSAGE_LIMIT:
        raise HTTPException(
            status_code=429,
            detail="Daily tutor message limit reached (50 messages/day). Please try again tomorrow!"
        )

    # Increment usage counter
    tutor_usage_col.update_one(
        {"user_id": user_id_str, "date": utc_today},
        {"$inc": {"count": 1}},
        upsert=True
    )
    remaining_today = max(0, DAILY_MESSAGE_LIMIT - (current_count + 1))

    # ── Context: User's Own Notes & Chunk Retrieval ───────────────────────────
    user_notes = list(user_notes_col.find({"user_id": user_id_str}))
    user_note_ids = {str(un.get("note_id")) for un in user_notes if un.get("note_id")}

    target_note_ids = []
    if body.note_id:
        # Restrict strictly to the provided note IF owned by the user
        if str(body.note_id) in user_note_ids:
            target_note_ids = [str(body.note_id)]
    else:
        target_note_ids = list(user_note_ids)

    sources = []
    chunk_context_blocks = []
    if target_note_ids:
        try:
            chunks = list(document_chunks_col.find({"note_id": {"$in": target_note_ids}}))
            if chunks:
                query_emb = get_query_embedding(raw_message)
                scored = []
                for c in chunks:
                    emb = c.get("embedding")
                    if emb:
                        score = cosine_similarity(query_emb, emb)
                        scored.append((score, c))
                scored.sort(key=lambda x: x[0], reverse=True)
                top_chunks = scored[:4]

                # Fetch titles for note IDs in top chunks
                chunk_note_ids = list({to_object_id(c.get("note_id")) or c.get("note_id") for _, c in top_chunks})
                matched_notes = list(notes_col.find({"_id": {"$in": chunk_note_ids}}))
                titles = {str(n.get("_id")): n.get("title", "Study Note") for n in matched_notes}

                for idx, (score, c) in enumerate(top_chunks, 1):
                    n_id = str(c.get("note_id"))
                    note_title = titles.get(n_id) or "Study Note"
                    snippet = (c.get("chunk_text") or "").strip()[:200]
                    sources.append(SourceItem(
                        note_id=n_id,
                        title=note_title,
                        snippet=snippet
                    ))
                    chunk_context_blocks.append(
                        f"[{idx}] (Note: '{note_title}', id: {n_id})\n{c.get('chunk_text', '').strip()}"
                    )
        except Exception as e:
            log.warning("tutor_retrieval_failed", error=str(e), user_id=user_id_str)

    # ── Context: Weak Topics ──────────────────────────────────────────────────
    weak_topics = []
    try:
        recent_results = list(test_results_col.find({"user_id": user_id_str}).sort("_id", -1).limit(3))
        for r in recent_results:
            wt = r.get("weak_topics")
            if wt and isinstance(wt, list):
                weak_topics.extend(wt)

        # Fallback to incorrect user answers if weak_topics field is empty
        if not weak_topics and recent_results:
            recent_test_ids = [str(r.get("test_id")) for r in recent_results if r.get("test_id")]
            wrong_answers = list(user_answers_col.find({
                "user_id": user_id_str,
                "test_id": {"$in": recent_test_ids},
                "is_correct": False
            }).limit(6))
            for wa in wrong_answers:
                if wa.get("question_text"):
                    weak_topics.append(wa["question_text"])
    except Exception as e:
        log.warning("tutor_weak_topics_lookup_failed", error=str(e), user_id=user_id_str)

    weak_topics = list(dict.fromkeys([w for w in weak_topics if w]))[:5]

    # ── Context: Learning Goal ────────────────────────────────────────────────
    goal_info = None
    if body.goal_id:
        try:
            goal_doc = goals_col.find_one({"user_id": user_id_str, **id_filter(body.goal_id)})
            if goal_doc:
                goal_title = goal_doc.get("title", "Active Goal")
                g_id_str = str(goal_doc.get("_id") or goal_doc.get("id"))
                steps = goal_doc.get("steps") or list(steps_col.find({"goal_id": g_id_str}))
                current_step_text = None
                for s in steps:
                    if not s.get("is_completed"):
                        current_step_text = s.get("description") or s.get("text")
                        break
                goal_info = {
                    "title": goal_title,
                    "current_step": current_step_text or "All current steps completed"
                }
        except Exception as e:
            log.warning("tutor_goal_context_failed", error=str(e), goal_id=body.goal_id)

    # ── Context: Test Check & Integrity Guard ─────────────────────────────────
    is_unsubmitted_test = False
    if body.test_id:
        try:
            submission = test_results_col.find_one({"user_id": user_id_str, "test_id": str(body.test_id)})
            if not submission:
                is_unsubmitted_test = True
        except Exception as e:
            log.warning("tutor_test_status_check_failed", error=str(e), test_id=body.test_id)

    # ── Session & Rolling History ─────────────────────────────────────────────
    session = None
    if body.session_id:
        session = tutor_sessions_col.find_one({"user_id": user_id_str, **id_filter(body.session_id)})

    now_utc = datetime.now(timezone.utc)
    if not session:
        session_title = raw_message[:60].strip()
        new_session = {
            "user_id": user_id_str,
            "title": session_title,
            "messages": [],
            "summary": "",
            "context": {
                "note_id": body.note_id,
                "test_id": body.test_id,
                "goal_id": body.goal_id,
            },
            "created_at": now_utc,
            "updated_at": now_utc,
        }
        res = tutor_sessions_col.insert_one(new_session)
        session_id_str = str(res.inserted_id)
        session = new_session
        session["_id"] = session_id_str
    else:
        session_id_str = str(session.get("_id") or session.get("id"))
        ctx_updates = {}
        if body.note_id:
            ctx_updates["context.note_id"] = body.note_id
        if body.test_id:
            ctx_updates["context.test_id"] = body.test_id
        if body.goal_id:
            ctx_updates["context.goal_id"] = body.goal_id
        if ctx_updates:
            tutor_sessions_col.update_one(
                {"_id": to_object_id(session_id_str) or session["_id"]},
                {"$set": ctx_updates}
            )

    messages = session.get("messages", [])
    rolling_summary = session.get("summary", "")

    # If session passes 12 turns, regenerate rolling summary with one ai() call
    if len(messages) > 12:
        try:
            summary_prompt = [
                {
                    "role": "system",
                    "content": "You are a concise educational summarizer. Summarize this tutoring dialogue in 2-3 clear sentences highlighting the main topics explored, misconceptions clarified, and current progress."
                },
                {
                    "role": "user",
                    "content": f"Prior Summary: {rolling_summary or 'None'}\n\nRecent messages:\n" + "\n".join([f"{m['role']}: {m['content']}" for m in messages[-12:]])
                }
            ]
            new_summary = ai(summary_prompt, endpoint_name="tutor_summary", temperature=0.3)
            if new_summary:
                rolling_summary = new_summary.strip()
                tutor_sessions_col.update_one(
                    {"_id": to_object_id(session_id_str) or session["_id"]},
                    {"$set": {"summary": rolling_summary}}
                )
        except Exception as e:
            log.warning("tutor_summary_refresh_failed", error=str(e), session_id=session_id_str)

    # ── System Prompt Construction ────────────────────────────────────────────
    system_rules = [
        "You are Auvon's AI Socratic study tutor. Your mission is to help the student learn deeply by thinking through concepts instead of simply feeding them answers.",
        "\nCORE INSTRUCTIONS:",
        "1. SOCRATIC PEDAGOGY: Give a concise hint and ask ONE thoughtful guiding question first. Never hand out the full answer upfront. Provide the full solution ONLY if the student explicitly asks for it ('just tell me the answer', 'give me the solution') or remains stuck after you have already given two hints.",
        "2. GROUNDING & CITATIONS: Ground your answers in the retrieved excerpts from the student's own notes provided below. Cite relevant excerpts using [1], [2], etc. If the student's notes do not cover the topic, state explicitly on a single line: 'This isn't covered in your notes, but here is the concept:' and then answer from general knowledge, clearly labelled.",
        "3. BREVITY & FORMATTING: Keep your responses concise and under 180 words, unless the student specifically asks for detailed elaboration. Markdown formatting and KaTeX math ($...$ for inline, $$...$$ for display equations) are welcomed.",
    ]

    if is_unsubmitted_test:
        system_rules.append(
            "\n*** CRITICAL TEST INTEGRITY GUARD ***\n"
            "The user is actively working on an unsubmitted checkpoint or test. You must NEVER reveal, confirm, validate, or hint at the correct answer or multiple choice option letter. Explain only the underlying general concept Socratically."
        )

    if weak_topics:
        system_rules.append(f"\nStudent's recent weak topics from assessments: {', '.join(weak_topics)}.")

    if goal_info:
        system_rules.append(
            f"\nActive Learning Goal: '{goal_info['title']}'. Current step being worked on: '{goal_info['current_step']}'."
        )

    if rolling_summary:
        system_rules.append(f"\nPrevious session summary:\n{rolling_summary}")

    if chunk_context_blocks:
        system_rules.append(
            "\nRETRIEVED EXCERPTS FROM STUDENT'S NOTES:\n" + "\n\n".join(chunk_context_blocks)
        )
    else:
        system_rules.append("\nRETRIEVED EXCERPTS FROM STUDENT'S NOTES: None available for this topic.")

    prompt_messages = [
        {"role": "system", "content": "\n".join(system_rules)}
    ]

    # Include the last 6 turns for immediate conversational flow
    recent_history = messages[-6:]
    for m in recent_history:
        prompt_messages.append({"role": m["role"], "content": m["content"]})

    prompt_messages.append({"role": "user", "content": raw_message})

    return {
        "user_id": user_id_str,
        "session_id": session_id_str,
        "session_key": to_object_id(session_id_str) or session["_id"],
        "prompt_messages": prompt_messages,
        "sources": sources,
        "remaining_today": remaining_today,
        "raw_message": raw_message,
        "now_utc": now_utc,
    }


def _persist_chat(ctx: dict, reply: str) -> None:
    user_turn = {
        "role": "user",
        "content": ctx["raw_message"],
        "sources": [],
        "ts": ctx["now_utc"].isoformat()
    }
    assistant_turn = {
        "role": "assistant",
        "content": reply,
        "sources": [s.model_dump() for s in ctx["sources"]],
        "ts": datetime.now(timezone.utc).isoformat()
    }
    tutor_sessions_col.update_one(
        {"_id": ctx["session_key"]},
        {
            "$push": {"messages": {"$each": [user_turn, assistant_turn]}},
            "$set": {"updated_at": datetime.now(timezone.utc)}
        }
    )


# Sync on purpose: ai() and the DB calls block, so FastAPI runs this in a threadpool
# instead of freezing the event loop for every other user.
@router.post("/chat", response_model=TutorChatResponse)
@limiter.limit("10/minute")
def tutor_chat(
    request: Request,
    body: TutorChatRequest,
    user=Depends(get_verified_user),
    db=Depends(get_db)
):
    ctx = _prepare_chat(body, user)
    reply = ai(ctx["prompt_messages"], endpoint_name="tutor_chat", temperature=0.3)
    _persist_chat(ctx, reply)
    return TutorChatResponse(
        session_id=ctx["session_id"],
        reply=reply,
        sources=ctx["sources"],
        remaining_today=ctx["remaining_today"]
    )


@router.post("/chat/stream")
@limiter.limit("10/minute")
def tutor_chat_stream(
    request: Request,
    body: TutorChatRequest,
    user=Depends(get_verified_user),
    db=Depends(get_db)
):
    """Same as /tutor/chat but streams the reply (Server-Sent Events).

    Events: {"type": "meta", session_id, sources, remaining_today}
            {"type": "delta", "text": "..."} ...
            {"type": "done", "reply": "..."}  or  {"type": "error", "detail": "..."}
    """
    ctx = _prepare_chat(body, user)   # 400 / 429 are raised here, before the stream starts

    def sse(event: dict) -> str:
        return f"data: {json.dumps(event, default=str)}\n\n"

    def events():
        yield sse({"type": "meta", "session_id": ctx["session_id"],
                   "sources": [s.model_dump() for s in ctx["sources"]],
                   "remaining_today": ctx["remaining_today"]})
        parts = []
        try:
            for delta in stream_ai(ctx["prompt_messages"], endpoint_name="tutor_chat_stream", temperature=0.3):
                parts.append(delta)
                yield sse({"type": "delta", "text": delta})
        except Exception as e:
            log.error("tutor_stream_failed", error=str(e))
            if not parts:
                yield sse({"type": "error", "detail": "Tutor is temporarily unavailable. Please try again."})
                return
        reply = "".join(parts)
        _persist_chat(ctx, reply)
        yield sse({"type": "done", "reply": reply})

    return StreamingResponse(events(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@router.get("/sessions")
def get_tutor_sessions(user=Depends(get_verified_user), db=Depends(get_db)):
    """Return the user's last 20 tutoring sessions."""
    user_id_str = str(user.id)
    cursor = tutor_sessions_col.find(
        {"user_id": user_id_str},
        {"messages": 0}
    ).sort("updated_at", -1).limit(20)

    results = []
    for s in cursor:
        s_id = str(s.get("_id") or s.get("id"))
        updated_at = s.get("updated_at")
        if isinstance(updated_at, datetime):
            updated_str = updated_at.isoformat()
        else:
            updated_str = str(updated_at or "")

        results.append({
            "id": s_id,
            "title": s.get("title", "Study Session"),
            "updated_at": updated_str,
            "context": s.get("context", {})
        })
    return results


@router.get("/sessions/{session_id}")
def get_tutor_session(session_id: str, user=Depends(get_verified_user), db=Depends(get_db)):
    """Return a single session with full message history."""
    user_id_str = str(user.id)
    session = tutor_sessions_col.find_one({"user_id": user_id_str, **id_filter(session_id)})
    if not session:
        raise HTTPException(status_code=404, detail="Tutor session not found")

    session = serialize_doc(session)
    if "updated_at" in session and isinstance(session["updated_at"], datetime):
        session["updated_at"] = session["updated_at"].isoformat()
    if "created_at" in session and isinstance(session["created_at"], datetime):
        session["created_at"] = session["created_at"].isoformat()

    return session


@router.delete("/sessions/{session_id}")
def delete_tutor_session(session_id: str, user=Depends(get_verified_user), db=Depends(get_db)):
    """Delete a tutoring session."""
    user_id_str = str(user.id)
    res = tutor_sessions_col.delete_one({"user_id": user_id_str, **id_filter(session_id)})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Tutor session not found")
    return {"message": "Tutor session deleted"}

