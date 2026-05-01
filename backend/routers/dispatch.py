from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional, List
from pydantic import BaseModel
from datetime import date, datetime

import sys, os
sys.path.append(os.path.dirname(os.path.dirname(__file__)))
from database import get_db
from models import (
    SKU, Batch, Inventory, MonthlyConsumption,
    DispatchRecord, DispatchRecordItem, SkuBulkLink
)
from routers.receiving import update_inventory, update_monthly_consumption
from security import get_current_user, get_company_id

router = APIRouter(prefix="/dispatch", tags=["Dispatch"])

# ─── Schemas ──────────────────────────────────────────────────
class DispatchItemIn(BaseModel):
    sku_id: int
    cases: int

class DispatchCreate(BaseModel):
    ref: Optional[str] = None          # invoice / DO / any reference — optional
    note: Optional[str] = None
    dispatch_date: date
    items: List[DispatchItemIn]

# ─── Helpers ──────────────────────────────────────────────────
def _weight_to_kg(weight, uom):
    """Convert weight + uom to kg float. Returns None if weight is None."""
    if not weight:
        return None
    uom = (uom or "g").lower()
    if uom == "kg":  return float(weight)
    if uom == "g":   return float(weight) / 1000
    if uom == "lbs": return float(weight) * 0.453592
    if uom == "oz":  return float(weight) * 0.0283495
    return float(weight) / 1000  # fallback


def deplete_bulk_for_local_pack(
    retail_sku: "SKU",
    cases_fulfilled: int,
    company_id: int,
    db: Session,
):
    """When a retail SKU with local_pack_active=True is dispatched,
    deduct the equivalent kg from the linked bulk SKU's inventory.

    Uses a float accumulator (bulk_kg_consumed) so fractional-sack consumption
    is tracked precisely.  When the accumulator crosses a full sack's worth,
    cases_on_hand is decremented by the appropriate integer count.
    """
    link = db.query(SkuBulkLink).filter(
        SkuBulkLink.retail_sku_id   == retail_sku.id,
        SkuBulkLink.local_pack_active == True,
        SkuBulkLink.company_id      == company_id,
    ).first()
    if not link:
        return

    bulk_sku = db.query(SKU).filter(
        SKU.id == link.bulk_sku_id,
        SKU.company_id == company_id,
    ).first()
    if not bulk_sku:
        return

    # kg per individual retail unit (not per case)
    unit_kg = _weight_to_kg(retail_sku.unit_weight, retail_sku.unit_weight_uom)
    if not unit_kg:
        return  # can't calculate without unit weight

    total_units   = cases_fulfilled * (retail_sku.case_size or 1)
    kg_to_consume = total_units * unit_kg

    # kg per bulk sack/bag (used to convert kg → integer case deductions)
    bulk_unit_kg = _weight_to_kg(bulk_sku.unit_weight, bulk_sku.unit_weight_uom)
    if not bulk_unit_kg or bulk_unit_kg <= 0:
        return

    # Deduct from WH1 first, then WH2
    for wh in ["WH1", "WH2"]:
        if kg_to_consume <= 0:
            break
        inv = db.query(Inventory).filter(
            Inventory.sku_id    == bulk_sku.id,
            Inventory.warehouse == wh,
            Inventory.company_id == company_id,
        ).first()
        if inv is None:
            continue

        inv.bulk_kg_consumed = (inv.bulk_kg_consumed or 0.0) + kg_to_consume
        kg_to_consume = 0.0

        # Convert accumulated kg into whole-sack deductions
        full_sacks = int(inv.bulk_kg_consumed // bulk_unit_kg)
        if full_sacks > 0:
            actual_deduct       = min(full_sacks, max(0, inv.cases_on_hand))
            inv.cases_on_hand   = max(0, inv.cases_on_hand - actual_deduct)
            inv.bulk_kg_consumed -= full_sacks * bulk_unit_kg   # keep the remainder


def generate_dispatch_ref(db: Session) -> str:
    count = db.query(DispatchRecord).count()
    return f"DSP-{datetime.utcnow().strftime('%Y%m%d')}-{count + 1:04d}"

def deduct_fefo(sku_id: int, cases_needed: int, db: Session, company_id: int = None):
    """
    Deduct `cases_needed` from batches using FEFO (earliest expiry first),
    WH1 first then WH2.
    Returns list of picks made and unfulfilled quantity.
    """
    picks = []
    remaining = cases_needed

    for wh in ["WH1", "WH2"]:
        if remaining <= 0:
            break
        q = db.query(Batch).filter(
            Batch.sku_id == sku_id,
            Batch.warehouse == wh,
            Batch.cases_remaining > 0,
        )
        if company_id is not None:
            q = q.filter(Batch.company_id == company_id)
        batches = q.order_by(
            Batch.expiry_date.asc().nullslast(),
            Batch.received_date.asc()
        ).all()

        for batch in batches:
            if remaining <= 0:
                break
            take = min(batch.cases_remaining, remaining)
            batch.cases_remaining -= take
            update_inventory(sku_id, wh, -take, db, company_id)
            picks.append({
                "batch_code": batch.batch_code,
                "warehouse": wh,
                "cases": take,
                "expiry_date": batch.expiry_date.isoformat() if batch.expiry_date else None,
            })
            remaining -= take

    return picks, remaining  # remaining > 0 = shortfall

# ─── POST /dispatch/ — create and immediately execute ────────
@router.post("/")
def create_dispatch(
    data: DispatchCreate,
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    ref = data.ref.strip() if data.ref else generate_dispatch_ref(db)

    # Check duplicate ref
    if db.query(DispatchRecord).filter(
        DispatchRecord.ref == ref,
        DispatchRecord.company_id == company_id,
    ).first():
        raise HTTPException(status_code=400, detail=f"Reference '{ref}' already exists")

    record = DispatchRecord(
        ref=ref,
        note=data.note,
        dispatch_date=data.dispatch_date,
        company_id=company_id,
    )
    db.add(record)
    db.flush()

    results = []
    warnings = []

    for item in data.items:
        sku = db.query(SKU).filter(SKU.id == item.sku_id, SKU.company_id == company_id).first()
        if not sku:
            raise HTTPException(status_code=404, detail=f"SKU {item.sku_id} not found")

        picks, unfulfilled = deduct_fefo(item.sku_id, item.cases, db, company_id)
        fulfilled = item.cases - unfulfilled

        # Update monthly consumption
        today = data.dispatch_date
        update_monthly_consumption(item.sku_id, today.year, today.month, 0, db, company_id)
        mc = db.query(MonthlyConsumption).filter(
            MonthlyConsumption.sku_id == item.sku_id,
            MonthlyConsumption.year == today.year,
            MonthlyConsumption.month == today.month,
            MonthlyConsumption.company_id == company_id,
        ).first()
        if mc:
            mc.cases_dispatched += fulfilled

        # Save record item
        rec_item = DispatchRecordItem(
            dispatch_id=record.id,
            sku_id=item.sku_id,
            cases_requested=item.cases,
            cases_fulfilled=fulfilled,
            picks_json=str(picks),   # simple storage
        )
        db.add(rec_item)

        results.append({
            "sku_code": sku.sku_code,
            "product_name": sku.product_name,
            "requested": item.cases,
            "fulfilled": fulfilled,
            "picks": picks,
        })
        if unfulfilled > 0:
            warnings.append(f"{sku.product_name}: only {fulfilled}/{item.cases} cases available")

        # Auto-deplete linked bulk SKU if this retail SKU is packed in-store
        if fulfilled > 0:
            deplete_bulk_for_local_pack(sku, fulfilled, company_id, db)

    db.commit()

    return {
        "ref": ref,
        "dispatch_date": data.dispatch_date.isoformat(),
        "items": results,
        "warnings": warnings,
    }

# ─── GET /dispatch/ — history ─────────────────────────────────
@router.get("/")
def list_dispatches(
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    records = db.query(DispatchRecord).filter(
        DispatchRecord.company_id == company_id,
    ).order_by(
        DispatchRecord.dispatch_date.desc(),
        DispatchRecord.created_at.desc()
    ).limit(200).all()

    return [
        {
            "id": r.id,
            "ref": r.ref,
            "note": r.note,
            "dispatch_date": r.dispatch_date.isoformat(),
            "item_count": len(r.items),
            "total_cases": sum(i.cases_fulfilled for i in r.items),
            "created_at": r.created_at.isoformat(),
        }
        for r in records
    ]

# ─── GET /dispatch/{id} — detail ──────────────────────────────
@router.get("/{dispatch_id}")
def get_dispatch(
    dispatch_id: int,
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    r = db.query(DispatchRecord).filter(
        DispatchRecord.id == dispatch_id,
        DispatchRecord.company_id == company_id,
    ).first()
    if not r:
        raise HTTPException(status_code=404, detail="Dispatch not found")

    return {
        "id": r.id,
        "ref": r.ref,
        "note": r.note,
        "dispatch_date": r.dispatch_date.isoformat(),
        "created_at": r.created_at.isoformat(),
        "items": [
            {
                "sku_code": i.sku.sku_code,
                "product_name": i.sku.product_name,
                "cases_requested": i.cases_requested,
                "cases_fulfilled": i.cases_fulfilled,
                "shortfall": i.cases_requested - i.cases_fulfilled,
            }
            for i in r.items
        ]
    }
