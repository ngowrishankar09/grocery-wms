"""
Repacking / Production Tracking Router
=======================================
Tracks bulk-to-retail repacking, calculates waste/variance, and flags
potential theft when variance exceeds BOM-defined tolerance.

Prefix: /repacking  Tags: ["Repacking"]
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, date

import sys, os
sys.path.append(os.path.dirname(os.path.dirname(__file__)))
from database import get_db
from models import BillOfMaterial, PackingRun, PackingRunOutput, PackingRunBulk, SKU, LandedCost, PackingRunCost, LandedCostBatch
from security import get_current_user, get_company_id

router = APIRouter(prefix="/repacking", tags=["Repacking"])


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

class OutputIn(BaseModel):
    sku_id:     int
    qty_packed: float

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

class PurchaseLineIn(BaseModel):
    """One product line inside a multi-SKU purchase."""
    bulk_sku_id:       int
    qty_kg:            float
    cost_material:     float = 0.0   # FOB / per-SKU material cost
    cost_packaging_mat: float = 0.0  # per-SKU packaging
    cost_labor:        float = 0.0   # per-SKU labor

class PurchaseBatchIn(BaseModel):
    """Header for a whole shipment.  Shared costs auto-split by weight across lines."""
    batch_ref:       Optional[str]  = None
    supplier:        Optional[str]  = None
    currency:        str            = "USD"
    shared_freight:  float          = 0.0
    shared_duty:     float          = 0.0
    shared_overhead: float          = 0.0
    shared_other:    float          = 0.0
    notes:           Optional[str]  = None
    lines:           List[PurchaseLineIn]


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
        .limit(50)
        .all()
    )
    result = []
    for run in runs:
        # Get first bulk entry for summary display
        bulk = db.query(PackingRunBulk).filter(PackingRunBulk.run_id == run.id).first()
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
            "bulk_sku_name":     _sku_name(db, bulk.bulk_sku_id) if bulk else None,
        })
    return result


@router.post("/runs", status_code=201)
def create_run(
    body:       RunIn,
    db:         Session = Depends(get_db),
    company_id: int     = Depends(get_company_id),
):
    # Validate bulk SKU
    if not db.query(SKU).filter(SKU.id == body.bulk_sku_id).first():
        raise HTTPException(status_code=404, detail="Bulk SKU not found")

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
    return _fmt_run(run, db)


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
        existing.qty_packed = body.qty_packed
        db.commit()
        db.refresh(existing)
        out = existing
    else:
        out = PackingRunOutput(
            run_id     = run_id,
            sku_id     = body.sku_id,
            qty_packed = body.qty_packed,
        )
        db.add(out)
        db.commit()
        db.refresh(out)

    return {
        "id":           out.id,
        "run_id":       out.run_id,
        "sku_id":       out.sku_id,
        "product_name": _sku_name(db, out.sku_id),
        "qty_packed":   out.qty_packed,
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
    total_theoretical = 0.0
    max_waste_pct = 0.0
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
        else:
            # No BOM found — use 0 contribution, log a note
            out.theoretical_kg = 0.0

    # Step 2: update bulk entries with actual usage
    total_actual = 0.0
    for b in bulk_entries:
        qty_end = qty_end_by_sku.get(b.bulk_sku_id)
        if qty_end is not None:
            b.qty_end = qty_end
            b.actual_used = b.qty_start - qty_end
        else:
            # If not provided, keep existing or default to 0
            b.actual_used = b.qty_start - (b.qty_end or 0.0)

        b.theoretical = total_theoretical  # share theoretical across bulk entries (single-bulk typical case)
        b.variance = (b.actual_used or 0.0) - b.theoretical if b.theoretical else None
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

    db.commit()
    db.refresh(run)
    return _fmt_run(run, db)


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
    existing_lcs: list = None,   # pass to update in-place instead of inserting
):
    """
    For each line, compute its proportional share of the batch's shared costs,
    create (or update) LandedCost rows, and return the list.
    """
    total_kg = sum(l.qty_kg for l in lines) or 1.0
    shared_total = batch.shared_freight + batch.shared_duty + batch.shared_overhead + batch.shared_other
    results = []
    for i, line in enumerate(lines):
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

        if existing_lcs and i < len(existing_lcs):
            lc = existing_lcs[i]
            lc.bulk_sku_id      = line.bulk_sku_id
            lc.qty_kg           = line.qty_kg
            lc.batch_ref        = batch.batch_ref
            lc.currency         = batch.currency
        else:
            lc = LandedCost(
                company_id        = company_id,
                purchase_batch_id = batch.id,
                bulk_sku_id       = line.bulk_sku_id,
                qty_kg            = line.qty_kg,
                batch_ref         = batch.batch_ref,
                currency          = batch.currency,
            )
            db.add(lc)

        for field, val in per_sku_costs.items():
            setattr(lc, field, val)
        lc.total_cost  = totals["total_cost"]
        lc.cost_per_kg = totals["cost_per_kg"]
        results.append(lc)

    return results


def _fmt_batch(batch: LandedCostBatch, db: Session) -> dict:
    items = db.query(LandedCost).filter(LandedCost.purchase_batch_id == batch.id).all()
    total_kg   = sum(i.qty_kg or 0   for i in items)
    total_cost = sum(i.total_cost or 0 for i in items)
    return {
        "id":             batch.id,
        "batch_ref":      batch.batch_ref,
        "supplier":       batch.supplier,
        "currency":       batch.currency,
        "shared_freight": batch.shared_freight,
        "shared_duty":    batch.shared_duty,
        "shared_overhead": batch.shared_overhead,
        "shared_other":   batch.shared_other,
        "notes":          batch.notes,
        "created_at":     batch.created_at.isoformat() if batch.created_at else None,
        "total_kg":       round(total_kg, 3),
        "total_cost":     round(total_cost, 4),
        "items": [_fmt_landed(i, db) for i in items],
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
    for line in body.lines:
        if not db.query(SKU).filter(SKU.id == line.bulk_sku_id).first():
            raise HTTPException(status_code=404, detail=f"SKU {line.bulk_sku_id} not found")

    batch = LandedCostBatch(
        company_id      = company_id,
        batch_ref       = body.batch_ref,
        supplier        = body.supplier,
        currency        = body.currency,
        shared_freight  = body.shared_freight,
        shared_duty     = body.shared_duty,
        shared_overhead = body.shared_overhead,
        shared_other    = body.shared_other,
        notes           = body.notes,
    )
    db.add(batch)
    db.flush()   # get batch.id

    _allocate_and_save_lines(db, batch, body.lines, company_id)
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

    # Update header
    batch.batch_ref       = body.batch_ref
    batch.supplier        = body.supplier
    batch.currency        = body.currency
    batch.shared_freight  = body.shared_freight
    batch.shared_duty     = body.shared_duty
    batch.shared_overhead = body.shared_overhead
    batch.shared_other    = body.shared_other
    batch.notes           = body.notes

    # Delete old lines and recreate
    db.query(LandedCost).filter(LandedCost.purchase_batch_id == batch_id).delete()
    db.flush()

    _allocate_and_save_lines(db, batch, body.lines, company_id)
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

    # Determine the bulk SKU used in this run (first bulk entry)
    bulk_sku_id = bulk_entries[0].bulk_sku_id if bulk_entries else None

    # Prefer the run's explicitly linked LandedCost; fall back to most-recent for bulk SKU
    landed_cost = None
    run_lc_id = getattr(run, 'landed_cost_id', None)
    if run_lc_id is not None:
        landed_cost = db.query(LandedCost).filter(
            LandedCost.id == run_lc_id,
            LandedCost.company_id == company_id,
        ).first()
    if landed_cost is None and bulk_sku_id is not None:
        landed_cost = (
            db.query(LandedCost)
            .filter(
                LandedCost.company_id == company_id,
                LandedCost.bulk_sku_id == bulk_sku_id,
            )
            .order_by(LandedCost.created_at.desc())
            .first()
        )

    # Get PackingRunCost for this run
    run_cost = db.query(PackingRunCost).filter(PackingRunCost.run_id == run_id).first()

    # Compute total cases and per-output data
    total_cases = sum(o.qty_packed for o in outputs)
    total_theoretical_kg = 0.0
    per_output = []

    cost_per_kg = landed_cost.cost_per_kg if (landed_cost and landed_cost.cost_per_kg) else 0.0

    # Packing run costs
    packing_pkg   = run_cost.cost_packaging_mat if run_cost else 0.0
    packing_labor = run_cost.cost_labor         if run_cost else 0.0
    packing_oh    = run_cost.cost_overhead      if run_cost else 0.0
    packing_other = run_cost.cost_other         if run_cost else 0.0
    labor_hours   = run_cost.labor_hours        if run_cost else None
    packing_total = packing_pkg + packing_labor + packing_oh + packing_other

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

        material_per_case = (bom_qty * cost_per_kg) if (bom_qty is not None and cost_per_kg) else 0.0
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

    bulk_material_cost = total_theoretical_kg * cost_per_kg
    grand_total_cost   = bulk_material_cost + packing_total
    grand_total_per_case_avg = (grand_total_cost / total_cases) if total_cases > 0 else 0.0

    return {
        "run_id":               run_id,
        "run_ref":              run.run_ref,
        "status":               run.status,
        "bulk_sku_id":          bulk_sku_id,
        "bulk_sku_name":        _sku_name(db, bulk_sku_id) if bulk_sku_id else None,
        # Landed cost info
        "landed_cost_id":       landed_cost.id if landed_cost else None,
        "landed_cost_ref":      landed_cost.batch_ref if landed_cost else None,
        "cost_per_kg":          cost_per_kg,
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
        },
        "packing_cost_per_case":      round(packing_cost_per_case, 4),
        "total_cases":                total_cases,
        "per_output":                 per_output,
        "grand_total_cost":           round(grand_total_cost, 4),
        "grand_total_per_case_avg":   round(grand_total_per_case_avg, 4),
    }
