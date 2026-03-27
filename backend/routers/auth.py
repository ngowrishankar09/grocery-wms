from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from datetime import datetime
from pydantic import BaseModel
from typing import Optional

from database import get_db
from models import User, Company, CompanyProfile
from security import verify_password, hash_password, create_access_token, get_current_user

router = APIRouter(prefix="/auth", tags=["auth"])

# ── Schemas ──────────────────────────────────────────────────

class Token(BaseModel):
    access_token: str
    token_type: str
    user: dict

class ChangePasswordIn(BaseModel):
    current_password: str
    new_password: str

class SetPasswordIn(BaseModel):
    new_password: str

# ── Endpoints ─────────────────────────────────────────────────

@router.post("/token", response_model=Token)
def login(form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == form.username).first()
    if not user or not verify_password(form.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    # Check company approval status
    company = db.query(Company).filter(Company.id == user.company_id).first()
    company_status = getattr(company, 'status', 'active') if company else 'active'
    if company_status == 'pending':
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account is pending approval by the platform administrator.",
        )
    if not user.is_active or company_status == 'suspended':
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account has been suspended. Please contact support.",
        )
    # Update last login
    user.last_login = datetime.utcnow()
    db.commit()

    token = create_access_token({"sub": user.username, "role": user.role, "company_id": user.company_id})
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": _fmt_user(user),
    }


@router.get("/me")
def get_me(current_user: User = Depends(get_current_user)):
    return _fmt_user(current_user)


@router.post("/change-password")
def change_password(
    data: ChangePasswordIn,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if not verify_password(data.current_password, current_user.hashed_password):
        raise HTTPException(400, "Current password is incorrect")
    from security import hash_password
    current_user.hashed_password = hash_password(data.new_password)
    current_user.must_change_password = False
    db.commit()
    return {"ok": True}


@router.post("/set-password")
def set_password(
    data: SetPasswordIn,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Force-set password without requiring the current password.
    Used for first-login forced password change."""
    if len(data.new_password) < 6:
        raise HTTPException(400, "Password must be at least 6 characters")
    from security import hash_password
    current_user.hashed_password = hash_password(data.new_password)
    current_user.must_change_password = False
    db.commit()
    return {"ok": True}


# ── Helpers ───────────────────────────────────────────────────

def _fmt_user(u: User) -> dict:
    return {
        "id": u.id,
        "username": u.username,
        "email": u.email,
        "full_name": u.full_name,
        "role": u.role,
        "is_active": u.is_active,
        "company_id": u.company_id,
        "must_change_password": bool(getattr(u, "must_change_password", False)),
        "created_at": u.created_at.isoformat() if u.created_at else None,
        "last_login": u.last_login.isoformat() if u.last_login else None,
    }


# ── Company Registration ───────────────────────────────────────

class RegisterIn(BaseModel):
    company_name: str
    admin_username: str
    admin_password: str
    admin_email: Optional[str] = None
    full_name: Optional[str] = None

@router.post("/register", status_code=201)
def register_company(data: RegisterIn, db: Session = Depends(get_db)):
    import re
    if db.query(User).filter(User.username == data.admin_username).first():
        raise HTTPException(400, "Username already taken")
    slug = re.sub(r'[^a-z0-9]+', '-', data.company_name.lower()).strip('-') or "company"
    base = slug
    i = 1
    while db.query(Company).filter(Company.slug == slug).first():
        slug = f"{base}-{i}"; i += 1
    company = Company(name=data.company_name, slug=slug, is_active=False, status="pending")
    db.add(company); db.flush()
    user = User(
        username=data.admin_username,
        email=data.admin_email,
        full_name=data.full_name or data.admin_username,
        hashed_password=hash_password(data.admin_password),
        role="admin",
        company_id=company.id,
        must_change_password=False,
    )
    db.add(user)
    profile = CompanyProfile(company_id=company.id, name=data.company_name)
    db.add(profile)
    db.commit()
    return {"status": "pending_approval"}
