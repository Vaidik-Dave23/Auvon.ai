from fastapi import APIRouter, Depends, UploadFile, File, BackgroundTasks, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.notes import Notes, UserNotes
from app.utils.hash import generate_hash
from app.services.ai import generate_ai_notes, ai
from app.utils.dependencies import get_verified_user
from app.utils.embeddings import get_embedding, get_query_embedding
from datetime import datetime
import fitz
import math
from app.models.chunk import DocumentChunk
from app.core.logging_config import get_logger
from app.core.tracing import get_tracer

log = get_logger(__name__)
tracer = get_tracer(__name__)


# ── Chunking (imported from utils) ──────────────────────────────────────────
def chunk_text(text: str, max_chunk_size: int = 1000, overlap: int = 200) -> list[str]:
    """
    Delegate to the improved semantic chunker.
    Kept here so existing imports don't break.
    """
    import re

    def _split_sentences(t):
        t = re.sub(r'\b(e\.g|i\.e|Fig|Dr|Mr|Mrs|Ms|Prof|vs|etc|approx|no)\.\s', r'\1<DOT> ', t)
        sents = re.split(r'(?<=[.!?])\s+', t)
        return [s.replace('<DOT>', '.') for s in sents if s.strip()]

    def _chunk_section(title, body, max_size, olap):
        prefix = f"{title}\n\n" if title else ""
        paragraphs = re.split(r'\n{2,}', body)
        chunks, current = [], prefix

        for para in paragraphs:
            para = para.strip()
            if not para:
                continue
            if len(current) + len(para) + 2 <= max_size:
                current += para + "\n\n"
            else:
                if current.strip() and current.strip() != prefix.strip():
                    chunks.append(current.strip())
                if len(prefix) + len(para) <= max_size:
                    current = prefix + para + "\n\n"
                else:
                    sentences = _split_sentences(para)
                    current = prefix
                    for sent in sentences:
                        if len(current) + len(sent) + 1 <= max_size:
                            current += sent + " "
                        else:
                            if current.strip() and current.strip() != prefix.strip():
                                chunks.append(current.strip())
                            tail = current[-olap:] if olap < len(current) else current
                            current = prefix + tail.lstrip() + sent + " "
                    current += "\n\n"

        if current.strip() and current.strip() != prefix.strip():
            chunks.append(current.strip())
        return chunks

    if not text or not text.strip():
        return []

    header_pattern = re.compile(r'^(#{1,3})\s+(.+)$', re.MULTILINE)
    matches = list(header_pattern.finditer(text))

    if not matches:
        return _chunk_section("", text, max_chunk_size, overlap)

    chunks = []
    preamble = text[:matches[0].start()].strip()
    if preamble:
        chunks.extend(_chunk_section("", preamble, max_chunk_size, overlap))

    for i, match in enumerate(matches):
        title = match.group(0).strip()
        start = match.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        body = text[start:end].strip()
        if body:
            chunks.extend(_chunk_section(title, body, max_chunk_size, overlap))

    seen, deduped = set(), []
    for c in chunks:
        key = c[:120]
        if key not in seen:
            seen.add(key)
            deduped.append(c)
    return deduped


# ── Similarity ───────────────────────────────────────────────────────────────

def cosine_similarity(v1: list[float], v2: list[float]) -> float:
    dot = sum(a * b for a, b in zip(v1, v2))
    norm1 = math.sqrt(sum(a * a for a in v1))
    norm2 = math.sqrt(sum(b * b for b in v2))
    if not norm1 or not norm2:
        return 0.0
    return dot / (norm1 * norm2)


# ── Background embedding task ─────────────────────────────────────────────────

def embed_and_store_note_chunks(note_id: int, text: str):
    """Chunk text and store embeddings. Re-embeds if content changes or cleans up stale chunks."""
    from app.database import SessionLocal
    db = SessionLocal()
    try:
        # Delete any existing chunks for this note to prevent stale or mismatched content
        db.query(DocumentChunk).filter(DocumentChunk.note_id == note_id).delete()
        db.commit()

        chunks = chunk_text(text, max_chunk_size=1000, overlap=200)
        stored = 0
        for chunk_txt in chunks:
            if not chunk_txt.strip():
                continue
            try:
                embedding = get_embedding(chunk_txt)   # document-side embedding
                db.add(DocumentChunk(note_id=note_id, chunk_text=chunk_txt, embedding=embedding))
                stored += 1
            except Exception as e:
                log.warning("chunk_embedding_failed", note_id=note_id, error=str(e))

        db.commit()
        log.info("note_chunks_stored", note_id=note_id, chunks_stored=stored, chunks_total=len(chunks))
    except Exception as e:
        log.error("embed_and_store_note_chunks_failed", note_id=note_id, error=str(e))
    finally:
        db.close()


# ── Helpers ───────────────────────────────────────────────────────────────────

def note_to_dict(note):
    return {
        "id": note.id,
        "title": note.title,
        "content": note.content,
        "source": note.source,
        "hash_key": note.hash_key,
        "created_at": note.created_at,
    }


# ── Router ───────────────────────────────────────────────────────────────────

router = APIRouter(prefix="/notes", tags=["notes"])


@router.get("/search")
def search_notes(
    q: str,
    db: Session = Depends(get_db),
    user=Depends(get_verified_user)
):
    if not q or not q.strip():
        return []

    matched_notes = []

    # 1. Try basic title search first (fast, precise, free)
    try:
        matched_notes = db.query(Notes).filter(Notes.title.ilike(f"%{q}%")).all()
    except Exception as e:
        log.warning("title_search_failed", query=q, error=str(e))

    # 2. Fallback to semantic search if title search didn't yield anything
    if not matched_notes:
        try:
            query_emb = get_query_embedding(q)
            chunks = db.query(DocumentChunk).all()
            
            if chunks:
                note_scores = {}
                for chunk in chunks:
                    sim = cosine_similarity(query_emb, chunk.embedding)
                    if chunk.note_id not in note_scores or sim > note_scores[chunk.note_id]:
                        note_scores[chunk.note_id] = sim
                
                # Sort note_ids by similarity score descending
                sorted_notes = sorted(note_scores.items(), key=lambda x: x[1], reverse=True)
                
                # Take notes with similarity >= 0.70 (calibrated for gemini-embedding-001 narrow-cone baseline)
                SIMILARITY_THRESHOLD = 0.70
                matched_note_ids = [note_id for note_id, score in sorted_notes if score >= SIMILARITY_THRESHOLD]
                
                if matched_note_ids:
                    # Fetch notes from DB maintaining the rank order
                    notes_dict = {n.id: n for n in db.query(Notes).filter(Notes.id.in_(matched_note_ids)).all()}
                    matched_notes = [notes_dict[nid] for nid in matched_note_ids if nid in notes_dict]
        except Exception as e:
            log.warning("semantic_search_failed", query=q, error=str(e))

    # 3. Associate matched notes with the user so they don't get 403 on view/query
    if matched_notes:
        # Check existing associations
        note_ids = [n.id for n in matched_notes]
        existing_links = db.query(UserNotes).filter(
            UserNotes.user_id == user.id,
            UserNotes.note_id.in_(note_ids)
        ).all()
        linked_note_ids = {link.note_id for link in existing_links}
        
        for note in matched_notes:
            if note.id not in linked_note_ids:
                db.add(UserNotes(user_id=user.id, note_id=note.id))
        db.commit()

    return [note_to_dict(n) for n in matched_notes]


@router.post("/generate")
def generate_notes(
    query: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    user=Depends(get_verified_user),
):
    hash_key = generate_hash(query)
    existing_note = db.query(Notes).filter(Notes.hash_key == hash_key).first()

    if existing_note:
        db.add(UserNotes(user_id=user.id, note_id=existing_note.id))
        db.commit()
        return {"source": "cache", "note": note_to_dict(existing_note)}

    content = generate_ai_notes(query, is_pdf=False)
    new_note = Notes(
        title=query,
        content=content,
        hash_key=hash_key,
        source="keyword",
        created_at=datetime.utcnow().isoformat(),
    )
    db.add(new_note)
    db.commit()
    db.refresh(new_note)
    db.add(UserNotes(user_id=user.id, note_id=new_note.id))
    db.commit()

    background_tasks.add_task(embed_and_store_note_chunks, new_note.id, content)
    return {"source": "ai", "note": note_to_dict(new_note)}


@router.get("/my")
def get_my_notes(db: Session = Depends(get_db), user=Depends(get_verified_user)):
    user_notes = db.query(UserNotes).filter(UserNotes.user_id == user.id).all()
    note_ids = [un.note_id for un in user_notes]
    return db.query(Notes).filter(Notes.id.in_(note_ids)).order_by(Notes.created_at.desc()).all()


@router.post("/pdf")
async def generate_from_pdf(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user=Depends(get_verified_user),
):
    content_bytes = await file.read()
    hash_key = generate_hash(content_bytes.decode(errors="ignore")[:1000])

    existing_note = db.query(Notes).filter(Notes.hash_key == hash_key).first()
    if existing_note:
        db.add(UserNotes(user_id=user.id, note_id=existing_note.id))
        db.commit()
        return {"source": "cache", "note": note_to_dict(existing_note)}

    pdf = fitz.open(stream=content_bytes, filetype="pdf")
    full_text = "".join(page.get_text() for page in pdf)

    # Use first 12k chars for note summary (more than before)
    summary = generate_ai_notes(full_text[:12000], is_pdf=True)

    new_note = Notes(
        title=file.filename,
        content=summary,
        hash_key=hash_key,
        source="pdf",
        created_at=datetime.utcnow().isoformat(),
    )
    db.add(new_note)
    db.commit()
    db.refresh(new_note)
    db.add(UserNotes(user_id=user.id, note_id=new_note.id))
    db.commit()

    # Embed the FULL PDF text (not just summary) for better Q&A
    background_tasks.add_task(embed_and_store_note_chunks, new_note.id, full_text)
    return {"source": "ai", "note": note_to_dict(new_note)}


@router.post("/{note_id}/query")
def query_note(
    note_id: int,
    query: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    user=Depends(get_verified_user),
):
    # ── Auth ──────────────────────────────────────────────────────────────────
    user_note = db.query(UserNotes).filter(
        UserNotes.user_id == user.id, UserNotes.note_id == note_id
    ).first()
    if not user_note:
        raise HTTPException(status_code=403, detail="Access denied to this note")

    note = db.query(Notes).filter(Notes.id == note_id).first()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")

    # ── Query embedding (RETRIEVAL_QUERY task type) ───────────────────────────
    try:
        query_emb = get_query_embedding(query)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Query embedding failed: {e}")

    # ── Retrieve chunks ───────────────────────────────────────────────────────
    with tracer.start_as_current_span("retrieve_chunks") as span:
        span.set_attribute("note_id", note_id)
        chunks = db.query(DocumentChunk).filter(DocumentChunk.note_id == note_id).all()

        if not chunks:
            span.set_attribute("retrieve_chunks.on_demand_fallback", True)
            # On-demand fallback: chunk + embed note content right now
            note_chunks = chunk_text(note.content, max_chunk_size=1000, overlap=200)
            for chunk_txt in note_chunks:
                if not chunk_txt.strip():
                    continue
                try:
                    emb = get_embedding(chunk_txt)
                    chunk_obj = DocumentChunk(note_id=note_id, chunk_text=chunk_txt, embedding=emb)
                    db.add(chunk_obj)
                    chunks.append(chunk_obj)
                except Exception as e:
                    log.warning("on_demand_embed_failed", note_id=note_id, error=str(e))
            db.commit()

        span.set_attribute("retrieve_chunks.count", len(chunks))

    if not chunks:
        raise HTTPException(status_code=400, detail="No retrievable content found for this note")

    # ── Score + rank ──────────────────────────────────────────────────────────
    scored = sorted(
        [(cosine_similarity(query_emb, c.embedding), c.chunk_text) for c in chunks],
        key=lambda x: x[0],
        reverse=True,
    )

    # Dynamic top-k: take top 5 but drop any with score < 0.3 (likely irrelevant)
    SIMILARITY_THRESHOLD = 0.3
    top_chunks = [
        (score, text) for score, text in scored[:6]
        if score >= SIMILARITY_THRESHOLD
    ]

    # If nothing passes threshold, fall back to top 3 regardless
    if not top_chunks:
        top_chunks = scored[:3]

    # ── Build context ─────────────────────────────────────────────────────────
    context_parts = []
    for rank, (score, text) in enumerate(top_chunks, 1):
        context_parts.append(f"[Source {rank} — relevance {score:.0%}]\n{text}")
    context = "\n\n---\n\n".join(context_parts)

    # ── LLM prompt ───────────────────────────────────────────────────────────
    prompt = [
        {
            "role": "system",
            "content": (
                "You are a strict, expert study assistant. Your job is to answer the student's question "
                "using ONLY the provided document excerpts.\n\n"
                "STRICT RULES:\n"
                "1. STRICT CONTEXT ADHERENCE: Answer the question using ONLY the facts explicitly stated in the "
                "provided document excerpts. If a fact or detail is not directly and explicitly mentioned in the "
                "excerpts, you must treat it as completely non-existent. Do not use your own prior knowledge, "
                "external background information, or any outside examples under any circumstances.\n"
                "2. NO EXTRAPOLATION: Do not infer, extrapolate, or assume facts beyond what is written. It is far "
                "better to give a shorter, incomplete answer that is 100% faithful to the text than a complete answer "
                "that uses outside knowledge.\n"
                "3. NO HELPFUL ADDITIONS: Do not add extra explanations, background, examples, or additional context "
                "unless they are directly present in the retrieved excerpts. Do not include any 'Note:', 'Additional Context:', "
                "or supplementary sections containing facts outside the source text.\n"
                "4. CITATION ENFORCEMENT: Every single factual claim, statement, definition, or bullet point in your answer "
                "MUST end with a citation mapping to the specific source chunk it was drawn from (e.g., [Source 1] or [Source 2]). "
                "If you cannot cite a specific Source for a sentence, you MUST NOT write that sentence.\n"
                "5. If the answer is NOT in the excerpts at all, you must respond with: "
                "'This specific information isn't covered in the provided document sections.' Do not attempt to answer."
            ),
        },
        {
            "role": "user",
            "content": (
                f"DOCUMENT EXCERPTS:\n\n{context}\n\n"
                f"---\n\n"
                f"QUESTION: {query}\n\n"
                "Please provide a thorough, specific answer based on the document excerpts above."
            ),
        },
    ]

    evaluation_context = {"context": context, "query": query}

    answer = ai(
        prompt,
        endpoint_name="query_note",
        background_tasks=background_tasks,
        evaluation_context=evaluation_context,
        temperature=0.0,
    )

    return {
        "answer": answer,
        "sources": [text for _, text in top_chunks],
        "scores": [round(score, 3) for score, _ in top_chunks],
    }