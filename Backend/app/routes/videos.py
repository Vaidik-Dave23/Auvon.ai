from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks
from typing import Optional, List, Dict, Any, Union
from datetime import datetime
from pydantic import BaseModel, Field
from threading import Lock
import time

from app.database import (
    get_db,
    goals_col,
    steps_col,
    notes_col,
    user_notes_col,
    tests_col,
    questions_col,
    id_filter,
    to_object_id,
    serialize_doc,
)
from app.schemas.test import QuestionOut
from app.services.youtube import (
    youtube_service,
    is_valid_youtube_id,
    extract_youtube_id,
    get_youtube_embed_url,
    build_search_query,
)
from app.services.ai import (
    generate_ai_notes,
    generate_questions,
    generate_notes_from_youtube_direct,
    generate_quiz_from_youtube_direct,
)
from app.routes.notes import embed_and_store_note_chunks, note_to_dict
from app.services.resources import resolve_best_resources
from app.utils.hash import generate_hash
from app.utils.dependencies import get_verified_user
from app.core.logging_config import get_logger

log = get_logger(__name__)

router = APIRouter(tags=["videos"])

# In-flight operation locks
_active_video_operations: dict[str, float] = {}
_ops_lock = Lock()


def _check_and_acquire_lock(key: str, ttl_seconds: int = 90) -> bool:
    with _ops_lock:
        now = time.time()
        expired = [k for k, t in _active_video_operations.items() if now - t > ttl_seconds]
        for k in expired:
            _active_video_operations.pop(k, None)

        if key in _active_video_operations:
            return False
        _active_video_operations[key] = now
        return True


def _release_lock(key: str) -> None:
    with _ops_lock:
        _active_video_operations.pop(key, None)


def _build_video_failure_detail(direct_error: Optional[str], transcript_msg: Optional[str]) -> str:
    err_lower = (direct_error or "").lower()

    if "token count exceeds" in err_lower or "too long" in err_lower or "maximum number of tokens" in err_lower:
        reason = "This video is too long for direct AI video processing (>1M tokens / multi-hour lecture)."
    elif "private" in err_lower or "restricted" in err_lower or "inaccessible" in err_lower or "404" in err_lower:
        reason = "This video is private, restricted, or inaccessible for direct AI video processing."
    elif "quota" in err_lower or "rate limit" in err_lower or "429" in err_lower or "exhausted" in err_lower:
        reason = "AI video processing quota or rate limit was reached across all active keys."
    elif "invalid" in err_lower and "key" in err_lower:
        reason = "AI provider key configuration error."
    elif "timeout" in err_lower or "timed out" in err_lower or "connection" in err_lower:
        reason = "A temporary network timeout occurred while analyzing the video."
    elif direct_error:
        reason = f"Direct AI video analysis failed: {direct_error[:150]}"
    else:
        reason = "Direct AI video analysis was unsuccessful."

    caption_note = transcript_msg or "Automatic YouTube captions are also disabled or unavailable."
    return f"{reason} {caption_note} You can paste notes or a transcript below to generate structured AI notes."


class VideoNotesRequest(BaseModel):
    title: Optional[str] = None
    custom_transcript: Optional[str] = None
    step_id: Optional[Union[int, str]] = None
    goal_id: Optional[Union[int, str]] = None
    force_refresh: Optional[bool] = False


class VideoQuizRequest(BaseModel):
    num_questions: int = Field(5, ge=1, le=10)
    difficulty: str = Field("easy")
    custom_transcript: Optional[str] = None
    step_id: Optional[Union[int, str]] = None
    force_refresh: Optional[bool] = False


@router.get("/videos/search")
def search_videos(
    q: str = Query(..., min_length=2, description="Search terms for YouTube tutorials"),
    max_results: int = Query(3, ge=1, le=5),
    user = Depends(get_verified_user)
):
    return youtube_service.search_videos(query=q, max_results=max_results)


@router.get("/videos/{video_id}")
def get_video_info(
    video_id: str,
    step_id: Optional[Union[int, str]] = Query(None, description="Optional associated roadmap step ID"),
    db = Depends(get_db),
    user = Depends(get_verified_user)
):
    clean_id = extract_youtube_id(video_id)
    if not clean_id or not is_valid_youtube_id(clean_id):
        raise HTTPException(
            status_code=400,
            detail="Invalid YouTube video ID format. YouTube IDs must be 11 characters."
        )

    video_details = youtube_service.get_video_details(clean_id)
    user_id_str = str(user.id)

    task_context = None
    goal_context = None

    if step_id:
        step = steps_col.find_one(id_filter(step_id))
        goal = None
        if step:
            goal = goals_col.find_one(id_filter(step.get("goal_id")))
        else:
            goal = goals_col.find_one({"steps.id": str(step_id), "user_id": user_id_str})
            if goal:
                for s in goal.get("steps", []):
                    if str(s.get("id")) == str(step_id):
                        step = s
                        break

        if step and goal and str(goal.get("user_id")) == user_id_str:
            task_context = {
                "step_id": str(step.get("_id") or step.get("id")),
                "text": step.get("description", ""),
                "done": bool(step.get("is_completed")),
                "week": step.get("week", 1),
            }
            goal_context = {
                "goal_id": str(goal.get("_id") or goal.get("id")),
                "title": goal.get("title", ""),
            }

    return {
        **video_details,
        "task": task_context,
        "goal": goal_context,
    }


@router.get("/videos/{video_id}/transcript")
def get_video_transcript_status(
    video_id: str,
    user = Depends(get_verified_user)
):
    clean_id = extract_youtube_id(video_id)
    if not clean_id or not is_valid_youtube_id(clean_id):
        raise HTTPException(status_code=400, detail="Invalid YouTube video ID format.")

    status = youtube_service.get_video_transcript(clean_id)
    return {
        "video_id": clean_id,
        "available": status["available"],
        "snippets_count": status.get("snippets_count", 0),
        "char_count": status.get("char_count", 0),
        "source": status.get("source"),
        "message": status.get("message"),
        "preview": status["text"][:300] if status.get("text") else None,
    }


@router.post("/videos/{video_id}/notes")
def generate_notes_from_video(
    video_id: str,
    payload: VideoNotesRequest,
    background_tasks: BackgroundTasks,
    db = Depends(get_db),
    user = Depends(get_verified_user)
):
    clean_id = extract_youtube_id(video_id)
    if not clean_id or not is_valid_youtube_id(clean_id):
        raise HTTPException(status_code=400, detail="Invalid YouTube video ID format.")

    user_id_str = str(user.id)
    lock_key = f"{user_id_str}:{clean_id}:notes"
    if not _check_and_acquire_lock(lock_key):
        raise HTTPException(
            status_code=409,
            detail="A notes generation request for this video is already in progress. Please wait a moment."
        )

    try:
        video_hash = generate_hash(f"video_{clean_id}")
        if not payload.force_refresh and not payload.custom_transcript:
            existing_note = notes_col.find_one({"source": "video", "hash_key": video_hash})
            if existing_note:
                note_id_str = str(existing_note.get("_id") or existing_note.get("id"))
                link = user_notes_col.find_one({"user_id": user_id_str, "note_id": note_id_str})
                if not link:
                    user_notes_col.insert_one({"user_id": user_id_str, "note_id": note_id_str})

                log.info("returning_cached_video_note", note_id=note_id_str, video_id=clean_id)
                return {
                    "message": "Loaded existing notes generated for this video",
                    "note": note_to_dict(existing_note),
                    "note_id": note_id_str,
                    "cached": True,
                }

        details = youtube_service.get_video_details(clean_id)
        video_title = payload.title or details.get("title") or f"YouTube Video {clean_id}"

        content = None
        direct_error = None

        if payload.custom_transcript and payload.custom_transcript.strip():
            log.info("using_custom_transcript_for_notes", video_id=clean_id, length=len(payload.custom_transcript))
            prompt_query = (
                f"Video Title: {video_title}\n"
                f"Video ID: {clean_id}\n\n"
                f"TRANSCRIPT / SPOKEN CONTENT:\n"
                f"{payload.custom_transcript.strip()[:12000]}"
            )
            content = generate_ai_notes(prompt_query, is_pdf=True)
        else:
            transcript_status = youtube_service.get_video_transcript(clean_id)
            if transcript_status.get("available") and transcript_status.get("text"):
                log.info("using_fast_spoken_transcript_for_notes", video_id=clean_id, chars=transcript_status.get("char_count"))
                prompt_query = (
                    f"Video Title: {video_title}\n"
                    f"Video ID: {clean_id}\n\n"
                    f"TRANSCRIPT / SPOKEN CONTENT:\n"
                    f"{transcript_status['text'][:12000]}"
                )
                content = generate_ai_notes(prompt_query, is_pdf=True)
            else:
                try:
                    log.info("captions_unavailable_attempting_direct_gemini_video_notes", video_id=clean_id)
                    content = generate_notes_from_youtube_direct(clean_id, video_title)
                    log.info("direct_gemini_video_notes_success", video_id=clean_id, length=len(content))
                except Exception as exc:
                    direct_error = str(exc)
                    log.warning("direct_gemini_video_notes_failed", video_id=clean_id, error=direct_error)

                if not content:
                    detail_msg = _build_video_failure_detail(direct_error, transcript_status.get("message"))
                    raise HTTPException(status_code=422, detail=detail_msg)

        note_title = f"Notes: {video_title[:90]}"

        existing_note = notes_col.find_one({"hash_key": video_hash})
        if existing_note:
            note_id_str = str(existing_note.get("_id") or existing_note.get("id"))
            notes_col.update_one(
                {"_id": existing_note["_id"]},
                {"$set": {
                    "title": note_title,
                    "content": content,
                    "created_at": datetime.utcnow().isoformat(),
                }}
            )
            target_note = {**existing_note, "title": note_title, "content": content}
        else:
            new_note = {
                "title": note_title,
                "content": content,
                "hash_key": video_hash,
                "source": "video",
                "created_at": datetime.utcnow().isoformat(),
            }
            inserted = notes_col.insert_one(new_note)
            note_id_str = str(inserted.inserted_id)
            notes_col.update_one({"_id": inserted.inserted_id}, {"$set": {"id": note_id_str}})
            new_note["_id"] = inserted.inserted_id
            new_note["id"] = note_id_str
            target_note = new_note

        link = user_notes_col.find_one({"user_id": user_id_str, "note_id": note_id_str})
        if not link:
            user_notes_col.insert_one({"user_id": user_id_str, "note_id": note_id_str})

        background_tasks.add_task(embed_and_store_note_chunks, note_id_str, content)

        log.info("video_notes_created", note_id=note_id_str, video_id=clean_id)
        return {
            "message": "Notes generated successfully from video content",
            "note": note_to_dict(target_note),
            "note_id": note_id_str
        }
    finally:
        _release_lock(lock_key)


@router.post("/videos/{video_id}/quiz")
def generate_quiz_from_video(
    video_id: str,
    payload: VideoQuizRequest,
    db = Depends(get_db),
    user = Depends(get_verified_user)
):
    clean_id = extract_youtube_id(video_id)
    if not clean_id or not is_valid_youtube_id(clean_id):
        raise HTTPException(status_code=400, detail="Invalid YouTube video ID format.")

    user_id_str = str(user.id)
    lock_key = f"{user_id_str}:{clean_id}:quiz"
    if not _check_and_acquire_lock(lock_key):
        raise HTTPException(
            status_code=409,
            detail="A quiz generation request for this video is already in progress. Please wait a moment."
        )

    try:
        details = youtube_service.get_video_details(clean_id)
        video_title = details.get("title") or f"YouTube Video {clean_id}"

        if not payload.force_refresh and not payload.custom_transcript:
            recent_test = tests_col.find_one(
                {
                    "user_id": user_id_str,
                    "difficulty": payload.difficulty,
                    "topic": f"Quiz: {video_title[:80]}"
                },
                sort=[("_id", -1)]
            )
            if recent_test:
                test_questions = recent_test.get("questions") or list(questions_col.find({"test_id": str(recent_test["_id"])}))
                if len(test_questions) == payload.num_questions:
                    try:
                        created_dt = datetime.fromisoformat(recent_test.get("created_at", ""))
                        if (datetime.utcnow() - created_dt).total_seconds() < 1800:
                            saved_questions = [
                                QuestionOut(
                                    id=str(q.get("_id") or q.get("id")),
                                    question=q.get("question_text", ""),
                                    options=q.get("options") or []
                                )
                                for q in test_questions
                            ]
                            test_id_str = str(recent_test.get("_id") or recent_test.get("id"))
                            return {
                                "message": "Loaded existing quiz generated for this video",
                                "test_id": test_id_str,
                                "topic": recent_test.get("topic"),
                                "difficulty": recent_test.get("difficulty"),
                                "questions": saved_questions,
                                "cached": True,
                            }
                    except Exception:
                        pass

        questions_data = None
        direct_error = None

        if payload.custom_transcript and payload.custom_transcript.strip():
            quiz_context = (
                f"Video: {video_title}\n\n"
                f"KEY CONTENT FROM TRANSCRIPT / NOTES:\n"
                f"{payload.custom_transcript.strip()[:6000]}"
            )
            questions_data = generate_questions(
                topic=quiz_context,
                num=payload.num_questions,
                difficulty=payload.difficulty
            )
        else:
            transcript_status = youtube_service.get_video_transcript(clean_id)
            if transcript_status.get("available") and transcript_status.get("text"):
                log.info("using_fast_spoken_transcript_for_quiz", video_id=clean_id, chars=transcript_status.get("char_count"))
                quiz_context = (
                    f"Video: {video_title}\n\n"
                    f"KEY CONTENT FROM TRANSCRIPT:\n"
                    f"{transcript_status['text'][:6000]}"
                )
                questions_data = generate_questions(
                    topic=quiz_context,
                    num=payload.num_questions,
                    difficulty=payload.difficulty
                )
            else:
                try:
                    log.info("captions_unavailable_attempting_direct_gemini_video_quiz", video_id=clean_id)
                    questions_data = generate_quiz_from_youtube_direct(
                        video_id=clean_id,
                        video_title=video_title,
                        num_questions=payload.num_questions,
                        difficulty=payload.difficulty
                    )
                    log.info("direct_gemini_video_quiz_success", video_id=clean_id, count=len(questions_data))
                except Exception as exc:
                    direct_error = str(exc)
                    log.warning("direct_gemini_video_quiz_failed", video_id=clean_id, error=direct_error)

                if not questions_data:
                    detail_msg = _build_video_failure_detail(direct_error, transcript_status.get("message"))
                    raise HTTPException(status_code=422, detail=detail_msg)

        new_test_doc = {
            "user_id": user_id_str,
            "topic": f"Quiz: {video_title[:80]}",
            "difficulty": payload.difficulty,
            "created_at": datetime.utcnow().isoformat(),
            "questions": []
        }
        inserted_test = tests_col.insert_one(new_test_doc)
        test_id_str = str(inserted_test.inserted_id)
        tests_col.update_one({"_id": inserted_test.inserted_id}, {"$set": {"id": test_id_str}})

        saved_questions = []
        embedded_questions = []

        for q in questions_data:
            q_doc = {
                "test_id": test_id_str,
                "question_text": q["question"],
                "options": q["options"],
                "correct_answer": q["correct_answer"],
            }
            inserted_q = questions_col.insert_one(q_doc)
            q_id_str = str(inserted_q.inserted_id)
            questions_col.update_one({"_id": inserted_q.inserted_id}, {"$set": {"id": q_id_str}})
            q_doc["id"] = q_id_str
            embedded_questions.append(q_doc)

            saved_questions.append(
                QuestionOut(
                    id=q_id_str,
                    question=q["question"],
                    options=q["options"]
                )
            )

        tests_col.update_one({"_id": inserted_test.inserted_id}, {"$set": {"questions": embedded_questions}})

        log.info("video_quiz_created", test_id=test_id_str, video_id=clean_id, questions=len(saved_questions))
        return {
            "message": "Interactive quiz generated from video content",
            "test_id": test_id_str,
            "topic": new_test_doc["topic"],
            "difficulty": new_test_doc["difficulty"],
            "questions": saved_questions
        }
    finally:
        _release_lock(lock_key)


@router.post("/steps/{step_id}/videos/refresh")
def refresh_step_videos(
    step_id: Union[int, str],
    db = Depends(get_db),
    user = Depends(get_verified_user)
):
    step = steps_col.find_one(id_filter(step_id))
    goal = None
    if step:
        goal = goals_col.find_one(id_filter(step.get("goal_id")))
    else:
        goal = goals_col.find_one({"steps.id": str(step_id)})
        if goal:
            for s in goal.get("steps", []):
                if str(s.get("id")) == str(step_id):
                    step = s
                    break

    if not step:
        raise HTTPException(status_code=404, detail="Step not found or access denied")

    goal_title = goal.get("title", "") if goal else ""
    query = build_search_query(goal_title, step.get("description", ""))

    videos = youtube_service.search_videos(query=query, max_results=1)

    steps_col.update_one(id_filter(step_id), {"$set": {"videos": videos}})
    if goal:
        goals_col.update_one(
            {"_id": goal["_id"], "steps.id": str(step_id)},
            {"$set": {"steps.$.videos": videos}}
        )

    return {"step_id": str(step_id), "videos": videos}


@router.post("/goals/{goal_id}/videos/refresh")
def refresh_goal_videos(
    goal_id: Union[int, str],
    db = Depends(get_db),
    user = Depends(get_verified_user)
):
    user_id_str = str(user.id)
    flt = {"$and": [id_filter(goal_id), {"user_id": user_id_str}]}
    goal = goals_col.find_one(flt)
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found or access denied")

    steps = goal.get("steps") or list(steps_col.find({"goal_id": str(goal.get("_id") or goal.get("id"))}))
    refreshed_steps = []

    for step in steps:
        s_id = str(step.get("_id") or step.get("id"))
        query = build_search_query(goal.get("title", ""), step.get("description", ""))
        videos = youtube_service.search_videos(query=query, max_results=1)
        step["videos"] = videos
        steps_col.update_one(id_filter(s_id), {"$set": {"videos": videos}})
        refreshed_steps.append({"step_id": s_id, "videos": videos})

    goals_col.update_one({"_id": goal["_id"]}, {"$set": {"steps": steps}})

    return {
        "message": f"Successfully refreshed resources for {len(refreshed_steps)} tasks",
        "goal_id": str(goal_id),
        "refreshed": refreshed_steps,
    }


@router.post("/steps/{step_id}/resources/refresh")
def refresh_step_resources(
    step_id: Union[int, str],
    db = Depends(get_db),
    user = Depends(get_verified_user)
):
    step = steps_col.find_one(id_filter(step_id))
    goal = None
    if step:
        goal = goals_col.find_one(id_filter(step.get("goal_id")))
    else:
        goal = goals_col.find_one({"steps.id": str(step_id)})
        if goal:
            for s in goal.get("steps", []):
                if str(s.get("id")) == str(step_id):
                    step = s
                    break

    if not step:
        raise HTTPException(status_code=404, detail="Step not found or access denied")

    goal_title = goal.get("title", "") if goal else ""
    resources = resolve_best_resources(goal_title, step.get("description", ""))

    steps_col.update_one(id_filter(step_id), {"$set": {"videos": resources}})
    if goal:
        goals_col.update_one(
            {"_id": goal["_id"], "steps.id": str(step_id)},
            {"$set": {"steps.$.videos": resources}}
        )

    return {"step_id": str(step_id), "videos": resources}


@router.post("/goals/{goal_id}/resources/refresh")
def refresh_goal_resources(
    goal_id: Union[int, str],
    db = Depends(get_db),
    user = Depends(get_verified_user)
):
    user_id_str = str(user.id)
    flt = {"$and": [id_filter(goal_id), {"user_id": user_id_str}]}
    goal = goals_col.find_one(flt)
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found or access denied")

    steps = goal.get("steps") or list(steps_col.find({"goal_id": str(goal.get("_id") or goal.get("id"))}))
    refreshed_steps = []

    for step in steps:
        s_id = str(step.get("_id") or step.get("id"))
        resources = resolve_best_resources(goal.get("title", ""), step.get("description", ""))
        step["videos"] = resources
        steps_col.update_one(id_filter(s_id), {"$set": {"videos": resources}})
        refreshed_steps.append({"step_id": s_id, "videos": resources})

    goals_col.update_one({"_id": goal["_id"]}, {"$set": {"steps": steps}})

    return {
        "message": f"Successfully resolved optimal resources for {len(refreshed_steps)} tasks",
        "goal_id": str(goal_id),
        "refreshed": refreshed_steps,
    }
