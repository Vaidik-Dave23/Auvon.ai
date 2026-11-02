from datetime import datetime
from typing import List, Optional


class Step:
    def __init__(self, **kwargs):
        self._id = kwargs.get("_id")
        self.id = str(kwargs.get("id") or self._id or "")
        self.goal_id = str(kwargs.get("goal_id", ""))
        self.description = kwargs.get("description", "")
        self.is_completed = int(kwargs.get("is_completed", 0))
        self.week = int(kwargs.get("week", 1))
        self.videos = kwargs.get("videos") or []

    def to_dict(self):
        d = {
            "goal_id": self.goal_id,
            "description": self.description,
            "is_completed": self.is_completed,
            "week": self.week,
            "videos": self.videos,
        }
        if self._id:
            d["_id"] = self._id
        if self.id:
            d["id"] = self.id
        return d


class Goal:
    def __init__(self, **kwargs):
        self._id = kwargs.get("_id")
        self.id = str(kwargs.get("id") or self._id or "")
        self.user_id = str(kwargs.get("user_id", ""))
        self.title = kwargs.get("title", "")
        self.created_at = kwargs.get("created_at") or datetime.utcnow().isoformat()
        self.steps = kwargs.get("steps") or []

    def to_dict(self):
        d = {
            "user_id": self.user_id,
            "title": self.title,
            "created_at": self.created_at,
            "steps": [s.to_dict() if hasattr(s, "to_dict") else s for s in self.steps],
        }
        if self._id:
            d["_id"] = self._id
        if self.id:
            d["id"] = self.id
        return d
