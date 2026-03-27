"""
Customer Portal Router
======================
Self-service portal for customers to log in, browse the catalog,
and place orders.

POST /portal/login          → authenticate, receive JWT
GET  /portal/me             → current customer info
GET  /portal/catalog        → SKUs with customer-specific pricing
POST /portal/orders         → place an order
GET  /portal/orders         → order history
"""

from datetime import datetime, date, timedelta
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel
from sqlalchemy.orm import Session
from jose import JWTError, jwt

import sys, os
sys.path.append(os.path.dirname(os.path.dirname(__file__)))
from database import get_db
from models import Customer, SKU, Order, OrderItem, Inventory, PriceListItem, CompanyProfile, Invoice
from security import verify_password, SECRET_KEY, ALGORITHM

router = APIRouter(prefix="/portal", tags=["Customer Portal"])

_portal_scheme = OAuth2PasswordBearer(tokenUrl="/portal/login", auto_error=False)

PORTAL_TOKEN_HOURS = 24


# ── Token helpers ─────────────────────────────────────────────

def _create_portal_token(customer_id: int) -> str:
    expire = datetime.utcnow() + timedelta(hours=PORTAL_TOKEN_HOURS)
    return jwt.encode(
        {"sub": str(customer_id), "type": "portal", "exp": expire},
        SECRET_KEY, algorithm=ALGORITHM,
    )


def _get_current_customer(
    token: str = Depends(_portal_scheme),
    db: Session = Depends(get_db),
) -> Customer:
    exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Not authenticated",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if not token:
        raise exc
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        raise exc
    if payload.get("type") != "portal":
        raise exc
    customer_id = payload.get("sub")
    if not customer_id:
        raise exc
    c = db.query(Customer).filter(
        Customer.id == int(customer_id),
        Customer.is_active == True,
        Customer.portal_enabled == True,
    ).first()
    if not c:
        raise exc
    return c


# ── Schemas ───────────────────────────────────────────────────

class LoginRequest(BaseModel):
    email:    str
    password: str


class OrderLineIn(BaseModel):
    sku_id:    int
    cases_qty: int


class PlaceOrderRequest(BaseModel):
    notes: Optional[str] = None
    lines: List[OrderLineIn]


# ── Endpoints ─────────────────────────────────────────────────

@router.get("/settings")
def portal_settings(db: Session = Depends(get_db)):
    """Public endpoint — returns company name and portal visibility settings."""
    cp = db.query(CompanyProfile).filter(CompanyProfile.id == 1).first()
    if not cp:
        return {
            "company_name":       "Order Portal",
            "portal_show_price":    True,
            "portal_show_stock":    True,
            "portal_show_invoices": True,
        }
    return {
        "company_name":         cp.name or "Order Portal",
        "portal_show_price":    getattr(cp, "portal_show_price",    True),
        "portal_show_stock":    getattr(cp, "portal_show_stock",    True),
        "portal_show_invoices": getattr(cp, "portal_show_invoices", True),
    }


@router.post("/login")
def portal_login(req: LoginRequest, db: Session = Depends(get_db)):
    customer = db.query(Customer).filter(
        Customer.email == req.email,
        Customer.is_active == True,
        Customer.portal_enabled == True,
    ).first()
    if not customer or not customer.portal_password:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not verify_password(req.password, customer.portal_password):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token = _create_portal_token(customer.id)
    return {
        "access_token": token,
        "token_type": "bearer",
        "customer": {
            "id":   customer.id,
            "name": customer.name,
            "email": customer.email,
        },
    }


@router.get("/me")
def portal_me(customer: Customer = Depends(_get_current_customer)):
    return {
        "id":               customer.id,
        "name":             customer.name,
        "contact_person":   customer.contact_person,
        "email":            customer.email,
        "phone":            customer.phone,
        "address":          customer.address,
        "delivery_address": customer.delivery_address,
        "price_list_id":    customer.price_list_id,
        "price_list_name":  customer.price_list.name if customer.price_list else None,
    }


@router.get("/catalog")
def portal_catalog(
    customer: Customer = Depends(_get_current_customer),
    db: Session = Depends(get_db),
):
    skus = db.query(SKU).filter(SKU.is_active == True).order_by(SKU.category, SKU.product_name).all()

    # Build a lookup of sku_id → price from the customer's price list
    price_override: dict[int, float] = {}
    if customer.price_list_id:
        items = db.query(PriceListItem).filter(
            PriceListItem.price_list_id == customer.price_list_id
        ).all()
        price_override = {it.sku_id: it.unit_price for it in items}

    # Aggregate total stock across all warehouses
    result = []
    for sku in skus:
        inv_rows = db.query(Inventory).filter(Inventory.sku_id == sku.id).all()
        total_stock = sum(i.cases_on_hand for i in inv_rows)
        default_price = getattr(sku, 'selling_price', None) or sku.cost_price or 0
        unit_price = price_override.get(sku.id, default_price)
        result.append({
            "id":           sku.id,
            "sku_code":     sku.sku_code,
            "product_name": sku.product_name,
            "category":     sku.category,
            "case_size":    sku.case_size,
            "unit_price":   unit_price,
            "stock":        total_stock,
            "image_url":    sku.image_url,
        })
    return result


@router.post("/orders")
def portal_place_order(
    req: PlaceOrderRequest,
    customer: Customer = Depends(_get_current_customer),
    db: Session = Depends(get_db),
):
    if not req.lines:
        raise HTTPException(status_code=400, detail="Order must have at least one item")

    # Generate order number
    today = date.today().strftime("%Y%m%d")
    count = db.query(Order).filter(Order.order_number.like(f"PO-{today}-%")).count()
    order_number = f"PO-{today}-{count + 1:03d}"

    order = Order(
        order_number  = order_number,
        customer_id   = customer.id,
        store_name    = customer.name,
        store_contact = customer.contact_person or customer.email,
        order_date    = date.today(),
        status        = "Pending",
        notes         = req.notes or "",
    )
    db.add(order)
    db.flush()

    # Build price lookup for this customer
    price_override: dict[int, float] = {}
    if customer.price_list_id:
        items = db.query(PriceListItem).filter(
            PriceListItem.price_list_id == customer.price_list_id
        ).all()
        price_override = {it.sku_id: it.unit_price for it in items}

    for line in req.lines:
        sku = db.query(SKU).filter(SKU.id == line.sku_id, SKU.is_active == True).first()
        if not sku:
            raise HTTPException(status_code=400, detail=f"SKU {line.sku_id} not found")
        item = OrderItem(
            order_id         = order.id,
            sku_id           = sku.id,
            cases_requested  = line.cases_qty,
        )
        db.add(item)

    db.commit()
    db.refresh(order)
    return {
        "order_number": order.order_number,
        "id":           order.id,
        "status":       order.status,
        "order_date":   order.order_date.isoformat(),
    }


@router.get("/orders")
def portal_orders(
    customer: Customer = Depends(_get_current_customer),
    db: Session = Depends(get_db),
):
    orders = db.query(Order).filter(
        Order.customer_id == customer.id
    ).order_by(Order.created_at.desc()).limit(50).all()

    # Build price lookup once
    price_override: dict[int, float] = {}
    if customer.price_list_id:
        items = db.query(PriceListItem).filter(
            PriceListItem.price_list_id == customer.price_list_id
        ).all()
        price_override = {it.sku_id: it.unit_price for it in items}

    result = []
    for o in orders:
        lines = []
        total = 0.0
        for it in o.items:
            sku = it.sku
            default_price = (getattr(sku, 'selling_price', None) or sku.cost_price or 0) if sku else 0
            unit_price = price_override.get(it.sku_id, default_price)
            line_total = it.cases_requested * unit_price
            total += line_total
            lines.append({
                "product_name": sku.product_name if sku else f"SKU {it.sku_id}",
                "sku_code":     sku.sku_code if sku else "",
                "cases_qty":    it.cases_requested,
                "unit_price":   unit_price,
                "line_total":   line_total,
            })
        result.append({
            "id":           o.id,
            "order_number": o.order_number,
            "order_date":   o.order_date.isoformat() if o.order_date else None,
            "status":       o.status,
            "notes":        o.notes,
            "items":        lines,
            "total":        total,
        })
    return result


@router.get("/invoices")
def portal_invoices(
    customer: Customer = Depends(_get_current_customer),
    db: Session = Depends(get_db),
):
    invs = db.query(Invoice).filter(
        Invoice.customer_id == customer.id
    ).order_by(Invoice.invoice_date.desc()).limit(50).all()

    return [
        {
            "id":             inv.id,
            "invoice_number": inv.invoice_number,
            "invoice_date":   inv.invoice_date.isoformat() if inv.invoice_date else None,
            "due_date":       inv.due_date.isoformat() if inv.due_date else None,
            "status":         inv.status,
            "subtotal":       inv.subtotal,
            "total":          inv.grand_total or inv.total,
            "notes":          inv.notes,
            "items": [
                {
                    "description": it.description,
                    "sku_code":    it.sku.sku_code if it.sku else "",
                    "cases_qty":   it.cases_qty,
                    "unit_price":  it.unit_price,
                    "line_total":  it.line_total,
                }
                for it in inv.items
            ],
        }
        for inv in invs
    ]
