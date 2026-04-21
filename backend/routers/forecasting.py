from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from datetime import date, datetime, timedelta
from typing import Optional

import sys, os
sys.path.append(os.path.dirname(os.path.dirname(__file__)))
from database import get_db
from models import SKU, Inventory, MonthlyConsumption, Batch, PurchaseOrder, PurchaseOrderItem
from security import get_current_user, get_company_id

router = APIRouter(prefix="/forecasting", tags=["Forecasting"])

def get_avg_monthly_dispatch(sku_id: int, months: int, db: Session, company_id: int = None) -> float:
    q = db.query(MonthlyConsumption).filter(
        MonthlyConsumption.sku_id == sku_id,
        MonthlyConsumption.cases_dispatched > 0,
    )
    if company_id is not None:
        q = q.filter(MonthlyConsumption.company_id == company_id)
    records = q.order_by(
        MonthlyConsumption.year.desc(),
        MonthlyConsumption.month.desc()
    ).limit(months).all()

    if not records:
        return 0.0

    # Weighted average - more recent months weighted higher
    total_weight = 0
    weighted_sum = 0
    for i, rec in enumerate(records):
        weight = months - i  # most recent gets highest weight
        weighted_sum += rec.cases_dispatched * weight
        total_weight += weight

    return weighted_sum / total_weight if total_weight > 0 else 0.0


@router.get("/")
def get_forecast(
    months_back: int = 3,
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    skus = db.query(SKU).filter(SKU.is_active == True, SKU.company_id == company_id).all()
    today = date.today()
    results = []

    for sku in skus:
        inv = db.query(Inventory).filter(
            Inventory.sku_id == sku.id,
            Inventory.company_id == company_id,
        ).all()
        wh1 = next((i.cases_on_hand for i in inv if i.warehouse == "WH1"), 0)
        wh2 = next((i.cases_on_hand for i in inv if i.warehouse == "WH2"), 0)
        total = wh1 + wh2

        avg_monthly = get_avg_monthly_dispatch(sku.id, months_back, db, company_id)
        daily_rate = avg_monthly / 30 if avg_monthly > 0 else 0

        days_of_stock = (total / daily_rate) if daily_rate > 0 else 999
        days_of_stock = min(days_of_stock, 999)

        # Reorder date = days of stock - lead time
        days_until_reorder = max(0, days_of_stock - sku.lead_time_days)

        # Suggested reorder qty = 2 months demand + 20% buffer
        suggested_qty = int(avg_monthly * 2 * 1.2) if avg_monthly > 0 else sku.reorder_qty

        # Status
        if avg_monthly == 0:
            reorder_status = "no_data"
        elif days_of_stock <= sku.lead_time_days:
            reorder_status = "urgent"
        elif total <= sku.reorder_point:
            reorder_status = "order_now"
        elif days_until_reorder <= 7:
            reorder_status = "order_soon"
        elif days_until_reorder <= 14:
            reorder_status = "monitor"
        else:
            reorder_status = "ok"

        # Next 3 months projection
        projections = []
        for m in range(1, 4):
            proj_month = (today.month + m - 1) % 12 + 1
            proj_year = today.year + (today.month + m - 1) // 12
            projections.append({
                "month": proj_month,
                "year": proj_year,
                "projected_cases": round(avg_monthly),
            })

        # Stockout / reorder-point crossing dates (used by the depletion chart)
        if daily_rate > 0:
            days_to_stockout  = int(total / daily_rate)
            days_to_reorder_pt = max(0, int((total - sku.reorder_point) / daily_rate))
            stockout_date   = (today + timedelta(days=days_to_stockout)).isoformat()
            reorder_pt_date = (today + timedelta(days=days_to_reorder_pt)).isoformat()
        else:
            stockout_date   = None
            reorder_pt_date = None

        results.append({
            "sku_id":    sku.id,
            "sku_code":  sku.sku_code,
            "cost_price": sku.cost_price,
            "product_name": sku.product_name,
            "category": sku.category,
            "vendor_name": sku.vendor.name if sku.vendor else None,
            "wh1_cases": wh1,
            "wh2_cases": wh2,
            "total_cases": total,
            "avg_monthly_dispatch": round(avg_monthly, 1),
            "daily_rate": round(daily_rate, 2),
            "days_of_stock": round(days_of_stock, 0) if days_of_stock < 999 else None,
            "days_until_reorder": round(days_until_reorder, 0),
            "stockout_date":    stockout_date,
            "reorder_pt_date":  reorder_pt_date,
            "reorder_point": sku.reorder_point,
            "suggested_reorder_qty": suggested_qty,
            "lead_time_days": sku.lead_time_days,
            "reorder_status": reorder_status,
            "projections": projections,
        })

    # Sort: urgent first
    priority = {"urgent": 0, "order_now": 1, "order_soon": 2, "monitor": 3, "ok": 4, "no_data": 5}
    results.sort(key=lambda x: priority.get(x["reorder_status"], 9))

    return results


@router.get("/reorder-list")
def get_reorder_list(
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    """Group reorder suggestions by vendor"""
    forecast = get_forecast(db=db, company_id=company_id)

    actionable = [f for f in forecast if f["reorder_status"] in ("urgent", "order_now", "order_soon")]

    # Group by vendor
    by_vendor = {}
    for item in actionable:
        vendor = item["vendor_name"] or "Unknown Vendor"
        if vendor not in by_vendor:
            by_vendor[vendor] = {"vendor": vendor, "vendor_id": None, "items": [], "total_cases": 0}
        # Capture vendor_id from SKU
        if by_vendor[vendor]["vendor_id"] is None:
            sku = db.query(SKU).filter(SKU.id == item["sku_id"], SKU.company_id == company_id).first()
            if sku and sku.vendor_id:
                by_vendor[vendor]["vendor_id"] = sku.vendor_id
        by_vendor[vendor]["items"].append({
            "sku_id": item["sku_id"],
            "sku_code": item["sku_code"],
            "product_name": item["product_name"],
            "current_stock": item["total_cases"],
            "avg_monthly": item["avg_monthly_dispatch"],
            "suggested_qty": item["suggested_reorder_qty"],
            "cost_price": item.get("cost_price"),
            "status": item["reorder_status"],
        })
        by_vendor[vendor]["total_cases"] += item["suggested_reorder_qty"]

    return list(by_vendor.values())


@router.post("/generate-pos")
def generate_purchase_orders(
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    """
    Auto-generate draft Purchase Orders from the reorder list.
    One PO per vendor. Skips vendors with no SKUs needing reorder.
    Returns list of created POs.
    """
    forecast = get_forecast(db=db, company_id=company_id)
    actionable = [f for f in forecast if f["reorder_status"] in ("urgent", "order_now", "order_soon")]

    if not actionable:
        return {"created": 0, "pos": []}

    # Group by vendor_id
    by_vendor = {}
    for item in actionable:
        sku = db.query(SKU).filter(SKU.id == item["sku_id"], SKU.company_id == company_id).first()
        vendor_id = sku.vendor_id if sku else None
        key = vendor_id or "unknown"
        if key not in by_vendor:
            by_vendor[key] = {"vendor_id": vendor_id, "items": []}
        by_vendor[key]["items"].append({
            "sku_id": item["sku_id"],
            "cases_ordered": item["suggested_reorder_qty"],
            "unit_cost": sku.cost_price if sku else None,
        })

    # Generate PO number helper
    def _next_po_number():
        year = datetime.utcnow().year
        prefix = f"PO-{year}-"
        last = db.query(PurchaseOrder).filter(
            PurchaseOrder.po_number.like(f"{prefix}%"),
            PurchaseOrder.company_id == company_id,
        ).order_by(PurchaseOrder.id.desc()).first()
        seq = 1
        if last:
            try:
                seq = int(last.po_number.split("-")[-1]) + 1
            except Exception:
                pass
        # Also count within this transaction
        seq += len(created_pos)
        return f"{prefix}{seq:04d}"

    created_pos = []
    for key, group in by_vendor.items():
        po = PurchaseOrder(
            po_number   = _next_po_number(),
            vendor_id   = group["vendor_id"],
            warehouse   = "WH1",
            notes       = "Auto-generated from reorder forecast",
            status      = "draft",
            company_id  = company_id,
        )
        db.add(po)
        db.flush()

        for item in group["items"]:
            db.add(PurchaseOrderItem(
                po_id         = po.id,
                sku_id        = item["sku_id"],
                cases_ordered = item["cases_ordered"],
                unit_cost     = item["unit_cost"],
            ))

        created_pos.append({
            "po_number": po.po_number,
            "vendor_id": group["vendor_id"],
            "items": len(group["items"]),
        })

    db.commit()
    return {"created": len(created_pos), "pos": created_pos}


@router.get("/consumption-history/{sku_id}")
def get_consumption_history(
    sku_id: int,
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    records = db.query(MonthlyConsumption).filter(
        MonthlyConsumption.sku_id == sku_id,
        MonthlyConsumption.company_id == company_id,
    ).order_by(
        MonthlyConsumption.year.asc(),
        MonthlyConsumption.month.asc()
    ).all()

    return [
        {
            "year": r.year,
            "month": r.month,
            "cases_dispatched": r.cases_dispatched,
            "cases_received": r.cases_received,
        }
        for r in records
    ]
