"""
Repacking / Production Tracking Router
=======================================
Tracks bulk-to-retail repacking, calculates waste/variance, and flags
potential theft when variance exceeds BOM-defined tolerance.

Prefix: /repacking  Tags: ["Repacking"]
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func as sqlfunc
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, date
import httpx

import sys, os
sys.path.append(os.path.dirname(os.path.dirname(__file__)))
from database import get_db
from models import BillOfMaterial, PackingRun, PackingRunOutput, PackingRunBulk, SKU, LandedCost, PackingRunCost, LandedCostBatch, ShipmentCostLine, RunCostLine, Inventory
from security import get_current_user, get_company_id

router = APIRouter(prefix="/repacking", tags=["Repacking"])


# ── Inventory helpers ─────────────────────────────────────────────

def _weight_to_kg(weight, uom: str) -> float:
    """Convert a weight value + unit string to kg. Returns 0 if unable."""
    try:
        w = float(weight)
    except (TypeError, ValueError):
        return 0.0
    if not uom:
        return w
    uom = uom.lower().strip()
    if uom in ("kg", "kgs", "kilogram", "kilograms"):
        return w
    if uom in ("g", "gm", "gram", "grams"):
        return w / 1000
    if uom in ("lb", "lbs", "pound", "pounds"):
        return w * 0.453592
    if uom in ("oz", "ounce", "ounces"):
        return w * 0.0283495
    if uom in ("t", "ton", "tonne", "metric ton"):
        return w * 1000
    return w  # fallback: assume kg


def _deduct_bulk_inventory(bulk_sku_id: int, kg_consumed: float, company_id: int, db: Session):
    """
    Deduct kg_consumed from a bulk SKU's inventory using the float-accumulator
    pattern so fractional-sack usage accumulates correctly across multiple runs.
    Drains WH1 first, then WH2.
    """
    if kg_consumed <= 0:
        return

    bulk_sku = db.query(SKU).filter(SKU.id == bulk_sku_id).first()
    if not bulk_sku:
        return

    bulk_unit_kg = _weight_to_kg(bulk_sku.unit_weight, bulk_sku.unit_weight_uom)
    if not bulk_unit_kg or bulk_unit_kg <= 0:
        bulk_unit_kg = 1.0  # fallback: treat 1 case = 1 kg

    remaining_kg = kg_consumed
    for wh in ["WH1", "WH2"]:
        if remaining_kg <= 0:
            break
        inv = db.query(Inventory).filter(
            Inventory.sku_id     == bulk_sku_id,
            Inventory.warehouse  == wh,
            Inventory.company_id == company_id,
        ).first()
        if inv is None:
            continue

        # Accumulate kg consumed on this inventory row
        inv.bulk_kg_consumed = (inv.bulk_kg_consumed or 0.0) + remaining_kg
        remaining_kg = 0.0

        # Convert to whole-sack deductions
        full_sacks = int(inv.bulk_kg_consumed // bulk_unit_kg)
        if full_sacks > 0:
            actual_deduct     = min(full_sacks, max(0, inv.cases_on_hand))
            inv.cases_on_hand = max(0, inv.cases_on_hand - actual_deduct)
            inv.bulk_kg_consumed -= full_sacks * bulk_unit_kg  # keep remainder
        inv.updated_at = datetime.utcnow()


def _add_retail_inventory(sku_id: int, cases: int, company_id: int, db: Session):
    """
    Add produced retail cases to WH1 unrestricted inventory.
    Creates the row if it does not exist yet.
    """
    if cases <= 0:
        return
    inv = db.query(Inventory).filter(
        Inventory.sku_id     == sku_id,
        Inventory.warehouse  == "WH1",
        Inventory.company_id == company_id,
        Inventory.stock_type == "unrestricted",
    ).first()
    if not inv:
        inv = Inventory(
            sku_id=sku_id, warehouse="WH1",
            cases_on_hand=0, company_id=company_id,
            stock_type="unrestricted",
        )
        db.add(inv)
        db.flush()
    inv.cases_on_hand = (inv.cases_on_hand or 0) + cases
    inv.updated_at = datetime.utcnow()


# ── Pydantic schemas ─────────────────────────────────────────────

class BOMIn(BaseModel):
    output_sku_id:     int
    input_sku_id:      int
    qty_per_unit:      float
    unit:              str = "kg"
    waste_pct_allowed: float = 2.0
    notes:             Optional[str] = None

class RunIn(BaseModel):
    run_ref:        Optional[str] = None
    bulk_sku_id:    int
    qty_start:      float
    started_by:     Optional[str] = None
    notes:          Optional[str] = None
    landed_cost_id: Optional[int] = None   # link a specific landed-cost batch
    units_planned:  Optional[int] = None   # target units to pack this run

class OutputIn(BaseModel):
    sku_id:        int
    qty_packed:    float              # cases (kept for backward compat)
    units_packed:  Optional[int] = None   # actual units packed (new)
    units_planned: Optional[int] = None   # target units for this SKU (new)

class CloseIn(BaseModel):
    # List of {bulk_sku_id, qty_end} for each bulk entry in this run
    bulk_entries: List[dict]

class LandedCostIn(BaseModel):
    bulk_sku_id:       int
    batch_ref:         Optional[str]   = None
    qty_kg:            float
    cost_material:     float           = 0.0
    cost_freight:      float           = 0.0
    cost_duty:         float           = 0.0
    cost_packaging_mat: float          = 0.0
    cost_labor:        float           = 0.0
    cost_overhead:     float           = 0.0
    cost_other:        float           = 0.0
    currency:          str             = "USD"
    notes:             Optional[str]   = None

class PackingRunCostIn(BaseModel):
    cost_packaging_mat: float          = 0.0
    cost_labor:         float          = 0.0
    cost_overhead:      float          = 0.0
    cost_other:         float          = 0.0
    labor_hours:        Optional[float] = None
    notes:              Optional[str]  = None


# ── Purchase / Shipment schemas ──────────────────────────────────

class CostLineIn(BaseModel):
    """One multi-currency cost line (used for both shipment and run cost lines)."""
    description:    str
    amount:         float = 0.0
    currency:       str   = "USD"   # USD | INR | GBP | EUR | PKR
    fx_rate_to_usd: float = 1.0
    sort_order:     int   = 0
    sku_id:         Optional[int] = None  # for shipment lines: which SKU this applies to (None = shared)


class PurchaseLineIn(BaseModel):
    """One product line inside a multi-SKU purchase."""
    bulk_sku_id:       int
    qty_kg:            float
    cost_material:     float = 0.0   # FOB / per-SKU material cost
    cost_packaging_mat: float = 0.0  # per-SKU packaging
    cost_labor:        float = 0.0   # per-SKU labor

class PurchaseBatchIn(BaseModel):
    """Header for a whole shipment.  Shared costs auto-split by weight across lines."""
    batch_ref:        Optional[str]  = None
    supplier:         Optional[str]  = None
    supplier_country: Optional[str]  = None
    currency:         str            = "USD"
    purchase_date:    Optional[date] = None   # date goods were purchased / invoiced
    exchange_rate:    float          = 1.0    # FX rate: 1 foreign unit → 1 base unit (e.g. 1 INR → 0.012 USD)
    shared_freight:   float          = 0.0
    shared_duty:      float          = 0.0
    shared_overhead:  float          = 0.0
    shared_other:     float          = 0.0
    notes:            Optional[str]  = None
    lines:            List[PurchaseLineIn]
    cost_lines:       List[CostLineIn] = []   # new multi-currency cost lines


class BulkAddIn(BaseModel):
    """Add an extra bulk material to an existing open packing run."""
    bulk_sku_id: int
    qty_start:   float


# ── Helpers ──────────────────────────────────────────────────────

def _sku_name(db: Session, sku_id: int) -> str:
    sku = db.query(SKU).filter(SKU.id == sku_id).first()
    if not sku:
        return f"SKU#{sku_id}"
    return sku.product_name

def _sku_code(db: Session, sku_id: int) -> str:
    sku = db.query(SKU).filter(SKU.id == sku_id).first()
    return sku.sku_code if sku else ""

def _fmt_run(run: PackingRun, db: Session) -> dict:
    outputs = db.query(PackingRunOutput).filter(PackingRunOutput.run_id == run.id).all()
    bulk_entries = db.query(PackingRunBulk).filter(PackingRunBulk.run_id == run.id).all()
    # Resolve linked landed-cost batch label
    linked_lc = None
    if getattr(run, 'landed_cost_id', None):
        linked_lc = db.query(LandedCost).filter(LandedCost.id == run.landed_cost_id).first()
    return {
        "id":                run.id,
        "run_ref":           run.run_ref,
        "status":            run.status,
        "units_planned":     getattr(run, 'units_planned', None),
        "landed_cost_id":    getattr(run, 'landed_cost_id', None),
        "linked_batch_ref":  linked_lc.batch_ref if linked_lc else None,
        "linked_cost_per_kg": linked_lc.cost_per_kg if linked_lc else None,
        "started_by":        run.started_by,
        "notes":             run.notes,
        "created_at":        run.created_at.isoformat() if run.created_at else None,
        "closed_at":         run.closed_at.isoformat() if run.closed_at else None,
        "theoretical_kg":    run.theoretical_kg,
        "actual_kg":         run.actual_kg,
        "variance_kg":       run.variance_kg,
        "variance_pct":      run.variance_pct,
        "flag_high_variance": run.flag_high_variance,
        "outputs": [
            {
                "id":            o.id,
                "sku_id":        o.sku_id,
                "sku_code":      _sku_code(db, o.sku_id),
                "product_name":  _sku_name(db, o.sku_id),
                "qty_packed":    o.qty_packed,
                "units_packed":  getattr(o, 'units_packed', None),
                "units_planned": getattr(o, 'units_planned', None),
                "shortage_units": (
                    (getattr(o, 'units_planned', None) or 0) - (getattr(o, 'units_packed', None) or 0)
                    if (getattr(o, 'units_planned', None) is not None and getattr(o, 'units_packed', None) is not None
                        and (getattr(o, 'units_planned', None) or 0) > (getattr(o, 'units_packed', None) or 0))
                    else 0
                ),
                "theoretical_kg": o.theoretical_kg,
                # Include BOM rate so frontend can show live expected-remaining
                # before the run is closed (theoretical_kg is only set at close time)
                **({
                    "bom_qty_per_unit": bom.qty_per_unit,
                    "bom_unit":         bom.unit,
                    "bom_live_kg":      round(o.qty_packed * bom.qty_per_unit, 4),
                } if (bom := db.query(BillOfMaterial).filter(
                    BillOfMaterial.company_id == run.company_id,
                    BillOfMaterial.output_sku_id == o.sku_id,
                ).first()) else {
                    "bom_qty_per_unit": None,
                    "bom_unit":         None,
                    "bom_live_kg":      None,
                }),
            }
            for o in outputs
        ],
        "bulk_entries": [
            {
                "id":           b.id,
                "bulk_sku_id":  b.bulk_sku_id,
                "sku_code":     _sku_code(db, b.bulk_sku_id),
                "product_name": _sku_name(db, b.bulk_sku_id),
                "qty_start":    b.qty_start,
                "qty_end":      b.qty_end,
                "actual_used":  b.actual_used,
                "theoretical":  b.theoretical,
                "variance":     b.variance,
                "variance_pct": b.variance_pct,
            }
            for b in bulk_entries
        ],
    }


# ── Cost line helpers ─────────────────────────────────────────────

def _save_shipment_cost_lines(db: Session, batch_id: int, lines: List[CostLineIn]):
    """Delete existing cost lines for this batch and replace with new ones."""
    db.query(ShipmentCostLine).filter(ShipmentCostLine.purchase_batch_id == batch_id).delete()
    for i, line in enumerate(lines):
        cl = ShipmentCostLine(
            purchase_batch_id = batch_id,
            sku_id            = line.sku_id,
            description       = line.description,
            amount            = line.amount,
            currency          = line.currency,
            fx_rate_to_usd    = line.fx_rate_to_usd,
            sort_order        = line.sort_order if line.sort_order else i,
        )
        db.add(cl)


def _save_run_cost_lines(db: Session, run_id: int, lines: List[CostLineIn]):
    """Delete existing run cost lines and replace with new ones."""
    db.query(RunCostLine).filter(RunCostLine.run_id == run_id).delete()
    for i, line in enumerate(lines):
        cl = RunCostLine(
            run_id         = run_id,
            description    = line.description,
            amount         = line.amount,
            currency       = line.currency,
            fx_rate_to_usd = line.fx_rate_to_usd,
            sort_order     = line.sort_order if line.sort_order else i,
        )
        db.add(cl)


# ── FX Rate endpoint ──────────────────────────────────────────────

@router.get("/fx-rate/{from_currency}")
async def get_fx_rate(from_currency: str):
    """Fetch live exchange rate: 1 unit of from_currency → how many USD."""
    from_currency = from_currency.upper()
    if from_currency == "USD":
        return {"from": "USD", "to": "USD", "rate": 1.0}
    try:
        async with httpx.AsyncClient(timeout=8.0, follow_redirects=True) as client:
            r = await client.get(
                "https://api.frankfurter.app/latest",
                params={"from": from_currency, "to": "USD"},
            )
            if r.status_code == 404:
                raise HTTPException(
                    status_code=400,
                    detail=f"{from_currency} is not supported by the live FX service — please enter the rate manually",
                )
            r.raise_for_status()
            data = r.json()
            rate = data.get("rates", {}).get("USD")
            if rate is None:
                raise HTTPException(status_code=400, detail=f"Could not fetch rate for {from_currency}")
            return {"from": from_currency, "to": "USD", "rate": round(rate, 8)}
    except HTTPException:
        raise
    except httpx.RequestError:
        raise HTTPException(status_code=503, detail="FX rate service unavailable")


# ── Shipment cost line endpoints ──────────────────────────────────

@router.get("/purchases/{batch_id}/cost-lines")
def list_shipment_cost_lines(
    batch_id:   int,
    db:         Session = Depends(get_db),
    company_id: int     = Depends(get_company_id),
):
    batch = db.query(LandedCostBatch).filter(
        LandedCostBatch.id == batch_id,
        LandedCostBatch.company_id == company_id,
    ).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Purchase not found")
    lines = db.query(ShipmentCostLine).filter(
        ShipmentCostLine.purchase_batch_id == batch_id
    ).order_by(ShipmentCostLine.sort_order).all()
    return [_fmt_cost_line(cl) for cl in lines]


@router.post("/purchases/{batch_id}/cost-lines", status_code=201)
def add_shipment_cost_line(
    batch_id:   int,
    body:       CostLineIn,
    db:         Session = Depends(get_db),
    company_id: int     = Depends(get_company_id),
):
    batch = db.query(LandedCostBatch).filter(
        LandedCostBatch.id == batch_id,
        LandedCostBatch.company_id == company_id,
    ).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Purchase not found")
    cl = ShipmentCostLine(
        purchase_batch_id = batch_id,
        sku_id            = body.sku_id,
        description       = body.description,
        amount            = body.amount,
        currency          = body.currency,
        fx_rate_to_usd    = body.fx_rate_to_usd,
        sort_order        = body.sort_order,
    )
    db.add(cl)
    db.commit()
    db.refresh(cl)
    return _fmt_cost_line(cl)


@router.put("/purchases/{batch_id}/cost-lines/{line_id}")
def update_shipment_cost_line(
    batch_id:   int,
    line_id:    int,
    body:       CostLineIn,
    db:         Session = Depends(get_db),
    company_id: int     = Depends(get_company_id),
):
    cl = db.query(ShipmentCostLine).filter(
        ShipmentCostLine.id == line_id,
        ShipmentCostLine.purchase_batch_id == batch_id,
    ).first()
    if not cl:
        raise HTTPException(status_code=404, detail="Cost line not found")
    cl.description    = body.description
    cl.amount         = body.amount
    cl.currency       = body.currency
    cl.fx_rate_to_usd = body.fx_rate_to_usd
    cl.sort_order     = body.sort_order
    cl.sku_id         = body.sku_id
    db.commit()
    db.refresh(cl)
    return _fmt_cost_line(cl)


@router.delete("/purchases/{batch_id}/cost-lines/{line_id}", status_code=204)
def delete_shipment_cost_line(
    batch_id:   int,
    line_id:    int,
    db:         Session = Depends(get_db),
    company_id: int     = Depends(get_company_id),
):
    cl = db.query(ShipmentCostLine).filter(
        ShipmentCostLine.id == line_id,
        ShipmentCostLine.purchase_batch_id == batch_id,
    ).first()
    if not cl:
        raise HTTPException(status_code=404, detail="Cost line not found")
    db.delete(cl)
    db.commit()
    return None


# ── Run cost line endpoints ───────────────────────────────────────

@router.get("/runs/{run_id}/cost-lines")
def list_run_cost_lines(
    run_id:     int,
    db:         Session = Depends(get_db),
    company_id: int     = Depends(get_company_id),
):
    run = db.query(PackingRun).filter(
        PackingRun.id == run_id,
        PackingRun.company_id == company_id,
    ).first()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    lines = db.query(RunCostLine).filter(
        RunCostLine.run_id == run_id
    ).order_by(RunCostLine.sort_order).all()
    return [_fmt_cost_line(cl) for cl in lines]


@router.post("/runs/{run_id}/cost-lines", status_code=201)
def save_run_cost_lines(
    run_id:     int,
    body:       List[CostLineIn],
    db:         Session = Depends(get_db),
    company_id: int     = Depends(get_company_id),
):
    """Replace all run cost lines (send the full list)."""
    run = db.query(PackingRun).filter(
        PackingRun.id == run_id,
        PackingRun.company_id == company_id,
    ).first()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    _save_run_cost_lines(db, run_id, body)
    db.commit()
    lines = db.query(RunCostLine).filter(RunCostLine.run_id == run_id).order_by(RunCostLine.sort_order).all()
    return [_fmt_cost_line(cl) for cl in lines]


# ── BOM endpoints ────────────────────────────────────────────────

@router.get("/bom")
def list_bom(
    db:         Session = Depends(get_db),
    company_id: int     = Depends(get_company_id),
):
    boms = (
        db.query(BillOfMaterial)
        .filter(BillOfMaterial.company_id == company_id)
        .order_by(BillOfMaterial.id.desc())
        .all()
    )
    return [
        {
            "id":                b.id,
            "output_sku_id":     b.output_sku_id,
            "output_sku_name":   _sku_name(db, b.output_sku_id),
            "output_sku_code":   _sku_code(db, b.output_sku_id),
            "input_sku_id":      b.input_sku_id,
            "input_sku_name":    _sku_name(db, b.input_sku_id),
            "input_sku_code":    _sku_code(db, b.input_sku_id),
            "qty_per_unit":      b.qty_per_unit,
            "unit":              b.unit,
            "waste_pct_allowed": b.waste_pct_allowed,
            "notes":             b.notes,
            "created_at":        b.created_at.isoformat() if b.created_at else None,
        }
        for b in boms
    ]


@router.post("/bom", status_code=201)
def create_bom(
    body:       BOMIn,
    db:         Session = Depends(get_db),
    company_id: int     = Depends(get_company_id),
):
    # Validate SKUs exist
    for sku_id in [body.output_sku_id, body.input_sku_id]:
        if not db.query(SKU).filter(SKU.id == sku_id).first():
            raise HTTPException(status_code=404, detail=f"SKU {sku_id} not found")

    # Prevent duplicate BOM for the same (output, input) pair
    existing = db.query(BillOfMaterial).filter(
        BillOfMaterial.company_id     == company_id,
        BillOfMaterial.output_sku_id  == body.output_sku_id,
        BillOfMaterial.input_sku_id   == body.input_sku_id,
    ).first()
    if existing:
        raise HTTPException(
            status_code=409,
            detail="A BOM link between these two SKUs already exists. Edit the existing one instead.",
        )

    bom = BillOfMaterial(
        company_id        = company_id,
        output_sku_id     = body.output_sku_id,
        input_sku_id      = body.input_sku_id,
        qty_per_unit      = body.qty_per_unit,
        unit              = body.unit,
        waste_pct_allowed = body.waste_pct_allowed,
        notes             = body.notes,
    )
    db.add(bom)

    # Auto-flag the input SKU as a bulk material so it surfaces in Stock Received
    input_sku = db.query(SKU).filter(SKU.id == body.input_sku_id, SKU.company_id == company_id).first()
    if input_sku and not input_sku.is_bulk_material:
        input_sku.is_bulk_material = True

    db.commit()
    db.refresh(bom)
    return {
        "id":                bom.id,
        "output_sku_id":     bom.output_sku_id,
        "output_sku_name":   _sku_name(db, bom.output_sku_id),
        "input_sku_id":      bom.input_sku_id,
        "input_sku_name":    _sku_name(db, bom.input_sku_id),
        "qty_per_unit":      bom.qty_per_unit,
        "unit":              bom.unit,
        "waste_pct_allowed": bom.waste_pct_allowed,
        "notes":             bom.notes,
    }


@router.put("/bom/{bom_id}")
def update_bom(
    bom_id:     int,
    body:       BOMIn,
    db:         Session = Depends(get_db),
    company_id: int     = Depends(get_company_id),
):
    bom = db.query(BillOfMaterial).filter(
        BillOfMaterial.id == bom_id,
        BillOfMaterial.company_id == company_id,
    ).first()
    if not bom:
        raise HTTPException(status_code=404, detail="BOM not found")

    for sku_id in [body.output_sku_id, body.input_sku_id]:
        if not db.query(SKU).filter(SKU.id == sku_id).first():
            raise HTTPException(status_code=404, detail=f"SKU {sku_id} not found")

    bom.output_sku_id     = body.output_sku_id
    bom.input_sku_id      = body.input_sku_id
    bom.qty_per_unit      = body.qty_per_unit
    bom.unit              = body.unit
    bom.waste_pct_allowed = body.waste_pct_allowed
    bom.notes             = body.notes

    # Auto-flag the input SKU as a bulk material so it surfaces in Stock Received
    input_sku = db.query(SKU).filter(SKU.id == body.input_sku_id, SKU.company_id == company_id).first()
    if input_sku and not input_sku.is_bulk_material:
        input_sku.is_bulk_material = True

    db.commit()
    db.refresh(bom)
    return {
        "id":                bom.id,
        "output_sku_id":     bom.output_sku_id,
        "output_sku_name":   _sku_name(db, bom.output_sku_id),
        "output_sku_code":   _sku_code(db, bom.output_sku_id),
        "input_sku_id":      bom.input_sku_id,
        "input_sku_name":    _sku_name(db, bom.input_sku_id),
        "input_sku_code":    _sku_code(db, bom.input_sku_id),
        "qty_per_unit":      bom.qty_per_unit,
        "unit":              bom.unit,
        "waste_pct_allowed": bom.waste_pct_allowed,
        "notes":             bom.notes,
    }


@router.delete("/bom/{bom_id}", status_code=204)
def delete_bom(
    bom_id:     int,
    db:         Session = Depends(get_db),
    company_id: int     = Depends(get_company_id),
):
    bom = db.query(BillOfMaterial).filter(
        BillOfMaterial.id == bom_id,
        BillOfMaterial.company_id == company_id,
    ).first()
    if not bom:
        raise HTTPException(status_code=404, detail="BOM not found")
    db.delete(bom)
    db.commit()
    return None


# ── Packing Run endpoints ────────────────────────────────────────

@router.get("/runs")
def list_runs(
    db:         Session = Depends(get_db),
    company_id: int     = Depends(get_company_id),
):
    runs = (
        db.query(PackingRun)
        .filter(PackingRun.company_id == company_id)
        .order_by(PackingRun.created_at.desc())
        .limit(200)
        .all()
    )
    result = []
    for run in runs:
        # Get ALL bulk entries for summary display (not just the first)
        bulks = db.query(PackingRunBulk).filter(PackingRunBulk.run_id == run.id).all()
        bulk_sku_names = [_sku_name(db, b.bulk_sku_id) for b in bulks]
        result.append({
            "id":                run.id,
            "run_ref":           run.run_ref,
            "status":            run.status,
            "started_by":        run.started_by,
            "notes":             run.notes,
            "created_at":        run.created_at.isoformat() if run.created_at else None,
            "closed_at":         run.closed_at.isoformat() if run.closed_at else None,
            "theoretical_kg":    run.theoretical_kg,
            "actual_kg":         run.actual_kg,
            "variance_kg":       run.variance_kg,
            "variance_pct":      run.variance_pct,
            "flag_high_variance": run.flag_high_variance,
            # Legacy single-name field (keep for backward-compat) + new multi-name list
            "bulk_sku_name":     bulk_sku_names[0] if bulk_sku_names else None,
            "bulk_sku_names":    bulk_sku_names,
        })
    return result


@router.post("/runs", status_code=201)
def create_run(
    body:       RunIn,
    db:         Session = Depends(get_db),
    company_id: int     = Depends(get_company_id),
):
    # Validate bulk SKU
    bulk_sku = db.query(SKU).filter(SKU.id == body.bulk_sku_id).first()
    if not bulk_sku:
        raise HTTPException(status_code=404, detail="Bulk SKU not found")

    # ── Pre-run stock guard ──────────────────────────────────────
    # Warn if qty_start (kg requested) exceeds available bulk inventory.
    # We don't block, just return a warning in the response.
    # Calculate available stock in kg from inventory rows.
    if body.qty_start and body.qty_start > 0:
        bulk_unit_kg = _weight_to_kg(bulk_sku.unit_weight, bulk_sku.unit_weight_uom) or 1.0
        total_cases  = db.query(
            sqlfunc.sum(Inventory.cases_on_hand)
        ).filter(
            Inventory.sku_id     == body.bulk_sku_id,
            Inventory.company_id == company_id,
        ).scalar() or 0
        available_kg = total_cases * bulk_unit_kg
        _stock_warning = (
            f"qty_start ({body.qty_start} kg) exceeds available stock ({available_kg:.1f} kg). "
            f"Check Inventory before starting this run."
            if body.qty_start > available_kg else None
        )
    else:
        _stock_warning = None
    # ─────────────────────────────────────────────────────────────

    # Validate the linked landed cost if provided
    if body.landed_cost_id is not None:
        if not db.query(LandedCost).filter(
            LandedCost.id == body.landed_cost_id,
            LandedCost.company_id == company_id,
        ).first():
            raise HTTPException(status_code=404, detail="Landed cost not found")

    run = PackingRun(
        company_id     = company_id,
        run_ref        = body.run_ref,
        status         = "open",
        started_by     = body.started_by,
        notes          = body.notes,
        landed_cost_id = body.landed_cost_id,
        units_planned  = body.units_planned,
    )
    db.add(run)
    db.flush()

    bulk_entry = PackingRunBulk(
        run_id      = run.id,
        bulk_sku_id = body.bulk_sku_id,
        qty_start   = body.qty_start,
    )
    db.add(bulk_entry)
    db.commit()
    db.refresh(run)
    result = _fmt_run(run, db)
    if _stock_warning:
        result["stock_warning"] = _stock_warning
    return result


@router.get("/runs/{run_id}")
def get_run(
    run_id:     int,
    db:         Session = Depends(get_db),
    company_id: int     = Depends(get_company_id),
):
    run = db.query(PackingRun).filter(
        PackingRun.id == run_id,
        PackingRun.company_id == company_id,
    ).first()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    return _fmt_run(run, db)


@router.post("/runs/{run_id}/output", status_code=201)
def add_output(
    run_id:     int,
    body:       OutputIn,
    db:         Session = Depends(get_db),
    company_id: int     = Depends(get_company_id),
):
    run = db.query(PackingRun).filter(
        PackingRun.id == run_id,
        PackingRun.company_id == company_id,
    ).first()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    if run.status == "closed":
        raise HTTPException(status_code=400, detail="Run is already closed")

    # Validate SKU
    if not db.query(SKU).filter(SKU.id == body.sku_id).first():
        raise HTTPException(status_code=404, detail="SKU not found")

    # Upsert by run_id + sku_id
    existing = db.query(PackingRunOutput).filter(
        PackingRunOutput.run_id == run_id,
        PackingRunOutput.sku_id == body.sku_id,
    ).first()

    if existing:
        existing.qty_packed    = body.qty_packed
        existing.units_packed  = body.units_packed
        existing.units_planned = body.units_planned
        db.commit()
        db.refresh(existing)
        out = existing
    else:
        out = PackingRunOutput(
            run_id       = run_id,
            sku_id       = body.sku_id,
            qty_packed   = body.qty_packed,
            units_packed  = body.units_packed,
            units_planned = body.units_planned,
        )
        db.add(out)
        db.commit()
        db.refresh(out)

    shortage = 0
    if (getattr(out, 'units_planned', None) is not None and
        getattr(out, 'units_packed', None) is not None and
        out.units_planned > out.units_packed):
        shortage = out.units_planned - out.units_packed

    return {
        "id":             out.id,
        "run_id":         out.run_id,
        "sku_id":         out.sku_id,
        "product_name":   _sku_name(db, out.sku_id),
        "qty_packed":     out.qty_packed,
        "units_packed":   getattr(out, 'units_packed', None),
        "units_planned":  getattr(out, 'units_planned', None),
        "shortage_units": shortage,
        "theoretical_kg": out.theoretical_kg,
    }


@router.delete("/runs/{run_id}/output/{sku_id}", status_code=204)
def remove_output(
    run_id:     int,
    sku_id:     int,
    db:         Session = Depends(get_db),
    company_id: int     = Depends(get_company_id),
):
    run = db.query(PackingRun).filter(
        PackingRun.id == run_id,
        PackingRun.company_id == company_id,
    ).first()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    if run.status == "closed":
        raise HTTPException(status_code=400, detail="Run is already closed")

    out = db.query(PackingRunOutput).filter(
        PackingRunOutput.run_id == run_id,
        PackingRunOutput.sku_id == sku_id,
    ).first()
    if not out:
        raise HTTPException(status_code=404, detail="Output not found")
    db.delete(out)
    db.commit()
    return None


@router.post("/runs/{run_id}/close")
def close_run(
    run_id:     int,
    body:       CloseIn,
    db:         Session = Depends(get_db),
    company_id: int     = Depends(get_company_id),
):
    run = db.query(PackingRun).filter(
        PackingRun.id == run_id,
        PackingRun.company_id == company_id,
    ).first()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    if run.status == "closed":
        raise HTTPException(status_code=400, detail="Run is already closed")

    # Build a lookup for the qty_end values provided
    qty_end_by_sku: dict = {
        int(entry["bulk_sku_id"]): float(entry["qty_end"])
        for entry in body.bulk_entries
        if "bulk_sku_id" in entry and "qty_end" in entry
    }

    outputs = db.query(PackingRunOutput).filter(PackingRunOutput.run_id == run_id).all()
    bulk_entries = db.query(PackingRunBulk).filter(PackingRunBulk.run_id == run_id).all()

    # Step 1: compute theoretical_kg for each output via BOM
    # Also build per-input-SKU theoretical to correctly attribute variance to each bulk entry
    total_theoretical = 0.0
    max_waste_pct = 0.0
    theoretical_by_input_sku: dict = {}   # input_sku_id → total theoretical kg consumed
    for out in outputs:
        bom = db.query(BillOfMaterial).filter(
            BillOfMaterial.company_id == company_id,
            BillOfMaterial.output_sku_id == out.sku_id,
        ).first()
        if bom:
            out.theoretical_kg = out.qty_packed * bom.qty_per_unit
            total_theoretical += out.theoretical_kg
            if bom.waste_pct_allowed > max_waste_pct:
                max_waste_pct = bom.waste_pct_allowed
            theoretical_by_input_sku[bom.input_sku_id] = (
                theoretical_by_input_sku.get(bom.input_sku_id, 0.0) + out.theoretical_kg
            )
        else:
            # No BOM found — use 0 contribution, log a note
            out.theoretical_kg = 0.0

    # Step 2: update bulk entries with actual usage
    # For multi-bulk runs, each bulk entry gets its own theoretical based on its BOM input SKU
    total_actual = 0.0
    for b in bulk_entries:
        qty_end = qty_end_by_sku.get(b.bulk_sku_id)
        if qty_end is not None:
            b.qty_end = qty_end
            b.actual_used = b.qty_start - qty_end
        else:
            # If not provided, keep existing or default to 0
            b.actual_used = b.qty_start - (b.qty_end or 0.0)

        # Attribute theoretical to this bulk entry by matching its SKU to BOM input_sku_id
        # Fall back to evenly-split share if no BOM maps directly to this bulk SKU
        b.theoretical = theoretical_by_input_sku.get(
            b.bulk_sku_id,
            total_theoretical / len(bulk_entries) if bulk_entries else 0.0,
        )
        b.variance = (b.actual_used or 0.0) - b.theoretical if b.theoretical is not None else None
        if b.theoretical and b.theoretical > 0:
            b.variance_pct = ((b.actual_used or 0.0) - b.theoretical) / b.theoretical * 100
        else:
            b.variance_pct = None

        total_actual += (b.actual_used or 0.0)

    # Step 3: roll up to run-level summary
    run.theoretical_kg = total_theoretical
    run.actual_kg      = total_actual
    if total_theoretical > 0:
        run.variance_kg  = total_actual - total_theoretical
        run.variance_pct = (total_actual - total_theoretical) / total_theoretical * 100
        run.flag_high_variance = abs(run.variance_pct) > max_waste_pct
    else:
        run.variance_kg  = total_actual
        run.variance_pct = None
        run.flag_high_variance = False

    run.status    = "closed"
    run.closed_at = datetime.utcnow()

    # ── Step 4: Apply inventory movements ──────────────────────────
    # Deduct actual bulk kg consumed from each bulk SKU's inventory
    for b in bulk_entries:
        kg_used = b.actual_used or 0.0
        if kg_used > 0:
            _deduct_bulk_inventory(b.bulk_sku_id, kg_used, company_id, db)

    # Increment retail output SKU inventory (WH1) by cases produced
    for o in outputs:
        cases_produced = int(round(o.qty_packed or 0))
        if cases_produced > 0:
            _add_retail_inventory(o.sku_id, cases_produced, company_id, db)
    # ───────────────────────────────────────────────────────────────

    db.commit()
    db.refresh(run)
    return _fmt_run(run, db)


@router.post("/runs/{run_id}/reopen")
def reopen_run(
    run_id:     int,
    db:         Session = Depends(get_db),
    company_id: int     = Depends(get_company_id),
):
    """Re-open a closed packing run so additional outputs or bulk adjustments can be made."""
    run = db.query(PackingRun).filter(
        PackingRun.id == run_id,
        PackingRun.company_id == company_id,
    ).first()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    if run.status == "open":
        raise HTTPException(status_code=400, detail="Run is already open")

    # Clear closure stats — they'll be recalculated on next close
    run.status             = "open"
    run.closed_at          = None
    run.theoretical_kg     = None
    run.actual_kg          = None
    run.variance_kg        = None
    run.variance_pct       = None
    run.flag_high_variance = False

    # ── Reverse inventory movements from the previous close ──────────
    # We need to add back the bulk kg that was deducted, and remove
    # the retail cases that were added, so the numbers are clean for re-close.
    bulk_entries = db.query(PackingRunBulk).filter(PackingRunBulk.run_id == run_id).all()
    outputs      = db.query(PackingRunOutput).filter(PackingRunOutput.run_id == run_id).all()

    for b in bulk_entries:
        kg_to_restore = b.actual_used or 0.0
        if kg_to_restore > 0:
            # Reverse: add back the kg as whole sacks into WH1
            bulk_sku = db.query(SKU).filter(SKU.id == b.bulk_sku_id).first()
            if bulk_sku:
                bulk_unit_kg = _weight_to_kg(bulk_sku.unit_weight, bulk_sku.unit_weight_uom) or 1.0
                sacks_to_restore = int(round(kg_to_restore / bulk_unit_kg))
                if sacks_to_restore > 0:
                    inv = db.query(Inventory).filter(
                        Inventory.sku_id     == b.bulk_sku_id,
                        Inventory.warehouse  == "WH1",
                        Inventory.company_id == company_id,
                    ).first()
                    if inv:
                        inv.cases_on_hand  = (inv.cases_on_hand or 0) + sacks_to_restore
                        inv.updated_at     = datetime.utcnow()
                        # Subtract restored kg from the accumulator
                        inv.bulk_kg_consumed = max(
                            0.0,
                            (inv.bulk_kg_consumed or 0.0) - kg_to_restore
                        )

    for o in outputs:
        cases_to_remove = int(round(o.qty_packed or 0))
        if cases_to_remove > 0:
            inv = db.query(Inventory).filter(
                Inventory.sku_id     == o.sku_id,
                Inventory.warehouse  == "WH1",
                Inventory.company_id == company_id,
                Inventory.stock_type == "unrestricted",
            ).first()
            if inv:
                inv.cases_on_hand = max(0, (inv.cases_on_hand or 0) - cases_to_remove)
                inv.updated_at    = datetime.utcnow()
    # ─────────────────────────────────────────────────────────────────

    # Clear per-bulk-entry variance stats too
    for b in bulk_entries:
        b.qty_end      = None
        b.actual_used  = None
        b.theoretical  = None
        b.variance     = None
        b.variance_pct = None

    # Clear per-output theoretical_kg
    for o in outputs:
        o.theoretical_kg = None

    db.commit()
    db.refresh(run)
    return _fmt_run(run, db)


@router.delete("/runs/{run_id}", status_code=204)
def delete_run(
    run_id:     int,
    db:         Session = Depends(get_db),
    company_id: int     = Depends(get_company_id),
):
    """
    Delete a packing run and all its child records (outputs, bulk entries, cost lines).
    Closed runs cannot be deleted — reopen first if correction is needed.
    """
    run = db.query(PackingRun).filter(
        PackingRun.id == run_id,
        PackingRun.company_id == company_id,
    ).first()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    if run.status == "closed":
        raise HTTPException(
            status_code=400,
            detail="Cannot delete a closed run. Reopen it first if you need to remove it.",
        )

    # Delete child records first
    db.query(PackingRunOutput).filter(PackingRunOutput.run_id == run_id).delete()
    db.query(PackingRunBulk).filter(PackingRunBulk.run_id == run_id).delete()
    try:
        from models import RunCostLine
        db.query(RunCostLine).filter(RunCostLine.run_id == run_id).delete()
    except Exception:
        pass
    try:
        db.query(PackingRunCost).filter(PackingRunCost.run_id == run_id).delete()
    except Exception:
        pass

    db.delete(run)
    db.commit()
    return None


# ── Summary endpoint ─────────────────────────────────────────────

@router.get("/summary")
def get_summary(
    db:         Session = Depends(get_db),
    company_id: int     = Depends(get_company_id),
    from_date:  Optional[date] = Query(None, description="Filter runs closed on or after this date"),
    to_date:    Optional[date] = Query(None, description="Filter runs closed on or before this date"),
):
    q = db.query(PackingRun).filter(PackingRun.company_id == company_id)
    # Date filter applies to created_at so open runs are also counted correctly
    if from_date:
        q = q.filter(PackingRun.created_at >= datetime.combine(from_date, datetime.min.time()))
    if to_date:
        from datetime import timedelta
        q = q.filter(PackingRun.created_at < datetime.combine(to_date + timedelta(days=1), datetime.min.time()))
    all_runs = q.all()
    closed_runs = [r for r in all_runs if r.status == "closed"]
    flagged_runs = [r for r in closed_runs if r.flag_high_variance]

    total_variance_kg = sum(r.variance_kg or 0.0 for r in closed_runs)
    avg_variance_pct = (
        sum(r.variance_pct for r in closed_runs if r.variance_pct is not None)
        / len([r for r in closed_runs if r.variance_pct is not None])
        if any(r.variance_pct is not None for r in closed_runs)
        else 0.0
    )

    # Breakdown by bulk SKU
    sku_breakdown: dict = {}
    for run in closed_runs:
        bulk_entries = db.query(PackingRunBulk).filter(PackingRunBulk.run_id == run.id).all()
        for b in bulk_entries:
            key = b.bulk_sku_id
            if key not in sku_breakdown:
                sku_breakdown[key] = {
                    "bulk_sku_id":   key,
                    "sku_name":      _sku_name(db, key),
                    "sku_code":      _sku_code(db, key),
                    "runs_count":    0,
                    "total_actual":  0.0,
                    "total_theoretical": 0.0,
                    "total_variance":    0.0,
                }
            sku_breakdown[key]["runs_count"]         += 1
            sku_breakdown[key]["total_actual"]        += (b.actual_used or 0.0)
            sku_breakdown[key]["total_theoretical"]   += (b.theoretical or 0.0)
            sku_breakdown[key]["total_variance"]      += (b.variance or 0.0)

    # Pre-fetch all bulk entries for closed runs in one query (avoids N+1)
    closed_run_ids = [r.id for r in closed_runs]
    all_bulk_entries = (
        db.query(PackingRunBulk)
        .filter(PackingRunBulk.run_id.in_(closed_run_ids))
        .all()
    ) if closed_run_ids else []
    bulk_names_by_run: dict = {}
    for b in all_bulk_entries:
        bulk_names_by_run.setdefault(b.run_id, []).append(_sku_name(db, b.bulk_sku_id))

    # Sorted closed runs by worst variance first
    worst_runs = sorted(
        [
            {
                "id":            r.id,
                "run_ref":       r.run_ref,
                "closed_at":     r.closed_at.isoformat() if r.closed_at else None,
                "theoretical_kg": r.theoretical_kg,
                "actual_kg":     r.actual_kg,
                "variance_kg":   r.variance_kg,
                "variance_pct":  r.variance_pct,
                "flag_high_variance": r.flag_high_variance,
                "bulk_sku_names": bulk_names_by_run.get(r.id, []),
            }
            for r in closed_runs
        ],
        key=lambda x: abs(x["variance_pct"] or 0.0),
        reverse=True,
    )

    return {
        "total_runs":       len(all_runs),
        "closed_runs":      len(closed_runs),
        "open_runs":        len(all_runs) - len(closed_runs),
        "flagged_runs":     len(flagged_runs),
        "total_variance_kg": round(total_variance_kg, 3),
        "avg_variance_pct":  round(avg_variance_pct, 2),
        "sku_breakdown":     list(sku_breakdown.values()),
        "worst_runs":        worst_runs,
    }


# ── Purchase batch helpers ───────────────────────────────────────

def _allocate_and_save_lines(
    db: Session,
    batch: LandedCostBatch,
    lines: List[PurchaseLineIn],
    company_id: int,
):
    """
    Upsert LandedCost rows for the batch lines:
    - Match existing records by bulk_sku_id to preserve IDs (so packing run
      landed_cost_id FKs remain valid after an edit).
    - Delete any LandedCost rows whose SKU is no longer in the new lines, and
      nullify the landed_cost_id on any PackingRun that pointed to them.
    - Create new rows for SKUs that are newly added.
    Returns the list of saved LandedCost objects.
    """
    from models import PackingRun  # avoid circular import at module level
    total_kg = sum(l.qty_kg for l in lines) or 1.0
    new_sku_ids = {l.bulk_sku_id for l in lines}

    # Fetch existing LandedCost rows for this batch keyed by bulk_sku_id
    existing: dict = {
        lc.bulk_sku_id: lc
        for lc in db.query(LandedCost).filter(LandedCost.purchase_batch_id == batch.id).all()
    }

    # Remove records whose SKU is no longer in the new lines; nullify run FKs
    for sku_id, lc in list(existing.items()):
        if sku_id not in new_sku_ids:
            # Nullify any packing runs that were linked to this specific LandedCost
            db.query(PackingRun).filter(PackingRun.landed_cost_id == lc.id).update(
                {"landed_cost_id": None}, synchronize_session=False
            )
            db.delete(lc)

    results = []
    for line in lines:
        weight_share = line.qty_kg / total_kg
        alloc_freight  = round(batch.shared_freight  * weight_share, 4)
        alloc_duty     = round(batch.shared_duty     * weight_share, 4)
        alloc_overhead = round(batch.shared_overhead * weight_share, 4)
        alloc_other    = round(batch.shared_other    * weight_share, 4)

        per_sku_costs = {
            "cost_material":      line.cost_material,
            "cost_freight":       alloc_freight,
            "cost_duty":          alloc_duty,
            "cost_packaging_mat": line.cost_packaging_mat,
            "cost_labor":         line.cost_labor,
            "cost_overhead":      alloc_overhead,
            "cost_other":         alloc_other,
        }
        totals = _compute_landed_totals({**per_sku_costs, "qty_kg": line.qty_kg})

        if line.bulk_sku_id in existing:
            # Update in-place — preserves the ID
            lc = existing[line.bulk_sku_id]
            lc.qty_kg        = line.qty_kg
            lc.batch_ref     = batch.batch_ref
            lc.currency      = batch.currency
            lc.exchange_rate = batch.exchange_rate
        else:
            lc = LandedCost(
                company_id        = company_id,
                purchase_batch_id = batch.id,
                bulk_sku_id       = line.bulk_sku_id,
                qty_kg            = line.qty_kg,
                batch_ref         = batch.batch_ref,
                currency          = batch.currency,
                exchange_rate     = batch.exchange_rate,
            )
            db.add(lc)

        for field, val in per_sku_costs.items():
            setattr(lc, field, val)
        lc.total_cost  = totals["total_cost"]
        lc.cost_per_kg = totals["cost_per_kg"]
        results.append(lc)

    return results


def _fmt_cost_line(cl) -> dict:
    usd_eq = round((cl.amount or 0.0) * (cl.fx_rate_to_usd or 1.0), 4)
    return {
        "id":             cl.id,
        "description":    cl.description,
        "amount":         cl.amount,
        "currency":       cl.currency,
        "fx_rate_to_usd": cl.fx_rate_to_usd,
        "usd_equivalent": usd_eq,
        "sort_order":     cl.sort_order,
        "sku_id":         getattr(cl, 'sku_id', None),
    }

def _fmt_batch(batch: LandedCostBatch, db: Session) -> dict:
    items = db.query(LandedCost).filter(LandedCost.purchase_batch_id == batch.id).all()
    cost_lines = db.query(ShipmentCostLine).filter(ShipmentCostLine.purchase_batch_id == batch.id).order_by(ShipmentCostLine.sort_order).all()
    total_kg   = sum(i.qty_kg or 0   for i in items)
    total_cost = sum(i.total_cost or 0 for i in items)
    # Also compute total from new cost lines for display
    total_cost_lines_usd = sum((cl.amount or 0.0) * (cl.fx_rate_to_usd or 1.0) for cl in cost_lines)
    return {
        "id":               batch.id,
        "batch_ref":        batch.batch_ref,
        "supplier":         batch.supplier,
        "supplier_country": getattr(batch, 'supplier_country', None),
        "currency":         batch.currency,
        "purchase_date":    batch.purchase_date.isoformat() if getattr(batch, "purchase_date", None) else None,
        "exchange_rate":    getattr(batch, "exchange_rate", 1.0) or 1.0,
        "shared_freight":   batch.shared_freight,
        "shared_duty":      batch.shared_duty,
        "shared_overhead":  batch.shared_overhead,
        "shared_other":     batch.shared_other,
        "notes":            batch.notes,
        "created_at":       batch.created_at.isoformat() if batch.created_at else None,
        "total_kg":         round(total_kg, 3),
        "total_cost":       round(total_cost, 4),
        "total_cost_lines_usd": round(total_cost_lines_usd, 4),
        "cost_lines":       [_fmt_cost_line(cl) for cl in cost_lines],
        "items":            [_fmt_landed(i, db) for i in items],
    }


# ── Landed Cost helpers ───────────────────────────────────────────

def _compute_landed_totals(body_dict: dict) -> dict:
    """Given the cost fields, compute total_cost and cost_per_kg."""
    cost_fields = [
        "cost_material", "cost_freight", "cost_duty",
        "cost_packaging_mat", "cost_labor", "cost_overhead", "cost_other",
    ]
    total = sum(body_dict.get(f, 0.0) or 0.0 for f in cost_fields)
    qty_kg = body_dict.get("qty_kg", 0.0) or 0.0
    cpk = (total / qty_kg) if qty_kg > 0 else None
    return {"total_cost": round(total, 4), "cost_per_kg": round(cpk, 6) if cpk is not None else None}

def _fmt_landed(lc: LandedCost, db: Session) -> dict:
    return {
        "id":                lc.id,
        "company_id":        lc.company_id,
        "bulk_sku_id":       lc.bulk_sku_id,
        "bulk_sku_name":     _sku_name(db, lc.bulk_sku_id),
        "bulk_sku_code":     _sku_code(db, lc.bulk_sku_id),
        "batch_ref":         lc.batch_ref,
        "qty_kg":            lc.qty_kg,
        "cost_material":     lc.cost_material,
        "cost_freight":      lc.cost_freight,
        "cost_duty":         lc.cost_duty,
        "cost_packaging_mat": lc.cost_packaging_mat,
        "cost_labor":        lc.cost_labor,
        "cost_overhead":     lc.cost_overhead,
        "cost_other":        lc.cost_other,
        "total_cost":        lc.total_cost,
        "cost_per_kg":       lc.cost_per_kg,
        "exchange_rate":     getattr(lc, "exchange_rate", 1.0) or 1.0,
        # cost_per_kg_base: cost per kg converted to base/reporting currency
        "cost_per_kg_base":  round((lc.cost_per_kg or 0) * (getattr(lc, "exchange_rate", 1.0) or 1.0), 6),
        "currency":          lc.currency,
        "notes":             lc.notes,
        "created_at":        lc.created_at.isoformat() if lc.created_at else None,
    }


# ── Landed Cost endpoints ────────────────────────────────────────

@router.get("/landed-costs")
def list_landed_costs(
    db:         Session = Depends(get_db),
    company_id: int     = Depends(get_company_id),
):
    records = (
        db.query(LandedCost)
        .filter(LandedCost.company_id == company_id)
        .order_by(LandedCost.created_at.desc())
        .all()
    )
    return [_fmt_landed(lc, db) for lc in records]


@router.post("/landed-costs", status_code=201)
def create_landed_cost(
    body:       LandedCostIn,
    db:         Session = Depends(get_db),
    company_id: int     = Depends(get_company_id),
):
    if not db.query(SKU).filter(SKU.id == body.bulk_sku_id).first():
        raise HTTPException(status_code=404, detail="Bulk SKU not found")

    totals = _compute_landed_totals(body.dict())
    lc = LandedCost(
        company_id        = company_id,
        bulk_sku_id       = body.bulk_sku_id,
        batch_ref         = body.batch_ref,
        qty_kg            = body.qty_kg,
        cost_material     = body.cost_material,
        cost_freight      = body.cost_freight,
        cost_duty         = body.cost_duty,
        cost_packaging_mat = body.cost_packaging_mat,
        cost_labor        = body.cost_labor,
        cost_overhead     = body.cost_overhead,
        cost_other        = body.cost_other,
        total_cost        = totals["total_cost"],
        cost_per_kg       = totals["cost_per_kg"],
        currency          = body.currency,
        notes             = body.notes,
    )
    db.add(lc)
    db.commit()
    db.refresh(lc)
    return _fmt_landed(lc, db)


@router.put("/landed-costs/{lc_id}")
def update_landed_cost(
    lc_id:      int,
    body:       LandedCostIn,
    db:         Session = Depends(get_db),
    company_id: int     = Depends(get_company_id),
):
    lc = db.query(LandedCost).filter(
        LandedCost.id == lc_id,
        LandedCost.company_id == company_id,
    ).first()
    if not lc:
        raise HTTPException(status_code=404, detail="Landed cost not found")

    if not db.query(SKU).filter(SKU.id == body.bulk_sku_id).first():
        raise HTTPException(status_code=404, detail="Bulk SKU not found")

    totals = _compute_landed_totals(body.dict())
    lc.bulk_sku_id        = body.bulk_sku_id
    lc.batch_ref          = body.batch_ref
    lc.qty_kg             = body.qty_kg
    lc.cost_material      = body.cost_material
    lc.cost_freight       = body.cost_freight
    lc.cost_duty          = body.cost_duty
    lc.cost_packaging_mat = body.cost_packaging_mat
    lc.cost_labor         = body.cost_labor
    lc.cost_overhead      = body.cost_overhead
    lc.cost_other         = body.cost_other
    lc.total_cost         = totals["total_cost"]
    lc.cost_per_kg        = totals["cost_per_kg"]
    lc.currency           = body.currency
    lc.notes              = body.notes
    db.commit()
    db.refresh(lc)
    return _fmt_landed(lc, db)


@router.delete("/landed-costs/{lc_id}", status_code=204)
def delete_landed_cost(
    lc_id:      int,
    db:         Session = Depends(get_db),
    company_id: int     = Depends(get_company_id),
):
    lc = db.query(LandedCost).filter(
        LandedCost.id == lc_id,
        LandedCost.company_id == company_id,
    ).first()
    if not lc:
        raise HTTPException(status_code=404, detail="Landed cost not found")
    db.delete(lc)
    db.commit()
    return None


# ── Purchase Batch endpoints ─────────────────────────────────────

@router.get("/purchases")
def list_purchases(
    db:         Session = Depends(get_db),
    company_id: int     = Depends(get_company_id),
):
    batches = (
        db.query(LandedCostBatch)
        .filter(LandedCostBatch.company_id == company_id)
        .order_by(LandedCostBatch.created_at.desc())
        .all()
    )
    return [_fmt_batch(b, db) for b in batches]


@router.post("/purchases", status_code=201)
def create_purchase(
    body:       PurchaseBatchIn,
    db:         Session = Depends(get_db),
    company_id: int     = Depends(get_company_id),
):
    if not body.lines:
        raise HTTPException(status_code=400, detail="A purchase must have at least one product line.")
    # Validate SKUs and detect duplicates
    seen_skus: set = set()
    for line in body.lines:
        if not db.query(SKU).filter(SKU.id == line.bulk_sku_id).first():
            raise HTTPException(status_code=404, detail=f"SKU {line.bulk_sku_id} not found")
        if line.bulk_sku_id in seen_skus:
            raise HTTPException(status_code=400, detail=f"Duplicate SKU {line.bulk_sku_id} in the same purchase batch.")
        seen_skus.add(line.bulk_sku_id)

    batch = LandedCostBatch(
        company_id       = company_id,
        batch_ref        = body.batch_ref,
        supplier         = body.supplier,
        supplier_country = body.supplier_country,
        currency         = body.currency,
        purchase_date    = body.purchase_date,
        exchange_rate    = body.exchange_rate if body.exchange_rate and body.exchange_rate > 0 else 1.0,
        shared_freight   = body.shared_freight,
        shared_duty      = body.shared_duty,
        shared_overhead  = body.shared_overhead,
        shared_other     = body.shared_other,
        notes            = body.notes,
    )
    db.add(batch)
    db.flush()   # get batch.id

    _allocate_and_save_lines(db, batch, body.lines, company_id)
    # Save new multi-currency cost lines
    _save_shipment_cost_lines(db, batch.id, body.cost_lines)
    db.commit()
    db.refresh(batch)
    return _fmt_batch(batch, db)


@router.get("/purchases/{batch_id}")
def get_purchase(
    batch_id:   int,
    db:         Session = Depends(get_db),
    company_id: int     = Depends(get_company_id),
):
    batch = db.query(LandedCostBatch).filter(
        LandedCostBatch.id == batch_id,
        LandedCostBatch.company_id == company_id,
    ).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Purchase not found")
    return _fmt_batch(batch, db)


@router.put("/purchases/{batch_id}")
def update_purchase(
    batch_id:   int,
    body:       PurchaseBatchIn,
    db:         Session = Depends(get_db),
    company_id: int     = Depends(get_company_id),
):
    batch = db.query(LandedCostBatch).filter(
        LandedCostBatch.id == batch_id,
        LandedCostBatch.company_id == company_id,
    ).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Purchase not found")
    if not body.lines:
        raise HTTPException(status_code=400, detail="A purchase must have at least one product line.")
    # Validate SKUs and detect duplicates
    seen_skus: set = set()
    for line in body.lines:
        if not db.query(SKU).filter(SKU.id == line.bulk_sku_id).first():
            raise HTTPException(status_code=404, detail=f"SKU {line.bulk_sku_id} not found")
        if line.bulk_sku_id in seen_skus:
            raise HTTPException(status_code=400, detail=f"Duplicate SKU {line.bulk_sku_id} in the same purchase batch.")
        seen_skus.add(line.bulk_sku_id)

    # Update header
    batch.batch_ref        = body.batch_ref
    batch.supplier         = body.supplier
    batch.supplier_country = body.supplier_country
    batch.currency         = body.currency
    batch.purchase_date    = body.purchase_date
    batch.exchange_rate    = body.exchange_rate if body.exchange_rate and body.exchange_rate > 0 else 1.0
    batch.shared_freight   = body.shared_freight
    batch.shared_duty      = body.shared_duty
    batch.shared_overhead  = body.shared_overhead
    batch.shared_other     = body.shared_other
    batch.notes            = body.notes

    # Upsert lines in-place (preserves LandedCost IDs → run FK links stay valid)
    _allocate_and_save_lines(db, batch, body.lines, company_id)
    # Replace cost lines
    _save_shipment_cost_lines(db, batch.id, body.cost_lines)
    db.commit()
    db.refresh(batch)
    return _fmt_batch(batch, db)


@router.delete("/purchases/{batch_id}", status_code=204)
def delete_purchase(
    batch_id:   int,
    db:         Session = Depends(get_db),
    company_id: int     = Depends(get_company_id),
):
    batch = db.query(LandedCostBatch).filter(
        LandedCostBatch.id == batch_id,
        LandedCostBatch.company_id == company_id,
    ).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Purchase not found")
    # Delete linked landed-cost lines first
    db.query(LandedCost).filter(LandedCost.purchase_batch_id == batch_id).delete()
    db.delete(batch)
    db.commit()
    return None


@router.get("/purchases/{batch_id}/utilisation")
def get_purchase_utilisation(
    batch_id:   int,
    db:         Session = Depends(get_db),
    company_id: int     = Depends(get_company_id),
):
    """
    For a purchase batch, show all packing runs that explicitly linked to any of its
    LandedCost rows, with cases packed and kg consumed per run.
    This answers: "how many cases did I get from this purchase?"
    """
    batch = db.query(LandedCostBatch).filter(
        LandedCostBatch.id == batch_id,
        LandedCostBatch.company_id == company_id,
    ).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Purchase not found")

    # All LandedCost IDs belonging to this batch
    lc_rows = db.query(LandedCost).filter(LandedCost.purchase_batch_id == batch_id).all()
    lc_ids  = [lc.id for lc in lc_rows]
    lc_by_id = {lc.id: lc for lc in lc_rows}

    runs = []
    total_cases = 0
    total_kg_consumed = 0.0
    # SKU-level aggregation: {sku_id: {name, code, total_cases}}
    sku_totals: dict = {}

    if lc_ids:
        linked_runs = (
            db.query(PackingRun)
            .filter(
                PackingRun.landed_cost_id.in_(lc_ids),
                PackingRun.company_id == company_id,
            )
            .order_by(PackingRun.created_at.desc())
            .all()
        )
        for run in linked_runs:
            outputs     = db.query(PackingRunOutput).filter(PackingRunOutput.run_id == run.id).all()
            bulk_entrs  = db.query(PackingRunBulk).filter(PackingRunBulk.run_id == run.id).all()
            run_cases   = sum(o.qty_packed for o in outputs)
            run_kg      = sum((b.actual_used or 0.0) for b in bulk_entrs)
            total_cases      += run_cases
            total_kg_consumed += run_kg

            linked_lc = lc_by_id.get(run.landed_cost_id)
            output_list = []
            for o in outputs:
                sku_id = o.sku_id
                name   = _sku_name(db, sku_id)
                code   = _sku_code(db, sku_id)
                output_list.append({
                    "sku_id":    sku_id,
                    "sku_name":  name,
                    "sku_code":  code,
                    "qty_packed": o.qty_packed,
                })
                if sku_id not in sku_totals:
                    sku_totals[sku_id] = {"sku_id": sku_id, "sku_name": name, "sku_code": code, "total_cases": 0}
                sku_totals[sku_id]["total_cases"] += o.qty_packed

            runs.append({
                "run_id":            run.id,
                "run_ref":           run.run_ref,
                "status":            run.status,
                "created_at":        run.created_at.isoformat() if run.created_at else None,
                "closed_at":         run.closed_at.isoformat() if run.closed_at else None,
                "total_cases":       run_cases,
                "kg_consumed":       round(run_kg, 3),
                "linked_bulk_sku":   _sku_name(db, linked_lc.bulk_sku_id) if linked_lc else None,
                "outputs":           output_list,
            })

    return {
        "batch_id":           batch_id,
        "batch_ref":          batch.batch_ref,
        "total_runs":         len(runs),
        "total_cases":        total_cases,
        "total_kg_consumed":  round(total_kg_consumed, 3),
        "sku_totals":         list(sku_totals.values()),
        "runs":               runs,
    }


# ── Add Bulk Material to Packing Run ─────────────────────────────

@router.post("/runs/{run_id}/bulk", status_code=201)
def add_bulk_to_run(
    run_id:     int,
    body:       BulkAddIn,
    db:         Session = Depends(get_db),
    company_id: int     = Depends(get_company_id),
):
    """Add an extra bulk SKU entry to an open packing run."""
    run = db.query(PackingRun).filter(
        PackingRun.id == run_id,
        PackingRun.company_id == company_id,
    ).first()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    if run.status == "closed":
        raise HTTPException(status_code=400, detail="Run is already closed")
    if not db.query(SKU).filter(SKU.id == body.bulk_sku_id).first():
        raise HTTPException(status_code=404, detail="Bulk SKU not found")

    # Upsert: if this SKU already exists in this run, update qty_start
    existing = db.query(PackingRunBulk).filter(
        PackingRunBulk.run_id     == run_id,
        PackingRunBulk.bulk_sku_id == body.bulk_sku_id,
    ).first()
    if existing:
        existing.qty_start = body.qty_start
        db.commit()
    else:
        bulk = PackingRunBulk(
            run_id      = run_id,
            bulk_sku_id = body.bulk_sku_id,
            qty_start   = body.qty_start,
        )
        db.add(bulk)
        db.commit()

    return _fmt_run(run, db)


@router.delete("/runs/{run_id}/bulk/{bulk_sku_id}", status_code=204)
def remove_bulk_from_run(
    run_id:      int,
    bulk_sku_id: int,
    db:          Session = Depends(get_db),
    company_id:  int     = Depends(get_company_id),
):
    """Remove a bulk SKU entry from an open packing run."""
    run = db.query(PackingRun).filter(
        PackingRun.id == run_id,
        PackingRun.company_id == company_id,
    ).first()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    if run.status == "closed":
        raise HTTPException(status_code=400, detail="Run is already closed")

    # Must keep at least one bulk entry
    count = db.query(PackingRunBulk).filter(PackingRunBulk.run_id == run_id).count()
    if count <= 1:
        raise HTTPException(status_code=400, detail="Cannot remove the only bulk material entry.")

    bulk = db.query(PackingRunBulk).filter(
        PackingRunBulk.run_id     == run_id,
        PackingRunBulk.bulk_sku_id == bulk_sku_id,
    ).first()
    if not bulk:
        raise HTTPException(status_code=404, detail="Bulk entry not found")
    db.delete(bulk)
    db.commit()
    return None


# ── Packing Run Cost endpoints ───────────────────────────────────

def _fmt_run_cost(rc: PackingRunCost) -> dict:
    return {
        "id":                rc.id,
        "run_id":            rc.run_id,
        "cost_packaging_mat": rc.cost_packaging_mat,
        "cost_labor":        rc.cost_labor,
        "cost_overhead":     rc.cost_overhead,
        "cost_other":        rc.cost_other,
        "labor_hours":       rc.labor_hours,
        "notes":             rc.notes,
        "created_at":        rc.created_at.isoformat() if rc.created_at else None,
        "updated_at":        rc.updated_at.isoformat() if rc.updated_at else None,
    }

def _empty_run_cost(run_id: int) -> dict:
    return {
        "id": None,
        "run_id": run_id,
        "cost_packaging_mat": 0.0,
        "cost_labor": 0.0,
        "cost_overhead": 0.0,
        "cost_other": 0.0,
        "labor_hours": None,
        "notes": None,
        "created_at": None,
        "updated_at": None,
    }


@router.get("/runs/{run_id}/costs")
def get_run_costs(
    run_id:     int,
    db:         Session = Depends(get_db),
    company_id: int     = Depends(get_company_id),
):
    run = db.query(PackingRun).filter(
        PackingRun.id == run_id,
        PackingRun.company_id == company_id,
    ).first()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")

    rc = db.query(PackingRunCost).filter(PackingRunCost.run_id == run_id).first()
    if not rc:
        return _empty_run_cost(run_id)
    return _fmt_run_cost(rc)


@router.post("/runs/{run_id}/costs")
def save_run_costs(
    run_id:     int,
    body:       PackingRunCostIn,
    db:         Session = Depends(get_db),
    company_id: int     = Depends(get_company_id),
):
    run = db.query(PackingRun).filter(
        PackingRun.id == run_id,
        PackingRun.company_id == company_id,
    ).first()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")

    rc = db.query(PackingRunCost).filter(PackingRunCost.run_id == run_id).first()
    if rc:
        rc.cost_packaging_mat = body.cost_packaging_mat
        rc.cost_labor         = body.cost_labor
        rc.cost_overhead      = body.cost_overhead
        rc.cost_other         = body.cost_other
        rc.labor_hours        = body.labor_hours
        rc.notes              = body.notes
        rc.updated_at         = datetime.utcnow()
    else:
        rc = PackingRunCost(
            run_id            = run_id,
            cost_packaging_mat = body.cost_packaging_mat,
            cost_labor        = body.cost_labor,
            cost_overhead     = body.cost_overhead,
            cost_other        = body.cost_other,
            labor_hours       = body.labor_hours,
            notes             = body.notes,
        )
        db.add(rc)
    db.commit()
    db.refresh(rc)
    return _fmt_run_cost(rc)


# ── Cost Summary endpoint ────────────────────────────────────────

@router.get("/runs/{run_id}/cost-summary")
def get_cost_summary(
    run_id:     int,
    db:         Session = Depends(get_db),
    company_id: int     = Depends(get_company_id),
):
    run = db.query(PackingRun).filter(
        PackingRun.id == run_id,
        PackingRun.company_id == company_id,
    ).first()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")

    outputs = db.query(PackingRunOutput).filter(PackingRunOutput.run_id == run_id).all()
    bulk_entries = db.query(PackingRunBulk).filter(PackingRunBulk.run_id == run_id).all()

    # For multi-bulk runs, build a cost_per_kg lookup per input SKU.
    # Strategy:
    #   1. If the run has an explicitly linked landed_cost_id, use that for the primary bulk SKU.
    #   2. For each bulk entry, look for the most-recent LandedCost record for that SKU.
    run_lc_id = getattr(run, 'landed_cost_id', None)

    # Map: bulk_sku_id → cost_per_kg
    cpk_by_bulk_sku: dict = {}
    lc_info_by_bulk_sku: dict = {}  # for display metadata

    def _lc_cpk_base(lc: LandedCost) -> float:
        """Return cost_per_kg converted to base currency using exchange_rate."""
        raw = lc.cost_per_kg or 0.0
        fx  = getattr(lc, "exchange_rate", 1.0) or 1.0
        return raw * fx

    if run_lc_id is not None:
        linked_lc = db.query(LandedCost).filter(
            LandedCost.id == run_lc_id,
            LandedCost.company_id == company_id,
        ).first()
        if linked_lc:
            cpk_by_bulk_sku[linked_lc.bulk_sku_id] = _lc_cpk_base(linked_lc)
            lc_info_by_bulk_sku[linked_lc.bulk_sku_id] = linked_lc

    # Fill in any bulk SKUs not yet covered by the explicit link
    for b in bulk_entries:
        if b.bulk_sku_id not in cpk_by_bulk_sku:
            lc = (
                db.query(LandedCost)
                .filter(
                    LandedCost.company_id == company_id,
                    LandedCost.bulk_sku_id == b.bulk_sku_id,
                )
                .order_by(LandedCost.created_at.desc())
                .first()
            )
            if lc:
                cpk_by_bulk_sku[b.bulk_sku_id] = _lc_cpk_base(lc)
                lc_info_by_bulk_sku[b.bulk_sku_id] = lc
            else:
                cpk_by_bulk_sku[b.bulk_sku_id] = 0.0

    # For backward-compat / single-value display, use first bulk entry's cost_per_kg (base currency)
    first_bulk_sku_id = bulk_entries[0].bulk_sku_id if bulk_entries else None
    cost_per_kg = cpk_by_bulk_sku.get(first_bulk_sku_id, 0.0) if first_bulk_sku_id else 0.0
    first_lc = lc_info_by_bulk_sku.get(first_bulk_sku_id) if first_bulk_sku_id else None

    # Get PackingRunCost (legacy) + new RunCostLine (multi-currency)
    run_cost  = db.query(PackingRunCost).filter(PackingRunCost.run_id == run_id).first()
    run_cost_lines = db.query(RunCostLine).filter(RunCostLine.run_id == run_id).order_by(RunCostLine.sort_order).all()

    # Compute total cases and per-output data
    total_cases = sum(o.qty_packed for o in outputs)
    total_theoretical_kg = 0.0
    per_output = []

    # Packing run costs (legacy buckets)
    packing_pkg   = run_cost.cost_packaging_mat if run_cost else 0.0
    packing_labor = run_cost.cost_labor         if run_cost else 0.0
    packing_oh    = run_cost.cost_overhead      if run_cost else 0.0
    packing_other = run_cost.cost_other         if run_cost else 0.0
    labor_hours   = run_cost.labor_hours        if run_cost else None
    legacy_packing_total = packing_pkg + packing_labor + packing_oh + packing_other
    # New multi-currency run cost lines total (in USD)
    new_cost_lines_usd = sum((cl.amount or 0.0) * (cl.fx_rate_to_usd or 1.0) for cl in run_cost_lines)
    packing_total = legacy_packing_total + new_cost_lines_usd

    packing_cost_per_case = (packing_total / total_cases) if total_cases > 0 else 0.0

    for out in outputs:
        bom = db.query(BillOfMaterial).filter(
            BillOfMaterial.company_id == company_id,
            BillOfMaterial.output_sku_id == out.sku_id,
        ).first()
        bom_qty = bom.qty_per_unit if bom else None
        kg_used = (out.qty_packed * bom_qty) if bom_qty is not None else None
        if kg_used is not None:
            total_theoretical_kg += kg_used

        # Use the cost_per_kg for the BOM's input SKU (multi-bulk aware)
        input_sku_id = bom.input_sku_id if bom else None
        effective_cpk = cpk_by_bulk_sku.get(input_sku_id, cost_per_kg) if input_sku_id else cost_per_kg

        material_per_case = (bom_qty * effective_cpk) if (bom_qty is not None and effective_cpk) else 0.0
        total_per_case    = material_per_case + packing_cost_per_case

        per_output.append({
            "sku_id":           out.sku_id,
            "product_name":     _sku_name(db, out.sku_id),
            "sku_code":         _sku_code(db, out.sku_id),
            "qty_packed":       out.qty_packed,
            "bom_qty_per_unit": bom_qty,
            "kg_used":          round(kg_used, 4) if kg_used is not None else None,
            "material_per_case": round(material_per_case, 4),
            "packing_per_case":  round(packing_cost_per_case, 4),
            "total_per_case":    round(total_per_case, 4),
            "subtotal_material": round(out.qty_packed * material_per_case, 4),
            "subtotal_total":    round(out.qty_packed * total_per_case, 4),
        })

    # Bulk material cost = sum across ALL bulk entries using their own cost_per_kg
    bulk_material_cost = sum(
        (b.actual_used or 0.0) * cpk_by_bulk_sku.get(b.bulk_sku_id, 0.0)
        for b in bulk_entries
    ) if bulk_entries else (total_theoretical_kg * cost_per_kg)
    grand_total_cost   = bulk_material_cost + packing_total
    grand_total_per_case_avg = (grand_total_cost / total_cases) if total_cases > 0 else 0.0

    return {
        "run_id":               run_id,
        "run_ref":              run.run_ref,
        "status":               run.status,
        "bulk_sku_id":          first_bulk_sku_id,
        "bulk_sku_name":        _sku_name(db, first_bulk_sku_id) if first_bulk_sku_id else None,
        "bulk_entries": [
            {
                "bulk_sku_id":    b.bulk_sku_id,
                "bulk_sku_name":  _sku_name(db, b.bulk_sku_id),
                "cost_per_kg":    cpk_by_bulk_sku.get(b.bulk_sku_id, 0.0),
                "actual_used":    b.actual_used,
                "currency":       lc_info_by_bulk_sku[b.bulk_sku_id].currency if b.bulk_sku_id in lc_info_by_bulk_sku else "USD",
                "exchange_rate":  getattr(lc_info_by_bulk_sku.get(b.bulk_sku_id), "exchange_rate", 1.0) or 1.0,
            }
            for b in bulk_entries
        ],
        # Landed cost info (primary / first bulk entry, for backward-compat)
        "landed_cost_id":       first_lc.id if first_lc else None,
        "landed_cost_ref":      first_lc.batch_ref if first_lc else None,
        "landed_cost_currency": first_lc.currency if first_lc else "USD",
        "landed_cost_exchange_rate": (getattr(first_lc, "exchange_rate", 1.0) or 1.0) if first_lc else 1.0,
        "cost_per_kg":          cost_per_kg,  # already in base currency
        "total_theoretical_kg": round(total_theoretical_kg, 4),
        "bulk_material_cost":   round(bulk_material_cost, 4),
        # Packing costs
        "packing_costs": {
            "cost_packaging_mat": packing_pkg,
            "cost_labor":         packing_labor,
            "cost_overhead":      packing_oh,
            "cost_other":         packing_other,
            "labor_hours":        labor_hours,
            "total":              round(packing_total, 4),
            "cost_lines":         [_fmt_cost_line(cl) for cl in run_cost_lines],
            "cost_lines_usd":     round(new_cost_lines_usd, 4),
        },
        "packing_cost_per_case":      round(packing_cost_per_case, 4),
        "total_cases":                total_cases,
        "per_output":                 per_output,
        "grand_total_cost":           round(grand_total_cost, 4),
        "grand_total_per_case_avg":   round(grand_total_per_case_avg, 4),
    }
