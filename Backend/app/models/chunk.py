from datetime import datetime
from typing import List, Optional


class DocumentChunk:
    def __init__(self, **kwargs):
        self._id = kwargs.get("_id")
        self.id = str(kwargs.get("id") or self._id or "")
        self.note_id = str(kwargs.get("note_id", ""))
        self.chunk_text = kwargs.get("chunk_text", "")
        self.embedding = kwargs.get("embedding") or []
        self.embedding_vec = kwargs.get("embedding_vec") or self.embedding
        self.created_at = kwargs.get("created_at") or datetime.utcnow()

    def to_dict(self):
        d = {
            "note_id": self.note_id,
            "chunk_text": self.chunk_text,
            "embedding": self.embedding,
            "created_at": self.created_at,
        }
        if self._id:
            d["_id"] = self._id
        if self.id:
            d["id"] = self.id
        return d
