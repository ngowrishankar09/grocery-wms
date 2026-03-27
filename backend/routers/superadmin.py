from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models import Company, User
from security import require_superadmin

router = APIRouter(prefix="/superadmin", tags=["superadmin"])

@router.get("/companies")
def list_companies(db: Session = Depends(get_db), _=Depends(require_superadmin)):
    companies = db.query(Company).order_by(Company.created_at.desc()).all()
    return [
        {
            "id": c.id, "name": c.name, "slug": c.slug,
            "plan": c.plan, "is_active": c.is_active,
            "status": getattr(c, 'status', 'active') or 'active',
            "created_at": c.created_at.isoformat() if c.created_at else None,
            "user_count": db.query(User).filter(User.company_id == c.id).count(),
        }
        for c in companies
    ]

@router.patch("/companies/{company_id}")
def update_company(company_id: int, data: dict, db: Session = Depends(get_db), _=Depends(require_superadmin)):
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(404, "Company not found")
    for key in ("is_active", "plan", "name", "status"):
        if key in data:
            setattr(company, key, data[key])
    db.commit()
    return {"ok": True}

@router.post("/companies/{company_id}/approve")
def approve_company(company_id: int, db: Session = Depends(get_db), _=Depends(require_superadmin)):
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(404, "Company not found")
    company.status = "active"
    company.is_active = True
    db.commit()
    return {"ok": True}

@router.post("/companies/{company_id}/reject")
def reject_company(company_id: int, db: Session = Depends(get_db), _=Depends(require_superadmin)):
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(404, "Company not found")
    company.status = "rejected"
    company.is_active = False
    db.commit()
    return {"ok": True}

@router.get("/companies/{company_id}/users")
def list_company_users(company_id: int, db: Session = Depends(get_db), _=Depends(require_superadmin)):
    users = db.query(User).filter(User.company_id == company_id).all()
    return [{"id": u.id, "username": u.username, "role": u.role, "is_active": u.is_active, "email": u.email} for u in users]
