from app.models.goal import Goal, Step
from app.services.ai import generate_plan
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app.utils.dependencies import get_verified_user
from datetime import datetime

router = APIRouter()

@router.post("/goals/ai")
def create_goal_ai(
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
        for step in week_data["steps"]:
            new_step = Step(
                goal_id=goal.id,
                description=step,
                week=week_data["week"],
                is_completed=0
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
                "done": step.is_completed
            })

        result.append({
            "id": goal.id,
            "title": goal.title,
            "weeks": weeks,
            "created_at": goal.created_at
        })

    return result

@router.put("/steps/{step_id}")
def toggle_step(step_id: int, db: Session = Depends(get_db)):
    step = db.query(Step).filter(Step.id == step_id).first()

    if step:
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