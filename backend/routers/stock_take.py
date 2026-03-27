"""
Stock Take / Physical Count router
Endpoints:
  GET  /stock-take/sheet            → list of all SKUs with current system qty for counting
  POST /stock-take/submit           → submit count, get variance report, apply adjustments
  GET  /stock-take/history          → past stock takes

  Damaged/Write-off (separate from stock take):
  POST /stock-take/write-off        → log damaged, expired, or stolen goods with reason
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel
from datetime import date, datetime

import sys, os
sys.path.append(os.path.dirname(os.path.dirname(__file__)))
from database import get_db
from models import SKU, Inventory, Batch, InventoryAdjustment
from security import get_current_user, get_company_id

router = APIRouter(prefix="/stock-take", tags=["Stock Take"])


# ─── Schemas ──────────────────────────────────────────────────
class StockCountItem(BaseModel):
    sku_id:    int
    warehouse: str
    counted:   int          # physical count

class StockTakeSubmit(BaseModel):
    warehouse:   str        # "WH1" | "WH2" | "ALL"
    counted_date: date
    notes:       Optional[str] = None
    items:       List[StockCountItem]
    apply:       bool = True   # if False → preview only, no DB write

class WriteOffItem(BaseModel):
    sku_id:    int
    warehouse: str
    cases:     int
    reason:    str      # "Damaged", "Expired", "Theft", "Other"
    notes:     Optional[str] = None


# ─── GET /stock-take/sheet ─────────────────────────────────────
@router.get("/sheet")
def stock_take_sheet(
    warehouse: Optional[str] = None,
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    """
    Returns all active SKUs with their current system stock — ready to print
    or fill in on-screen as a count sheet.
    """
    q = db.query(SKU).filter(
        SKU.is_active == True,
        SKU.company_id == company_id,
    ).order_by(SKU.category, SKU.product_name)
    skus = q.all()

    warehouses = [warehouse] if warehouse else ["WH1", "WH2"]
    rows = []
    for sku in skus:
        for wh in warehouses:
            inv = db.query(Inventory).filter(
                Inventory.sku_id == sku.id,
                Inventory.warehouse == wh,
                Inventory.company_id == company_id,
            ).first()
            system_qty = inv.cases_on_hand if inv else 0
            rows.append({
                "sku_id":        sku.id,
                "sku_code":      sku.sku_code,
                "product_name":  sku.product_name,
                "category":      sku.category,
                "case_contents": f"{sku.case_size} {sku.unit_label}",
                "warehouse":     wh,
                "system_cases":  system_qty,
                "counted_cases": None,   # to be filled by user
            })
    return {"warehouse_filter": warehouse or "ALL", "rows": rows}


# ─── POST /stock-take/submit ───────────────────────────────────
@router.post("/submit")
def submit_stock_take(
    data: StockTakeSubmit,
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    """
    Compare counted quantities vs system quantities.
    If apply=True, create inventory adjustments for all variances.
    Returns a variance report.
    """
    variances  = []
    no_change  = []
    errors     = []

    for item in data.items:
        sku = db.query(SKU).filter(SKU.id == item.sku_id, SKU.company_id == company_id).first()
        if not sku:
            errors.append(f"SKU ID {item.sku_id} not found")
            continue

        inv = db.query(Inventory).filter(
            Inventory.sku_id == item.sku_id,
            Inventory.warehouse == item.warehouse,
            Inventory.company_id == company_id,
        ).first()
        system_qty = inv.cases_on_hand if inv else 0
        delta = item.counted - system_qty

        entry = {
            "sku_id":       item.sku_id,
            "sku_code":     sku.sku_code,
            "product_name": sku.product_name,
            "warehouse":    item.warehouse,
            "system_cases": system_qty,
            "counted_cases": item.counted,
            "variance":     delta,
            "variance_pct": round((delta / system_qty * 100), 1) if system_qty > 0 else None,
        }

        if delta != 0:
            variances.append(entry)
            if data.apply:
                # Create adjustment record
                if not inv:
                    inv = Inventory(sku_id=item.sku_id, warehouse=item.warehouse, cases_on_hand=0)
                    db.add(inv)
                    db.flush()
                    system_qty = 0

                adj = InventoryAdjustment(
                    sku_id=item.sku_id,
                    warehouse=item.warehouse,
                    before_qty=system_qty,
                    after_qty=item.counted,
                    delta=delta,
                    reason="Stock count correction",
                    notes=f"Stock take {data.counted_date.isoformat()}" + (f" — {data.notes}" if data.notes else ""),
                    company_id=company_id,
                )
                db.add(adj)
                inv.cases_on_hand = item.counted
                inv.updated_at = datetime.utcnow()

                # Adjust most recent active batch for this SKU/WH if delta < 0
                if delta < 0:
                    batch = db.query(Batch).filter(
                        Batch.sku_id == item.sku_id,
                        Batch.warehouse == item.warehouse,
                        Batch.cases_remaining > 0,
                        Batch.company_id == company_id,
                    ).order_by(Batch.received_date.desc()).first()
                    if batch:
                        batch.cases_remaining = max(0, batch.cases_remaining + delta)
        else:
            no_change.append(entry)

    if data.apply:
        db.commit()

    total_gain = sum(v["variance"] for v in variances if v["variance"] > 0)
    total_loss = sum(v["variance"] for v in variances if v["variance"] < 0)

    return {
        "counted_date":  data.counted_date.isoformat(),
        "warehouse":     data.warehouse,
        "applied":       data.apply,
        "total_lines":   len(data.items),
        "variances_found": len(variances),
        "no_change":     len(no_change),
        "total_gain_cases": total_gain,
        "total_loss_cases": abs(total_loss),
        "variances": variances,
        "errors":    errors,
    }


# ─── GET /stock-take/history ───────────────────────────────────
@router.get("/history")
def stock_take_history(
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    """
    Returns adjustments with reason = 'Stock count correction', grouped by date.
    """
    adjs = db.query(InventoryAdjustment).filter(
        InventoryAdjustment.reason == "Stock count correction",
        InventoryAdjustment.company_id == company_id,
    ).order_by(InventoryAdjustment.adjusted_at.desc()).all()

    # Group by date (notes field contains the date)
    from collections import defaultdict
    by_date = defaultdict(list)
    for a in adjs:
        key = a.adjusted_at.strftime('%Y-%m-%d')
        sku = db.query(SKU).filter(SKU.id == a.sku_id, SKU.company_id == company_id).first()
        by_date[key].append({
            "sku_code":     sku.sku_code if sku else "?",
            "product_name": sku.product_name if sku else "?",
            "warehouse":    a.warehouse,
            "before":       a.before_qty,
            "after":        a.after_qty,
            "variance":     a.delta,
            "notes":        a.notes,
        })

    result = [{"date": k, "lines": v, "total_adjustments": len(v)} for k, v in sorted(by_date.items(), reverse=True)]
    return result[:20]  # last 20 stock takes


# ─── POST /stock-take/write-off ────────────────────────────────
@router.post("/write-off")
def write_off(
    items: List[WriteOffItem],
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    """
    Log damaged/expired/stolen/other stock removal with a specific reason.
    Deducts from inventory and logs an adjustment.
    """
    results = []
    errors  = []

    for item in items:
        if item.cases <= 0:
            errors.append(f"SKU {item.sku_id}: cases must be > 0")
            continue

        sku = db.query(SKU).filter(SKU.id == item.sku_id, SKU.company_id == company_id).first()
        if not sku:
            errors.append(f"SKU ID {item.sku_id} not found")
            continue

        inv = db.query(Inventory).filter(
            Inventory.sku_id == item.sku_id,
            Inventory.warehouse == item.warehouse,
            Inventory.company_id == company_id,
        ).first()
        if not inv:
            errors.append(f"{sku.sku_code} — no inventory row for {item.warehouse}")
            continue

        if item.cases > inv.cases_on_hand:
            errors.append(f"{sku.sku_code}: only {inv.cases_on_hand} cases available, cannot write off {item.cases}")
            continue

        before = inv.cases_on_hand
        after  = before - item.cases

        inv.cases_on_hand = after
        inv.updated_at    = datetime.utcnow()

        # Deduct from FEFO batch
        remaining_to_deduct = item.cases
        batches = db.query(Batch).filter(
            Batch.sku_id == item.sku_id,
            Batch.warehouse == item.warehouse,
            Batch.cases_remaining > 0,
            Batch.company_id == company_id,
        ).order_by(Batch.expiry_date.asc().nullslast(), Batch.received_date.asc()).all()

        for b in batches:
            if remaining_to_deduct <= 0:
                break
            take = min(b.cases_remaining, remaining_to_deduct)
            b.cases_remaining -= take
            remaining_to_deduct -= take

        adj = InventoryAdjustment(
            sku_id=item.sku_id,
            warehouse=item.warehouse,
            before_qty=before,
            after_qty=after,
            delta=-item.cases,
            reason=item.reason,
            notes=item.notes,
            company_id=company_id,
        )
        db.add(adj)
        results.append({
            "sku_code":     sku.sku_code,
            "product_name": sku.product_name,
            "warehouse":    item.warehouse,
            "cases_written_off": item.cases,
            "before": before,
            "after":  after,
            "reason": item.reason,
        })

    db.commit()
    return {"written_off": len(results), "errors": errors, "items": results}
