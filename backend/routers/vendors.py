from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional
from pydantic import BaseModel

import sys, os
sys.path.append(os.path.dirname(os.path.dirname(__file__)))
from database import get_db
from models import Vendor
from security import get_current_user, get_company_id

router = APIRouter(prefix="/vendors", tags=["Vendors"])

class VendorCreate(BaseModel):
    name: str
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    lead_time_days: int = 7
    notes: Optional[str] = None

class VendorUpdate(BaseModel):
    name: Optional[str] = None
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    lead_time_days: Optional[int] = None
    notes: Optional[str] = None
    is_active: Optional[bool] = None

@router.get("/")
def list_vendors(
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    vendors = db.query(Vendor).filter(
        Vendor.is_active == True,
        Vendor.company_id == company_id,
    ).order_by(Vendor.name).all()
    return [
        {
            "id": v.id,
            "name": v.name,
            "contact_person": v.contact_person,
            "phone": v.phone,
            "email": v.email,
            "lead_time_days": v.lead_time_days,
            "notes": v.notes,
            "sku_count": len(v.skus),
        }
        for v in vendors
    ]

@router.post("/")
def create_vendor(
    data: VendorCreate,
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    vendor = Vendor(**data.dict(), company_id=company_id)
    db.add(vendor)
    db.commit()
    db.refresh(vendor)
    return {"id": vendor.id, "name": vendor.name}

@router.put("/{vendor_id}")
def update_vendor(
    vendor_id: int,
    data: VendorUpdate,
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    vendor = db.query(Vendor).filter(
        Vendor.id == vendor_id,
        Vendor.company_id == company_id,
    ).first()
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor not found")
    for field, value in data.dict(exclude_unset=True).items():
        setattr(vendor, field, value)
    db.commit()
    return {"message": "Updated"}
