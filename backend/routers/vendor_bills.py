import sys, os
sys.path.append(os.path.dirname(os.path.dirname(__file__)))
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel
from typing import List, Optional
from datetime import date, datetime, timedelta
from database import get_db
from models import VendorBill, VendorBillItem, VendorPayment, Vendor, PurchaseOrder, PurchaseOrderItem
from security import get_current_user, get_company_id

router = APIRouter(prefix="/vendor-bills", tags=["vendor-bills"])

class BillItemIn(BaseModel):
    sku_id: Optional[int] = None
    description: str
    qty: float = 1.0
    unit_cost: float = 0.0

class BillCreate(BaseModel):
    vendor_id: Optional[int] = None
    po_id: Optional[int] = None
    bill_date: date
    due_date: Optional[date] = None
    vendor_ref: Optional[str] = None
    notes: Optional[str] = None
    items: List[BillItemIn] = []

class PaymentIn(BaseModel):
    payment_date: date
    amount: float
    method: str = "Bank Transfer"
    reference: Optional[str] = None
    notes: Optional[str] = None

def _next_bill_number(db, company_id):
    today = date.today().strftime("%Y%m%d")
    prefix = f"BILL-{today}-"
    last = db.query(VendorBill).filter(
        VendorBill.company_id == company_id,
        VendorBill.bill_number.like(f"{prefix}%")
    ).order_by(VendorBill.id.desc()).first()
    seq = int(last.bill_number.split("-")[-1]) + 1 if last else 1
    return f"{prefix}{seq:03d}"

def _fmt_payment(p):
    return {"id": p.id, "payment_date": str(p.payment_date), "amount": p.amount, "method": p.method, "reference": p.reference}

def _fmt(bill):
    paid = sum(p.amount for p in bill.payments)
    balance = (bill.total or 0) - paid
    return {
        "id": bill.id,
        "bill_number": bill.bill_number,
        "vendor_id": bill.vendor_id,
        "vendor_name": bill.vendor.name if bill.vendor else None,
        "po_id": bill.po_id,
        "po_number": bill.po.po_number if bill.po else None,
        "bill_date": str(bill.bill_date),
        "due_date": str(bill.due_date) if bill.due_date else None,
        "status": bill.status,
        "vendor_ref": bill.vendor_ref,
        "subtotal": bill.subtotal,
        "tax_amount": bill.tax_amount,
        "total": bill.total,
        "amount_paid": round(paid, 2),
        "balance_due": round(balance, 2),
        "notes": bill.notes,
        "created_at": str(bill.created_at),
        "payments": [_fmt_payment(p) for p in bill.payments],
        "items": [
            {
                "id": i.id,
                "sku_id": i.sku_id,
                "description": i.description,
                "qty": i.qty,
                "unit_cost": i.unit_cost,
                "line_total": i.line_total,
            }
            for i in bill.items
        ],
    }

@router.get("/aging")
def ap_aging(db: Session = Depends(get_db), company_id: int = Depends(get_company_id)):
    """AP aging: group outstanding bills by overdue buckets."""
    from datetime import date
    today = date.today()
    bills = db.query(VendorBill).filter(
        VendorBill.company_id == company_id,
        VendorBill.status.in_(["Received", "Approved", "Partial", "Overdue"])
    ).all()
    buckets = {"current": 0, "1_30": 0, "31_60": 0, "61_90": 0, "over_90": 0}
    rows = []
    for b in bills:
        paid = sum(p.amount for p in b.payments)
        bal = (b.total or 0) - paid
        if bal <= 0:
            continue
        days = (today - b.due_date).days if b.due_date else 0
        if days <= 0:
            buckets["current"] += bal
        elif days <= 30:
            buckets["1_30"] += bal
        elif days <= 60:
            buckets["31_60"] += bal
        elif days <= 90:
            buckets["61_90"] += bal
        else:
            buckets["over_90"] += bal
        rows.append({"vendor": b.vendor.name if b.vendor else "—", "bill_number": b.bill_number,
                     "bill_date": str(b.bill_date), "due_date": str(b.due_date) if b.due_date else None,
                     "total": b.total, "paid": round(paid, 2), "balance": round(bal, 2), "days_overdue": max(0, days)})
    return {"buckets": {k: round(v, 2) for k, v in buckets.items()}, "rows": rows,
            "total_outstanding": round(sum(r["balance"] for r in rows), 2)}

@router.get("")
def list_bills(status: Optional[str] = None, vendor_id: Optional[int] = None,
               db: Session = Depends(get_db), company_id: int = Depends(get_company_id)):
    q = db.query(VendorBill).filter(VendorBill.company_id == company_id)
    if status:
        q = q.filter(VendorBill.status == status)
    if vendor_id:
        q = q.filter(VendorBill.vendor_id == vendor_id)
    return [_fmt(b) for b in q.order_by(VendorBill.id.desc()).all()]

@router.post("")
def create_bill(payload: BillCreate, db: Session = Depends(get_db), company_id: int = Depends(get_company_id)):
    subtotal = sum(it.qty * it.unit_cost for it in payload.items)
    bill = VendorBill(
        company_id=company_id,
        bill_number=_next_bill_number(db, company_id),
        vendor_id=payload.vendor_id,
        po_id=payload.po_id,
        bill_date=payload.bill_date,
        due_date=payload.due_date,
        vendor_ref=payload.vendor_ref,
        notes=payload.notes,
        subtotal=round(subtotal, 2),
        total=round(subtotal, 2),
        status="Draft",
    )
    db.add(bill)
    db.flush()
    for it in payload.items:
        db.add(VendorBillItem(
            bill_id=bill.id, sku_id=it.sku_id, description=it.description,
            qty=it.qty, unit_cost=it.unit_cost, line_total=round(it.qty * it.unit_cost, 2),
        ))
    db.commit()
    db.refresh(bill)
    return _fmt(bill)

@router.post("/from-po/{po_id}")
def bill_from_po(po_id: int, payload: dict = {}, db: Session = Depends(get_db), company_id: int = Depends(get_company_id)):
    """Auto-generate a vendor bill from a received PO."""
    po = db.query(PurchaseOrder).filter(PurchaseOrder.id == po_id, PurchaseOrder.company_id == company_id).first()
    if not po:
        raise HTTPException(404, "PO not found")
    existing = db.query(VendorBill).filter(VendorBill.po_id == po_id, VendorBill.company_id == company_id).first()
    if existing:
        return _fmt(existing)
    items_in = [BillItemIn(
        sku_id=i.sku_id,
        description=i.sku.product_name if i.sku else f"SKU {i.sku_id}",
        qty=i.cases_received or i.cases_ordered,
        unit_cost=i.unit_cost or 0,
    ) for i in po.items]
    subtotal = sum(it.qty * it.unit_cost for it in items_in)
    bill = VendorBill(
        company_id=company_id,
        bill_number=_next_bill_number(db, company_id),
        vendor_id=po.vendor_id,
        po_id=po.id,
        bill_date=date.today(),
        due_date=date.today() + timedelta(days=30),
        subtotal=round(subtotal, 2),
        total=round(subtotal, 2),
        status="Received",
        notes=f"Auto-generated from PO {po.po_number}",
    )
    db.add(bill)
    db.flush()
    for it in items_in:
        db.add(VendorBillItem(bill_id=bill.id, sku_id=it.sku_id, description=it.description,
                               qty=it.qty, unit_cost=it.unit_cost, line_total=round(it.qty * it.unit_cost, 2)))
    db.commit()
    db.refresh(bill)
    return _fmt(bill)

@router.get("/{bill_id}")
def get_bill(bill_id: int, db: Session = Depends(get_db), company_id: int = Depends(get_company_id)):
    bill = db.query(VendorBill).filter(VendorBill.id == bill_id, VendorBill.company_id == company_id).first()
    if not bill:
        raise HTTPException(404, "Bill not found")
    return _fmt(bill)

@router.patch("/{bill_id}/status")
def update_status(bill_id: int, payload: dict, db: Session = Depends(get_db), company_id: int = Depends(get_company_id)):
    bill = db.query(VendorBill).filter(VendorBill.id == bill_id, VendorBill.company_id == company_id).first()
    if not bill:
        raise HTTPException(404, "Bill not found")
    bill.status = payload.get("status", bill.status)
    db.commit()
    return {"ok": True}

@router.post("/{bill_id}/payments")
def record_payment(bill_id: int, payload: PaymentIn, db: Session = Depends(get_db), company_id: int = Depends(get_company_id)):
    bill = db.query(VendorBill).filter(VendorBill.id == bill_id, VendorBill.company_id == company_id).first()
    if not bill:
        raise HTTPException(404, "Bill not found")
    p = VendorPayment(company_id=company_id, bill_id=bill_id, payment_date=payload.payment_date,
                       amount=payload.amount, method=payload.method, reference=payload.reference, notes=payload.notes)
    db.add(p)
    db.flush()
    total_paid = sum(pp.amount for pp in bill.payments)
    bill.amount_paid = total_paid
    balance = (bill.total or 0) - total_paid
    bill.status = "Paid" if balance <= 0 else "Partial"
    db.commit()
    db.refresh(bill)
    return _fmt(bill)

@router.delete("/{bill_id}")
def delete_bill(bill_id: int, db: Session = Depends(get_db), company_id: int = Depends(get_company_id)):
    bill = db.query(VendorBill).filter(VendorBill.id == bill_id, VendorBill.company_id == company_id).first()
    if not bill:
        raise HTTPException(404, "Bill not found")
    if bill.status not in ("Draft",):
        raise HTTPException(400, "Only Draft bills can be deleted")
    db.delete(bill)
    db.commit()
    return {"ok": True}
