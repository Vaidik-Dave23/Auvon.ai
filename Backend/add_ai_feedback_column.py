#!/usr/bin/env python3
"""
Migration script to add ai_feedback column to test_results table
Run this script before restarting the application
"""

from sqlalchemy import text
from app.database import engine
from app.models.results import Test_Result
from app.database import Base

def migrate():
    """Add ai_feedback column to test_results table if it doesn't exist"""
    
    with engine.connect() as connection:
        # Check if column exists
        inspector_result = connection.execute(
            text("""
                SELECT column_name FROM information_schema.columns 
                WHERE table_name='test_results' AND column_name='ai_feedback'
            """)
        ).fetchone()
        
        if inspector_result is None:
            # Column doesn't exist, create it
            print("Adding ai_feedback column to test_results table...")
            connection.execute(
                text("ALTER TABLE test_results ADD COLUMN ai_feedback TEXT")
            )
            connection.commit()
            print("✅ Successfully added ai_feedback column!")
        else:
            print("✅ ai_feedback column already exists in test_results table")

if __name__ == "__main__":
    # Ensure all tables are created
    Base.metadata.create_all(bind=engine)
    
    # Run migration
    migrate()
