from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import Optional
from datetime import date

import sys, os
sys.path.append(os.path.dirname(os.path.dirname(__file__)))
from database import get_db
from models import Inventory, SKU, Batch
from security import get_current_user, get_company_id

router = APIRouter(prefix="/inventory", tags=["Inventory"])

@router.get("/")
def get_inventory(
    warehouse: Optional[str] = None,
    category: Optional[str] = None,
    low_stock: Optional[bool] = None,
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    skus = db.query(SKU).filter(SKU.is_active == True, SKU.company_id == company_id)
    if category:
        skus = skus.filter(SKU.category == category)
    skus = skus.all()

    today = date.today()
    result = []

    for sku in skus:
        inv = db.query(Inventory).filter(
            Inventory.sku_id == sku.id,
            Inventory.company_id == company_id,
        ).all()
        wh1_rec = next((i for i in inv if i.warehouse == "WH1"), None)
        wh2_rec = next((i for i in inv if i.warehouse == "WH2"), None)
        wh1 = wh1_rec.cases_on_hand if wh1_rec else 0
        wh2 = wh2_rec.cases_on_hand if wh2_rec else 0
        total = wh1 + wh2

        if warehouse == "WH1" and wh1 == 0:
            continue
        if warehouse == "WH2" and wh2 == 0:
            continue
        if low_stock and total > sku.reorder_point:
            continue

        # Get earliest expiry batch
        earliest_batch = db.query(Batch).filter(
            Batch.sku_id == sku.id,
            Batch.company_id == company_id,
            Batch.cases_remaining > 0,
            Batch.has_expiry == True,
            Batch.expiry_date != None,
        ).order_by(Batch.expiry_date.asc()).first()

        days_to_expiry = None
        expiry_status = "no_expiry"
        earliest_expiry = None

        if earliest_batch and earliest_batch.expiry_date:
            earliest_expiry = earliest_batch.expiry_date.isoformat()
            days_to_expiry = (earliest_batch.expiry_date - today).days
            if days_to_expiry < 0:
                expiry_status = "expired"
            elif days_to_expiry <= 30:
                expiry_status = "critical"
            elif days_to_expiry <= 60:
                expiry_status = "warning"
            else:
                expiry_status = "ok"

        stock_status = "ok"
        if total == 0:
            stock_status = "stockout"
        elif total <= sku.reorder_point:
            stock_status = "low"

        # Bin locations (prefer WH1, then WH2)
        wh1_bin = wh1_rec.bin_location if wh1_rec and wh1_rec.bin_location else None
        wh2_bin = wh2_rec.bin_location if wh2_rec and wh2_rec.bin_location else None

        result.append({
            "sku_id": sku.id,
            "sku_code": sku.sku_code,
            "product_name": sku.product_name,
            "name_es": sku.name_es,
            "category": sku.category,
            "case_size": sku.case_size,
            "wh1_cases": wh1,
            "wh2_cases": wh2,
            "total_cases": total,
            "reorder_point": sku.reorder_point,
            "reorder_qty": sku.reorder_qty,
            "stock_status": stock_status,
            "earliest_expiry": earliest_expiry,
            "days_to_expiry": days_to_expiry,
            "expiry_status": expiry_status,
            "vendor_name": sku.vendor.name if sku.vendor else None,
            "wh1_inventory_id": wh1_rec.id if wh1_rec else None,
            "wh2_inventory_id": wh2_rec.id if wh2_rec else None,
            "wh1_bin": {"id": wh1_bin.id, "code": wh1_bin.code} if wh1_bin else None,
            "wh2_bin": {"id": wh2_bin.id, "code": wh2_bin.code} if wh2_bin else None,
        })

    return sorted(result, key=lambda x: (
        0 if x["stock_status"] == "stockout" else
        1 if x["stock_status"] == "low" else
        0 if x["expiry_status"] == "critical" else 2
    ))


@router.get("/summary")
def get_inventory_summary(
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    skus = db.query(SKU).filter(SKU.is_active == True, SKU.company_id == company_id).all()
    today = date.today()

    total_skus = len(skus)
    stockout = 0
    low_stock = 0
    expiring_30 = 0
    expiring_60 = 0

    for sku in skus:
        inv = db.query(Inventory).filter(
            Inventory.sku_id == sku.id,
            Inventory.company_id == company_id,
        ).all()
        total = sum(i.cases_on_hand for i in inv)

        if total == 0:
            stockout += 1
        elif total <= sku.reorder_point:
            low_stock += 1

        batch = db.query(Batch).filter(
            Batch.sku_id == sku.id,
            Batch.company_id == company_id,
            Batch.cases_remaining > 0,
            Batch.has_expiry == True,
            Batch.expiry_date != None,
        ).order_by(Batch.expiry_date.asc()).first()

        if batch and batch.expiry_date:
            days = (batch.expiry_date - today).days
            if days <= 30:
                expiring_30 += 1
            elif days <= 60:
                expiring_60 += 1

    return {
        "total_skus": total_skus,
        "stockout_count": stockout,
        "low_stock_count": low_stock,
        "expiring_30_days": expiring_30,
        "expiring_60_days": expiring_60,
    }
