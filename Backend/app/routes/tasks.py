from fastapi import APIRouter, Depends, HTTPException
from typing import Union
from app.database import get_db, tasks_col, id_filter, serialize_doc, serialize_docs
from app.utils.dependencies import get_verified_user

router = APIRouter()


# ✅ GET TASKS
@router.get("/tasks")
def get_tasks(db = Depends(get_db), user=Depends(get_verified_user)):
    user_id_str = str(user.id)
    tasks = list(tasks_col.find({"user_id": user_id_str}))
    return serialize_docs(tasks)


# ✅ CREATE TASK
@router.post("/tasks")
def create_task(title: str, db = Depends(get_db), user=Depends(get_verified_user)):
    user_id_str = str(user.id)
    new_doc = {
        "title": title,
        "done": False,
        "user_id": user_id_str,
    }
    inserted = tasks_col.insert_one(new_doc)
    new_doc["_id"] = inserted.inserted_id
    return serialize_doc(new_doc)


# ✅ TOGGLE TASK
@router.put("/tasks/{task_id}")
def toggle_task(task_id: Union[int, str], db = Depends(get_db), user=Depends(get_verified_user)):
    user_id_str = str(user.id)
    flt = {"$and": [id_filter(task_id), {"user_id": user_id_str}]}
    task = tasks_col.find_one(flt)

    if task:
        new_done = not task.get("done", False)
        tasks_col.update_one({"_id": task["_id"]}, {"$set": {"done": new_done}})
        task["done"] = new_done

    return serialize_doc(task)


@router.delete("/tasks/{task_id}")
def delete_task(task_id: Union[int, str], db = Depends(get_db), user=Depends(get_verified_user)):
    user_id_str = str(user.id)
    flt = {"$and": [id_filter(task_id), {"user_id": user_id_str}]}
    tasks_col.delete_one(flt)
    return {"message": "deleted"}


@router.put("/tasks/{task_id}/edit")
def edit_task(task_id: Union[int, str], title: str, db = Depends(get_db), user=Depends(get_verified_user)):
    user_id_str = str(user.id)
    flt = {"$and": [id_filter(task_id), {"user_id": user_id_str}]}
    task = tasks_col.find_one(flt)

    if task:
        tasks_col.update_one({"_id": task["_id"]}, {"$set": {"title": title}})
        task["title"] = title

    return serialize_doc(task)
