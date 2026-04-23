"""
Repacking / Production Tracking Router
=======================================
Tracks bulk-to-retail repacking, calculates waste/variance, and flags
potential theft when variance exceeds BOM-defined tolerance.

Prefix: /repacking  Tags: ["Repacking"]
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

import sys, os
sys.path.append(os.path.dirname(os.path.dirname(__file__)))
from database import get_db
from models import BillOfMaterial, PackingRun, PackingRunOutput, PackingRunBulk, SKU
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
    run_ref:      Optional[str] = None
    bulk_sku_id:  int
    qty_start:    float
    started_by:   Optional[str] = None
    notes:        Optional[str] = None

class OutputIn(BaseModel):
    sku_id:     int
    qty_packed: float

class CloseIn(BaseModel):
    # List of {bulk_sku_id, qty_end} for each bulk entry in this run
    bulk_entries: List[dict]


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
    return {
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

    run = PackingRun(
        company_id = company_id,
        run_ref    = body.run_ref,
        status     = "open",
        started_by = body.started_by,
        notes      = body.notes,
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
):
    all_runs = (
        db.query(PackingRun)
        .filter(PackingRun.company_id == company_id)
        .all()
    )
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
