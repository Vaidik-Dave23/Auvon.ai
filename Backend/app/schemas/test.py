from pydantic import BaseModel
from typing import List, Dict, Optional, Union, Any


class QuestionOut(BaseModel):
    id: Union[int, str]
    question: str
    options: List[str]


class TestGenerateResponse(BaseModel):
    test_id: Union[int, str]
    questions: List[QuestionOut]


class TestSubmitRequest(BaseModel):
    test_id: Union[int, str]
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
    weak_topics: List[str]
    review: List[ReviewItem]
    ai_feedback: str
