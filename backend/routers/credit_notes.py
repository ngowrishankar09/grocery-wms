import sys, os
sys.path.append(os.path.dirname(os.path.dirname(__file__)))
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Optional
from datetime import date, datetime
from database import get_db
from models import CreditNote, CreditNoteItem, Invoice, Customer, SKU, CustomerReturn
from security import get_current_user, get_company_id

router = APIRouter(prefix="/credit-notes", tags=["credit-notes"])

class CNItemIn(BaseModel):
    sku_id: Optional[int] = None
    description: str
    qty: float = 1.0
    unit_price: float = 0.0

class CNCreate(BaseModel):
    customer_id: Optional[int] = None
    invoice_id: Optional[int] = None
    return_id: Optional[int] = None
    credit_date: date
    reason: Optional[str] = "Return"
    notes: Optional[str] = None
    items: List[CNItemIn] = []

def _next_cn_number(db, company_id):
    from datetime import date
    today = date.today().strftime("%Y%m%d")
    prefix = f"CN-{today}-"
    last = db.query(CreditNote).filter(
        CreditNote.company_id == company_id,
        CreditNote.credit_note_number.like(f"{prefix}%")
    ).order_by(CreditNote.id.desc()).first()
    seq = int(last.credit_note_number.split("-")[-1]) + 1 if last else 1
    return f"{prefix}{seq:03d}"

def _fmt(cn):
    return {
        "id": cn.id,
        "credit_note_number": cn.credit_note_number,
        "customer_id": cn.customer_id,
        "customer_name": cn.customer.name if cn.customer else None,
        "invoice_id": cn.invoice_id,
        "invoice_number": cn.invoice.invoice_number if cn.invoice else None,
        "credit_date": str(cn.credit_date),
        "status": cn.status,
        "reason": cn.reason,
        "subtotal": cn.subtotal,
        "tax_amount": cn.tax_amount,
        "total": cn.total,
        "amount_applied": cn.amount_applied,
        "balance": round((cn.total or 0) - (cn.amount_applied or 0), 2),
        "notes": cn.notes,
        "created_at": str(cn.created_at),
        "items": [
            {
                "id": i.id,
                "sku_id": i.sku_id,
                "sku_code": i.sku.sku_code if i.sku else None,
                "description": i.description,
                "qty": i.qty,
                "unit_price": i.unit_price,
                "line_total": i.line_total,
            }
            for i in cn.items
        ],
    }

@router.get("")
def list_credit_notes(db: Session = Depends(get_db), company_id: int = Depends(get_company_id)):
    cns = db.query(CreditNote).filter(CreditNote.company_id == company_id).order_by(CreditNote.id.desc()).all()
    return [_fmt(cn) for cn in cns]

@router.post("")
def create_credit_note(payload: CNCreate, db: Session = Depends(get_db), company_id: int = Depends(get_company_id)):
    subtotal = sum(it.qty * it.unit_price for it in payload.items)
    cn = CreditNote(
        company_id=company_id,
        credit_note_number=_next_cn_number(db, company_id),
        customer_id=payload.customer_id,
        invoice_id=payload.invoice_id,
        return_id=payload.return_id,
        credit_date=payload.credit_date,
        reason=payload.reason,
        notes=payload.notes,
        subtotal=round(subtotal, 2),
        total=round(subtotal, 2),
    )
    db.add(cn)
    db.flush()
    for it in payload.items:
        db.add(CreditNoteItem(
            credit_note_id=cn.id,
            sku_id=it.sku_id,
            description=it.description,
            qty=it.qty,
            unit_price=it.unit_price,
            line_total=round(it.qty * it.unit_price, 2),
        ))
    db.commit()
    db.refresh(cn)
    return _fmt(cn)

@router.get("/{cn_id}")
def get_credit_note(cn_id: int, db: Session = Depends(get_db), company_id: int = Depends(get_company_id)):
    cn = db.query(CreditNote).filter(CreditNote.id == cn_id, CreditNote.company_id == company_id).first()
    if not cn:
        raise HTTPException(404, "Credit note not found")
    return _fmt(cn)

@router.post("/{cn_id}/apply")
def apply_to_invoice(cn_id: int, payload: dict, db: Session = Depends(get_db), company_id: int = Depends(get_company_id)):
    """Apply credit note balance against an invoice."""
    cn = db.query(CreditNote).filter(CreditNote.id == cn_id, CreditNote.company_id == company_id).first()
    if not cn:
        raise HTTPException(404, "Credit note not found")
    invoice_id = payload.get("invoice_id")
    amount = float(payload.get("amount", 0))
    balance = (cn.total or 0) - (cn.amount_applied or 0)
    if amount > balance:
        raise HTTPException(400, f"Amount {amount} exceeds credit note balance {balance}")
    inv = db.query(Invoice).filter(Invoice.id == invoice_id, Invoice.company_id == company_id).first()
    if not inv:
        raise HTTPException(404, "Invoice not found")
    from models import InvoicePayment
    from datetime import date
    payment = InvoicePayment(
        company_id=company_id,
        invoice_id=invoice_id,
        payment_date=date.today(),
        amount=amount,
        method="Credit Note",
        reference=cn.credit_note_number,
        notes=f"Applied from credit note {cn.credit_note_number}",
    )
    db.add(payment)
    cn.amount_applied = (cn.amount_applied or 0) + amount
    if cn.amount_applied >= cn.total:
        cn.status = "Applied"
    # Recalculate invoice status
    total_paid = sum(p.amount for p in inv.payments) + amount
    balance_due = (inv.grand_total or 0) - total_paid
    if balance_due <= 0:
        inv.status = "Paid"
    elif total_paid > 0:
        inv.status = "Partial"
    db.commit()
    return {"ok": True, "applied": amount, "cn_balance": round((cn.total or 0) - (cn.amount_applied or 0), 2)}

@router.post("/{cn_id}/void")
def void_credit_note(cn_id: int, db: Session = Depends(get_db), company_id: int = Depends(get_company_id)):
    cn = db.query(CreditNote).filter(CreditNote.id == cn_id, CreditNote.company_id == company_id).first()
    if not cn:
        raise HTTPException(404, "Credit note not found")
    cn.status = "Void"
    db.commit()
    return {"ok": True}

@router.delete("/{cn_id}")
def delete_credit_note(cn_id: int, db: Session = Depends(get_db), company_id: int = Depends(get_company_id)):
    cn = db.query(CreditNote).filter(CreditNote.id == cn_id, CreditNote.company_id == company_id).first()
    if not cn:
        raise HTTPException(404, "Credit note not found")
    if cn.status == "Applied":
        raise HTTPException(400, "Cannot delete an applied credit note")
    db.delete(cn)
    db.commit()
    return {"ok": True}
