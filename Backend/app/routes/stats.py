"""
Learning stats from real activity (the old version reported done-task counts as a "streak").

A day counts as active if the user, on that UTC day, used the tutor, created a test,
created a goal, or had a tutor / voice-lesson session.
"""
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends

from app.database import (
    get_db,
    goals_col,
    test_results_col,
    tests_col,
    tutor_lessons_col,
    tutor_sessions_col,
    tutor_usage_col,
)
from app.utils.dependencies import get_verified_user

router = APIRouter()


def _day(value):
    """Date (UTC) of a stored timestamp: datetime or ISO string. None if unknown."""
    if isinstance(value, datetime):
        return (value if value.tzinfo is None else value.astimezone(timezone.utc)).date()
    if isinstance(value, str) and len(value) >= 10:
        try:
            return datetime.fromisoformat(value[:10]).date()
        except ValueError:
            return None
    return None


def active_days(user_id: str) -> set:
    days = set()
    for doc in tutor_usage_col.find({"user_id": user_id}, {"date": 1}):
        days.add(_day(doc.get("date")))
    for col, field in ((tests_col, "created_at"), (goals_col, "created_at"),
                       (tutor_sessions_col, "updated_at"), (tutor_lessons_col, "updated_at")):
        for doc in col.find({"user_id": user_id}, {field: 1}):
            days.add(_day(doc.get(field)))
    days.discard(None)
    return days


def current_streak(days: set, today) -> int:
    """Consecutive active days ending today (or yesterday, so the streak survives until tonight)."""
    start = today if today in days else today - timedelta(days=1)
    streak = 0
    while start in days:
        streak += 1
        start -= timedelta(days=1)
    return streak


@router.get("/stats")
def get_stats(db = Depends(get_db), user=Depends(get_verified_user)):
    user_id_str = str(user.id)
    today = datetime.now(timezone.utc).date()
    days = active_days(user_id_str)

    scores = [r.get("last_score") for r in test_results_col.find({"user_id": user_id_str}, {"last_score": 1})
              if isinstance(r.get("last_score"), (int, float))]

    return {
        "streak": current_streak(days, today),
        "active_days_week": len({d for d in days if today - timedelta(days=6) <= d <= today}),
        "avg_score": round(sum(scores) / len(scores)) if scores else 0,
        "tests_taken": len(scores),
    }
