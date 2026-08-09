from fastapi import Depends, HTTPException, Request
from fastapi.security import OAuth2PasswordBearer
from jose import jwt, JWTError
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.user import User
import os
import json
from dotenv import load_dotenv
from app.core.cache import redis_client
from app.core.logging_config import get_logger

logger = get_logger(__name__)

load_dotenv()

SECRET_KEY = os.getenv("SECRET_KEY")
ALGORITHM = os.getenv("ALGORITHM")

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="login")


def get_current_user(
    request: Request,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("id")

        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid token")
        
        request.state.user_id = user_id

    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

    cached_user = None
    if redis_client:
        try:
            cached_data = redis_client.get(f"user:{user_id}")
            if cached_data:
                cached_user = json.loads(cached_data)
        except Exception as e:
            logger.warning("user_cache_read_failed", error=str(e))

    if cached_user:
        user = User(
            id=cached_user["id"],
            name=cached_user["name"],
            email=cached_user["email"],
            is_verified=cached_user["is_verified"]
        )
    else:
        user = db.query(User).filter(User.id == user_id).first()
        if user and redis_client:
            try:
                redis_client.setex(
                    f"user:{user_id}",
                    30,
                    json.dumps({
                        "id": user.id,
                        "name": user.name,
                        "email": user.email,
                        "is_verified": user.is_verified
                    })
                )
            except Exception as e:
                logger.warning("user_cache_write_failed", error=str(e))

    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    return user


def get_verified_user(
    current_user: User = Depends(get_current_user)
):
    if not current_user.is_verified:
        raise HTTPException(status_code=403, detail="Email not verified")
    return current_user