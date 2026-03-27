"""
Returns Router
==============
Customer returns / credit notes.
POST /returns/{id}/accept  → restocks inventory by creating new batches.
POST /returns/{id}/reject  → marks return rejected (no stock change).
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List
from datetime import date, datetime

import sys, os
sys.path.append(os.path.dirname(os.path.dirname(__file__)))
from database import get_db
from models import CustomerReturn, ReturnItem, SKU, Inventory, Batch
from security import get_current_user, get_company_id

router = APIRouter(prefix="/returns", tags=["Returns"])

REASONS = ["Damaged", "Expired", "Excess", "Wrong Item", "Other"]
CONDITIONS = ["Good", "Damaged", "Expired"]


# ── Schemas ───────────────────────────────────────────────────

class ReturnItemIn(BaseModel):
    sku_id:         int
    cases_returned: int
    condition:      str = "Good"

class ReturnIn(BaseModel):
    return_date:  date
    customer_id:  Optional[int] = None
    store_name:   str
    reason:       str
    warehouse:    str = "WH1"
    notes:        Optional[str] = None
    items:        List[ReturnItemIn]

class AcceptIn(BaseModel):
    """Per-item accepted quantities (key = sku_id as str)."""
    accepted: dict  # {sku_id: cases_accepted}


# ── Helpers ───────────────────────────────────────────────────

def _fmt_item(ri: ReturnItem):
    return {
        "id":             ri.id,
        "sku_id":         ri.sku_id,
        "sku_code":       ri.sku.sku_code if ri.sku else None,
        "product_name":   ri.sku.product_name if ri.sku else None,
        "cases_returned": ri.cases_returned,
        "cases_accepted": ri.cases_accepted,
        "condition":      ri.condition,
    }

def _fmt(r: CustomerReturn):
    return {
        "id":            r.id,
        "return_number": r.return_number,
        "return_date":   r.return_date.isoformat() if r.return_date else None,
        "customer_id":   r.customer_id,
        "customer_name": r.customer.name if r.customer else None,
        "store_name":    r.store_name,
        "reason":        r.reason,
        "status":        r.status,
        "warehouse":     r.warehouse,
        "notes":         r.notes,
        "created_at":    r.created_at.isoformat() if r.created_at else None,
        "item_count":    len(r.items),
        "total_cases":   sum(i.cases_returned for i in r.items),
        "items":         [_fmt_item(i) for i in r.items],
    }

def _next_return_number(db: Session) -> str:
    today = date.today().strftime("%Y%m%d")
    prefix = f"RET-{today}-"
    last = (
        db.query(CustomerReturn)
        .filter(CustomerReturn.return_number.like(f"{prefix}%"))
        .order_by(CustomerReturn.id.desc())
        .first()
    )
    seq = 1
    if last:
        try:
            seq = int(last.return_number.split("-")[-1]) + 1
        except Exception:
            pass
    return f"{prefix}{seq:03d}"


# ── Endpoints ─────────────────────────────────────────────────

@router.get("/")
def list_returns(
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    q = db.query(CustomerReturn).filter(CustomerReturn.company_id == company_id)
    if status:
        q = q.filter(CustomerReturn.status == status)
    returns = q.order_by(CustomerReturn.return_date.desc(), CustomerReturn.id.desc()).all()
    return [_fmt(r) for r in returns]


@router.post("/")
def create_return(
    data: ReturnIn,
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    if not data.items:
        raise HTTPException(400, "At least one item required")
    ret = CustomerReturn(
        return_number=_next_return_number(db),
        return_date=data.return_date,
        customer_id=data.customer_id,
        store_name=data.store_name,
        reason=data.reason,
        warehouse=data.warehouse,
        notes=data.notes,
        company_id=company_id,
    )
    db.add(ret)
    db.flush()
    for it in data.items:
        db.add(ReturnItem(
            return_id=ret.id,
            sku_id=it.sku_id,
            cases_returned=it.cases_returned,
            condition=it.condition,
        ))
    db.commit()
    db.refresh(ret)
    return _fmt(ret)


@router.get("/{return_id}")
def get_return(
    return_id: int,
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    r = db.query(CustomerReturn).filter(
        CustomerReturn.id == return_id,
        CustomerReturn.company_id == company_id,
    ).first()
    if not r:
        raise HTTPException(404, "Return not found")
    return _fmt(r)


@router.post("/{return_id}/accept")
def accept_return(
    return_id: int,
    data: AcceptIn,
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    """
    Accept a return. For each item, records accepted quantity and
    creates a new Batch + adjusts Inventory so stock is replenished.
    """
    r = db.query(CustomerReturn).filter(
        CustomerReturn.id == return_id,
        CustomerReturn.company_id == company_id,
    ).first()
    if not r:
        raise HTTPException(404, "Return not found")
    if r.status != "Pending":
        raise HTTPException(400, f"Return is already {r.status}")

    today = date.today()

    for item in r.items:
        accepted = int(data.accepted.get(str(item.sku_id), 0))
        item.cases_accepted = accepted

        if accepted > 0:
            # Create a new batch for traceability
            batch_code = f"{r.return_number}-SKU{item.sku_id}"
            batch = Batch(
                batch_code=batch_code,
                sku_id=item.sku_id,
                cases_received=accepted,
                cases_remaining=accepted,
                warehouse=r.warehouse,
                received_date=today,
                has_expiry=False,
                supplier_ref=r.return_number,
                notes=f"Customer return: {r.reason}",
                company_id=company_id,
            )
            db.add(batch)

            # Update inventory
            inv = (
                db.query(Inventory)
                .filter(
                    Inventory.sku_id == item.sku_id,
                    Inventory.warehouse == r.warehouse,
                    Inventory.company_id == company_id,
                )
                .first()
            )
            if inv:
                inv.cases_on_hand += accepted
            else:
                db.add(Inventory(
                    sku_id=item.sku_id,
                    warehouse=r.warehouse,
                    cases_on_hand=accepted,
                    company_id=company_id,
                ))

    r.status = "Accepted"
    db.commit()
    db.refresh(r)
    return _fmt(r)


@router.post("/{return_id}/reject")
def reject_return(
    return_id: int,
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    r = db.query(CustomerReturn).filter(
        CustomerReturn.id == return_id,
        CustomerReturn.company_id == company_id,
    ).first()
    if not r:
        raise HTTPException(404, "Return not found")
    if r.status != "Pending":
        raise HTTPException(400, f"Return is already {r.status}")
    r.status = "Rejected"
    db.commit()
    return _fmt(r)


@router.delete("/{return_id}")
def delete_return(
    return_id: int,
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    r = db.query(CustomerReturn).filter(
        CustomerReturn.id == return_id,
        CustomerReturn.company_id == company_id,
    ).first()
    if not r:
        raise HTTPException(404, "Return not found")
    if r.status == "Accepted":
        raise HTTPException(400, "Cannot delete an accepted return (stock already restocked)")
    db.delete(r)
    db.commit()
    return {"ok": True}
