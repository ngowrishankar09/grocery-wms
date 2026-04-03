from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional, List
from pydantic import BaseModel
from datetime import datetime

import sys, os
sys.path.append(os.path.dirname(os.path.dirname(__file__)))
from database import get_db
from models import WarehouseTask, SKU, Batch, User, Inventory, Order
from routers.receiving import update_inventory
from security import get_current_user, get_company_id, require_role

router = APIRouter(prefix="/warehouse-tasks", tags=["Warehouse Tasks"])


# ─── Schemas ──────────────────────────────────────────────────
class TaskCreate(BaseModel):
    task_type:    str              # pick | receive | putaway | transfer | stocktake | block | release
    sku_id:       int
    warehouse:    str
    quantity:     int
    batch_id:     Optional[int]   = None
    from_bin_id:  Optional[int]   = None
    to_bin_id:    Optional[int]   = None
    order_id:     Optional[int]   = None
    transfer_id:  Optional[int]   = None
    assigned_to:  Optional[int]   = None
    notes:        Optional[str]   = None

class TaskConfirm(BaseModel):
    confirmed_qty: Optional[int] = None   # actual qty; defaults to task quantity
    notes:         Optional[str] = None

class StockActionRequest(BaseModel):
    sku_id:    int
    warehouse: str
    quantity:  int
    reason:    Optional[str] = None   # reason for block / release


# ─── Helpers ──────────────────────────────────────────────────
def _serialize_task(t: WarehouseTask, db: Session) -> dict:
    sku  = db.query(SKU).filter(SKU.id == t.sku_id).first()   if t.sku_id   else None
    batch= db.query(Batch).filter(Batch.id == t.batch_id).first() if t.batch_id else None
    user = db.query(User).filter(User.id == t.assigned_to).first() if t.assigned_to else None
    creator = db.query(User).filter(User.id == t.created_by).first() if t.created_by else None
    order = db.query(Order).filter(Order.id == t.order_id).first() if t.order_id else None
    return {
        "id":            t.id,
        "task_type":     t.task_type,
        "status":        t.status,
        "sku_id":        t.sku_id,
        "sku_code":      sku.sku_code      if sku   else None,
        "product_name":  sku.product_name  if sku   else None,
        "batch_id":      t.batch_id,
        "batch_code":    batch.batch_code  if batch else None,
        "expiry_date":   batch.expiry_date.isoformat() if batch and batch.expiry_date else None,
        "warehouse":     t.warehouse,
        "quantity":      t.quantity,
        "confirmed_qty": t.confirmed_qty,
        "order_id":      t.order_id,
        "order_number":  order.order_number if order else None,
        "assigned_to":   t.assigned_to,
        "assigned_to_name": user.full_name or user.username if user else None,
        "created_by_name": creator.full_name or creator.username if creator else None,
        "notes":         t.notes,
        "created_at":    t.created_at.isoformat() if t.created_at else None,
        "started_at":    t.started_at.isoformat() if t.started_at else None,
        "confirmed_at":  t.confirmed_at.isoformat() if t.confirmed_at else None,
    }


# ─── List tasks ───────────────────────────────────────────────
@router.get("/")
def list_tasks(
    task_type: Optional[str] = None,
    status:    Optional[str] = None,
    order_id:  Optional[int] = None,
    db:        Session       = Depends(get_db),
    company_id: int          = Depends(get_company_id),
):
    q = db.query(WarehouseTask).filter(WarehouseTask.company_id == company_id)
    if task_type:
        q = q.filter(WarehouseTask.task_type == task_type)
    if status:
        q = q.filter(WarehouseTask.status == status)
    if order_id:
        q = q.filter(WarehouseTask.order_id == order_id)
    tasks = q.order_by(WarehouseTask.created_at.desc()).limit(200).all()
    return [_serialize_task(t, db) for t in tasks]


# ─── My tasks (assigned to current user) ──────────────────────
@router.get("/my-tasks")
def my_tasks(
    db:           Session = Depends(get_db),
    company_id:   int     = Depends(get_company_id),
    current_user          = Depends(get_current_user),
):
    tasks = db.query(WarehouseTask).filter(
        WarehouseTask.company_id == company_id,
        WarehouseTask.assigned_to == current_user.id,
        WarehouseTask.status.in_(["pending", "in_progress"]),
    ).order_by(WarehouseTask.created_at.asc()).all()
    return [_serialize_task(t, db) for t in tasks]


# ─── Stats ────────────────────────────────────────────────────
@router.get("/stats")
def task_stats(
    db:         Session = Depends(get_db),
    company_id: int     = Depends(get_company_id),
):
    base = db.query(WarehouseTask).filter(WarehouseTask.company_id == company_id)
    return {
        "pending":     base.filter(WarehouseTask.status == "pending").count(),
        "in_progress": base.filter(WarehouseTask.status == "in_progress").count(),
        "confirmed_today": base.filter(
            WarehouseTask.status == "confirmed",
            WarehouseTask.confirmed_at >= datetime.utcnow().replace(hour=0, minute=0, second=0),
        ).count(),
        "cancelled_today": base.filter(
            WarehouseTask.status == "cancelled",
            WarehouseTask.created_at >= datetime.utcnow().replace(hour=0, minute=0, second=0),
        ).count(),
    }


# ─── Create task manually ─────────────────────────────────────
@router.post("/")
def create_task(
    data:         TaskCreate,
    db:           Session = Depends(get_db),
    company_id:   int     = Depends(get_company_id),
    current_user          = Depends(get_current_user),
):
    task = WarehouseTask(
        company_id=company_id,
        task_type=data.task_type,
        status="pending",
        sku_id=data.sku_id,
        batch_id=data.batch_id,
        warehouse=data.warehouse,
        from_bin_id=data.from_bin_id,
        to_bin_id=data.to_bin_id,
        quantity=data.quantity,
        order_id=data.order_id,
        transfer_id=data.transfer_id,
        assigned_to=data.assigned_to,
        created_by=current_user.id,
        notes=data.notes,
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return _serialize_task(task, db)


# ─── Start a task ─────────────────────────────────────────────
@router.post("/{task_id}/start")
def start_task(
    task_id:    int,
    db:         Session = Depends(get_db),
    company_id: int     = Depends(get_company_id),
    current_user        = Depends(get_current_user),
):
    task = db.query(WarehouseTask).filter(
        WarehouseTask.id == task_id,
        WarehouseTask.company_id == company_id,
    ).first()
    if not task:
        raise HTTPException(404, "Task not found")
    if task.status != "pending":
        raise HTTPException(400, f"Task is already {task.status}")
    task.status = "in_progress"
    task.started_at = datetime.utcnow()
    if not task.assigned_to:
        task.assigned_to = current_user.id
    db.commit()
    return _serialize_task(task, db)


# ─── Confirm a task (physically done) ─────────────────────────
@router.post("/{task_id}/confirm")
def confirm_task(
    task_id:    int,
    req:        TaskConfirm = TaskConfirm(),
    db:         Session     = Depends(get_db),
    company_id: int         = Depends(get_company_id),
    current_user            = Depends(get_current_user),
):
    """
    Confirm task completion. For 'pick' tasks this means the picker has
    physically picked the stock. Stock moves from allocated → dispatched
    (the actual inventory deduction happens at dispatch_order time).

    For 'block' / 'release' tasks, stock type conversion happens here.
    """
    task = db.query(WarehouseTask).filter(
        WarehouseTask.id == task_id,
        WarehouseTask.company_id == company_id,
    ).first()
    if not task:
        raise HTTPException(404, "Task not found")
    if task.status == "confirmed":
        raise HTTPException(400, "Task already confirmed")
    if task.status == "cancelled":
        raise HTTPException(400, "Cannot confirm a cancelled task")

    confirmed_qty = req.confirmed_qty if req.confirmed_qty is not None else task.quantity

    if req.notes:
        task.notes = (task.notes or "") + f" | Confirmed: {req.notes}"

    # For block/release tasks — convert stock type immediately
    if task.task_type == "block":
        update_inventory(task.sku_id, task.warehouse, -confirmed_qty, db, company_id, "unrestricted")
        update_inventory(task.sku_id, task.warehouse,  confirmed_qty, db, company_id, "blocked")
    elif task.task_type == "release":
        update_inventory(task.sku_id, task.warehouse, -confirmed_qty, db, company_id, "blocked")
        update_inventory(task.sku_id, task.warehouse,  confirmed_qty, db, company_id, "unrestricted")
    elif task.task_type == "inspection_pass":
        update_inventory(task.sku_id, task.warehouse, -confirmed_qty, db, company_id, "inspection")
        update_inventory(task.sku_id, task.warehouse,  confirmed_qty, db, company_id, "unrestricted")

    task.status        = "confirmed"
    task.confirmed_qty = confirmed_qty
    task.confirmed_at  = datetime.utcnow()
    db.commit()
    return _serialize_task(task, db)


# ─── Cancel a task ────────────────────────────────────────────
@router.post("/{task_id}/cancel")
def cancel_task(
    task_id:    int,
    db:         Session = Depends(get_db),
    company_id: int     = Depends(get_company_id),
    current_user        = Depends(get_current_user),
):
    """
    Cancel a task. For 'pick' tasks, releases allocated stock back to unrestricted.
    """
    task = db.query(WarehouseTask).filter(
        WarehouseTask.id == task_id,
        WarehouseTask.company_id == company_id,
    ).first()
    if not task:
        raise HTTPException(404, "Task not found")
    if task.status in ("confirmed", "cancelled"):
        raise HTTPException(400, f"Cannot cancel a {task.status} task")

    # Release allocated stock back to unrestricted for pick tasks
    if task.task_type == "pick":
        update_inventory(task.sku_id, task.warehouse,  task.quantity, db, company_id, "unrestricted")
        update_inventory(task.sku_id, task.warehouse, -task.quantity, db, company_id, "allocated")

    task.status = "cancelled"
    db.commit()
    return _serialize_task(task, db)


# ─── Assign task to a user ────────────────────────────────────
@router.patch("/{task_id}/assign")
def assign_task(
    task_id:    int,
    user_id:    int,
    db:         Session = Depends(get_db),
    company_id: int     = Depends(get_company_id),
    _                   = Depends(require_role("admin", "manager", "superadmin")),
):
    task = db.query(WarehouseTask).filter(
        WarehouseTask.id == task_id,
        WarehouseTask.company_id == company_id,
    ).first()
    if not task:
        raise HTTPException(404, "Task not found")
    task.assigned_to = user_id
    db.commit()
    return _serialize_task(task, db)


# ─── Block stock (create + auto-confirm a block task) ─────────
@router.post("/block-stock")
def block_stock(
    req:        StockActionRequest,
    db:         Session = Depends(get_db),
    company_id: int     = Depends(get_company_id),
    current_user        = Depends(get_current_user),
):
    """Move stock from unrestricted → blocked (quarantine / damaged)."""
    avail_q = db.query(Inventory).filter(
        Inventory.sku_id    == req.sku_id,
        Inventory.warehouse == req.warehouse,
        Inventory.stock_type == "unrestricted",
        Inventory.company_id == company_id,
    ).first()
    avail = avail_q.cases_on_hand if avail_q else 0
    if req.quantity > avail:
        raise HTTPException(400, f"Only {avail} unrestricted cases available to block")

    update_inventory(req.sku_id, req.warehouse, -req.quantity, db, company_id, "unrestricted")
    update_inventory(req.sku_id, req.warehouse,  req.quantity, db, company_id, "blocked")

    task = WarehouseTask(
        company_id=company_id, task_type="block", status="confirmed",
        sku_id=req.sku_id, warehouse=req.warehouse,
        quantity=req.quantity, confirmed_qty=req.quantity,
        created_by=current_user.id, confirmed_at=datetime.utcnow(),
        notes=req.reason or "Stock blocked",
    )
    db.add(task)
    db.commit()
    return {"ok": True, "blocked": req.quantity, "task_id": task.id}


# ─── Release blocked stock back to unrestricted ───────────────
@router.post("/release-stock")
def release_stock(
    req:        StockActionRequest,
    db:         Session = Depends(get_db),
    company_id: int     = Depends(get_company_id),
    current_user        = Depends(get_current_user),
):
    """Move stock from blocked → unrestricted."""
    blocked_q = db.query(Inventory).filter(
        Inventory.sku_id    == req.sku_id,
        Inventory.warehouse == req.warehouse,
        Inventory.stock_type == "blocked",
        Inventory.company_id == company_id,
    ).first()
    blocked = blocked_q.cases_on_hand if blocked_q else 0
    if req.quantity > blocked:
        raise HTTPException(400, f"Only {blocked} blocked cases available to release")

    update_inventory(req.sku_id, req.warehouse, -req.quantity, db, company_id, "blocked")
    update_inventory(req.sku_id, req.warehouse,  req.quantity, db, company_id, "unrestricted")

    task = WarehouseTask(
        company_id=company_id, task_type="release", status="confirmed",
        sku_id=req.sku_id, warehouse=req.warehouse,
        quantity=req.quantity, confirmed_qty=req.quantity,
        created_by=current_user.id, confirmed_at=datetime.utcnow(),
        notes=req.reason or "Stock released",
    )
    db.add(task)
    db.commit()
    return {"ok": True, "released": req.quantity, "task_id": task.id}


# ─── Stock type summary for a SKU ────────────────────────────
@router.get("/stock-summary/{sku_id}")
def stock_summary(
    sku_id:     int,
    warehouse:  Optional[str] = None,
    db:         Session = Depends(get_db),
    company_id: int     = Depends(get_company_id),
):
    """Return unrestricted / blocked / inspection / allocated breakdown per SKU."""
    q = db.query(Inventory).filter(
        Inventory.sku_id == sku_id,
        Inventory.company_id == company_id,
    )
    if warehouse:
        q = q.filter(Inventory.warehouse == warehouse)
    rows = q.all()
    summary = {}
    for row in rows:
        key = row.warehouse
        if key not in summary:
            summary[key] = {"unrestricted": 0, "inspection": 0, "blocked": 0, "allocated": 0, "total": 0}
        summary[key][row.stock_type] = row.cases_on_hand
        summary[key]["total"] += row.cases_on_hand
    return summary
