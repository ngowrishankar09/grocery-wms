from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
import os, pathlib

from database import engine, SessionLocal
from models import create_tables, Warehouse, User, Company, CompanyProfile
from routers import skus, vendors, receiving, orders, inventory, transfers, forecasting, dashboard, upload, settings, dispatch
from routers import reports, stock_take, notifications, dispatch_board, spreadsheet, quickbooks, bin_locations, purchase_orders, labels, customers, returns, invoices
from routers.drivers import router as drivers_router, runs_router
from routers.auth import router as auth_router
from routers.users import router as users_router
from routers.superadmin import router as superadmin_router
from routers.price_lists import router as price_lists_router
from routers.email import router as email_router
from routers.portal import router as portal_router
from security import hash_password

create_tables(engine)

# ── SQLite migrations: add new columns to existing tables ─────
def _migrate():
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
        ("customers", "portal_enabled",  "BOOLEAN DEFAULT 0"),
        ("customers", "portal_password", "VARCHAR"),
        ("company_profile", "portal_show_price",    "BOOLEAN DEFAULT 1"),
        ("company_profile", "portal_show_stock",    "BOOLEAN DEFAULT 1"),
        ("company_profile", "portal_show_invoices", "BOOLEAN DEFAULT 1"),
        ("skus", "selling_price", "FLOAT"),
        ("orders", "picking_queued",     "BOOLEAN DEFAULT 0"),
        ("orders", "picking_started_at", "DATETIME"),
        ("orders", "picking_ended_at",   "DATETIME"),
        ("skus",   "show_goods_date_on_picking", "BOOLEAN DEFAULT 0"),
        ("order_items", "cases_picked",         "INTEGER DEFAULT 0"),
        ("skus",        "require_expiry_entry",  "BOOLEAN DEFAULT 0"),
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
        ("company_profile", "show_qr_code",       "BOOLEAN DEFAULT 0"),
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
    ]
    with engine.connect() as conn:
        for table, col, type_def in migrations:
            try:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} {type_def}"))
                conn.commit()
            except Exception:
                pass  # column already exists

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
    """Create a superadmin user if one does not already exist."""
    db = SessionLocal()
    try:
        if not db.query(User).filter(User.role == "superadmin").first():
            db.add(User(
                username="superadmin",
                hashed_password=hash_password("SuperAdmin@2026"),
                full_name="Super Admin",
                email="superadmin@wms.local",
                role="superadmin",
                company_id=None,
                must_change_password=False,
            ))
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
    db = SessionLocal()
    try:
        if db.query(User).count() == 0:
            db.add(User(
                username="admin",
                hashed_password=hash_password("admin123"),
                full_name="System Admin",
                email="admin@wms.local",
                role="admin",
            ))
            db.add(User(
                username="manager",
                hashed_password=hash_password("manager123"),
                full_name="Warehouse Manager",
                email="manager@wms.local",
                role="manager",
            ))
            db.add(User(
                username="warehouse",
                hashed_password=hash_password("warehouse123"),
                full_name="Warehouse Staff",
                email="staff@wms.local",
                role="warehouse",
            ))
            db.commit()
    finally:
        db.close()

seed_admin()

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

# ── Static files (product images) ─────────────────────────────
_static_dir = pathlib.Path(__file__).parent / "static" / "products"
_static_dir.mkdir(parents=True, exist_ok=True)
app.mount("/static", StaticFiles(directory=str(pathlib.Path(__file__).parent / "static")), name="static")

@app.get("/")
def root():
    return {"message": "Grocery WMS API running", "docs": "/docs"}
