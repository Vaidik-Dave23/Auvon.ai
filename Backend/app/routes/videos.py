from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks
from sqlalchemy.orm import Session
from typing import Optional, List, Dict, Any
from datetime import datetime
from pydantic import BaseModel, Field
from threading import Lock
import time

from app.database import get_db
from app.models.goal import Goal, Step
from app.models.notes import Notes, UserNotes
from app.models.test import Test, Question
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

# In-flight operation locks to prevent duplicate submissions from accidental double-clicks
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
    """
    Construct an informative, actionable error message distinguishing specific failure modes.
    """
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
    step_id: Optional[int] = None
    goal_id: Optional[int] = None
    force_refresh: Optional[bool] = False


class VideoQuizRequest(BaseModel):
    num_questions: int = Field(5, ge=1, le=10)
    difficulty: str = Field("easy")
    custom_transcript: Optional[str] = None
    step_id: Optional[int] = None
    force_refresh: Optional[bool] = False


@router.get("/videos/search")
def search_videos(
    q: str = Query(..., min_length=2, description="Search terms for YouTube tutorials"),
    max_results: int = Query(3, ge=1, le=5),
    user = Depends(get_verified_user)
):
    """
    Search YouTube for relevant educational videos with graceful search fallback.
    Must be defined before parameterized /videos/{video_id} route.
    """
    return youtube_service.search_videos(query=q, max_results=max_results)


@router.get("/videos/{video_id}")
def get_video_info(
    video_id: str,
    step_id: Optional[int] = Query(None, description="Optional associated roadmap step ID"),
    db: Session = Depends(get_db),
    user = Depends(get_verified_user)
):
    """
    Retrieve validated video metadata and embed configuration for the in-app lesson player.
    Supports associating video with a specific roadmap task context.
    """
    clean_id = extract_youtube_id(video_id)
    if not clean_id or not is_valid_youtube_id(clean_id):
        raise HTTPException(
            status_code=400,
            detail="Invalid YouTube video ID format. YouTube IDs must be 11 characters."
        )

    # Fetch official metadata and embeddability check
    video_details = youtube_service.get_video_details(clean_id)

    task_context = None
    goal_context = None

    # If associated step is provided, check ownership and provide task context
    if step_id:
        step = (
            db.query(Step)
            .join(Goal)
            .filter(Step.id == step_id, Goal.user_id == user.id)
            .first()
        )
        if step:
            task_context = {
                "step_id": step.id,
                "text": step.description,
                "done": bool(step.is_completed),
                "week": step.week,
            }
            if step.goal:
                goal_context = {
                    "goal_id": step.goal.id,
                    "title": step.goal.title,
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
    """
    Check if an actual spoken transcript / subtitles can be retrieved from YouTube.
    Returns status and preview without returning the entire full text if too large.
    """
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
    db: Session = Depends(get_db),
    user = Depends(get_verified_user)
):
    """
    Generate structured AI study notes grounded in the video's actual visual and audio content.
    Pipeline:
      1. Direct Gemini multimodal video understanding (official google.genai integration).
      2. Fallback to spoken transcript via youtube-transcript-api if direct analysis fails.
      3. Graceful fallback to manual paste modal with specific, actionable failure diagnostics.
    """
    clean_id = extract_youtube_id(video_id)
    if not clean_id or not is_valid_youtube_id(clean_id):
        raise HTTPException(status_code=400, detail="Invalid YouTube video ID format.")

    # Deduplication lock to prevent concurrent double-clicks
    lock_key = f"{user.id}:{clean_id}:notes"
    if not _check_and_acquire_lock(lock_key):
        raise HTTPException(
            status_code=409,
            detail="A notes generation request for this video is already in progress. Please wait a moment."
        )

    try:
        # Check for matching cached note created in last 30 minutes
        video_hash = generate_hash(f"video_{clean_id}")
        if not payload.force_refresh and not payload.custom_transcript:
            existing_note = (
                db.query(Notes)
                .join(UserNotes)
                .filter(
                    UserNotes.user_id == user.id,
                    Notes.source == "video",
                    Notes.hash_key == video_hash
                )
                .first()
            )
            if existing_note:
                log.info("returning_cached_video_note", note_id=existing_note.id, video_id=clean_id)
                return {
                    "message": "Loaded existing notes generated for this video",
                    "note": note_to_dict(existing_note),
                    "note_id": existing_note.id,
                    "cached": True,
                }

        # Get video metadata for title and channel
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
            # Step 1: Fast Path — Spoken Subtitles/Transcript (Hindi, English, Hinglish, etc.)
            # Fetches in 1-2s and completes generation in 15-25s instead of multi-minute video stream transcoding
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
                # Step 2: Direct Gemini Multimodal Video Understanding (when captions/subtitles are unavailable)
                try:
                    log.info("captions_unavailable_attempting_direct_gemini_video_notes", video_id=clean_id)
                    content = generate_notes_from_youtube_direct(clean_id, video_title)
                    log.info("direct_gemini_video_notes_success", video_id=clean_id, length=len(content))
                except Exception as exc:
                    direct_error = str(exc)
                    log.warning("direct_gemini_video_notes_failed", video_id=clean_id, error=direct_error)

                # Step 3: Graceful fallback to manual paste modal with detailed diagnostics
                if not content:
                    detail_msg = _build_video_failure_detail(direct_error, transcript_status.get("message"))
                    raise HTTPException(status_code=422, detail=detail_msg)

        note_title = f"Notes: {video_title[:90]}"

        # Upsert note by video_hash to respect unique constraint
        existing_note = db.query(Notes).filter(Notes.hash_key == video_hash).first()
        if existing_note:
            existing_note.title = note_title
            existing_note.content = content
            existing_note.created_at = datetime.utcnow().isoformat()
            db.commit()
            db.refresh(existing_note)
            target_note = existing_note
        else:
            new_note = Notes(
                title=note_title,
                content=content,
                hash_key=video_hash,
                source="video",
                created_at=datetime.utcnow().isoformat(),
            )
            db.add(new_note)
            db.commit()
            db.refresh(new_note)
            target_note = new_note

        user_link = db.query(UserNotes).filter(UserNotes.user_id == user.id, UserNotes.note_id == target_note.id).first()
        if not user_link:
            db.add(UserNotes(user_id=user.id, note_id=target_note.id))
            db.commit()

        # Embed note chunks in background for document Q&A
        background_tasks.add_task(embed_and_store_note_chunks, target_note.id, content)

        log.info("video_notes_created", note_id=target_note.id, video_id=clean_id)
        return {
            "message": "Notes generated successfully from video content",
            "note": note_to_dict(target_note),
            "note_id": target_note.id
        }
    finally:
        _release_lock(lock_key)


@router.post("/videos/{video_id}/quiz")
def generate_quiz_from_video(
    video_id: str,
    payload: VideoQuizRequest,
    db: Session = Depends(get_db),
    user = Depends(get_verified_user)
):
    """
    Generate interactive quiz questions grounded in the video's actual content.
    Pipeline:
      1. Direct Gemini multimodal video quiz generation.
      2. Fallback to spoken transcript if direct analysis is unavailable.
      3. Graceful fallback to manual paste modal with specific, actionable failure diagnostics.
    """
    clean_id = extract_youtube_id(video_id)
    if not clean_id or not is_valid_youtube_id(clean_id):
        raise HTTPException(status_code=400, detail="Invalid YouTube video ID format.")

    # Deduplication lock to prevent concurrent double-clicks
    lock_key = f"{user.id}:{clean_id}:quiz"
    if not _check_and_acquire_lock(lock_key):
        raise HTTPException(
            status_code=409,
            detail="A quiz generation request for this video is already in progress. Please wait a moment."
        )

    try:
        details = youtube_service.get_video_details(clean_id)
        video_title = details.get("title") or f"YouTube Video {clean_id}"

        # Check for cached test matching difficulty and num_questions created in last 30 minutes
        if not payload.force_refresh and not payload.custom_transcript:
            recent_test = (
                db.query(Test)
                .filter(
                    Test.user_id == user.id,
                    Test.difficulty == payload.difficulty,
                    Test.topic == f"Quiz: {video_title[:80]}"
                )
                .order_by(Test.id.desc())
                .first()
            )
            if recent_test and len(recent_test.questions) == payload.num_questions:
                try:
                    created_dt = datetime.fromisoformat(recent_test.created_at)
                    if (datetime.utcnow() - created_dt).total_seconds() < 1800:
                        saved_questions = [
                            QuestionOut(id=q.id, question=q.question_text, options=q.options)
                            for q in recent_test.questions
                        ]
                        return {
                            "message": "Loaded existing quiz generated for this video",
                            "test_id": recent_test.id,
                            "topic": recent_test.topic,
                            "difficulty": recent_test.difficulty,
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
            # Step 1: Fast Path — Spoken Subtitles/Transcript (Hindi, English, Hinglish, etc.)
            # Generates questions in 5-8s instead of multi-minute video stream transcoding
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
                # Step 2: Direct Gemini Multimodal Video Understanding (when captions are unavailable)
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

                # Step 3: Graceful fallback to manual paste modal with detailed diagnostics
                if not questions_data:
                    detail_msg = _build_video_failure_detail(direct_error, transcript_status.get("message"))
                    raise HTTPException(status_code=422, detail=detail_msg)

        new_test = Test(
            user_id=user.id,
            topic=f"Quiz: {video_title[:80]}",
            difficulty=payload.difficulty,
            created_at=datetime.utcnow().isoformat()
        )
        db.add(new_test)
        db.commit()
        db.refresh(new_test)

        saved_questions = []
        for q in questions_data:
            question = Question(
                test_id=new_test.id,
                question_text=q["question"],
                options=q["options"],
                correct_answer=q["correct_answer"]
            )
            db.add(question)
            db.commit()
            db.refresh(question)

            saved_questions.append(
                QuestionOut(
                    id=question.id,
                    question=question.question_text,
                    options=question.options
                )
            )

        log.info("video_quiz_created", test_id=new_test.id, video_id=clean_id, questions=len(saved_questions))
        return {
            "message": "Interactive quiz generated from video content",
            "test_id": new_test.id,
            "topic": new_test.topic,
            "difficulty": new_test.difficulty,
            "questions": saved_questions
        }
    finally:
        _release_lock(lock_key)


@router.post("/steps/{step_id}/videos/refresh")
def refresh_step_videos(
    step_id: int,
    db: Session = Depends(get_db),
    user = Depends(get_verified_user)
):
    """
    Fetch or refresh video recommendations for an existing roadmap step.
    Enables older roadmaps or search fallbacks to be upgraded with verified videos.
    """
    step = (
        db.query(Step)
        .join(Goal)
        .filter(Step.id == step_id, Goal.user_id == user.id)
        .first()
    )
    if not step:
        raise HTTPException(status_code=404, detail="Step not found or access denied")

    goal_title = step.goal.title if step.goal else ""
    query = build_search_query(goal_title, step.description)

    videos = youtube_service.search_videos(query=query, max_results=1)
    step.videos = videos
    db.commit()
    db.refresh(step)

    return {"step_id": step.id, "videos": step.videos or []}


@router.post("/goals/{goal_id}/videos/refresh")
def refresh_goal_videos(
    goal_id: int,
    db: Session = Depends(get_db),
    user = Depends(get_verified_user)
):
    """
    Refresh all video recommendations for an entire goal workspace.
    Queries YouTube for each task and updates the step records.
    """
    goal = db.query(Goal).filter(Goal.id == goal_id, Goal.user_id == user.id).first()
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found or access denied")

    refreshed_steps = []
    for step in goal.steps:
        query = build_search_query(goal.title, step.description)
        videos = youtube_service.search_videos(query=query, max_results=1)
        step.videos = videos
        refreshed_steps.append({"step_id": step.id, "videos": videos})

    db.commit()
    db.refresh(goal)

    return {
        "message": f"Successfully refreshed resources for {len(refreshed_steps)} tasks",
        "goal_id": goal.id,
        "refreshed": refreshed_steps,
    }


@router.post("/steps/{step_id}/resources/refresh")
def refresh_step_resources(
    step_id: int,
    db: Session = Depends(get_db),
    user = Depends(get_verified_user)
):
    """
    Re-resolve the optimal learning resource (documentation, interactive lab, repo, or video)
    for a specific roadmap task.
    """
    step = (
        db.query(Step)
        .join(Goal)
        .filter(Step.id == step_id, Goal.user_id == user.id)
        .first()
    )
    if not step:
        raise HTTPException(status_code=404, detail="Step not found or access denied")

    goal_title = step.goal.title if step.goal else ""
    resources = resolve_best_resources(goal_title, step.description)
    step.videos = resources
    db.commit()
    db.refresh(step)

    return {"step_id": step.id, "videos": step.videos or []}


@router.post("/goals/{goal_id}/resources/refresh")
def refresh_goal_resources(
    goal_id: int,
    db: Session = Depends(get_db),
    user = Depends(get_verified_user)
):
    """
    Re-resolve the optimal learning resources for all tasks in a goal workspace.
    """
    goal = db.query(Goal).filter(Goal.id == goal_id, Goal.user_id == user.id).first()
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found or access denied")

    refreshed_steps = []
    for step in goal.steps:
        resources = resolve_best_resources(goal.title, step.description)
        step.videos = resources
        refreshed_steps.append({"step_id": step.id, "videos": resources})

    db.commit()
    db.refresh(goal)

    return {
        "message": f"Successfully resolved optimal resources for {len(refreshed_steps)} tasks",
        "goal_id": goal.id,
        "refreshed": refreshed_steps,
    }
