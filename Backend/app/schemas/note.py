from pydantic import BaseModel
from typing import Union, Optional


class NoteCreate(BaseModel):
    topic: str


class NoteResponse(BaseModel):
    id: Union[int, str]
    title: str
    content: str
    topic: Optional[str] = None
    created_at: Optional[str] = None

    class Config:
        from_attributes = True
