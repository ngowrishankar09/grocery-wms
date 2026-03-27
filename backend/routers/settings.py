from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional
from pydantic import BaseModel
from datetime import datetime
import re

import sys, os
sys.path.append(os.path.dirname(os.path.dirname(__file__)))
from database import get_db
from models import (
    Warehouse, Vendor, SKU, Inventory,
    Batch, InventoryAdjustment, Category, CompanyProfile, Invoice, create_tables, get_engine
)
from security import get_current_user, get_company_id

router = APIRouter(prefix="/settings", tags=["Settings"])

# ──────────────────────────────────────────────────────────────
# WAREHOUSE
# ──────────────────────────────────────────────────────────────
class WarehouseCreate(BaseModel):
    code: str
    name: str
    address: Optional[str] = None
    is_primary: bool = False

class WarehouseUpdate(BaseModel):
    name: Optional[str] = None
    address: Optional[str] = None
    is_primary: Optional[bool] = None
    is_active: Optional[bool] = None

@router.get("/warehouses")
def list_warehouses(
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    warehouses = db.query(Warehouse).filter(
        Warehouse.company_id == company_id,
    ).order_by(Warehouse.is_primary.desc(), Warehouse.code).all()
    result = []
    for wh in warehouses:
        inv_count = db.query(Inventory).filter(
            Inventory.warehouse == wh.code,
            Inventory.cases_on_hand > 0,
            Inventory.company_id == company_id,
        ).count()
        result.append({
            "id": wh.id,
            "code": wh.code,
            "name": wh.name,
            "address": wh.address,
            "is_primary": wh.is_primary,
            "is_active": wh.is_active,
            "skus_with_stock": inv_count,
            "created_at": wh.created_at.isoformat(),
        })
    return result

@router.post("/warehouses")
def create_warehouse(
    data: WarehouseCreate,
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    # Check code uniqueness within company
    existing = db.query(Warehouse).filter(
        Warehouse.code == data.code.upper(),
        Warehouse.company_id == company_id,
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Warehouse code already exists")

    code = data.code.upper().strip()
    wh = Warehouse(
        code=code,
        name=data.name,
        address=data.address,
        is_primary=data.is_primary,
        company_id=company_id,
    )
    db.add(wh)

    # If set as primary, unset others within company
    if data.is_primary:
        db.query(Warehouse).filter(
            Warehouse.code != code,
            Warehouse.company_id == company_id,
        ).update({"is_primary": False})

    # Pre-create inventory slots for all existing SKUs
    skus = db.query(SKU).filter(SKU.is_active == True, SKU.company_id == company_id).all()
    for sku in skus:
        inv = Inventory(sku_id=sku.id, warehouse=code, cases_on_hand=0, company_id=company_id)
        db.add(inv)

    db.commit()
    db.refresh(wh)
    return {"id": wh.id, "code": wh.code, "name": wh.name}

@router.put("/warehouses/{wh_id}")
def update_warehouse(
    wh_id: int,
    data: WarehouseUpdate,
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    wh = db.query(Warehouse).filter(
        Warehouse.id == wh_id,
        Warehouse.company_id == company_id,
    ).first()
    if not wh:
        raise HTTPException(status_code=404, detail="Warehouse not found")

    for field, value in data.dict(exclude_unset=True).items():
        setattr(wh, field, value)

    if data.is_primary:
        db.query(Warehouse).filter(
            Warehouse.id != wh_id,
            Warehouse.company_id == company_id,
        ).update({"is_primary": False})

    db.commit()
    return {"message": "Updated"}

@router.delete("/warehouses/{wh_id}")
def delete_warehouse(
    wh_id: int,
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    wh = db.query(Warehouse).filter(
        Warehouse.id == wh_id,
        Warehouse.company_id == company_id,
    ).first()
    if not wh:
        raise HTTPException(status_code=404, detail="Warehouse not found")
    if wh.is_primary:
        raise HTTPException(status_code=400, detail="Cannot delete the primary warehouse")

    # Check if it has active stock
    active_stock = db.query(Inventory).filter(
        Inventory.warehouse == wh.code,
        Inventory.cases_on_hand > 0,
        Inventory.company_id == company_id,
    ).count()
    if active_stock > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete warehouse '{wh.code}' — it has stock in {active_stock} SKU(s). Transfer or clear stock first."
        )

    # Soft delete
    wh.is_active = False
    db.commit()
    return {"message": f"Warehouse {wh.code} deactivated"}

# ──────────────────────────────────────────────────────────────
# VENDOR DELETE
# ──────────────────────────────────────────────────────────────
@router.delete("/vendors/{vendor_id}")
def delete_vendor(
    vendor_id: int,
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    vendor = db.query(Vendor).filter(
        Vendor.id == vendor_id,
        Vendor.company_id == company_id,
    ).first()
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor not found")

    # Unlink SKUs from this vendor instead of blocking
    db.query(SKU).filter(
        SKU.vendor_id == vendor_id,
        SKU.company_id == company_id,
    ).update({"vendor_id": None})

    vendor.is_active = False
    db.commit()
    return {"message": f"Vendor '{vendor.name}' deleted. SKUs unlinked."}

# ──────────────────────────────────────────────────────────────
# SKU DELETE
# ──────────────────────────────────────────────────────────────
@router.delete("/skus/{sku_id}")
def delete_sku(
    sku_id: int,
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    sku = db.query(SKU).filter(
        SKU.id == sku_id,
        SKU.company_id == company_id,
    ).first()
    if not sku:
        raise HTTPException(status_code=404, detail="SKU not found")

    # Check for active stock
    inv = db.query(Inventory).filter(
        Inventory.sku_id == sku_id,
        Inventory.company_id == company_id,
    ).all()
    total_stock = sum(i.cases_on_hand for i in inv)
    if total_stock > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete '{sku.product_name}' — it has {total_stock} cases in stock. Clear inventory first."
        )

    # Soft delete
    sku.is_active = False
    db.commit()
    return {"message": f"SKU '{sku.sku_code}' deleted"}

# ──────────────────────────────────────────────────────────────
# INVENTORY ADJUSTMENT
# ──────────────────────────────────────────────────────────────
class InventoryAdjustRequest(BaseModel):
    sku_id: int
    warehouse: str
    new_qty: int
    reason: str
    notes: Optional[str] = None

@router.post("/inventory/adjust")
def adjust_inventory(
    data: InventoryAdjustRequest,
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    if data.new_qty < 0:
        raise HTTPException(status_code=400, detail="Quantity cannot be negative")

    inv = db.query(Inventory).filter(
        Inventory.sku_id == data.sku_id,
        Inventory.warehouse == data.warehouse,
        Inventory.company_id == company_id,
    ).first()

    if not inv:
        # Create it
        inv = Inventory(
            sku_id=data.sku_id,
            warehouse=data.warehouse,
            cases_on_hand=0,
            company_id=company_id,
        )
        db.add(inv)
        db.flush()

    before = inv.cases_on_hand
    delta = data.new_qty - before

    # Update inventory
    inv.cases_on_hand = data.new_qty
    inv.updated_at = datetime.utcnow()

    # Also update most recent batch to reflect physical count
    if delta != 0:
        batch = db.query(Batch).filter(
            Batch.sku_id == data.sku_id,
            Batch.warehouse == data.warehouse,
            Batch.cases_remaining > 0,
            Batch.company_id == company_id,
        ).order_by(Batch.received_date.desc()).first()

        if batch:
            new_remaining = max(0, batch.cases_remaining + delta)
            batch.cases_remaining = new_remaining

    # Log the adjustment
    adj = InventoryAdjustment(
        sku_id=data.sku_id,
        warehouse=data.warehouse,
        before_qty=before,
        after_qty=data.new_qty,
        delta=delta,
        reason=data.reason,
        notes=data.notes,
        company_id=company_id,
    )
    db.add(adj)
    db.commit()

    sku = db.query(SKU).filter(SKU.id == data.sku_id, SKU.company_id == company_id).first()
    return {
        "message": "Inventory adjusted",
        "product": sku.product_name if sku else None,
        "warehouse": data.warehouse,
        "before": before,
        "after": data.new_qty,
        "delta": delta,
    }

@router.get("/inventory/adjustments")
def list_adjustments(
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    adjs = db.query(InventoryAdjustment).filter(
        InventoryAdjustment.company_id == company_id,
    ).order_by(
        InventoryAdjustment.adjusted_at.desc()
    ).limit(100).all()

    return [
        {
            "id": a.id,
            "sku_id": a.sku_id,
            "warehouse": a.warehouse,
            "before_qty": a.before_qty,
            "after_qty": a.after_qty,
            "delta": a.delta,
            "reason": a.reason,
            "notes": a.notes,
            "adjusted_at": a.adjusted_at.isoformat(),
        }
        for a in adjs
    ]


# ──────────────────────────────────────────────────────────────
# CATEGORIES
# ──────────────────────────────────────────────────────────────
class CategoryCreate(BaseModel):
    name: str
    sort_order: Optional[int] = 0

class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    sort_order: Optional[int] = None

@router.get("/categories")
def list_categories(
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    cats = db.query(Category).filter(
        Category.is_active == True,
        Category.company_id == company_id,
    ).order_by(Category.sort_order, Category.name).all()
    return [
        {
            "id": c.id,
            "name": c.name,
            "sort_order": c.sort_order,
            "sku_count": db.query(SKU).filter(
                SKU.category == c.name,
                SKU.is_active == True,
                SKU.company_id == company_id,
            ).count(),
        }
        for c in cats
    ]

@router.post("/categories")
def create_category(
    data: CategoryCreate,
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    existing = db.query(Category).filter(
        Category.name == data.name,
        Category.company_id == company_id,
    ).first()
    if existing:
        if not existing.is_active:
            existing.is_active = True
            db.commit()
            return {"id": existing.id, "name": existing.name}
        raise HTTPException(status_code=400, detail="Category already exists")
    cat = Category(name=data.name.strip(), sort_order=data.sort_order, company_id=company_id)
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return {"id": cat.id, "name": cat.name}

@router.put("/categories/{cat_id}")
def update_category(
    cat_id: int,
    data: CategoryUpdate,
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    cat = db.query(Category).filter(
        Category.id == cat_id,
        Category.company_id == company_id,
    ).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    if data.name and data.name.strip() != cat.name:
        # Rename: update all SKUs using the old name within company
        db.query(SKU).filter(
            SKU.category == cat.name,
            SKU.company_id == company_id,
        ).update({"category": data.name.strip()})
        cat.name = data.name.strip()
    if data.sort_order is not None:
        cat.sort_order = data.sort_order
    db.commit()
    return {"message": "Updated"}

@router.delete("/categories/{cat_id}")
def delete_category(
    cat_id: int,
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    cat = db.query(Category).filter(
        Category.id == cat_id,
        Category.company_id == company_id,
    ).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    sku_count = db.query(SKU).filter(
        SKU.category == cat.name,
        SKU.is_active == True,
        SKU.company_id == company_id,
    ).count()
    if sku_count > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete '{cat.name}' — {sku_count} active SKU(s) use this category. Reassign them first."
        )
    cat.is_active = False
    db.commit()
    return {"message": f"Category '{cat.name}' deleted"}

# ──────────────────────────────────────────────────────────────
# COMPANY PROFILE (singleton, id=1)
# ──────────────────────────────────────────────────────────────
class CompanyProfileUpdate(BaseModel):
    name:         Optional[str] = None
    address:      Optional[str] = None
    phone:        Optional[str] = None
    email:        Optional[str] = None
    website:      Optional[str] = None
    tax_number:   Optional[str] = None
    bank_details: Optional[str] = None
    logo_text:         Optional[str] = None
    logo_base64:       Optional[str] = None   # base64 data URI for company logo image
    # Invoice number generation
    invoice_number_format:  Optional[str] = None
    invoice_number_prefix:  Optional[str] = None
    invoice_number_padding: Optional[int] = None
    invoice_counter:        Optional[int] = None   # allow manual reset / set starting number
    invoice_template:  Optional[str] = None   # attari | fahman | united | salesorder
    invoice_note:      Optional[str] = None   # printed at bottom of every invoice
    invoice_title:     Optional[str] = None   # "Invoice" | "Sales Order" | "Tax Invoice"
    # Print / delivery settings — apply to all templates
    fax:           Optional[str] = None
    rep_name:      Optional[str] = None
    ship_via:      Optional[str] = None
    catalog_url:   Optional[str] = None
    show_qr_code:  Optional[bool] = None
    # SMTP
    smtp_host:     Optional[str] = None
    smtp_port:     Optional[int] = None
    smtp_user:     Optional[str] = None
    smtp_password: Optional[str] = None
    smtp_from:     Optional[str] = None
    # Customer portal visibility
    portal_show_price:    Optional[bool] = None
    portal_show_stock:    Optional[bool] = None
    portal_show_invoices: Optional[bool] = None

def _get_or_create_company(db: Session) -> CompanyProfile:
    cp = db.query(CompanyProfile).filter(CompanyProfile.id == 1).first()
    if not cp:
        cp = CompanyProfile(id=1)
        db.add(cp)
        db.commit()
        db.refresh(cp)
    return cp

def _fmt_company(cp: CompanyProfile):
    return {
        "id":           cp.id,
        "name":         cp.name,
        "address":      cp.address,
        "phone":        cp.phone,
        "email":        cp.email,
        "website":      cp.website,
        "tax_number":   cp.tax_number,
        "bank_details": cp.bank_details,
        "logo_text":        cp.logo_text,
        "logo_base64":      getattr(cp, "logo_base64", None) or "",
        "invoice_template": getattr(cp, "invoice_template", "attari") or "attari",
        "invoice_note":     getattr(cp, "invoice_note", None) or "",
        "invoice_title":    getattr(cp, "invoice_title", None) or "Invoice",
        "fax":              getattr(cp, "fax", None) or "",
        "rep_name":         getattr(cp, "rep_name", None) or "",
        "ship_via":         getattr(cp, "ship_via", None) or "",
        "catalog_url":      getattr(cp, "catalog_url", None) or "",
        "show_qr_code":     getattr(cp, "show_qr_code", False) or False,
        # Invoice number generation
        "invoice_number_format":  getattr(cp, "invoice_number_format", "date-daily") or "date-daily",
        "invoice_number_prefix":  getattr(cp, "invoice_number_prefix", "INV") or "INV",
        "invoice_number_padding": getattr(cp, "invoice_number_padding", 3) or 3,
        "invoice_counter":        getattr(cp, "invoice_counter", 0) or 0,
        "updated_at":       cp.updated_at.isoformat() if cp.updated_at else None,
        # SMTP (return host/port/user/from but mask password)
        "smtp_host":     cp.smtp_host,
        "smtp_port":     cp.smtp_port or 587,
        "smtp_user":     cp.smtp_user,
        "smtp_password": "••••••••" if cp.smtp_password else "",
        "smtp_from":     cp.smtp_from,
        # Customer portal visibility
        "portal_show_price":    getattr(cp, "portal_show_price",    True),
        "portal_show_stock":    getattr(cp, "portal_show_stock",    True),
        "portal_show_invoices": getattr(cp, "portal_show_invoices", True),
    }

@router.get("/company")
def get_company(db: Session = Depends(get_db)):
    return _fmt_company(_get_or_create_company(db))

@router.put("/company")
def update_company(data: CompanyProfileUpdate, db: Session = Depends(get_db)):
    cp = _get_or_create_company(db)
    for field, value in data.dict(exclude_unset=True).items():
        setattr(cp, field, value)
    from datetime import datetime
    cp.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(cp)
    return _fmt_company(cp)


@router.post("/company/sync-invoice-counter")
def sync_invoice_counter(
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    """
    Scan ALL existing invoice numbers for this company, find the highest
    trailing numeric segment, and set invoice_counter to that value.

    Works with any format:  1001, INV-1001, INV-20260322-047, SO-2026-03-012, etc.
    After this call the next generated invoice will be max + 1 — no gaps, no
    collisions, regardless of where the data originally came from (QuickBooks,
    CSV import, manual entry, etc.)
    """
    invoices = (
        db.query(Invoice.invoice_number)
        .filter(Invoice.company_id == company_id)
        .all()
    )

    max_counter = 0
    for (num,) in invoices:
        if not num:
            continue
        # Split on any non-digit separator and grab the LAST numeric token
        parts = re.split(r"[^0-9]+", num)
        for part in reversed(parts):
            if part.isdigit() and len(part) <= 8:   # ignore 8-digit date segments like 20260322
                val = int(part)
                if val > max_counter:
                    max_counter = val
                break

    cp = _get_or_create_company(db)
    cp.invoice_counter        = max_counter
    cp.invoice_counter_period = None   # force period re-check on next generation
    cp.updated_at             = datetime.utcnow()
    db.commit()

    return {
        "synced":        True,
        "max_found":     max_counter,
        "next_invoice":  max_counter + 1,
        "total_scanned": len(invoices),
    }


# ──────────────────────────────────────────────────────────────
# CATEGORIES MANAGEMENT
# ──────────────────────────────────────────────────────────────
CATEGORIES_KEY = "custom_categories"

_custom_categories = []

@router.get("/categories")
def get_categories():
    default = ["Spices", "Rice", "Dals", "Flour", "Oil", "Sugar & Salt", "Grains", "Other"]
    return default + [c for c in _custom_categories if c not in default]

@router.post("/categories")
def add_category(name: str):
    if name not in _custom_categories:
        _custom_categories.append(name)
    return {"message": f"Category '{name}' added", "categories": _custom_categories}

@router.delete("/categories/{name}")
def delete_category(name: str):
    if name in _custom_categories:
        _custom_categories.remove(name)
    return {"message": f"Category '{name}' removed"}
