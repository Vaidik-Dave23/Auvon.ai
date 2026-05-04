from sqlalchemy import Column, Integer, String, ForeignKey, JSON
from sqlalchemy.orm import relationship
from app.database import Base


class Test(Base):
    __tablename__ = 'tests'

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    topic = Column(String)
    created_at = Column(String)

    questions = relationship("Question", back_populates="test", cascade="all, delete-orphan")


class Question(Base):
    __tablename__ = 'questions'

    id = Column(Integer, primary_key=True)
    test_id = Column(Integer, ForeignKey('tests.id'))

    question_text = Column(String)
    options = Column(JSON)  
    correct_answer = Column(String)

    test = relationship("Test", back_populates="questions")