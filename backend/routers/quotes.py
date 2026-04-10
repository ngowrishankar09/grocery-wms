import sys, os
sys.path.append(os.path.dirname(os.path.dirname(__file__)))
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Optional
from datetime import date, datetime, timedelta
from database import get_db
from models import Quote, QuoteItem, Order, OrderItem, Customer, SKU
from security import get_current_user, get_company_id

router = APIRouter(prefix="/quotes", tags=["quotes"])

class QItemIn(BaseModel):
    sku_id: Optional[int] = None
    description: str
    qty: float = 1.0
    unit_price: float = 0.0
    notes: Optional[str] = None

class QuoteCreate(BaseModel):
    customer_id: Optional[int] = None
    store_name: str
    quote_date: date
    expiry_date: Optional[date] = None
    discount_amount: float = 0.0
    notes: Optional[str] = None
    terms: Optional[str] = None
    items: List[QItemIn] = []

def _next_quote_number(db, company_id):
    today = date.today().strftime("%Y%m%d")
    prefix = f"QT-{today}-"
    last = db.query(Quote).filter(
        Quote.company_id == company_id,
        Quote.quote_number.like(f"{prefix}%")
    ).order_by(Quote.id.desc()).first()
    seq = int(last.quote_number.split("-")[-1]) + 1 if last else 1
    return f"{prefix}{seq:03d}"

def _calc_totals(items_data, discount=0.0):
    subtotal = sum(it.qty * it.unit_price for it in items_data)
    total = max(0, subtotal - discount)
    return round(subtotal, 2), round(total, 2)

def _fmt(q):
    return {
        "id": q.id,
        "quote_number": q.quote_number,
        "customer_id": q.customer_id,
        "customer_name": q.customer.name if q.customer else None,
        "store_name": q.store_name,
        "quote_date": str(q.quote_date),
        "expiry_date": str(q.expiry_date) if q.expiry_date else None,
        "status": q.status,
        "order_id": q.order_id,
        "subtotal": q.subtotal,
        "discount_amount": q.discount_amount,
        "total": q.total,
        "notes": q.notes,
        "terms": q.terms,
        "created_at": str(q.created_at),
        "items": [
            {
                "id": i.id, "sku_id": i.sku_id,
                "sku_code": i.sku.sku_code if i.sku else None,
                "product_name": i.sku.product_name if i.sku else None,
                "description": i.description, "qty": i.qty,
                "unit_price": i.unit_price, "line_total": i.line_total, "notes": i.notes,
            }
            for i in q.items
        ],
    }

@router.get("")
def list_quotes(status: Optional[str] = None, db: Session = Depends(get_db), company_id: int = Depends(get_company_id)):
    q = db.query(Quote).filter(Quote.company_id == company_id)
    if status:
        q = q.filter(Quote.status == status)
    return [_fmt(qt) for qt in q.order_by(Quote.id.desc()).all()]

@router.post("")
def create_quote(payload: QuoteCreate, db: Session = Depends(get_db), company_id: int = Depends(get_company_id)):
    subtotal, total = _calc_totals(payload.items, payload.discount_amount)
    qt = Quote(
        company_id=company_id,
        quote_number=_next_quote_number(db, company_id),
        customer_id=payload.customer_id,
        store_name=payload.store_name,
        quote_date=payload.quote_date,
        expiry_date=payload.expiry_date or (payload.quote_date + timedelta(days=30)),
        discount_amount=payload.discount_amount,
        subtotal=subtotal, total=total,
        notes=payload.notes, terms=payload.terms,
    )
    db.add(qt)
    db.flush()
    for it in payload.items:
        db.add(QuoteItem(
            quote_id=qt.id, sku_id=it.sku_id, description=it.description,
            qty=it.qty, unit_price=it.unit_price,
            line_total=round(it.qty * it.unit_price, 2), notes=it.notes,
        ))
    db.commit()
    db.refresh(qt)
    return _fmt(qt)

@router.get("/{quote_id}")
def get_quote(quote_id: int, db: Session = Depends(get_db), company_id: int = Depends(get_company_id)):
    qt = db.query(Quote).filter(Quote.id == quote_id, Quote.company_id == company_id).first()
    if not qt:
        raise HTTPException(404, "Quote not found")
    return _fmt(qt)

@router.patch("/{quote_id}/status")
def update_status(quote_id: int, payload: dict, db: Session = Depends(get_db), company_id: int = Depends(get_company_id)):
    qt = db.query(Quote).filter(Quote.id == quote_id, Quote.company_id == company_id).first()
    if not qt:
        raise HTTPException(404, "Quote not found")
    qt.status = payload.get("status", qt.status)
    db.commit()
    return {"ok": True}

@router.post("/{quote_id}/convert")
def convert_to_order(quote_id: int, db: Session = Depends(get_db), company_id: int = Depends(get_company_id)):
    """Convert an accepted quote into a sales order."""
    qt = db.query(Quote).filter(Quote.id == quote_id, Quote.company_id == company_id).first()
    if not qt:
        raise HTTPException(404, "Quote not found")
    if qt.status not in ("Draft", "Sent", "Accepted"):
        raise HTTPException(400, f"Cannot convert quote in status '{qt.status}'")
    # Create order
    from datetime import date
    count = db.query(Order).count()
    order_number = f"ORD-{datetime.utcnow().strftime('%Y%m%d')}-{count + 1:04d}"
    order = Order(
        company_id=company_id,
        order_number=order_number,
        customer_id=qt.customer_id,
        store_name=qt.store_name,
        order_date=date.today(),
        notes=f"Converted from quote {qt.quote_number}. {qt.notes or ''}".strip(),
        status="Pending",
    )
    db.add(order)
    db.flush()
    for qi in qt.items:
        if qi.sku_id:
            db.add(OrderItem(
                order_id=order.id, sku_id=qi.sku_id,
                cases_requested=qi.qty, unit_price=qi.unit_price,
                notes=qi.notes,
            ))
    qt.status = "Converted"
    qt.order_id = order.id
    db.commit()
    db.refresh(order)
    return {"ok": True, "order_id": order.id, "order_number": order.order_number}

@router.delete("/{quote_id}")
def delete_quote(quote_id: int, db: Session = Depends(get_db), company_id: int = Depends(get_company_id)):
    qt = db.query(Quote).filter(Quote.id == quote_id, Quote.company_id == company_id).first()
    if not qt:
        raise HTTPException(404, "Quote not found")
    db.delete(qt)
    db.commit()
    return {"ok": True}
