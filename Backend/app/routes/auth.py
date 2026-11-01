from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from app.schemas.user import UserCreate, UserLogin, UserOut, UserUpdate, VerifyEmailRequest, GoogleAuthRequest
from app.utils.token import hash_password, verify_password, create_access_token
from app.database import get_db
from sqlalchemy.orm import Session
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
def register(user: UserCreate, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    # NOTE:
    # Email verification is temporarily disabled in the public deployment.
    # The verification system remains implemented and can be re-enabled
    # once a verified sending domain is configured with Resend.

    db_user = db.query(User).filter(User.email == user.email).first()
    
    if db_user:
        raise HTTPException(
            status_code=400,
            detail="Email already registered"
        )
        
    hashed_password = hash_password(user.password)
    
    # EMAIL VERIFICATION TEMPORARILY DISABLED
    # Re-enable when Resend domain verification is configured
    new_user = User(
        name=user.name,
        email=user.email,
        password=hashed_password,
        is_verified=True,
        verification_code=None,
        verification_code_expires_at=None
    )
    
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    # EMAIL VERIFICATION TEMPORARILY DISABLED
    # send_verification_email(
    #     background_tasks,
    #     new_user.email,
    #     new_user.name,
    #     otp_code
    # )
    
    access_token = create_access_token(data={"sub": new_user.email, "id": new_user.id})
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "is_verified": True,
        "message": "User registered successfully."
    }

@router.post("/login")
def login(user: UserLogin, db: Session = Depends(get_db)):
    db_user = db.query(User).filter(User.email == user.email).first()
    if not db_user or not verify_password(user.password, db_user.password):
        raise HTTPException(status_code=401, detail="Invalid email or password")
        
    access_token = create_access_token(data={"sub": db_user.email, "id": db_user.id})
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "is_verified": db_user.is_verified
    }

@router.get("/me", response_model=UserOut)
def get_me(current_user = Depends(get_current_user)):
    return current_user

@router.put("/me", response_model=UserOut)
def update_profile(user_update: UserUpdate, db: Session = Depends(get_db), current_user = Depends(get_verified_user)):
    # Check if email is already taken by another user
    if user_update.email != current_user.email:
        existing_user = db.query(User).filter(User.email == user_update.email).first()
        if existing_user:
            raise HTTPException(status_code=400, detail="Email already in use")
    
    # Update user fields
    current_user.name = user_update.name
    current_user.email = user_update.email
    
    db.commit()
    db.refresh(current_user)
    
    return current_user

@router.post("/verify-email")
def verify_email(
    request: VerifyEmailRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.is_verified:
        return {"message": "Email is already verified"}
    
    if not current_user.verification_code or current_user.verification_code != request.code:
        raise HTTPException(status_code=400, detail="Invalid verification code")
        
    if current_user.verification_code_expires_at < datetime.utcnow():
        raise HTTPException(status_code=400, detail="Verification code has expired")
        
    current_user.is_verified = True
    current_user.verification_code = None
    current_user.verification_code_expires_at = None
    db.commit()
    return {"message": "Email verified successfully"}

@router.post("/resend-verification")
def resend_verification(
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.is_verified:
        return {"message": "Email is already verified"}
        
    otp_code = generate_otp()
    otp_expiry = datetime.utcnow() + timedelta(minutes=15)
    
    current_user.verification_code = otp_code
    current_user.verification_code_expires_at = otp_expiry
    db.commit()
    
    send_verification_email(background_tasks, current_user.email, current_user.name, otp_code)
    return {"message": "Verification code resent successfully"}


def _handle_google_auth(payload: GoogleAuthRequest, db: Session):
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

    email = id_info.get("email")
    if not email:
        raise HTTPException(status_code=400, detail="Google token does not contain an email address")

    name = id_info.get("name") or id_info.get("given_name") or email.split("@")[0]

    db_user = db.query(User).filter(User.email == email).first()
    if not db_user:
        random_password = hash_password(secrets.token_urlsafe(32))
        db_user = User(
            name=name,
            email=email,
            password=random_password,
            is_verified=True,
            created_at=datetime.utcnow(),
            verification_code=None,
            verification_code_expires_at=None
        )
        db.add(db_user)
        db.commit()
        db.refresh(db_user)
    else:
        if not db_user.is_verified:
            db_user.is_verified = True
            db.commit()
            db.refresh(db_user)

    access_token = create_access_token(data={"sub": db_user.email, "id": db_user.id})
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "is_verified": db_user.is_verified,
        "user": {
            "id": db_user.id,
            "name": db_user.name,
            "email": db_user.email,
            "picture": id_info.get("picture")
        }
    }


@router.post("/auth/google")
def google_auth(payload: GoogleAuthRequest, db: Session = Depends(get_db)):
    """
    Authenticate or register a user via Google OAuth 2.0 ID Token.
    Validates token cryptographically and links or auto-provisions user.
    """
    return _handle_google_auth(payload, db)


@router.post("/login/google")
def google_login_alias(payload: GoogleAuthRequest, db: Session = Depends(get_db)):
    """
    Alias for /auth/google to support flexible frontend routing.
    """
    return _handle_google_auth(payload, db)


@router.post("/auth/refresh")
@router.post("/refresh")
def refresh_access_token(current_user: User = Depends(get_current_user)):
    """
    Issue a new JWT access token for persistent sessions.
    """
    access_token = create_access_token(data={"sub": current_user.email, "id": current_user.id})
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "is_verified": current_user.is_verified
    }




