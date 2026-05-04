from pydantic import BaseModel
from typing import List, Dict, Optional


class QuestionOut(BaseModel):
    id: int
    question: str
    options: List[str]


class TestGenerateResponse(BaseModel):
    test_id: int
    questions: List[QuestionOut]


class TestSubmitRequest(BaseModel):
    test_id: int
    answers: Dict[str, str]

class ReviewItem(BaseModel):
    question: str
    your_answer: Optional[str]
    correct_answer: str
    is_correct: bool


class TestSubmitResponse(BaseModel):
    score: int
    correct: int
    total: int
    weak_topics: List[str]   # ✅ THIS IS THE FIX
    review: List[ReviewItem]
    ai_feedback: str