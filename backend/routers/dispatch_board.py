"""
Live Dispatch Board router
Endpoints:
  GET  /board/                  → list all orders for a given date (default today), with full board fields
  GET  /board/poll              → lightweight poll — returns last_updated timestamp + row count
                                  Frontend polls this every 5s; only re-fetches full data if changed
  PATCH /board/{order_id}       → update one or more board fields for a row (packing_status, picker_name, etc.)
  GET  /board/summary           → counts per packing_status for today
  GET  /board/dates             → list of dates that have orders (for date picker)
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel
from typing import Optional
from datetime import date, datetime

import sys, os
sys.path.append(os.path.dirname(os.path.dirname(__file__)))
from database import get_db
from models import Order, OrderItem, SKU, Batch, DispatchItem, MonthlyConsumption
from routers.receiving import update_inventory, update_monthly_consumption
from routers.orders import build_pick_list
from security import get_current_user, get_company_id

router = APIRouter(prefix="/board", tags=["Dispatch Board"])

# ── Status flow ───────────────────────────────────────────────
PACKING_STATUSES = ["Queued", "Packing", "Packed", "Loaded", "Done"]
PRIORITIES       = ["Normal", "Urgent", "Express"]

# ── Serialiser ────────────────────────────────────────────────
def _order_to_board_row(o: Order, db: Session) -> dict:
    total_cases = sum(i.cases_requested for i in o.items)
    items_preview = ", ".join(
        f"{i.sku.sku_code} ×{i.cases_requested}" for i in o.items[:4]
    ) + ("…" if len(o.items) > 4 else "")

    # Short-pick data — only meaningful after picking is complete
    is_picked = (o.packing_status or "Queued") in ("Packed", "Loaded", "Done")
    total_cases_picked = sum(i.cases_picked or 0 for i in o.items) if is_picked else None
    short_pick_items = [
        {
            "sku_code":     i.sku.sku_code,
            "product_name": i.sku.product_name,
            "requested":    i.cases_requested,
            "picked":       i.cases_picked or 0,
        }
        for i in o.items
        if is_picked and (i.cases_picked or 0) < i.cases_requested
    ]

    return {
        "id":                 o.id,
        "order_number":       o.order_number,
        "store_name":         o.store_name,
        "store_contact":      o.store_contact,
        "order_date":         o.order_date.isoformat(),
        "dispatch_date":      o.dispatch_date.isoformat() if o.dispatch_date else None,
        "status":             o.status,              # WMS status (Pending/Dispatched etc.)
        "packing_status":     ("Done" if o.status == "Dispatched" and (o.packing_status or "Queued") not in ("Packed", "Loaded", "Done") else (o.packing_status or "Queued")),
        "picker_name":        o.picker_name or "",
        "num_pallets":        o.num_pallets,
        "route":              o.route or "",
        "priority":           o.priority or "Normal",
        "delivery_notes":     o.delivery_notes or "",
        "board_updated_by":   o.board_updated_by or "",
        "board_updated_at":   o.board_updated_at.isoformat() if o.board_updated_at else None,
        "total_cases":        total_cases,
        "total_cases_picked": total_cases_picked,
        "has_short_pick":     len(short_pick_items) > 0,
        "short_pick_items":   short_pick_items,
        "item_count":         len(o.items),
        "items_preview":      items_preview,
        "notes":              o.notes or "",
    }


# ── GET /board/ ───────────────────────────────────────────────
@router.get("/")
def get_board(
    board_date: Optional[date] = None,
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    """Return all orders for a specific date (default=today), with all board fields."""
    target = board_date or date.today()
    orders = db.query(Order).filter(
        Order.order_date == target,
        Order.company_id == company_id,
    ).order_by(Order.created_at.asc()).all()

    return {
        "date":  target.isoformat(),
        "count": len(orders),
        "rows":  [_order_to_board_row(o, db) for o in orders],
    }


# ── GET /board/poll ───────────────────────────────────────────
@router.get("/poll")
def poll_board(
    board_date: Optional[date] = None,
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    """
    Lightweight endpoint polled every ~5 s.
    Returns the latest board_updated_at across all rows for the date.
    Frontend only re-fetches full data when this changes.
    """
    target = board_date or date.today()
    result = db.query(
        func.count(Order.id).label("count"),
        func.max(Order.board_updated_at).label("last_updated"),
        func.max(Order.created_at).label("last_created"),
    ).filter(
        Order.order_date == target,
        Order.company_id == company_id,
    ).first()

    last_change = None
    if result.last_updated:
        last_change = result.last_updated.isoformat()
    elif result.last_created:
        last_change = result.last_created.isoformat()

    return {
        "date":         target.isoformat(),
        "count":        result.count or 0,
        "last_change":  last_change,
    }


# ── PATCH /board/{order_id} ───────────────────────────────────
class BoardUpdateRequest(BaseModel):
    packing_status:  Optional[str] = None
    picker_name:     Optional[str] = None
    num_pallets:     Optional[int] = None
    route:           Optional[str] = None
    priority:        Optional[str] = None
    delivery_notes:  Optional[str] = None
    updated_by:      Optional[str] = None   # name/initials of who made the change


@router.patch("/{order_id}")
def update_board_row(
    order_id: int,
    data: BoardUpdateRequest,
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    order = db.query(Order).filter(
        Order.id == order_id,
        Order.company_id == company_id,
    ).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    # Validate packing_status if provided
    if data.packing_status and data.packing_status not in PACKING_STATUSES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid packing_status. Must be one of: {PACKING_STATUSES}"
        )
    if data.priority and data.priority not in PRIORITIES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid priority. Must be one of: {PRIORITIES}"
        )

    # Apply updates
    if data.packing_status is not None:
        order.packing_status = data.packing_status
        # Auto-sync WMS status: if Done → Dispatched + deduct inventory
        if data.packing_status == "Done" and order.status != "Dispatched":
            today_d = date.today()
            for item in order.items:
                # Use actual cases_picked (from mobile picking) or fall back to cases_requested
                target = (item.cases_picked or 0) if (item.cases_picked or 0) > 0 else item.cases_requested
                picks, _ = build_pick_list(item.sku_id, target, db, company_id)
                fulfilled = 0
                for pick in picks:
                    batch = db.query(Batch).filter(Batch.id == pick["batch_id"]).first()
                    if not batch:
                        continue
                    cases = pick["cases_to_pick"]
                    batch.cases_remaining -= cases
                    update_inventory(item.sku_id, pick["warehouse"], -cases, db, company_id)
                    update_monthly_consumption(item.sku_id, today_d.year, today_d.month, 0, db, company_id)
                    mc = db.query(MonthlyConsumption).filter(
                        MonthlyConsumption.sku_id == item.sku_id,
                        MonthlyConsumption.year == today_d.year,
                        MonthlyConsumption.month == today_d.month,
                        MonthlyConsumption.company_id == company_id,
                    ).first()
                    if mc:
                        mc.cases_dispatched += cases
                    db.add(DispatchItem(
                        order_item_id=item.id,
                        batch_id=pick["batch_id"],
                        warehouse=pick["warehouse"],
                        cases_picked=cases,
                    ))
                    fulfilled += cases
                item.cases_fulfilled = fulfilled
            order.status = "Dispatched"
            if not order.dispatch_date:
                order.dispatch_date = today_d

    if data.picker_name     is not None: order.picker_name    = data.picker_name
    if data.num_pallets     is not None: order.num_pallets    = data.num_pallets
    if data.route           is not None: order.route          = data.route
    if data.priority        is not None: order.priority       = data.priority
    if data.delivery_notes  is not None: order.delivery_notes = data.delivery_notes

    order.board_updated_by = data.updated_by or "—"
    order.board_updated_at = datetime.utcnow()

    db.commit()
    return _order_to_board_row(order, db)


# ── GET /board/summary ────────────────────────────────────────
@router.get("/summary")
def board_summary(
    board_date: Optional[date] = None,
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    """Counts per packing_status for the given date — used for the Kanban column headers."""
    target = board_date or date.today()
    orders = db.query(Order).filter(
        Order.order_date == target,
        Order.company_id == company_id,
    ).all()

    counts = {s: 0 for s in PACKING_STATUSES}
    for o in orders:
        raw = o.packing_status or "Queued"
        # Infer "Done" for orders that were dispatched directly (not via board flow)
        key = "Done" if o.status == "Dispatched" and raw not in ("Packed", "Loaded", "Done") else raw
        counts[key] = counts.get(key, 0) + 1

    total_cases = sum(
        sum(i.cases_requested for i in o.items)
        for o in orders
    )

    return {
        "date":        target.isoformat(),
        "total_orders": len(orders),
        "total_cases": total_cases,
        "by_status":   counts,
    }


# ── GET /board/dates ──────────────────────────────────────────
@router.get("/dates")
def board_dates(
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    """Returns distinct order_dates that have at least one order, last 60 days."""
    rows = db.query(Order.order_date).filter(
        Order.company_id == company_id,
    ).distinct().order_by(Order.order_date.desc()).limit(60).all()
    return [r[0].isoformat() for r in rows if r[0]]
