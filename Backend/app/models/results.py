from sqlalchemy import Column, Integer, String, ForeignKey
from sqlalchemy.orm import relationship
from app.database import Base
from app.models.user import User
from app.models.test import Test

class Test_Result(Base):
    __tablename__ = 'test_results'

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id'))
    test_id = Column(Integer, ForeignKey('tests.id'))
    best_score = Column(Integer)
    last_score = Column(Integer)

    user = relationship("User")
    test = relationship("Test")