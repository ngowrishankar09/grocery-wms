from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime

import sys, os
sys.path.append(os.path.dirname(os.path.dirname(__file__)))
from database import get_db
from models import SKU, Vendor, Inventory, Category, SkuBulkLink, BillOfMaterial
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
    unit_weight: Optional[float] = None
    unit_weight_uom: Optional[str] = "g"
    is_bulk_material: Optional[bool] = False

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
    unit_weight: Optional[float] = None
    unit_weight_uom: Optional[str] = None
    is_bulk_material: Optional[bool] = None

# ─── Endpoints ────────────────────────────────────────────────
@router.get("/")
def list_skus(
    search: Optional[str] = None,
    category: Optional[str] = None,
    lean: Optional[bool] = False,
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

    # lean=true skips inventory join (used by pages that only need SKU metadata)
    if lean:
        return [
            {
                "id": sku.id,
                "sku_code": sku.sku_code,
                "product_name": sku.product_name,
                "name_es": sku.name_es,
                "category": sku.category,
                "case_size": sku.case_size,
                "unit_label": sku.unit_label,
                "vendor_id": sku.vendor_id,
                "cost_price": sku.cost_price,
                "selling_price": getattr(sku, 'selling_price', None),
                "floor_price": getattr(sku, 'floor_price', None),
                "unit_weight": getattr(sku, 'unit_weight', None),
                "unit_weight_uom": getattr(sku, 'unit_weight_uom', 'g') or 'g',
                "is_bulk_material": getattr(sku, 'is_bulk_material', False) or False,
                "is_active": sku.is_active,
            }
            for sku in skus
        ]

    # Full mode: load ALL inventory in ONE query instead of N queries
    sku_ids = [s.id for s in skus]
    inv_rows = (
        db.query(Inventory)
        .filter(Inventory.company_id == company_id, Inventory.sku_id.in_(sku_ids))
        .all()
    ) if sku_ids else []

    inv_map: dict = {}
    for inv in inv_rows:
        inv_map.setdefault(inv.sku_id, {})[inv.warehouse] = inv.cases_on_hand

    result = []
    for sku in skus:
        sku_inv = inv_map.get(sku.id, {})
        wh1 = sku_inv.get("WH1", 0)
        wh2 = sku_inv.get("WH2", 0)
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
            "unit_weight": getattr(sku, 'unit_weight', None),
            "unit_weight_uom": getattr(sku, 'unit_weight_uom', 'g') or 'g',
            "is_bulk_material": getattr(sku, 'is_bulk_material', False) or False,
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
        "is_bulk_material": getattr(sku, "is_bulk_material", False) or False,
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


# ─── Bulk ↔ Retail link helpers ───────────────────────────────

def _to_kg(weight, uom):
    """Convert a weight value + uom string to kg."""
    if not weight:
        return None
    uom = (uom or "g").lower()
    if uom == "kg":  return weight
    if uom == "g":   return weight / 1000
    if uom == "lbs": return weight * 0.453592
    if uom == "oz":  return weight * 0.0283495
    return weight / 1000  # fallback: treat as grams


class BulkLinkItem(BaseModel):
    retail_sku_id:    int
    local_pack_active: bool = False


@router.get("/{sku_id}/bulk-links")
def get_bulk_links(
    sku_id: int,
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    """Return all retail SKUs linked to a bulk SKU, with local_pack_active flag."""
    links = db.query(SkuBulkLink).filter(
        SkuBulkLink.bulk_sku_id == sku_id,
        SkuBulkLink.company_id  == company_id,
    ).all()

    if not links:
        return []

    retail_ids  = [l.retail_sku_id for l in links]
    retail_skus = db.query(SKU).filter(SKU.id.in_(retail_ids)).all()
    sku_map     = {s.id: s for s in retail_skus}

    return [
        {
            "retail_sku_id":    l.retail_sku_id,
            "retail_sku_name":  sku_map[l.retail_sku_id].product_name if l.retail_sku_id in sku_map else "Unknown",
            "retail_sku_code":  sku_map[l.retail_sku_id].sku_code     if l.retail_sku_id in sku_map else "",
            "unit_weight":      sku_map[l.retail_sku_id].unit_weight   if l.retail_sku_id in sku_map else None,
            "unit_weight_uom":  (sku_map[l.retail_sku_id].unit_weight_uom or "g") if l.retail_sku_id in sku_map else "g",
            "local_pack_active": l.local_pack_active,
        }
        for l in links
    ]


@router.put("/{sku_id}/bulk-links")
def set_bulk_links(
    sku_id: int,
    links:  List[BulkLinkItem],
    db:     Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    """Replace all retail-SKU links for a bulk SKU.
    Also auto-creates a BillOfMaterial record for each link that doesn't have one yet,
    so the Repacking module populates automatically.
    """
    # Verify bulk SKU belongs to this company
    bulk_sku = db.query(SKU).filter(SKU.id == sku_id, SKU.company_id == company_id).first()
    if not bulk_sku:
        raise HTTPException(status_code=404, detail="Bulk SKU not found")

    # Remove all existing links for this bulk SKU
    db.query(SkuBulkLink).filter(
        SkuBulkLink.bulk_sku_id == sku_id,
        SkuBulkLink.company_id  == company_id,
    ).delete()

    for item in links:
        retail_sku = db.query(SKU).filter(
            SKU.id == item.retail_sku_id,
            SKU.company_id == company_id,
        ).first()
        if not retail_sku:
            continue

        # Create link record
        db.add(SkuBulkLink(
            company_id        = company_id,
            bulk_sku_id       = sku_id,
            retail_sku_id     = item.retail_sku_id,
            local_pack_active = item.local_pack_active,
        ))

        # Auto-upsert BOM so Repacking module sees the relationship
        existing_bom = db.query(BillOfMaterial).filter(
            BillOfMaterial.input_sku_id  == sku_id,
            BillOfMaterial.output_sku_id == item.retail_sku_id,
            BillOfMaterial.company_id    == company_id,
        ).first()
        if not existing_bom:
            unit_kg = _to_kg(retail_sku.unit_weight, retail_sku.unit_weight_uom) or 0.5
            db.add(BillOfMaterial(
                company_id     = company_id,
                input_sku_id   = sku_id,
                output_sku_id  = item.retail_sku_id,
                qty_per_unit   = unit_kg,
                unit           = "kg",
            ))

    db.commit()
    return {"message": "Links updated", "count": len(links)}


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
