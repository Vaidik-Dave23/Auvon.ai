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
from app.utils.dependencies import get_current_user
from app.models.user_answer import UserAnswer

router = APIRouter(prefix="/tests", tags=["tests"])


# 🔥 GENERATE TEST — specific POST, must be before /{test_id}
@router.post("/generate", response_model=TestGenerateResponse)
async def generate_test(
    topic: str = Form(None),
    difficulty: str = Form("easy"),
    num_questions: int = Form(5),
    file: UploadFile = File(None),
    db: Session = Depends(get_db),
    user=Depends(get_current_user)
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
def get_tests(db: Session = Depends(get_db), user=Depends(get_current_user)):
    results = db.query(Test_Result).filter(Test_Result.user_id == user.id).all()

    return [
        {
            "test_id": r.test_id,
            "topic": r.test.topic,
            "score": r.last_score,
            "best_score": r.best_score
        }
        for r in results
    ]


# 📊 SUBMIT TEST — specific POST, must be before /{test_id}
@router.post("/submit", response_model=TestSubmitResponse)
def submit_test(data: TestSubmitRequest, db: Session = Depends(get_db), user=Depends(get_current_user)):

    questions = db.query(Question).filter(Question.test_id == data.test_id).all()

    correct = 0
    weak_topics = []
    review = []

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

    ai_feedback = generate_weak_topic_review(weak_topics)

    existing = db.query(Test_Result).filter(
        Test_Result.user_id == user.id,
        Test_Result.test_id == data.test_id
    ).first()

    if existing:
        existing.last_score = score
        existing.best_score = max(existing.best_score, score)
    else:
        result = Test_Result(
            user_id=user.id,
            test_id=data.test_id,
            best_score=score,
            last_score=score
        )
        db.add(result)

    db.commit()

    return {
        "score": score,
        "correct": correct,
        "total": total,
        "weak_topics": weak_topics,
        "review": review,
        "ai_feedback": ai_feedback
    }


# 📘 RESULT — specific GET, must be before /{test_id}
@router.get("/result/{test_id}")
def get_result(test_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):

    answers = db.query(UserAnswer).filter(
        UserAnswer.user_id == user.id,
        UserAnswer.test_id == test_id
    ).all()

    if not answers:
        return None

    total = len(answers)
    correct = sum(1 for a in answers if a.is_correct)
    score = int((correct / total) * 100) if total else 0

    weak_topics = [a.question_text for a in answers if not a.is_correct]

    review = [
        {
            "question": a.question_text,
            "your_answer": a.selected_answer,
            "correct_answer": a.correct_answer,
            "is_correct": a.is_correct
        }
        for a in answers
    ]

    ai_feedback = generate_weak_topic_review(weak_topics)

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
def delete_test(test_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    test = db.query(Test).filter(Test.id == test_id, Test.user_id == user.id).first()
    
    if not test:
        raise HTTPException(status_code=404, detail="Test not found")

    # Manually delete associated UserAnswers and Test_Result to avoid constraint errors
    db.query(UserAnswer).filter(UserAnswer.test_id == test_id).delete()
    db.query(Test_Result).filter(Test_Result.test_id == test_id).delete()

    db.delete(test)
    db.commit()

    return {"message": "Test deleted successfully"}


# 🧪 GET TEST — wildcard last, so it doesn't swallow routes above
@router.get("/{test_id}")
def get_test(test_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
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