"""
Customers Router
================
CRUD for customer accounts, plus order history per customer.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from datetime import date

from sqlalchemy import func

import sys, os
sys.path.append(os.path.dirname(os.path.dirname(__file__)))
from database import get_db
from models import Customer, Order
from security import get_current_user, get_company_id, hash_password

router = APIRouter(prefix="/customers", tags=["Customers"])


# ── Schemas ───────────────────────────────────────────────────

class CustomerIn(BaseModel):
    name:             str
    contact_person:   Optional[str] = None
    phone:            Optional[str] = None
    email:            Optional[str] = None
    address:          Optional[str] = None
    delivery_address: Optional[str] = None
    notes:            Optional[str] = None
    price_list_id:    Optional[int] = None
    is_active:        bool = True


class PortalAccessRequest(BaseModel):
    password: Optional[str] = None   # None = disable, string = enable with this password
    enabled:  bool = True


def _fmt(c: Customer, order_count: int = 0):
    return {
        "id":               c.id,
        "name":             c.name,
        "contact_person":   c.contact_person,
        "phone":            c.phone,
        "email":            c.email,
        "address":          c.address,
        "delivery_address": c.delivery_address,
        "notes":            c.notes,
        "price_list_id":    c.price_list_id,
        "price_list_name":  c.price_list.name if c.price_list else None,
        "is_active":        c.is_active,
        "created_at":       c.created_at.isoformat() if c.created_at else None,
        "order_count":      order_count,
        "portal_enabled":   getattr(c, "portal_enabled", False) or False,
    }


# ── Endpoints ─────────────────────────────────────────────────

@router.get("/")
def list_customers(
    active_only: bool = False,
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    q = db.query(Customer).filter(Customer.company_id == company_id)
    if active_only:
        q = q.filter(Customer.is_active == True)
    customers = q.order_by(Customer.name).all()

    # Count orders per customer in one query
    counts = dict(
        db.query(Order.customer_id, func.count(Order.id))
        .filter(Order.customer_id != None, Order.company_id == company_id)
        .group_by(Order.customer_id)
        .all()
    )
    return [_fmt(c, counts.get(c.id, 0)) for c in customers]


@router.post("/")
def create_customer(
    data: CustomerIn,
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    customer = Customer(**data.dict(), company_id=company_id)
    db.add(customer)
    db.commit()
    db.refresh(customer)
    return _fmt(customer)


@router.get("/{customer_id}")
def get_customer(
    customer_id: int,
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    c = db.query(Customer).filter(
        Customer.id == customer_id,
        Customer.company_id == company_id,
    ).first()
    if not c:
        raise HTTPException(status_code=404, detail="Customer not found")
    count = db.query(func.count(Order.id)).filter(
        Order.customer_id == customer_id,
        Order.company_id == company_id,
    ).scalar() or 0
    return _fmt(c, count)


@router.put("/{customer_id}")
def update_customer(
    customer_id: int,
    data: CustomerIn,
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    c = db.query(Customer).filter(
        Customer.id == customer_id,
        Customer.company_id == company_id,
    ).first()
    if not c:
        raise HTTPException(status_code=404, detail="Customer not found")
    for k, v in data.dict().items():
        setattr(c, k, v)
    db.commit()
    db.refresh(c)
    count = db.query(func.count(Order.id)).filter(
        Order.customer_id == customer_id,
        Order.company_id == company_id,
    ).scalar() or 0
    return _fmt(c, count)


@router.delete("/{customer_id}")
def delete_customer(
    customer_id: int,
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    c = db.query(Customer).filter(
        Customer.id == customer_id,
        Customer.company_id == company_id,
    ).first()
    if not c:
        raise HTTPException(status_code=404, detail="Customer not found")
    # Soft delete — just mark inactive
    c.is_active = False
    db.commit()
    return {"ok": True}


@router.get("/{customer_id}/orders")
def customer_orders(
    customer_id: int,
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    c = db.query(Customer).filter(
        Customer.id == customer_id,
        Customer.company_id == company_id,
    ).first()
    if not c:
        raise HTTPException(status_code=404, detail="Customer not found")

    orders = (
        db.query(Order)
        .filter(Order.customer_id == customer_id, Order.company_id == company_id)
        .order_by(Order.order_date.desc())
        .all()
    )
    return [
        {
            "id":            o.id,
            "order_number":  o.order_number,
            "order_date":    o.order_date.isoformat() if o.order_date else None,
            "dispatch_date": o.dispatch_date.isoformat() if o.dispatch_date else None,
            "status":        o.status,
            "items":         len(o.items),
            "notes":         o.notes,
        }
        for o in orders
    ]


@router.post("/{customer_id}/portal-access")
def set_portal_access(
    customer_id: int,
    req: PortalAccessRequest,
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    c = db.query(Customer).filter(
        Customer.id == customer_id,
        Customer.company_id == company_id,
    ).first()
    if not c:
        raise HTTPException(status_code=404, detail="Customer not found")
    if not req.enabled or not req.password:
        # Disable portal access
        c.portal_enabled = False
        c.portal_password = None
        db.commit()
        return {"ok": True, "portal_enabled": False}
    if not c.email:
        raise HTTPException(status_code=400, detail="Customer must have an email address to enable portal access")
    c.portal_enabled = True
    c.portal_password = hash_password(req.password)
    db.commit()
    return {"ok": True, "portal_enabled": True}
