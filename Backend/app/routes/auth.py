from fastapi import APIRouter, HTTPException , Depends
from app.schemas.user import UserCreate, UserLogin, UserOut, UserUpdate
from app.utils.token import hash_password, verify_password, create_access_token
from app.database import get_db
from sqlalchemy.orm import Session
from app.models.user import User
from app.utils.dependencies import get_current_user


router = APIRouter()

@router.post("/register")
def register(user: UserCreate, db: Session = Depends(get_db)):
    db_user = db.query(User).filter(User.email == user.email).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    hashed_password = hash_password(user.password)
    new_user = User(name=user.name, email=user.email, password=hashed_password)
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    access_token = create_access_token(data={"sub": new_user.email, "id": new_user.id})
    return {"access_token": access_token, "token_type": "bearer", "message": "User registered successfully"}


@router.post("/login")
def login(user: UserLogin, db: Session = Depends(get_db)):
    db_user = db.query(User).filter(User.email == user.email).first()
    if not db_user or not verify_password(user.password, db_user.password):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    access_token = create_access_token(data={"sub": db_user.email,"id": db_user.id})
    return {"access_token": access_token, "token_type": "bearer"}

@router.get("/me")
def get_me(current_user = Depends(get_current_user)):
    return current_user


@router.put("/me", response_model=UserOut)
def update_profile(user_update: UserUpdate, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
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


