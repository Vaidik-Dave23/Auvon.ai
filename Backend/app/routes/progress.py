from fastapi import APIRouter, Depends
from app.database import get_db, goals_col, steps_col, tasks_col, serialize_doc
from app.utils.dependencies import get_verified_user

router = APIRouter()


@router.get("/progress/goals")
def get_goal_progress(db = Depends(get_db), user=Depends(get_verified_user)):
    user_id_str = str(user.id)
    goals = list(goals_col.find({"user_id": user_id_str}).sort("_id", -1))

    result = []
    for goal in goals:
        goal_id_str = str(goal.get("_id") or goal.get("id"))
        # Check both embedded steps and steps_col
        steps = goal.get("steps") or list(steps_col.find({"goal_id": goal_id_str}))
        total_steps = len(steps)
        completed_steps = sum(1 for s in steps if s.get("is_completed") == 1 or s.get("done") == 1 or s.get("is_completed") is True)

        percent = int((completed_steps / total_steps) * 100) if total_steps > 0 else 0

        result.append({
            "id": goal_id_str,
            "title": goal.get("title", ""),
            "progress": percent,
        })

    return result


@router.get("/progress/daily")
def daily_progress(db = Depends(get_db), user=Depends(get_verified_user)):
    user_id_str = str(user.id)
    tasks = list(tasks_col.find({"user_id": user_id_str}))

    total = len(tasks)
    done = sum(1 for t in tasks if t.get("done"))

    percent = int((done / total) * 100) if total > 0 else 0

    return {
        "total": total,
        "done": done,
        "percent": percent,
    }
