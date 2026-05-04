from sqlalchemy import Column, Integer, String, Boolean, ForeignKey
from app.database import Base

class UserAnswer(Base):
    __tablename__ = "user_answers"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, nullable=False)
    test_id = Column(Integer, nullable=False)

    question_id = Column(Integer, ForeignKey("questions.id"))
    question_text = Column(String)

    selected_answer = Column(String)
    correct_answer = Column(String)

    is_correct = Column(Boolean)