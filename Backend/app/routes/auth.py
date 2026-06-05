from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from app.schemas.user import UserCreate, UserLogin, UserOut, UserUpdate, VerifyEmailRequest
from app.utils.token import hash_password, verify_password, create_access_token
from app.database import get_db
from sqlalchemy.orm import Session
from app.models.user import User
from app.utils.dependencies import get_current_user, get_verified_user
from app.utils.mail import generate_otp, send_verification_email
from datetime import datetime, timedelta

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



