from app.models.goal import Goal, Step
from app.services.ai import generate_plan
from app.services.resources import resolve_best_resources
from app.services.youtube import youtube_service, should_recommend_video, build_search_query
from fastapi import APIRouter, Depends, HTTPException, Request
from typing import Union
from app.database import get_db, goals_col, steps_col, id_filter, to_object_id, serialize_doc, ObjectId
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
    db = Depends(get_db),
    user = Depends(get_verified_user)
):
    user_id_str = str(user.id)
    new_goal = {
        "title": title,
        "user_id": user_id_str,
        "created_at": datetime.utcnow().isoformat(),
        "steps": []
    }
    inserted_goal = goals_col.insert_one(new_goal)
    goal_id_str = str(inserted_goal.inserted_id)
    goals_col.update_one({"_id": inserted_goal.inserted_id}, {"$set": {"id": goal_id_str}})

    plan = generate_plan(title, weeks)
    all_steps = []

    for week_data in plan:
        for step_item in week_data.get("steps", []):
            if isinstance(step_item, dict):
                step_text = step_item.get("text", "").strip()
            else:
                step_text = str(step_item).strip()

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

            step_doc = {
                "goal_id": goal_id_str,
                "description": step_text,
                "week": week_data["week"],
                "is_completed": 0,
                "videos": resources
            }
            inserted_step = steps_col.insert_one(step_doc)
            step_id_str = str(inserted_step.inserted_id)
            step_doc["id"] = step_id_str
            step_doc["_id"] = step_id_str
            steps_col.update_one({"_id": inserted_step.inserted_id}, {"$set": {"id": step_id_str}})
            all_steps.append(step_doc)

    goals_col.update_one({"_id": inserted_goal.inserted_id}, {"$set": {"steps": all_steps}})
    return {"message": "Goal created with AI plan"}


@router.get("/goals")
def get_goals(db = Depends(get_db), user = Depends(get_verified_user)):
    user_id_str = str(user.id)
    goals = list(goals_col.find({"user_id": user_id_str}).sort("_id", -1))

    result = []
    for goal in goals:
        goal_id_str = str(goal.get("_id") or goal.get("id"))
        steps = goal.get("steps") or list(steps_col.find({"goal_id": goal_id_str}))

        weeks = {}
        for step in steps:
            w = step.get("week", 1)
            if w not in weeks:
                weeks[w] = []

            step_id_val = str(step.get("_id") or step.get("id"))
            weeks[w].append({
                "id": step_id_val,
                "text": step.get("description", ""),
                "done": step.get("is_completed", 0),
                "videos": step.get("videos") or []
            })

        result.append({
            "id": goal_id_str,
            "title": goal.get("title", ""),
            "weeks": weeks,
            "created_at": goal.get("created_at")
        })

    return result


@router.get("/goals/{goal_id}")
def get_goal(goal_id: Union[int, str], db = Depends(get_db), user = Depends(get_verified_user)):
    user_id_str = str(user.id)
    flt = {"$and": [id_filter(goal_id), {"user_id": user_id_str}]}
    goal = goals_col.find_one(flt)
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")

    goal_id_str = str(goal.get("_id") or goal.get("id"))
    steps = goal.get("steps") or list(steps_col.find({"goal_id": goal_id_str}))

    needs_update = False
    for step in steps:
        videos = step.get("videos") or []
        has_any_verified = any(
            isinstance(v, dict) and v.get("verified")
            for v in videos
        )
        desc = step.get("description", "")
        if not has_any_verified:
            if should_recommend_video(desc) and youtube_service.is_configured():
                search_q = build_search_query(goal.get("title", ""), desc)
                fetched = youtube_service.search_videos(query=search_q, max_results=1)
                if fetched and fetched[0].get("verified"):
                    step["videos"] = fetched
                    needs_update = True
            else:
                resolved = resolve_best_resources(goal.get("title", ""), desc)
                if resolved and resolved[0].get("verified"):
                    step["videos"] = resolved
                    needs_update = True

    if needs_update:
        goals_col.update_one({"_id": goal["_id"]}, {"$set": {"steps": steps}})
        for s in steps:
            s_id = to_object_id(s.get("_id") or s.get("id"))
            if s_id:
                steps_col.update_one({"_id": s_id}, {"$set": {"videos": s.get("videos", [])}})

    weeks = {}
    for step in steps:
        w = step.get("week", 1)
        if w not in weeks:
            weeks[w] = []

        step_id_val = str(step.get("_id") or step.get("id"))
        weeks[w].append({
            "id": step_id_val,
            "text": step.get("description", ""),
            "done": step.get("is_completed", 0),
            "videos": step.get("videos") or []
        })

    return {
        "id": goal_id_str,
        "title": goal.get("title", ""),
        "weeks": weeks,
        "created_at": goal.get("created_at")
    }


@router.put("/steps/{step_id}")
def toggle_step(
    step_id: Union[int, str],
    db = Depends(get_db),
    user = Depends(get_verified_user)
):
    step = steps_col.find_one(id_filter(step_id))
    if not step:
        goal = goals_col.find_one({"steps.id": str(step_id)})
        if not goal:
            raise HTTPException(status_code=403, detail="Access denied or step not found")
        for s in goal.get("steps", []):
            if str(s.get("id")) == str(step_id):
                s["is_completed"] = 0 if s.get("is_completed") else 1
                goals_col.update_one({"_id": goal["_id"]}, {"$set": {"steps": goal["steps"]}})
                return serialize_doc(s)

    current_val = step.get("is_completed", 0)
    new_val = 0 if current_val else 1
    steps_col.update_one({"_id": step["_id"]}, {"$set": {"is_completed": new_val}})
    step["is_completed"] = new_val

    goals_col.update_many(
        {"steps._id": step["_id"]},
        {"$set": {"steps.$.is_completed": new_val}}
    )
    goals_col.update_many(
        {"steps.id": str(step_id)},
        {"$set": {"steps.$.is_completed": new_val}}
    )

    return serialize_doc(step)


@router.delete("/goals/{goal_id}")
def delete_goal(
    goal_id: Union[int, str],
    db = Depends(get_db),
    user = Depends(get_verified_user)
):
    user_id_str = str(user.id)
    flt = {"$and": [id_filter(goal_id), {"user_id": user_id_str}]}
    goal = goals_col.find_one(flt)

    if not goal:
        return {"error": "Goal not found"}

    goal_id_str = str(goal.get("_id") or goal.get("id"))
    goals_col.delete_one({"_id": goal["_id"]})
    steps_col.delete_many({"goal_id": goal_id_str})

    return {"message": "Goal deleted"}
