from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from app.schemas.user import UserCreate, UserLogin, UserOut, UserUpdate, VerifyEmailRequest, GoogleAuthRequest
from app.utils.token import hash_password, verify_password, create_access_token
from app.database import get_db, users_col, id_filter, serialize_doc
from app.models.user import User
from app.utils.dependencies import get_current_user, get_verified_user
from app.utils.mail import generate_otp, send_verification_email
from datetime import datetime, timedelta
import os
import secrets
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests

router = APIRouter()


@router.post("/register")
def register(user: UserCreate, background_tasks: BackgroundTasks, db = Depends(get_db)):
    db_user = users_col.find_one({"email": user.email})
    if db_user:
        raise HTTPException(
            status_code=400,
            detail="Email already registered"
        )

    hashed_password = hash_password(user.password)

    new_user_doc = {
        "name": user.name,
        "email": user.email,
        "password": hashed_password,
        "is_verified": True,
        "created_at": datetime.utcnow(),
        "verification_code": None,
        "verification_code_expires_at": None,
    }

    inserted = users_col.insert_one(new_user_doc)
    user_id_str = str(inserted.inserted_id)
    users_col.update_one({"_id": inserted.inserted_id}, {"$set": {"id": user_id_str}})

    access_token = create_access_token(data={"sub": user.email, "id": user_id_str})
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "is_verified": True,
        "message": "User registered successfully."
    }


@router.post("/login")
def login(user: UserLogin, db = Depends(get_db)):
    db_user = users_col.find_one({"email": user.email})
    if not db_user or not verify_password(user.password, db_user.get("password", "")):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    user_id_str = str(db_user.get("_id") or db_user.get("id"))
    access_token = create_access_token(data={"sub": db_user["email"], "id": user_id_str})
    return {
        "access_token": access_token,
        "token_type": "bearer",
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
def update_profile(user_update: UserUpdate, db = Depends(get_db), current_user = Depends(get_verified_user)):
    if user_update.email != current_user.email:
        existing = users_col.find_one({"email": user_update.email})
        if existing:
            raise HTTPException(status_code=400, detail="Email already in use")

    update_fields = {
        "name": user_update.name,
        "email": user_update.email,
    }

    users_col.update_one(id_filter(current_user.id), {"$set": update_fields})
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
def verify_email(
    request: VerifyEmailRequest,
    db = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.is_verified:
        return {"message": "Email is already verified"}

    if not current_user.verification_code or current_user.verification_code != request.code:
        raise HTTPException(status_code=400, detail="Invalid verification code")

    if current_user.verification_code_expires_at and current_user.verification_code_expires_at < datetime.utcnow():
        raise HTTPException(status_code=400, detail="Verification code has expired")

    users_col.update_one(
        id_filter(current_user.id),
        {"$set": {
            "is_verified": True,
            "verification_code": None,
            "verification_code_expires_at": None
        }}
    )
    return {"message": "Email verified successfully"}


@router.post("/resend-verification")
def resend_verification(
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


def _handle_google_auth(payload: GoogleAuthRequest, db):
    if not payload.credential or not payload.credential.strip():
        raise HTTPException(status_code=400, detail="Missing Google authentication credential")

    google_client_id = os.getenv("GOOGLE_CLIENT_ID")
    try:
        id_info = id_token.verify_oauth2_token(
            payload.credential.strip(),
            google_requests.Request(),
            audience=google_client_id if google_client_id else None
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

    import re
    db_user = users_col.find_one({"email": re.compile(f"^{re.escape(email)}$", re.IGNORECASE)})
    if not db_user:
        random_password = hash_password(secrets.token_urlsafe(32))
        new_user = {
            "name": name,
            "email": email,
            "password": random_password,
            "is_verified": True,
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
        update_fields = {"is_verified": True}
        if not db_user.get("id"):
            update_fields["id"] = user_id_str
            db_user["id"] = user_id_str
        users_col.update_one({"_id": db_user["_id"]}, {"$set": update_fields})
        db_user["is_verified"] = True

    access_token = create_access_token(data={"sub": db_user.get("email", email), "id": user_id_str})
    return {
        "access_token": access_token,
        "token_type": "bearer",
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
def refresh_access_token(current_user: User = Depends(get_current_user)):
    access_token = create_access_token(data={"sub": current_user.email, "id": current_user.id})
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "is_verified": current_user.is_verified
    }
