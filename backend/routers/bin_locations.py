"""
Bin Location Router
====================
Endpoints:
  GET    /bin-locations              → list all bins (with occupancy)
  POST   /bin-locations              → create a bin
  PUT    /bin-locations/{id}         → update bin details
  DELETE /bin-locations/{id}         → deactivate bin
  GET    /bin-locations/zones        → distinct zones
  GET    /bin-locations/{id}         → single bin with its inventory
  POST   /bin-locations/assign       → assign inventory record to a bin
  POST   /bin-locations/move         → move stock from one bin to another
  POST   /bin-locations/bulk-create  → bulk-generate bins for a zone/aisle
"""

from datetime import datetime
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

import sys, os
sys.path.append(os.path.dirname(os.path.dirname(__file__)))
from database import get_db
from models import BinLocation, Inventory, SKU
from security import get_current_user, get_company_id

router = APIRouter(prefix="/bin-locations", tags=["Bin Locations"])


# ── Pydantic schemas ───────────────────────────────────────────

class BinCreate(BaseModel):
    code:        str
    zone:        str = ""
    aisle:       str = ""
    shelf:       str = ""
    position:    str = ""
    description: str = ""

class BinUpdate(BaseModel):
    code:        Optional[str] = None
    zone:        Optional[str] = None
    aisle:       Optional[str] = None
    shelf:       Optional[str] = None
    position:    Optional[str] = None
    description: Optional[str] = None
    is_active:   Optional[bool] = None

class AssignRequest(BaseModel):
    inventory_id:    int
    bin_location_id: Optional[int]   # None = unassign

class MoveRequest(BaseModel):
    sku_id:          int
    warehouse:       str
    from_bin_id:     Optional[int]
    to_bin_id:       Optional[int]

class BulkCreateRequest(BaseModel):
    zone:       str
    aisles:     List[str]            # e.g. ["01","02","03"]
    shelves:    List[str]            # e.g. ["A","B","C"]
    positions:  Optional[List[str]] = None  # e.g. ["01","02","03"] — omit for 3-part codes


# ── Helpers ───────────────────────────────────────────────────

def _bin_dict(b: BinLocation, db: Session) -> dict:
    inv = db.query(Inventory).filter(Inventory.bin_location_id == b.id).all()
    return {
        "id":          b.id,
        "code":        b.code,
        "zone":        b.zone,
        "aisle":       b.aisle,
        "shelf":       b.shelf,
        "position":    b.position,
        "description": b.description,
        "is_active":   b.is_active,
        "created_at":  b.created_at.isoformat() if b.created_at else None,
        "sku_count":   len(inv),
        "total_cases": sum(i.cases_on_hand for i in inv),
        "items": [
            {
                "inventory_id":  i.id,
                "sku_id":        i.sku_id,
                "sku_code":      i.sku.sku_code      if i.sku else "",
                "product_name":  i.sku.product_name  if i.sku else "",
                "warehouse":     i.warehouse,
                "cases_on_hand": i.cases_on_hand,
            }
            for i in inv
        ],
    }


# ── List all bins ──────────────────────────────────────────────

@router.get("")
def list_bins(
    zone:      Optional[str]  = None,
    aisle:     Optional[str]  = None,
    active_only: bool         = True,
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    q = db.query(BinLocation).filter(BinLocation.company_id == company_id)
    if active_only:
        q = q.filter(BinLocation.is_active == True)
    if zone:
        q = q.filter(BinLocation.zone == zone)
    if aisle:
        q = q.filter(BinLocation.aisle == aisle)
    bins = q.order_by(BinLocation.zone, BinLocation.aisle, BinLocation.shelf, BinLocation.position).all()
    return [_bin_dict(b, db) for b in bins]


# ── Get distinct zones ─────────────────────────────────────────

@router.get("/zones")
def list_zones(
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    rows = db.query(BinLocation.zone).filter(
        BinLocation.is_active == True,
        BinLocation.company_id == company_id,
    ).distinct().order_by(BinLocation.zone).all()
    return [r[0] for r in rows if r[0]]


# ── Get single bin ─────────────────────────────────────────────

@router.get("/{bin_id}")
def get_bin(
    bin_id: int,
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    b = db.query(BinLocation).filter(
        BinLocation.id == bin_id,
        BinLocation.company_id == company_id,
    ).first()
    if not b:
        raise HTTPException(status_code=404, detail="Bin not found")
    return _bin_dict(b, db)


# ── Create bin ────────────────────────────────────────────────

@router.post("")
def create_bin(
    data: BinCreate,
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    if db.query(BinLocation).filter(
        BinLocation.code == data.code.strip().upper(),
        BinLocation.company_id == company_id,
    ).first():
        raise HTTPException(status_code=400, detail=f"Bin code '{data.code}' already exists")
    b = BinLocation(
        code        = data.code.strip().upper(),
        zone        = data.zone.strip().upper(),
        aisle       = data.aisle.strip().zfill(2) if data.aisle.strip().isdigit() else data.aisle.strip().upper(),
        shelf       = data.shelf.strip().upper(),
        position    = data.position.strip().zfill(2) if data.position.strip().isdigit() else data.position.strip().upper(),
        description = data.description.strip(),
        company_id  = company_id,
    )
    db.add(b)
    db.commit()
    db.refresh(b)
    return _bin_dict(b, db)


# ── Update bin ────────────────────────────────────────────────

@router.put("/{bin_id}")
def update_bin(
    bin_id: int,
    data: BinUpdate,
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    b = db.query(BinLocation).filter(
        BinLocation.id == bin_id,
        BinLocation.company_id == company_id,
    ).first()
    if not b:
        raise HTTPException(status_code=404, detail="Bin not found")
    if data.code        is not None: b.code        = data.code.strip().upper()
    if data.zone        is not None: b.zone        = data.zone.strip().upper()
    if data.aisle       is not None: b.aisle       = data.aisle.strip()
    if data.shelf       is not None: b.shelf       = data.shelf.strip().upper()
    if data.position    is not None: b.position    = data.position.strip()
    if data.description is not None: b.description = data.description.strip()
    if data.is_active   is not None: b.is_active   = data.is_active
    db.commit()
    db.refresh(b)
    return _bin_dict(b, db)


# ── Deactivate bin ────────────────────────────────────────────

@router.delete("/{bin_id}")
def deactivate_bin(
    bin_id: int,
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    b = db.query(BinLocation).filter(
        BinLocation.id == bin_id,
        BinLocation.company_id == company_id,
    ).first()
    if not b:
        raise HTTPException(status_code=404, detail="Bin not found")
    # Unassign any inventory still pointing here
    db.query(Inventory).filter(Inventory.bin_location_id == bin_id).update(
        {"bin_location_id": None}
    )
    b.is_active = False
    db.commit()
    return {"ok": True, "message": f"Bin {b.code} deactivated"}


# ── Assign inventory to bin ────────────────────────────────────

@router.post("/assign")
def assign_inventory(
    data: AssignRequest,
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    inv = db.query(Inventory).filter(
        Inventory.id == data.inventory_id,
        Inventory.company_id == company_id,
    ).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Inventory record not found")
    if data.bin_location_id is not None:
        b = db.query(BinLocation).filter(
            BinLocation.id == data.bin_location_id,
            BinLocation.is_active == True,
        ).first()
        if not b:
            raise HTTPException(status_code=404, detail="Bin not found or inactive")
    inv.bin_location_id = data.bin_location_id
    db.commit()
    return {
        "ok":            True,
        "inventory_id":  inv.id,
        "bin_location_id": inv.bin_location_id,
        "bin_code":      b.code if data.bin_location_id else None,
    }


# ── Move stock between bins ───────────────────────────────────

@router.post("/move")
def move_stock(
    data: MoveRequest,
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    """Reassign the bin for a specific (sku, warehouse) inventory record."""
    inv = db.query(Inventory).filter(
        Inventory.sku_id    == data.sku_id,
        Inventory.warehouse == data.warehouse,
        Inventory.company_id == company_id,
    ).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Inventory record not found")

    if data.to_bin_id is not None:
        new_bin = db.query(BinLocation).filter(
            BinLocation.id       == data.to_bin_id,
            BinLocation.is_active == True,
        ).first()
        if not new_bin:
            raise HTTPException(status_code=404, detail="Destination bin not found or inactive")

    inv.bin_location_id = data.to_bin_id
    db.commit()
    return {"ok": True, "sku_id": data.sku_id, "warehouse": data.warehouse, "to_bin_id": data.to_bin_id}


# ── Bulk create bins ──────────────────────────────────────────

@router.post("/bulk-create")
def bulk_create(
    data: BulkCreateRequest,
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    zone   = data.zone.strip().upper()
    created = 0
    skipped = 0
    codes   = []

    # Normalise positions: filter out empty strings; None/[] means no position component
    raw_positions = [p.strip() for p in (data.positions or []) if p.strip()]
    use_positions = len(raw_positions) > 0

    # Fetch all existing codes once to avoid repeated queries (autoflush=False session)
    existing_codes: set = {
        row[0] for row in db.query(BinLocation.code).filter(BinLocation.company_id == company_id).all()
    }
    # Track codes added in this batch to prevent within-batch duplicates
    batch_codes: set = set()

    for aisle in data.aisles:
        a = aisle.strip()
        if not a:
            continue
        a_fmt = a.zfill(2) if a.isdigit() else a.upper()

        for shelf in data.shelves:
            s = shelf.strip()
            if not s:
                continue
            s_fmt = s.upper()

            if use_positions:
                combos = [(p.zfill(2) if p.isdigit() else p.upper()) for p in raw_positions]
            else:
                combos = [None]  # no position component

            for pos_fmt in combos:
                if pos_fmt is not None:
                    code = f"{zone}-{a_fmt}-{s_fmt}-{pos_fmt}"
                else:
                    code = f"{zone}-{a_fmt}-{s_fmt}"

                if code in existing_codes or code in batch_codes:
                    skipped += 1
                    continue

                db.add(BinLocation(
                    code       = code,
                    zone       = zone,
                    aisle      = a_fmt,
                    shelf      = s_fmt,
                    position   = pos_fmt or "",
                    company_id = company_id,
                ))
                batch_codes.add(code)
                created += 1
                codes.append(code)

    db.commit()
    return {"created": created, "skipped": skipped, "codes": codes[:20]}
