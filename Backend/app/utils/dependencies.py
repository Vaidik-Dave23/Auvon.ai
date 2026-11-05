from fastapi import Depends, HTTPException, Request
from fastapi.security import OAuth2PasswordBearer
from jose import jwt, JWTError
from app.database import get_db, users_col, id_filter, serialize_doc
from app.models.user import User
import os
import json
from dotenv import load_dotenv
from app.core.cache import redis_client
from app.core.logging_config import get_logger

logger = get_logger(__name__)

load_dotenv()

SECRET_KEY = os.getenv("SECRET_KEY")  # never hardcode a fallback: a known secret lets anyone forge tokens
ALGORITHM = os.getenv("ALGORITHM", "HS256")

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="login")


def get_current_user(
    request: Request,
    token: str = Depends(oauth2_scheme),
    db = Depends(get_db)
):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("id")

        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid token")

        request.state.user_id = str(user_id)

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
        user = User(**cached_user)
    else:
        user_doc = users_col.find_one(id_filter(user_id))
        if not user_doc and payload.get("sub"):
            user_email = str(payload.get("sub")).strip()
            user_doc = users_col.find_one({"email": user_email})
            if not user_doc:
                import re
                user_doc = users_col.find_one({"email": re.compile(f"^{re.escape(user_email)}$", re.IGNORECASE)})
            if user_doc:
                doc_id_str = str(user_doc.get("_id"))
                if not user_doc.get("id"):
                    users_col.update_one({"_id": user_doc["_id"]}, {"$set": {"id": doc_id_str}})
                    user_doc["id"] = doc_id_str

        if user_doc:
            user_doc = serialize_doc(user_doc)
            user = User(**user_doc)
            if redis_client:
                try:
                    redis_client.setex(
                        f"user:{user.id}",
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
        else:
            user = None

    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    return user


def get_verified_user(
    current_user: User = Depends(get_current_user)
):
    if not current_user.is_verified:
        raise HTTPException(status_code=403, detail="Email not verified")
    return current_user
