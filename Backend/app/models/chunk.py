from sqlalchemy import Column, Integer, Text, ForeignKey, DateTime, JSON
from app.database import Base
from datetime import datetime

class DocumentChunk(Base):
    __tablename__ = 'document_chunks'

    id = Column(Integer, primary_key=True)
    note_id = Column(Integer, ForeignKey('notes.id', ondelete="CASCADE"), nullable=False)
    chunk_text = Column(Text, nullable=False)
    embedding = Column(JSON, nullable=False)  # Stores the vector embedding list as a JSON array
    created_at = Column(DateTime, default=datetime.utcnow)
