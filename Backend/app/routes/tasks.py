from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.task import Task
from app.utils.dependencies import get_current_user

router = APIRouter()

# ✅ GET TASKS
@router.get("/tasks")
def get_tasks(db: Session = Depends(get_db), user=Depends(get_current_user)):
    tasks = db.query(Task).filter(Task.user_id == user.id).all()
    return tasks


# ✅ CREATE TASK
@router.post("/tasks")
def create_task(title: str, db: Session = Depends(get_db), user=Depends(get_current_user)):
    new_task = Task(title=title, user_id=user.id)
    db.add(new_task)
    db.commit()
    db.refresh(new_task)
    return new_task


# ✅ TOGGLE TASK
@router.put("/tasks/{task_id}")
def toggle_task(task_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    task = db.query(Task).filter(Task.id == task_id, Task.user_id == user.id).first()

    if task:
        task.done = not task.done
        db.commit()

    return task

@router.delete("/tasks/{task_id}")
def delete_task(task_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    task = db.query(Task).filter(Task.id == task_id, Task.user_id == user.id).first()

    if task:
        db.delete(task)
        db.commit()

    return {"message": "deleted"}

@router.put("/tasks/{task_id}/edit")
def edit_task(task_id: int, title: str, db: Session = Depends(get_db), user=Depends(get_current_user)):
    task = db.query(Task).filter(Task.id == task_id, Task.user_id == user.id).first()

    if task:
        task.title = title
        db.commit()

    return task