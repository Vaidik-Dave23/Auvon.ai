from datetime import datetime


class Notes:
    def __init__(self, **kwargs):
        self._id = kwargs.get("_id")
        self.id = str(kwargs.get("id") or self._id or "")
        self.title = kwargs.get("title", "")
        self.content = kwargs.get("content", "")
        self.source = kwargs.get("source", "keyword")
        self.hash_key = kwargs.get("hash_key", "")
        self.created_at = kwargs.get("created_at") or datetime.utcnow().isoformat()

    def to_dict(self):
        d = {
            "title": self.title,
            "content": self.content,
            "source": self.source,
            "hash_key": self.hash_key,
            "created_at": self.created_at,
        }
        if self._id:
            d["_id"] = self._id
        if self.id:
            d["id"] = self.id
        return d


class UserNotes:
    def __init__(self, **kwargs):
        self._id = kwargs.get("_id")
        self.id = str(kwargs.get("id") or self._id or "")
        self.user_id = str(kwargs.get("user_id", ""))
        self.note_id = str(kwargs.get("note_id", ""))

    def to_dict(self):
        d = {
            "user_id": self.user_id,
            "note_id": self.note_id,
        }
        if self._id:
            d["_id"] = self._id
        if self.id:
            d["id"] = self.id
        return d
