from pydantic import BaseModel
from typing import Union, Optional


class RoadMapCreate(BaseModel):
    title: str
    description: str
    duration_days: int
    content: str


class RoadMapResponse(BaseModel):
    id: Union[int, str]
    title: str
    description: str
    duration_days: int
    content: str

    class Config:
        from_attributes = True
