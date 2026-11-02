from datetime import datetime
from typing import Optional


class AILog:
    def __init__(self, **kwargs):
        self._id = kwargs.get("_id")
        self.id = str(kwargs.get("id") or self._id or "")
        self.endpoint = kwargs.get("endpoint", "")
        self.prompt = kwargs.get("prompt", "")
        self.response = kwargs.get("response", "")
        self.latency = float(kwargs.get("latency", 0.0))
        self.prompt_tokens = int(kwargs.get("prompt_tokens", 0))
        self.completion_tokens = int(kwargs.get("completion_tokens", 0))
        self.total_tokens = int(kwargs.get("total_tokens", 0))
        self.faithfulness = kwargs.get("faithfulness")
        self.relevance = kwargs.get("relevance")
        self.evaluation_feedback = kwargs.get("evaluation_feedback")
        self.created_at = kwargs.get("created_at") or datetime.utcnow()

    def to_dict(self):
        d = {
            "endpoint": self.endpoint,
            "prompt": self.prompt,
            "response": self.response,
            "latency": self.latency,
            "prompt_tokens": self.prompt_tokens,
            "completion_tokens": self.completion_tokens,
            "total_tokens": self.total_tokens,
            "faithfulness": self.faithfulness,
            "relevance": self.relevance,
            "evaluation_feedback": self.evaluation_feedback,
            "created_at": self.created_at,
        }
        if self._id:
            d["_id"] = self._id
        if self.id:
            d["id"] = self.id
        return d
