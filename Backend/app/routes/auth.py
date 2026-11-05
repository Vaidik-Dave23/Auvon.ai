from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks, Request
from app.schemas.user import (
    UserCreate, UserLogin, UserOut, UserUpdate, VerifyEmailRequest, GoogleAuthRequest,
    ForgotPasswordRequest, ResetPasswordRequest, RefreshRequest,
)
from app.utils.token import hash_password, verify_password, issue_tokens, SECRET_KEY, ALGORITHM
from jose import jwt, JWTError
from app.database import get_db, users_col, id_filter, serialize_doc
from app.models.user import User
from app.utils.dependencies import get_current_user, get_verified_user
from typing import Optional
from app.utils.mail import generate_otp, send_verification_email, send_password_reset_email, email_configured
from datetime import datetime, timedelta
import os
import secrets
import hashlib
import hmac
import re
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests
from app.core.limiter import limiter
from app.core.cache import redis_client

router = APIRouter()


MIN_PASSWORD_LENGTH = 8
RESET_PIN_MINUTES = 15
RESET_MAX_ATTEMPTS = 5


def _verification_required() -> bool:
    """Email verification is ON by default (REQUIRE_EMAIL_VERIFICATION=false turns it off).
    It is skipped only when no real email provider (SMTP / Resend) is configured,
    because then codes would never arrive and every new user would be stuck."""
    wanted = os.getenv("REQUIRE_EMAIL_VERIFICATION", "true").lower() in ("1", "true", "yes")
    return wanted and email_configured()


def _drop_user_cache(user_id) -> None:
    """get_current_user caches the user for 30s; clear it after changing verification state."""
    if redis_client:
        try:
            redis_client.delete(f"user:{user_id}")
        except Exception:
            pass


def _pin_hash(user_id: str, pin: str) -> str:
    # Store only a hash of the reset PIN, salted with the user id and server secret.
    secret = os.getenv("SECRET_KEY") or ""
    return hashlib.sha256(f"{secret}:{user_id}:{pin}".encode()).hexdigest()


def _find_user_by_email(email: str):
    return users_col.find_one({"email": re.compile(f"^{re.escape(email.strip())}$", re.IGNORECASE)})


def _start_verification(background_tasks: BackgroundTasks, user_filter: dict, email: str, name: str) -> None:
    otp_code = generate_otp()
    users_col.update_one(user_filter, {"$set": {
        "is_verified": False,
        "verification_code": otp_code,
        "verification_code_expires_at": datetime.utcnow() + timedelta(minutes=15),
    }})
    send_verification_email(background_tasks, email, name, otp_code)


@router.post("/register")
@limiter.limit("5/minute")
def register(request: Request, user: UserCreate, background_tasks: BackgroundTasks, db = Depends(get_db)):
    db_user = users_col.find_one({"email": user.email})
    if db_user:
        raise HTTPException(
            status_code=400,
            detail="Email already registered"
        )
    if len(user.password) < MIN_PASSWORD_LENGTH:
        raise HTTPException(status_code=400, detail=f"Password must be at least {MIN_PASSWORD_LENGTH} characters")

    hashed_password = hash_password(user.password)

    new_user_doc = {
        "name": user.name,
        "email": user.email,
        "password": hashed_password,
        "is_verified": True,
        # Nobody has proven they own this inbox yet. Google sign-in on this email later
        # resets the password (see _handle_google_auth), so a squatter can't keep access.
        "email_confirmed": False,
        "created_at": datetime.utcnow(),
        "verification_code": None,
        "verification_code_expires_at": None,
    }

    inserted = users_col.insert_one(new_user_doc)
    user_id_str = str(inserted.inserted_id)
    users_col.update_one({"_id": inserted.inserted_id}, {"$set": {"id": user_id_str}})

    is_verified = True
    if _verification_required():
        _start_verification(background_tasks, {"_id": inserted.inserted_id}, user.email, user.name)
        is_verified = False

    return {
        **issue_tokens(user.email, user_id_str),
        "is_verified": is_verified,
        "message": "User registered successfully." if is_verified else "Check your email for a verification code."
    }


@router.post("/login")
@limiter.limit("10/minute")
def login(request: Request, user: UserLogin, db = Depends(get_db)):
    db_user = users_col.find_one({"email": user.email})
    if not db_user or not verify_password(user.password, db_user.get("password", "")):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    user_id_str = str(db_user.get("_id") or db_user.get("id"))
    return {
        **issue_tokens(db_user["email"], user_id_str, db_user.get("token_version", 0)),
        "is_verified": db_user.get("is_verified", False)
    }


@router.get("/me", response_model=UserOut)
def get_me(current_user = Depends(get_current_user)):
    return {
        "id": current_user.id,
        "name": current_user.name,
        "email": current_user.email,
        "created_at": current_user.created_at,
        "is_verified": current_user.is_verified,
    }


@router.put("/me", response_model=UserOut)
def update_profile(user_update: UserUpdate, background_tasks: BackgroundTasks, db = Depends(get_db), current_user = Depends(get_verified_user)):
    email_changed = user_update.email.lower() != (current_user.email or "").lower()
    if email_changed:
        existing = users_col.find_one({"email": user_update.email})
        if existing:
            raise HTTPException(status_code=400, detail="Email already in use")

    update_fields = {
        "name": user_update.name,
        "email": user_update.email,
    }
    if email_changed:
        update_fields["email_confirmed"] = False

    users_col.update_one(id_filter(current_user.id), {"$set": update_fields})
    if email_changed and _verification_required():
        _start_verification(background_tasks, id_filter(current_user.id), user_update.email, user_update.name)
        current_user.is_verified = False
    _drop_user_cache(current_user.id)
    current_user.name = user_update.name
    current_user.email = user_update.email

    return {
        "id": current_user.id,
        "name": current_user.name,
        "email": current_user.email,
        "created_at": current_user.created_at,
        "is_verified": current_user.is_verified,
    }


@router.post("/verify-email")
@limiter.limit("10/minute")
def verify_email(
    request: Request,            # slowapi needs the Starlette request under exactly this name
    body: VerifyEmailRequest,
    db = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Read the code from the database: the cached user (Redis) doesn't carry it.
    user_doc = users_col.find_one(id_filter(current_user.id)) or {}
    if user_doc.get("is_verified"):
        return {"message": "Email is already verified"}

    stored = user_doc.get("verification_code") or ""
    if not stored or not hmac.compare_digest(stored, (body.code or "").strip()):
        raise HTTPException(status_code=400, detail="Invalid verification code")

    expires = user_doc.get("verification_code_expires_at")
    if expires and expires < datetime.utcnow():
        raise HTTPException(status_code=400, detail="Verification code has expired")

    users_col.update_one(
        id_filter(current_user.id),
        {"$set": {
            "is_verified": True,
            "email_confirmed": True,
            "verification_code": None,
            "verification_code_expires_at": None
        }}
    )
    _drop_user_cache(current_user.id)
    return {"message": "Email verified successfully"}


@router.post("/resend-verification")
@limiter.limit("3/minute")
def resend_verification(
    request: Request,
    background_tasks: BackgroundTasks,
    db = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.is_verified:
        return {"message": "Email is already verified"}

    otp_code = generate_otp()
    otp_expiry = datetime.utcnow() + timedelta(minutes=15)

    users_col.update_one(
        id_filter(current_user.id),
        {"$set": {
            "verification_code": otp_code,
            "verification_code_expires_at": otp_expiry
        }}
    )

    send_verification_email(background_tasks, current_user.email, current_user.name, otp_code)
    return {"message": "Verification code resent successfully"}


@router.post("/auth/forgot-password")
@limiter.limit("3/minute")
def forgot_password(request: Request, body: ForgotPasswordRequest, background_tasks: BackgroundTasks, db = Depends(get_db)):
    """Email a 6-digit PIN for resetting the password.
    Always answers the same way, so nobody can use it to check which emails have accounts."""
    generic = {"message": "If an account exists for that email, a reset PIN has been sent."}
    user_doc = _find_user_by_email(body.email)
    if not user_doc:
        return generic

    pin = generate_otp()
    user_id = str(user_doc.get("_id"))
    users_col.update_one({"_id": user_doc["_id"]}, {"$set": {
        "reset_pin_hash": _pin_hash(user_id, pin),
        "reset_pin_expires_at": datetime.utcnow() + timedelta(minutes=RESET_PIN_MINUTES),
        "reset_attempts": 0,
    }})
    send_password_reset_email(background_tasks, user_doc["email"], user_doc.get("name") or "", pin)
    return generic


@router.post("/auth/reset-password")
@limiter.limit("10/minute")
def reset_password(request: Request, body: ResetPasswordRequest, db = Depends(get_db)):
    """Set a new password with the PIN from the reset email."""
    invalid = HTTPException(status_code=400, detail="Invalid or expired PIN")
    if len(body.new_password) < MIN_PASSWORD_LENGTH:
        raise HTTPException(status_code=400, detail=f"Password must be at least {MIN_PASSWORD_LENGTH} characters")

    user_doc = _find_user_by_email(body.email)
    if not user_doc or not user_doc.get("reset_pin_hash"):
        raise invalid
    expires = user_doc.get("reset_pin_expires_at")
    if not expires or expires < datetime.utcnow():
        raise invalid
    if int(user_doc.get("reset_attempts") or 0) >= RESET_MAX_ATTEMPTS:
        raise HTTPException(status_code=429, detail="Too many wrong attempts. Request a new PIN.")

    user_id = str(user_doc.get("_id"))
    if not hmac.compare_digest(user_doc["reset_pin_hash"], _pin_hash(user_id, (body.pin or "").strip())):
        users_col.update_one({"_id": user_doc["_id"]}, {"$inc": {"reset_attempts": 1}})
        raise invalid

    users_col.update_one({"_id": user_doc["_id"]}, {
        "$set": {
            "password": hash_password(body.new_password),
            # the PIN arrived in their inbox, so they own this email
            "email_confirmed": True,
            "is_verified": True,
            "verification_code": None,
            "verification_code_expires_at": None,
        },
        "$unset": {"reset_pin_hash": "", "reset_pin_expires_at": "", "reset_attempts": ""},
        "$inc": {"token_version": 1},   # signs out every existing session
    })
    _drop_user_cache(user_id)
    return {"message": "Password updated. You can sign in with your new password."}


def _handle_google_auth(payload: GoogleAuthRequest, db):
    if not payload.credential or not payload.credential.strip():
        raise HTTPException(status_code=400, detail="Missing Google authentication credential")

    google_client_id = os.getenv("GOOGLE_CLIENT_ID")
    if not google_client_id:
        # Without an audience check, a Google token issued to ANY app would be accepted.
        raise HTTPException(status_code=503, detail="Google sign-in is not configured")
    try:
        id_info = id_token.verify_oauth2_token(
            payload.credential.strip(),
            google_requests.Request(),
            audience=google_client_id
        )
    except ValueError as e:
        raise HTTPException(status_code=401, detail=f"Invalid Google token: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Google authentication failed: {str(e)}")

    issuer = id_info.get("iss", "")
    if issuer not in ["accounts.google.com", "https://accounts.google.com"]:
        raise HTTPException(status_code=401, detail=f"Invalid token issuer: {issuer}")

    if not id_info.get("email_verified", False):
        raise HTTPException(status_code=400, detail="Google account email is not verified")

    email = (id_info.get("email") or "").strip()
    if not email:
        raise HTTPException(status_code=400, detail="Google token does not contain an email address")

    name = id_info.get("name") or id_info.get("given_name") or email.split("@")[0]

    db_user = users_col.find_one({"email": re.compile(f"^{re.escape(email)}$", re.IGNORECASE)})
    if not db_user:
        random_password = hash_password(secrets.token_urlsafe(32))
        new_user = {
            "name": name,
            "email": email,
            "password": random_password,
            "is_verified": True,
            "email_confirmed": True,
            "created_at": datetime.utcnow(),
            "verification_code": None,
            "verification_code_expires_at": None
        }
        inserted = users_col.insert_one(new_user)
        user_id_str = str(inserted.inserted_id)
        users_col.update_one({"_id": inserted.inserted_id}, {"$set": {"id": user_id_str}})
        db_user = new_user
        db_user["_id"] = inserted.inserted_id
        db_user["id"] = user_id_str
    else:
        user_id_str = str(db_user.get("_id") or db_user.get("id"))
        update_fields = {"is_verified": True, "email_confirmed": True}
        if db_user.get("email_confirmed") is False:
            # This account was created with a password by someone who never proved they own
            # the inbox. Google just proved it, so the real owner is here: drop the old password
            # so whoever registered it first can't keep logging in.
            update_fields["password"] = hash_password(secrets.token_urlsafe(32))
            # and sign out every session the squatter had
            update_fields["token_version"] = int(db_user.get("token_version") or 0) + 1
            db_user["token_version"] = update_fields["token_version"]
        if not db_user.get("id"):
            update_fields["id"] = user_id_str
            db_user["id"] = user_id_str
        users_col.update_one({"_id": db_user["_id"]}, {"$set": update_fields})
        db_user["is_verified"] = True

    return {
        **issue_tokens(db_user.get("email", email), user_id_str, db_user.get("token_version", 0)),
        "is_verified": db_user.get("is_verified", True),
        "user": {
            "id": user_id_str,
            "name": db_user.get("name"),
            "email": db_user.get("email"),
            "picture": id_info.get("picture")
        }
    }


@router.post("/auth/google")
def google_auth(payload: GoogleAuthRequest, db = Depends(get_db)):
    return _handle_google_auth(payload, db)


@router.post("/login/google")
def google_login_alias(payload: GoogleAuthRequest, db = Depends(get_db)):
    return _handle_google_auth(payload, db)


@router.post("/auth/refresh")
@router.post("/refresh")
@limiter.limit("30/minute")
def refresh_access_token(request: Request, body: Optional[RefreshRequest] = None):
    """Swap a refresh token for a fresh access token + rotated refresh token.

    Older clients that only have an access token can still send it as a Bearer
    header while it's valid; they get a refresh token back and use that from then on.
    """
    invalid = HTTPException(status_code=401, detail="Session expired. Please sign in again.")
    token = (body.refresh_token if body else None) or ""
    expected_type = "refresh"
    if not token:
        auth_header = request.headers.get("authorization", "")
        if not auth_header.lower().startswith("bearer "):
            raise invalid
        token, expected_type = auth_header.split(" ", 1)[1], "access"

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        raise invalid
    token_type = payload.get("type") or "access"
    if token_type != expected_type or not payload.get("id"):
        raise invalid

    user_doc = users_col.find_one(id_filter(payload["id"]))
    if not user_doc:
        raise invalid
    version = int(user_doc.get("token_version") or 0)
    if token_type == "refresh" and int(payload.get("ver") or 0) != version:
        raise invalid   # password was reset / sessions revoked since this token was issued

    return {
        **issue_tokens(user_doc.get("email"), str(user_doc.get("_id") or user_doc.get("id")), version),
        "is_verified": bool(user_doc.get("is_verified")),
    }
