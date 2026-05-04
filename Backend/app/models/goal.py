from sqlalchemy import Column, Integer, String, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.ext.declarative import declarative_base
from app.models.user import User
from app.database import Base

class Goal(Base):
    __tablename__ = 'goals'

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id'))
    title = Column(String)
    steps=relationship("Step", back_populates="goal", cascade="all, delete-orphan")

    user = relationship("User")

class Step(Base):
    __tablename__ = 'steps'

    id = Column(Integer, primary_key=True)
    goal_id = Column(Integer, ForeignKey('goals.id'))
    description = Column(String)
    is_completed = Column(Integer)
    week = Column(Integer)

    goal = relationship("Goal", back_populates="steps")
