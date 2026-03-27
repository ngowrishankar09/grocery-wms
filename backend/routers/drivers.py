from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from pydantic import BaseModel
from typing import Optional, List
from datetime import date, datetime
import math, urllib.request, urllib.parse, json, time

from database import get_db
from models import Driver, DeliveryRun, DeliveryStop, Order, Customer
from security import get_current_user, get_company_id

router = APIRouter(prefix="/drivers", tags=["drivers"])
runs_router = APIRouter(prefix="/delivery-runs", tags=["delivery-runs"])

# ── Helpers ──────────────────────────────────────────────────

def _fmt_driver(d: Driver):
    return {
        "id": d.id, "name": d.name, "phone": d.phone, "email": d.email,
        "vehicle_type": d.vehicle_type, "license_plate": d.license_plate,
        "status": d.status, "notes": d.notes, "is_active": d.is_active,
        "created_at": d.created_at.isoformat() if d.created_at else None,
    }

def _fmt_stop(s: DeliveryStop):
    return {
        "id": s.id, "run_id": s.run_id, "order_id": s.order_id,
        "sequence_order": s.sequence_order,
        "customer_name": s.customer_name, "address": s.address,
        "status": s.status, "delivery_notes": s.delivery_notes,
        "delivered_at": s.delivered_at.isoformat() if s.delivered_at else None,
        "created_at": s.created_at.isoformat() if s.created_at else None,
    }

def _fmt_run(r: DeliveryRun):
    total    = len(r.stops)
    done     = sum(1 for s in r.stops if s.status == "Delivered")
    failed   = sum(1 for s in r.stops if s.status == "Failed")
    pending  = sum(1 for s in r.stops if s.status == "Pending")
    return {
        "id": r.id, "run_number": r.run_number,
        "driver_id": r.driver_id,
        "driver_name": r.driver.name if r.driver else None,
        "driver_phone": r.driver.phone if r.driver else None,
        "run_date": r.run_date.isoformat() if r.run_date else None,
        "status": r.status, "notes": r.notes,
        "total_stops": total, "delivered": done, "failed": failed, "pending": pending,
        "created_at": r.created_at.isoformat() if r.created_at else None,
        "stops": [_fmt_stop(s) for s in r.stops],
    }

def _next_run_number(db: Session) -> str:
    today = datetime.utcnow().strftime("%Y%m%d")
    prefix = f"RUN-{today}-"
    count = db.query(func.count(DeliveryRun.id)).filter(
        DeliveryRun.run_number.like(f"{prefix}%")
    ).scalar() or 0
    return f"{prefix}{str(count + 1).zfill(3)}"


# ── Driver Schemas ───────────────────────────────────────────

class DriverIn(BaseModel):
    name: str
    phone: Optional[str] = None
    email: Optional[str] = None
    vehicle_type: Optional[str] = None
    license_plate: Optional[str] = None
    status: Optional[str] = "Available"
    notes: Optional[str] = None

class DriverUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    vehicle_type: Optional[str] = None
    license_plate: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None
    is_active: Optional[bool] = None


# ── Driver Endpoints ─────────────────────────────────────────

@router.get("/")
def list_drivers(
    include_inactive: bool = False,
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    q = db.query(Driver).filter(Driver.company_id == company_id)
    if not include_inactive:
        q = q.filter(Driver.is_active == True)
    drivers = q.order_by(Driver.name).all()
    return [_fmt_driver(d) for d in drivers]


@router.post("/", status_code=201)
def create_driver(
    data: DriverIn,
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    d = Driver(**data.dict(), company_id=company_id)
    db.add(d)
    db.commit()
    db.refresh(d)
    return _fmt_driver(d)


@router.put("/{driver_id}")
def update_driver(
    driver_id: int,
    data: DriverUpdate,
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    d = db.query(Driver).filter(Driver.id == driver_id, Driver.company_id == company_id).first()
    if not d:
        raise HTTPException(404, "Driver not found")
    for field, value in data.dict(exclude_unset=True).items():
        setattr(d, field, value)
    db.commit()
    return _fmt_driver(d)


@router.delete("/{driver_id}")
def delete_driver(
    driver_id: int,
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    d = db.query(Driver).filter(Driver.id == driver_id, Driver.company_id == company_id).first()
    if not d:
        raise HTTPException(404, "Driver not found")
    d.is_active = False
    db.commit()
    return {"ok": True}


# ── DeliveryRun Schemas ──────────────────────────────────────

class RunIn(BaseModel):
    driver_id: Optional[int] = None
    run_date: date
    notes: Optional[str] = None

class StopIn(BaseModel):
    order_id: Optional[int] = None
    customer_name: str
    address: Optional[str] = None
    sequence_order: Optional[int] = 0
    delivery_notes: Optional[str] = None

class StopUpdate(BaseModel):
    status: Optional[str] = None
    delivery_notes: Optional[str] = None
    sequence_order: Optional[int] = None

class RunUpdate(BaseModel):
    driver_id: Optional[int] = None
    run_date: Optional[date] = None
    status: Optional[str] = None
    notes: Optional[str] = None


# ── DeliveryRun Endpoints ────────────────────────────────────

@runs_router.get("/")
def list_runs(
    run_date: Optional[date] = None,
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    q = db.query(DeliveryRun).options(
        joinedload(DeliveryRun.driver),
        joinedload(DeliveryRun.stops)
    ).filter(DeliveryRun.company_id == company_id)
    if run_date:
        q = q.filter(DeliveryRun.run_date == run_date)
    runs = q.order_by(DeliveryRun.run_date.desc(), DeliveryRun.id.desc()).all()
    return [_fmt_run(r) for r in runs]


@runs_router.post("/", status_code=201)
def create_run(
    data: RunIn,
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    r = DeliveryRun(
        run_number=_next_run_number(db),
        driver_id=data.driver_id,
        run_date=data.run_date,
        notes=data.notes,
        company_id=company_id,
    )
    db.add(r)
    db.commit()
    db.refresh(r)
    # re-query with joins
    r = db.query(DeliveryRun).options(
        joinedload(DeliveryRun.driver), joinedload(DeliveryRun.stops)
    ).filter(DeliveryRun.id == r.id).first()
    return _fmt_run(r)


@runs_router.put("/{run_id}")
def update_run(
    run_id: int,
    data: RunUpdate,
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    r = db.query(DeliveryRun).options(
        joinedload(DeliveryRun.driver), joinedload(DeliveryRun.stops)
    ).filter(DeliveryRun.id == run_id, DeliveryRun.company_id == company_id).first()
    if not r:
        raise HTTPException(404, "Run not found")
    for field, value in data.dict(exclude_unset=True).items():
        setattr(r, field, value)
    db.commit()
    db.refresh(r)
    r = db.query(DeliveryRun).options(
        joinedload(DeliveryRun.driver), joinedload(DeliveryRun.stops)
    ).filter(DeliveryRun.id == run_id).first()
    return _fmt_run(r)


@runs_router.post("/{run_id}/start")
def start_run(
    run_id: int,
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    r = db.query(DeliveryRun).filter(
        DeliveryRun.id == run_id,
        DeliveryRun.company_id == company_id,
    ).first()
    if not r:
        raise HTTPException(404)
    r.status = "In Progress"
    if r.driver_id:
        drv = db.query(Driver).filter(Driver.id == r.driver_id).first()
        if drv:
            drv.status = "On Route"
    db.commit()
    return {"ok": True, "status": "In Progress"}


@runs_router.post("/{run_id}/complete")
def complete_run(
    run_id: int,
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    r = db.query(DeliveryRun).options(joinedload(DeliveryRun.stops)).filter(
        DeliveryRun.id == run_id,
        DeliveryRun.company_id == company_id,
    ).first()
    if not r:
        raise HTTPException(404)
    r.status = "Completed"
    if r.driver_id:
        drv = db.query(Driver).filter(Driver.id == r.driver_id).first()
        if drv:
            drv.status = "Available"
    db.commit()
    return {"ok": True, "status": "Completed"}


@runs_router.delete("/{run_id}")
def delete_run(
    run_id: int,
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    r = db.query(DeliveryRun).filter(
        DeliveryRun.id == run_id,
        DeliveryRun.company_id == company_id,
    ).first()
    if not r:
        raise HTTPException(404)
    db.delete(r)
    db.commit()
    return {"ok": True}


# ── Stop Endpoints ───────────────────────────────────────────

@runs_router.post("/{run_id}/stops", status_code=201)
def add_stop(
    run_id: int,
    data: StopIn,
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    r = db.query(DeliveryRun).filter(
        DeliveryRun.id == run_id,
        DeliveryRun.company_id == company_id,
    ).first()
    if not r:
        raise HTTPException(404, "Run not found")
    # auto sequence if not provided
    max_seq = db.query(func.max(DeliveryStop.sequence_order)).filter(
        DeliveryStop.run_id == run_id
    ).scalar() or 0
    stop = DeliveryStop(
        run_id=run_id,
        order_id=data.order_id,
        customer_name=data.customer_name,
        address=data.address,
        sequence_order=data.sequence_order if data.sequence_order else max_seq + 1,
        delivery_notes=data.delivery_notes,
    )
    db.add(stop)
    db.commit()
    db.refresh(stop)
    return _fmt_stop(stop)


@runs_router.put("/{run_id}/stops/{stop_id}")
def update_stop(
    run_id: int,
    stop_id: int,
    data: StopUpdate,
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    # Verify run belongs to company
    r = db.query(DeliveryRun).filter(
        DeliveryRun.id == run_id,
        DeliveryRun.company_id == company_id,
    ).first()
    if not r:
        raise HTTPException(404, "Run not found")
    stop = db.query(DeliveryStop).filter(
        DeliveryStop.id == stop_id, DeliveryStop.run_id == run_id
    ).first()
    if not stop:
        raise HTTPException(404, "Stop not found")
    for field, value in data.dict(exclude_unset=True).items():
        setattr(stop, field, value)
    if data.status == "Delivered" and not stop.delivered_at:
        stop.delivered_at = datetime.utcnow()
    db.commit()
    return _fmt_stop(stop)


@runs_router.delete("/{run_id}/stops/{stop_id}")
def delete_stop(
    run_id: int,
    stop_id: int,
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    r = db.query(DeliveryRun).filter(
        DeliveryRun.id == run_id,
        DeliveryRun.company_id == company_id,
    ).first()
    if not r:
        raise HTTPException(404)
    stop = db.query(DeliveryStop).filter(
        DeliveryStop.id == stop_id, DeliveryStop.run_id == run_id
    ).first()
    if not stop:
        raise HTTPException(404)
    db.delete(stop)
    db.commit()
    return {"ok": True}


# ── Route Optimization ────────────────────────────────────────

def _geocode(address: str) -> tuple:
    """Geocode address via Nominatim. Returns (lat, lon) or (None, None)."""
    if not address:
        return None, None
    try:
        params = urllib.parse.urlencode({"q": address, "format": "json", "limit": 1})
        url = f"https://nominatim.openstreetmap.org/search?{params}"
        req = urllib.request.Request(url, headers={"User-Agent": "GroceryWMS/1.0 (internal)"})
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read())
            if data:
                return float(data[0]["lat"]), float(data[0]["lon"])
    except Exception:
        pass
    return None, None

def _haversine(lat1, lon1, lat2, lon2) -> float:
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon/2)**2
    return 2 * R * math.asin(math.sqrt(a))

def _nearest_neighbor(coords: list) -> list:
    """Nearest-neighbor TSP. coords = list of (lat, lon) or None. Returns ordered indices."""
    n = len(coords)
    valid = [(i, c) for i, c in enumerate(coords) if c and c[0] is not None]
    invalid = [i for i, c in enumerate(coords) if not c or c[0] is None]
    if not valid:
        return list(range(n))

    unvisited = set(i for i, _ in valid)
    order = [valid[0][0]]
    unvisited.discard(order[0])

    while unvisited:
        cur = order[-1]
        cur_lat, cur_lon = coords[cur]
        nearest = min(unvisited, key=lambda j: _haversine(cur_lat, cur_lon, *coords[j]))
        order.append(nearest)
        unvisited.discard(nearest)

    return order + invalid  # geocoded stops first, then any that couldn't be geocoded


@runs_router.post("/{run_id}/optimize")
def optimize_route(
    run_id: int,
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    """Reorder stops using nearest-neighbor TSP with Nominatim geocoding."""
    run = db.query(DeliveryRun).options(joinedload(DeliveryRun.stops)).filter(
        DeliveryRun.id == run_id,
        DeliveryRun.company_id == company_id,
    ).first()
    if not run:
        raise HTTPException(404, "Run not found")
    if not run.stops:
        return {"ok": True, "message": "No stops to optimize", "stops": []}

    stops = list(run.stops)
    coords = []
    geocoded_count = 0

    for stop in stops:
        # Try customer lat/lng via order lookup first
        lat, lon = None, None
        if stop.order_id:
            order = db.query(Order).filter(Order.id == stop.order_id).first()
            if order and order.customer:
                lat = order.customer.latitude
                lon = order.customer.longitude

        # Geocode if not cached
        if (lat is None or lon is None) and stop.address:
            lat, lon = _geocode(stop.address)
            geocoded_count += 1
            # Cache on customer
            if stop.order_id and lat is not None:
                order = db.query(Order).filter(Order.id == stop.order_id).first()
                if order and order.customer:
                    order.customer.latitude = lat
                    order.customer.longitude = lon
            # Rate-limit Nominatim: 1 req/sec
            if geocoded_count < len(stops):
                time.sleep(1.1)

        coords.append((lat, lon) if lat is not None else None)

    ordered_indices = _nearest_neighbor(coords)

    for seq, idx in enumerate(ordered_indices, start=1):
        stops[idx].sequence_order = seq

    db.commit()

    # Reload with new order
    db.refresh(run)
    return {
        "ok": True,
        "geocoded": geocoded_count,
        "stops": [_fmt_stop(s) for s in sorted(run.stops, key=lambda s: s.sequence_order)],
    }
