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
    DispatchRecord, DispatchRecordItem
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
