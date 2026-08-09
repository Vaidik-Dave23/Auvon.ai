from sqlalchemy import Column, Integer, Text, ForeignKey, DateTime, JSON
from app.database import Base
from datetime import datetime
from pgvector.sqlalchemy import Vector

class DocumentChunk(Base):
    __tablename__ = 'document_chunks'

    id = Column(Integer, primary_key=True)
    note_id = Column(Integer, ForeignKey('notes.id', ondelete="CASCADE"), nullable=False, index=True)
    chunk_text = Column(Text, nullable=False)
    embedding = Column(JSON, nullable=False)  # Stores the vector embedding list as a JSON array
    embedding_vec = Column(Vector(3072), nullable=True)  # pgvector column matching Gemini embedding dimensions
    created_at = Column(DateTime, default=datetime.utcnow)
