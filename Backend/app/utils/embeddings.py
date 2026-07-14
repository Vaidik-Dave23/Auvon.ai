import os
import time
import requests
from fastapi import HTTPException

from app.core.logging_config import get_logger
from app.core.metrics import EMBEDDING_LATENCY
from app.core.tracing import get_tracer

logger = get_logger(__name__)
tracer = get_tracer(__name__)

# Correct REST endpoint format:
# POST https://generativelanguage.googleapis.com/v1beta/models/{model}:embedContent?key={API_KEY}
GEMINI_EMBED_MODEL = "gemini-embedding-001"
GEMINI_EMBED_BASE  = "https://generativelanguage.googleapis.com/v1beta/models"


import random

def _load_gemini_keys() -> list[str]:
    """Return all configured Gemini keys, shuffled."""
    keys = []
    for i in range(1, 20):
        k = os.getenv(f"GEMINI_API_KEY_{i}")
        if k:
            keys.append(k.strip())
    if not keys:
        single = os.getenv("GEMINI_API_KEY")
        if single:
            keys.append(single.strip())
    
    if not keys:
        raise HTTPException(status_code=500, detail="No GEMINI_API_KEY configured for embeddings")
    
    random.shuffle(keys)
    return keys


def _embed(text: str, task_type: str) -> list[float]:
    """
    Call Gemini embedContent REST API trying all available keys.
    """
    text = text.strip()[:8000]
    if not text:
        raise HTTPException(status_code=400, detail="Cannot embed empty text")

    keys = _load_gemini_keys()
    last_error = None
    
    url = f"{GEMINI_EMBED_BASE}/{GEMINI_EMBED_MODEL}:embedContent"
    payload = {
        "model":    f"models/{GEMINI_EMBED_MODEL}",
        "content":  {"parts": [{"text": text}]},
        "taskType": task_type,
    }

    start = time.time()
    with tracer.start_as_current_span("embedding_search") as span:
        span.set_attribute("embedding.task_type", task_type)
        span.set_attribute("embedding.text_length", len(text))

        for api_key in keys:
            try:
                response = requests.post(
                    url,
                    params={"key": api_key},   # key in query string, NOT in headers
                    json=payload,
                    timeout=30,
                )
                response.raise_for_status()
                EMBEDDING_LATENCY.labels(task_type=task_type).observe(time.time() - start)
                span.set_attribute("embedding.key_attempts", keys.index(api_key) + 1)
                return response.json()["embedding"]["values"]
            except Exception as e:
                last_error = e
                body = ""
                try:
                    body = response.text[:200] if 'response' in locals() else ""
                except Exception:
                    pass
                logger.warning("embedding_key_failed", key_suffix=api_key[-4:], error=str(e), body=body)
                continue

        span.set_attribute("embedding.outcome", "all_keys_failed")

    raise HTTPException(
        status_code=502,
        detail=f"Embedding generation failed for all keys. Last error: {last_error}",
    )


def get_embedding(text: str) -> list[float]:
    """Document-side embedding — use when storing chunks."""
    return _embed(text, task_type="RETRIEVAL_DOCUMENT")


def get_query_embedding(text: str) -> list[float]:
    """Query-side embedding — use at search/retrieval time."""
    return _embed(text[:2000], task_type="RETRIEVAL_QUERY")