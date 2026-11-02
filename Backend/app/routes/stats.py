from fastapi import APIRouter, Depends
from app.database import get_db, tasks_col
from app.utils.dependencies import get_verified_user

router = APIRouter()


@router.get("/stats")
def get_stats(db = Depends(get_db), user=Depends(get_verified_user)):
    user_id_str = str(user.id)
    tasks = list(tasks_col.find({"user_id": user_id_str}))

    total = len(tasks)
    done = sum(1 for t in tasks if t.get("done"))

    avg_score = int((done / total) * 100) if total > 0 else 0

    return {
        "streak": done,
        "avg_score": avg_score,
        "hours_week": total,
    }
