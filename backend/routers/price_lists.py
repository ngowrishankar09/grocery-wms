"""
Customer Price Lists Router
===========================
Endpoints:
  GET    /price-lists              → list all price lists
  POST   /price-lists              → create price list
  GET    /price-lists/{id}         → single price list with items
  PUT    /price-lists/{id}         → update price list header
  DELETE /price-lists/{id}         → delete price list
  GET    /price-lists/{id}/items   → list items for a price list
  PUT    /price-lists/{id}/items   → bulk-set items (replace all)
  GET    /price-lists/for-customer/{customer_id} → price for a specific customer+sku
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel

import sys, os
sys.path.append(os.path.dirname(os.path.dirname(__file__)))
from database import get_db
from models import PriceList, PriceListItem, Customer, SKU
from security import get_current_user, get_company_id

router = APIRouter(prefix="/price-lists", tags=["Price Lists"])


# ── Schemas ────────────────────────────────────────────────────

class PriceListCreate(BaseModel):
    name:        str
    description: Optional[str] = None

class PriceListUpdate(BaseModel):
    name:        Optional[str] = None
    description: Optional[str] = None
    is_active:   Optional[bool] = None

class PriceItemIn(BaseModel):
    sku_id:     int
    unit_price: float

class BulkItemsIn(BaseModel):
    items: List[PriceItemIn]


# ── Helpers ────────────────────────────────────────────────────

def _pl_dict(pl: PriceList, include_items: bool = False) -> dict:
    d = {
        "id":          pl.id,
        "name":        pl.name,
        "description": pl.description,
        "is_active":   pl.is_active,
        "item_count":  len(pl.items),
        "created_at":  pl.created_at.isoformat() if pl.created_at else None,
    }
    if include_items:
        d["items"] = [
            {
                "id":           i.id,
                "sku_id":       i.sku_id,
                "sku_code":     i.sku.sku_code     if i.sku else "",
                "product_name": i.sku.product_name if i.sku else "",
                "category":     i.sku.category     if i.sku else "",
                "unit_price":   i.unit_price,
                "cost_price":   i.sku.cost_price   if i.sku else None,
            }
            for i in pl.items
        ]
    return d


# ── List / Create ──────────────────────────────────────────────

@router.get("")
def list_price_lists(
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    pls = db.query(PriceList).filter(
        PriceList.company_id == company_id,
    ).order_by(PriceList.name).all()
    return [_pl_dict(pl) for pl in pls]


@router.post("")
def create_price_list(
    data: PriceListCreate,
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    pl = PriceList(name=data.name, description=data.description, company_id=company_id)
    db.add(pl)
    db.commit()
    db.refresh(pl)
    return _pl_dict(pl, include_items=True)


# ── Single PL ──────────────────────────────────────────────────

@router.get("/{pl_id}")
def get_price_list(
    pl_id: int,
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    pl = db.query(PriceList).filter(
        PriceList.id == pl_id,
        PriceList.company_id == company_id,
    ).first()
    if not pl:
        raise HTTPException(status_code=404, detail="Price list not found")
    return _pl_dict(pl, include_items=True)


@router.put("/{pl_id}")
def update_price_list(
    pl_id: int,
    data: PriceListUpdate,
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    pl = db.query(PriceList).filter(
        PriceList.id == pl_id,
        PriceList.company_id == company_id,
    ).first()
    if not pl:
        raise HTTPException(status_code=404, detail="Price list not found")
    if data.name        is not None: pl.name        = data.name
    if data.description is not None: pl.description = data.description
    if data.is_active   is not None: pl.is_active   = data.is_active
    db.commit()
    db.refresh(pl)
    return _pl_dict(pl, include_items=True)


@router.delete("/{pl_id}")
def delete_price_list(
    pl_id: int,
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    pl = db.query(PriceList).filter(
        PriceList.id == pl_id,
        PriceList.company_id == company_id,
    ).first()
    if not pl:
        raise HTTPException(status_code=404, detail="Price list not found")
    # Unlink customers
    db.query(Customer).filter(
        Customer.price_list_id == pl_id,
        Customer.company_id == company_id,
    ).update({"price_list_id": None})
    db.delete(pl)
    db.commit()
    return {"ok": True}


# ── Items (bulk replace) ───────────────────────────────────────

@router.put("/{pl_id}/items")
def set_items(
    pl_id: int,
    data: BulkItemsIn,
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    """Replace all items for this price list."""
    pl = db.query(PriceList).filter(
        PriceList.id == pl_id,
        PriceList.company_id == company_id,
    ).first()
    if not pl:
        raise HTTPException(status_code=404, detail="Price list not found")

    # Delete existing items
    db.query(PriceListItem).filter(PriceListItem.price_list_id == pl_id).delete()

    for item in data.items:
        sku = db.query(SKU).filter(SKU.id == item.sku_id, SKU.company_id == company_id).first()
        if not sku:
            continue
        db.add(PriceListItem(
            price_list_id = pl_id,
            sku_id        = item.sku_id,
            unit_price    = item.unit_price,
        ))

    db.commit()
    db.refresh(pl)
    return _pl_dict(pl, include_items=True)


# ── Lookup price for customer+sku ──────────────────────────────

@router.get("/lookup/{customer_id}/{sku_id}")
def lookup_price(
    customer_id: int,
    sku_id: int,
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    """Return the unit_price for a given customer+sku, or None if using default."""
    customer = db.query(Customer).filter(
        Customer.id == customer_id,
        Customer.company_id == company_id,
    ).first()
    if not customer or not customer.price_list_id:
        return {"unit_price": None, "source": "default"}

    item = db.query(PriceListItem).filter(
        PriceListItem.price_list_id == customer.price_list_id,
        PriceListItem.sku_id == sku_id,
    ).first()

    if item:
        return {"unit_price": item.unit_price, "source": "price_list", "price_list": customer.price_list.name}
    return {"unit_price": None, "source": "default"}
