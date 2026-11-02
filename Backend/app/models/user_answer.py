class UserAnswer:
    def __init__(self, **kwargs):
        self._id = kwargs.get("_id")
        self.id = str(kwargs.get("id") or self._id or "")
        self.user_id = str(kwargs.get("user_id", ""))
        self.test_id = str(kwargs.get("test_id", ""))
        self.question_id = str(kwargs.get("question_id", ""))
        self.question_text = kwargs.get("question_text", "")
        self.selected_answer = kwargs.get("selected_answer")
        self.correct_answer = kwargs.get("correct_answer", "")
        self.is_correct = bool(kwargs.get("is_correct", False))

    def to_dict(self):
        d = {
            "user_id": self.user_id,
            "test_id": self.test_id,
            "question_id": self.question_id,
            "question_text": self.question_text,
            "selected_answer": self.selected_answer,
            "correct_answer": self.correct_answer,
            "is_correct": self.is_correct,
        }
        if self._id:
            d["_id"] = self._id
        if self.id:
            d["id"] = self.id
        return d
