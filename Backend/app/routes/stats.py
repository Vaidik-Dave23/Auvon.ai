from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.task import Task
from app.utils.dependencies import get_verified_user

router = APIRouter()

@router.get("/stats")
def get_stats(db: Session = Depends(get_db), user=Depends(get_verified_user)):

    tasks = db.query(Task).filter(Task.user_id == user.id).all()

    total = len(tasks)
    done = len([t for t in tasks if t.done])

    avg_score = int((done / total) * 100) if total > 0 else 0

    return {
        "streak": done,  # simple version (we upgrade later)
        "avg_score": avg_score,
        "hours_week": total  # placeholder logic
    }