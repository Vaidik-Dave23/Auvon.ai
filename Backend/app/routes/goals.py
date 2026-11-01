from app.models.goal import Goal, Step
from app.services.ai import generate_plan
from app.services.resources import resolve_best_resources
from app.services.youtube import youtube_service, should_recommend_video, build_search_query
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from app.database import get_db
from app.utils.dependencies import get_verified_user
from datetime import datetime
from app.core.limiter import limiter
from app.core.logging_config import get_logger

log = get_logger(__name__)

router = APIRouter()

@router.post("/goals/ai")
@limiter.limit("5/minute")
def create_goal_ai(
    request: Request,
    title: str,
    weeks: int,
    db: Session = Depends(get_db),
    user = Depends(get_verified_user)
):
    goal = Goal(title=title, user_id=user.id, created_at=datetime.utcnow().isoformat())
    db.add(goal)
    db.commit()
    db.refresh(goal)

    plan = generate_plan(title, weeks)

    for week_data in plan:
        for step_item in week_data["steps"]:
            if isinstance(step_item, dict):
                step_text = step_item.get("text", "").strip()
            else:
                step_text = str(step_item).strip()

            # Retrieve the optimal learning resources: docs, labs, repos, or video tutorials
            resources = []
            try:
                resources = resolve_best_resources(
                    goal_title=title,
                    task_text=step_text,
                    ai_resource=step_item if isinstance(step_item, dict) else None,
                )
            except Exception as e:
                log.warning("resolve_best_resources_failed", error=str(e))
                resources = []

            new_step = Step(
                goal_id=goal.id,
                description=step_text,
                week=week_data["week"],
                is_completed=0,
                videos=resources
            )
            db.add(new_step)

    db.commit()

    return {"message": "Goal created with AI plan"}

@router.get("/goals")
def get_goals(db: Session = Depends(get_db), user=Depends(get_verified_user)):
    goals = db.query(Goal).filter(Goal.user_id == user.id).order_by(Goal.id.desc()).all()

    result = []

    for goal in goals:
        weeks = {}

        for step in goal.steps:
            if step.week not in weeks:
                weeks[step.week] = []

            weeks[step.week].append({
                "id": step.id,
                "text": step.description,
                "done": step.is_completed,
                "videos": step.videos or []
            })

        result.append({
            "id": goal.id,
            "title": goal.title,
            "weeks": weeks,
            "created_at": goal.created_at
        })

    return result

@router.get("/goals/{goal_id}")
def get_goal(goal_id: int, db: Session = Depends(get_db), user=Depends(get_verified_user)):
    goal = db.query(Goal).filter(Goal.id == goal_id, Goal.user_id == user.id).first()
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")

    # Automatically upgrade unverified search fallbacks to best resources or real videos
    needs_commit = False
    for step in goal.steps:
        has_any_verified = any(
            isinstance(v, dict) and v.get("verified")
            for v in (step.videos or [])
        )
        if not has_any_verified:
            # First check if this task explicitly asks for video or if an authoritative doc/lab matches
            if should_recommend_video(step.description) and youtube_service.is_configured():
                search_q = build_search_query(goal.title, step.description)
                fetched = youtube_service.search_videos(query=search_q, max_results=1)
                if fetched and fetched[0].get("verified"):
                    step.videos = fetched
                    needs_commit = True
            else:
                resolved = resolve_best_resources(goal.title, step.description)
                if resolved and resolved[0].get("verified"):
                    step.videos = resolved
                    needs_commit = True
        elif should_recommend_video(step.description) and youtube_service.is_configured():
            has_verified_video = any(
                isinstance(v, dict) and v.get("verified") and v.get("type") == "video"
                for v in (step.videos or [])
            )
            if not has_verified_video:
                search_q = build_search_query(goal.title, step.description)
                fetched = youtube_service.search_videos(query=search_q, max_results=1)
                if fetched and fetched[0].get("verified"):
                    step.videos = fetched
                    needs_commit = True

    if needs_commit:
        db.commit()
        db.refresh(goal)

    weeks = {}
    for step in goal.steps:
        if step.week not in weeks:
            weeks[step.week] = []

        weeks[step.week].append({
            "id": step.id,
            "text": step.description,
            "done": step.is_completed,
            "videos": step.videos or []
        })

    return {
        "id": goal.id,
        "title": goal.title,
        "weeks": weeks,
        "created_at": goal.created_at
    }

@router.put("/steps/{step_id}")
def toggle_step(
    step_id: int,
    db: Session = Depends(get_db),
    user=Depends(get_verified_user)
):
    step = db.query(Step).join(Goal).filter(Step.id == step_id, Goal.user_id == user.id).first()

    if not step:
        raise HTTPException(status_code=403, detail="Access denied or step not found")

    step.is_completed = 0 if step.is_completed else 1
    db.commit()

    return step

@router.delete("/goals/{goal_id}")
def delete_goal(
    goal_id: int,
    db: Session = Depends(get_db),
    user=Depends(get_verified_user)
):
    goal = db.query(Goal).filter(
        Goal.id == goal_id,
        Goal.user_id == user.id
    ).first()

    if not goal:
        return {"error": "Goal not found"}

    db.delete(goal)
    db.commit()

    return {"message": "Goal deleted"}