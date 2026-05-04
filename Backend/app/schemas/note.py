from pydantic import BaseModel

class NoteCreate(BaseModel):
    topic: str

class NoteResponse(BaseModel):
    id: int
    title: str
    content: str
    topic: str

    class Config:
        from_attributes = True   