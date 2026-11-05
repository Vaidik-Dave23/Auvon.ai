from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Request
from datetime import datetime
from typing import Union, List

from app.database import (
    get_db,
    tests_col,
    questions_col,
    test_results_col,
    user_answers_col,
    id_filter,
    to_object_id,
    serialize_doc,
)
from app.schemas.test import (
    TestGenerateResponse,
    TestSubmitRequest,
    TestSubmitResponse,
    QuestionOut,
)
from app.services.ai import generate_questions, generate_weak_topic_review
from app.utils.dependencies import get_verified_user
from app.core.logging_config import get_logger
from app.core.limiter import limiter

log = get_logger(__name__)

router = APIRouter(prefix="/tests", tags=["tests"])


# 🔥 GENERATE TEST
@router.post("/generate", response_model=TestGenerateResponse)
@limiter.limit("5/minute")
def generate_test(
    request: Request,
    topic: str = Form(None),
    difficulty: str = Form("easy"),
    num_questions: int = Form(5),
    file: UploadFile = File(None),
    db = Depends(get_db),
    user = Depends(get_verified_user)
):
    content = ""
    test_topic = topic

    if file:
        content_bytes = file.file.read()   # sync endpoint: runs in the threadpool
        if file.filename.lower().endswith(".pdf"):
            import fitz
            pdf = fitz.open(stream=content_bytes, filetype="pdf")
            text = ""
            for page in pdf:
                text += page.get_text()
            content = text[:4000]
        else:
            content = content_bytes.decode("utf-8", errors="ignore")

        if not test_topic:
            test_topic = file.filename
    else:
        content = topic
        if not test_topic:
            test_topic = "Generated Test"

    if not content or content.strip() == "":
        raise HTTPException(status_code=400, detail="Topic or file required")

    questions_data = generate_questions(content, num_questions, difficulty)
    user_id_str = str(user.id)

    new_test_doc = {
        "user_id": user_id_str,
        "topic": test_topic,
        "difficulty": difficulty,
        "created_at": datetime.utcnow().isoformat(),
        "questions": []
    }
    inserted_test = tests_col.insert_one(new_test_doc)
    test_id_str = str(inserted_test.inserted_id)
    tests_col.update_one({"_id": inserted_test.inserted_id}, {"$set": {"id": test_id_str}})

    saved_questions = []
    embedded_questions = []

    for q in questions_data:
        q_doc = {
            "test_id": test_id_str,
            "question_text": q["question"],
            "options": q["options"],
            "correct_answer": q["correct_answer"],
        }
        inserted_q = questions_col.insert_one(q_doc)
        q_id_str = str(inserted_q.inserted_id)
        questions_col.update_one({"_id": inserted_q.inserted_id}, {"$set": {"id": q_id_str}})
        q_doc["id"] = q_id_str
        embedded_questions.append(q_doc)

        saved_questions.append(
            QuestionOut(
                id=q_id_str,
                question=q["question"],
                options=q["options"]
            )
        )

    tests_col.update_one({"_id": inserted_test.inserted_id}, {"$set": {"questions": embedded_questions}})

    return TestGenerateResponse(
        test_id=test_id_str,
        questions=saved_questions
    )


# 📚 HISTORY
@router.get("")
def get_tests(db = Depends(get_db), user = Depends(get_verified_user)):
    user_id_str = str(user.id)
    tests = list(tests_col.find({"user_id": user_id_str}).sort("_id", -1))

    response = []
    for t in tests:
        test_id_str = str(t.get("_id") or t.get("id"))
        r = test_results_col.find_one({"test_id": test_id_str, "user_id": user_id_str})
        questions = t.get("questions") or list(questions_col.find({"test_id": test_id_str}))

        response.append({
            "test_id": test_id_str,
            "topic": t.get("topic", ""),
            "difficulty": t.get("difficulty", "easy"),
            "score": r.get("last_score") if r else None,
            "best_score": r.get("best_score") if r else None,
            "created_at": t.get("created_at"),
            "num_questions": len(questions)
        })

    return response


# 📊 SUBMIT TEST
@router.post("/submit", response_model=TestSubmitResponse)
def submit_test(data: TestSubmitRequest, db = Depends(get_db), user = Depends(get_verified_user)):
    user_id_str = str(user.id)
    test_id_str = str(data.test_id)

    flt = {"$and": [id_filter(test_id_str), {"user_id": user_id_str}]}
    test = tests_col.find_one(flt)
    if not test:
        raise HTTPException(status_code=404, detail="Test not found")

    questions = test.get("questions") or list(questions_col.find({"test_id": test_id_str}))
    if not questions:
        questions = list(questions_col.find(id_filter(test_id_str)))

    correct = 0
    weak_topics = []
    review = []

    user_answers_col.delete_many({
        "user_id": user_id_str,
        "test_id": test_id_str
    })

    for q in questions:
        q_id_str = str(q.get("_id") or q.get("id"))
        user_ans = data.answers.get(q_id_str) or data.answers.get(str(q.get("id", "")))
        correct_ans = q.get("correct_answer", "")
        q_text = q.get("question_text", "")

        is_correct = False
        if user_ans and correct_ans:
            is_correct = (user_ans == correct_ans) or user_ans.startswith(correct_ans)

        if is_correct:
            correct += 1
        else:
            weak_topics.append(q_text)

        ua = {
            "user_id": user_id_str,
            "test_id": test_id_str,
            "question_id": q_id_str,
            "question_text": q_text,
            "selected_answer": user_ans,
            "correct_answer": correct_ans,
            "is_correct": is_correct
        }
        user_answers_col.insert_one(ua)

        review.append({
            "question": q_text,
            "your_answer": user_ans,
            "correct_answer": correct_ans,
            "is_correct": is_correct
        })

    total = len(questions)
    score = int((correct / total) * 100) if total > 0 else 0

    try:
        ai_feedback = generate_weak_topic_review(weak_topics, score, total)
    except Exception as e:
        log.warning("ai_feedback_generation_failed", test_id=test_id_str, error=str(e))
        ai_feedback = "Complete a test attempt to receive AI feedback."

    existing_result = test_results_col.find_one({
        "user_id": user_id_str,
        "test_id": test_id_str
    })

    unique_weak = list(set(weak_topics))
    if existing_result:
        best_score = max(existing_result.get("best_score", 0), score)
        test_results_col.update_one(
            {"_id": existing_result["_id"]},
            {"$set": {
                "last_score": score,
                "best_score": best_score,
                "last_feedback": ai_feedback,
                "weak_topics": unique_weak,
            }}
        )
    else:
        test_results_col.insert_one({
            "user_id": user_id_str,
            "test_id": test_id_str,
            "best_score": score,
            "last_score": score,
            "last_feedback": ai_feedback,
            "weak_topics": unique_weak,
        })

    return {
        "score": score,
        "correct": correct,
        "total": total,
        "weak_topics": list(set(weak_topics)),
        "review": review,
        "ai_feedback": ai_feedback
    }


# 📘 RESULT
@router.get("/result/{test_id}")
def get_result(test_id: Union[int, str], db = Depends(get_db), user = Depends(get_verified_user)):
    user_id_str = str(user.id)
    test_id_str = str(test_id)

    answers = list(user_answers_col.find({
        "user_id": user_id_str,
        "test_id": test_id_str
    }))

    if not answers:
        return None

    total = len(answers)
    correct = sum(1 for a in answers if a.get("is_correct"))
    score = int((correct / total) * 100) if total else 0

    seen = set()
    weak_topics = []
    for a in answers:
        q_txt = a.get("question_text", "")
        if not a.get("is_correct") and q_txt not in seen:
            seen.add(q_txt)
            weak_topics.append(q_txt)

    review = [
        {
            "question": a.get("question_text", ""),
            "your_answer": a.get("selected_answer"),
            "correct_answer": a.get("correct_answer", ""),
            "is_correct": bool(a.get("is_correct")),
        }
        for a in answers
    ]

    result_record = test_results_col.find_one({
        "user_id": user_id_str,
        "test_id": test_id_str
    })

    ai_feedback = (
        result_record.get("last_feedback")
        if result_record and result_record.get("last_feedback")
        else "Complete a test attempt to receive AI feedback."
    )

    return {
        "score": score,
        "correct": correct,
        "total": total,
        "weak_topics": weak_topics,
        "review": review,
        "ai_feedback": ai_feedback
    }


# 🗑️ DELETE TEST
@router.delete("/{test_id}")
def delete_test(test_id: Union[int, str], db = Depends(get_db), user = Depends(get_verified_user)):
    user_id_str = str(user.id)
    test_id_str = str(test_id)

    flt = {"$and": [id_filter(test_id_str), {"user_id": user_id_str}]}
    test = tests_col.find_one(flt)
    if not test:
        raise HTTPException(status_code=404, detail="Test not found")

    user_answers_col.delete_many({"test_id": test_id_str})
    test_results_col.delete_many({"test_id": test_id_str})
    questions_col.delete_many({"test_id": test_id_str})
    tests_col.delete_one({"_id": test["_id"]})

    return {"message": "Test deleted successfully"}


# 🧪 GET TEST
@router.get("/{test_id}")
def get_test(test_id: Union[int, str], db = Depends(get_db), user = Depends(get_verified_user)):
    user_id_str = str(user.id)
    test_id_str = str(test_id)

    flt = {"$and": [id_filter(test_id_str), {"user_id": user_id_str}]}
    test = tests_col.find_one(flt)
    if not test:
        raise HTTPException(status_code=404, detail="Test not found")

    questions = test.get("questions") or list(questions_col.find({"test_id": test_id_str}))
    if not questions:
        raise HTTPException(status_code=404, detail="Test questions not found")

    return [
        {
            "id": str(q.get("_id") or q.get("id")),
            "question": q.get("question_text", ""),
            "options": q.get("options") or []
        }
        for q in questions
    ]
