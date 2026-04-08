"""
Invoices Router
===============
Customer-facing invoices with multi-tax, discount, previous balance.

POST /invoices/from-order/{order_id}  → auto-generate from dispatched order
GET  /invoices/                        → list (filter by status)
POST /invoices/                        → create manual invoice
GET  /invoices/{id}                    → get single invoice
PUT  /invoices/{id}                    → update invoice
DELETE /invoices/{id}                  → delete Draft/Cancelled
POST /invoices/{id}/send               → Draft → Sent
POST /invoices/{id}/mark-paid          → → Paid
POST /invoices/{id}/mark-overdue       → → Overdue
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List
from datetime import date, datetime, timedelta

import sys, os
sys.path.append(os.path.dirname(os.path.dirname(__file__)))
from database import get_db
from models import Invoice, InvoiceItem, InvoiceTax, InvoicePayment, JournalEntry, JournalLine, Order, Customer, SKU, CompanyProfile
from security import get_current_user, get_company_id

router = APIRouter(prefix="/invoices", tags=["Invoices"])

STATUSES = ["Draft", "Sent", "Paid", "Partial", "Overdue", "Cancelled"]

PAYMENT_METHODS = ["Cash", "Bank Transfer", "Check", "Card", "Other"]


# ── Schemas ───────────────────────────────────────────────────

class TaxLineIn(BaseModel):
    name: str   # "GST", "PST", "VAT"
    rate: float # percentage e.g. 10.0

class InvoiceItemIn(BaseModel):
    sku_id:      Optional[int] = None
    description: str
    cases_qty:   int   = 1
    unit_price:  float = 0.0
    notes:       Optional[str] = None

class InvoiceIn(BaseModel):
    customer_id:      Optional[int]  = None
    store_name:       str
    invoice_date:     date
    due_date:         Optional[date] = None
    payment_terms:    Optional[str]  = None
    notes:            Optional[str]  = None
    taxes:            List[TaxLineIn] = []
    discount_amount:  float = 0.0
    previous_balance: float = 0.0
    items:            List[InvoiceItemIn]

class InvoiceUpdate(BaseModel):
    store_name:       Optional[str]  = None
    invoice_date:     Optional[date] = None
    due_date:         Optional[date] = None
    payment_terms:    Optional[str]  = None
    notes:            Optional[str]  = None
    status:           Optional[str]  = None
    taxes:            Optional[List[TaxLineIn]] = None
    discount_amount:  Optional[float] = None
    previous_balance: Optional[float] = None
    items:            Optional[List[InvoiceItemIn]] = None

class PaymentIn(BaseModel):
    payment_date: date
    amount:       float
    method:       str = "Bank Transfer"
    reference:    Optional[str] = None
    notes:        Optional[str] = None


# ── Helpers ───────────────────────────────────────────────────

def _calc(items, taxes, discount_amount, previous_balance):
    subtotal    = round(sum(i.cases_qty * i.unit_price for i in items), 2)
    discounted  = round(subtotal - discount_amount, 2)
    tax_amounts = []
    for tx in taxes:
        amt = round(discounted * tx.rate / 100, 2)
        tax_amounts.append(amt)
    total_tax  = round(sum(tax_amounts), 2)
    total      = round(discounted + total_tax, 2)
    grand      = round(total + previous_balance, 2)
    return subtotal, total_tax, total, grand, tax_amounts

def _fmt_item(ii: InvoiceItem):
    return {
        "id":          ii.id,
        "sku_id":      ii.sku_id,
        "sku_code":    ii.sku.sku_code if ii.sku else None,
        "description": ii.description,
        "cases_qty":   ii.cases_qty,
        "unit_price":  ii.unit_price,
        "line_total":  ii.line_total,
        "expiry_date": getattr(ii, 'expiry_date', None),
        "notes":       getattr(ii, 'notes', None),
    }

def _fmt_tax(tx: InvoiceTax):
    return {"id": tx.id, "name": tx.name, "rate": tx.rate, "amount": tx.amount}

def _fmt_payment(p: InvoicePayment):
    return {
        "id":           p.id,
        "invoice_id":   p.invoice_id,
        "payment_date": p.payment_date.isoformat() if p.payment_date else None,
        "amount":       p.amount,
        "method":       p.method,
        "reference":    p.reference,
        "notes":        p.notes,
        "created_at":   p.created_at.isoformat() if p.created_at else None,
    }

def _fmt(inv: Invoice, include_payments: bool = True):
    payments = getattr(inv, "payments", []) or []
    amount_paid = round(sum(p.amount for p in payments), 2)
    grand_total = inv.grand_total or inv.total or 0.0
    balance_due = round(max(grand_total - amount_paid, 0.0), 2)
    return {
        "id":               inv.id,
        "invoice_number":   inv.invoice_number,
        "order_id":         inv.order_id,
        "order_number":     inv.order.order_number if inv.order else None,
        "customer_id":      inv.customer_id,
        "customer_name":    inv.customer.name if inv.customer else None,
        "store_name":       inv.store_name,
        "invoice_date":     inv.invoice_date.isoformat() if inv.invoice_date else None,
        "due_date":         inv.due_date.isoformat() if inv.due_date else None,
        "status":           inv.status,
        "payment_terms":    inv.payment_terms,
        "notes":            inv.notes,
        "subtotal":         inv.subtotal,
        "discount_amount":  inv.discount_amount or 0.0,
        "tax_amount":       inv.tax_amount,
        "total":            inv.total,
        "previous_balance": inv.previous_balance or 0.0,
        "grand_total":      grand_total,
        "amount_paid":      amount_paid,
        "balance_due":      balance_due,
        "num_pallets":      getattr(inv, "num_pallets", None),
        "item_count":       len(inv.items),
        "created_at":       inv.created_at.isoformat() if inv.created_at else None,
        "items":            [_fmt_item(i) for i in inv.items],
        "taxes":            [_fmt_tax(t) for t in inv.taxes],
        "payments":         [_fmt_payment(p) for p in payments] if include_payments else [],
    }

def _next_invoice_number(db: Session, company_id: int = 1) -> str:
    """
    Generate the next invoice number using the format configured in CompanyProfile.

    Formats:
      sequential   → PREFIX-00001          (global counter, never resets)
      date-daily   → PREFIX-20260322-001   (resets each day)
      date-monthly → PREFIX-202603-001     (resets each month)
      year-seq     → PREFIX-2026-0001      (resets each year)
      year-month   → PREFIX-2026-03-001    (resets each month, readable)
      date-full    → PREFIX-2026-03-22-001 (resets each day, readable)
    """
    today = date.today()

    cp = db.query(CompanyProfile).filter(CompanyProfile.company_id == company_id).first()
    if not cp:
        cp = db.query(CompanyProfile).filter(CompanyProfile.id == 1).first()

    fmt     = (getattr(cp, "invoice_number_format",  None) or "date-daily") if cp else "date-daily"
    prefix  = (getattr(cp, "invoice_number_prefix",  None) or "INV")        if cp else "INV"
    padding = (getattr(cp, "invoice_number_padding",  None) or 3)            if cp else 3
    counter = (getattr(cp, "invoice_counter",         None) or 0)            if cp else 0
    period  =  getattr(cp, "invoice_counter_period",  None)                  if cp else None

    # Determine the current period key (used for period-based formats)
    if fmt == "sequential":
        period_key = "all"
    elif fmt in ("date-daily", "date-full"):
        period_key = today.strftime("%Y%m%d")
    elif fmt in ("date-monthly", "year-month"):
        period_key = today.strftime("%Y%m")
    elif fmt == "year-seq":
        period_key = today.strftime("%Y")
    else:
        period_key = today.strftime("%Y%m%d")

    # Reset counter when period rolls over
    if fmt != "sequential" and period != period_key:
        counter = 0

    counter += 1

    # Build the formatted invoice number
    pad = int(padding) if padding else 3
    seq_str = str(counter).zfill(pad)

    if fmt == "sequential":
        number = f"{prefix}-{seq_str}"
    elif fmt == "date-daily":
        number = f"{prefix}-{today.strftime('%Y%m%d')}-{seq_str}"
    elif fmt == "date-monthly":
        number = f"{prefix}-{today.strftime('%Y%m')}-{seq_str}"
    elif fmt == "year-seq":
        number = f"{prefix}-{today.strftime('%Y')}-{seq_str}"
    elif fmt == "year-month":
        number = f"{prefix}-{today.strftime('%Y-%m')}-{seq_str}"
    elif fmt == "date-full":
        number = f"{prefix}-{today.strftime('%Y-%m-%d')}-{seq_str}"
    else:
        number = f"{prefix}-{today.strftime('%Y%m%d')}-{seq_str}"

    # Collision guard — if this exact number already exists keep incrementing.
    # This handles QuickBooks imports, CSV migrations, manual entries, etc.
    for _ in range(500):
        exists = db.query(Invoice.id).filter(Invoice.invoice_number == number).first()
        if not exists:
            break
        counter += 1
        seq_str = str(counter).zfill(pad)
        if fmt == "sequential":
            number = f"{prefix}-{seq_str}"
        elif fmt == "date-daily":
            number = f"{prefix}-{today.strftime('%Y%m%d')}-{seq_str}"
        elif fmt == "date-monthly":
            number = f"{prefix}-{today.strftime('%Y%m')}-{seq_str}"
        elif fmt == "year-seq":
            number = f"{prefix}-{today.strftime('%Y')}-{seq_str}"
        elif fmt == "year-month":
            number = f"{prefix}-{today.strftime('%Y-%m')}-{seq_str}"
        elif fmt == "date-full":
            number = f"{prefix}-{today.strftime('%Y-%m-%d')}-{seq_str}"
        else:
            number = f"{prefix}-{today.strftime('%Y%m%d')}-{seq_str}"

    # Persist updated counter + period
    if cp:
        cp.invoice_counter        = counter
        cp.invoice_counter_period = period_key
        db.flush()

    return number

def _save_taxes(db, inv_id, taxes_in):
    """Delete old InvoiceTax rows for inv_id and insert new ones. Returns total tax amount."""
    db.query(InvoiceTax).filter(InvoiceTax.invoice_id == inv_id).delete()
    return taxes_in  # caller adds rows after _calc


# ── Helper: create invoice from order (used by dispatch too) ──

def _create_invoice_for_order(order, db: Session, company_id: int) -> "Invoice":
    """
    Auto-generate a Draft invoice for a dispatched order.
    Returns the new Invoice or raises if one already exists.
    """
    existing = db.query(Invoice).filter(
        Invoice.order_id == order.id,
        Invoice.company_id == company_id,
    ).first()
    if existing:
        return existing

    inv = Invoice(
        invoice_number=_next_invoice_number(db, company_id),
        order_id=order.id,
        customer_id=order.customer_id,
        store_name=order.store_name,
        invoice_date=order.dispatch_date or date.today(),
        status="Draft",
        notes=order.notes,
        num_pallets=order.num_pallets,
        tax_rate=0.0,
        discount_amount=0.0,
        previous_balance=0.0,
        company_id=company_id,
    )
    # Apply default payment terms from customer if set
    if order.customer_id and order.customer:
        pt = getattr(order.customer, "payment_terms", None)
        if pt:
            inv.payment_terms = pt
            # Calculate due date
            try:
                days = int(''.join(filter(str.isdigit, pt)))
                inv.due_date = date.today() + timedelta(days=days)
            except Exception:
                pass

    db.add(inv)
    db.flush()

    subtotal = 0.0
    for oi in order.items:
        qty = oi.cases_fulfilled or oi.cases_requested
        if qty <= 0:
            continue
        if oi.unit_price is not None:
            unit_price = oi.unit_price
        elif oi.sku and oi.sku.selling_price is not None:
            unit_price = oi.sku.selling_price
        else:
            unit_price = 0.0
        line_total = round(qty * unit_price, 2)
        subtotal += line_total
        desc = oi.sku.product_name if oi.sku else f"SKU {oi.sku_id}"
        expiry = getattr(oi, "expiry_date_entered", None)
        db.add(InvoiceItem(
            invoice_id=inv.id, sku_id=oi.sku_id,
            description=desc, cases_qty=qty,
            unit_price=unit_price, line_total=line_total,
            expiry_date=expiry, notes=oi.notes,
        ))

    inv.subtotal   = round(subtotal, 2)
    inv.tax_amount = 0.0
    inv.total      = inv.subtotal
    inv.grand_total = inv.subtotal
    db.commit()
    db.refresh(inv)
    return inv


# ── Endpoints ─────────────────────────────────────────────────

@router.get("/aging-summary")
def aging_summary(
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    """Aged receivables totals bucketed by days overdue (all companies Sent/Overdue invoices)."""
    today = date.today()
    invs = db.query(Invoice).filter(
        Invoice.company_id == company_id,
        Invoice.status.in_(["Sent", "Overdue"]),
    ).all()

    amounts = {"current": 0.0, "days_1_30": 0.0, "days_31_60": 0.0, "days_61_90": 0.0, "over_90": 0.0, "total": 0.0}
    counts  = {"current": 0,   "days_1_30": 0,   "days_31_60": 0,   "days_61_90": 0,   "over_90": 0}

    for inv in invs:
        amt = float(inv.grand_total or inv.total or 0)
        amounts["total"] = round(amounts["total"] + amt, 2)

        if inv.due_date and inv.due_date < today:
            days = (today - inv.due_date).days
            if days <= 30:
                amounts["days_1_30"]  = round(amounts["days_1_30"]  + amt, 2); counts["days_1_30"]  += 1
            elif days <= 60:
                amounts["days_31_60"] = round(amounts["days_31_60"] + amt, 2); counts["days_31_60"] += 1
            elif days <= 90:
                amounts["days_61_90"] = round(amounts["days_61_90"] + amt, 2); counts["days_61_90"] += 1
            else:
                amounts["over_90"]    = round(amounts["over_90"]    + amt, 2); counts["over_90"]    += 1
        else:
            amounts["current"] = round(amounts["current"] + amt, 2); counts["current"] += 1

    return {"amounts": amounts, "counts": counts}


@router.post("/mark-overdue-batch")
def mark_overdue_batch(
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    """Mark all Sent invoices with a past due date as Overdue."""
    today = date.today()
    invs = db.query(Invoice).filter(
        Invoice.company_id == company_id,
        Invoice.status == "Sent",
        Invoice.due_date < today,
        Invoice.due_date.isnot(None),
    ).all()
    for inv in invs:
        inv.status = "Overdue"
    db.commit()
    return {"updated": len(invs)}


@router.get("/")
def list_invoices(
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    q = db.query(Invoice).filter(Invoice.company_id == company_id)
    if status:
        q = q.filter(Invoice.status == status)
    invs = q.order_by(Invoice.invoice_date.desc(), Invoice.id.desc()).all()
    return [_fmt(i) for i in invs]


@router.post("/from-order/{order_id}")
def invoice_from_order(
    order_id: int,
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    """Auto-generate invoice from a dispatched order."""
    order = db.query(Order).filter(Order.id == order_id, Order.company_id == company_id).first()
    if not order:
        raise HTTPException(404, "Order not found")
    if order.status != "Dispatched":
        raise HTTPException(400, f"Order is {order.status} — only Dispatched orders can be invoiced")
    existing = db.query(Invoice).filter(
        Invoice.order_id == order_id,
        Invoice.company_id == company_id,
    ).first()
    if existing:
        raise HTTPException(400, f"Invoice {existing.invoice_number} already exists for this order")

    inv = Invoice(
        invoice_number=_next_invoice_number(db, company_id),
        order_id=order.id,
        customer_id=order.customer_id,
        store_name=order.store_name,
        invoice_date=order.dispatch_date or date.today(),
        status="Draft",
        notes=order.notes,
        num_pallets=order.num_pallets,
        tax_rate=0.0,
        discount_amount=0.0,
        previous_balance=0.0,
        company_id=company_id,
    )
    db.add(inv)
    db.flush()

    subtotal = 0.0
    for oi in order.items:
        qty = oi.cases_fulfilled or oi.cases_requested
        if qty <= 0:
            continue
        # Use per-order custom price if set, else fall back to SKU selling_price
        if oi.unit_price is not None:
            unit_price = oi.unit_price
        elif oi.sku and oi.sku.selling_price is not None:
            unit_price = oi.sku.selling_price
        else:
            unit_price = 0.0
        line_total = round(qty * unit_price, 2)
        subtotal  += line_total
        desc = oi.sku.product_name if oi.sku else f"SKU {oi.sku_id}"
        expiry = getattr(oi, 'expiry_date_entered', None)
        db.add(InvoiceItem(invoice_id=inv.id, sku_id=oi.sku_id,
                           description=desc, cases_qty=qty,
                           unit_price=unit_price, line_total=line_total,
                           expiry_date=expiry, notes=oi.notes))

    inv.subtotal  = round(subtotal, 2)
    inv.tax_amount = 0.0
    inv.total      = inv.subtotal
    inv.grand_total = inv.subtotal
    db.commit()
    db.refresh(inv)
    return _fmt(inv)


@router.post("/")
def create_invoice(
    data: InvoiceIn,
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    if not data.items:
        raise HTTPException(400, "At least one item required")

    inv = Invoice(
        invoice_number=_next_invoice_number(db, company_id),
        customer_id=data.customer_id,
        store_name=data.store_name,
        invoice_date=data.invoice_date,
        due_date=data.due_date,
        payment_terms=data.payment_terms,
        notes=data.notes,
        tax_rate=data.taxes[0].rate if data.taxes else 0.0,
        discount_amount=data.discount_amount,
        previous_balance=data.previous_balance,
        status="Draft",
        company_id=company_id,
    )
    db.add(inv)
    db.flush()

    # Line items
    class _ItemProxy:
        def __init__(self, it): self.cases_qty = it.cases_qty; self.unit_price = it.unit_price
    for it in data.items:
        line = round(it.cases_qty * it.unit_price, 2)
        db.add(InvoiceItem(invoice_id=inv.id, sku_id=it.sku_id,
                           description=it.description, cases_qty=it.cases_qty,
                           unit_price=it.unit_price, line_total=line,
                           notes=it.notes))
    db.flush()
    db.refresh(inv)

    subtotal, tax_total, total, grand, tax_amounts = _calc(
        inv.items, data.taxes, data.discount_amount, data.previous_balance
    )
    # Save tax lines
    for i, tx in enumerate(data.taxes):
        db.add(InvoiceTax(invoice_id=inv.id, name=tx.name,
                          rate=tx.rate, amount=tax_amounts[i]))

    inv.subtotal   = subtotal
    inv.tax_amount = tax_total
    inv.total      = total
    inv.grand_total = grand
    db.commit()
    db.refresh(inv)
    return _fmt(inv)


@router.get("/{invoice_id}")
def get_invoice(
    invoice_id: int,
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    inv = db.query(Invoice).filter(Invoice.id == invoice_id, Invoice.company_id == company_id).first()
    if not inv:
        raise HTTPException(404, "Invoice not found")
    return _fmt(inv)


@router.put("/{invoice_id}")
def update_invoice(
    invoice_id: int,
    data: InvoiceUpdate,
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    inv = db.query(Invoice).filter(Invoice.id == invoice_id, Invoice.company_id == company_id).first()
    if not inv:
        raise HTTPException(404, "Invoice not found")
    if inv.status == "Paid":
        raise HTTPException(400, "Cannot edit a Paid invoice")

    if data.store_name       is not None: inv.store_name    = data.store_name
    if data.invoice_date     is not None: inv.invoice_date  = data.invoice_date
    if data.due_date         is not None: inv.due_date      = data.due_date
    if data.payment_terms    is not None: inv.payment_terms = data.payment_terms
    if data.notes            is not None: inv.notes         = data.notes
    if data.status           is not None:
        if data.status not in STATUSES:
            raise HTTPException(400, f"Invalid status: {data.status}")
        inv.status = data.status
    if data.discount_amount  is not None: inv.discount_amount  = data.discount_amount
    if data.previous_balance is not None: inv.previous_balance = data.previous_balance

    if data.items is not None:
        for old in list(inv.items):
            db.delete(old)
        db.flush()
        for it in data.items:
            db.add(InvoiceItem(invoice_id=inv.id, sku_id=it.sku_id,
                               description=it.description, cases_qty=it.cases_qty,
                               unit_price=it.unit_price,
                               line_total=round(it.cases_qty * it.unit_price, 2),
                               notes=it.notes))
        db.flush()
        db.refresh(inv)

    taxes_to_use = data.taxes if data.taxes is not None else inv.taxes
    disc  = inv.discount_amount  or 0.0
    prev  = inv.previous_balance or 0.0

    if data.taxes is not None:
        # Replace tax lines
        db.query(InvoiceTax).filter(InvoiceTax.invoice_id == inv.id).delete()
        db.flush()

        class _TaxProxy:
            def __init__(self, t): self.rate = t.rate
        subtotal, tax_total, total, grand, tax_amounts = _calc(
            inv.items, data.taxes, disc, prev
        )
        for i, tx in enumerate(data.taxes):
            db.add(InvoiceTax(invoice_id=inv.id, name=tx.name,
                              rate=tx.rate, amount=tax_amounts[i]))
    else:
        class _TaxProxy2:
            def __init__(self, t): self.rate = t.rate; self.name = t.name
        existing_taxes = [_TaxProxy2(t) for t in inv.taxes]
        subtotal, tax_total, total, grand, tax_amounts = _calc(
            inv.items, existing_taxes, disc, prev
        )
        for t, amt in zip(inv.taxes, tax_amounts):
            t.amount = amt

    inv.subtotal    = subtotal
    inv.tax_amount  = tax_total
    inv.total       = total
    inv.grand_total = grand
    db.commit()
    db.refresh(inv)
    return _fmt(inv)


@router.post("/{invoice_id}/send")
def send_invoice(
    invoice_id: int,
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    inv = db.query(Invoice).filter(Invoice.id == invoice_id, Invoice.company_id == company_id).first()
    if not inv:
        raise HTTPException(404, "Invoice not found")
    if inv.status != "Draft":
        raise HTTPException(400, f"Invoice is already {inv.status}")
    inv.status = "Sent"
    db.commit()
    return _fmt(inv)


@router.post("/{invoice_id}/mark-paid")
def mark_paid(
    invoice_id: int,
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    inv = db.query(Invoice).filter(Invoice.id == invoice_id, Invoice.company_id == company_id).first()
    if not inv:
        raise HTTPException(404, "Invoice not found")
    if inv.status == "Paid":
        raise HTTPException(400, "Already Paid")
    inv.status = "Paid"
    db.commit()
    return _fmt(inv)


@router.post("/{invoice_id}/mark-overdue")
def mark_overdue(
    invoice_id: int,
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    inv = db.query(Invoice).filter(Invoice.id == invoice_id, Invoice.company_id == company_id).first()
    if not inv:
        raise HTTPException(404, "Invoice not found")
    if inv.status not in ("Sent",):
        raise HTTPException(400, f"Invoice is {inv.status}")
    inv.status = "Overdue"
    db.commit()
    return _fmt(inv)


@router.delete("/{invoice_id}")
def delete_invoice(
    invoice_id: int,
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    inv = db.query(Invoice).filter(Invoice.id == invoice_id, Invoice.company_id == company_id).first()
    if not inv:
        raise HTTPException(404, "Invoice not found")
    if inv.status == "Paid":
        raise HTTPException(400, "Cannot delete a Paid invoice")
    db.delete(inv)
    db.commit()
    return {"ok": True}


# ── Journal Entry helpers ──────────────────────────────────────

def _next_je_number(db: Session, company_id: int) -> str:
    today = date.today()
    prefix = f"JE-{today.strftime('%Y%m%d')}"
    count = db.query(JournalEntry).filter(
        JournalEntry.company_id == company_id,
        JournalEntry.entry_number.like(f"{prefix}%"),
    ).count()
    return f"{prefix}-{str(count + 1).zfill(3)}"


def _create_journal_entry(db: Session, company_id: int, entry_date: date,
                           source_type: str, source_id: int,
                           description: str, lines: list) -> JournalEntry:
    """Create a double-entry journal record. lines = [{'account', 'debit', 'credit', 'notes'}]"""
    je = JournalEntry(
        company_id   = company_id,
        entry_date   = entry_date,
        entry_number = _next_je_number(db, company_id),
        source_type  = source_type,
        source_id    = source_id,
        description  = description,
    )
    db.add(je)
    db.flush()
    for ln in lines:
        db.add(JournalLine(
            entry_id = je.id,
            account  = ln["account"],
            debit    = ln.get("debit", 0.0),
            credit   = ln.get("credit", 0.0),
            notes    = ln.get("notes"),
        ))
    return je


# ── Payment endpoints ──────────────────────────────────────────

@router.get("/{invoice_id}/payments")
def list_payments(
    invoice_id: int,
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    inv = db.query(Invoice).filter(Invoice.id == invoice_id, Invoice.company_id == company_id).first()
    if not inv:
        raise HTTPException(404, "Invoice not found")
    return [_fmt_payment(p) for p in (inv.payments or [])]


@router.post("/{invoice_id}/payments")
def record_payment(
    invoice_id: int,
    data: PaymentIn,
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    """QuickBooks-style Receive Payment — records amount, method, reference against invoice."""
    inv = db.query(Invoice).filter(Invoice.id == invoice_id, Invoice.company_id == company_id).first()
    if not inv:
        raise HTTPException(404, "Invoice not found")
    if inv.status in ("Cancelled",):
        raise HTTPException(400, f"Cannot record payment on a {inv.status} invoice")
    if data.amount <= 0:
        raise HTTPException(400, "Payment amount must be positive")

    payment = InvoicePayment(
        company_id   = company_id,
        invoice_id   = inv.id,
        payment_date = data.payment_date,
        amount       = round(data.amount, 2),
        method       = data.method,
        reference    = data.reference,
        notes        = data.notes,
    )
    db.add(payment)
    db.flush()
    db.refresh(inv)

    # Recalculate paid status
    total_paid = round(sum(p.amount for p in inv.payments), 2)
    grand_total = inv.grand_total or inv.total or 0.0

    if total_paid >= grand_total:
        inv.status = "Paid"
    elif total_paid > 0:
        inv.status = "Partial"
    # else keep existing status (Sent/Overdue)

    # Auto-create journal entry: DR Bank / CR Accounts Receivable
    try:
        _create_journal_entry(
            db, company_id, data.payment_date,
            source_type = "payment",
            source_id   = payment.id,
            description = f"Payment received — {inv.invoice_number} ({data.method})",
            lines = [
                {"account": "Bank / Cash",           "debit": data.amount, "credit": 0.0},
                {"account": "Accounts Receivable",   "debit": 0.0, "credit": data.amount},
            ],
        )
    except Exception:
        pass  # Journal entry failure doesn't block payment

    db.commit()
    db.refresh(inv)
    return _fmt(inv)


@router.delete("/{invoice_id}/payments/{payment_id}")
def delete_payment(
    invoice_id:  int,
    payment_id:  int,
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    inv = db.query(Invoice).filter(Invoice.id == invoice_id, Invoice.company_id == company_id).first()
    if not inv:
        raise HTTPException(404, "Invoice not found")
    pmt = db.query(InvoicePayment).filter(
        InvoicePayment.id == payment_id,
        InvoicePayment.invoice_id == invoice_id,
    ).first()
    if not pmt:
        raise HTTPException(404, "Payment not found")
    db.delete(pmt)
    db.flush()
    db.refresh(inv)

    # Recalculate status
    total_paid = round(sum(p.amount for p in inv.payments), 2)
    grand_total = inv.grand_total or inv.total or 0.0
    if total_paid <= 0:
        inv.status = "Sent" if inv.due_date and inv.due_date >= date.today() else "Overdue"
    elif total_paid < grand_total:
        inv.status = "Partial"
    else:
        inv.status = "Paid"

    db.commit()
    db.refresh(inv)
    return _fmt(inv)


# ── Journal entry endpoints ────────────────────────────────────

@router.get("/journal")
def list_journal(
    limit: int = 50,
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    entries = (
        db.query(JournalEntry)
        .filter(JournalEntry.company_id == company_id)
        .order_by(JournalEntry.entry_date.desc(), JournalEntry.id.desc())
        .limit(limit)
        .all()
    )
    return [
        {
            "id":           e.id,
            "entry_number": e.entry_number,
            "entry_date":   e.entry_date.isoformat() if e.entry_date else None,
            "source_type":  e.source_type,
            "source_id":    e.source_id,
            "description":  e.description,
            "lines":        [
                {"account": l.account, "debit": l.debit, "credit": l.credit, "notes": l.notes}
                for l in e.lines
            ],
        }
        for e in entries
    ]
