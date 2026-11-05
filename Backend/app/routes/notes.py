from fastapi import APIRouter, Depends, UploadFile, File, BackgroundTasks, HTTPException, Request
from fastapi.responses import StreamingResponse
import threading
from typing import Union
from app.database import (
    get_db,
    notes_col,
    user_notes_col,
    document_chunks_col,
    id_filter,
    to_object_id,
    serialize_doc,
)
from app.core.limiter import limiter
from app.core.cache import redis_client
import json
import hashlib
from app.models.notes import Notes, UserNotes
from app.utils.hash import generate_hash
from app.services.ai import generate_ai_notes, ai, build_notes_prompt, stream_ai
from app.utils.dependencies import get_verified_user
from app.utils.embeddings import get_embedding, get_query_embedding
from datetime import datetime
import fitz
import math
from app.core.logging_config import get_logger
from app.core.tracing import get_tracer

log = get_logger(__name__)
tracer = get_tracer(__name__)


# ── Chunking ───────────────────────────────────────────────────────────────
def chunk_text(text: str, max_chunk_size: int = 1000, overlap: int = 200) -> list[str]:
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
from concurrent.futures import ThreadPoolExecutor


def embed_and_store_note_chunks(note_id: Union[int, str], text: str):
    """Chunk text and store embeddings in MongoDB. Re-embeds if content changes."""
    note_id_str = str(note_id)
    try:
        document_chunks_col.delete_many({"note_id": note_id_str})

        chunks = [c for c in chunk_text(text, max_chunk_size=1000, overlap=200) if c.strip()]

        def _embed_safe(c):
            try:
                return c, get_embedding(c)
            except Exception as e:
                log.warning("chunk_embedding_failed", note_id=note_id_str, error=str(e))
                return c, None

        with ThreadPoolExecutor(max_workers=8) as pool:
            results = list(pool.map(_embed_safe, chunks))

        docs_to_insert = []
        for chunk_txt, embedding in results:
            if embedding is not None:
                docs_to_insert.append({
                    "note_id": note_id_str,
                    "chunk_text": chunk_txt,
                    "embedding": embedding,
                    "created_at": datetime.utcnow()
                })

        if docs_to_insert:
            document_chunks_col.insert_many(docs_to_insert)

        log.info("note_chunks_stored", note_id=note_id_str, chunks_stored=len(docs_to_insert), chunks_total=len(chunks))
    except Exception as e:
        log.error("embed_and_store_note_chunks_failed", note_id=note_id_str, error=str(e))


# ── Helpers ───────────────────────────────────────────────────────────────────
def note_to_dict(note):
    if not note:
        return {}
    if isinstance(note, dict):
        nid = str(note.get("_id") or note.get("id"))
        return {
            "id": nid,
            "title": note.get("title", ""),
            "content": note.get("content", ""),
            "source": note.get("source", "keyword"),
            "hash_key": note.get("hash_key", ""),
            "created_at": note.get("created_at"),
        }
    return {
        "id": str(getattr(note, "id", "")),
        "title": getattr(note, "title", ""),
        "content": getattr(note, "content", ""),
        "source": getattr(note, "source", "keyword"),
        "hash_key": getattr(note, "hash_key", ""),
        "created_at": getattr(note, "created_at", None),
    }


# ── Router ───────────────────────────────────────────────────────────────────
router = APIRouter(prefix="/notes", tags=["notes"])


@router.get("/search")
def search_notes(
    q: str,
    db = Depends(get_db),
    user = Depends(get_verified_user)
):
    if not q or not q.strip():
        return []

    user_id_str = str(user.id)
    matched_notes = []

    # 1. Title search via regex
    try:
        user_notes_links = list(user_notes_col.find({"user_id": user_id_str}))
        my_note_ids = {str(un.get("note_id")) for un in user_notes_links}

        found_notes = list(notes_col.find({
            "title": {"$regex": q, "$options": "i"}
        }))

        for n in found_notes:
            n_id = str(n.get("_id") or n.get("id"))
            if n_id in my_note_ids:
                matched_notes.append(n)
    except Exception as e:
        log.warning("title_search_failed", query=q, error=str(e))

    # 2. In-memory semantic vector scan over document chunks
    if not matched_notes:
        try:
            query_emb = get_query_embedding(q)
            user_notes_links = list(user_notes_col.find({"user_id": user_id_str}))
            my_note_ids = [str(un.get("note_id")) for un in user_notes_links]

            chunks = list(document_chunks_col.find({"note_id": {"$in": my_note_ids}}))

            if chunks:
                note_scores = {}
                for chunk in chunks:
                    emb = chunk.get("embedding")
                    if emb:
                        sim = cosine_similarity(query_emb, emb)
                        nid = chunk["note_id"]
                        if nid not in note_scores or sim > note_scores[nid]:
                            note_scores[nid] = sim

                sorted_notes = sorted(note_scores.items(), key=lambda x: x[1], reverse=True)
                SIMILARITY_THRESHOLD = 0.70
                matched_note_ids = [nid for nid, score in sorted_notes if score >= SIMILARITY_THRESHOLD]

                for nid in matched_note_ids:
                    n_doc = notes_col.find_one(id_filter(nid))
                    if n_doc:
                        matched_notes.append(n_doc)
        except Exception as inner_e:
            log.warning("semantic_search_failed", query=q, error=str(inner_e))

    # 3. Ensure user association
    if matched_notes:
        for note in matched_notes:
            n_id = str(note.get("_id") or note.get("id"))
            link = user_notes_col.find_one({"user_id": user_id_str, "note_id": n_id})
            if not link:
                user_notes_col.insert_one({"user_id": user_id_str, "note_id": n_id})

    return [note_to_dict(n) for n in matched_notes]


@router.post("/generate")
@limiter.limit("10/minute")
def generate_notes(
    request: Request,
    query: str,
    background_tasks: BackgroundTasks,
    db = Depends(get_db),
    user = Depends(get_verified_user),
):
    hash_key = generate_hash(query)
    user_id_str = str(user.id)

    existing_note = notes_col.find_one({"hash_key": hash_key})
    if existing_note:
        note_id_str = str(existing_note.get("_id") or existing_note.get("id"))
        link = user_notes_col.find_one({"user_id": user_id_str, "note_id": note_id_str})
        if not link:
            user_notes_col.insert_one({"user_id": user_id_str, "note_id": note_id_str})
        return {"source": "cache", "note": note_to_dict(existing_note)}

    content = generate_ai_notes(query, is_pdf=False)
    new_note = {
        "title": query,
        "content": content,
        "hash_key": hash_key,
        "source": "keyword",
        "created_at": datetime.utcnow().isoformat(),
    }
    inserted = notes_col.insert_one(new_note)
    note_id_str = str(inserted.inserted_id)
    notes_col.update_one({"_id": inserted.inserted_id}, {"$set": {"id": note_id_str}})
    new_note["_id"] = inserted.inserted_id
    new_note["id"] = note_id_str

    user_notes_col.insert_one({"user_id": user_id_str, "note_id": note_id_str})

    background_tasks.add_task(embed_and_store_note_chunks, note_id_str, content)
    return {"source": "ai", "note": note_to_dict(new_note)}


MAX_UPLOAD_BYTES = 10 * 1024 * 1024   # 10 MB


def read_pdf_upload(file: UploadFile) -> bytes:
    """Read an uploaded PDF with a size cap, so one huge file can't exhaust server memory."""
    data = file.file.read(MAX_UPLOAD_BYTES + 1)
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File is too large (max 10 MB)")
    if not data.startswith(b"%PDF"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported")
    return data


def _sse(event: dict) -> str:
    return f"data: {json.dumps(event, default=str)}\n\n"


@router.post("/generate/stream")
@limiter.limit("10/minute")
def generate_notes_stream(
    request: Request,
    query: str,
    db = Depends(get_db),
    user = Depends(get_verified_user),
):
    """
    Same as /notes/generate, but streams the note as it is written
    (Server-Sent Events), so the first words show up in a second or two.

    Events: {"type": "delta", "text": "..."} ... then
            {"type": "done", "source": "ai" | "cache", "note": {...}}
         or {"type": "error", "detail": "..."}
    """
    query = (query or "").strip()
    if not query:
        raise HTTPException(status_code=400, detail="Topic is required")
    if len(query) > 300:
        raise HTTPException(status_code=400, detail="Topic is too long")
    user_id_str = str(user.id)
    hash_key = generate_hash(query)

    existing_note = notes_col.find_one({"hash_key": hash_key})
    if existing_note:
        note_id_str = str(existing_note.get("_id") or existing_note.get("id"))
        if not user_notes_col.find_one({"user_id": user_id_str, "note_id": note_id_str}):
            user_notes_col.insert_one({"user_id": user_id_str, "note_id": note_id_str})

        def cached():
            yield _sse({"type": "done", "source": "cache", "note": note_to_dict(existing_note)})

        return StreamingResponse(cached(), media_type="text/event-stream",
                                 headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})

    def events():
        parts = []
        try:
            for delta in stream_ai(build_notes_prompt(query, is_pdf=False), endpoint_name="generate_notes_stream"):
                parts.append(delta)
                yield _sse({"type": "delta", "text": delta})
        except Exception as e:
            log.error("notes_stream_failed", query=query, error=str(e))
            if not parts:
                yield _sse({"type": "error", "detail": "Generation failed. Please try again."})
                return

        content = "".join(parts)
        new_note = {
            "title": query,
            "content": content,
            "hash_key": hash_key,
            "source": "keyword",
            "created_at": datetime.utcnow().isoformat(),
        }
        inserted = notes_col.insert_one(new_note)
        note_id_str = str(inserted.inserted_id)
        notes_col.update_one({"_id": inserted.inserted_id}, {"$set": {"id": note_id_str}})
        new_note["_id"] = inserted.inserted_id
        new_note["id"] = note_id_str
        user_notes_col.insert_one({"user_id": user_id_str, "note_id": note_id_str})
        # embeddings for Q&A / tutor are built in the background, after the student already has the note
        threading.Thread(target=embed_and_store_note_chunks, args=(note_id_str, content), daemon=True).start()
        yield _sse({"type": "done", "source": "ai", "note": note_to_dict(new_note)})

    return StreamingResponse(events(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@router.get("/my")
def get_my_notes(db = Depends(get_db), user = Depends(get_verified_user)):
    user_id_str = str(user.id)
    user_notes = list(user_notes_col.find({"user_id": user_id_str}))
    note_ids = [str(un.get("note_id")) for un in user_notes]

    obj_ids = [to_object_id(nid) for nid in note_ids if to_object_id(nid)]
    query = {"$or": [{"_id": {"$in": obj_ids}}, {"id": {"$in": note_ids}}]} if note_ids else {"_id": None}

    notes = list(notes_col.find(query).sort("_id", -1))
    return [note_to_dict(n) for n in notes]


@router.post("/pdf")
@limiter.limit("5/minute")
def generate_from_pdf(
    request: Request,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    db = Depends(get_db),
    user = Depends(get_verified_user),
):
    content_bytes = read_pdf_upload(file)
    hash_key = generate_hash(content_bytes.decode(errors="ignore")[:1000])
    user_id_str = str(user.id)

    existing_note = notes_col.find_one({"hash_key": hash_key})
    if existing_note:
        note_id_str = str(existing_note.get("_id") or existing_note.get("id"))
        link = user_notes_col.find_one({"user_id": user_id_str, "note_id": note_id_str})
        if not link:
            user_notes_col.insert_one({"user_id": user_id_str, "note_id": note_id_str})
        return {"source": "cache", "note": note_to_dict(existing_note)}

    pdf = fitz.open(stream=content_bytes, filetype="pdf")
    full_text = "".join(page.get_text() for page in pdf)

    summary = generate_ai_notes(full_text[:12000], is_pdf=True)

    new_note = {
        "title": file.filename,
        "content": summary,
        "hash_key": hash_key,
        "source": "pdf",
        "created_at": datetime.utcnow().isoformat(),
    }
    inserted = notes_col.insert_one(new_note)
    note_id_str = str(inserted.inserted_id)
    notes_col.update_one({"_id": inserted.inserted_id}, {"$set": {"id": note_id_str}})
    new_note["_id"] = inserted.inserted_id
    new_note["id"] = note_id_str

    user_notes_col.insert_one({"user_id": user_id_str, "note_id": note_id_str})

    background_tasks.add_task(embed_and_store_note_chunks, note_id_str, full_text)
    return {"source": "ai", "note": note_to_dict(new_note)}


# ── Retrieval + grounded-answer prompt (shared by the API and benchmarks/) ─────
SIMILARITY_THRESHOLD = 0.3
MAX_CONTEXT_CHUNKS = 6
FALLBACK_CONTEXT_CHUNKS = 3


def rank_chunks(query_emb: list[float], chunks: list[dict]) -> list[tuple[float, str]]:
    """(cosine score, chunk text) for every embedded chunk, best first."""
    scored = []
    for c in chunks:
        emb = c.get("embedding")
        if emb:
            scored.append((cosine_similarity(query_emb, emb), c.get("chunk_text", "")))
    scored.sort(key=lambda x: x[0], reverse=True)
    return scored


def select_context_chunks(scored: list[tuple[float, str]]) -> list[tuple[float, str]]:
    """Up to 6 chunks above the similarity threshold; if none clear it, the best 3."""
    top_chunks = [(score, text) for score, text in scored[:MAX_CONTEXT_CHUNKS] if score >= SIMILARITY_THRESHOLD]
    return top_chunks or scored[:FALLBACK_CONTEXT_CHUNKS]


def build_context(top_chunks: list[tuple[float, str]]) -> str:
    context_parts = []
    for rank, (score, text) in enumerate(top_chunks, 1):
        context_parts.append(f"[Source {rank} — relevance {score:.0%}]\n{text}")
    return "\n\n---\n\n".join(context_parts)


NOT_COVERED_REPLY = "This specific information isn't covered in the provided document sections."


def build_qa_prompt(context: str, query: str) -> list[dict]:
    return [
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
                "2. NO EXTRAPOLATION: Do not infer, extrapolate, or assume facts beyond what is written.\n"
                "3. NO HELPFUL ADDITIONS: Do not add extra explanations, background, examples, or additional context.\n"
                "4. CITATION ENFORCEMENT: Every single factual claim, statement, definition, or bullet point in your answer "
                "MUST end with a citation mapping to the specific source chunk it was drawn from (e.g., [Source 1] or [Source 2]).\n"
                "5. If the answer is NOT in the excerpts at all, you must respond with: "
                f"'{NOT_COVERED_REPLY}' Do not attempt to answer."
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


def _prepare_note_query(note_id, query: str, user) -> dict:
    """Auth check, cache lookup, retrieval and prompt for a note question (no model call)."""
    user_id_str = str(user.id)
    note_id_str = str(note_id)

    # ── Auth check ──
    user_link = user_notes_col.find_one({"user_id": user_id_str, "note_id": note_id_str})
    if not user_link:
        obj_id = to_object_id(note_id)
        if obj_id:
            user_link = user_notes_col.find_one({"user_id": user_id_str, "note_id": str(obj_id)})

    if not user_link:
        raise HTTPException(status_code=403, detail="Access denied to this note")

    note = notes_col.find_one(id_filter(note_id))
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")

    cache_key = f"qa:{note_id_str}:{hashlib.sha256(query.strip().lower().encode()).hexdigest()}"
    if redis_client:
        try:
            cached_res = redis_client.get(cache_key)
            if cached_res:
                log.info("qa_cache_hit", note_id=note_id_str, query=query)
                return {"cached": json.loads(cached_res)}
        except Exception as e:
            log.warning("qa_cache_read_failed", error=str(e))

    try:
        query_emb = get_query_embedding(query)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Query embedding failed: {e}")

    with tracer.start_as_current_span("retrieve_chunks") as span:
        span.set_attribute("note_id", note_id_str)
        chunks = list(document_chunks_col.find({"note_id": note_id_str}))

        if not chunks:
            span.set_attribute("retrieve_chunks.on_demand_fallback", True)
            note_chunks = chunk_text(note.get("content", ""), max_chunk_size=1000, overlap=200)
            docs_to_insert = []
            for chunk_txt in note_chunks:
                if not chunk_txt.strip():
                    continue
                try:
                    emb = get_embedding(chunk_txt)
                    if emb:
                        docs_to_insert.append({
                            "note_id": note_id_str,
                            "chunk_text": chunk_txt,
                            "embedding": emb,
                            "created_at": datetime.utcnow()
                        })
                except Exception as e:
                    log.warning("on_demand_embed_failed", note_id=note_id_str, error=str(e))

            if docs_to_insert:
                document_chunks_col.insert_many(docs_to_insert)
                chunks = docs_to_insert

        span.set_attribute("retrieve_chunks.count", len(chunks))

    if not chunks:
        raise HTTPException(status_code=400, detail="No retrievable content found for this note")

    scored = rank_chunks(query_emb, chunks)
    top_chunks = select_context_chunks(scored)
    context = build_context(top_chunks)
    prompt = build_qa_prompt(context, query)

    return {"prompt": prompt, "context": context, "top_chunks": top_chunks, "cache_key": cache_key,
            "note_id": note_id_str, "query": query}


def _cache_answer(cache_key: str, res: dict) -> None:
    if redis_client:
        try:
            redis_client.setex(cache_key, 3600, json.dumps(res))
        except Exception as e:
            log.warning("qa_cache_write_failed", error=str(e))


@router.post("/{note_id}/query")
@limiter.limit("15/minute")
def query_note(
    request: Request,
    note_id: Union[int, str],
    query: str,
    background_tasks: BackgroundTasks,
    db = Depends(get_db),
    user = Depends(get_verified_user),
):
    prep = _prepare_note_query(note_id, query, user)
    if "cached" in prep:
        return prep["cached"]
    answer = ai(
        prep["prompt"],
        endpoint_name="query_note",
        background_tasks=background_tasks,
        evaluation_context={"context": prep["context"], "query": query},
        temperature=0.0,
    )
    res = {
        "answer": answer,
        "sources": [text for _, text in prep["top_chunks"]],
        "scores": [round(score, 3) for score, _ in prep["top_chunks"]],
    }
    _cache_answer(prep["cache_key"], res)
    return res


@router.post("/{note_id}/query/stream")
@limiter.limit("15/minute")
def query_note_stream(
    request: Request,
    note_id: Union[int, str],
    query: str,
    db = Depends(get_db),
    user = Depends(get_verified_user),
):
    """Same as /{note_id}/query but streams the answer (Server-Sent Events).

    Events: {"type": "delta", "text": "..."} ... then {"type": "done", "answer", "sources", "scores"}
            (a cached answer comes back as a single "done"), or {"type": "error", "detail"}.
    """
    prep = _prepare_note_query(note_id, query, user)   # 403 / 404 / 502 happen before streaming

    def events():
        if "cached" in prep:
            yield _sse({"type": "done", **prep["cached"]})
            return
        parts = []
        try:
            for delta in stream_ai(prep["prompt"], endpoint_name="query_note_stream", temperature=0.0):
                parts.append(delta)
                yield _sse({"type": "delta", "text": delta})
        except Exception as e:
            log.error("note_query_stream_failed", note_id=prep["note_id"], error=str(e))
            if not parts:
                yield _sse({"type": "error", "detail": "Sorry, I couldn't answer that right now. Please try again."})
                return
        res = {
            "answer": "".join(parts),
            "sources": [text for _, text in prep["top_chunks"]],
            "scores": [round(score, 3) for score, _ in prep["top_chunks"]],
        }
        _cache_answer(prep["cache_key"], res)
        yield _sse({"type": "done", **res})

    return StreamingResponse(events(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@router.delete("/{note_id}")
def delete_note(
    note_id: Union[int, str],
    db = Depends(get_db),
    user = Depends(get_verified_user)
):
    user_id_str = str(user.id)
    note_id_str = str(note_id)

    user_notes_col.delete_one({"user_id": user_id_str, "note_id": note_id_str})
    remaining = user_notes_col.find_one({"note_id": note_id_str})
    if not remaining:
        notes_col.delete_one(id_filter(note_id))
        document_chunks_col.delete_many({"note_id": note_id_str})

    return {"message": "Note deleted successfully"}
