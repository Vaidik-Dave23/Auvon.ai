from pydantic import BaseModel, EmailStr
from datetime import datetime
from typing import Union, Optional, Any


class UserCreate(BaseModel):
    name: str
    email: EmailStr
    password: str


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: Union[int, str]
    name: str
    email: EmailStr
    created_at: Optional[Union[datetime, str]] = None
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


class GoogleAuthRequest(BaseModel):
    credential: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    email: EmailStr
    pin: str
    new_password: str


class RefreshRequest(BaseModel):
    refresh_token: Optional[str] = None
