import os
import sys
from dotenv import load_dotenv
from sqlalchemy import create_engine, text

# Add project root to sys.path
parent_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.append(parent_dir)
load_dotenv(os.path.join(parent_dir, ".env"))

from app.database import engine, Base
from app.models.user import User
from app.models.notes import Notes, UserNotes
from app.models.task import Task
from app.models.goal import Goal, Step
from app.models.progress import Progress
from app.models.test import Test, Question
from app.models.results import Test_Result
from app.models.ai_log import AILog
from app.models.chunk import DocumentChunk

def init_db():
    print("Enabling vector extension...")
    with engine.connect() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector;"))
        conn.commit()
    print("Creating all tables...")
    Base.metadata.create_all(bind=engine)
    
    print("Database initialized successfully!")

if __name__ == "__main__":
    init_db()
