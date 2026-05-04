from sqlalchemy import Column, Integer, String , ForeignKey
from sqlalchemy.orm import relationship
from app.database import Base

class Notes(Base):
    __tablename__ = 'notes'

    id = Column(Integer, primary_key=True)
    title = Column(String, index=True)
    content = Column(String)
    source = Column(String)  # keyword / pdf
    hash_key = Column(String, unique=True)  # for caching
    created_at = Column(String)

class UserNotes(Base):
    __tablename__ = 'user_notes'

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id'))
    note_id = Column(Integer, ForeignKey('notes.id'))