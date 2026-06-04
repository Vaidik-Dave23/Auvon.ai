from fastapi import APIRouter, Depends, UploadFile, File, BackgroundTasks, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.notes import Notes, UserNotes
from app.utils.hash import generate_hash
from app.services.ai import generate_ai_notes, ai
from app.utils.dependencies import get_verified_user
from datetime import datetime
import fitz
import math
from app.models.chunk import DocumentChunk
from app.utils.embeddings import get_embedding

def chunk_text(text: str, chunk_size: int = 800, overlap: int = 150) -> list[str]:
    chunks = []
    if not text:
        return chunks
    start = 0
    while start < len(text):
        end = start + chunk_size
        chunks.append(text[start:end])
        start += chunk_size - overlap
    return chunks

def cosine_similarity(v1: list[float], v2: list[float]) -> float:
    dot = sum(a * b for a, b in zip(v1, v2))
    norm1 = math.sqrt(sum(a * a for a in v1))
    norm2 = math.sqrt(sum(b * b for b in v2))
    if not norm1 or not norm2:
        return 0.0
    return dot / (norm1 * norm2)

def embed_and_store_note_chunks(note_id: int, text: str):
    from app.database import SessionLocal
    db = SessionLocal()
    try:
        existing_chunks = db.query(DocumentChunk).filter(DocumentChunk.note_id == note_id).first()
        if existing_chunks:
            return
            
        chunks = chunk_text(text)
        for chunk_txt in chunks:
            if not chunk_txt.strip():
                continue
            try:
                embedding = get_embedding(chunk_txt)
                db_chunk = DocumentChunk(
                    note_id=note_id,
                    chunk_text=chunk_txt,
                    embedding=embedding
                )
                db.add(db_chunk)
            except Exception as e:
                print(f"Failed to generate embedding for chunk: {e}")
        db.commit()
    except Exception as e:
        print(f"Failed to run embed_and_store_note_chunks: {e}")
    finally:
        db.close()


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
def generate_notes(query: str, background_tasks: BackgroundTasks, db: Session = Depends(get_db), user=Depends(get_verified_user)):

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

    # Async generate and store chunks/embeddings for Q&A
    background_tasks.add_task(embed_and_store_note_chunks, new_note.id, content)

    return {"source": "ai", "note": note_to_dict(new_note)}

@router.get("/my")
def get_my_notes(db: Session = Depends(get_db), user=Depends(get_verified_user)):
    user_notes = db.query(UserNotes).filter(UserNotes.user_id == user.id).all()
    note_ids = [un.note_id for un in user_notes]
    notes = db.query(Notes).filter(Notes.id.in_(note_ids)).order_by(Notes.created_at.desc()).all()
    return notes

@router.post("/pdf")
async def generate_from_pdf(background_tasks: BackgroundTasks, file: UploadFile = File(...), db: Session = Depends(get_db), user=Depends(get_verified_user)):

    content_bytes = await file.read()

    # Hash the full content for caching
    hash_key = generate_hash(content_bytes.decode(errors="ignore")[:1000])

    existing_note = db.query(Notes).filter(Notes.hash_key == hash_key).first()

    if existing_note:
        user_note = UserNotes(user_id=user.id, note_id=existing_note.id)
        db.add(user_note)
        db.commit()
        return {"source": "cache", "note": note_to_dict(existing_note)}

    # Extract ALL text from PDF
    pdf = fitz.open(stream=content_bytes, filetype="pdf")
    text = ""
    for page in pdf:
        text += page.get_text()

    # Use is_pdf=True so the AI reads the actual document content (first 8000 chars for summary)
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

    # Async generate and store chunks/embeddings for the entire PDF text (full content Q&A)
    background_tasks.add_task(embed_and_store_note_chunks, new_note.id, text)

    return {"source": "ai", "note": note_to_dict(new_note)}

@router.post("/{note_id}/query")
def query_note(
    note_id: int,
    query: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    user = Depends(get_verified_user)
):
    # Verify user owns the note
    user_note = db.query(UserNotes).filter(UserNotes.user_id == user.id, UserNotes.note_id == note_id).first()
    if not user_note:
        raise HTTPException(status_code=403, detail="Access denied to this note")
        
    note = db.query(Notes).filter(Notes.id == note_id).first()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
        
    # Generate query embedding vector
    query_emb = get_embedding(query)
    
    # Retrieve all chunks for this note
    chunks = db.query(DocumentChunk).filter(DocumentChunk.note_id == note_id).all()
    if not chunks:
        # Fallback: chunk and embed note content dynamically if none exist
        note_chunks = chunk_text(note.content)
        for chunk_txt in note_chunks:
            if not chunk_txt.strip():
                continue
            try:
                emb = get_embedding(chunk_txt)
                db_chunk = DocumentChunk(note_id=note_id, chunk_text=chunk_txt, embedding=emb)
                db.add(db_chunk)
                chunks.append(db_chunk)
            except Exception as e:
                print(f"Failed to dynamically embed note content: {e}")
        db.commit()
        
    if not chunks:
        raise HTTPException(status_code=400, detail="This note has no retrieveable document content")
        
    # Calculate similarity scores
    scored_chunks = []
    for chunk in chunks:
        score = cosine_similarity(query_emb, chunk.embedding)
        scored_chunks.append((score, chunk.chunk_text))
        
    # Sort by similarity and pick top 3 relevant chunks
    scored_chunks.sort(key=lambda x: x[0], reverse=True)
    top_chunks = scored_chunks[:3]
    
    context = "\n---\n".join(text for score, text in top_chunks)
    
    prompt = [
        {
            "role": "system",
            "content": (
                "You are an expert study assistant. Answer the user's question using ONLY the provided document context. "
                "Be detailed, factual, and strictly truthful to the context. If the context does not contain the answer, "
                "state that you cannot find the answer in the document context."
            )
        },
        {
            "role": "user",
            "content": (
                f"Document Context:\n{context}\n\n"
                f"User Question: {query}"
            )
        }
    ]
    
    evaluation_context = {
        "context": context,
        "query": query
    }
    
    # Call logging-enabled core caller with RAG context evaluation task
    answer = ai(
        prompt,
        endpoint_name="query_note",
        background_tasks=background_tasks,
        evaluation_context=evaluation_context
    )
    
    return {
        "answer": answer,
        "sources": [text for score, text in top_chunks]
    }