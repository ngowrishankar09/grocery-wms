"""
Customers Router
================
CRUD for customer accounts, plus order history, credit management, and AR aging.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel
from typing import Optional
from datetime import date, timedelta

import sys, os
sys.path.append(os.path.dirname(os.path.dirname(__file__)))
from database import get_db
from models import Customer, Order, Invoice
from security import get_current_user, get_company_id, hash_password

router = APIRouter(prefix="/customers", tags=["Customers"])


# ── Schemas ───────────────────────────────────────────────────

class CustomerIn(BaseModel):
    name:             str
    contact_person:   Optional[str]   = None
    phone:            Optional[str]   = None
    email:            Optional[str]   = None
    address:          Optional[str]   = None
    delivery_address: Optional[str]   = None
    notes:            Optional[str]   = None
    price_list_id:    Optional[int]   = None
    is_active:        bool            = True
    credit_limit:     Optional[float] = None   # None = unlimited
    credit_hold:      bool            = False
    payment_terms:    Optional[str]   = None   # e.g. "Net 30"


class PortalAccessRequest(BaseModel):
    password: Optional[str] = None   # None = disable, string = enable with this password
    enabled:  bool = True


def _fmt(c: Customer, order_count: int = 0, outstanding_balance: float = 0.0):
    return {
        "id":                c.id,
        "name":              c.name,
        "contact_person":    c.contact_person,
        "phone":             c.phone,
        "email":             c.email,
        "address":           c.address,
        "delivery_address":  c.delivery_address,
        "notes":             c.notes,
        "price_list_id":     c.price_list_id,
        "price_list_name":   c.price_list.name if c.price_list else None,
        "is_active":         c.is_active,
        "created_at":        c.created_at.isoformat() if c.created_at else None,
        "order_count":       order_count,
        "portal_enabled":    getattr(c, "portal_enabled", False) or False,
        "credit_limit":      getattr(c, "credit_limit", None),
        "credit_hold":       getattr(c, "credit_hold", False) or False,
        "payment_terms":     getattr(c, "payment_terms", None),
        "outstanding_balance": round(outstanding_balance, 2),
    }


def _outstanding_balances(db: Session, company_id: int) -> dict:
    """Return {customer_id: outstanding_balance} for all Sent/Overdue invoices."""
    rows = (
        db.query(Invoice.customer_id, func.sum(Invoice.grand_total))
        .filter(
            Invoice.customer_id.isnot(None),
            Invoice.company_id == company_id,
            Invoice.status.in_(["Sent", "Overdue"]),
        )
        .group_by(Invoice.customer_id)
        .all()
    )
    return {r[0]: float(r[1] or 0) for r in rows}


# ── Endpoints ─────────────────────────────────────────────────

@router.get("/aging")
def customer_aging(
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    """Aged receivables: outstanding invoices per customer bucketed by days overdue."""
    today = date.today()
    invs = (
        db.query(Invoice)
        .filter(
            Invoice.company_id == company_id,
            Invoice.status.in_(["Sent", "Overdue"]),
        )
        .all()
    )

    result: dict = {}
    for inv in invs:
        cid = inv.customer_id
        if not cid:
            continue
        if cid not in result:
            result[cid] = {
                "customer_id":   cid,
                "customer_name": inv.customer.name if inv.customer else "Unknown",
                "credit_limit":  getattr(inv.customer, "credit_limit", None) if inv.customer else None,
                "credit_hold":   getattr(inv.customer, "credit_hold", False) if inv.customer else False,
                "current": 0.0, "days_1_30": 0.0, "days_31_60": 0.0,
                "days_61_90": 0.0, "over_90": 0.0, "total": 0.0,
            }
        amt = float(inv.grand_total or inv.total or 0)
        result[cid]["total"] = round(result[cid]["total"] + amt, 2)

        if inv.due_date and inv.due_date < today:
            days = (today - inv.due_date).days
            if days <= 30:
                result[cid]["days_1_30"] = round(result[cid]["days_1_30"] + amt, 2)
            elif days <= 60:
                result[cid]["days_31_60"] = round(result[cid]["days_31_60"] + amt, 2)
            elif days <= 90:
                result[cid]["days_61_90"] = round(result[cid]["days_61_90"] + amt, 2)
            else:
                result[cid]["over_90"] = round(result[cid]["over_90"] + amt, 2)
        else:
            result[cid]["current"] = round(result[cid]["current"] + amt, 2)

    return sorted(result.values(), key=lambda x: x["total"], reverse=True)


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

    counts = dict(
        db.query(Order.customer_id, func.count(Order.id))
        .filter(Order.customer_id != None, Order.company_id == company_id)
        .group_by(Order.customer_id)
        .all()
    )
    balances = _outstanding_balances(db, company_id)
    return [_fmt(c, counts.get(c.id, 0), balances.get(c.id, 0.0)) for c in customers]


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
    bal = db.query(func.sum(Invoice.grand_total)).filter(
        Invoice.customer_id == customer_id,
        Invoice.company_id == company_id,
        Invoice.status.in_(["Sent", "Overdue"]),
    ).scalar() or 0.0
    return _fmt(c, count, float(bal))


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
    bal = db.query(func.sum(Invoice.grand_total)).filter(
        Invoice.customer_id == customer_id,
        Invoice.company_id == company_id,
        Invoice.status.in_(["Sent", "Overdue"]),
    ).scalar() or 0.0
    return _fmt(c, count, float(bal))


@router.post("/{customer_id}/toggle-hold")
def toggle_credit_hold(
    customer_id: int,
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    """Toggle credit hold on/off for a customer."""
    c = db.query(Customer).filter(
        Customer.id == customer_id,
        Customer.company_id == company_id,
    ).first()
    if not c:
        raise HTTPException(status_code=404, detail="Customer not found")
    c.credit_hold = not (getattr(c, "credit_hold", False) or False)
    db.commit()
    return {"ok": True, "credit_hold": c.credit_hold, "customer_id": c.id}


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
