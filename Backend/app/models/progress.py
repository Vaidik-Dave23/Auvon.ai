from sqlalchemy import Column, Integer, String, ForeignKey
from sqlalchemy.orm import relationship
from app.database import Base

class Progress(Base):
    __tablename__ = 'progress'

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id'))
    goal_id = Column(Integer, ForeignKey('goals.id'))
    progress_percentage = Column(Integer)

    user = relationship("User")
    goal = relationship("Goal")
