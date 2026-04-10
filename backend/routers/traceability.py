from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime
import sys, os
sys.path.append(os.path.dirname(os.path.dirname(__file__)))
from database import get_db
from models import Batch, SKU, Vendor, DispatchItem, OrderItem, Order, Customer, PurchaseOrderItem, PurchaseOrder
from security import get_current_user, get_company_id as get_current_company_id

router = APIRouter(prefix="/traceability", tags=["traceability"])

def _fmt_batch(b):
    return {
        "id": b.id,
        "batch_code": b.batch_code,
        "sku_id": b.sku_id,
        "sku_code": b.sku.sku_code if b.sku else None,
        "product_name": b.sku.product_name if b.sku else None,
        "cases_received": b.cases_received,
        "cases_remaining": b.cases_remaining,
        "received_date": str(b.received_date) if b.received_date else None,
        "expiry_date": str(b.expiry_date) if b.expiry_date else None,
        "lot_number": b.lot_number,
        "supplier_ref": b.supplier_ref,
        "warehouse": b.warehouse,
        "is_recalled": getattr(b, 'is_recalled', False),
        "recall_reason": getattr(b, 'recall_reason', None),
        "recalled_at": str(b.recalled_at) if getattr(b, 'recalled_at', None) else None,
    }


@router.get("/batch/{batch_code}/forward")
def forward_trace(batch_code: str, db: Session = Depends(get_db), company_id: int = Depends(get_current_company_id)):
    """Forward trace: batch → dispatch items → orders → customers"""
    batch = db.query(Batch).filter(Batch.batch_code == batch_code, Batch.company_id == company_id).first()
    if not batch:
        raise HTTPException(404, "Batch not found")

    dispatches = []
    for di in batch.dispatch_items:
        oi = di.order_item
        if not oi:
            continue
        order = oi.order
        if not order:
            continue
        customer = order.customer
        dispatches.append({
            "dispatch_item_id": di.id,
            "cases_picked": di.cases_picked,
            "picked_at": str(di.picked_at) if di.picked_at else None,
            "order_id": order.id,
            "order_number": order.order_number,
            "order_date": str(order.order_date) if order.order_date else None,
            "order_status": order.status,
            "customer_id": customer.id if customer else None,
            "customer_name": customer.name if customer else order.store_name,
            "customer_phone": customer.phone if customer else None,
            "customer_email": customer.email if customer else None,
            "sku_id": oi.sku_id,
        })

    return {
        "batch": _fmt_batch(batch),
        "dispatches": dispatches,
        "affected_customers": len(set(d["customer_id"] for d in dispatches if d["customer_id"])),
        "total_cases_dispatched": sum(d["cases_picked"] for d in dispatches),
    }


@router.get("/batch/{batch_code}/backward")
def backward_trace(batch_code: str, db: Session = Depends(get_db), company_id: int = Depends(get_current_company_id)):
    """Backward trace: batch → SKU → vendor"""
    batch = db.query(Batch).filter(Batch.batch_code == batch_code, Batch.company_id == company_id).first()
    if not batch:
        raise HTTPException(404, "Batch not found")

    sku = batch.sku
    vendor = None
    po_info = None

    if sku and sku.vendor_id:
        vendor = db.query(Vendor).filter(Vendor.id == sku.vendor_id).first()

    po_item_id = getattr(batch, 'po_item_id', None)
    if po_item_id:
        poi = db.query(PurchaseOrderItem).filter(PurchaseOrderItem.id == po_item_id).first()
        if poi:
            po = poi.po
            if po:
                po_info = {
                    "po_id": po.id,
                    "po_number": po.po_number,
                    "status": po.status,
                    "expected_date": str(po.expected_date) if po.expected_date else None,
                    "unit_cost": poi.unit_cost,
                }

    return {
        "batch": _fmt_batch(batch),
        "sku": {
            "id": sku.id if sku else None,
            "sku_code": sku.sku_code if sku else None,
            "product_name": sku.product_name if sku else None,
            "category": sku.category if sku else None,
        } if sku else None,
        "vendor": {
            "id": vendor.id,
            "name": vendor.name,
            "contact_person": vendor.contact_person,
            "phone": vendor.phone,
            "email": vendor.email,
        } if vendor else None,
        "purchase_order": po_info,
    }


@router.get("/sku/{sku_id}/batches")
def batches_for_sku(sku_id: int, db: Session = Depends(get_db), company_id: int = Depends(get_current_company_id)):
    batches = db.query(Batch).filter(Batch.sku_id == sku_id, Batch.company_id == company_id).order_by(Batch.received_date.desc()).all()
    return [_fmt_batch(b) for b in batches]


@router.get("/recalls")
def list_recalls(db: Session = Depends(get_db), company_id: int = Depends(get_current_company_id)):
    recalled = db.query(Batch).filter(Batch.company_id == company_id, Batch.is_recalled == True).all()
    return [_fmt_batch(b) for b in recalled]


@router.post("/recall/{batch_code}")
def recall_batch(batch_code: str, payload: dict, db: Session = Depends(get_db), company_id: int = Depends(get_current_company_id)):
    batch = db.query(Batch).filter(Batch.batch_code == batch_code, Batch.company_id == company_id).first()
    if not batch:
        raise HTTPException(404, "Batch not found")
    batch.is_recalled = True
    batch.recall_reason = payload.get("reason", "Product recall")
    batch.recalled_at = datetime.utcnow()
    db.commit()
    db.refresh(batch)
    return {"ok": True, "batch": _fmt_batch(batch)}


@router.post("/recall/{batch_code}/undo")
def undo_recall(batch_code: str, db: Session = Depends(get_db), company_id: int = Depends(get_current_company_id)):
    batch = db.query(Batch).filter(Batch.batch_code == batch_code, Batch.company_id == company_id).first()
    if not batch:
        raise HTTPException(404, "Batch not found")
    batch.is_recalled = False
    batch.recall_reason = None
    batch.recalled_at = None
    db.commit()
    return {"ok": True}


@router.get("/search")
def search_batches(q: str = "", db: Session = Depends(get_db), company_id: int = Depends(get_current_company_id)):
    """Search batches by batch_code, lot_number, supplier_ref"""
    query = db.query(Batch).filter(Batch.company_id == company_id)
    if q:
        like = f"%{q}%"
        query = query.filter(
            (Batch.batch_code.ilike(like)) |
            (Batch.lot_number.ilike(like)) |
            (Batch.supplier_ref.ilike(like))
        )
    batches = query.order_by(Batch.received_date.desc()).limit(50).all()
    return [_fmt_batch(b) for b in batches]
