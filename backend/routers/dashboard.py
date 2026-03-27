from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import date, datetime, timedelta

import sys, os
sys.path.append(os.path.dirname(os.path.dirname(__file__)))
from database import get_db
from models import (
    SKU, Inventory, Batch, Order, Transfer, MonthlyConsumption, DispatchRecordItem,
    DispatchRecord, Invoice, Driver, DeliveryRun, CustomerReturn, PurchaseOrder
)
from security import get_current_user, get_company_id

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


@router.get("/")
def get_dashboard(
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    today = date.today()

    # ── Stock counts ──
    skus = db.query(SKU).filter(SKU.is_active == True, SKU.company_id == company_id).all()
    total_skus = len(skus)
    stockout_count = 0
    low_stock_count = 0
    total_cases_in_stock = 0

    for sku in skus:
        inv = db.query(Inventory).filter(
            Inventory.sku_id == sku.id,
            Inventory.company_id == company_id,
        ).all()
        total = sum(i.cases_on_hand for i in inv)
        total_cases_in_stock += total
        if total == 0:
            stockout_count += 1
        elif total <= sku.reorder_point:
            low_stock_count += 1

    # ── Expiry alerts ──
    expiring_critical = db.query(Batch).filter(
        Batch.cases_remaining > 0,
        Batch.has_expiry == True,
        Batch.expiry_date != None,
        Batch.expiry_date <= today + timedelta(days=30),
        Batch.company_id == company_id,
    ).count()

    expiring_warning = db.query(Batch).filter(
        Batch.cases_remaining > 0,
        Batch.has_expiry == True,
        Batch.expiry_date != None,
        Batch.expiry_date > today + timedelta(days=30),
        Batch.expiry_date <= today + timedelta(days=60),
        Batch.company_id == company_id,
    ).count()

    # ── Orders ──
    pending_orders = db.query(Order).filter(
        Order.status == "Pending",
        Order.company_id == company_id,
    ).count()
    today_dispatched = db.query(Order).filter(
        Order.status == "Dispatched",
        Order.dispatch_date == today,
        Order.company_id == company_id,
    ).count()

    # ── Monthly stats ──
    this_month_in = db.query(MonthlyConsumption).filter(
        MonthlyConsumption.year == today.year,
        MonthlyConsumption.month == today.month,
        MonthlyConsumption.company_id == company_id,
    ).all()
    total_received_this_month  = sum(m.cases_received for m in this_month_in)
    total_dispatched_this_month = sum(m.cases_dispatched for m in this_month_in)

    # ── Orders ready to dispatch (picked, awaiting dispatch) ──
    orders_ready_to_dispatch = db.query(Order).filter(
        Order.status == "Pending",
        Order.packing_status == "Packed",
        Order.company_id == company_id,
    ).count()

    # ── Orders awaiting invoice (dispatched, no invoice linked) ──
    from models import Invoice as _Invoice
    dispatched_order_ids = [
        o.id for o in db.query(Order).filter(
            Order.status == "Dispatched",
            Order.company_id == company_id,
        ).all()
    ]
    invoiced_order_ids = set(
        r[0] for r in db.query(_Invoice.order_id).filter(
            _Invoice.order_id.isnot(None),
            _Invoice.company_id == company_id,
        ).all()
    )
    orders_awaiting_invoice = len([oid for oid in dispatched_order_ids if oid not in invoiced_order_ids])

    # ── Overdue orders ──
    overdue_threshold = today - timedelta(days=2)
    overdue_orders_list = db.query(Order).filter(
        Order.status == "Pending",
        Order.order_date <= overdue_threshold,
        Order.company_id == company_id,
    ).order_by(Order.order_date.asc()).all()

    # ── Recent expiring batches ──
    expiring_batches = db.query(Batch).filter(
        Batch.cases_remaining > 0,
        Batch.has_expiry == True,
        Batch.expiry_date != None,
        Batch.expiry_date <= today + timedelta(days=60),
        Batch.company_id == company_id,
    ).order_by(Batch.expiry_date.asc()).limit(5).all()

    # ── WH2 only items ──
    wh2_only = []
    for sku in skus:
        inv = db.query(Inventory).filter(
            Inventory.sku_id == sku.id,
            Inventory.company_id == company_id,
        ).all()
        wh1 = next((i.cases_on_hand for i in inv if i.warehouse == "WH1"), 0)
        wh2 = next((i.cases_on_hand for i in inv if i.warehouse == "WH2"), 0)
        if wh1 == 0 and wh2 > 0:
            wh2_only.append({"sku_code": sku.sku_code, "product_name": sku.product_name, "wh2_cases": wh2})

    # ── Top sellers ──
    thirty_days_ago = today - timedelta(days=30)
    top_sellers_raw = db.query(
        MonthlyConsumption.sku_id,
        func.sum(MonthlyConsumption.cases_dispatched).label("total_dispatched")
    ).filter(
        MonthlyConsumption.year >= thirty_days_ago.year,
        MonthlyConsumption.company_id == company_id,
    ).group_by(MonthlyConsumption.sku_id)\
     .order_by(func.sum(MonthlyConsumption.cases_dispatched).desc())\
     .limit(8).all()

    top_sellers = []
    for row in top_sellers_raw:
        sku = db.query(SKU).filter(SKU.id == row.sku_id, SKU.company_id == company_id).first()
        if sku and row.total_dispatched > 0:
            top_sellers.append({
                "sku_code": sku.sku_code, "product_name": sku.product_name,
                "category": sku.category, "cases_dispatched_30d": row.total_dispatched,
            })

    # ── Slow movers ──
    slow_movers = []
    for sku in skus:
        inv = db.query(Inventory).filter(
            Inventory.sku_id == sku.id,
            Inventory.company_id == company_id,
        ).all()
        total = sum(i.cases_on_hand for i in inv)
        if total == 0:
            continue
        dispatched_60d = db.query(func.sum(MonthlyConsumption.cases_dispatched)).filter(
            MonthlyConsumption.sku_id == sku.id,
            MonthlyConsumption.company_id == company_id,
        ).scalar() or 0
        if dispatched_60d == 0:
            slow_movers.append({
                "sku_code": sku.sku_code, "product_name": sku.product_name,
                "category": sku.category, "total_cases": total, "days_no_movement": 60,
            })

    # ── Invoice / Revenue stats ──
    invoice_outstanding = db.query(func.sum(Invoice.grand_total)).filter(
        Invoice.status.in_(["Sent", "Overdue"]),
        Invoice.company_id == company_id,
    ).scalar() or 0.0

    invoices_overdue = db.query(Invoice).filter(
        Invoice.status == "Overdue",
        Invoice.company_id == company_id,
    ).count()

    invoiced_this_month = db.query(func.sum(Invoice.grand_total)).filter(
        func.strftime('%Y-%m', Invoice.invoice_date) == today.strftime('%Y-%m'),
        Invoice.company_id == company_id,
    ).scalar() or 0.0

    invoices_paid_this_month = db.query(Invoice).filter(
        Invoice.status == "Paid",
        func.strftime('%Y-%m', Invoice.invoice_date) == today.strftime('%Y-%m'),
        Invoice.company_id == company_id,
    ).count()

    # ── Delivery / Driver stats ──
    drivers_on_route = db.query(Driver).filter(
        Driver.status == "On Route",
        Driver.is_active == True,
        Driver.company_id == company_id,
    ).count()
    drivers_available = db.query(Driver).filter(
        Driver.status == "Available",
        Driver.is_active == True,
        Driver.company_id == company_id,
    ).count()

    runs_today = db.query(DeliveryRun).filter(
        DeliveryRun.run_date == today,
        DeliveryRun.company_id == company_id,
    ).count()
    runs_completed_today = db.query(DeliveryRun).filter(
        DeliveryRun.run_date == today,
        DeliveryRun.status == "Completed",
        DeliveryRun.company_id == company_id,
    ).count()

    # ── Returns stats ──
    pending_returns = db.query(CustomerReturn).filter(
        CustomerReturn.status == "Pending",
        CustomerReturn.company_id == company_id,
    ).count() if hasattr(CustomerReturn, 'status') else 0

    # ── Purchase Orders ──
    pending_pos = 0
    try:
        pending_pos = db.query(PurchaseOrder).filter(
            PurchaseOrder.status.in_(["draft", "sent"]),
            PurchaseOrder.company_id == company_id,
        ).count()
    except Exception:
        pass

    # ── Recent Activity Feed ──
    activity = []

    # Recent dispatches
    recent_dispatches = db.query(DispatchRecord).filter(
        DispatchRecord.company_id == company_id,
    ).order_by(
        DispatchRecord.created_at.desc()
    ).limit(5).all()
    for d in recent_dispatches:
        activity.append({
            "type": "dispatch", "icon": "truck", "color": "blue",
            "title": f"Dispatched: {d.ref}",
            "detail": f"Date: {d.dispatch_date}",
            "time": d.created_at.isoformat() if d.created_at else None,
            "link": "/dispatch",
        })

    # Recent receiving
    recent_batches = db.query(Batch).filter(
        Batch.company_id == company_id,
    ).order_by(Batch.received_date.desc()).limit(5).all()
    for b in recent_batches:
        activity.append({
            "type": "receiving", "icon": "package", "color": "green",
            "title": f"Received: {b.sku.product_name if b.sku else 'SKU'}",
            "detail": f"{b.cases_received} cases · {b.warehouse}",
            "time": datetime.combine(b.received_date, datetime.min.time()).isoformat() if b.received_date else None,
            "link": "/receiving",
        })

    # Recent invoices
    recent_invoices = db.query(Invoice).filter(
        Invoice.company_id == company_id,
    ).order_by(Invoice.created_at.desc()).limit(3).all()
    for inv in recent_invoices:
        activity.append({
            "type": "invoice", "icon": "receipt", "color": "purple",
            "title": f"Invoice {inv.invoice_number}",
            "detail": f"{inv.store_name} · ${inv.grand_total:.2f} · {inv.status}",
            "time": inv.created_at.isoformat() if inv.created_at else None,
            "link": "/invoices",
        })

    # Recent returns
    try:
        recent_returns = db.query(CustomerReturn).filter(
            CustomerReturn.company_id == company_id,
        ).order_by(
            CustomerReturn.created_at.desc()
        ).limit(3).all()
        for r in recent_returns:
            activity.append({
                "type": "return", "icon": "rotate-ccw", "color": "orange",
                "title": f"Return: {r.return_number}",
                "detail": f"{r.store_name} · {r.status}",
                "time": r.created_at.isoformat() if r.created_at else None,
                "link": "/returns",
            })
    except Exception:
        pass

    # Sort all activity by time descending, take top 10
    activity.sort(key=lambda x: x["time"] or "", reverse=True)
    activity = activity[:10]

    return {
        "summary": {
            "total_skus": total_skus,
            "stockout_count": stockout_count,
            "low_stock_count": low_stock_count,
            "expiring_critical": expiring_critical,
            "expiring_warning": expiring_warning,
            "pending_orders": pending_orders,
            "today_dispatched": today_dispatched,
            "received_this_month": total_received_this_month,
            "dispatched_this_month": total_dispatched_this_month,
            "overdue_orders": len(overdue_orders_list),
            "total_cases_in_stock": total_cases_in_stock,
            "slow_movers_count": len(slow_movers),
            # new
            "invoice_outstanding": round(invoice_outstanding, 2),
            "invoices_overdue": invoices_overdue,
            "invoiced_this_month": round(invoiced_this_month, 2),
            "invoices_paid_this_month": invoices_paid_this_month,
            "drivers_on_route": drivers_on_route,
            "drivers_available": drivers_available,
            "runs_today": runs_today,
            "runs_completed_today": runs_completed_today,
            "pending_returns": pending_returns,
            "pending_pos": pending_pos,
            "orders_ready_to_dispatch": orders_ready_to_dispatch,
            "orders_awaiting_invoice": orders_awaiting_invoice,
        },
        "expiring_soon": [
            {
                "batch_code": b.batch_code,
                "product_name": b.sku.product_name,
                "sku_code": b.sku.sku_code,
                "cases_remaining": b.cases_remaining,
                "warehouse": b.warehouse,
                "expiry_date": b.expiry_date.isoformat(),
                "days_to_expiry": (b.expiry_date - today).days,
            }
            for b in expiring_batches
        ],
        "wh2_only_items": wh2_only[:10],
        "top_sellers": top_sellers[:8],
        "slow_movers": slow_movers[:8],
        "overdue_orders": [
            {
                "order_number": o.order_number,
                "store_name": o.store_name,
                "order_date": o.order_date.isoformat(),
                "days_pending": (today - o.order_date).days,
            }
            for o in overdue_orders_list[:5]
        ],
        "activity_feed": activity,
    }
