from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import User
from app.schemas.auth import AuthResponse, Credentials
from app.security import create_access_token, hash_password, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])


def _auth_response(user: User) -> AuthResponse:
    token, expires_in = create_access_token(user.id)
    return AuthResponse(access_token=token, expires_in=expires_in, username=user.username)


@router.post("/login", response_model=AuthResponse)
def login(body: Credentials, db: Session = Depends(get_db)) -> AuthResponse:
    user = db.scalars(select(User).where(User.username == body.username)).first()
    if user is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid username or password"
        )
    return _auth_response(user)


@router.post("/signup", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
def signup(body: Credentials, db: Session = Depends(get_db)) -> AuthResponse:
    taken = HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Username already taken")
    if db.scalars(select(User).where(User.username == body.username)).first() is not None:
        raise taken
    user = User(username=body.username, password_hash=hash_password(body.password))
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise taken from None
    db.refresh(user)
    return _auth_response(user)
