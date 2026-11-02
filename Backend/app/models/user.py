from datetime import datetime
from typing import Optional, Union, Any


class User:
    def __init__(self, **kwargs):
        self._id = kwargs.get("_id")
        self.id = str(kwargs.get("id") or self._id or "")
        self.name = kwargs.get("name", "")
        self.email = kwargs.get("email", "")
        self.password = kwargs.get("password", "")
        self.created_at = kwargs.get("created_at") or datetime.utcnow()
        self.is_verified = kwargs.get("is_verified", False)
        self.verification_code = kwargs.get("verification_code")
        self.verification_code_expires_at = kwargs.get("verification_code_expires_at")

    def to_dict(self):
        d = {
            "name": self.name,
            "email": self.email,
            "password": self.password,
            "created_at": self.created_at,
            "is_verified": self.is_verified,
            "verification_code": self.verification_code,
            "verification_code_expires_at": self.verification_code_expires_at,
        }
        if self._id:
            d["_id"] = self._id
        if self.id:
            d["id"] = self.id
        return d
