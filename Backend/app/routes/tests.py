from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from datetime import datetime

from app.database import get_db
from app.models.test import Test, Question
from app.models.results import Test_Result
from app.schemas.test import (
    TestGenerateResponse,
    TestSubmitRequest,
    TestSubmitResponse,
    QuestionOut
)
from app.services.ai import generate_questions, generate_weak_topic_review
from app.utils.dependencies import get_verified_user
from app.models.user_answer import UserAnswer

router = APIRouter(prefix="/tests", tags=["tests"])


# 🔥 GENERATE TEST
@router.post("/generate", response_model=TestGenerateResponse)
async def generate_test(
    topic: str = Form(None),
    difficulty: str = Form("easy"),
    num_questions: int = Form(5),
    file: UploadFile = File(None),
    db: Session = Depends(get_db),
    user=Depends(get_verified_user)
):
    content = ""
    test_topic = topic

    if file:
        content_bytes = await file.read()
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

    new_test = Test(
        user_id=user.id,
        topic=test_topic,
        created_at=str(datetime.now())
    )
    db.add(new_test)
    db.commit()
    db.refresh(new_test)

    saved_questions = []

    for q in questions_data:
        question = Question(
            test_id=new_test.id,
            question_text=q["question"],
            options=q["options"],
            correct_answer=q["correct_answer"]
        )
        db.add(question)
        db.commit()
        db.refresh(question)

        saved_questions.append(
            QuestionOut(
                id=question.id,
                question=question.question_text,
                options=question.options
            )
        )

    return TestGenerateResponse(
        test_id=new_test.id,
        questions=saved_questions
    )


# 📚 HISTORY
@router.get("/")
def get_tests(db: Session = Depends(get_db), user=Depends(get_verified_user)):
    results = db.query(Test_Result).filter(Test_Result.user_id == user.id).join(Test).order_by(Test.created_at.desc()).all()

    return [
        {
            "test_id": r.test_id,
            "topic": r.test.topic,
            "score": r.last_score,
            "best_score": r.best_score,
            "created_at": r.test.created_at
        }
        for r in results
    ]


# 📊 SUBMIT TEST
@router.post("/submit", response_model=TestSubmitResponse)
def submit_test(data: TestSubmitRequest, db: Session = Depends(get_db), user=Depends(get_verified_user)):

    questions = db.query(Question).filter(Question.test_id == data.test_id).all()

    correct = 0
    weak_topics = []
    review = []

    # Delete previous answers for this test attempt (so we only keep latest)
    db.query(UserAnswer).filter(
        UserAnswer.user_id == user.id,
        UserAnswer.test_id == data.test_id
    ).delete()
    db.commit()

    for q in questions:
        user_ans = data.answers.get(str(q.id))
        is_correct = False
        if user_ans and q.correct_answer:
            is_correct = (user_ans == q.correct_answer) or user_ans.startswith(q.correct_answer)

        if is_correct:
            correct += 1
        else:
            weak_topics.append(q.question_text)

        ua = UserAnswer(
            user_id=user.id,
            test_id=data.test_id,
            question_id=q.id,
            question_text=q.question_text,
            selected_answer=user_ans,
            correct_answer=q.correct_answer,
            is_correct=is_correct
        )
        db.add(ua)

        review.append({
            "question": q.question_text,
            "your_answer": user_ans,
            "correct_answer": q.correct_answer,
            "is_correct": is_correct
        })

    total = len(questions)
    score = int((correct / total) * 100) if total > 0 else 0

    # Generate fresh feedback and store it
    ai_feedback = generate_weak_topic_review(weak_topics, score, total)

    existing = db.query(Test_Result).filter(
        Test_Result.user_id == user.id,
        Test_Result.test_id == data.test_id
    ).first()

    if existing:
        existing.last_score = score
        existing.best_score = max(existing.best_score, score)
        existing.last_feedback = ai_feedback
    else:
        result = Test_Result(
            user_id=user.id,
            test_id=data.test_id,
            best_score=score,
            last_score=score,
            last_feedback=ai_feedback
        )
        db.add(result)

    db.commit()

    return {
        "score": score,
        "correct": correct,
        "total": total,
        "weak_topics": list(set(weak_topics)),  # deduplicate
        "review": review,
        "ai_feedback": ai_feedback
    }


# 📘 RESULT — uses stored feedback, no extra AI call
@router.get("/result/{test_id}")
def get_result(test_id: int, db: Session = Depends(get_db), user=Depends(get_verified_user)):

    # Get the latest answers only (already deduplicated on submit)
    answers = db.query(UserAnswer).filter(
        UserAnswer.user_id == user.id,
        UserAnswer.test_id == test_id
    ).all()

    if not answers:
        return None

    total = len(answers)
    correct = sum(1 for a in answers if a.is_correct)
    score = int((correct / total) * 100) if total else 0

    # Deduplicate weak topics
    seen = set()
    weak_topics = []
    for a in answers:
        if not a.is_correct and a.question_text not in seen:
            seen.add(a.question_text)
            weak_topics.append(a.question_text)

    review = [
        {
            "question": a.question_text,
            "your_answer": a.selected_answer,
            "correct_answer": a.correct_answer,
            "is_correct": a.is_correct
        }
        for a in answers
    ]

    # Use stored feedback — NO new AI call
    result_record = db.query(Test_Result).filter(
        Test_Result.user_id == user.id,
        Test_Result.test_id == test_id
    ).first()

    ai_feedback = (
        result_record.last_feedback
        if result_record and result_record.last_feedback
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
def delete_test(test_id: int, db: Session = Depends(get_db), user=Depends(get_verified_user)):
    test = db.query(Test).filter(Test.id == test_id, Test.user_id == user.id).first()

    if not test:
        raise HTTPException(status_code=404, detail="Test not found")

    db.query(UserAnswer).filter(UserAnswer.test_id == test_id).delete()
    db.query(Test_Result).filter(Test_Result.test_id == test_id).delete()

    db.delete(test)
    db.commit()

    return {"message": "Test deleted successfully"}


# 🧪 GET TEST
@router.get("/{test_id}")
def get_test(test_id: int, db: Session = Depends(get_db), user=Depends(get_verified_user)):
    questions = db.query(Question).filter(Question.test_id == test_id).all()

    if not questions:
        raise HTTPException(status_code=404, detail="Test not found")

    return [
        {
            "id": q.id,
            "question": q.question_text,
            "options": q.options
        }
        for q in questions
    ]