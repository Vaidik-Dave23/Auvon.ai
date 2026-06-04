from pydantic import BaseModel, EmailStr
from datetime import datetime


class UserCreate(BaseModel):
    name: str
    email: EmailStr
    password: str


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: int
    name: str
    email: EmailStr
    created_at: datetime
    is_verified: bool

    class Config:
        from_attributes = True   

class UserUpdate(BaseModel):
    name: str
    email: EmailStr

class Token(BaseModel):
    access_token: str
    token_type: str

class VerifyEmailRequest(BaseModel):
    code: str