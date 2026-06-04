from sqlalchemy import Column, Integer, String, Float, DateTime, Text
from app.database import Base
from datetime import datetime

class AILog(Base):
    __tablename__ = 'ai_logs'

    id = Column(Integer, primary_key=True)
    endpoint = Column(String, nullable=False)
    prompt = Column(Text, nullable=False)
    response = Column(Text, nullable=False)
    latency = Column(Float, nullable=False)  # In seconds
    prompt_tokens = Column(Integer, nullable=False)
    completion_tokens = Column(Integer, nullable=False)
    total_tokens = Column(Integer, nullable=False)
    
    # Evaluation scores (Ragas metrics)
    faithfulness = Column(Float, nullable=True)
    relevance = Column(Float, nullable=True)
    context_recall = Column(Float, nullable=True)
    evaluation_feedback = Column(Text, nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow)
