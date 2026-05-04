from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.goal import Goal
from app.models.task import Task
from app.utils.dependencies import get_current_user

router = APIRouter()


@router.get("/progress/goals")
def get_goal_progress(db: Session = Depends(get_db), user=Depends(get_current_user)):
    
    goals = db.query(Goal).filter(Goal.user_id == user.id).all()

    result = []

    for goal in goals:
        total_steps = len(goal.steps)
        completed_steps = len([s for s in goal.steps if s.is_completed == 1])

        percent = int((completed_steps / total_steps) * 100) if total_steps > 0 else 0

        result.append({
            "id": goal.id,
            "title": goal.title,
            "progress": percent
        })

    return result

@router.get("/progress/daily")
def daily_progress(db: Session = Depends(get_db), user=Depends(get_current_user)):

    tasks = db.query(Task).filter(Task.user_id == user.id).all()

    total = len(tasks)
    done = len([t for t in tasks if t.done])

    percent = int((done / total) * 100) if total > 0 else 0

    return {
        "total": total,
        "done": done,
        "percent": percent
    }