from passlib.context import CryptContext
from jose import jwt
from datetime import datetime, timedelta
import os
from dotenv import load_dotenv

load_dotenv()

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# JWT config
SECRET_KEY = os.getenv("SECRET_KEY")
ALGORITHM = os.getenv("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = 60
REFRESH_TOKEN_EXPIRE_DAYS = 30

def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)

def create_access_token(data: dict) -> str:
    payload = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    payload.update({"exp": expire, "type": "access"})
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def create_refresh_token(email: str, user_id: str, version: int = 0) -> str:
    """Long-lived token that can only be swapped for new tokens at /auth/refresh.
    `ver` must match the user's token_version, so bumping it (e.g. on password reset)
    signs the user out everywhere."""
    payload = {
        "sub": email,
        "id": str(user_id),
        "type": "refresh",
        "ver": int(version or 0),
        "exp": datetime.utcnow() + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def issue_tokens(email: str, user_id: str, version: int = 0) -> dict:
    return {
        "access_token": create_access_token({"sub": email, "id": str(user_id)}),
        "refresh_token": create_refresh_token(email, user_id, version),
        "token_type": "bearer",
    }
