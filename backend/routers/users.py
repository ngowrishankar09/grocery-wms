import secrets
import string
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from datetime import datetime

from database import get_db
from models import User, CompanyProfile
from security import hash_password, get_current_user, require_role, get_company_id
from routers.auth import _fmt_user

router = APIRouter(prefix="/users", tags=["users"])

ROLES = ["admin", "manager", "warehouse", "driver", "readonly"]

# ── Schemas ──────────────────────────────────────────────────

class UserCreate(BaseModel):
    username: str
    password: str
    email: Optional[str] = None
    full_name: Optional[str] = None
    role: str = "warehouse"

class UserUpdate(BaseModel):
    email: Optional[str] = None
    full_name: Optional[str] = None
    role: Optional[str] = None
    is_active: Optional[bool] = None
    password: Optional[str] = None  # admin can reset password

# ── Endpoints ─────────────────────────────────────────────────

@router.get("/")
def list_users(
    db: Session = Depends(get_db),
    current: User = Depends(require_role("admin", "manager"))
):
    users = db.query(User).filter(User.company_id == current.company_id).order_by(User.created_at).all()
    return [_fmt_user(u) for u in users]


@router.post("/", status_code=201)
def create_user(
    data: UserCreate,
    db: Session = Depends(get_db),
    current: User = Depends(require_role("admin"))
):
    if data.role not in ROLES:
        raise HTTPException(400, f"Invalid role. Must be one of: {ROLES}")
    if db.query(User).filter(User.username == data.username).first():
        raise HTTPException(400, "Username already taken")
    u = User(
        username=data.username,
        hashed_password=hash_password(data.password),
        email=data.email,
        full_name=data.full_name,
        role=data.role,
        company_id=current.company_id,
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    return _fmt_user(u)


@router.put("/{user_id}")
def update_user(
    user_id: int,
    data: UserUpdate,
    db: Session = Depends(get_db),
    current: User = Depends(require_role("admin"))
):
    u = db.query(User).filter(User.id == user_id, User.company_id == current.company_id).first()
    if not u:
        raise HTTPException(404, "User not found")
    if data.email     is not None: u.email     = data.email
    if data.full_name is not None: u.full_name = data.full_name
    if data.role      is not None:
        if data.role not in ROLES:
            raise HTTPException(400, f"Invalid role")
        u.role = data.role
    if data.is_active is not None: u.is_active = data.is_active
    if data.password:
        u.hashed_password = hash_password(data.password)
    db.commit()
    return _fmt_user(u)


@router.post("/{user_id}/send-welcome")
def send_welcome_email(
    user_id: int,
    db: Session = Depends(get_db),
    current: User = Depends(require_role("admin"))
):
    """Generate a temp password, email it to the user, and set must_change_password=True."""
    u = db.query(User).filter(User.id == user_id, User.company_id == current.company_id).first()
    if not u:
        raise HTTPException(404, "User not found")
    if not u.email:
        raise HTTPException(400, "User has no email address. Add one first.")

    # Generate a readable temp password: 3 words-like segments
    alphabet = string.ascii_letters + string.digits
    temp_pw = (
        ''.join(secrets.choice(string.ascii_uppercase) for _ in range(2)) +
        ''.join(secrets.choice(string.digits) for _ in range(3)) +
        ''.join(secrets.choice(string.ascii_lowercase) for _ in range(4)) +
        secrets.choice("!@#$")
    )
    # Shuffle it
    temp_pw_list = list(temp_pw)
    secrets.SystemRandom().shuffle(temp_pw_list)
    temp_pw = ''.join(temp_pw_list)

    # Update user
    u.hashed_password = hash_password(temp_pw)
    u.must_change_password = True
    db.commit()

    # Send email via SMTP
    cp = db.query(CompanyProfile).first()
    company_name = cp.name if cp else "Grocery WMS"

    if cp and cp.smtp_host and cp.smtp_user and cp.smtp_password:
        from routers.email import _send_email
        html = f"""
        <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#f9fafb;border-radius:12px">
          <h2 style="color:#1e293b;margin-bottom:4px">Welcome to {company_name}</h2>
          <p style="color:#64748b;font-size:14px;margin-bottom:24px">Your warehouse management account has been created.</p>
          <div style="background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:20px;margin-bottom:20px">
            <p style="margin:0 0 8px;font-size:13px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:.5px">Your Login Credentials</p>
            <table style="width:100%;font-size:14px">
              <tr><td style="color:#64748b;padding:4px 0;width:120px">Username</td><td style="font-weight:700;color:#0f172a;font-family:monospace">{u.username}</td></tr>
              <tr><td style="color:#64748b;padding:4px 0">Temp Password</td><td style="font-weight:700;color:#0f172a;font-family:monospace;letter-spacing:1px">{temp_pw}</td></tr>
            </table>
          </div>
          <div style="background:#fef3c7;border:1px solid #fde68a;border-radius:8px;padding:12px;margin-bottom:20px;font-size:13px;color:#92400e">
            ⚠️ You will be asked to set a new password when you first log in.
          </div>
          <p style="font-size:13px;color:#64748b">Log in at your company's WMS portal and change your password immediately.</p>
        </div>
        """
        try:
            _send_email(cp, u.email, f"Welcome to {company_name} — Your Login Credentials", html)
            return {"ok": True, "emailed": True, "temp_password": temp_pw}
        except Exception as e:
            # Password was set; just couldn't send email
            return {"ok": True, "emailed": False, "temp_password": temp_pw, "email_error": str(e)}
    else:
        # SMTP not configured — return temp password to admin
        return {"ok": True, "emailed": False, "temp_password": temp_pw,
                "email_error": "SMTP not configured. Share this password manually."}


@router.delete("/{user_id}")
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current: User = Depends(require_role("admin"))
):
    u = db.query(User).filter(User.id == user_id, User.company_id == current.company_id).first()
    if not u:
        raise HTTPException(404)
    if u.id == current.id:
        raise HTTPException(400, "Cannot delete your own account")
    u.is_active = False
    db.commit()
    return {"ok": True}
