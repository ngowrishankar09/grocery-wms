"""
Notifications / Alerts endpoint
GET /notifications/  → returns all active alerts, sorted by severity
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from datetime import date, timedelta

import sys, os
sys.path.append(os.path.dirname(os.path.dirname(__file__)))
from database import get_db
from models import SKU, Inventory, Batch, Order
from security import get_current_user, get_company_id

router = APIRouter(prefix="/notifications", tags=["Notifications"])


@router.get("/")
def get_notifications(
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    today = date.today()
    alerts = []

    # ── 1. EXPIRED stock (still remaining) ────────────────────
    expired = db.query(Batch).filter(
        Batch.cases_remaining > 0,
        Batch.has_expiry == True,
        Batch.expiry_date != None,
        Batch.expiry_date < today,
        Batch.company_id == company_id,
    ).all()
    for b in expired:
        alerts.append({
            "id":       f"expired-{b.id}",
            "severity": "critical",
            "type":     "expiry",
            "title":    f"Expired stock — {b.sku.sku_code}",
            "message":  f"{b.sku.product_name} ({b.cases_remaining} cases in {b.warehouse}) expired {(today - b.expiry_date).days} days ago",
            "link":     "/inventory",
            "action":   "Write off or remove",
            "date":     b.expiry_date.isoformat(),
        })

    # ── 2. Expiring within 30 days ────────────────────────────
    expiring_30 = db.query(Batch).filter(
        Batch.cases_remaining > 0,
        Batch.has_expiry == True,
        Batch.expiry_date != None,
        Batch.expiry_date >= today,
        Batch.expiry_date <= today + timedelta(days=30),
        Batch.company_id == company_id,
    ).all()
    for b in expiring_30:
        days = (b.expiry_date - today).days
        alerts.append({
            "id":       f"expiring30-{b.id}",
            "severity": "high",
            "type":     "expiry",
            "title":    f"Expiring in {days} day{'s' if days != 1 else ''} — {b.sku.sku_code}",
            "message":  f"{b.sku.product_name}: {b.cases_remaining} cases in {b.warehouse} expire on {b.expiry_date.isoformat()}",
            "link":     "/inventory",
            "action":   "Prioritise dispatch",
            "date":     b.expiry_date.isoformat(),
        })

    # ── 3. Expiring within 31–60 days ─────────────────────────
    expiring_60 = db.query(Batch).filter(
        Batch.cases_remaining > 0,
        Batch.has_expiry == True,
        Batch.expiry_date != None,
        Batch.expiry_date > today + timedelta(days=30),
        Batch.expiry_date <= today + timedelta(days=60),
        Batch.company_id == company_id,
    ).all()
    for b in expiring_60:
        days = (b.expiry_date - today).days
        alerts.append({
            "id":       f"expiring60-{b.id}",
            "severity": "medium",
            "type":     "expiry",
            "title":    f"Expiring in {days} days — {b.sku.sku_code}",
            "message":  f"{b.sku.product_name}: {b.cases_remaining} cases in {b.warehouse} expire on {b.expiry_date.isoformat()}",
            "link":     "/inventory",
            "action":   "Plan ahead",
            "date":     b.expiry_date.isoformat(),
        })

    # ── 4. Stockouts ──────────────────────────────────────────
    skus = db.query(SKU).filter(SKU.is_active == True, SKU.company_id == company_id).all()
    for sku in skus:
        inv_rows = db.query(Inventory).filter(
            Inventory.sku_id == sku.id,
            Inventory.company_id == company_id,
        ).all()
        total = sum(i.cases_on_hand for i in inv_rows)
        if total == 0:
            alerts.append({
                "id":       f"stockout-{sku.id}",
                "severity": "high",
                "type":     "stock",
                "title":    f"Stockout — {sku.sku_code}",
                "message":  f"{sku.product_name} is completely out of stock (reorder qty: {sku.reorder_qty} cases)",
                "link":     "/skus",
                "action":   "Place purchase order",
                "date":     None,
            })
        elif total <= sku.reorder_point:
            alerts.append({
                "id":       f"lowstock-{sku.id}",
                "severity": "medium",
                "type":     "stock",
                "title":    f"Low stock — {sku.sku_code}",
                "message":  f"{sku.product_name}: {total} cases remaining (reorder point: {sku.reorder_point})",
                "link":     "/forecasting",
                "action":   "Review reorder",
                "date":     None,
            })

    # ── 5. Overdue orders (Pending for > 2 days) ──────────────
    overdue_threshold = today - timedelta(days=2)
    overdue_orders = db.query(Order).filter(
        Order.status == "Pending",
        Order.order_date <= overdue_threshold,
        Order.company_id == company_id,
    ).all()
    for o in overdue_orders:
        days_pending = (today - o.order_date).days
        alerts.append({
            "id":       f"overdue-{o.id}",
            "severity": "medium",
            "type":     "order",
            "title":    f"Order overdue — {o.order_number}",
            "message":  f"Order for {o.store_name} has been pending for {days_pending} days",
            "link":     "/orders",
            "action":   "Dispatch or update",
            "date":     o.order_date.isoformat(),
        })

    # ── Sort: critical → high → medium ────────────────────────
    severity_order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
    alerts.sort(key=lambda a: severity_order.get(a["severity"], 9))

    return {
        "total":    len(alerts),
        "critical": sum(1 for a in alerts if a["severity"] == "critical"),
        "high":     sum(1 for a in alerts if a["severity"] == "high"),
        "medium":   sum(1 for a in alerts if a["severity"] == "medium"),
        "alerts":   alerts,
    }
