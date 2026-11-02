class Task:
    def __init__(self, **kwargs):
        self._id = kwargs.get("_id")
        self.id = str(kwargs.get("id") or self._id or "")
        self.title = kwargs.get("title", "")
        self.done = bool(kwargs.get("done", False))
        self.user_id = str(kwargs.get("user_id", ""))

    def to_dict(self):
        d = {
            "title": self.title,
            "done": self.done,
            "user_id": self.user_id,
        }
        if self._id:
            d["_id"] = self._id
        if self.id:
            d["id"] = self.id
        return d
