from fastapi import APIRouter, Depends, UploadFile, File
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.notes import Notes, UserNotes
from app.utils.hash import generate_hash
from app.services.ai import generate_ai_notes
from app.utils.dependencies import get_current_user
from datetime import datetime
import fitz

def note_to_dict(note):
    return {
        "id": note.id,
        "title": note.title,
        "content": note.content,
        "source": note.source,
        "hash_key": note.hash_key,
        "created_at": note.created_at
    }

router = APIRouter(prefix="/notes", tags=["notes"])

@router.get("/search")
def search_notes(q: str, db: Session = Depends(get_db)):
    notes = db.query(Notes).filter(Notes.title.ilike(f"%{q}%")).all()
    return notes

@router.post("/generate")
def generate_notes(query: str, db: Session = Depends(get_db), user=Depends(get_current_user)):

    hash_key = generate_hash(query)

    existing_note = db.query(Notes).filter(Notes.hash_key == hash_key).first()

    if existing_note:
        user_note = UserNotes(user_id=user.id, note_id=existing_note.id)
        db.add(user_note)
        db.commit()
        return {"source": "cache", "note": note_to_dict(existing_note)}

    # Topic keyword — use standard notes generation
    content = generate_ai_notes(query, is_pdf=False)

    new_note = Notes(
        title=query,
        content=content,
        hash_key=hash_key,
        source="keyword",
        created_at=datetime.utcnow().isoformat()
    )

    db.add(new_note)
    db.commit()
    db.refresh(new_note)

    user_note = UserNotes(user_id=user.id, note_id=new_note.id)
    db.add(user_note)
    db.commit()

    return {"source": "ai", "note": note_to_dict(new_note)}

@router.get("/my")
def get_my_notes(db: Session = Depends(get_db), user=Depends(get_current_user)):
    user_notes = db.query(UserNotes).filter(UserNotes.user_id == user.id).all()
    note_ids = [un.note_id for un in user_notes]
    notes = db.query(Notes).filter(Notes.id.in_(note_ids)).order_by(Notes.created_at.desc()).all()
    return notes

@router.post("/pdf")
async def generate_from_pdf(file: UploadFile = File(...), db: Session = Depends(get_db), user=Depends(get_current_user)):

    content_bytes = await file.read()

    # Hash the full content for caching
    hash_key = generate_hash(content_bytes.decode(errors="ignore")[:1000])

    existing_note = db.query(Notes).filter(Notes.hash_key == hash_key).first()

    if existing_note:
        user_note = UserNotes(user_id=user.id, note_id=existing_note.id)
        db.add(user_note)
        db.commit()
        return {"source": "cache", "note": note_to_dict(existing_note)}

    # Extract ALL text from PDF (increased limit from 2000 to 8000 chars)
    pdf = fitz.open(stream=content_bytes, filetype="pdf")
    text = ""
    for page in pdf:
        text += page.get_text()

    # Use is_pdf=True so the AI reads the actual document content
    summary = generate_ai_notes(text[:8000], is_pdf=True)

    new_note = Notes(
        title=file.filename,
        content=summary,
        hash_key=hash_key,
        source="pdf",
        created_at=datetime.utcnow().isoformat()
    )

    db.add(new_note)
    db.commit()
    db.refresh(new_note)

    user_note = UserNotes(user_id=user.id, note_id=new_note.id)
    db.add(user_note)
    db.commit()

    return {"source": "ai", "note": note_to_dict(new_note)}