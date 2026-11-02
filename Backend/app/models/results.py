from typing import Optional


class Test_Result:
    def __init__(self, **kwargs):
        self._id = kwargs.get("_id")
        self.id = str(kwargs.get("id") or self._id or "")
        self.user_id = str(kwargs.get("user_id", ""))
        self.test_id = str(kwargs.get("test_id", ""))
        self.best_score = int(kwargs.get("best_score", 0))
        self.last_score = int(kwargs.get("last_score", 0))
        self.last_feedback = kwargs.get("last_feedback")

    def to_dict(self):
        d = {
            "user_id": self.user_id,
            "test_id": self.test_id,
            "best_score": self.best_score,
            "last_score": self.last_score,
            "last_feedback": self.last_feedback,
        }
        if self._id:
            d["_id"] = self._id
        if self.id:
            d["id"] = self.id
        return d
