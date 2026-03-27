from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from pydantic import BaseModel
from datetime import date, datetime

import sys, os
sys.path.append(os.path.dirname(os.path.dirname(__file__)))
from database import get_db
from models import Transfer, TransferItem, Batch, Inventory
from routers.receiving import update_inventory
from security import get_current_user, get_company_id

router = APIRouter(prefix="/transfers", tags=["Transfers"])

class TransferItemCreate(BaseModel):
    batch_id: int
    cases_to_move: int

class TransferCreate(BaseModel):
    from_warehouse: str
    to_warehouse: str
    transfer_date: date
    notes: str = None
    items: List[TransferItemCreate]

def generate_transfer_number(db: Session) -> str:
    count = db.query(Transfer).count()
    return f"TRF-{datetime.utcnow().strftime('%Y%m%d')}-{count + 1:04d}"

@router.post("/")
def create_transfer(
    data: TransferCreate,
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    if data.from_warehouse == data.to_warehouse:
        raise HTTPException(status_code=400, detail="Source and destination warehouses must differ")

    transfer = Transfer(
        transfer_number=generate_transfer_number(db),
        from_warehouse=data.from_warehouse,
        to_warehouse=data.to_warehouse,
        transfer_date=data.transfer_date,
        notes=data.notes,
        company_id=company_id,
    )
    db.add(transfer)
    db.flush()

    moved = []
    for item in data.items:
        batch = db.query(Batch).filter(
            Batch.id == item.batch_id,
            Batch.company_id == company_id,
        ).first()
        if not batch:
            raise HTTPException(status_code=404, detail=f"Batch {item.batch_id} not found")
        if batch.warehouse != data.from_warehouse:
            raise HTTPException(status_code=400, detail=f"Batch {batch.batch_code} is not in {data.from_warehouse}")
        if batch.cases_remaining < item.cases_to_move:
            raise HTTPException(
                status_code=400,
                detail=f"Batch {batch.batch_code} only has {batch.cases_remaining} cases"
            )

        # Move the batch
        batch.warehouse = data.to_warehouse
        batch.cases_remaining -= item.cases_to_move

        # If partial transfer, create a new batch entry for destination
        # For simplicity: move entire remaining or update in place
        # Update inventory
        update_inventory(batch.sku_id, data.from_warehouse, -item.cases_to_move, db, company_id)
        update_inventory(batch.sku_id, data.to_warehouse, item.cases_to_move, db, company_id)

        transfer_item = TransferItem(
            transfer_id=transfer.id,
            batch_id=batch.id,
            cases_moved=item.cases_to_move,
        )
        db.add(transfer_item)

        moved.append({
            "batch_code": batch.batch_code,
            "product_name": batch.sku.product_name,
            "cases_moved": item.cases_to_move,
            "from": data.from_warehouse,
            "to": data.to_warehouse,
        })

    db.commit()
    return {"transfer_number": transfer.transfer_number, "moved": moved}

@router.get("/")
def list_transfers(
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    transfers = db.query(Transfer).filter(
        Transfer.company_id == company_id,
    ).order_by(Transfer.created_at.desc()).limit(100).all()
    return [
        {
            "id": t.id,
            "transfer_number": t.transfer_number,
            "from_warehouse": t.from_warehouse,
            "to_warehouse": t.to_warehouse,
            "transfer_date": t.transfer_date.isoformat(),
            "item_count": len(t.items),
            "total_cases": sum(i.cases_moved for i in t.items),
            "notes": t.notes,
        }
        for t in transfers
    ]

@router.get("/wh2-to-wh1-suggestions")
def get_transfer_suggestions(
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    """Suggest items in WH2 that should be moved to WH1 for operations"""
    from models import SKU, Inventory as Inv
    skus = db.query(SKU).filter(SKU.is_active == True, SKU.company_id == company_id).all()
    suggestions = []

    for sku in skus:
        inv = db.query(Inv).filter(Inv.sku_id == sku.id, Inv.company_id == company_id).all()
        wh1 = next((i.cases_on_hand for i in inv if i.warehouse == "WH1"), 0)
        wh2 = next((i.cases_on_hand for i in inv if i.warehouse == "WH2"), 0)

        # Suggest transfer if WH1 is low but WH2 has stock
        if wh1 <= sku.reorder_point and wh2 > 0:
            batches = db.query(Batch).filter(
                Batch.sku_id == sku.id,
                Batch.warehouse == "WH2",
                Batch.cases_remaining > 0,
                Batch.company_id == company_id,
            ).order_by(Batch.expiry_date.asc().nullslast()).all()

            suggestions.append({
                "sku_code": sku.sku_code,
                "product_name": sku.product_name,
                "wh1_cases": wh1,
                "wh2_cases": wh2,
                "reorder_point": sku.reorder_point,
                "suggested_transfer": min(wh2, sku.reorder_qty),
                "batches": [
                    {
                        "batch_id": b.id,
                        "batch_code": b.batch_code,
                        "cases_remaining": b.cases_remaining,
                        "expiry_date": b.expiry_date.isoformat() if b.expiry_date else None,
                    }
                    for b in batches
                ]
            })

    return suggestions
