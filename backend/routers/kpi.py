from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import date, timedelta
import sys, os
sys.path.append(os.path.dirname(os.path.dirname(__file__)))
from database import get_db
from models import Order, Invoice, InvoicePayment, PurchaseOrder, PurchaseOrderItem, Inventory, SKU, OrderItem
from security import get_current_user, get_company_id as get_current_company_id

router = APIRouter(prefix="/kpi", tags=["kpi"])


@router.get("/scorecard")
def get_scorecard(period_days: int = 30, db: Session = Depends(get_db), company_id: int = Depends(get_current_company_id)):
    today = date.today()
    since = today - timedelta(days=period_days)

    # ── Fill Rate: cases_fulfilled / cases_requested ──────────────
    items = db.query(OrderItem).join(Order).filter(
        Order.company_id == company_id,
        Order.order_date >= since,
        Order.status == "Dispatched"
    ).all()
    total_requested = sum(i.cases_requested for i in items)
    total_fulfilled = sum(i.cases_fulfilled for i in items)
    fill_rate = (total_fulfilled / total_requested * 100) if total_requested > 0 else 100.0

    # ── On-Time Delivery: orders dispatched on or before promised_date ─
    dispatched_orders = db.query(Order).filter(
        Order.company_id == company_id,
        Order.order_date >= since,
        Order.status == "Dispatched"
    ).all()
    on_time = 0
    total_with_promise = 0
    for o in dispatched_orders:
        promised = getattr(o, 'promised_date', None)
        if promised and o.dispatch_date:
            total_with_promise += 1
            if o.dispatch_date <= promised:
                on_time += 1
    on_time_rate = (on_time / total_with_promise * 100) if total_with_promise > 0 else None

    # ── Inventory Turnover: COGS / avg inventory value ─────────────
    # Simplified: (cases dispatched in period * avg cost) / avg inventory
    inv_rows = db.query(
        SKU.cost_price, func.sum(Inventory.cases_on_hand)
    ).join(Inventory, SKU.id == Inventory.sku_id).filter(
        SKU.company_id == company_id
    ).group_by(SKU.id).all()
    total_inv_value = sum((cp or 0) * qty for cp, qty in inv_rows)

    # COGS approximation from PO receiving
    cogs = 0
    po_items = db.query(PurchaseOrderItem).join(PurchaseOrder).filter(
        PurchaseOrder.company_id == company_id,
        PurchaseOrder.created_at >= since
    ).all()
    for pi in po_items:
        cogs += (pi.unit_cost or 0) * (pi.cases_received or 0)

    inv_turnover = (cogs / total_inv_value) if total_inv_value > 0 else 0

    # ── Avg Days to Pay ───────────────────────────────────────────
    payments = db.query(InvoicePayment).filter(
        InvoicePayment.company_id == company_id,
        InvoicePayment.payment_date >= since
    ).all()
    days_to_pay_list = []
    for p in payments:
        inv = p.invoice
        if inv and inv.invoice_date and p.payment_date:
            delta = (p.payment_date - inv.invoice_date).days
            if delta >= 0:
                days_to_pay_list.append(delta)
    avg_days_to_pay = (sum(days_to_pay_list) / len(days_to_pay_list)) if days_to_pay_list else None

    # ── Perfect Order Rate ────────────────────────────────────────
    total_orders = len(dispatched_orders)
    # perfect = dispatched on time + fill rate 100%
    perfect = 0
    for o in dispatched_orders:
        order_items = [i for i in items if i.order_id == o.id]
        if not order_items:
            continue
        order_fill = sum(i.cases_fulfilled for i in order_items) / sum(i.cases_requested for i in order_items) if sum(i.cases_requested for i in order_items) > 0 else 1
        promised = getattr(o, 'promised_date', None)
        on_time_ok = (o.dispatch_date <= promised) if (promised and o.dispatch_date) else True
        if order_fill >= 0.99 and on_time_ok:
            perfect += 1
    perfect_order_rate = (perfect / total_orders * 100) if total_orders > 0 else None

    # ── Revenue this period ───────────────────────────────────────
    revenue_result = db.query(func.sum(Invoice.grand_total)).filter(
        Invoice.company_id == company_id,
        Invoice.invoice_date >= since,
        Invoice.status.notin_(["Cancelled", "Draft"])
    ).scalar() or 0

    # ── Outstanding AR ────────────────────────────────────────────
    ar_result = db.query(func.sum(Invoice.grand_total)).filter(
        Invoice.company_id == company_id,
        Invoice.status.in_(["Sent", "Overdue", "Partial"])
    ).scalar() or 0

    paid_result = db.query(func.sum(InvoicePayment.amount)).join(Invoice).filter(
        Invoice.company_id == company_id,
        Invoice.status.in_(["Sent", "Overdue", "Partial"])
    ).scalar() or 0

    outstanding_ar = ar_result - paid_result

    # ── Low Stock SKUs ────────────────────────────────────────────
    low_stock_skus = db.query(SKU).filter(SKU.company_id == company_id, SKU.is_active == True).all()
    inv_by_sku = {}
    for row in db.query(Inventory.sku_id, func.sum(Inventory.cases_on_hand)).filter(
        Inventory.sku_id.in_([s.id for s in low_stock_skus])
    ).group_by(Inventory.sku_id).all():
        inv_by_sku[row[0]] = row[1]

    low_stock_count = sum(1 for s in low_stock_skus if (inv_by_sku.get(s.id, 0) or 0) <= (s.reorder_point or 10))

    return {
        "period_days": period_days,
        "since": str(since),
        "fill_rate": round(fill_rate, 1),
        "on_time_delivery_rate": round(on_time_rate, 1) if on_time_rate is not None else None,
        "inventory_turnover": round(inv_turnover, 2),
        "avg_days_to_pay": round(avg_days_to_pay, 1) if avg_days_to_pay is not None else None,
        "perfect_order_rate": round(perfect_order_rate, 1) if perfect_order_rate is not None else None,
        "revenue": round(revenue_result, 2),
        "outstanding_ar": round(outstanding_ar, 2),
        "total_orders": total_orders,
        "low_stock_count": low_stock_count,
    }
