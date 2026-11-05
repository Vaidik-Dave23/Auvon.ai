"""
Voice lesson tutor ("study call" with a whiteboard), lecture style.

How a call flows:
  1. /start   : the tutor plans the topic (3-5 parts) and teaches part 1 in
                one go, then asks "Any doubts, or shall I go ahead?".
  2. /part    : the NEXT part is generated in the background while the
                student is still listening (prefetch, advance=false), so
                "go ahead" plays instantly (advance=true just reads the cache).
  3. /turn    : only for doubts. A question is answered briefly; "I didn't
                get it" re-explains the current part with the next untried
                approach (definition -> analogy -> worked example -> direct,
                enforced here in code, a weak point is recorded at "direct").
                If the model decides the student just wants to continue,
                the response says continue_lecture=true and no audio.
  After the last part comes a short wrap-up part, then the lesson is done.

Any study topic works. Started from a note, the most relevant excerpts of the
note are a reference, not a limit. Non-study topics are declined.

Speed: live voice calls use ai(fast=True) (quick model, no thinking), note
excerpts are ranked locally (no embedding call), and parts are prefetched.
"""

import json
import re
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from app.core.limiter import limiter
from app.core.logging_config import get_logger
from app.database import (
    document_chunks_col,
    get_db,
    id_filter,
    notes_col,
    to_object_id,
    tutor_lessons_col,
    tutor_usage_col,
    user_notes_col,
)
from app.routes.notes import chunk_text
from app.services.ai import ai
from app.utils.dependencies import get_verified_user

log = get_logger(__name__)

router = APIRouter(prefix="/tutor/lesson", tags=["voice-tutor"])

DAILY_MESSAGE_LIMIT = 50          # shared with /tutor/chat via tutor_usage
APPROACHES = ["definition", "analogy", "worked_example"]
APPROACH_LABELS = {
    "definition": "Definition",
    "analogy": "Analogy",
    "worked_example": "Worked example",
    "direct": "Direct answer",
}
LINE_STYLES = {"title", "normal", "wrong", "right"}
BOARD_ACTIONS = {"none", "open", "clear", "add"}
MAX_CONTEXT_CHARS = 4000
MIN_PARTS, MAX_PARTS = 2, 5
STOPWORDS = set("""a an and are as at be by can do does for from how i in is it its me my of on or so
that the this to was what when where which who why will with you your about explain teach tell
please want learn understand""".split())


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class LessonStartRequest(BaseModel):
    note_id: Optional[str] = None     # optional: start from a note, or from any study topic
    topic: Optional[str] = None


class LessonPartRequest(BaseModel):
    index: int
    advance: bool = False             # false = prefetch only, true = the student moved on


class LessonTurnRequest(BaseModel):
    text: str
    alternatives: List[str] = []      # other speech-to-text hearings of the same words


class BoardLine(BaseModel):
    text: str
    style: str = "normal"


class BoardAction(BaseModel):
    action: str = "none"
    lines: List[BoardLine] = []


class Segment(BaseModel):
    say: str
    board: BoardAction = BoardAction()


class LessonSource(BaseModel):
    label: str
    snippet: str


class LessonTurnResponse(BaseModel):
    lesson_id: str
    note_title: str
    topic: str
    status: str                       # "teaching" | "done" | "off_topic" (nothing was started)
    segments: List[Segment]
    outline: List[str] = []
    part_index: int = 0               # part these segments belong to (== len(outline) for the wrap-up)
    part_title: str = ""
    is_final: bool = False            # the wrap-up part
    continue_lecture: bool = False    # /turn: the student wants to move on, play the next part
    approach: str = "definition"
    approach_label: str = "Definition"
    approaches_tried: List[str] = []
    weak_points: List[str] = []
    summary: str = ""
    sources: List[LessonSource] = []
    remaining_today: int = 0


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _consume_quota(user_id: str) -> int:
    """Count one tutor call against the shared daily cap; return remaining."""
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    doc = tutor_usage_col.find_one({"user_id": user_id, "date": today})
    used = doc.get("count", 0) if doc else 0
    if used >= DAILY_MESSAGE_LIMIT:
        raise HTTPException(
            status_code=429,
            detail=f"Daily tutor limit reached ({DAILY_MESSAGE_LIMIT}/day). Try again tomorrow.",
        )
    tutor_usage_col.update_one(
        {"user_id": user_id, "date": today}, {"$inc": {"count": 1}}, upsert=True
    )
    return max(0, DAILY_MESSAGE_LIMIT - (used + 1))


def _owned_note(user_id: str, note_id: str) -> dict:
    link = user_notes_col.find_one({"user_id": user_id, "note_id": str(note_id)})
    note = notes_col.find_one(id_filter(note_id)) if link else None
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    return note


def _note_chunks(note: dict) -> List[dict]:
    note_id = str(note.get("_id") or note.get("id"))
    chunks = list(document_chunks_col.find({"note_id": note_id}))
    if chunks:
        return chunks
    # Older notes were never embedded: fall back to plain text chunks.
    return [{"chunk_text": c, "embedding": None} for c in chunk_text(note.get("content", "") or "")]


def _words(text: str) -> set:
    return {w for w in re.findall(r"[a-z0-9]+", (text or "").lower()) if len(w) > 2 and w not in STOPWORDS}


def _rank_chunks(chunks: List[dict], query: Optional[str], k: int, min_overlap: int = 0) -> List[dict]:
    """Rank by word overlap with the query. Local and instant, so the call
    never waits on an embedding request."""
    if not chunks:
        return []
    q = _words(query or "")
    if not q:
        return chunks[:k] if min_overlap == 0 else []
    scored = []
    for i, c in enumerate(chunks):
        overlap = len(q & _words(c.get("chunk_text", "")))
        if overlap >= max(1, min_overlap) or min_overlap == 0:
            scored.append((overlap, i, c))
    scored.sort(key=lambda x: (-x[0], x[1]))
    return [c for _, _, c in scored[:k]]


def _context_blocks(chunks: List[dict]) -> List[str]:
    blocks, total = [], 0
    for c in chunks:
        txt = (c.get("chunk_text") or "").strip()
        if not txt:
            continue
        if total + len(txt) > MAX_CONTEXT_CHARS:
            txt = txt[: max(0, MAX_CONTEXT_CHARS - total)]
        if not txt:
            break
        blocks.append(txt)
        total += len(txt)
    return blocks


def _clip(s, n: int) -> str:
    s = re.sub(r"\s+", " ", str(s or "")).strip()
    return s if len(s) <= n else s[: n - 1].rstrip() + "…"


def _parse_model_json(raw: str) -> Optional[dict]:
    if not raw:
        return None
    cleaned = raw.strip()
    cleaned = re.sub(r"^```(?:json)?", "", cleaned).strip()
    cleaned = re.sub(r"```$", "", cleaned).strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        m = re.search(r"\{.*\}", cleaned, re.S)
        if m:
            try:
                return json.loads(m.group(0))
            except json.JSONDecodeError:
                return None
    return None


def _sanitize_segments(data: dict, fallback_text: str, max_segments: int = 10) -> List[Segment]:
    segs: List[Segment] = []
    for s in (data or {}).get("segments", [])[:max_segments]:
        if not isinstance(s, dict):
            continue
        say = _clip(s.get("say"), 320)
        if not say:
            continue
        b = s.get("board") or {}
        action = b.get("action") if b.get("action") in BOARD_ACTIONS else "none"
        lines = []
        for ln in (b.get("lines") or [])[:4]:
            if isinstance(ln, str):
                ln = {"text": ln}
            if not isinstance(ln, dict):
                continue
            t = _clip(ln.get("text"), 90)
            if t:
                style = ln.get("style") if ln.get("style") in LINE_STYLES else "normal"
                lines.append(BoardLine(text=t, style=style))
        if lines and action == "none":
            action = "add"
        segs.append(Segment(say=say, board=BoardAction(action=action, lines=lines)))
    if not segs:
        segs = [Segment(say=_clip(fallback_text, 320) or "Sorry, I lost my train of thought. Could you say that again?")]
    return segs


RULES = """You are Auvon's voice tutor on a live study call. You are SPEAKING out loud like a teacher giving a short lecture, and you can write on a whiteboard the student sees.

1. STUDY ONLY. You teach anything a student could study: school and college subjects, programming, AI/ML, data, maths, science, engineering, languages, exam prep, career and professional skills. Anything not about learning (gossip, celebrities, sports scores, entertainment, dating, chit-chat, anything harmful) is "off_topic": decline in one friendly sentence and ask what they want to study.
2. Teach from your own knowledge. If NOTE EXCERPTS are given and relevant, use them and say so briefly ("your note says..."); teach beyond them when needed. Never invent facts.
3. The student's words come from browser speech-to-text, which often mishears technical terms ("RAG" heard as "rag", "rack" or "that", "SQL" as "sequel"). Read them in the light of the topic and the alternative hearings.
4. Speak naturally: short sentences, no markdown, no lists, no emoji, no LaTeX. Say maths in words ("w minus eta times the gradient").
5. Each segment's "say" is 1 or 2 sentences. The whiteboard is for formulas, numbers, short labels and steps (max 4 lines per segment, under 60 characters each, plain symbols like η ² × → −). "open" the first time you write, "clear" for a fresh board, otherwise "add". Skip the board when words are enough.
6. Do NOT ask the student questions in the middle of teaching and do NOT end with a question; the app asks "any doubts, or shall I go ahead?" itself.

A segment looks like: {"say": "...", "board": {"action": "none|open|clear|add", "lines": [{"text": "...", "style": "title|normal|wrong|right"}]}}
Reply with ONLY JSON, nothing else."""


def _call_model(lesson_ctx: str, task: str, endpoint: str) -> dict:
    messages = [
        {"role": "system", "content": RULES},
        {"role": "user", "content": f"{lesson_ctx}\n\nTASK:\n{task}"},
    ]
    raw = ai(messages, endpoint_name=endpoint, temperature=0.4, fast=True)
    data = _parse_model_json(raw)
    if data is None:
        log.warning("voice_lesson_bad_json", endpoint=endpoint, preview=(raw or "")[:200])
        return {"segments": [], "_raw": raw}
    return data


def _ctx(lesson: dict, extra_blocks: Optional[List[str]] = None) -> str:
    blocks = list(dict.fromkeys(list(lesson.get("blocks", [])) + list(extra_blocks or [])))[:5]
    excerpts = "\n\n".join(f"[{i}] {b}" for i, b in enumerate(blocks, 1)) or "(none: teach from your own knowledge)"
    outline = "\n".join(f"{i + 1}. {t}" for i, t in enumerate(lesson.get("outline", []))) or "(not planned yet)"
    convo = "\n".join(f"{h['role'].upper()}: {h['text']}" for h in lesson.get("history", [])[-6:]) or "(call just started)"
    return (
        f"LESSON TOPIC: {lesson.get('topic')}\nNOTE: {lesson.get('note_title') or '(no note, general lesson)'}\n\n"
        f"LESSON PLAN:\n{outline}\n\nNOTE EXCERPTS:\n{excerpts}\n\nRECENT CALL:\n{convo}"
    )


def _doubt_prompt(lesson: dict, index: int) -> Segment:
    outline = lesson.get("outline", [])
    if index >= len(outline):
        return Segment(say="That's the whole lesson. Any last doubts? If not, just say done.")
    if index == len(outline) - 1:
        return Segment(say="That was the last part. Any doubts, or shall I wrap up?")
    return Segment(say="Any doubts so far, or shall I go ahead?")


def _part_task(lesson: dict, index: int) -> str:
    outline = lesson.get("outline", [])
    if index >= len(outline):
        return (
            "Wrap up the lesson: in 2 or 3 segments recap the key takeaways of the whole plan (use the board for a "
            "short recap list) and mention anything the student struggled with. "
            'Return {"segments": [...], "summary": "one sentence summary of the lesson"}.'
        )
    done = ", ".join(outline[:index]) or "nothing yet"
    return (
        f"Teach part {index + 1} of the plan: \"{outline[index]}\". Already covered: {done}. "
        "Start with a one-sentence bridge from the previous part. Teach it fully in 5 to 8 segments: explain the "
        "idea, give a concrete example, and use the board for formulas or steps. Do not repeat earlier parts. "
        'Return {"segments": [...]}.'
    )


def _lesson_id(doc: dict) -> str:
    return str(doc.get("_id") or doc.get("id"))


def _save(lesson: dict, fields: dict) -> None:
    fields["updated_at"] = datetime.now(timezone.utc)
    lesson.update(fields)
    oid = to_object_id(_lesson_id(lesson)) or lesson.get("_id")
    tutor_lessons_col.update_one({"_id": oid}, {"$set": fields})


def _response(lesson: dict, segments: List[Segment], remaining: int, index: Optional[int] = None,
              continue_lecture: bool = False) -> LessonTurnResponse:
    outline = lesson.get("outline", [])
    idx = lesson.get("current", 0) if index is None else index
    approach = lesson.get("approach", "definition")
    return LessonTurnResponse(
        lesson_id=_lesson_id(lesson),
        note_title=lesson.get("note_title", "") or "",
        topic=lesson.get("topic", ""),
        status=lesson.get("status", "teaching"),
        segments=segments,
        outline=outline,
        part_index=idx,
        part_title=outline[idx] if idx < len(outline) else "Wrap-up",
        is_final=idx >= len(outline),
        continue_lecture=continue_lecture,
        approach=approach,
        approach_label=APPROACH_LABELS.get(approach, approach),
        approaches_tried=lesson.get("tried", []),
        weak_points=lesson.get("weak_points", []),
        summary=lesson.get("summary", ""),
        sources=[LessonSource(label=f"{lesson.get('note_title') or 'Note'} · excerpt {i}", snippet=_clip(b, 160))
                 for i, b in enumerate(lesson.get("blocks", [])[:4], 1)],
        remaining_today=remaining,
    )


def _remaining(user_id: str) -> int:
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    doc = tutor_usage_col.find_one({"user_id": user_id, "date": today})
    return max(0, DAILY_MESSAGE_LIMIT - (doc.get("count", 0) if doc else 0))


def _get_lesson(user_id: str, lesson_id: str) -> dict:
    lesson = tutor_lessons_col.find_one({"user_id": user_id, **id_filter(lesson_id)})
    if not lesson:
        raise HTTPException(status_code=404, detail="Lesson not found")
    return lesson


def _segments_out(segments: List[Segment]) -> list:
    return [s.model_dump() if hasattr(s, "model_dump") else s.dict() for s in segments]


# ---------------------------------------------------------------------------
# Routes (sync on purpose: ai() blocks, so FastAPI runs these in a threadpool)
# ---------------------------------------------------------------------------

@router.post("/start", response_model=LessonTurnResponse)
@limiter.limit("10/minute")
def start_lesson(request: Request, body: LessonStartRequest, user=Depends(get_verified_user), db=Depends(get_db)):
    user_id = str(user.id)
    topic = _clip(body.topic, 120) or ""
    note = _owned_note(user_id, body.note_id) if body.note_id else None
    if not note and not topic:
        raise HTTPException(status_code=400, detail="Tell me what you want to study.")
    remaining = _consume_quota(user_id)

    note_title = (note.get("title") or "your note") if note else ""
    if note:
        chunks = _note_chunks(note)
        blocks = _context_blocks(_rank_chunks(chunks, topic, k=3, min_overlap=1) if topic else chunks[:3])
    else:
        blocks = []

    draft = {"topic": topic or "(choose the key idea of the note)", "note_title": note_title, "blocks": blocks,
             "outline": [], "history": []}
    task = (
        "First check rule 1. If the topic is not about studying, return "
        '{"intent": "off_topic", "segments": [one friendly decline that asks what they want to study]}.\n'
        f"Otherwise plan the lesson as {MIN_PARTS} to {MAX_PARTS} short parts (titles under 6 words, simplest first), "
        "then teach PART 1: greet the student in one short sentence, say in one sentence what the lesson will cover, "
        "then teach part 1 fully in 5 to 8 segments. "
        'Return {"intent": "teach", "topic": "the topic name in a few words", "outline": ["...", "..."], "segments": [...]}.'
    )
    data = _call_model(_ctx(draft), task, "voice_lesson_start")
    segments = _sanitize_segments(data, data.get("_raw", ""))

    if data.get("intent") == "off_topic":
        log.info("voice_lesson_off_topic", user_id=user_id, topic=topic)
        return LessonTurnResponse(lesson_id="", note_title=note_title, topic=topic, status="off_topic",
                                  segments=segments[:2], remaining_today=remaining)

    outline = [_clip(t, 60) for t in (data.get("outline") or []) if isinstance(t, str) and t.strip()][:MAX_PARTS]
    if not outline:
        outline = [_clip(topic or note_title or "The key idea", 60)]
    if segments and segments[0].board.lines and segments[0].board.action in ("none", "add"):
        segments[0].board.action = "open"
    segments.append(_doubt_prompt({"outline": outline}, 0))

    now = datetime.now(timezone.utc)
    lesson = {
        "user_id": user_id,
        "note_id": str(body.note_id) if note else None,
        "note_title": note_title,
        "topic": topic or _clip(data.get("topic"), 80) or note_title,
        "blocks": blocks,
        "outline": outline,
        "parts": {"0": _segments_out(segments)},
        "current": 0,
        "approach": "definition",
        "tried": ["definition"],
        "weak_points": [],
        "status": "teaching",
        "summary": "",
        "history": [{"role": "tutor", "text": _clip(" ".join(s.say for s in segments), 600)}],
        "created_at": now,
        "updated_at": now,
    }
    res = tutor_lessons_col.insert_one(lesson)
    lesson["_id"] = res.inserted_id
    log.info("voice_lesson_started", user_id=user_id, note_id=body.note_id, parts=len(outline))
    return _response(lesson, segments, remaining, index=0)


@router.post("/{lesson_id}/part", response_model=LessonTurnResponse)
@limiter.limit("30/minute")
def lesson_part(lesson_id: str, request: Request, body: LessonPartRequest, user=Depends(get_verified_user), db=Depends(get_db)):
    """Get part `index` (generated once, then cached). advance=true moves the lesson to it."""
    user_id = str(user.id)
    lesson = _get_lesson(user_id, lesson_id)
    outline = lesson.get("outline", [])
    current = lesson.get("current", 0)
    if body.index < 0 or body.index > len(outline) or body.index > current + 1:
        raise HTTPException(status_code=400, detail="That part is not available yet")

    key = str(body.index)
    parts = dict(lesson.get("parts") or {})
    if key in parts:
        segments = [Segment(**s) for s in parts[key]]
        remaining = _remaining(user_id)
    else:
        remaining = _consume_quota(user_id)
        data = _call_model(_ctx(lesson), _part_task(lesson, body.index), "voice_lesson_part")
        segments = _sanitize_segments(data, data.get("_raw", ""))
        segments.append(_doubt_prompt(lesson, body.index))
        parts[key] = _segments_out(segments)
        fields = {"parts": parts}
        if body.index >= len(outline):
            fields["summary"] = _clip(data.get("summary") or f"Covered {lesson.get('topic')}.", 300)
        _save(lesson, fields)

    if body.advance and body.index > current:
        history = list(lesson.get("history", [])) + [{"role": "tutor", "text": _clip(" ".join(s.say for s in segments), 600)}]
        _save(lesson, {"current": body.index, "approach": "definition", "tried": ["definition"], "history": history[-16:]})
    return _response(lesson, segments, remaining, index=body.index)


@router.post("/{lesson_id}/turn", response_model=LessonTurnResponse)
@limiter.limit("20/minute")
def lesson_turn(lesson_id: str, request: Request, body: LessonTurnRequest, user=Depends(get_verified_user), db=Depends(get_db)):
    """The student said something at a pause: a doubt, confusion, or 'go ahead'."""
    user_id = str(user.id)
    text = (body.text or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Say or type something first")
    if len(text) > 1000:
        raise HTTPException(status_code=400, detail="That message is too long for a voice turn")

    lesson = _get_lesson(user_id, lesson_id)
    if lesson.get("status") == "done":
        raise HTTPException(status_code=409, detail="This lesson has finished. Start a new one.")
    remaining = _consume_quota(user_id)

    outline = lesson.get("outline", [])
    current = lesson.get("current", 0)
    is_wrapup = current >= len(outline)
    part_title = outline[current] if current < len(outline) else "the whole lesson"
    tried = list(lesson.get("tried", ["definition"]))
    untried = [a for a in APPROACHES if a not in tried]
    next_approach = untried[0] if untried else "direct"

    extra = []
    if lesson.get("note_id"):
        try:
            note = notes_col.find_one(id_filter(lesson["note_id"]))
            if note:
                extra = _context_blocks(_rank_chunks(_note_chunks(note), text, k=2, min_overlap=2))
        except Exception as e:
            log.warning("voice_lesson_extra_context_failed", error=str(e))

    alternatives = [_clip(a, 300) for a in (body.alternatives or [])[:3] if a and a.strip() and a.strip() != text]
    heard = text + (f"  (other hearings: {' | '.join(alternatives)})" if alternatives else "")
    approach_rule = (
        f"use the '{next_approach}' approach: " + {
            "analogy": "an everyday picture that maps onto the idea, then link it back.",
            "worked_example": "a tiny concrete example with real numbers or code steps on the board.",
            "definition": "state the idea precisely and show it on the board.",
            "direct": "explain it as plainly and simply as possible, in the fewest words.",
        }[next_approach]
    )
    task = (
        f"The tutor just finished teaching \"{part_title}\" and asked if the student has doubts or wants to go ahead.\n"
        f"STUDENT SAID (speech-to-text, may be misheard): {heard}\n\n"
        "Decide intent:\n"
        "- \"continue\": they want to move on (yes, ok, go ahead, no doubts, next, haan, aage chalo, done...). Return "
        '{"intent": "continue", "segments": []}.\n'
        "- \"question\": a specific doubt about studying (any subject). Answer it in 2 to 4 segments, use the board if it helps.\n"
        f"- \"confused\": they did not understand this part. Re-explain its core idea in 3 to 5 segments and {approach_rule}\n"
        "- \"off_topic\": not about studying. One friendly sentence that this call is for studying.\n"
        'Return {"intent": "...", "segments": [...]}.'
    )
    data = _call_model(_ctx(lesson, extra), task, "voice_lesson_turn")
    intent = data.get("intent") if data.get("intent") in ("continue", "question", "confused", "off_topic") else "question"

    history = list(lesson.get("history", [])) + [{"role": "student", "text": _clip(text, 400)}]
    if intent == "continue":
        fields = {"history": history[-16:]}
        if is_wrapup:
            fields["status"] = "done"
        _save(lesson, fields)
        return _response(lesson, [], remaining, index=current, continue_lecture=True)

    segments = _sanitize_segments(data, data.get("_raw", ""), max_segments=6)
    fields: dict = {}
    if intent == "confused":
        if next_approach == "direct":
            weak = list(lesson.get("weak_points", []))
            if part_title not in weak:
                weak.append(_clip(part_title, 120))
            fields["weak_points"] = weak
        fields.update({"approach": next_approach, "tried": tried + [next_approach]})
    follow = ("Does that help? Any other doubts, or shall I go ahead?" if not is_wrapup
              else "Does that help? Any other doubts? If not, say done.")
    if intent == "off_topic":
        follow = "So, any doubts about the lesson, or shall I go ahead?" if not is_wrapup else "Any last doubts about the lesson?"
    segments.append(Segment(say=follow))

    history.append({"role": "tutor", "text": _clip(" ".join(s.say for s in segments), 600)})
    fields["history"] = history[-16:]
    _save(lesson, fields)
    resp = _response(lesson, segments, remaining, index=current)
    if intent == "confused" and next_approach == "direct":
        resp.approach, resp.approach_label = "direct", APPROACH_LABELS["direct"]
        resp.approaches_tried = APPROACHES + ["direct"]
    return resp


@router.post("/{lesson_id}/finish")
def finish_lesson(lesson_id: str, user=Depends(get_verified_user), db=Depends(get_db)):
    """The student said 'done' / no doubts after the wrap-up (detected in the app, no AI call)."""
    lesson = _get_lesson(str(user.id), lesson_id)
    _save(lesson, {"status": "done"})
    return {"status": "done", "summary": lesson.get("summary", "")}


@router.get("/{lesson_id}")
def get_lesson(lesson_id: str, user=Depends(get_verified_user), db=Depends(get_db)):
    lesson = _get_lesson(str(user.id), lesson_id)
    return {
        "lesson_id": _lesson_id(lesson),
        "note_title": lesson.get("note_title"),
        "topic": lesson.get("topic"),
        "status": lesson.get("status"),
        "outline": lesson.get("outline", []),
        "current": lesson.get("current", 0),
        "weak_points": lesson.get("weak_points", []),
        "summary": lesson.get("summary", ""),
        "history": lesson.get("history", []),
    }
