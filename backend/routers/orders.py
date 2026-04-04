from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional, List
from pydantic import BaseModel
from datetime import date, datetime

import sys, os
sys.path.append(os.path.dirname(os.path.dirname(__file__)))
from database import get_db
from sqlalchemy import func
from models import (
    Order, OrderItem, DispatchItem, Batch,
    Inventory, SKU, MonthlyConsumption, BinLocation, WarehouseTask,
    Customer, Invoice as InvoiceModel, InvoiceItem as InvoiceItemModel, CompanyProfile,
)
from routers.receiving import update_inventory, update_monthly_consumption
from security import get_current_user, get_company_id

router = APIRouter(prefix="/orders", tags=["Orders"])

# ─── Schemas ──────────────────────────────────────────────────
class OrderItemCreate(BaseModel):
    sku_id: int
    cases_requested: float
    unit_price: Optional[float] = None   # override SKU selling_price; None = use default
    notes: Optional[str] = None

class OrderCreate(BaseModel):
    customer_id:   Optional[int] = None
    store_name:    str
    store_contact: Optional[str] = None
    order_date:    date
    notes:         Optional[str] = None
    items:         List[OrderItemCreate]

class PickResultItem(BaseModel):
    order_item_id: int
    cases_picked:  int
    expiry_date:   Optional[str] = None  # YYYY-MM-DD entered by picker

class EndPickingRequest(BaseModel):
    actual_picks: Optional[List[PickResultItem]] = None

def generate_order_number(db: Session) -> str:
    count = db.query(Order).count()
    return f"ORD-{datetime.utcnow().strftime('%Y%m%d')}-{count + 1:04d}"

def get_fifo_batches(sku_id: int, db: Session) -> List[Batch]:
    """Return batches ordered by expiry (FEFO) then received date (FIFO)"""
    return db.query(Batch).filter(
        Batch.sku_id == sku_id,
        Batch.cases_remaining > 0
    ).order_by(
        Batch.expiry_date.asc().nullslast(),
        Batch.received_date.asc()
    ).all()

def get_unrestricted_qty(sku_id: int, warehouse: str, db: Session, company_id: int = None) -> int:
    """Return unrestricted cases on hand for a SKU in a warehouse."""
    q = db.query(Inventory).filter(
        Inventory.sku_id == sku_id,
        Inventory.warehouse == warehouse,
        Inventory.stock_type == "unrestricted",
    )
    if company_id is not None:
        q = q.filter(Inventory.company_id == company_id)
    inv = q.first()
    return inv.cases_on_hand if inv else 0


def build_pick_list(sku_id: int, cases_needed: int, db: Session, company_id: int = None):
    """
    Build FEFO pick list using only UNRESTRICTED stock.
    Prefers WH1 first, then WH2.
    Returns list of {batch, warehouse, cases} and unfulfilled qty.
    """
    picks = []
    remaining = cases_needed

    for wh in ["WH1", "WH2"]:
        if remaining <= 0:
            break
        # Only pick up to what's in unrestricted inventory (prevents overselling)
        avail = get_unrestricted_qty(sku_id, wh, db, company_id)
        if avail <= 0:
            continue

        q = db.query(Batch).filter(
            Batch.sku_id == sku_id,
            Batch.warehouse == wh,
            Batch.cases_remaining > 0,
        )
        if company_id is not None:
            q = q.filter(Batch.company_id == company_id)
        # FEFO: earliest expiry first, then earliest received
        batches = q.order_by(
            Batch.expiry_date.asc().nullslast(),
            Batch.received_date.asc()
        ).all()

        for batch in batches:
            if remaining <= 0 or avail <= 0:
                break
            take = min(batch.cases_remaining, remaining, avail)
            picks.append({
                "batch_id": batch.id,
                "batch_code": batch.batch_code,
                "warehouse": batch.warehouse,
                "cases_to_pick": take,
                "expiry_date": batch.expiry_date.isoformat() if batch.expiry_date else None,
            })
            remaining -= take
            avail -= take

    return picks, remaining  # remaining > 0 means partial fulfillment

# ─── Endpoints ────────────────────────────────────────────────
@router.get("/")
def list_orders(
    status: Optional[str] = None,
    picking_queued: Optional[bool] = None,
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    q = db.query(Order).filter(Order.company_id == company_id)
    if status:
        q = q.filter(Order.status == status)
    if picking_queued is not None:
        q = q.filter(Order.picking_queued == picking_queued)
    orders = q.order_by(Order.order_date.desc()).all()

    return [
        {
            "id":                 o.id,
            "order_number":       o.order_number,
            "customer_id":        o.customer_id,
            "customer_name":      o.customer.name if o.customer else None,
            "store_name":         o.store_name,
            "order_date":         o.order_date.isoformat(),
            "dispatch_date":      o.dispatch_date.isoformat() if o.dispatch_date else None,
            "status":             o.status,
            "item_count":         len(o.items),
            "notes":              o.notes,
            "picking_queued":     getattr(o, "picking_queued", False) or False,
            "packing_status":     o.packing_status,
            "picker_name":        o.picker_name,
            "picking_started_at": getattr(o, "picking_started_at", None).isoformat() if getattr(o, "picking_started_at", None) else None,
            "picking_ended_at":   getattr(o, "picking_ended_at", None).isoformat() if getattr(o, "picking_ended_at", None) else None,
        }
        for o in orders
    ]

@router.post("/")
def create_order(
    data: OrderCreate,
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    order = Order(
        order_number=generate_order_number(db),
        customer_id=data.customer_id,
        store_name=data.store_name,
        store_contact=data.store_contact,
        order_date=data.order_date,
        notes=data.notes,
        status="Pending",
        company_id=company_id,
    )
    db.add(order)
    db.flush()

    for item_data in data.items:
        sku = db.query(SKU).filter(SKU.id == item_data.sku_id, SKU.company_id == company_id).first()
        if not sku:
            raise HTTPException(status_code=404, detail=f"SKU {item_data.sku_id} not found")

        order_item = OrderItem(
            order_id=order.id,
            sku_id=item_data.sku_id,
            cases_requested=item_data.cases_requested,
            cases_fulfilled=0,
            unit_price=item_data.unit_price,
            notes=item_data.notes,
        )
        db.add(order_item)

    db.commit()
    db.refresh(order)
    return {"order_number": order.order_number, "id": order.id}

def _get_bin_location(sku_id: int, db: Session) -> str:
    """Return the bin location code for a SKU (WH1 first, then WH2). Empty string if none assigned."""
    for wh in ["WH1", "WH2"]:
        inv = db.query(Inventory).filter(
            Inventory.sku_id == sku_id,
            Inventory.warehouse == wh,
            Inventory.bin_location_id.isnot(None),
        ).first()
        if inv and inv.bin_location:
            return inv.bin_location.code
    return ""


@router.get("/{order_id}/picklist")
def get_pick_list(
    order_id: int,
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    order = db.query(Order).filter(Order.id == order_id, Order.company_id == company_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    pick_list = []
    for item in order.items:
        picks, unfulfilled = build_pick_list(item.sku_id, item.cases_requested, db, company_id)
        bin_loc = _get_bin_location(item.sku_id, db)
        pick_list.append({
            "order_item_id":  item.id,
            "sku_id":         item.sku_id,
            "sku_code":       item.sku.sku_code,
            "barcode":        item.sku.barcode,
            "product_name":   item.sku.product_name,
            "cases_requested": item.cases_requested,
            "cases_picked":   item.cases_picked or 0,
            "cases_available": item.cases_requested - unfulfilled,
            "unfulfilled":    unfulfilled,
            "picks":          picks,
            "bin_location":   bin_loc,
            "show_goods_date":    getattr(item.sku, 'show_goods_date_on_picking', False),
            "require_expiry_entry": getattr(item.sku, 'require_expiry_entry', False),
            "expiry_date_entered": getattr(item, 'expiry_date_entered', None),
            "status": "ok" if unfulfilled == 0 else ("partial" if unfulfilled < item.cases_requested else "stockout"),
        })

    # Sort by bin location code (warehouse travel path) — items with no bin go last
    pick_list.sort(key=lambda x: (x["bin_location"] == "", x["bin_location"]))

    # Assign pick order numbers after sorting
    for i, row in enumerate(pick_list):
        row["pick_order"] = i + 1

    return {
        "order_number": order.order_number,
        "store_name":   order.store_name,
        "store_contact": order.store_contact if hasattr(order, 'store_contact') else None,
        "order_date":   order.order_date.isoformat(),
        "pick_list":    pick_list,
    }

class DispatchIn(BaseModel):
    num_pallets: Optional[int] = None   # pallet count entered just before dispatch

@router.post("/{order_id}/dispatch")
def dispatch_order(
    order_id: int,
    data: DispatchIn = DispatchIn(),
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    order = db.query(Order).filter(Order.id == order_id, Order.company_id == company_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.status == "Dispatched":
        raise HTTPException(status_code=400, detail="Order already dispatched")

    # ── Credit check ──────────────────────────────────────────
    if order.customer_id:
        cust = db.query(Customer).filter(
            Customer.id == order.customer_id,
            Customer.company_id == company_id,
        ).first()
        if cust:
            if getattr(cust, "credit_hold", False):
                raise HTTPException(
                    status_code=400,
                    detail=f"Order blocked: {cust.name} is on credit hold. Remove the hold in Customers before dispatching.",
                )
            if getattr(cust, "credit_limit", None) is not None:
                outstanding = db.query(func.sum(InvoiceModel.grand_total)).filter(
                    InvoiceModel.customer_id == cust.id,
                    InvoiceModel.company_id == company_id,
                    InvoiceModel.status.in_(["Sent", "Overdue"]),
                ).scalar() or 0.0
                if float(outstanding) >= cust.credit_limit:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Order blocked: {cust.name} has reached their credit limit of ${cust.credit_limit:,.2f} (outstanding: ${outstanding:,.2f}).",
                    )

    today = date.today()
    dispatched_items = []

    # Check if warehouse tasks (with FEFO-locked batches) exist for this order
    pick_tasks = db.query(WarehouseTask).filter(
        WarehouseTask.order_id == order_id,
        WarehouseTask.task_type == "pick",
        WarehouseTask.status.in_(["pending", "in_progress", "confirmed"]),
        WarehouseTask.company_id == company_id,
    ).all()
    use_tasks = len(pick_tasks) > 0

    for item in order.items:
        target_cases = (item.cases_picked or 0) if (item.cases_picked or 0) > 0 else item.cases_requested
        fulfilled = 0

        if use_tasks:
            # Use FEFO-locked batch assignments from warehouse tasks
            item_tasks = [t for t in pick_tasks if t.order_item_id == item.id]
            for task in item_tasks:
                cases = task.confirmed_qty or task.quantity
                batch = db.query(Batch).filter(Batch.id == task.batch_id).first()
                if not batch:
                    continue
                batch.cases_remaining -= cases
                # Deduct from allocated (was moved from unrestricted on send_to_picking)
                update_inventory(item.sku_id, task.warehouse, -cases, db, company_id, "allocated")
                update_monthly_consumption(item.sku_id, today.year, today.month, 0, db, company_id)
                mc = db.query(MonthlyConsumption).filter(
                    MonthlyConsumption.sku_id == item.sku_id,
                    MonthlyConsumption.year == today.year,
                    MonthlyConsumption.month == today.month,
                    MonthlyConsumption.company_id == company_id,
                ).first()
                if mc:
                    mc.cases_dispatched += cases
                db.add(DispatchItem(
                    order_item_id=item.id,
                    batch_id=task.batch_id,
                    warehouse=task.warehouse,
                    cases_picked=cases,
                ))
                task.status = "confirmed"
                task.confirmed_at = datetime.utcnow()
                fulfilled += cases
        else:
            # Direct dispatch without picking flow — use FEFO from unrestricted
            picks, _ = build_pick_list(item.sku_id, target_cases, db, company_id)
            for pick in picks:
                batch = db.query(Batch).filter(Batch.id == pick["batch_id"]).first()
                cases = pick["cases_to_pick"]
                batch.cases_remaining -= cases
                update_inventory(item.sku_id, pick["warehouse"], -cases, db, company_id, "unrestricted")
                update_monthly_consumption(item.sku_id, today.year, today.month, 0, db, company_id)
                mc = db.query(MonthlyConsumption).filter(
                    MonthlyConsumption.sku_id == item.sku_id,
                    MonthlyConsumption.year == today.year,
                    MonthlyConsumption.month == today.month,
                    MonthlyConsumption.company_id == company_id,
                ).first()
                if mc:
                    mc.cases_dispatched += cases
                db.add(DispatchItem(
                    order_item_id=item.id,
                    batch_id=pick["batch_id"],
                    warehouse=pick["warehouse"],
                    cases_picked=cases,
                ))
                fulfilled += cases

        item.cases_fulfilled = fulfilled
        dispatched_items.append({
            "sku_code": item.sku.sku_code,
            "product_name": item.sku.product_name,
            "cases_requested": item.cases_requested,
            "cases_fulfilled": fulfilled,
        })

    order.status = "Dispatched"
    order.dispatch_date = today
    if data.num_pallets is not None:
        order.num_pallets = data.num_pallets
    # Sync packing_status so Dispatch Board shows correct state
    if not order.packing_status or order.packing_status not in ("Packed", "Loaded", "Done"):
        order.packing_status = "Done"
    db.commit()

    # ── Auto-create invoice ───────────────────────────────────
    auto_invoice = None
    try:
        from routers.invoices import _create_invoice_for_order
        auto_invoice = _create_invoice_for_order(order, db, company_id)

        # ── Auto-email if customer has email + SMTP configured ─
        if auto_invoice and order.customer_id:
            try:
                cp = db.query(CompanyProfile).filter(
                    CompanyProfile.company_id == company_id,
                ).first()
                if not cp:
                    cp = db.query(CompanyProfile).filter(CompanyProfile.id == 1).first()
                cust_email = order.customer.email if order.customer else None
                if cust_email and cp and cp.smtp_host and cp.smtp_user and cp.smtp_password:
                    from routers.email import _invoice_html, _send_email
                    subject = f"Invoice {auto_invoice.invoice_number} from {cp.name or 'Us'}"
                    html = _invoice_html(auto_invoice, cp)
                    _send_email(cp, cust_email, subject, html)
                    auto_invoice.status = "Sent"
                    db.commit()
            except Exception:
                pass  # email failure doesn't break dispatch
    except Exception:
        pass  # invoice failure doesn't break dispatch

    result = {"message": "Order dispatched", "items": dispatched_items}
    if auto_invoice:
        result["invoice_number"] = auto_invoice.invoice_number
        result["invoice_id"]     = auto_invoice.id
    return result

@router.get("/{order_id}")
def get_order(
    order_id: int,
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    from models import Invoice as _Invoice
    order = db.query(Order).filter(Order.id == order_id, Order.company_id == company_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    # Look up linked invoice if any
    invoice = db.query(_Invoice).filter(
        _Invoice.order_id == order_id,
        _Invoice.company_id == company_id,
    ).first()
    return {
        "id": order.id,
        "order_number": order.order_number,
        "store_name": order.store_name,
        "store_contact": order.store_contact,
        "order_date": order.order_date.isoformat(),
        "dispatch_date": order.dispatch_date.isoformat() if order.dispatch_date else None,
        "status": order.status,
        "packing_status": order.packing_status,
        "picking_queued": getattr(order, "picking_queued", False) or False,
        "picker_name": order.picker_name,
        "notes": order.notes,
        "invoice_number": invoice.invoice_number if invoice else None,
        "invoice_id": invoice.id if invoice else None,
        "items": [
            {
                "id": i.id,
                "sku_id": i.sku_id,
                "sku_code": i.sku.sku_code,
                "product_name": i.sku.product_name,
                "cases_requested": i.cases_requested,
                "cases_fulfilled": i.cases_fulfilled,
                "unit_price": i.unit_price,
                "notes": i.notes,
            }
            for i in order.items
        ]
    }


class OrderItemUpdate(BaseModel):
    sku_id: int
    cases_requested: float
    unit_price: Optional[float] = None
    notes: Optional[str] = None


class OrderUpdate(BaseModel):
    store_name:  Optional[str] = None
    order_date:  Optional[str] = None
    notes:       Optional[str] = None
    num_pallets: Optional[int] = None   # set at dispatch time
    items:       Optional[List[OrderItemUpdate]] = None


@router.put("/{order_id}")
def update_order(
    order_id: int,
    data: OrderUpdate,
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    order = db.query(Order).filter(Order.id == order_id, Order.company_id == company_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.status != "Pending":
        raise HTTPException(status_code=400, detail="Only Pending orders can be edited")

    if data.store_name is not None:
        order.store_name = data.store_name
    if data.order_date is not None:
        from datetime import date as _date
        order.order_date = _date.fromisoformat(data.order_date)
    if data.notes is not None:
        order.notes = data.notes

    if data.items is not None:
        for item in list(order.items):
            db.delete(item)
        db.flush()
        for item_data in data.items:
            sku = db.query(SKU).filter(SKU.id == item_data.sku_id, SKU.company_id == company_id).first()
            if not sku:
                raise HTTPException(status_code=404, detail=f"SKU {item_data.sku_id} not found")
            db.add(OrderItem(
                order_id=order.id,
                sku_id=item_data.sku_id,
                cases_requested=item_data.cases_requested,
                cases_fulfilled=0,
                unit_price=item_data.unit_price,
                notes=item_data.notes,
            ))

    db.commit()
    db.refresh(order)
    return {"message": "Order updated", "id": order.id}


# ─── Picking flow endpoints ────────────────────────────────────

class PickingAssignRequest(BaseModel):
    picker_name: Optional[str] = None


@router.post("/{order_id}/send-to-picking")
def send_to_picking(
    order_id: int,
    req: PickingAssignRequest = None,
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
    current_user=Depends(get_current_user),
):
    """
    Queue order for picking.
    Creates one WarehouseTask per batch pick (FEFO-locked) and moves
    the quantity from 'unrestricted' to 'allocated' so it can't be
    double-sold to another order.
    """
    if req is None:
        req = PickingAssignRequest()
    order = db.query(Order).filter(Order.id == order_id, Order.company_id == company_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.status != "Pending":
        raise HTTPException(status_code=400, detail="Only Pending orders can be queued for picking")

    # Cancel any existing pending tasks for this order (re-queue scenario)
    existing = db.query(WarehouseTask).filter(
        WarehouseTask.order_id == order_id,
        WarehouseTask.status == "pending",
        WarehouseTask.task_type == "pick",
    ).all()
    for t in existing:
        # Release previously allocated stock back to unrestricted
        update_inventory(t.sku_id, t.warehouse, t.quantity, db, company_id, "unrestricted")
        update_inventory(t.sku_id, t.warehouse, -t.quantity, db, company_id, "allocated")
        t.status = "cancelled"

    # Build FEFO pick tasks for each order item
    tasks_created = 0
    for item in order.items:
        picks, _ = build_pick_list(item.sku_id, item.cases_requested, db, company_id)
        for pick in picks:
            task = WarehouseTask(
                company_id=company_id,
                task_type="pick",
                status="pending",
                sku_id=item.sku_id,
                batch_id=pick["batch_id"],        # FEFO-locked batch
                warehouse=pick["warehouse"],
                quantity=pick["cases_to_pick"],
                order_id=order_id,
                order_item_id=item.id,
                created_by=current_user.id,
                notes=f"Order {order.order_number}",
            )
            db.add(task)
            # Lock the stock: unrestricted → allocated
            update_inventory(item.sku_id, pick["warehouse"], -pick["cases_to_pick"], db, company_id, "unrestricted")
            update_inventory(item.sku_id, pick["warehouse"],  pick["cases_to_pick"], db, company_id, "allocated")
            tasks_created += 1

    order.picking_queued = True
    if req.picker_name:
        order.picker_name = req.picker_name
    db.commit()
    return {
        "message": "Order queued for picking",
        "picker_name": order.picker_name,
        "tasks_created": tasks_created,
    }


@router.post("/{order_id}/start-picking")
def start_picking(
    order_id: int,
    req: PickingAssignRequest = None,
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    """Picker starts working on this order — records start time."""
    if req is None:
        req = PickingAssignRequest()
    order = db.query(Order).filter(Order.id == order_id, Order.company_id == company_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    order.packing_status     = "Packing"
    order.picking_started_at = datetime.utcnow()
    order.board_updated_at   = datetime.utcnow()
    order.board_updated_by   = req.picker_name or order.picker_name or "Mobile Picker"
    if req.picker_name:
        order.picker_name = req.picker_name
    db.commit()
    return {"started_at": order.picking_started_at.isoformat()}


@router.post("/{order_id}/end-picking")
def end_picking(
    order_id: int,
    req: Optional[EndPickingRequest] = None,
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    """Picker finished — records end time, duration, and actual picked quantities."""
    order = db.query(Order).filter(Order.id == order_id, Order.company_id == company_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    # Save actual picked quantities per item
    if req and req.actual_picks:
        for pick_result in req.actual_picks:
            item = db.query(OrderItem).filter(OrderItem.id == pick_result.order_item_id).first()
            if item:
                item.cases_picked = pick_result.cases_picked
                if pick_result.expiry_date:
                    item.expiry_date_entered = pick_result.expiry_date

    order.packing_status   = "Packed"
    order.picking_ended_at = datetime.utcnow()
    order.board_updated_at = datetime.utcnow()
    order.board_updated_by = order.picker_name or "Mobile Picker"
    db.commit()
    duration = None
    if getattr(order, "picking_started_at", None):
        delta    = order.picking_ended_at - order.picking_started_at
        duration = int(delta.total_seconds())
    return {
        "ended_at":        order.picking_ended_at.isoformat(),
        "duration_seconds": duration,
    }
