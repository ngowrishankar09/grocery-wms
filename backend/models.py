from sqlalchemy import (
    Column, Integer, String, Float, Date, DateTime, Boolean,
    ForeignKey, Text, Enum
)
from sqlalchemy.orm import relationship, declarative_base
from sqlalchemy import create_engine
from datetime import datetime, date
import enum

Base = declarative_base()

# ─── Company (multi-tenancy root) ─────────────────────────────
class Company(Base):
    __tablename__ = "companies"
    id         = Column(Integer, primary_key=True, index=True)
    name       = Column(String, nullable=False)
    slug       = Column(String, unique=True, index=True, nullable=False)
    plan       = Column(String, default="standard")
    is_active  = Column(Boolean, default=True)
    status     = Column(String, default="pending")  # pending | active | suspended
    created_at = Column(DateTime, default=datetime.utcnow)

class WarehouseEnum(str, enum.Enum):
    WH1 = "WH1"
    WH2 = "WH2"

# ─── Warehouse ────────────────────────────────────────────────
class Warehouse(Base):
    __tablename__ = "warehouses"

    id          = Column(Integer, primary_key=True, index=True)
    company_id  = Column(Integer, ForeignKey("companies.id"), nullable=True, index=True)
    code        = Column(String, unique=True, index=True, nullable=False)  # e.g. WH1, WH2
    name        = Column(String, nullable=False)                           # e.g. "Main Warehouse"
    address     = Column(Text)
    is_primary  = Column(Boolean, default=False)                           # primary ops warehouse
    is_active   = Column(Boolean, default=True)
    created_at  = Column(DateTime, default=datetime.utcnow)

# ─── Inventory Adjustment Log ─────────────────────────────────
class InventoryAdjustment(Base):
    __tablename__ = "inventory_adjustments"

    id          = Column(Integer, primary_key=True, index=True)
    company_id  = Column(Integer, ForeignKey("companies.id"), nullable=True, index=True)
    sku_id      = Column(Integer, ForeignKey("skus.id"), nullable=False)
    warehouse   = Column(String, nullable=False)
    before_qty  = Column(Integer, nullable=False)
    after_qty   = Column(Integer, nullable=False)
    delta       = Column(Integer, nullable=False)   # after - before (+ or -)
    reason      = Column(String)                    # "count correction", "damaged", "theft" etc
    notes       = Column(Text)
    adjusted_at = Column(DateTime, default=datetime.utcnow)

# ─── Category (user-managed) ──────────────────────────────────
class Category(Base):
    __tablename__ = "categories"

    id         = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=True, index=True)
    name       = Column(String, unique=True, nullable=False)
    sort_order = Column(Integer, default=0)
    is_active  = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

class OrderStatusEnum(str, enum.Enum):
    PENDING = "Pending"
    PICKING = "Picking"
    DISPATCHED = "Dispatched"
    CANCELLED = "Cancelled"

# ─── SKU Master ───────────────────────────────────────────────
class SKU(Base):
    __tablename__ = "skus"

    id              = Column(Integer, primary_key=True, index=True)
    company_id      = Column(Integer, ForeignKey("companies.id"), nullable=True, index=True)
    sku_code        = Column(String, unique=True, index=True, nullable=False)
    barcode         = Column(String, unique=True, index=True, nullable=True)  # UPC/EAN-13
    product_name    = Column(String, nullable=False)
    name_es         = Column(String)              # Spanish name
    category        = Column(String, nullable=False)
    case_size       = Column(Integer, nullable=False)       # units per case
    pallet_size     = Column(Integer, nullable=True)        # cases per pallet (optional)
    unit_label      = Column(String, default="units")       # e.g. kg, g, pcs
    avg_shelf_life_days = Column(Integer, default=0)   # 0 = non-perishable
    reorder_point   = Column(Integer, default=10)      # cases
    reorder_qty     = Column(Integer, default=50)      # cases
    max_stock       = Column(Integer, default=200)     # cases
    lead_time_days  = Column(Integer, default=7)
    vendor_id       = Column(Integer, ForeignKey("vendors.id"), nullable=True)
    cost_price      = Column(Float, nullable=True)          # default cost per case (from vendor)
    selling_price   = Column(Float, nullable=True)          # default customer-facing price per case
    image_url       = Column(String, nullable=True)         # product image path
    show_goods_date_on_picking = Column(Boolean, default=False)  # show expiry/goods date to picker
    require_expiry_entry       = Column(Boolean, default=False)  # picker must enter expiry date
    floor_price     = Column(Float, nullable=True)   # min price below which approval required
    is_active       = Column(Boolean, default=True)
    created_at      = Column(DateTime, default=datetime.utcnow)

    vendor          = relationship("Vendor", back_populates="skus")
    batches         = relationship("Batch", back_populates="sku")
    inventory       = relationship("Inventory", back_populates="sku")
    order_items     = relationship("OrderItem", back_populates="sku")

# ─── Vendor ───────────────────────────────────────────────────
class Vendor(Base):
    __tablename__ = "vendors"

    id              = Column(Integer, primary_key=True, index=True)
    company_id      = Column(Integer, ForeignKey("companies.id"), nullable=True, index=True)
    name            = Column(String, nullable=False)
    contact_person  = Column(String)
    phone           = Column(String)
    email           = Column(String)
    lead_time_days  = Column(Integer, default=7)
    notes           = Column(Text)
    is_active       = Column(Boolean, default=True)
    created_at      = Column(DateTime, default=datetime.utcnow)

    skus            = relationship("SKU", back_populates="vendor")

# ─── Batch (each shipment received) ───────────────────────────
class Batch(Base):
    __tablename__ = "batches"

    id              = Column(Integer, primary_key=True, index=True)
    company_id      = Column(Integer, ForeignKey("companies.id"), nullable=True, index=True)
    batch_code      = Column(String, unique=True, index=True, nullable=False)
    sku_id          = Column(Integer, ForeignKey("skus.id"), nullable=False)
    cases_received  = Column(Integer, nullable=False)
    cases_remaining = Column(Integer, nullable=False)
    warehouse       = Column(String, nullable=False)       # WH1 or WH2
    received_date   = Column(Date, nullable=False)
    expiry_date     = Column(Date, nullable=True)          # null = no expiry
    has_expiry      = Column(Boolean, default=True)
    lot_number      = Column(String, nullable=True)        # supplier lot/batch number
    po_item_id      = Column(Integer, ForeignKey("purchase_order_items.id"), nullable=True)
    is_recalled     = Column(Boolean, default=False)
    recall_reason   = Column(String, nullable=True)
    recalled_at     = Column(DateTime, nullable=True)
    landed_cost_per_case = Column(Float, nullable=True)
    supplier_ref    = Column(String)                       # supplier invoice/ref
    notes           = Column(Text)
    created_at      = Column(DateTime, default=datetime.utcnow)

    sku             = relationship("SKU", back_populates="batches")
    dispatch_items  = relationship("DispatchItem", back_populates="batch")
    transfer_items  = relationship("TransferItem", back_populates="batch")

# ─── Bin Location ─────────────────────────────────────────────
class BinLocation(Base):
    __tablename__ = "bin_locations"

    id          = Column(Integer, primary_key=True, index=True)
    company_id  = Column(Integer, ForeignKey("companies.id"), nullable=True, index=True)
    code        = Column(String, unique=True, nullable=False)   # e.g. "A-01-B-03"
    zone        = Column(String, default="")                    # e.g. "A", "Freezer", "Dry"
    aisle       = Column(String, default="")                    # e.g. "01"
    shelf       = Column(String, default="")                    # e.g. "B"
    position    = Column(String, default="")                    # e.g. "03"
    description = Column(String, default="")
    is_active   = Column(Boolean, default=True)
    created_at  = Column(DateTime, default=datetime.utcnow)

    inventory_items = relationship("Inventory", back_populates="bin_location")

# ─── Inventory (live stock per SKU per warehouse per stock type) ──
class Inventory(Base):
    __tablename__ = "inventory"

    id              = Column(Integer, primary_key=True, index=True)
    company_id      = Column(Integer, ForeignKey("companies.id"), nullable=True, index=True)
    sku_id          = Column(Integer, ForeignKey("skus.id"), nullable=False)
    warehouse       = Column(String, nullable=False)
    cases_on_hand   = Column(Integer, default=0)
    # stock_type: unrestricted (available for orders) | inspection (QI hold) |
    #             blocked (quarantine/damaged) | allocated (locked for a pick task)
    stock_type      = Column(String, default="unrestricted", nullable=False)
    updated_at      = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    bin_location_id = Column(Integer, ForeignKey("bin_locations.id"), nullable=True)

    sku             = relationship("SKU", back_populates="inventory")
    bin_location    = relationship("BinLocation", back_populates="inventory_items")

# ─── Customer Price Lists ──────────────────────────────────────
class PriceList(Base):
    __tablename__ = "price_lists"

    id          = Column(Integer, primary_key=True, index=True)
    company_id  = Column(Integer, ForeignKey("companies.id"), nullable=True, index=True)
    name        = Column(String, nullable=False)          # e.g. "Wholesale", "Retail", "Premium"
    description = Column(Text, nullable=True)
    is_active   = Column(Boolean, default=True)
    created_at  = Column(DateTime, default=datetime.utcnow)

    items       = relationship("PriceListItem", back_populates="price_list", cascade="all, delete-orphan")
    customers   = relationship("Customer", back_populates="price_list")


class PriceListItem(Base):
    __tablename__ = "price_list_items"

    id            = Column(Integer, primary_key=True, index=True)
    price_list_id = Column(Integer, ForeignKey("price_lists.id"), nullable=False)
    sku_id        = Column(Integer, ForeignKey("skus.id"), nullable=False)
    unit_price    = Column(Float, nullable=False)   # price per case for this tier

    price_list    = relationship("PriceList", back_populates="items")
    sku           = relationship("SKU")


# ─── Customer ─────────────────────────────────────────────────
class Customer(Base):
    __tablename__ = "customers"

    id               = Column(Integer, primary_key=True, index=True)
    company_id       = Column(Integer, ForeignKey("companies.id"), nullable=True, index=True)
    name             = Column(String, nullable=False, index=True)
    contact_person   = Column(String)
    phone            = Column(String)
    email            = Column(String)
    address          = Column(Text)
    delivery_address = Column(Text)
    notes            = Column(Text)
    price_list_id    = Column(Integer, ForeignKey("price_lists.id"), nullable=True)
    latitude         = Column(Float, nullable=True)
    longitude        = Column(Float, nullable=True)
    is_active        = Column(Boolean, default=True)
    created_at       = Column(DateTime, default=datetime.utcnow)
    # Portal access
    portal_enabled   = Column(Boolean, default=False)
    portal_password  = Column(String, nullable=True)  # hashed
    # Credit management
    credit_limit     = Column(Float, nullable=True)     # max outstanding balance; None = unlimited
    credit_hold      = Column(Boolean, default=False)   # hard block on new orders
    payment_terms    = Column(String, nullable=True)    # default e.g. "Net 30"
    discount_pct     = Column(Float, default=0.0, nullable=True)  # default line-item discount % for this customer

    orders           = relationship("Order", back_populates="customer")
    price_list       = relationship("PriceList", back_populates="customers")


# ─── Store Order ───────────────────────────────────────────────
class Order(Base):
    __tablename__ = "orders"

    id              = Column(Integer, primary_key=True, index=True)
    company_id      = Column(Integer, ForeignKey("companies.id"), nullable=True, index=True)
    order_number    = Column(String, unique=True, index=True, nullable=False)
    customer_id     = Column(Integer, ForeignKey("customers.id"), nullable=True)
    store_name      = Column(String, nullable=False)
    store_contact   = Column(String)
    order_date      = Column(Date, nullable=False)
    dispatch_date   = Column(Date, nullable=True)
    status          = Column(String, default=OrderStatusEnum.PENDING)
    notes           = Column(Text)
    created_at      = Column(DateTime, default=datetime.utcnow)

    # ── Dispatch Board live-tracking fields ───────────────────
    packing_status   = Column(String, default="Queued")
    # Queued → Packing → Packed → Loaded → Dispatched → Done
    picker_name      = Column(String)        # who is picking / packing
    num_pallets      = Column(Integer)       # number of pallets
    route            = Column(String)        # delivery route / zone
    priority         = Column(String, default="Normal")   # Normal / Urgent / Express
    delivery_notes   = Column(Text)          # driver/delivery instructions
    board_updated_by = Column(String)        # last user to touch the row
    board_updated_at = Column(DateTime)      # timestamp of last board change

    # ── Mobile Picking tracking ───────────────────────────────
    picking_queued     = Column(Boolean, default=False)  # admin explicitly queued for picking
    picking_started_at = Column(DateTime)                # picker started
    picking_ended_at   = Column(DateTime)                # picker finished
    approval_status = Column(String, nullable=True)   # None | pending | approved | rejected
    approval_note   = Column(Text, nullable=True)
    approved_by     = Column(String, nullable=True)
    approved_at     = Column(DateTime, nullable=True)
    promised_date   = Column(Date, nullable=True)

    customer        = relationship("Customer", back_populates="orders")
    items           = relationship("OrderItem", back_populates="order")

class OrderItem(Base):
    __tablename__ = "order_items"

    id              = Column(Integer, primary_key=True, index=True)
    order_id        = Column(Integer, ForeignKey("orders.id"), nullable=False)
    sku_id          = Column(Integer, ForeignKey("skus.id"), nullable=False)
    cases_requested     = Column(Float, nullable=False)
    cases_fulfilled     = Column(Float, default=0)
    cases_picked        = Column(Float, default=0)   # actual qty recorded by picker
    expiry_date_entered = Column(Text, nullable=True)  # date entered by picker (YYYY-MM-DD)
    unit_price          = Column(Float, nullable=True)  # optional price override (overrides SKU selling_price)
    notes               = Column(Text)

    order           = relationship("Order", back_populates="items")
    sku             = relationship("SKU", back_populates="order_items")
    dispatch_items  = relationship("DispatchItem", back_populates="order_item")

# ─── Dispatch Item (actual pick from batch) ───────────────────
class DispatchItem(Base):
    __tablename__ = "dispatch_items"

    id              = Column(Integer, primary_key=True, index=True)
    order_item_id   = Column(Integer, ForeignKey("order_items.id"), nullable=False)
    batch_id        = Column(Integer, ForeignKey("batches.id"), nullable=False)
    warehouse       = Column(String, nullable=False)
    cases_picked    = Column(Integer, nullable=False)
    picked_at       = Column(DateTime, default=datetime.utcnow)

    order_item      = relationship("OrderItem", back_populates="dispatch_items")
    batch           = relationship("Batch", back_populates="dispatch_items")

# ─── Warehouse Transfer ────────────────────────────────────────
class Transfer(Base):
    __tablename__ = "transfers"

    id              = Column(Integer, primary_key=True, index=True)
    company_id      = Column(Integer, ForeignKey("companies.id"), nullable=True, index=True)
    transfer_number = Column(String, unique=True, index=True, nullable=False)
    from_warehouse  = Column(String, nullable=False)
    to_warehouse    = Column(String, nullable=False)
    transfer_date   = Column(Date, nullable=False)
    notes           = Column(Text)
    created_at      = Column(DateTime, default=datetime.utcnow)

    items           = relationship("TransferItem", back_populates="transfer")

class TransferItem(Base):
    __tablename__ = "transfer_items"

    id              = Column(Integer, primary_key=True, index=True)
    transfer_id     = Column(Integer, ForeignKey("transfers.id"), nullable=False)
    batch_id        = Column(Integer, ForeignKey("batches.id"), nullable=False)
    cases_moved     = Column(Integer, nullable=False)

    transfer        = relationship("Transfer", back_populates="items")
    batch           = relationship("Batch", back_populates="transfer_items")

# ─── Monthly Consumption Log (for forecasting) ────────────────
class MonthlyConsumption(Base):
    __tablename__ = "monthly_consumption"

    id              = Column(Integer, primary_key=True, index=True)
    company_id      = Column(Integer, ForeignKey("companies.id"), nullable=True, index=True)
    sku_id          = Column(Integer, ForeignKey("skus.id"), nullable=False)
    year            = Column(Integer, nullable=False)
    month           = Column(Integer, nullable=False)
    cases_dispatched = Column(Integer, default=0)
    cases_received  = Column(Integer, default=0)
    updated_at      = Column(DateTime, default=datetime.utcnow)


# ─── Quick Dispatch Record ────────────────────────────────────
class DispatchRecord(Base):
    __tablename__ = "dispatch_records"

    id            = Column(Integer, primary_key=True, index=True)
    company_id    = Column(Integer, ForeignKey("companies.id"), nullable=True, index=True)
    ref           = Column(String, unique=True, index=True, nullable=False)  # DSP-20260225-0001 or user ref
    note          = Column(Text)                                              # optional free-text
    dispatch_date = Column(Date, nullable=False)
    created_at    = Column(DateTime, default=datetime.utcnow)

    items         = relationship("DispatchRecordItem", back_populates="dispatch")

class DispatchRecordItem(Base):
    __tablename__ = "dispatch_record_items"

    id               = Column(Integer, primary_key=True, index=True)
    dispatch_id      = Column(Integer, ForeignKey("dispatch_records.id"), nullable=False)
    sku_id           = Column(Integer, ForeignKey("skus.id"), nullable=False)
    cases_requested  = Column(Integer, nullable=False)
    cases_fulfilled  = Column(Integer, nullable=False)
    picks_json       = Column(Text)   # JSON string of batch picks for traceability

    dispatch         = relationship("DispatchRecord", back_populates="items")
    sku              = relationship("SKU")

# ─── Shared Spreadsheet (free-form multi-sheet workbook) ──────
class SpreadsheetWorkbook(Base):
    __tablename__ = "spreadsheet_workbooks"

    id          = Column(Integer, primary_key=True, index=True)
    company_id  = Column(Integer, ForeignKey("companies.id"), nullable=True, index=True)
    name        = Column(String, nullable=False)
    created_at  = Column(DateTime, default=datetime.utcnow)
    updated_at  = Column(DateTime, default=datetime.utcnow)

    sheets      = relationship("SpreadsheetSheet", back_populates="workbook",
                               cascade="all, delete-orphan")


class SpreadsheetSheet(Base):
    __tablename__ = "spreadsheet_sheets"

    id          = Column(Integer, primary_key=True, index=True)
    workbook_id = Column(Integer, ForeignKey("spreadsheet_workbooks.id"), nullable=False)
    name        = Column(String, nullable=False, default="Sheet 1")
    sort_order  = Column(Integer, default=0)

    workbook    = relationship("SpreadsheetWorkbook", back_populates="sheets")
    columns     = relationship("SpreadsheetColumn", back_populates="sheet",
                               cascade="all, delete-orphan")
    rows        = relationship("SpreadsheetRow",    back_populates="sheet",
                               cascade="all, delete-orphan")
    cells       = relationship("SpreadsheetCell",   back_populates="sheet",
                               cascade="all, delete-orphan")


class SpreadsheetColumn(Base):
    __tablename__ = "spreadsheet_columns"

    id          = Column(Integer, primary_key=True, index=True)
    sheet_id    = Column(Integer, ForeignKey("spreadsheet_sheets.id"), nullable=False)
    name        = Column(String, nullable=False)
    width       = Column(Integer, default=120)   # pixels
    col_type    = Column(String, default="text") # text | number | date | select
    sort_order  = Column(Integer, default=0)

    sheet       = relationship("SpreadsheetSheet", back_populates="columns")


class SpreadsheetRow(Base):
    __tablename__ = "spreadsheet_rows"

    id          = Column(Integer, primary_key=True, index=True)
    sheet_id    = Column(Integer, ForeignKey("spreadsheet_sheets.id"), nullable=False)
    sort_order  = Column(Integer, default=0)
    colour      = Column(String, nullable=True)  # hex colour e.g. #FFD700 or None

    sheet       = relationship("SpreadsheetSheet", back_populates="rows")
    cells       = relationship("SpreadsheetCell",  back_populates="row",
                               cascade="all, delete-orphan")


class SpreadsheetCell(Base):
    __tablename__ = "spreadsheet_cells"

    id           = Column(Integer, primary_key=True, index=True)
    sheet_id     = Column(Integer, ForeignKey("spreadsheet_sheets.id"),  nullable=False)
    row_id       = Column(Integer, ForeignKey("spreadsheet_rows.id"),    nullable=False)
    col_id       = Column(Integer, ForeignKey("spreadsheet_columns.id"), nullable=False)
    value        = Column(Text, nullable=True)
    # Formatting
    bold         = Column(Boolean, default=False)
    italic       = Column(Boolean, default=False)
    underline    = Column(Boolean, default=False)
    strike       = Column(Boolean, default=False)
    font_size    = Column(Integer, default=13)
    font_colour  = Column(String, nullable=True)   # hex e.g. #FF0000
    fill_colour  = Column(String, nullable=True)   # hex e.g. #FFFF00
    align        = Column(String, default="left")  # left | center | right
    wrap         = Column(Boolean, default=False)
    border       = Column(String, nullable=True)   # none | all | outer | bottom

    sheet        = relationship("SpreadsheetSheet", back_populates="cells")
    row          = relationship("SpreadsheetRow",   back_populates="cells")


# ─── QuickBooks Online Integration ────────────────────────────
class QuickBooksConfig(Base):
    """Stores OAuth credentials and tokens for QBO connection."""
    __tablename__ = "quickbooks_config"

    id              = Column(Integer, primary_key=True, index=True)
    company_id      = Column(Integer, ForeignKey("companies.id"), nullable=True, index=True)
    client_id       = Column(String, nullable=True)
    client_secret   = Column(String, nullable=True)
    environment     = Column(String, default="sandbox")   # sandbox | production
    redirect_uri    = Column(String, default="http://localhost:8000/quickbooks/callback")
    realm_id        = Column(String, nullable=True)        # QB Company ID
    access_token    = Column(Text,   nullable=True)
    refresh_token   = Column(Text,   nullable=True)
    token_expiry    = Column(DateTime, nullable=True)
    connected_at    = Column(DateTime, nullable=True)
    last_sync_at    = Column(DateTime, nullable=True)

class QuickBooksSyncRecord(Base):
    """Tracks each entity pushed/pulled to/from QuickBooks."""
    __tablename__ = "quickbooks_sync_records"

    id              = Column(Integer, primary_key=True, index=True)
    entity_type     = Column(String, nullable=False)   # vendor | item | invoice | customer
    wms_id          = Column(Integer, nullable=True)   # WMS entity id
    wms_ref         = Column(String,  nullable=True)   # human-readable ref
    qb_id           = Column(String,  nullable=True)   # QuickBooks entity id
    action          = Column(String,  nullable=False)  # push | pull | update
    status          = Column(String,  nullable=False)  # success | error | skipped
    message         = Column(Text,    nullable=True)
    synced_at       = Column(DateTime, default=datetime.utcnow)


# ─── Purchase Orders ──────────────────────────────────────────
class PurchaseOrder(Base):
    __tablename__ = "purchase_orders"

    id              = Column(Integer, primary_key=True, index=True)
    company_id      = Column(Integer, ForeignKey("companies.id"), nullable=True, index=True)
    po_number       = Column(String, unique=True, nullable=False)   # PO-2024-001
    vendor_id       = Column(Integer, ForeignKey("vendors.id"), nullable=True)
    status          = Column(String, default="draft")  # draft|sent|partial|received|cancelled
    warehouse       = Column(String, default="WH1")    # destination warehouse
    expected_date   = Column(Date, nullable=True)
    notes           = Column(Text, default="")
    freight_cost    = Column(Float, default=0.0)
    duty_cost       = Column(Float, default=0.0)
    other_cost      = Column(Float, default=0.0)
    landed_cost_allocated = Column(Boolean, default=False)
    currency        = Column(String, default="USD")
    exchange_rate   = Column(Float, default=1.0)
    created_at      = Column(DateTime, default=datetime.utcnow)

    vendor          = relationship("Vendor")
    items           = relationship("PurchaseOrderItem", back_populates="po", cascade="all, delete-orphan")

class PurchaseOrderItem(Base):
    __tablename__ = "purchase_order_items"

    id              = Column(Integer, primary_key=True, index=True)
    po_id           = Column(Integer, ForeignKey("purchase_orders.id"), nullable=False)
    sku_id          = Column(Integer, ForeignKey("skus.id"), nullable=False)
    cases_ordered   = Column(Integer, nullable=False)
    cases_received  = Column(Integer, default=0)
    unit_cost       = Column(Float, nullable=True)     # cost per case on this PO
    landed_cost_per_case = Column(Float, nullable=True)
    landed_unit_cost     = Column(Float, nullable=True)

    po              = relationship("PurchaseOrder", back_populates="items")
    sku             = relationship("SKU")


# ─── Supplier ASN (Advance Ship Notice) ──────────────────────
class SupplierASN(Base):
    __tablename__ = "supplier_asns"

    id           = Column(Integer, primary_key=True, index=True)
    company_id   = Column(Integer, ForeignKey("companies.id"), nullable=True, index=True)
    asn_number   = Column(String, unique=True, index=True, nullable=False)
    po_id        = Column(Integer, ForeignKey("purchase_orders.id"), nullable=True)
    vendor_id    = Column(Integer, ForeignKey("vendors.id"), nullable=True)
    status       = Column(String, default="Pending")  # Pending|In Transit|Arrived|Received
    ship_date    = Column(Date, nullable=True)
    eta          = Column(Date, nullable=True)
    carrier      = Column(String, nullable=True)
    tracking_number = Column(String, nullable=True)
    notes        = Column(Text, nullable=True)
    created_at   = Column(DateTime, default=datetime.utcnow)

    vendor = relationship("Vendor")
    po     = relationship("PurchaseOrder")
    items  = relationship("SupplierASNItem", back_populates="asn", cascade="all, delete-orphan")


class SupplierASNItem(Base):
    __tablename__ = "supplier_asn_items"

    id             = Column(Integer, primary_key=True, index=True)
    asn_id         = Column(Integer, ForeignKey("supplier_asns.id"), nullable=False)
    sku_id         = Column(Integer, ForeignKey("skus.id"), nullable=False)
    cases_expected = Column(Integer, nullable=False)
    cases_received = Column(Integer, default=0)
    lot_number     = Column(String, nullable=True)
    expiry_date    = Column(Date, nullable=True)

    asn = relationship("SupplierASN", back_populates="items")
    sku = relationship("SKU")


# ─── Customer Returns ─────────────────────────────────────────
class CustomerReturn(Base):
    __tablename__ = "customer_returns"

    id             = Column(Integer, primary_key=True, index=True)
    company_id     = Column(Integer, ForeignKey("companies.id"), nullable=True, index=True)
    return_number  = Column(String, unique=True, index=True, nullable=False)  # RET-20260305-001
    return_date    = Column(Date, nullable=False)
    customer_id    = Column(Integer, ForeignKey("customers.id"), nullable=True)
    store_name     = Column(String, nullable=False)
    reason         = Column(String, nullable=False)  # Damaged|Expired|Excess|Wrong Item|Other
    status         = Column(String, default="Pending")  # Pending|Accepted|Rejected
    warehouse      = Column(String, default="WH1")   # where to restock
    notes          = Column(Text)
    created_at     = Column(DateTime, default=datetime.utcnow)

    customer       = relationship("Customer")
    items          = relationship("ReturnItem", back_populates="ret", cascade="all, delete-orphan")

class ReturnItem(Base):
    __tablename__ = "return_items"

    id              = Column(Integer, primary_key=True, index=True)
    return_id       = Column(Integer, ForeignKey("customer_returns.id"), nullable=False)
    sku_id          = Column(Integer, ForeignKey("skus.id"), nullable=False)
    cases_returned  = Column(Integer, nullable=False)   # claimed by customer
    cases_accepted  = Column(Integer, default=0)        # accepted by warehouse
    condition       = Column(String, default="Good")    # Good|Damaged|Expired

    ret             = relationship("CustomerReturn", back_populates="items")
    sku             = relationship("SKU")


# ─── Company Profile (singleton, id=1) ───────────────────────
class CompanyProfile(Base):
    __tablename__ = "company_profile"

    id           = Column(Integer, primary_key=True, index=True)
    company_id   = Column(Integer, ForeignKey("companies.id"), nullable=True, index=True)
    name         = Column(String,  default="My Company")
    address      = Column(Text,    nullable=True)
    phone        = Column(String,  nullable=True)
    email        = Column(String,  nullable=True)
    website      = Column(String,  nullable=True)
    tax_number   = Column(String,  nullable=True)   # ABN / GST No / VAT No
    bank_details = Column(Text,    nullable=True)   # payment instructions printed on invoice
    logo_text         = Column(String,  default="🏪")    # emoji / initials shown in print header
    invoice_template  = Column(String,  default="classic")  # classic | modern | bold
    updated_at        = Column(DateTime, default=datetime.utcnow)
    # SMTP email config
    smtp_host     = Column(String, nullable=True)   # e.g. smtp.gmail.com
    smtp_port     = Column(Integer, default=587)
    smtp_user     = Column(String, nullable=True)
    smtp_password = Column(String, nullable=True)
    smtp_from     = Column(String, nullable=True)   # display "Company Name <email@x.com>"
    # Customer portal visibility settings
    invoice_note         = Column(Text,    nullable=True)   # printed at bottom of every invoice
    logo_base64          = Column(Text,    nullable=True)   # base64-encoded logo image (data URI)
    # Invoice number generation
    invoice_number_format  = Column(String,  default="date-daily")   # sequential|date-daily|date-monthly|year-seq|year-month|date-full
    invoice_number_prefix  = Column(String,  default="INV")
    invoice_number_padding = Column(Integer, default=3)
    invoice_counter        = Column(Integer, default=0)   # current sequence value
    invoice_counter_period = Column(String,  nullable=True)  # period key when counter last used
    # Print / delivery settings — apply to all templates
    invoice_title = Column(String, default="Invoice")  # "Invoice" | "Sales Order" | "Tax Invoice"
    fax           = Column(String, nullable=True)
    rep_name      = Column(String, nullable=True)   # default rep initials e.g. "AS"
    ship_via      = Column(String, nullable=True)   # e.g. "OUR TRUCK"
    catalog_url   = Column(String, nullable=True)   # URL encoded into QR code
    show_qr_code  = Column(Boolean, default=False)
    portal_show_price    = Column(Boolean, default=True)
    portal_show_stock    = Column(Boolean, default=True)
    portal_show_invoices = Column(Boolean, default=True)
    base_currency   = Column(String, default="USD")


# ─── Customer Invoices ────────────────────────────────────────
class Invoice(Base):
    __tablename__ = "invoices"

    id               = Column(Integer, primary_key=True, index=True)
    company_id       = Column(Integer, ForeignKey("companies.id"), nullable=True, index=True)
    invoice_number   = Column(String, unique=True, index=True, nullable=False)
    order_id         = Column(Integer, ForeignKey("orders.id"),    nullable=True)
    customer_id      = Column(Integer, ForeignKey("customers.id"), nullable=True)
    store_name       = Column(String, nullable=False)
    invoice_date     = Column(Date, nullable=False)
    due_date         = Column(Date, nullable=True)
    status           = Column(String, default="Draft")   # Draft|Sent|Paid|Overdue|Cancelled
    payment_terms    = Column(String, nullable=True)     # e.g. "Net 30", "Due on Receipt"
    notes            = Column(Text)
    # Legacy single-tax (kept for backward compat)
    tax_rate         = Column(Float, default=0.0)
    tax_amount       = Column(Float, default=0.0)
    # Financials
    subtotal         = Column(Float, default=0.0)
    discount_amount  = Column(Float, default=0.0)   # flat discount off subtotal
    total            = Column(Float, default=0.0)   # subtotal - discount + all taxes
    previous_balance = Column(Float, default=0.0)   # carried-forward balance
    grand_total      = Column(Float, default=0.0)   # total + previous_balance
    num_pallets      = Column(Integer, nullable=True)  # pallet count at dispatch
    currency        = Column(String, default="USD")
    exchange_rate   = Column(Float, default=1.0)
    created_at       = Column(DateTime, default=datetime.utcnow)

    customer  = relationship("Customer")
    order     = relationship("Order")
    items     = relationship("InvoiceItem",   back_populates="invoice", cascade="all, delete-orphan")
    taxes     = relationship("InvoiceTax",    back_populates="invoice", cascade="all, delete-orphan")
    payments  = relationship("InvoicePayment",back_populates="invoice", cascade="all, delete-orphan")


class InvoiceItem(Base):
    __tablename__ = "invoice_items"

    id           = Column(Integer, primary_key=True, index=True)
    invoice_id   = Column(Integer, ForeignKey("invoices.id"), nullable=False)
    sku_id       = Column(Integer, ForeignKey("skus.id"),     nullable=True)
    description  = Column(String,  nullable=False)
    cases_qty        = Column(Integer, nullable=False, default=1)
    unit_price       = Column(Float,   nullable=False, default=0.0)
    line_total       = Column(Float,   nullable=False, default=0.0)  # post-discount total
    discount_pct     = Column(Float,   default=0.0)      # % discount applied to this line
    discount_excluded = Column(Boolean, default=False)   # True = this line is excluded from customer discount
    discount_amount  = Column(Float,   default=0.0)      # dollar amount discounted on this line
    expiry_date      = Column(Text,    nullable=True)
    notes            = Column(Text,    nullable=True)

    invoice  = relationship("Invoice",  back_populates="items")
    sku      = relationship("SKU")


class InvoiceTax(Base):
    __tablename__ = "invoice_taxes"

    id         = Column(Integer, primary_key=True, index=True)
    invoice_id = Column(Integer, ForeignKey("invoices.id"), nullable=False)
    name       = Column(String, nullable=False)    # "GST", "PST", "VAT", "HST"
    rate       = Column(Float,  nullable=False)    # e.g. 10.0  = 10 %
    amount     = Column(Float,  nullable=False, default=0.0)

    invoice    = relationship("Invoice", back_populates="taxes")


# ─── Invoice Payments (QuickBooks-style Receive Payment) ─────
class InvoicePayment(Base):
    __tablename__ = "invoice_payments"

    id           = Column(Integer, primary_key=True, index=True)
    company_id   = Column(Integer, ForeignKey("companies.id"), nullable=True, index=True)
    invoice_id   = Column(Integer, ForeignKey("invoices.id"),  nullable=False, index=True)
    payment_date = Column(Date,    nullable=False)
    amount       = Column(Float,   nullable=False)
    method       = Column(String,  default="Bank Transfer")  # Cash|Bank Transfer|Check|Card|Other
    reference    = Column(String,  nullable=True)   # cheque #, transaction ID, etc.
    notes        = Column(Text,    nullable=True)
    created_at   = Column(DateTime, default=datetime.utcnow)

    invoice = relationship("Invoice", back_populates="payments")


# ─── Journal Entries (SAP-style double-entry ledger) ─────────
class JournalEntry(Base):
    __tablename__ = "journal_entries"

    id           = Column(Integer, primary_key=True, index=True)
    company_id   = Column(Integer, ForeignKey("companies.id"), nullable=True, index=True)
    entry_date   = Column(Date,    nullable=False)
    entry_number = Column(String,  unique=True, index=True, nullable=False)
    source_type  = Column(String,  nullable=True)   # invoice | payment | purchase | receiving
    source_id    = Column(Integer, nullable=True)
    description  = Column(Text,    nullable=True)
    created_at   = Column(DateTime, default=datetime.utcnow)

    lines = relationship("JournalLine", back_populates="entry", cascade="all, delete-orphan")


class JournalLine(Base):
    __tablename__ = "journal_lines"

    id       = Column(Integer, primary_key=True, index=True)
    entry_id = Column(Integer, ForeignKey("journal_entries.id"), nullable=False)
    account  = Column(String,  nullable=False)   # "Accounts Receivable", "Sales Revenue", …
    debit    = Column(Float,   default=0.0)
    credit   = Column(Float,   default=0.0)
    notes    = Column(Text,    nullable=True)

    entry = relationship("JournalEntry", back_populates="lines")


# ─── Driver / Delivery Management ────────────────────────────
class Driver(Base):
    __tablename__ = "drivers"

    id            = Column(Integer, primary_key=True, index=True)
    company_id    = Column(Integer, ForeignKey("companies.id"), nullable=True, index=True)
    name          = Column(String, nullable=False)
    phone         = Column(String, nullable=True)
    email         = Column(String, nullable=True)
    vehicle_type  = Column(String, nullable=True)   # Van, Truck, Car, Bike
    license_plate = Column(String, nullable=True)
    status        = Column(String, default="Available")  # Available|On Route|Off Duty
    notes         = Column(Text,   nullable=True)
    is_active     = Column(Boolean, default=True)
    created_at    = Column(DateTime, default=datetime.utcnow)

    runs = relationship("DeliveryRun", back_populates="driver")


class DeliveryRun(Base):
    __tablename__ = "delivery_runs"

    id          = Column(Integer, primary_key=True, index=True)
    company_id  = Column(Integer, ForeignKey("companies.id"), nullable=True, index=True)
    run_number  = Column(String, unique=True, index=True, nullable=False)  # RUN-20260306-001
    driver_id   = Column(Integer, ForeignKey("drivers.id"), nullable=True)
    run_date    = Column(Date, nullable=False)
    status      = Column(String, default="Planned")   # Planned|In Progress|Completed|Cancelled
    notes       = Column(Text,  nullable=True)
    created_at  = Column(DateTime, default=datetime.utcnow)

    driver = relationship("Driver", back_populates="runs")
    stops  = relationship(
        "DeliveryStop", back_populates="run",
        order_by="DeliveryStop.sequence_order",
        cascade="all, delete-orphan"
    )


class DeliveryStop(Base):
    __tablename__ = "delivery_stops"

    id             = Column(Integer, primary_key=True, index=True)
    run_id         = Column(Integer, ForeignKey("delivery_runs.id"), nullable=False)
    order_id       = Column(Integer, ForeignKey("orders.id"), nullable=True)
    sequence_order = Column(Integer, default=0)
    customer_name  = Column(String, nullable=False)
    address        = Column(Text,   nullable=True)
    status         = Column(String, default="Pending")  # Pending|Delivered|Failed|Skipped
    delivery_notes = Column(Text,   nullable=True)
    delivered_at   = Column(DateTime, nullable=True)
    created_at     = Column(DateTime, default=datetime.utcnow)

    run   = relationship("DeliveryRun", back_populates="stops")
    order = relationship("Order")


# ─── Users & Auth ─────────────────────────────────────────────
class User(Base):
    __tablename__ = "users"

    id            = Column(Integer, primary_key=True, index=True)
    company_id    = Column(Integer, ForeignKey("companies.id"), nullable=True, index=True)
    username      = Column(String, unique=True, index=True, nullable=False)
    email         = Column(String, unique=True, index=True, nullable=True)
    full_name     = Column(String, nullable=True)
    hashed_password = Column(String, nullable=False)
    role          = Column(String, default="warehouse")  # admin|manager|warehouse|driver|readonly|superadmin
    is_active     = Column(Boolean, default=True)
    must_change_password = Column(Boolean, default=False)
    created_at    = Column(DateTime, default=datetime.utcnow)
    last_login    = Column(DateTime, nullable=True)


# ─── Warehouse Task (every physical movement is a task) ───────
class WarehouseTask(Base):
    """
    Every movement in the warehouse (pick, receive, putaway, transfer, stocktake)
    is represented as a WarehouseTask. This gives full audit trail, FEFO batch
    locking, and the ability to track labour/productivity.
    """
    __tablename__ = "warehouse_tasks"

    id            = Column(Integer, primary_key=True, index=True)
    company_id    = Column(Integer, ForeignKey("companies.id"), nullable=True, index=True)

    # Task type: pick | receive | putaway | transfer | stocktake | block | release
    task_type     = Column(String, nullable=False, index=True)
    # Status: pending → in_progress → confirmed | cancelled
    status        = Column(String, default="pending", nullable=False, index=True)

    # What is being moved
    sku_id        = Column(Integer, ForeignKey("skus.id"), nullable=True)
    batch_id      = Column(Integer, ForeignKey("batches.id"), nullable=True)  # FEFO-locked batch
    warehouse     = Column(String, nullable=True)
    from_bin_id   = Column(Integer, ForeignKey("bin_locations.id"), nullable=True)
    to_bin_id     = Column(Integer, ForeignKey("bin_locations.id"), nullable=True)
    quantity      = Column(Integer, nullable=False, default=0)
    confirmed_qty = Column(Integer, nullable=True)  # actual qty confirmed by worker

    # Source documents
    order_id      = Column(Integer, ForeignKey("orders.id"), nullable=True)
    order_item_id = Column(Integer, ForeignKey("order_items.id"), nullable=True)
    transfer_id   = Column(Integer, ForeignKey("transfers.id"), nullable=True)

    # People
    assigned_to   = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_by    = Column(Integer, ForeignKey("users.id"), nullable=True)

    notes         = Column(Text, nullable=True)
    created_at    = Column(DateTime, default=datetime.utcnow)
    started_at    = Column(DateTime, nullable=True)
    confirmed_at  = Column(DateTime, nullable=True)

    sku           = relationship("SKU")
    batch         = relationship("Batch")
    order         = relationship("Order")


# ─── Credit Notes ─────────────────────────────────────────────
class CreditNote(Base):
    __tablename__ = "credit_notes"
    id             = Column(Integer, primary_key=True, index=True)
    company_id     = Column(Integer, ForeignKey("companies.id"), nullable=True, index=True)
    credit_note_number = Column(String, unique=True, index=True, nullable=False)
    customer_id    = Column(Integer, ForeignKey("customers.id"), nullable=True)
    invoice_id     = Column(Integer, ForeignKey("invoices.id"), nullable=True)
    return_id      = Column(Integer, ForeignKey("customer_returns.id"), nullable=True)
    credit_date    = Column(Date, nullable=False)
    status         = Column(String, default="Open")  # Open|Applied|Void
    reason         = Column(String, nullable=True)   # Return|Price Correction|Goodwill|Other
    subtotal       = Column(Float, default=0.0)
    tax_amount     = Column(Float, default=0.0)
    total          = Column(Float, default=0.0)
    amount_applied = Column(Float, default=0.0)  # amount applied against invoices
    notes          = Column(Text, nullable=True)
    created_at     = Column(DateTime, default=datetime.utcnow)
    customer  = relationship("Customer")
    invoice   = relationship("Invoice")
    items     = relationship("CreditNoteItem", back_populates="credit_note", cascade="all, delete-orphan")

class CreditNoteItem(Base):
    __tablename__ = "credit_note_items"
    id             = Column(Integer, primary_key=True, index=True)
    credit_note_id = Column(Integer, ForeignKey("credit_notes.id"), nullable=False)
    sku_id         = Column(Integer, ForeignKey("skus.id"), nullable=True)
    description    = Column(String, nullable=False)
    qty            = Column(Float, default=1.0)
    unit_price     = Column(Float, default=0.0)
    line_total     = Column(Float, default=0.0)
    credit_note    = relationship("CreditNote", back_populates="items")
    sku            = relationship("SKU")

# ─── Vendor Bills (Accounts Payable) ─────────────────────────
class VendorBill(Base):
    __tablename__ = "vendor_bills"
    id             = Column(Integer, primary_key=True, index=True)
    company_id     = Column(Integer, ForeignKey("companies.id"), nullable=True, index=True)
    bill_number    = Column(String, unique=True, index=True, nullable=False)
    vendor_id      = Column(Integer, ForeignKey("vendors.id"), nullable=True)
    po_id          = Column(Integer, ForeignKey("purchase_orders.id"), nullable=True)
    bill_date      = Column(Date, nullable=False)
    due_date       = Column(Date, nullable=True)
    status         = Column(String, default="Draft")  # Draft|Received|Approved|Paid|Partial|Overdue
    vendor_ref     = Column(String, nullable=True)    # vendor's own invoice number
    subtotal       = Column(Float, default=0.0)
    tax_amount     = Column(Float, default=0.0)
    total          = Column(Float, default=0.0)
    amount_paid    = Column(Float, default=0.0)
    notes          = Column(Text, nullable=True)
    created_at     = Column(DateTime, default=datetime.utcnow)
    vendor    = relationship("Vendor")
    po        = relationship("PurchaseOrder")
    items     = relationship("VendorBillItem", back_populates="bill", cascade="all, delete-orphan")
    payments  = relationship("VendorPayment", back_populates="bill", cascade="all, delete-orphan")

class VendorBillItem(Base):
    __tablename__ = "vendor_bill_items"
    id          = Column(Integer, primary_key=True, index=True)
    bill_id     = Column(Integer, ForeignKey("vendor_bills.id"), nullable=False)
    sku_id      = Column(Integer, ForeignKey("skus.id"), nullable=True)
    description = Column(String, nullable=False)
    qty         = Column(Float, default=1.0)
    unit_cost   = Column(Float, default=0.0)
    line_total  = Column(Float, default=0.0)
    bill        = relationship("VendorBill", back_populates="items")
    sku         = relationship("SKU")

class VendorPayment(Base):
    __tablename__ = "vendor_payments"
    id           = Column(Integer, primary_key=True, index=True)
    company_id   = Column(Integer, ForeignKey("companies.id"), nullable=True, index=True)
    bill_id      = Column(Integer, ForeignKey("vendor_bills.id"), nullable=False)
    payment_date = Column(Date, nullable=False)
    amount       = Column(Float, nullable=False)
    method       = Column(String, default="Bank Transfer")
    reference    = Column(String, nullable=True)
    notes        = Column(Text, nullable=True)
    created_at   = Column(DateTime, default=datetime.utcnow)
    bill = relationship("VendorBill", back_populates="payments")

# ─── Sales Quotations ─────────────────────────────────────────
class Quote(Base):
    __tablename__ = "quotes"
    id            = Column(Integer, primary_key=True, index=True)
    company_id    = Column(Integer, ForeignKey("companies.id"), nullable=True, index=True)
    quote_number  = Column(String, unique=True, index=True, nullable=False)
    customer_id   = Column(Integer, ForeignKey("customers.id"), nullable=True)
    store_name    = Column(String, nullable=False)
    quote_date    = Column(Date, nullable=False)
    expiry_date   = Column(Date, nullable=True)
    status        = Column(String, default="Draft")  # Draft|Sent|Accepted|Rejected|Expired|Converted
    order_id      = Column(Integer, ForeignKey("orders.id"), nullable=True)  # if converted
    subtotal      = Column(Float, default=0.0)
    discount_amount = Column(Float, default=0.0)
    tax_amount    = Column(Float, default=0.0)
    total         = Column(Float, default=0.0)
    notes         = Column(Text, nullable=True)
    terms         = Column(Text, nullable=True)
    created_at    = Column(DateTime, default=datetime.utcnow)
    customer = relationship("Customer")
    order    = relationship("Order")
    items    = relationship("QuoteItem", back_populates="quote", cascade="all, delete-orphan")

class QuoteItem(Base):
    __tablename__ = "quote_items"
    id          = Column(Integer, primary_key=True, index=True)
    quote_id    = Column(Integer, ForeignKey("quotes.id"), nullable=False)
    sku_id      = Column(Integer, ForeignKey("skus.id"), nullable=True)
    description = Column(String, nullable=False)
    qty         = Column(Float, default=1.0)
    unit_price  = Column(Float, default=0.0)
    line_total  = Column(Float, default=0.0)
    notes       = Column(Text, nullable=True)
    quote       = relationship("Quote", back_populates="items")
    sku         = relationship("SKU")

# ─── Audit Log ────────────────────────────────────────────────
class AuditLog(Base):
    __tablename__ = "audit_log"
    id          = Column(Integer, primary_key=True, index=True)
    company_id  = Column(Integer, ForeignKey("companies.id"), nullable=True, index=True)
    user_id     = Column(Integer, ForeignKey("users.id"), nullable=True)
    username    = Column(String, nullable=True)
    action      = Column(String, nullable=False)   # create|update|delete|login|dispatch|receive|payment
    entity_type = Column(String, nullable=True)    # order|invoice|customer|sku|po|batch...
    entity_id   = Column(Integer, nullable=True)
    entity_ref  = Column(String, nullable=True)    # human-readable ref e.g. ORD-20260101-0001
    detail      = Column(Text, nullable=True)      # JSON or text description of what changed
    ip_address  = Column(String, nullable=True)
    created_at  = Column(DateTime, default=datetime.utcnow, index=True)


# ─── Order Check (AI-powered dispatch verification) ───────────
class OrderCheckRecord(Base):
    __tablename__ = "order_check_records"

    id              = Column(Integer, primary_key=True, index=True)
    company_id      = Column(Integer, ForeignKey("companies.id"), nullable=True, index=True)
    order_ref       = Column(String,  nullable=True)     # optional ref e.g. order no / customer name
    checker_name    = Column(String,  nullable=True)
    order_photo_b64 = Column(Text,    nullable=True)     # base64 of the paper order photo
    box_photos_b64  = Column(Text,    nullable=True)     # JSON array of base64 box photos
    items_matched   = Column(Text,    nullable=True)     # JSON — correct picks
    items_missing   = Column(Text,    nullable=True)     # JSON — in order but not on floor
    items_extra     = Column(Text,    nullable=True)     # JSON — on floor but NOT in order (wrong pick)
    items_manual    = Column(Text,    nullable=True)     # JSON — no-box items confirmed manually
    notes           = Column(Text,    nullable=True)
    created_at      = Column(DateTime, default=datetime.utcnow, index=True)


# ─── Repacking / Production ───────────────────────────────────
class BillOfMaterial(Base):
    __tablename__ = "bill_of_materials"
    id                 = Column(Integer, primary_key=True, index=True)
    company_id         = Column(Integer, ForeignKey("companies.id"), nullable=True, index=True)
    output_sku_id      = Column(Integer, ForeignKey("skus.id"), nullable=False)   # retail/finished
    input_sku_id       = Column(Integer, ForeignKey("skus.id"), nullable=False)   # bulk raw material
    qty_per_unit       = Column(Float,   nullable=False)   # kg of bulk per 1 retail box
    unit               = Column(String(20), default="kg")
    waste_pct_allowed  = Column(Float, default=2.0)        # acceptable waste % threshold
    notes              = Column(String, nullable=True)
    created_at         = Column(DateTime, default=datetime.utcnow)

class PackingRun(Base):
    __tablename__ = "packing_runs"
    id             = Column(Integer, primary_key=True, index=True)
    company_id     = Column(Integer, ForeignKey("companies.id"), nullable=True, index=True)
    run_ref        = Column(String, nullable=True)          # order ref or batch label
    status         = Column(String(20), default="open")     # open | closed
    started_by     = Column(String, nullable=True)
    notes          = Column(String, nullable=True)
    created_at     = Column(DateTime, default=datetime.utcnow)
    closed_at      = Column(DateTime, nullable=True)
    # Filled at close time
    theoretical_kg = Column(Float, nullable=True)
    actual_kg      = Column(Float, nullable=True)
    variance_kg    = Column(Float, nullable=True)
    variance_pct   = Column(Float, nullable=True)
    flag_high_variance = Column(Boolean, default=False)
    landed_cost_id = Column(Integer, ForeignKey("landed_costs.id", ondelete='SET NULL'), nullable=True)

class PackingRunOutput(Base):
    __tablename__ = "packing_run_outputs"
    id             = Column(Integer, primary_key=True, index=True)
    run_id         = Column(Integer, ForeignKey("packing_runs.id"), nullable=False)
    sku_id         = Column(Integer, ForeignKey("skus.id"), nullable=False)
    qty_packed     = Column(Float, nullable=False)           # boxes packed
    theoretical_kg = Column(Float, nullable=True)            # filled at close via BOM

class PackingRunBulk(Base):
    __tablename__ = "packing_run_bulk"
    id             = Column(Integer, primary_key=True, index=True)
    run_id         = Column(Integer, ForeignKey("packing_runs.id"), nullable=False)
    bulk_sku_id    = Column(Integer, ForeignKey("skus.id"), nullable=False)
    qty_start      = Column(Float, nullable=False)           # starting weight (kg)
    qty_end        = Column(Float, nullable=True)            # ending weight (kg)
    actual_used    = Column(Float, nullable=True)            # start - end
    theoretical    = Column(Float, nullable=True)
    variance       = Column(Float, nullable=True)            # actual - theoretical (+ = over-use)
    variance_pct   = Column(Float, nullable=True)


# ─── Purchase / Shipment Batch (multi-SKU landed cost header) ──
class LandedCostBatch(Base):
    """One header per purchase/shipment. Shared costs split across line items by weight."""
    __tablename__ = "landed_cost_batches"
    id               = Column(Integer, primary_key=True, index=True)
    company_id       = Column(Integer, ForeignKey("companies.id"), nullable=True, index=True)
    batch_ref        = Column(String, nullable=True)        # e.g. "India Apr 2026"
    supplier         = Column(String, nullable=True)        # e.g. "Spice World Ltd"
    currency         = Column(String(10), default="USD")
    # Shared costs split across all line items proportionally by kg
    shared_freight   = Column(Float, default=0.0)           # sea/air freight
    shared_duty      = Column(Float, default=0.0)           # import duty / customs
    shared_overhead  = Column(Float, default=0.0)           # rent, electricity allocation
    shared_other     = Column(Float, default=0.0)           # misc shared costs
    notes            = Column(String, nullable=True)
    purchase_date    = Column(Date, nullable=True)              # date goods were purchased / invoiced
    exchange_rate    = Column(Float, default=1.0)               # FX rate: 1 unit of currency → base currency (e.g. 1 INR = 0.012 USD → enter 0.012)
    created_at       = Column(DateTime, default=datetime.utcnow)


# ─── Landed Cost (bulk sourcing + import costs) ───────────────
class LandedCost(Base):
    __tablename__ = "landed_costs"
    id                    = Column(Integer, primary_key=True, index=True)
    company_id            = Column(Integer, ForeignKey("companies.id"), nullable=True, index=True)
    purchase_batch_id     = Column(Integer, ForeignKey("landed_cost_batches.id", ondelete="SET NULL"), nullable=True, index=True)
    bulk_sku_id           = Column(Integer, ForeignKey("skus.id"), nullable=False)
    batch_ref             = Column(String, nullable=True)   # e.g. "India Apr 2026"
    qty_kg                = Column(Float, nullable=False)   # total kg in this batch
    cost_material         = Column(Float, default=0.0)      # purchase/FOB price (per-SKU)
    cost_freight          = Column(Float, default=0.0)      # allocated share of freight
    cost_duty             = Column(Float, default=0.0)      # allocated share of duty
    cost_packaging_mat    = Column(Float, default=0.0)      # per-SKU packaging
    cost_labor            = Column(Float, default=0.0)      # per-SKU packing labor
    cost_overhead         = Column(Float, default=0.0)      # allocated share of overhead
    cost_other            = Column(Float, default=0.0)      # allocated share of other
    total_cost            = Column(Float, nullable=True)    # auto-sum of all costs (in entered currency)
    cost_per_kg           = Column(Float, nullable=True)    # total_cost / qty_kg (in entered currency)
    exchange_rate         = Column(Float, default=1.0)      # copied from batch; multiply cost_per_kg to get base-currency rate
    currency              = Column(String(10), default="USD")
    notes                 = Column(String, nullable=True)
    created_at            = Column(DateTime, default=datetime.utcnow)

# ─── Packing Run Costs (production operational costs) ─────────
class PackingRunCost(Base):
    __tablename__ = "packing_run_costs"
    id                    = Column(Integer, primary_key=True, index=True)
    run_id                = Column(Integer, ForeignKey("packing_runs.id"), nullable=False, unique=True)
    cost_packaging_mat    = Column(Float, default=0.0)   # boxes/bags/labels bought for this run
    cost_labor            = Column(Float, default=0.0)   # wages for this run
    cost_overhead         = Column(Float, default=0.0)   # electricity, rent allocation
    cost_other            = Column(Float, default=0.0)   # misc
    labor_hours           = Column(Float, nullable=True) # optional: hours worked
    notes                 = Column(String, nullable=True)
    created_at            = Column(DateTime, default=datetime.utcnow)
    updated_at            = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


def get_engine(db_path="./wms.db"):
    import os
    db_url = os.environ.get("DATABASE_URL", "")
    if db_url:
        # Render/Railway may give "postgres://" — SQLAlchemy needs "postgresql://"
        if db_url.startswith("postgres://"):
            db_url = db_url.replace("postgres://", "postgresql://", 1)
        return create_engine(db_url, pool_pre_ping=True)
    # Default: SQLite for local development
    return create_engine(f"sqlite:///{db_path}", connect_args={"check_same_thread": False})


def create_tables(engine):
    Base.metadata.create_all(bind=engine)
