import os
import sys
import json
from dotenv import load_dotenv

# Add project root to sys.path
parent_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.append(parent_dir)
load_dotenv(os.path.join(parent_dir, ".env"))

from app.database import SessionLocal
from app.models.chunk import DocumentChunk

def backfill():
    db = SessionLocal()
    try:
        total = db.query(DocumentChunk).filter(DocumentChunk.embedding_vec.is_(None)).count()
        print(f"Found {total} chunks to backfill...")
        
        BATCH = 100
        offset = 0
        while True:
            # Always query starting from offset or filter directly
            rows = db.query(DocumentChunk).filter(DocumentChunk.embedding_vec.is_(None))\
                .order_by(DocumentChunk.id).limit(BATCH).all()
            if not rows:
                break
            for r in rows:
                # Copy JSON embedding array to vector column
                r.embedding_vec = r.embedding
            db.commit()
            offset += len(rows)
            print(f"Backfilled {offset}/{total} chunks")
    except Exception as e:
        print(f"Error during backfill: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    backfill()
