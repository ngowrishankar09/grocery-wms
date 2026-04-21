from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
import os, pathlib

from database import engine, SessionLocal
from models import (
    create_tables, Warehouse, User, Company, CompanyProfile,
    WarehouseTask, SupplierASN, CreditNote, VendorBill, Quote, AuditLog,
    SKU, Vendor, Inventory, Batch, Customer,
)
from routers import skus, vendors, receiving, orders, inventory, transfers, forecasting, dashboard, upload, settings, dispatch
from routers import reports, stock_take, notifications, dispatch_board, spreadsheet, quickbooks, bin_locations, purchase_orders, labels, customers, returns, invoices
from routers.drivers import router as drivers_router, runs_router
from routers.auth import router as auth_router
from routers.users import router as users_router
from routers.superadmin import router as superadmin_router
from routers.price_lists import router as price_lists_router
from routers.email import router as email_router
from routers.portal import router as portal_router
from routers.warehouse_tasks import router as warehouse_tasks_router
from routers.traceability import router as traceability_router
from routers.asn import router as asn_router
from routers.order_check import router as order_check_router
from routers.kpi import router as kpi_router
from routers.credit_notes import router as credit_notes_router
from routers.vendor_bills import router as vendor_bills_router
from routers.quotes import router as quotes_router
from routers.audit_log import router as audit_log_router
from security import hash_password, verify_password

create_tables(engine)

# ── Column migrations: add new columns to existing tables ──────
# Rules for PostgreSQL compatibility:
#   - Use BOOLEAN DEFAULT FALSE / TRUE  (not 0/1)
#   - Use TIMESTAMP instead of DATETIME
#   - ADD COLUMN IF NOT EXISTS avoids errors on re-run
def _migrate():
    is_postgres = "postgresql" in str(engine.url)
    migrations = [
        ("invoices", "payment_terms",    "VARCHAR"),
        ("invoices", "discount_amount",  "FLOAT DEFAULT 0.0"),
        ("invoices", "previous_balance", "FLOAT DEFAULT 0.0"),
        ("invoices", "grand_total",      "FLOAT DEFAULT 0.0"),
        ("batches",   "lot_number",    "VARCHAR"),
        ("customers", "price_list_id", "INTEGER"),
        ("skus",      "image_url",     "VARCHAR"),
        ("customers", "latitude",      "REAL"),
        ("customers", "longitude",     "REAL"),
        ("company_profile", "smtp_host",     "VARCHAR"),
        ("company_profile", "smtp_port",     "INTEGER DEFAULT 587"),
        ("company_profile", "smtp_user",     "VARCHAR"),
        ("company_profile", "smtp_password", "VARCHAR"),
        ("company_profile", "smtp_from",     "VARCHAR"),
        ("customers", "portal_enabled",  "BOOLEAN DEFAULT FALSE"),
        ("customers", "portal_password", "VARCHAR"),
        ("company_profile", "portal_show_price",    "BOOLEAN DEFAULT TRUE"),
        ("company_profile", "portal_show_stock",    "BOOLEAN DEFAULT TRUE"),
        ("company_profile", "portal_show_invoices", "BOOLEAN DEFAULT TRUE"),
        ("skus", "selling_price", "FLOAT"),
        ("orders", "picking_queued",     "BOOLEAN DEFAULT FALSE"),
        ("orders", "picking_started_at", "TIMESTAMP"),
        ("orders", "picking_ended_at",   "TIMESTAMP"),
        ("skus",   "show_goods_date_on_picking", "BOOLEAN DEFAULT FALSE"),
        ("order_items", "cases_picked",         "INTEGER DEFAULT 0"),
        ("skus",        "require_expiry_entry",  "BOOLEAN DEFAULT FALSE"),
        ("order_items", "expiry_date_entered",   "TEXT"),
        ("invoice_items", "expiry_date",         "TEXT"),
        ("company_profile", "invoice_template",  "VARCHAR DEFAULT 'classic'"),
        ("company_profile", "invoice_note",       "TEXT"),
        ("company_profile", "logo_base64",            "TEXT"),
        ("company_profile", "invoice_number_format",  "VARCHAR DEFAULT 'date-daily'"),
        ("company_profile", "invoice_number_prefix",  "VARCHAR DEFAULT 'INV'"),
        ("company_profile", "invoice_number_padding", "INTEGER DEFAULT 3"),
        ("company_profile", "invoice_counter",        "INTEGER DEFAULT 0"),
        ("company_profile", "invoice_counter_period", "VARCHAR"),
        ("company_profile", "fax",                    "VARCHAR"),
        ("company_profile", "rep_name",           "VARCHAR"),
        ("company_profile", "ship_via",           "VARCHAR"),
        ("company_profile", "catalog_url",        "VARCHAR"),
        ("company_profile", "show_qr_code",       "BOOLEAN DEFAULT FALSE"),
        ("company_profile", "invoice_title",      "VARCHAR DEFAULT 'Invoice'"),
        ("invoices",        "num_pallets",         "INTEGER"),
        # Multi-tenancy company_id columns
        ("users",                   "company_id", "INTEGER"),
        ("warehouses",              "company_id", "INTEGER"),
        ("categories",              "company_id", "INTEGER"),
        ("skus",                    "company_id", "INTEGER"),
        ("vendors",                 "company_id", "INTEGER"),
        ("batches",                 "company_id", "INTEGER"),
        ("inventory",               "company_id", "INTEGER"),
        ("bin_locations",           "company_id", "INTEGER"),
        ("inventory_adjustments",   "company_id", "INTEGER"),
        ("price_lists",             "company_id", "INTEGER"),
        ("customers",               "company_id", "INTEGER"),
        ("orders",                  "company_id", "INTEGER"),
        ("dispatch_records",        "company_id", "INTEGER"),
        ("transfers",               "company_id", "INTEGER"),
        ("invoices",                "company_id", "INTEGER"),
        ("drivers",                 "company_id", "INTEGER"),
        ("monthly_consumption",     "company_id", "INTEGER"),
        ("spreadsheet_workbooks",   "company_id", "INTEGER"),
        ("company_profile",         "company_id", "INTEGER"),
        ("stock_take_sessions",     "company_id", "INTEGER"),
        ("customer_returns",        "company_id", "INTEGER"),
        ("purchase_orders",         "company_id", "INTEGER"),
        ("delivery_runs",           "company_id", "INTEGER"),
        ("notifications",           "company_id", "INTEGER"),
        ("quickbooks_config",       "company_id", "INTEGER"),
        # Company approval workflow
        ("companies", "status", "VARCHAR DEFAULT 'active'"),
        # Stock type tracking
        ("inventory", "stock_type", "VARCHAR DEFAULT 'unrestricted'"),
        # Customer credit management
        ("customers", "credit_limit",  "FLOAT"),
        ("customers", "credit_hold",   "BOOLEAN DEFAULT FALSE"),
        ("customers", "payment_terms", "VARCHAR"),
        # Batch traceability + recall + landed cost
        ("batches", "po_item_id",           "INTEGER"),
        ("batches", "is_recalled",          "BOOLEAN DEFAULT FALSE"),
        ("batches", "recall_reason",        "VARCHAR"),
        ("batches", "recalled_at",          "TIMESTAMP"),
        ("batches", "landed_cost_per_case", "FLOAT"),
        # SKU floor price
        ("skus", "floor_price", "FLOAT"),
        # PO landed costs + currency
        ("purchase_orders", "freight_cost",          "FLOAT DEFAULT 0.0"),
        ("purchase_orders", "duty_cost",             "FLOAT DEFAULT 0.0"),
        ("purchase_orders", "other_cost",            "FLOAT DEFAULT 0.0"),
        ("purchase_orders", "landed_cost_allocated", "BOOLEAN DEFAULT FALSE"),
        ("purchase_orders", "currency",              "VARCHAR DEFAULT 'USD'"),
        ("purchase_orders", "exchange_rate",         "FLOAT DEFAULT 1.0"),
        # PO item landed cost
        ("purchase_order_items", "landed_cost_per_case", "FLOAT"),
        ("purchase_order_items", "landed_unit_cost",     "FLOAT"),
        # Order approval + promised date
        ("orders", "approval_status", "VARCHAR"),
        ("orders", "approval_note",   "TEXT"),
        ("orders", "approved_by",     "VARCHAR"),
        ("orders", "approved_at",     "TIMESTAMP"),
        ("orders", "promised_date",   "DATE"),
        # Invoice currency
        ("invoices", "currency",       "VARCHAR DEFAULT 'USD'"),
        ("invoices", "exchange_rate",  "FLOAT DEFAULT 1.0"),
        # Company base currency
        ("company_profile", "base_currency", "VARCHAR DEFAULT 'USD'"),
        # Customer & line-item discounts
        ("customers",     "discount_pct",       "FLOAT DEFAULT 0.0"),
        ("invoice_items", "discount_pct",       "FLOAT DEFAULT 0.0"),
        ("invoice_items", "discount_excluded",  "BOOLEAN DEFAULT FALSE"),
        ("invoice_items", "discount_amount",    "FLOAT DEFAULT 0.0"),
        # Credit Notes
        ("credit_notes",      "company_id",    "INTEGER"),
        # Vendor Bills AP
        ("vendor_bills",      "company_id",    "INTEGER"),
        # Quotes
        ("quotes",            "company_id",    "INTEGER"),
        # Audit Log
        ("audit_log",         "company_id",    "INTEGER"),
    ]
    # Use IF NOT EXISTS for PostgreSQL (idempotent); fall back to try/except for SQLite
    add_col = "ADD COLUMN IF NOT EXISTS" if is_postgres else "ADD COLUMN"
    with engine.connect() as conn:
        for table, col, type_def in migrations:
            try:
                conn.execute(text(f"ALTER TABLE {table} {add_col} {col} {type_def}"))
                conn.commit()
            except Exception:
                conn.rollback()  # SQLite: reset on duplicate column error

_migrate()

def _seed_company():
    """Create default company (id=1) and backfill company_id=1 for all existing rows."""
    db = SessionLocal()
    try:
        company = db.query(Company).filter(Company.id == 1).first()
        if not company:
            company = Company(id=1, name="Default Company", slug="default")
            db.add(company)
            db.commit()
        # Backfill all tables
        tables = [
            "users", "warehouses", "categories", "skus", "vendors", "batches",
            "inventory", "bin_locations", "inventory_adjustments", "price_lists",
            "customers", "orders", "dispatch_records", "transfers", "invoices",
            "drivers", "monthly_consumption", "spreadsheet_workbooks",
            "company_profile", "customer_returns", "purchase_orders",
            "delivery_runs", "quickbooks_config",
        ]
        with engine.connect() as conn:
            for tbl in tables:
                try:
                    conn.execute(text(f"UPDATE {tbl} SET company_id = 1 WHERE company_id IS NULL"))
                    conn.commit()
                except Exception:
                    pass
    finally:
        db.close()

_seed_company()

def _seed_superadmin():
    """Create or update superadmin credentials from environment variables.
    Set SUPERADMIN_USERNAME and SUPERADMIN_PASSWORD in Render environment.
    """
    sa_username = os.environ.get("SUPERADMIN_USERNAME", "superadmin")
    sa_password = os.environ.get("SUPERADMIN_PASSWORD", "SuperAdmin@2026")
    db = SessionLocal()
    try:
        existing = db.query(User).filter(User.role == "superadmin").first()
        if not existing:
            db.add(User(
                username=sa_username,
                hashed_password=hash_password(sa_password),
                full_name="Super Admin",
                email="superadmin@wms.local",
                role="superadmin",
                company_id=None,
                must_change_password=False,
            ))
            db.commit()
        else:
            # Update username/password if env vars differ from stored values
            changed = False
            if existing.username != sa_username:
                existing.username = sa_username
                changed = True
            if not verify_password(sa_password, existing.hashed_password):
                existing.hashed_password = hash_password(sa_password)
                changed = True
            if changed:
                db.commit()
    finally:
        db.close()

_seed_superadmin()

# Seed default warehouses if not present
def seed_warehouses():
    db = SessionLocal()
    try:
        if db.query(Warehouse).count() == 0:
            db.add(Warehouse(code="WH1", name="Main Warehouse", is_primary=True,  address="Primary Operations"))
            db.add(Warehouse(code="WH2", name="Backup Warehouse", is_primary=False, address="Overflow / Receiving"))
            db.commit()
    finally:
        db.close()

seed_warehouses()

def seed_admin():
    """Ensure default demo users exist for company_id=1.
    Always resets password + active status so login never breaks after redeploy.
    """
    db = SessionLocal()
    try:
        demo_users = [
            dict(username="admin",     password="admin123",     full_name="System Admin",       email="admin@wms.local",   role="admin"),
            dict(username="manager",   password="manager123",   full_name="Warehouse Manager",  email="manager@wms.local", role="manager"),
            dict(username="warehouse", password="warehouse123", full_name="Warehouse Staff",     email="staff@wms.local",   role="warehouse"),
        ]
        for u in demo_users:
            existing = db.query(User).filter(User.username == u["username"], User.company_id == 1).first()
            if not existing:
                db.add(User(
                    username=u["username"],
                    hashed_password=hash_password(u["password"]),
                    full_name=u["full_name"],
                    email=u["email"],
                    role=u["role"],
                    company_id=1,
                    is_active=True,
                    must_change_password=False,
                ))
            else:
                # Always keep demo passwords correct and account active
                existing.hashed_password = hash_password(u["password"])
                existing.is_active = True
                existing.must_change_password = False
        db.commit()
    finally:
        db.close()

seed_admin()


def seed_demo_data():
    """Populate company 1 with demo SKUs, vendors, inventory, and customers
    if the company has no SKUs yet (safe to run on every deploy).
    """
    from datetime import date, timedelta
    db = SessionLocal()
    try:
        if db.query(SKU).filter(SKU.company_id == 1).count() > 0:
            return  # already seeded

        # ── Vendors ──────────────────────────────────────────────
        vendors_data = [
            dict(name="GAZAB Foods Pty Ltd",  contact_person="Raj Kumar",    phone="+61 2 9000 1001", company_id=1),
            dict(name="Kohinoor Distributors", contact_person="Priya Sharma", phone="+61 2 9000 1002", company_id=1),
            dict(name="Royal Grain Co.",        contact_person="James Chen",   phone="+61 2 9000 1003", company_id=1),
        ]
        vendor_objs = []
        for v in vendors_data:
            obj = Vendor(**v)
            db.add(obj)
            vendor_objs.append(obj)
        db.flush()
        v1, v2, v3 = vendor_objs[0].id, vendor_objs[1].id, vendor_objs[2].id

        # ── SKUs ──────────────────────────────────────────────────
        skus_data = [
            dict(sku_code="GDLC2",   product_name="GAZAB CHANA DAL 20x2LB",         category="Dals & Lentils",  case_size=20, unit_price=40.00, vendor_id=v1, reorder_point=10, reorder_qty=40, avg_shelf_life_days=730),
            dict(sku_code="GBPP1",   product_name="GAZAB BLACK PEPPER POWDER 20x100G",category="Spices",          case_size=20, unit_price=35.00, vendor_id=v1, reorder_point=8,  reorder_qty=32, avg_shelf_life_days=365),
            dict(sku_code="GGMASA",  product_name="GAZAB GARAM MASALA 20x100G",       category="Spices",          case_size=20, unit_price=32.00, vendor_id=v1, reorder_point=8,  reorder_qty=32, avg_shelf_life_days=365),
            dict(sku_code="GTUR5",   product_name="GAZAB TURMERIC POWDER 20x200G",    category="Spices",          case_size=20, unit_price=28.00, vendor_id=v1, reorder_point=10, reorder_qty=40, avg_shelf_life_days=365),
            dict(sku_code="GCGH6",   product_name="GAZAB COW GHEE 6x1600G",           category="Ghee & Oil",      case_size=6,  unit_price=95.00, vendor_id=v1, reorder_point=5,  reorder_qty=20, avg_shelf_life_days=540),
            dict(sku_code="GALM20",  product_name="GAZAB ALMOND 20x200G",             category="Nuts & Dry Fruits",case_size=20,unit_price=85.00, vendor_id=v1, reorder_point=5,  reorder_qty=20, avg_shelf_life_days=365),
            dict(sku_code="KBAS5",   product_name="KOHINOOR BASMATI RICE 10x5KG",     category="Rice",            case_size=10, unit_price=120.00,vendor_id=v2, reorder_point=15, reorder_qty=60, avg_shelf_life_days=0),
            dict(sku_code="KBAS25",  product_name="KOHINOOR BASMATI RICE 2x25KG",     category="Rice",            case_size=2,  unit_price=110.00,vendor_id=v2, reorder_point=10, reorder_qty=40, avg_shelf_life_days=0),
            dict(sku_code="RBAS10",  product_name="ROYAL BASMATI RICE 4x10LB",        category="Rice",            case_size=4,  unit_price=75.00, vendor_id=v3, reorder_point=12, reorder_qty=48, avg_shelf_life_days=0),
            dict(sku_code="RTOR10",  product_name="ROYAL TOOR DAL 10x2LB",            category="Dals & Lentils",  case_size=10, unit_price=45.00, vendor_id=v3, reorder_point=10, reorder_qty=40, avg_shelf_life_days=730),
            dict(sku_code="GBESEN",  product_name="GAZAB BESAN 20x1KG",              category="Flour & Grains",  case_size=20, unit_price=30.00, vendor_id=v1, reorder_point=8,  reorder_qty=32, avg_shelf_life_days=365),
            dict(sku_code="GATTA",   product_name="GAZAB WHEAT ATTA 10x5KG",         category="Flour & Grains",  case_size=10, unit_price=55.00, vendor_id=v1, reorder_point=10, reorder_qty=40, avg_shelf_life_days=180),
            dict(sku_code="GFROZB",  product_name="GAZAB FROZEN BHINDI 12x400G",     category="Frozen",          case_size=12, unit_price=38.00, vendor_id=v1, reorder_point=6,  reorder_qty=24, avg_shelf_life_days=365),
            dict(sku_code="GFROZP",  product_name="GAZAB FROZEN PARATHA 12x5PCS",    category="Frozen",          case_size=12, unit_price=42.00, vendor_id=v1, reorder_point=6,  reorder_qty=24, avg_shelf_life_days=365),
            dict(sku_code="GMUSTAR", product_name="GAZAB MUSTARD SEEDS 20x100G",     category="Spices",          case_size=20, unit_price=22.00, vendor_id=v1, reorder_point=8,  reorder_qty=32, avg_shelf_life_days=730),
        ]
        sku_objs = []
        import re as _re
        for s in skus_data:
            sku = SKU(
                sku_code=s["sku_code"],
                product_name=s["product_name"],
                category=s["category"],
                case_size=s["case_size"],
                selling_price=s.get("unit_price", 0),
                vendor_id=s["vendor_id"],
                reorder_point=s.get("reorder_point", 5),
                reorder_qty=s.get("reorder_qty", 20),
                avg_shelf_life_days=s.get("avg_shelf_life_days", 0),
                company_id=1,
            )
            db.add(sku)
            sku_objs.append(sku)
        db.flush()

        # ── Ensure WH1/WH2 exist ─────────────────────────────────
        wh1 = db.query(Warehouse).filter(Warehouse.code == "WH1", Warehouse.company_id == 1).first()
        wh2 = db.query(Warehouse).filter(Warehouse.code == "WH2", Warehouse.company_id == 1).first()
        if not wh1:
            wh1 = Warehouse(code="WH1", name="Main Warehouse",   is_primary=True,  address="Primary Operations", company_id=1)
            db.add(wh1)
        if not wh2:
            wh2 = Warehouse(code="WH2", name="Cold Store / Overflow", is_primary=False, address="Overflow / Receiving", company_id=1)
            db.add(wh2)
        db.flush()

        # ── Inventory + Batches ───────────────────────────────────
        import random as _random
        _random.seed(42)
        today = date.today()
        for sku in sku_objs:
            for wh_code, wh_id in [("WH1", wh1.code), ("WH2", wh2.code)]:
                cases = _random.randint(8, 50)
                inv = Inventory(sku_id=sku.id, warehouse=wh_code, cases_on_hand=cases, company_id=1)
                db.add(inv)
                db.flush()
                received = today - timedelta(days=_random.randint(10, 60))
                expiry = None
                has_exp = sku.avg_shelf_life_days and sku.avg_shelf_life_days > 0
                if has_exp:
                    expiry = received + timedelta(days=sku.avg_shelf_life_days + _random.randint(-20, 20))
                batch = Batch(
                    batch_code=f"BATCH-{sku.sku_code}-{received.strftime('%Y%m%d')}",
                    sku_id=sku.id,
                    cases_received=cases,
                    cases_remaining=cases,
                    warehouse=wh_code,
                    received_date=received,
                    expiry_date=expiry,
                    has_expiry=bool(has_exp),
                    supplier_ref=f"PO-DEMO-{_random.randint(1000,9999)}",
                    company_id=1,
                )
                db.add(batch)

        # ── Customers ─────────────────────────────────────────────
        customers_data = [
            dict(name="Metro Supermarket",    contact_person="John Smith",    phone="+1 555 100 2000", email="orders@metro.com",    address="123 Main St, Sydney",  discount_pct=5.0),
            dict(name="Fresh Market Grocery", contact_person="Sarah Lee",     phone="+1 555 100 2001", email="orders@freshmarket.com", address="45 George St, Melbourne", discount_pct=10.0),
            dict(name="Indo-Asian Foods",     contact_person="Arjun Patel",   phone="+1 555 100 2002", email="arjun@indoasian.com",   address="78 Bridge Rd, Brisbane",  discount_pct=0.0),
            dict(name="Spice World Retail",   contact_person="Maria Garcia",  phone="+1 555 100 2003", email="maria@spiceworld.com",  address="22 Pacific Hwy, Perth",   discount_pct=7.5),
            dict(name="Global Grocery Hub",   contact_person="Michael Wong",  phone="+1 555 100 2004", email="mwong@globalgrocery.com", address="99 Queen St, Adelaide", discount_pct=0.0),
        ]
        for c in customers_data:
            db.add(Customer(
                name=c["name"],
                contact_person=c.get("contact_person"),
                phone=c.get("phone"),
                email=c.get("email"),
                address=c.get("address"),
                discount_pct=c.get("discount_pct", 0.0),
                company_id=1,
                is_active=True,
            ))

        # ── Company Profile ───────────────────────────────────────
        profile = db.query(CompanyProfile).filter(CompanyProfile.company_id == 1).first()
        if not profile:
            db.add(CompanyProfile(
                company_id=1,
                name="RapidDock WMS Demo",
                address="1 Warehouse Drive, Sydney NSW 2000",
                phone="+61 2 9000 0001",
                email="admin@rapiddockwms.com",
                base_currency="AUD",
            ))

        # ── 6 months consumption history ──────────────────────────
        # Realistic monthly dispatch volumes aligned to the 15 SKUs (same order as skus_data)
        # Format: (base_dispatch, dispatch_variance, base_received_ratio)
        from models import MonthlyConsumption as MC_
        import random as _rng
        _rng.seed(77)
        base_volumes = [
            45,   # GDLC2   Chana Dal
            28,   # GBPP1   Black Pepper Powder
            32,   # GGMASA  Garam Masala
            35,   # GTUR5   Turmeric Powder
            12,   # GCGH6   Cow Ghee
            10,   # GALM20  Almond
            80,   # KBAS5   Kohinoor Basmati 10x5KG
            25,   # KBAS25  Kohinoor Basmati 2x25KG
            60,   # RBAS10  Royal Basmati
            40,   # RTOR10  Royal Toor Dal
            38,   # GBESEN  Besan
            55,   # GATTA   Wheat Atta
            18,   # GFROZB  Frozen Bhindi
            22,   # GFROZP  Frozen Paratha
            20,   # GMUSTAR Mustard Seeds
        ]
        today_date = date.today()
        for idx, sku in enumerate(sku_objs):
            base = base_volumes[idx]
            for m_back in range(1, 7):          # 6 months of history
                m = today_date.month - m_back
                y = today_date.year
                while m < 1:
                    m += 12
                    y -= 1
                # slight month-to-month variance ±15%
                dispatched = max(1, int(base * _rng.uniform(0.85, 1.15)))
                received   = max(dispatched, int(base * _rng.uniform(1.0, 1.30)))
                db.add(MC_(
                    sku_id=sku.id,
                    year=y,
                    month=m,
                    cases_dispatched=dispatched,
                    cases_received=received,
                    company_id=1,
                ))

        db.commit()
        print("[seed_demo_data] ✓ Demo data loaded for company 1")
    except Exception as e:
        import traceback
        db.rollback()
        print(f"[seed_demo_data] ERROR: {e}")
        traceback.print_exc()
    finally:
        db.close()


seed_demo_data()


def seed_consumption_history():
    """Idempotent: add 6 months of consumption history for company 1 SKUs.
    Safe to call on every deploy — skips if records already exist.
    """
    from models import MonthlyConsumption as MC_
    from datetime import date
    import random as _rng2
    _rng2.seed(77)
    db = SessionLocal()
    try:
        # Guard: skip if any consumption records already exist for company 1
        if db.query(MC_).filter(MC_.company_id == 1).count() > 0:
            print("[seed_consumption] already seeded, skipping")
            return

        skus = db.query(SKU).filter(SKU.company_id == 1).order_by(SKU.id).all()
        if not skus:
            print("[seed_consumption] no SKUs found, skipping")
            return

        # Baseline monthly dispatch volumes (aligned to seed SKU order by sku_code sort)
        sku_volumes = {
            "GDLC2":   45,  "GBPP1":  28,  "GGMASA": 32,  "GTUR5":  35,
            "GCGH6":   12,  "GALM20": 10,  "KBAS5":  80,  "KBAS25": 25,
            "RBAS10":  60,  "RTOR10": 40,  "GBESEN": 38,  "GATTA":  55,
            "GFROZB":  18,  "GFROZP": 22,  "GMUSTAR":20,
        }
        today_d = date.today()
        for sku in skus:
            base = sku_volumes.get(sku.sku_code, 25)
            for m_back in range(1, 7):
                m = today_d.month - m_back
                y = today_d.year
                while m < 1:
                    m += 12
                    y -= 1
                dispatched = max(1, int(base * _rng2.uniform(0.85, 1.15)))
                received   = max(dispatched, int(base * _rng2.uniform(1.0, 1.30)))
                db.add(MC_(
                    sku_id=sku.id, year=y, month=m,
                    cases_dispatched=dispatched,
                    cases_received=received,
                    company_id=1,
                ))
        db.commit()
        print(f"[seed_consumption] ✓ Seeded 6 months history for {len(skus)} SKUs")
    except Exception as e:
        import traceback
        db.rollback()
        print(f"[seed_consumption] ERROR: {e}")
        traceback.print_exc()
    finally:
        db.close()


seed_consumption_history()


app = FastAPI(title="Grocery WMS API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(dashboard.router)
app.include_router(skus.router)
app.include_router(vendors.router)
app.include_router(receiving.router)
app.include_router(orders.router)
app.include_router(inventory.router)
app.include_router(transfers.router)
app.include_router(forecasting.router)
app.include_router(upload.router)
app.include_router(settings.router)
app.include_router(dispatch.router)
app.include_router(reports.router)
app.include_router(stock_take.router)
app.include_router(notifications.router)
app.include_router(dispatch_board.router)
app.include_router(spreadsheet.router)
app.include_router(quickbooks.router)
app.include_router(bin_locations.router)
app.include_router(purchase_orders.router)
app.include_router(labels.router)
app.include_router(customers.router)
app.include_router(returns.router)
app.include_router(invoices.router)
app.include_router(drivers_router)
app.include_router(runs_router)
app.include_router(auth_router)
app.include_router(users_router)
app.include_router(price_lists_router)
app.include_router(email_router)
app.include_router(portal_router)
app.include_router(superadmin_router)
app.include_router(warehouse_tasks_router)
app.include_router(traceability_router)
app.include_router(asn_router)
app.include_router(kpi_router)
app.include_router(credit_notes_router)
app.include_router(vendor_bills_router)
app.include_router(quotes_router)
app.include_router(audit_log_router)
app.include_router(order_check_router)

# ── Static files (product images) ─────────────────────────────
_static_dir = pathlib.Path(__file__).parent / "static" / "products"
_static_dir.mkdir(parents=True, exist_ok=True)
app.mount("/static", StaticFiles(directory=str(pathlib.Path(__file__).parent / "static")), name="static")

@app.get("/")
def root():
    return {"message": "Grocery WMS API running", "docs": "/docs"}

@app.post("/admin/run-seed")
def run_seed_endpoint():
    """Manually trigger seed_demo_data() and return counts + any error."""
    import traceback as _tb
    result: dict = {}
    try:
        db = SessionLocal()
        result["before"] = {
            "skus":     db.query(SKU).filter(SKU.company_id == 1).count(),
            "customers":db.query(Customer).filter(Customer.company_id == 1).count(),
            "vendors":  db.query(Vendor).filter(Vendor.company_id == 1).count(),
        }
        db.close()
        seed_demo_data()
        seed_consumption_history()
        from models import MonthlyConsumption as MC_
        db2 = SessionLocal()
        result["after"] = {
            "skus":         db2.query(SKU).filter(SKU.company_id == 1).count(),
            "customers":    db2.query(Customer).filter(Customer.company_id == 1).count(),
            "vendors":      db2.query(Vendor).filter(Vendor.company_id == 1).count(),
            "consumption_months": db2.query(MC_).filter(MC_.company_id == 1).count(),
        }
        db2.close()
        result["status"] = "ok"
    except Exception as e:
        result["status"] = "error"
        result["error"] = str(e)
        result["traceback"] = _tb.format_exc()
    return result
