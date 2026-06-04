import os
import requests
from fastapi import HTTPException
import logging

logger = logging.getLogger(__name__)

def get_embedding(text: str) -> list[float]:
    """
    Generates semantic embedding vector for a given text using
    text-embedding-3-small via aipipe.org API.
    """
    api_key = os.getenv("AIPIPE_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="AIPIPE_API_KEY is not set in environment")

    url = "https://aipipe.org/openai/v1/embeddings"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    data = {
        "model": "text-embedding-3-small",
        "input": text
    }

    try:
        response = requests.post(url, headers=headers, json=data, timeout=20)
        response.raise_for_status()
        resp_data = response.json()
        return resp_data["data"][0]["embedding"]
    except Exception as e:
        logger.error(f"Failed to generate embedding: {e}")
        raise HTTPException(
            status_code=502,
            detail=f"Failed to generate semantic embedding from AI service: {e}"
        )
