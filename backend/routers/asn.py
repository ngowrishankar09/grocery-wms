from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Optional
from datetime import date, datetime
import sys, os
sys.path.append(os.path.dirname(os.path.dirname(__file__)))
from database import get_db
from models import SupplierASN, SupplierASNItem, Vendor, PurchaseOrder, SKU
from security import get_current_user, get_company_id as get_current_company_id

router = APIRouter(prefix="/asn", tags=["asn"])


class ASNItemIn(BaseModel):
    sku_id: int
    cases_expected: int
    lot_number: Optional[str] = None
    expiry_date: Optional[date] = None


class ASNCreate(BaseModel):
    po_id: Optional[int] = None
    vendor_id: Optional[int] = None
    ship_date: Optional[date] = None
    eta: Optional[date] = None
    carrier: Optional[str] = None
    tracking_number: Optional[str] = None
    notes: Optional[str] = None
    items: List[ASNItemIn] = []


def _fmt_item(i):
    return {
        "id": i.id,
        "sku_id": i.sku_id,
        "sku_code": i.sku.sku_code if i.sku else None,
        "product_name": i.sku.product_name if i.sku else None,
        "cases_expected": i.cases_expected,
        "cases_received": i.cases_received,
        "lot_number": i.lot_number,
        "expiry_date": str(i.expiry_date) if i.expiry_date else None,
    }


def _fmt(asn):
    return {
        "id": asn.id,
        "asn_number": asn.asn_number,
        "po_id": asn.po_id,
        "po_number": asn.po.po_number if asn.po else None,
        "vendor_id": asn.vendor_id,
        "vendor_name": asn.vendor.name if asn.vendor else None,
        "status": asn.status,
        "ship_date": str(asn.ship_date) if asn.ship_date else None,
        "eta": str(asn.eta) if asn.eta else None,
        "carrier": asn.carrier,
        "tracking_number": asn.tracking_number,
        "notes": asn.notes,
        "created_at": str(asn.created_at) if asn.created_at else None,
        "items": [_fmt_item(i) for i in asn.items],
    }


def _next_asn_number(db: Session, company_id: int) -> str:
    from datetime import date
    today = date.today().strftime("%Y%m%d")
    prefix = f"ASN-{today}-"
    last = db.query(SupplierASN).filter(
        SupplierASN.company_id == company_id,
        SupplierASN.asn_number.like(f"{prefix}%")
    ).order_by(SupplierASN.id.desc()).first()
    seq = 1
    if last:
        try:
            seq = int(last.asn_number.split("-")[-1]) + 1
        except Exception:
            pass
    return f"{prefix}{seq:03d}"


@router.get("/asns")
def list_asns(db: Session = Depends(get_db), company_id: int = Depends(get_current_company_id)):
    asns = db.query(SupplierASN).filter(SupplierASN.company_id == company_id).order_by(SupplierASN.id.desc()).all()
    return [_fmt(a) for a in asns]


@router.post("/asns")
def create_asn(payload: ASNCreate, db: Session = Depends(get_db), company_id: int = Depends(get_current_company_id)):
    asn = SupplierASN(
        company_id=company_id,
        asn_number=_next_asn_number(db, company_id),
        po_id=payload.po_id,
        vendor_id=payload.vendor_id,
        ship_date=payload.ship_date,
        eta=payload.eta,
        carrier=payload.carrier,
        tracking_number=payload.tracking_number,
        notes=payload.notes,
    )
    db.add(asn)
    db.flush()
    for it in payload.items:
        db.add(SupplierASNItem(
            asn_id=asn.id,
            sku_id=it.sku_id,
            cases_expected=it.cases_expected,
            lot_number=it.lot_number,
            expiry_date=it.expiry_date,
        ))
    db.commit()
    db.refresh(asn)
    return _fmt(asn)


@router.get("/asns/{asn_id}")
def get_asn(asn_id: int, db: Session = Depends(get_db), company_id: int = Depends(get_current_company_id)):
    asn = db.query(SupplierASN).filter(SupplierASN.id == asn_id, SupplierASN.company_id == company_id).first()
    if not asn:
        raise HTTPException(404, "ASN not found")
    return _fmt(asn)


@router.put("/asns/{asn_id}")
def update_asn(asn_id: int, payload: ASNCreate, db: Session = Depends(get_db), company_id: int = Depends(get_current_company_id)):
    asn = db.query(SupplierASN).filter(SupplierASN.id == asn_id, SupplierASN.company_id == company_id).first()
    if not asn:
        raise HTTPException(404, "ASN not found")
    for k, v in payload.dict(exclude={'items'}).items():
        if hasattr(asn, k) and v is not None:
            setattr(asn, k, v)
    db.commit()
    db.refresh(asn)
    return _fmt(asn)


@router.patch("/asns/{asn_id}/status")
def update_status(asn_id: int, payload: dict, db: Session = Depends(get_db), company_id: int = Depends(get_current_company_id)):
    asn = db.query(SupplierASN).filter(SupplierASN.id == asn_id, SupplierASN.company_id == company_id).first()
    if not asn:
        raise HTTPException(404, "ASN not found")
    asn.status = payload.get("status", asn.status)
    db.commit()
    return {"ok": True, "status": asn.status}


@router.delete("/asns/{asn_id}")
def delete_asn(asn_id: int, db: Session = Depends(get_db), company_id: int = Depends(get_current_company_id)):
    asn = db.query(SupplierASN).filter(SupplierASN.id == asn_id, SupplierASN.company_id == company_id).first()
    if not asn:
        raise HTTPException(404, "ASN not found")
    db.delete(asn)
    db.commit()
    return {"ok": True}
