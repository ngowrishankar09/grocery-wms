"""
QuickBooks Online Integration Router
=====================================
Endpoints:
  GET    /quickbooks/status                  → connection status + last sync
  POST   /quickbooks/credentials             → save Client ID / Secret / environment
  GET    /quickbooks/auth-url                → generate Intuit OAuth2 authorization URL
  GET    /quickbooks/callback                → OAuth2 callback (Intuit redirects here)
  DELETE /quickbooks/disconnect              → clear tokens / disconnect
  POST   /quickbooks/sync/vendors            → push WMS vendors → QB Vendors
  POST   /quickbooks/sync/items              → push WMS SKUs → QB Items
  POST   /quickbooks/sync/invoices           → push dispatched orders → QB Invoices
  POST   /quickbooks/sync/customers          → pull QB Customers → return list
  POST   /quickbooks/sync/all               → run all sync operations
  GET    /quickbooks/sync/logs               → recent sync records
"""

import os, json, re, base64, urllib.parse
from datetime import datetime, timedelta
from typing import Optional

import requests
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse, HTMLResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel

import sys
sys.path.append(os.path.dirname(os.path.dirname(__file__)))
from database import get_db
from models import (
    QuickBooksConfig, QuickBooksSyncRecord,
    Vendor, SKU, Order, OrderItem, Inventory
)
from security import get_current_user, get_company_id

router = APIRouter(prefix="/quickbooks", tags=["QuickBooks"])

# ── OAuth endpoints ────────────────────────────────────────────
QB_AUTH_URL      = "https://appcenter.intuit.com/connect/oauth2"
QB_TOKEN_URL     = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer"
QB_REVOKE_URL    = "https://developer.api.intuit.com/v2/oauth2/tokens/revoke"
QB_SCOPES        = "com.intuit.quickbooks.accounting"

SANDBOX_BASE     = "https://sandbox-quickbooks.api.intuit.com/v3/company"
PRODUCTION_BASE  = "https://quickbooks.api.intuit.com/v3/company"

FRONTEND_URL     = os.getenv("FRONTEND_URL", "http://localhost:5173")


# ── Helpers ───────────────────────────────────────────────────

def _get_config(db: Session) -> QuickBooksConfig:
    cfg = db.query(QuickBooksConfig).first()
    if not cfg:
        cfg = QuickBooksConfig()
        db.add(cfg)
        db.commit()
        db.refresh(cfg)
    return cfg


def _base_url(cfg: QuickBooksConfig) -> str:
    base = PRODUCTION_BASE if cfg.environment == "production" else SANDBOX_BASE
    return f"{base}/{cfg.realm_id}"


def _is_token_valid(cfg: QuickBooksConfig) -> bool:
    if not cfg.access_token or not cfg.token_expiry:
        return False
    return datetime.utcnow() < cfg.token_expiry - timedelta(minutes=5)


def _refresh_access_token(cfg: QuickBooksConfig, db: Session) -> bool:
    """Refresh the access token using the refresh token."""
    if not cfg.refresh_token or not cfg.client_id or not cfg.client_secret:
        return False
    try:
        credentials = base64.b64encode(
            f"{cfg.client_id}:{cfg.client_secret}".encode()
        ).decode()
        resp = requests.post(
            QB_TOKEN_URL,
            headers={
                "Authorization": f"Basic {credentials}",
                "Accept": "application/json",
                "Content-Type": "application/x-www-form-urlencoded",
            },
            data={
                "grant_type": "refresh_token",
                "refresh_token": cfg.refresh_token,
            },
            timeout=15,
        )
        if resp.status_code == 200:
            data = resp.json()
            cfg.access_token   = data["access_token"]
            cfg.refresh_token  = data.get("refresh_token", cfg.refresh_token)
            cfg.token_expiry   = datetime.utcnow() + timedelta(seconds=data.get("expires_in", 3600))
            db.commit()
            return True
    except Exception as e:
        print(f"Token refresh error: {e}")
    return False


def _get_headers(cfg: QuickBooksConfig, db: Session) -> dict:
    """Return auth headers, refreshing token if needed."""
    if not _is_token_valid(cfg):
        if not _refresh_access_token(cfg, db):
            raise HTTPException(status_code=401, detail="QuickBooks token expired. Please reconnect.")
    return {
        "Authorization": f"Bearer {cfg.access_token}",
        "Accept": "application/json",
        "Content-Type": "application/json",
    }


def _qb_get(url: str, headers: dict, params: dict = None):
    resp = requests.get(url, headers=headers, params=params or {}, timeout=15)
    if resp.status_code not in (200, 201):
        raise HTTPException(status_code=502, detail=f"QB API error {resp.status_code}: {resp.text[:300]}")
    return resp.json()


def _qb_post(url: str, headers: dict, body: dict):
    resp = requests.post(url, headers=headers, json=body, timeout=15)
    if resp.status_code not in (200, 201):
        raise HTTPException(status_code=502, detail=f"QB API error {resp.status_code}: {resp.text[:300]}")
    return resp.json()


def _log(db: Session, entity_type: str, wms_id, wms_ref: str, qb_id: str,
         action: str, status: str, message: str = ""):
    db.add(QuickBooksSyncRecord(
        entity_type=entity_type, wms_id=wms_id, wms_ref=wms_ref,
        qb_id=qb_id, action=action, status=status, message=message
    ))
    db.commit()


# ── Pydantic schemas ───────────────────────────────────────────

class CredentialsUpdate(BaseModel):
    client_id:     str
    client_secret: str
    environment:   str = "sandbox"   # sandbox | production
    redirect_uri:  Optional[str] = "http://localhost:8000/quickbooks/callback"


# ── Status ────────────────────────────────────────────────────

@router.get("/status")
def get_status(db: Session = Depends(get_db)):
    cfg = _get_config(db)
    is_connected = bool(cfg.realm_id and cfg.access_token)
    token_ok     = _is_token_valid(cfg) if is_connected else False

    # Recent sync summary
    logs = db.query(QuickBooksSyncRecord).order_by(
        QuickBooksSyncRecord.synced_at.desc()
    ).limit(5).all()

    return {
        "is_connected":      is_connected,
        "token_valid":       token_ok,
        "environment":       cfg.environment or "sandbox",
        "realm_id":          cfg.realm_id,
        "connected_at":      cfg.connected_at.isoformat() if cfg.connected_at else None,
        "last_sync_at":      cfg.last_sync_at.isoformat()  if cfg.last_sync_at  else None,
        "has_credentials":   bool(cfg.client_id and cfg.client_secret),
        "redirect_uri":      cfg.redirect_uri or "http://localhost:8000/quickbooks/callback",
        "recent_logs":       [
            {
                "entity_type": l.entity_type,
                "wms_ref":     l.wms_ref,
                "action":      l.action,
                "status":      l.status,
                "message":     l.message,
                "synced_at":   l.synced_at.isoformat(),
            } for l in logs
        ],
    }


# ── Credentials ───────────────────────────────────────────────

@router.post("/credentials")
def save_credentials(data: CredentialsUpdate, db: Session = Depends(get_db)):
    cfg = _get_config(db)
    cfg.client_id     = data.client_id.strip()
    cfg.client_secret = data.client_secret.strip()
    cfg.environment   = data.environment
    cfg.redirect_uri  = data.redirect_uri or "http://localhost:8000/quickbooks/callback"
    db.commit()
    return {"ok": True, "message": "Credentials saved. Click Connect to authorize."}


# ── Auth URL ──────────────────────────────────────────────────

@router.get("/auth-url")
def get_auth_url(db: Session = Depends(get_db)):
    cfg = _get_config(db)
    if not cfg.client_id or not cfg.client_secret:
        raise HTTPException(status_code=400, detail="Client ID and Secret not configured yet.")

    params = {
        "client_id":     cfg.client_id,
        "response_type": "code",
        "scope":         QB_SCOPES,
        "redirect_uri":  cfg.redirect_uri,
        "state":         "wms_qb_connect",
    }
    url = QB_AUTH_URL + "?" + urllib.parse.urlencode(params)
    return {"auth_url": url}


# ── OAuth Callback ────────────────────────────────────────────

@router.get("/callback")
def oauth_callback(
    code:     str = Query(None),
    realmId:  str = Query(None),
    state:    str = Query(None),
    error:    str = Query(None),
    db: Session = Depends(get_db),
):
    if error:
        return RedirectResponse(f"{FRONTEND_URL}/quickbooks?error={urllib.parse.quote(error)}")

    if not code or not realmId:
        return RedirectResponse(f"{FRONTEND_URL}/quickbooks?error=missing_code")

    cfg = _get_config(db)
    if not cfg.client_id or not cfg.client_secret:
        return RedirectResponse(f"{FRONTEND_URL}/quickbooks?error=no_credentials")

    try:
        credentials = base64.b64encode(
            f"{cfg.client_id}:{cfg.client_secret}".encode()
        ).decode()

        resp = requests.post(
            QB_TOKEN_URL,
            headers={
                "Authorization": f"Basic {credentials}",
                "Accept": "application/json",
                "Content-Type": "application/x-www-form-urlencoded",
            },
            data={
                "grant_type":   "authorization_code",
                "code":          code,
                "redirect_uri":  cfg.redirect_uri,
            },
            timeout=15,
        )

        if resp.status_code != 200:
            return RedirectResponse(
                f"{FRONTEND_URL}/quickbooks?error={urllib.parse.quote(resp.text[:200])}"
            )

        data = resp.json()
        cfg.realm_id      = realmId
        cfg.access_token  = data["access_token"]
        cfg.refresh_token = data["refresh_token"]
        cfg.token_expiry  = datetime.utcnow() + timedelta(seconds=data.get("expires_in", 3600))
        cfg.connected_at  = datetime.utcnow()
        db.commit()

        return RedirectResponse(f"{FRONTEND_URL}/quickbooks?connected=true")

    except Exception as e:
        return RedirectResponse(
            f"{FRONTEND_URL}/quickbooks?error={urllib.parse.quote(str(e)[:200])}"
        )


# ── Disconnect ────────────────────────────────────────────────

@router.delete("/disconnect")
def disconnect(db: Session = Depends(get_db)):
    cfg = _get_config(db)
    # Try to revoke the token
    if cfg.refresh_token and cfg.client_id and cfg.client_secret:
        try:
            credentials = base64.b64encode(
                f"{cfg.client_id}:{cfg.client_secret}".encode()
            ).decode()
            requests.post(
                QB_REVOKE_URL,
                headers={
                    "Authorization": f"Basic {credentials}",
                    "Accept": "application/json",
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                data={"token": cfg.refresh_token},
                timeout=10,
            )
        except Exception:
            pass

    cfg.realm_id      = None
    cfg.access_token  = None
    cfg.refresh_token = None
    cfg.token_expiry  = None
    cfg.connected_at  = None
    db.commit()
    return {"ok": True, "message": "Disconnected from QuickBooks"}


# ── Sync: Vendors ─────────────────────────────────────────────

@router.post("/sync/vendors")
def sync_vendors(
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    cfg = _get_config(db)
    headers = _get_headers(cfg, db)
    base    = _base_url(cfg)

    vendors = db.query(Vendor).filter(
        Vendor.is_active == True,
        Vendor.company_id == company_id,
    ).all()
    results = {"pushed": 0, "updated": 0, "errors": 0, "details": []}

    # Fetch existing QB vendors for dedup (query by DisplayName)
    qb_vendors = {}
    try:
        query_url = f"{base}/query?query=SELECT * FROM Vendor MAXRESULTS 1000&minorversion=65"
        data = _qb_get(query_url, headers)
        for v in data.get("QueryResponse", {}).get("Vendor", []):
            qb_vendors[v["DisplayName"].lower()] = v["Id"]
    except Exception as e:
        results["details"].append({"error": f"Could not fetch existing QB vendors: {e}"})

    for vendor in vendors:
        display_name = vendor.name.strip()
        body = {
            "DisplayName": display_name,
        }
        if vendor.phone:
            body["PrimaryPhone"] = {"FreeFormNumber": vendor.phone}
        if vendor.email:
            body["PrimaryEmailAddr"] = {"Address": vendor.email}
        if vendor.notes:
            body["Notes"] = vendor.notes

        # Check existing sync record
        existing_sync = db.query(QuickBooksSyncRecord).filter(
            QuickBooksSyncRecord.entity_type == "vendor",
            QuickBooksSyncRecord.wms_id == vendor.id,
            QuickBooksSyncRecord.status == "success",
        ).order_by(QuickBooksSyncRecord.synced_at.desc()).first()

        try:
            if existing_sync and existing_sync.qb_id:
                # Update existing QB vendor
                body["Id"]       = existing_sync.qb_id
                body["sparse"]   = True
                # Get SyncToken (required for updates)
                v_data = _qb_get(f"{base}/vendor/{existing_sync.qb_id}?minorversion=65", headers)
                body["SyncToken"] = v_data.get("Vendor", {}).get("SyncToken", "0")
                resp = _qb_post(f"{base}/vendor?operation=update&minorversion=65", headers, {"Vendor": body})
                qb_id = resp.get("Vendor", {}).get("Id", existing_sync.qb_id)
                _log(db, "vendor", vendor.id, display_name, qb_id, "update", "success")
                results["updated"] += 1
                results["details"].append({"vendor": display_name, "action": "updated", "qb_id": qb_id})
            elif display_name.lower() in qb_vendors:
                # Already exists in QB, just record the link
                qb_id = qb_vendors[display_name.lower()]
                _log(db, "vendor", vendor.id, display_name, qb_id, "push", "success", "Linked to existing QB vendor")
                results["pushed"] += 1
                results["details"].append({"vendor": display_name, "action": "linked", "qb_id": qb_id})
            else:
                # Create new QB vendor
                resp  = _qb_post(f"{base}/vendor?minorversion=65", headers, {"Vendor": body})
                qb_id = resp.get("Vendor", {}).get("Id")
                _log(db, "vendor", vendor.id, display_name, qb_id, "push", "success")
                results["pushed"] += 1
                results["details"].append({"vendor": display_name, "action": "created", "qb_id": qb_id})
        except Exception as e:
            _log(db, "vendor", vendor.id, display_name, None, "push", "error", str(e))
            results["errors"] += 1
            results["details"].append({"vendor": display_name, "action": "error", "message": str(e)})

    cfg.last_sync_at = datetime.utcnow()
    db.commit()
    return results


# ── Sync: Items (SKUs) ────────────────────────────────────────

@router.post("/sync/items")
def sync_items(
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    cfg     = _get_config(db)
    headers = _get_headers(cfg, db)
    base    = _base_url(cfg)

    skus = db.query(SKU).filter(SKU.is_active == True, SKU.company_id == company_id).all()
    results = {"pushed": 0, "updated": 0, "errors": 0, "skipped": 0, "details": []}

    # Get default accounts from QB (needed for Item creation)
    # We'll use a NonInventory type to keep it simple (no account setup required)
    # For full Inventory items, Income/Asset/Expense accounts are required

    qb_items = {}
    try:
        query_url = f"{base}/query?query=SELECT * FROM Item MAXRESULTS 1000&minorversion=65"
        data = _qb_get(query_url, headers)
        for item in data.get("QueryResponse", {}).get("Item", []):
            qb_items[item["Name"].lower()] = item["Id"]
    except Exception as e:
        results["details"].append({"error": f"Could not fetch existing QB items: {e}"})

    for sku in skus:
        item_name = f"{sku.sku_code} - {sku.product_name}"
        # QB item names have a 100-char limit
        if len(item_name) > 100:
            item_name = item_name[:100]

        existing_sync = db.query(QuickBooksSyncRecord).filter(
            QuickBooksSyncRecord.entity_type == "item",
            QuickBooksSyncRecord.wms_id == sku.id,
            QuickBooksSyncRecord.status == "success",
        ).order_by(QuickBooksSyncRecord.synced_at.desc()).first()

        body = {
            "Name":        item_name,
            "Type":        "NonInventory",    # simpler — no account refs required
            "Description": f"{sku.product_name} | {sku.category} | Case: {sku.case_size} {sku.unit_label}",
            "Active":      True,
        }

        try:
            if existing_sync and existing_sync.qb_id:
                body["Id"]     = existing_sync.qb_id
                body["sparse"] = True
                item_data = _qb_get(f"{base}/item/{existing_sync.qb_id}?minorversion=65", headers)
                body["SyncToken"] = item_data.get("Item", {}).get("SyncToken", "0")
                resp  = _qb_post(f"{base}/item?operation=update&minorversion=65", headers, {"Item": body})
                qb_id = resp.get("Item", {}).get("Id", existing_sync.qb_id)
                _log(db, "item", sku.id, item_name, qb_id, "update", "success")
                results["updated"] += 1
                results["details"].append({"sku": sku.sku_code, "action": "updated", "qb_id": qb_id})
            elif item_name.lower() in qb_items:
                qb_id = qb_items[item_name.lower()]
                _log(db, "item", sku.id, item_name, qb_id, "push", "success", "Linked to existing QB item")
                results["pushed"] += 1
                results["details"].append({"sku": sku.sku_code, "action": "linked", "qb_id": qb_id})
            else:
                resp  = _qb_post(f"{base}/item?minorversion=65", headers, {"Item": body})
                qb_id = resp.get("Item", {}).get("Id")
                _log(db, "item", sku.id, item_name, qb_id, "push", "success")
                results["pushed"] += 1
                results["details"].append({"sku": sku.sku_code, "action": "created", "qb_id": qb_id})
        except Exception as e:
            _log(db, "item", sku.id, item_name, None, "push", "error", str(e)[:300])
            results["errors"] += 1
            results["details"].append({"sku": sku.sku_code, "action": "error", "message": str(e)[:200]})

    cfg.last_sync_at = datetime.utcnow()
    db.commit()
    return results


# ── Sync: Sales Orders (pending/picking orders) ──────────────

@router.post("/sync/sales-orders")
def sync_sales_orders(
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    """
    Push WMS orders (Pending/Picking) to QB as Sales Orders.
    This is the pre-dispatch document used for pick list printing in QB.
    Orders already pushed (by order_number in sync logs) are skipped.
    """
    cfg     = _get_config(db)
    headers = _get_headers(cfg, db)
    base    = _base_url(cfg)

    orders = db.query(Order).filter(
        Order.status.in_(["Pending", "Picking"]),
        Order.company_id == company_id,
    ).all()

    synced_order_ids = {
        r.wms_id for r in db.query(QuickBooksSyncRecord).filter(
            QuickBooksSyncRecord.entity_type == "sales_order",
            QuickBooksSyncRecord.status == "success",
        ).all()
    }
    orders = [o for o in orders if o.id not in synced_order_ids]

    results = {"pushed": 0, "errors": 0, "skipped": 0, "details": []}

    customer_cache = {}

    def _get_or_create_customer(store_name: str):
        if store_name in customer_cache:
            return customer_cache[store_name]
        encoded = urllib.parse.quote(store_name.replace("'", "\\'"))
        try:
            q = _qb_get(
                f"{base}/query?query=SELECT * FROM Customer WHERE DisplayName='{encoded}'&minorversion=65",
                headers
            )
            customers = q.get("QueryResponse", {}).get("Customer", [])
            if customers:
                cid = customers[0]["Id"]
                customer_cache[store_name] = cid
                return cid
        except Exception:
            pass
        try:
            resp = _qb_post(
                f"{base}/customer?minorversion=65",
                headers,
                {"Customer": {"DisplayName": store_name[:100]}}
            )
            cid = resp.get("Customer", {}).get("Id")
            customer_cache[store_name] = cid
            return cid
        except Exception:
            return None

    # Cache: sku_id → QB item id
    item_id_cache = {}
    for rec in db.query(QuickBooksSyncRecord).filter(
        QuickBooksSyncRecord.entity_type == "item",
        QuickBooksSyncRecord.status == "success",
    ).all():
        if rec.wms_id:
            item_id_cache[rec.wms_id] = rec.qb_id

    for order in orders:
        if not order.items:
            results["skipped"] += 1
            continue

        customer_id = _get_or_create_customer(order.store_name)
        if not customer_id:
            _log(db, "sales_order", order.id, order.order_number, None, "push", "error",
                 f"Could not create/find QB customer for '{order.store_name}'")
            results["errors"] += 1
            continue

        lines = []
        for item in order.items:
            qty = item.cases_requested
            if qty <= 0:
                continue
            unit_price = float(item.sku.selling_price or item.sku.cost_price or 0) if item.sku else 0.0
            line = {
                "DetailType": "SalesItemLineDetail",
                "Amount": round(qty * unit_price, 2),
                "Description": item.sku.product_name if item.sku else f"SKU #{item.sku_id}",
                "SalesItemLineDetail": {
                    "Qty": qty,
                    "UnitPrice": unit_price,
                },
            }
            qb_item_id = item_id_cache.get(item.sku_id)
            if qb_item_id:
                line["SalesItemLineDetail"]["ItemRef"] = {"value": qb_item_id}
            lines.append(line)

        if not lines:
            results["skipped"] += 1
            continue

        so_body = {
            "CustomerRef": {"value": customer_id},
            "DocNumber":   order.order_number,
            "TxnDate":     order.order_date.isoformat() if order.order_date else datetime.utcnow().date().isoformat(),
            "PrivateNote": order.notes or "",
            "Line":        lines,
        }

        try:
            resp  = _qb_post(f"{base}/salesorder?minorversion=65", headers, {"SalesOrder": so_body})
            qb_id = resp.get("SalesOrder", {}).get("Id")
            _log(db, "sales_order", order.id, order.order_number, qb_id, "push", "success")
            results["pushed"] += 1
            results["details"].append({"order": order.order_number, "action": "created", "qb_id": qb_id})
        except Exception as e:
            _log(db, "sales_order", order.id, order.order_number, None, "push", "error", str(e)[:300])
            results["errors"] += 1
            results["details"].append({"order": order.order_number, "action": "error", "message": str(e)[:200]})

    cfg.last_sync_at = datetime.utcnow()
    db.commit()
    return results


# ── Sync: Invoices (dispatched orders) ───────────────────────

@router.post("/sync/invoices")
def sync_invoices(
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    cfg     = _get_config(db)
    headers = _get_headers(cfg, db)
    base    = _base_url(cfg)

    # Only sync dispatched or packed orders that haven't been synced yet
    dispatched_statuses = ("Dispatched", "Done")
    orders = db.query(Order).filter(
        Order.status.in_(dispatched_statuses),
        Order.company_id == company_id,
    ).all()

    # Filter to only unsynced orders
    synced_order_ids = {
        r.wms_id for r in db.query(QuickBooksSyncRecord).filter(
            QuickBooksSyncRecord.entity_type == "invoice",
            QuickBooksSyncRecord.status == "success",
        ).all()
    }
    orders = [o for o in orders if o.id not in synced_order_ids]

    results = {"pushed": 0, "errors": 0, "skipped": 0, "details": []}

    # Cache: store_name → QB customer id
    customer_cache = {}

    def _get_or_create_customer(store_name: str) -> str:
        if store_name in customer_cache:
            return customer_cache[store_name]
        # Search QB
        encoded = urllib.parse.quote(store_name.replace("'", "\\'"))
        try:
            q = _qb_get(
                f"{base}/query?query=SELECT * FROM Customer WHERE DisplayName='{encoded}'&minorversion=65",
                headers
            )
            customers = q.get("QueryResponse", {}).get("Customer", [])
            if customers:
                cid = customers[0]["Id"]
                customer_cache[store_name] = cid
                return cid
        except Exception:
            pass
        # Create customer
        try:
            resp = _qb_post(
                f"{base}/customer?minorversion=65",
                headers,
                {"Customer": {"DisplayName": store_name[:100]}}
            )
            cid = resp.get("Customer", {}).get("Id")
            customer_cache[store_name] = cid
            return cid
        except Exception:
            return None

    # Cache: sku_id → QB item id (from sync records)
    item_id_cache = {}
    for rec in db.query(QuickBooksSyncRecord).filter(
        QuickBooksSyncRecord.entity_type == "item",
        QuickBooksSyncRecord.status == "success",
    ).all():
        if rec.wms_id:
            item_id_cache[rec.wms_id] = rec.qb_id

    for order in orders:
        if not order.items:
            results["skipped"] += 1
            continue

        customer_id = _get_or_create_customer(order.store_name)
        if not customer_id:
            _log(db, "invoice", order.id, order.order_number, None, "push", "error",
                 f"Could not create/find QB customer for '{order.store_name}'")
            results["errors"] += 1
            continue

        # Build line items
        lines = []
        for item in order.items:
            qb_item_id = item_id_cache.get(item.sku_id)
            qty = item.cases_fulfilled or item.cases_requested
            if qty <= 0:
                continue

            unit_price = float(item.sku.cost_price) if item.sku and item.sku.cost_price else 0.0
            line = {
                "DetailType": "SalesItemLineDetail",
                "Amount":     round(qty * unit_price, 2),
                "Description": item.sku.product_name if item.sku else f"SKU #{item.sku_id}",
                "SalesItemLineDetail": {
                    "Qty":       qty,
                    "UnitPrice": unit_price,
                },
            }
            if qb_item_id:
                line["SalesItemLineDetail"]["ItemRef"] = {"value": qb_item_id}

            lines.append(line)

        if not lines:
            results["skipped"] += 1
            continue

        invoice_body = {
            "CustomerRef":    {"value": customer_id},
            "DocNumber":      order.order_number,
            "TxnDate":        order.order_date.isoformat() if order.order_date else datetime.utcnow().date().isoformat(),
            "PrivateNote":    order.notes or "",
            "Line":           lines,
        }
        if order.dispatch_date:
            invoice_body["ShipDate"] = order.dispatch_date.isoformat()

        try:
            resp  = _qb_post(f"{base}/invoice?minorversion=65", headers, {"Invoice": invoice_body})
            qb_id = resp.get("Invoice", {}).get("Id")
            _log(db, "invoice", order.id, order.order_number, qb_id, "push", "success")
            results["pushed"] += 1
            results["details"].append({"order": order.order_number, "action": "created", "qb_id": qb_id})
        except Exception as e:
            _log(db, "invoice", order.id, order.order_number, None, "push", "error", str(e)[:300])
            results["errors"] += 1
            results["details"].append({"order": order.order_number, "action": "error", "message": str(e)[:200]})

    cfg.last_sync_at = datetime.utcnow()
    db.commit()
    return results


# ── Sync: Pull Customers from QB ──────────────────────────────

@router.post("/sync/customers")
def sync_customers(
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    cfg     = _get_config(db)
    headers = _get_headers(cfg, db)
    base    = _base_url(cfg)

    try:
        data = _qb_get(
            f"{base}/query?query=SELECT * FROM Customer WHERE Active=true MAXRESULTS 500&minorversion=65",
            headers
        )
        customers = data.get("QueryResponse", {}).get("Customer", [])
        result_list = [
            {
                "qb_id":   c["Id"],
                "name":    c.get("DisplayName", ""),
                "email":   c.get("PrimaryEmailAddr", {}).get("Address", ""),
                "phone":   c.get("PrimaryPhone",     {}).get("FreeFormNumber", ""),
                "balance": c.get("Balance", 0),
            }
            for c in customers
        ]
        return {"count": len(result_list), "customers": result_list}
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


# ── Sync: All ─────────────────────────────────────────────────

@router.post("/sync/all")
def sync_all(
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    results = {}
    try:
        results["vendors"]      = sync_vendors(db=db, company_id=company_id)
    except Exception as e:
        results["vendors"]      = {"error": str(e)}
    try:
        results["items"]        = sync_items(db=db, company_id=company_id)
    except Exception as e:
        results["items"]        = {"error": str(e)}
    try:
        results["sales_orders"] = sync_sales_orders(db=db, company_id=company_id)
    except Exception as e:
        results["sales_orders"] = {"error": str(e)}
    try:
        results["invoices"]     = sync_invoices(db=db, company_id=company_id)
    except Exception as e:
        results["invoices"]     = {"error": str(e)}
    return results


# ── Import: QB Vendors → WMS Vendors ─────────────────────────

@router.post("/import/vendors")
def import_vendors_from_qb(
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    """Pull active QB Vendors and create them in WMS (skip existing by name match)."""
    cfg     = _get_config(db)
    headers = _get_headers(cfg, db)
    base    = _base_url(cfg)

    data = _qb_get(
        f"{base}/query?query=SELECT * FROM Vendor WHERE Active=true MAXRESULTS 1000&minorversion=65",
        headers,
    )
    qb_vendors = data.get("QueryResponse", {}).get("Vendor", [])

    # Build lookup of existing WMS vendor names (lower-case)
    existing = {v.name.lower(): v for v in db.query(Vendor).filter(Vendor.company_id == company_id).all()}

    results = {"imported": 0, "skipped": 0, "errors": 0, "details": []}

    for qv in qb_vendors:
        name = qv.get("DisplayName", "").strip()
        if not name:
            continue

        if name.lower() in existing:
            wms_vendor = existing[name.lower()]
            _log(db, "vendor", wms_vendor.id, name, qv["Id"], "pull", "success", "Already exists — linked")
            results["skipped"] += 1
            results["details"].append({"vendor": name, "action": "skipped", "reason": "Already exists"})
            continue

        try:
            vendor = Vendor(
                name=name,
                email=qv.get("PrimaryEmailAddr", {}).get("Address", "") or "",
                phone=qv.get("PrimaryPhone",     {}).get("FreeFormNumber", "") or "",
                notes=qv.get("Notes", "") or "",
                is_active=True,
                company_id=company_id,
            )
            db.add(vendor)
            db.flush()
            existing[name.lower()] = vendor
            _log(db, "vendor", vendor.id, name, qv["Id"], "pull", "success")
            results["imported"] += 1
            results["details"].append({"vendor": name, "action": "imported", "qb_id": qv["Id"]})
        except Exception as e:
            results["errors"] += 1
            results["details"].append({"vendor": name, "action": "error", "message": str(e)[:200]})

    db.commit()
    cfg.last_sync_at = datetime.utcnow()
    db.commit()
    return results


# ── Import: QB Items → WMS SKUs ───────────────────────────────

@router.post("/import/items")
def import_items_from_qb(
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    """Pull active QB Items (Inventory + NonInventory) and create them as WMS SKUs."""
    cfg     = _get_config(db)
    headers = _get_headers(cfg, db)
    base    = _base_url(cfg)

    data = _qb_get(
        f"{base}/query?query=SELECT * FROM Item WHERE Active=true MAXRESULTS 1000&minorversion=65",
        headers,
    )
    qb_items = data.get("QueryResponse", {}).get("Item", [])

    # Filter to product types only
    PRODUCT_TYPES = {"Inventory", "NonInventory"}
    qb_items = [i for i in qb_items if i.get("Type") in PRODUCT_TYPES]

    # Build lookups of existing WMS SKUs
    all_skus        = db.query(SKU).filter(SKU.company_id == company_id).all()
    existing_codes  = {s.sku_code.lower() for s in all_skus}
    existing_names  = {s.product_name.lower() for s in all_skus}

    results = {"imported": 0, "skipped": 0, "errors": 0, "details": []}

    for qi in qb_items:
        qb_name = qi.get("Name", "").strip()
        if not qb_name:
            continue

        # Use Description as product_name if available, else fall back to Name
        product_name = (qi.get("Description") or qb_name).strip()[:200]

        if product_name.lower() in existing_names:
            results["skipped"] += 1
            results["details"].append({"item": qb_name, "action": "skipped", "reason": "Name already in WMS"})
            continue

        # Generate a sku_code from QB item name
        raw_code   = re.sub(r'[^A-Za-z0-9]', '-', qb_name).upper().strip('-')
        raw_code   = re.sub(r'-{2,}', '-', raw_code)[:30]
        sku_code   = raw_code
        counter    = 1
        while sku_code.lower() in existing_codes:
            sku_code = f"{raw_code[:27]}-{counter:02d}"
            counter += 1

        # Determine category — try QB's FullyQualifiedName prefix
        fqn      = qi.get("FullyQualifiedName", qb_name)
        category = fqn.split(":")[0].strip() if ":" in fqn else "Imported from QB"

        try:
            sku = SKU(
                sku_code    = sku_code,
                product_name= product_name,
                category    = category,
                case_size   = 1,          # QB has no case-size concept — update in WMS after import
                unit_label  = "units",
                reorder_point = 0,
                reorder_qty   = 0,
                max_stock     = 0,
                is_active   = qi.get("Active", True),
                company_id  = company_id,
            )
            db.add(sku)
            db.flush()
            existing_codes.add(sku_code.lower())
            existing_names.add(product_name.lower())
            _log(db, "item", sku.id, qb_name, qi["Id"], "pull", "success")
            results["imported"] += 1
            results["details"].append({"item": qb_name, "sku_code": sku_code, "action": "imported", "qb_id": qi["Id"]})
        except Exception as e:
            results["errors"] += 1
            results["details"].append({"item": qb_name, "action": "error", "message": str(e)[:200]})

    db.commit()
    cfg.last_sync_at = datetime.utcnow()
    db.commit()
    return results


# ── Sync Logs ─────────────────────────────────────────────────

@router.get("/sync/logs")
def get_sync_logs(limit: int = 100, db: Session = Depends(get_db)):
    logs = db.query(QuickBooksSyncRecord).order_by(
        QuickBooksSyncRecord.synced_at.desc()
    ).limit(limit).all()
    return [
        {
            "id":          l.id,
            "entity_type": l.entity_type,
            "wms_ref":     l.wms_ref,
            "qb_id":       l.qb_id,
            "action":      l.action,
            "status":      l.status,
            "message":     l.message,
            "synced_at":   l.synced_at.isoformat(),
        }
        for l in logs
    ]
