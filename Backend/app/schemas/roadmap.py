from pydantic import BaseModel

class RoadMapCreate(BaseModel):
    title: str
    description: str
    duration_days: int
    content: str

class RoadMapResponse(BaseModel):
    id: int
    title: str
    description: str
    duration_days: int
    content: str

    class Config:
        from_attributes = True

