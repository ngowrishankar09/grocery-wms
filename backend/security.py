from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from database import get_db
from models import User

import os as _os
SECRET_KEY = _os.environ.get("SECRET_KEY", "wms-secret-key-change-in-production-2026")
ALGORITHM  = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 8

pwd_context    = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")
oauth2_scheme  = OAuth2PasswordBearer(tokenUrl="/auth/token", auto_error=False)

# ── Passwords ────────────────────────────────────────────────

def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)

# ── JWT ──────────────────────────────────────────────────────

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def decode_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        return None

# ── Current user dependency ───────────────────────────────────

def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
) -> User:
    credentials_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Not authenticated",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if not token:
        raise credentials_exc
    payload = decode_token(token)
    if not payload:
        raise credentials_exc
    username: str = payload.get("sub")
    if not username:
        raise credentials_exc
    user = db.query(User).filter(User.username == username, User.is_active == True).first()
    if not user:
        raise credentials_exc
    return user

def get_current_user_optional(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
) -> Optional[User]:
    """Returns None instead of raising 401 — used for soft-protected endpoints."""
    if not token:
        return None
    payload = decode_token(token)
    if not payload:
        return None
    username = payload.get("sub")
    if not username:
        return None
    return db.query(User).filter(User.username == username, User.is_active == True).first()

def require_role(*roles):
    """Factory: dependency that requires current user to have one of the specified roles."""
    def _check(user: User = Depends(get_current_user)):
        if user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Role '{user.role}' does not have access. Required: {list(roles)}"
            )
        return user
    return _check

def get_company_id(current_user: User = Depends(get_current_user)) -> int:
    if current_user.role == "superadmin":
        raise HTTPException(status_code=403, detail="Use superadmin endpoints")
    if not current_user.company_id:
        raise HTTPException(status_code=400, detail="User has no company")
    return current_user.company_id

def require_superadmin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != "superadmin":
        raise HTTPException(status_code=403, detail="Superadmin only")
    return current_user
