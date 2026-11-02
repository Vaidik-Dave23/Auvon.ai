class Progress:
    def __init__(self, **kwargs):
        self._id = kwargs.get("_id")
        self.id = str(kwargs.get("id") or self._id or "")
        self.user_id = str(kwargs.get("user_id", ""))
        self.goal_id = str(kwargs.get("goal_id", ""))
        self.progress_percentage = int(kwargs.get("progress_percentage", 0))

    def to_dict(self):
        d = {
            "user_id": self.user_id,
            "goal_id": self.goal_id,
            "progress_percentage": self.progress_percentage,
        }
        if self._id:
            d["_id"] = self._id
        if self.id:
            d["id"] = self.id
        return d
