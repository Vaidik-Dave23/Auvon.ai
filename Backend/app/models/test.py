from datetime import datetime


class Question:
    def __init__(self, **kwargs):
        self._id = kwargs.get("_id")
        self.id = str(kwargs.get("id") or self._id or "")
        self.test_id = str(kwargs.get("test_id", ""))
        self.question_text = kwargs.get("question_text", "")
        self.options = kwargs.get("options") or []
        self.correct_answer = kwargs.get("correct_answer", "")

    def to_dict(self):
        d = {
            "test_id": self.test_id,
            "question_text": self.question_text,
            "options": self.options,
            "correct_answer": self.correct_answer,
        }
        if self._id:
            d["_id"] = self._id
        if self.id:
            d["id"] = self.id
        return d


class Test:
    def __init__(self, **kwargs):
        self._id = kwargs.get("_id")
        self.id = str(kwargs.get("id") or self._id or "")
        self.user_id = str(kwargs.get("user_id", ""))
        self.topic = kwargs.get("topic", "")
        self.difficulty = kwargs.get("difficulty", "easy")
        self.created_at = kwargs.get("created_at") or datetime.utcnow().isoformat()
        self.questions = kwargs.get("questions") or []

    def to_dict(self):
        d = {
            "user_id": self.user_id,
            "topic": self.topic,
            "difficulty": self.difficulty,
            "created_at": self.created_at,
            "questions": [q.to_dict() if hasattr(q, "to_dict") else q for q in self.questions],
        }
        if self._id:
            d["_id"] = self._id
        if self.id:
            d["id"] = self.id
        return d
