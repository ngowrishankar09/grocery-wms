from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime

import sys, os
sys.path.append(os.path.dirname(os.path.dirname(__file__)))
from database import get_db
from models import SKU, Vendor, Inventory, Category
from security import get_current_user, get_company_id

router = APIRouter(prefix="/skus", tags=["SKUs"])

# ─── Schemas ──────────────────────────────────────────────────
class SKUCreate(BaseModel):
    sku_code: str
    barcode: Optional[str] = None
    product_name: str
    name_es: Optional[str] = None
    category: str
    case_size: int
    pallet_size: Optional[int] = None
    unit_label: str = "units"
    avg_shelf_life_days: int = 0
    reorder_point: int = 10
    reorder_qty: int = 50
    max_stock: int = 200
    lead_time_days: int = 7
    vendor_id: Optional[int] = None
    cost_price: Optional[float] = None
    selling_price: Optional[float] = None
    floor_price: Optional[float] = None
    show_goods_date_on_picking: bool = False
    require_expiry_entry: bool = False

class SKUUpdate(BaseModel):
    barcode: Optional[str] = None
    cost_price: Optional[float] = None
    selling_price: Optional[float] = None
    product_name: Optional[str] = None
    name_es: Optional[str] = None
    category: Optional[str] = None
    case_size: Optional[int] = None
    pallet_size: Optional[int] = None
    unit_label: Optional[str] = None
    avg_shelf_life_days: Optional[int] = None
    reorder_point: Optional[int] = None
    reorder_qty: Optional[int] = None
    max_stock: Optional[int] = None
    lead_time_days: Optional[int] = None
    vendor_id: Optional[int] = None
    is_active: Optional[bool] = None
    floor_price: Optional[float] = None
    show_goods_date_on_picking: Optional[bool] = None
    require_expiry_entry: Optional[bool] = None

# ─── Endpoints ────────────────────────────────────────────────
@router.get("/")
def list_skus(
    search: Optional[str] = None,
    category: Optional[str] = None,
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    q = db.query(SKU).filter(SKU.is_active == True, SKU.company_id == company_id)
    if search:
        q = q.filter(
            SKU.product_name.ilike(f"%{search}%") |
            SKU.sku_code.ilike(f"%{search}%")
        )
    if category:
        q = q.filter(SKU.category == category)

    skus = q.order_by(SKU.category, SKU.product_name).all()

    result = []
    for sku in skus:
        inv = db.query(Inventory).filter(
            Inventory.sku_id == sku.id,
            Inventory.company_id == company_id,
        ).all()
        wh1 = next((i.cases_on_hand for i in inv if i.warehouse == "WH1"), 0)
        wh2 = next((i.cases_on_hand for i in inv if i.warehouse == "WH2"), 0)

        result.append({
            "id": sku.id,
            "sku_code": sku.sku_code,
            "barcode": sku.barcode,
            "product_name": sku.product_name,
            "name_es": sku.name_es,
            "category": sku.category,
            "case_size": sku.case_size,
            "pallet_size": sku.pallet_size,
            "unit_label": sku.unit_label,
            "avg_shelf_life_days": sku.avg_shelf_life_days,
            "reorder_point": sku.reorder_point,
            "reorder_qty": sku.reorder_qty,
            "max_stock": sku.max_stock,
            "lead_time_days": sku.lead_time_days,
            "vendor_id": sku.vendor_id,
            "vendor_name": sku.vendor.name if sku.vendor else None,
            "cost_price": sku.cost_price,
            "selling_price": getattr(sku, 'selling_price', None),
            "floor_price": getattr(sku, 'floor_price', None),
            "show_goods_date_on_picking": getattr(sku, 'show_goods_date_on_picking', False),
            "require_expiry_entry": getattr(sku, 'require_expiry_entry', False),
            "image_url": sku.image_url,
            "is_active": sku.is_active,
            "wh1_cases": wh1,
            "wh2_cases": wh2,
            "total_cases": wh1 + wh2,
        })
    return result


@router.post("/")
def create_sku(
    data: SKUCreate,
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    existing = db.query(SKU).filter(
        SKU.sku_code == data.sku_code,
        SKU.company_id == company_id,
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="SKU code already exists")

    sku = SKU(**data.dict(), company_id=company_id)
    db.add(sku)
    db.flush()

    # Init inventory records
    for wh in ["WH1", "WH2"]:
        inv = Inventory(sku_id=sku.id, warehouse=wh, cases_on_hand=0, company_id=company_id)
        db.add(inv)

    db.commit()
    db.refresh(sku)
    return {"id": sku.id, "sku_code": sku.sku_code, "product_name": sku.product_name}


@router.get("/barcode/{barcode}")
def lookup_by_barcode(
    barcode: str,
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    """Look up a SKU by its barcode (UPC/EAN-13)."""
    sku = db.query(SKU).filter(SKU.barcode == barcode, SKU.company_id == company_id).first()
    if not sku:
        raise HTTPException(status_code=404, detail=f"No SKU found for barcode {barcode}")
    inv = db.query(Inventory).filter(Inventory.sku_id == sku.id, Inventory.company_id == company_id).all()
    wh1 = next((i.cases_on_hand for i in inv if i.warehouse == "WH1"), 0)
    wh2 = next((i.cases_on_hand for i in inv if i.warehouse == "WH2"), 0)
    return {
        "id": sku.id,
        "sku_code": sku.sku_code,
        "barcode": sku.barcode,
        "product_name": sku.product_name,
        "category": sku.category,
        "case_size": sku.case_size,
        "unit_label": sku.unit_label,
        "cost_price": sku.cost_price,
        "selling_price": getattr(sku, "selling_price", None),
        "floor_price": getattr(sku, "floor_price", None),
        "wh1_cases": wh1,
        "wh2_cases": wh2,
        "total_cases": wh1 + wh2,
    }


@router.get("/{sku_id}")
def get_sku(
    sku_id: int,
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    sku = db.query(SKU).filter(SKU.id == sku_id, SKU.company_id == company_id).first()
    if not sku:
        raise HTTPException(status_code=404, detail="SKU not found")
    return sku


@router.put("/{sku_id}")
def update_sku(
    sku_id: int,
    data: SKUUpdate,
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    sku = db.query(SKU).filter(SKU.id == sku_id, SKU.company_id == company_id).first()
    if not sku:
        raise HTTPException(status_code=404, detail="SKU not found")

    for field, value in data.dict(exclude_unset=True).items():
        setattr(sku, field, value)

    db.commit()
    return {"message": "Updated successfully"}


@router.get("/categories/list")
def get_categories(
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    cats = db.query(Category).filter(
        Category.is_active == True,
        Category.company_id == company_id,
    ).order_by(Category.sort_order, Category.name).all()
    return [c.name for c in cats]
