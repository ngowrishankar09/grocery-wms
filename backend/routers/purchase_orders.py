"""
Purchase Orders Router
======================
Endpoints:
  GET    /purchase-orders              → list all POs (filters: status, vendor_id)
  POST   /purchase-orders              → create PO (with items)
  GET    /purchase-orders/{id}         → single PO with items
  PUT    /purchase-orders/{id}         → update PO header (status, expected_date, notes)
  DELETE /purchase-orders/{id}         → cancel / delete draft PO
  POST   /purchase-orders/{id}/send    → mark as sent to vendor
  POST   /purchase-orders/{id}/receive → receive items (creates inventory batches)
  GET    /purchase-orders/stats        → summary counts
"""

from datetime import date, datetime, timedelta
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

import sys, os
sys.path.append(os.path.dirname(os.path.dirname(__file__)))
from database import get_db
from models import PurchaseOrder, PurchaseOrderItem, SKU, Vendor, Inventory, Batch
from security import get_current_user, get_company_id

router = APIRouter(prefix="/purchase-orders", tags=["Purchase Orders"])


# ── Pydantic schemas ───────────────────────────────────────────

class POItemIn(BaseModel):
    sku_id:        int
    cases_ordered: int
    unit_cost:     Optional[float] = None

class POCreate(BaseModel):
    vendor_id:     Optional[int] = None
    warehouse:     str = "WH1"
    expected_date: Optional[date] = None
    notes:         str = ""
    items:         List[POItemIn] = []

class POUpdate(BaseModel):
    vendor_id:     Optional[int] = None
    warehouse:     Optional[str] = None
    expected_date: Optional[date] = None
    notes:         Optional[str] = None
    status:        Optional[str] = None

class ReceiveItemIn(BaseModel):
    po_item_id:     int
    cases_received: int
    expiry_date:    Optional[date] = None
    has_expiry:     bool = False


# ── Helpers ───────────────────────────────────────────────────

def _generate_po_number(db: Session) -> str:
    year = datetime.utcnow().year
    prefix = f"PO-{year}-"
    last = db.query(PurchaseOrder).filter(
        PurchaseOrder.po_number.like(f"{prefix}%")
    ).order_by(PurchaseOrder.id.desc()).first()
    if last:
        try:
            seq = int(last.po_number.split("-")[-1]) + 1
        except Exception:
            seq = 1
    else:
        seq = 1
    return f"{prefix}{seq:04d}"


def _po_dict(po: PurchaseOrder) -> dict:
    total_ordered  = sum(i.cases_ordered  for i in po.items)
    total_received = sum(i.cases_received for i in po.items)
    total_cost = sum(
        (i.unit_cost or 0) * i.cases_ordered for i in po.items
    )
    return {
        "id":            po.id,
        "po_number":     po.po_number,
        "vendor_id":     po.vendor_id,
        "vendor_name":   po.vendor.name if po.vendor else None,
        "status":        po.status,
        "warehouse":     po.warehouse,
        "expected_date": po.expected_date.isoformat() if po.expected_date else None,
        "notes":         po.notes,
        "created_at":    po.created_at.isoformat() if po.created_at else None,
        "total_ordered": total_ordered,
        "total_received": total_received,
        "total_cost":    round(total_cost, 2),
        "freight_cost":  getattr(po, "freight_cost", 0.0) or 0.0,
        "duty_cost":     getattr(po, "duty_cost", 0.0) or 0.0,
        "other_cost":    getattr(po, "other_cost", 0.0) or 0.0,
        "landed_cost_allocated": getattr(po, "landed_cost_allocated", False) or False,
        "currency":      getattr(po, "currency", "USD") or "USD",
        "exchange_rate": getattr(po, "exchange_rate", 1.0) or 1.0,
        "items": [
            {
                "id":             i.id,
                "sku_id":         i.sku_id,
                "sku_code":       i.sku.sku_code      if i.sku else "",
                "product_name":   i.sku.product_name  if i.sku else "",
                "category":       i.sku.category      if i.sku else "",
                "case_size":      i.sku.case_size      if i.sku else 1,
                "cases_ordered":  i.cases_ordered,
                "cases_received": i.cases_received,
                "cases_pending":  max(0, i.cases_ordered - i.cases_received),
                "unit_cost":      i.unit_cost,
                "line_total":     round((i.unit_cost or 0) * i.cases_ordered, 2),
                "landed_cost_per_case": getattr(i, "landed_cost_per_case", None),
                "landed_unit_cost":     getattr(i, "landed_unit_cost", None),
            }
            for i in po.items
        ],
    }


# ── List POs ──────────────────────────────────────────────────

@router.get("/stats")
def get_stats(
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    pos = db.query(PurchaseOrder).filter(PurchaseOrder.company_id == company_id).all()
    return {
        "total":     len(pos),
        "draft":     sum(1 for p in pos if p.status == "draft"),
        "sent":      sum(1 for p in pos if p.status == "sent"),
        "partial":   sum(1 for p in pos if p.status == "partial"),
        "received":  sum(1 for p in pos if p.status == "received"),
        "cancelled": sum(1 for p in pos if p.status == "cancelled"),
    }


@router.get("")
def list_pos(
    status:    Optional[str] = None,
    vendor_id: Optional[int] = None,
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    q = db.query(PurchaseOrder).filter(PurchaseOrder.company_id == company_id)
    if status:
        q = q.filter(PurchaseOrder.status == status)
    if vendor_id:
        q = q.filter(PurchaseOrder.vendor_id == vendor_id)
    pos = q.order_by(PurchaseOrder.id.desc()).all()
    return [_po_dict(po) for po in pos]


# ── Auto-reorder ──────────────────────────────────────────────

@router.post("/auto-reorder")
def auto_reorder(payload: dict = {}, db: Session = Depends(get_db), company_id: int = Depends(get_company_id)):
    """Auto-create POs for all SKUs at or below reorder_point. dry_run=true returns preview only."""
    from models import SKU, Inventory, Vendor
    from sqlalchemy import func
    dry_run = payload.get("dry_run", True)

    skus = db.query(SKU).filter(SKU.company_id == company_id, SKU.is_active == True).all()
    inv_by_sku = {}
    for row in db.query(Inventory.sku_id, func.sum(Inventory.cases_on_hand)).filter(
        Inventory.sku_id.in_([s.id for s in skus])
    ).group_by(Inventory.sku_id).all():
        inv_by_sku[row[0]] = row[1] or 0

    triggers = []
    for sku in skus:
        on_hand = inv_by_sku.get(sku.id, 0)
        rp = sku.reorder_point or 10
        rq = sku.reorder_qty or 50
        if on_hand <= rp:
            triggers.append({
                "sku_id": sku.id,
                "sku_code": sku.sku_code,
                "product_name": sku.product_name,
                "on_hand": on_hand,
                "reorder_point": rp,
                "reorder_qty": rq,
                "vendor_id": sku.vendor_id,
                "vendor_name": sku.vendor.name if sku.vendor else None,
                "unit_cost": sku.cost_price,
            })

    if dry_run:
        return {"dry_run": True, "triggers": triggers, "count": len(triggers)}

    # Group by vendor and create POs
    from collections import defaultdict
    by_vendor = defaultdict(list)
    for t in triggers:
        by_vendor[t["vendor_id"]].append(t)

    created_pos = []
    for vendor_id, items in by_vendor.items():
        today = date.today()
        po_number = f"PO-AUTO-{today.strftime('%Y%m%d')}-{vendor_id or 0}"
        # Check if auto-PO already exists for today
        existing = db.query(PurchaseOrder).filter(PurchaseOrder.po_number == po_number).first()
        if existing:
            po_number = po_number + f"-{len(created_pos)+1}"

        po = PurchaseOrder(
            company_id=company_id,
            po_number=po_number,
            vendor_id=vendor_id,
            status="draft",
            warehouse="WH1",
            expected_date=today + timedelta(days=7),
            notes="Auto-generated by reorder automation",
        )
        db.add(po)
        db.flush()
        for item in items:
            db.add(PurchaseOrderItem(
                po_id=po.id,
                sku_id=item["sku_id"],
                cases_ordered=item["reorder_qty"],
                unit_cost=item["unit_cost"],
            ))
        db.commit()
        db.refresh(po)
        created_pos.append({"po_number": po.po_number, "vendor_id": vendor_id, "items": len(items)})

    return {"dry_run": False, "created": created_pos, "count": len(created_pos)}


# ── Landed Costs ──────────────────────────────────────────────

class LandedCostIn(BaseModel):
    freight_cost: float = 0.0
    duty_cost: float = 0.0
    other_cost: float = 0.0


@router.post("/{po_id}/landed-costs")
def set_landed_costs(
    po_id: int,
    payload: LandedCostIn,
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    """Set freight/duty/other costs and allocate proportionally to items by cases_ordered."""
    po = db.query(PurchaseOrder).filter(PurchaseOrder.id == po_id, PurchaseOrder.company_id == company_id).first()
    if not po:
        raise HTTPException(404, "PO not found")
    po.freight_cost = payload.freight_cost
    po.duty_cost = payload.duty_cost
    po.other_cost = payload.other_cost
    total_landed = payload.freight_cost + payload.duty_cost + payload.other_cost
    total_cases = sum(i.cases_ordered for i in po.items) or 1
    cost_per_case = total_landed / total_cases
    for item in po.items:
        item.landed_cost_per_case = round(cost_per_case, 4)
        item.landed_unit_cost = round((item.unit_cost or 0) + cost_per_case, 4)
    po.landed_cost_allocated = True
    db.commit()
    db.refresh(po)
    return _po_dict(po)


# ── Get single PO ─────────────────────────────────────────────

@router.get("/{po_id}")
def get_po(
    po_id: int,
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    po = db.query(PurchaseOrder).filter(
        PurchaseOrder.id == po_id,
        PurchaseOrder.company_id == company_id,
    ).first()
    if not po:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    return _po_dict(po)


# ── Create PO ─────────────────────────────────────────────────

@router.post("")
def create_po(
    data: POCreate,
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    if not data.items:
        raise HTTPException(status_code=400, detail="At least one item is required")

    po = PurchaseOrder(
        po_number     = _generate_po_number(db),
        vendor_id     = data.vendor_id,
        warehouse     = data.warehouse,
        expected_date = data.expected_date,
        notes         = data.notes,
        status        = "draft",
        company_id    = company_id,
    )
    db.add(po)
    db.flush()

    for item in data.items:
        sku = db.query(SKU).filter(SKU.id == item.sku_id, SKU.company_id == company_id).first()
        if not sku:
            raise HTTPException(status_code=400, detail=f"SKU {item.sku_id} not found")
        # Auto-fill unit_cost from SKU default if not provided
        cost = item.unit_cost if item.unit_cost is not None else sku.cost_price
        db.add(PurchaseOrderItem(
            po_id        = po.id,
            sku_id       = item.sku_id,
            cases_ordered= item.cases_ordered,
            unit_cost    = cost,
        ))

    db.commit()
    db.refresh(po)
    return _po_dict(po)


# ── Update PO ─────────────────────────────────────────────────

@router.put("/{po_id}")
def update_po(
    po_id: int,
    data: POUpdate,
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    po = db.query(PurchaseOrder).filter(
        PurchaseOrder.id == po_id,
        PurchaseOrder.company_id == company_id,
    ).first()
    if not po:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    if po.status == "cancelled":
        raise HTTPException(status_code=400, detail="Cannot edit a cancelled PO")

    if data.vendor_id     is not None: po.vendor_id     = data.vendor_id
    if data.warehouse     is not None: po.warehouse     = data.warehouse
    if data.expected_date is not None: po.expected_date = data.expected_date
    if data.notes         is not None: po.notes         = data.notes
    if data.status        is not None: po.status        = data.status

    db.commit()
    db.refresh(po)
    return _po_dict(po)


# ── Cancel / delete PO ────────────────────────────────────────

@router.delete("/{po_id}")
def cancel_po(
    po_id: int,
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    po = db.query(PurchaseOrder).filter(
        PurchaseOrder.id == po_id,
        PurchaseOrder.company_id == company_id,
    ).first()
    if not po:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    if po.status in ("received",):
        raise HTTPException(status_code=400, detail="Cannot cancel a fully received PO")
    if po.status == "draft":
        db.delete(po)
        db.commit()
        return {"ok": True, "action": "deleted"}
    po.status = "cancelled"
    db.commit()
    return {"ok": True, "action": "cancelled"}


# ── Send PO to vendor ─────────────────────────────────────────

@router.post("/{po_id}/send")
def send_po(
    po_id: int,
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    po = db.query(PurchaseOrder).filter(
        PurchaseOrder.id == po_id,
        PurchaseOrder.company_id == company_id,
    ).first()
    if not po:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    if po.status not in ("draft",):
        raise HTTPException(status_code=400, detail=f"Cannot send a PO with status '{po.status}'")
    po.status = "sent"
    db.commit()
    return _po_dict(po)


# ── Receive against PO ────────────────────────────────────────

@router.post("/{po_id}/receive")
def receive_po(
    po_id: int,
    items: List[ReceiveItemIn],
    received_date: Optional[date] = None,
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    """
    Record physical receipt of goods against a PO.
    Creates Batch records and updates Inventory.
    """
    po = db.query(PurchaseOrder).filter(
        PurchaseOrder.id == po_id,
        PurchaseOrder.company_id == company_id,
    ).first()
    if not po:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    if po.status == "cancelled":
        raise HTTPException(status_code=400, detail="Cannot receive against a cancelled PO")
    if po.status == "received":
        raise HTTPException(status_code=400, detail="PO is already fully received")

    recv_date = received_date or date.today()
    received_any = False

    for recv in items:
        if recv.cases_received <= 0:
            continue

        po_item = db.query(PurchaseOrderItem).filter(
            PurchaseOrderItem.id == recv.po_item_id,
            PurchaseOrderItem.po_id == po_id,
        ).first()
        if not po_item:
            raise HTTPException(status_code=404, detail=f"PO item {recv.po_item_id} not found")

        pending = po_item.cases_ordered - po_item.cases_received
        qty = min(recv.cases_received, pending)
        if qty <= 0:
            continue

        # Generate unique batch code
        batch_code = f"{po.po_number}-{po_item.sku_id}-{recv_date.strftime('%Y%m%d')}"
        # Ensure uniqueness if multiple receipts on same day
        existing = db.query(Batch).filter(Batch.batch_code.like(f"{batch_code}%")).count()
        if existing:
            batch_code = f"{batch_code}-{existing + 1}"

        # Create a Batch record
        batch = Batch(
            batch_code     = batch_code,
            sku_id         = po_item.sku_id,
            warehouse      = po.warehouse,
            received_date  = recv_date,
            cases_received = qty,
            cases_remaining= qty,
            has_expiry     = recv.has_expiry,
            expiry_date    = recv.expiry_date if recv.has_expiry else None,
            supplier_ref   = po.po_number,
            company_id     = company_id,
        )
        db.add(batch)

        # Update Inventory
        inv = db.query(Inventory).filter(
            Inventory.sku_id   == po_item.sku_id,
            Inventory.warehouse == po.warehouse,
            Inventory.company_id == company_id,
        ).first()
        if inv:
            inv.cases_on_hand += qty
        else:
            db.add(Inventory(
                sku_id=po_item.sku_id,
                warehouse=po.warehouse,
                cases_on_hand=qty,
                company_id=company_id,
            ))

        po_item.cases_received += qty
        received_any = True

    if not received_any:
        raise HTTPException(status_code=400, detail="No items to receive (all fully received or qty=0)")

    # Update PO status
    all_items = po.items
    total_ordered  = sum(i.cases_ordered  for i in all_items)
    total_received = sum(i.cases_received for i in all_items)
    if total_received >= total_ordered:
        po.status = "received"
    else:
        po.status = "partial"

    db.commit()
    db.refresh(po)
    return _po_dict(po)
