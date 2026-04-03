from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional, List
from pydantic import BaseModel
from datetime import date, datetime

import sys, os
sys.path.append(os.path.dirname(os.path.dirname(__file__)))
from database import get_db
from models import Batch, SKU, Inventory, MonthlyConsumption
from security import get_current_user, get_company_id

router = APIRouter(prefix="/receiving", tags=["Receiving"])

class ReceivingItem(BaseModel):
    sku_id: int
    cases_received: int
    warehouse: str = "WH2"
    expiry_date: Optional[date] = None
    has_expiry: bool = True
    lot_number: Optional[str] = None
    supplier_ref: Optional[str] = None
    notes: Optional[str] = None

class ReceivingCreate(BaseModel):
    received_date: date
    items: List[ReceivingItem]

def generate_batch_code(sku_code: str, received_date: date, db: Session) -> str:
    prefix = f"BATCH-{sku_code}-{received_date.strftime('%Y%m%d')}"
    count = db.query(Batch).filter(Batch.batch_code.like(f"{prefix}%")).count()
    suffix = chr(65 + count)  # A, B, C...
    return f"{prefix}-{suffix}"

def update_inventory(sku_id: int, warehouse: str, delta: int, db: Session,
                     company_id: int = None, stock_type: str = "unrestricted"):
    """
    Update inventory for a specific stock_type bucket.
    stock_type: unrestricted | inspection | blocked | allocated
    """
    q = db.query(Inventory).filter(
        Inventory.sku_id == sku_id,
        Inventory.warehouse == warehouse,
        Inventory.stock_type == stock_type,
    )
    if company_id is not None:
        q = q.filter(Inventory.company_id == company_id)
    inv = q.first()
    if not inv:
        inv = Inventory(
            sku_id=sku_id, warehouse=warehouse,
            cases_on_hand=0, company_id=company_id,
            stock_type=stock_type,
        )
        db.add(inv)
        db.flush()
    inv.cases_on_hand = max(0, inv.cases_on_hand + delta)
    inv.updated_at = datetime.utcnow()

def update_monthly_consumption(sku_id: int, year: int, month: int, received: int, db: Session, company_id: int = None):
    q = db.query(MonthlyConsumption).filter(
        MonthlyConsumption.sku_id == sku_id,
        MonthlyConsumption.year == year,
        MonthlyConsumption.month == month,
    )
    if company_id is not None:
        q = q.filter(MonthlyConsumption.company_id == company_id)
    mc = q.first()
    if not mc:
        mc = MonthlyConsumption(sku_id=sku_id, year=year, month=month, company_id=company_id)
        db.add(mc)
        db.flush()
    mc.cases_received += received
    mc.updated_at = datetime.utcnow()

@router.post("/")
def receive_shipment(
    data: ReceivingCreate,
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    results = []
    for item in data.items:
        sku = db.query(SKU).filter(SKU.id == item.sku_id, SKU.company_id == company_id).first()
        if not sku:
            raise HTTPException(status_code=404, detail=f"SKU {item.sku_id} not found")

        batch_code = generate_batch_code(sku.sku_code, data.received_date, db)

        batch = Batch(
            batch_code=batch_code,
            sku_id=item.sku_id,
            cases_received=item.cases_received,
            cases_remaining=item.cases_received,
            warehouse=item.warehouse,
            received_date=data.received_date,
            expiry_date=item.expiry_date,
            has_expiry=item.has_expiry,
            lot_number=item.lot_number,
            supplier_ref=item.supplier_ref,
            notes=item.notes,
            company_id=company_id,
        )
        db.add(batch)

        update_inventory(item.sku_id, item.warehouse, item.cases_received, db, company_id)
        update_monthly_consumption(
            item.sku_id,
            data.received_date.year,
            data.received_date.month,
            item.cases_received,
            db,
            company_id,
        )

        results.append({
            "batch_code": batch_code,
            "sku_code": sku.sku_code,
            "product_name": sku.product_name,
            "cases_received": item.cases_received,
            "warehouse": item.warehouse,
        })

    db.commit()
    return {"message": "Shipment received", "batches": results}


@router.get("/")
def list_batches(
    warehouse: Optional[str] = None,
    sku_id: Optional[int] = None,
    expiring_in_days: Optional[int] = None,
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    q = db.query(Batch).filter(
        Batch.cases_remaining > 0,
        Batch.company_id == company_id,
    )
    if warehouse:
        q = q.filter(Batch.warehouse == warehouse)
    if sku_id:
        q = q.filter(Batch.sku_id == sku_id)

    batches = q.order_by(Batch.expiry_date.asc().nullslast(), Batch.received_date.asc()).all()

    today = date.today()
    result = []
    for b in batches:
        days_to_expiry = None
        expiry_status = "no_expiry"
        if b.has_expiry and b.expiry_date:
            days_to_expiry = (b.expiry_date - today).days
            if days_to_expiry < 0:
                expiry_status = "expired"
            elif days_to_expiry <= 30:
                expiry_status = "critical"
            elif days_to_expiry <= 60:
                expiry_status = "warning"
            else:
                expiry_status = "ok"

        if expiring_in_days and days_to_expiry is not None and days_to_expiry > expiring_in_days:
            continue

        result.append({
            "id": b.id,
            "batch_code": b.batch_code,
            "sku_id": b.sku_id,
            "sku_code": b.sku.sku_code,
            "product_name": b.sku.product_name,
            "category": b.sku.category,
            "cases_received": b.cases_received,
            "cases_remaining": b.cases_remaining,
            "warehouse": b.warehouse,
            "received_date": b.received_date.isoformat(),
            "expiry_date": b.expiry_date.isoformat() if b.expiry_date else None,
            "has_expiry": b.has_expiry,
            "lot_number": b.lot_number,
            "days_to_expiry": days_to_expiry,
            "expiry_status": expiry_status,
            "supplier_ref": b.supplier_ref,
            "notes": b.notes,
        })

    return result


@router.get("/history")
def receiving_history(
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    batches = db.query(Batch).filter(
        Batch.company_id == company_id,
    ).order_by(Batch.created_at.desc()).limit(100).all()
    return [
        {
            "batch_code": b.batch_code,
            "product_name": b.sku.product_name,
            "sku_code": b.sku.sku_code,
            "cases_received": b.cases_received,
            "cases_remaining": b.cases_remaining,
            "warehouse": b.warehouse,
            "received_date": b.received_date.isoformat(),
            "expiry_date": b.expiry_date.isoformat() if b.expiry_date else None,
        }
        for b in batches
    ]
