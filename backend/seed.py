"""Seed sample data for testing"""
from database import SessionLocal
from models import SKU, Vendor, Inventory, Batch, MonthlyConsumption
from datetime import date, timedelta
import random

db = SessionLocal()

# ── Vendors ────────────────────────────────────────────────────
vendors_data = [
    {"name": "ABC Traders", "contact_person": "Ramesh Kumar", "phone": "9876543210", "lead_time_days": 5},
    {"name": "XYZ Foods", "contact_person": "Suresh Patel", "phone": "9876543211", "lead_time_days": 7},
    {"name": "Spice World", "contact_person": "Maria Garcia", "phone": "9876543212", "lead_time_days": 3},
    {"name": "Grain Masters", "contact_person": "John Smith", "phone": "9876543213", "lead_time_days": 10},
]

vendors = []
for v in vendors_data:
    vendor = Vendor(**v)
    db.add(vendor)
    vendors.append(vendor)
db.flush()

# ── SKUs ────────────────────────────────────────────────────────
skus_data = [
    # Spices
    {"sku_code": "TUR-100", "product_name": "Turmeric Powder 100g", "name_es": "Cúrcuma en Polvo 100g", "category": "Spices", "case_size": 24, "avg_shelf_life_days": 365, "reorder_point": 15, "reorder_qty": 60, "vendor_id": 1},
    {"sku_code": "TUR-500", "product_name": "Turmeric Powder 500g", "name_es": "Cúrcuma en Polvo 500g", "category": "Spices", "case_size": 12, "avg_shelf_life_days": 365, "reorder_point": 10, "reorder_qty": 40, "vendor_id": 1},
    {"sku_code": "CHI-100", "product_name": "Red Chilli Powder 100g", "name_es": "Chile Rojo en Polvo 100g", "category": "Spices", "case_size": 24, "avg_shelf_life_days": 365, "reorder_point": 15, "reorder_qty": 60, "vendor_id": 3},
    {"sku_code": "CHI-500", "product_name": "Red Chilli Powder 500g", "name_es": "Chile Rojo en Polvo 500g", "category": "Spices", "case_size": 12, "avg_shelf_life_days": 365, "reorder_point": 10, "reorder_qty": 40, "vendor_id": 3},
    {"sku_code": "CUM-100", "product_name": "Cumin Seeds 100g", "name_es": "Semillas de Comino 100g", "category": "Spices", "case_size": 24, "avg_shelf_life_days": 730, "reorder_point": 10, "reorder_qty": 48, "vendor_id": 3},
    {"sku_code": "COR-100", "product_name": "Coriander Powder 100g", "name_es": "Cilantro en Polvo 100g", "category": "Spices", "case_size": 24, "avg_shelf_life_days": 365, "reorder_point": 12, "reorder_qty": 48, "vendor_id": 3},
    {"sku_code": "GAR-200", "product_name": "Garlic Powder 200g", "name_es": "Ajo en Polvo 200g", "category": "Spices", "case_size": 18, "avg_shelf_life_days": 365, "reorder_point": 8, "reorder_qty": 36, "vendor_id": 3},
    {"sku_code": "GRM-100", "product_name": "Garam Masala 100g", "name_es": "Garam Masala 100g", "category": "Spices", "case_size": 24, "avg_shelf_life_days": 365, "reorder_point": 12, "reorder_qty": 48, "vendor_id": 3},
    # Rice
    {"sku_code": "BAS-1KG", "product_name": "Basmati Rice 1kg", "name_es": "Arroz Basmati 1kg", "category": "Rice", "case_size": 20, "avg_shelf_life_days": 0, "reorder_point": 20, "reorder_qty": 100, "vendor_id": 4},
    {"sku_code": "BAS-5KG", "product_name": "Basmati Rice 5kg", "name_es": "Arroz Basmati 5kg", "category": "Rice", "case_size": 10, "avg_shelf_life_days": 0, "reorder_point": 15, "reorder_qty": 60, "vendor_id": 4},
    {"sku_code": "SON-5KG", "product_name": "Sona Masoori Rice 5kg", "name_es": "Arroz Sona Masoori 5kg", "category": "Rice", "case_size": 10, "avg_shelf_life_days": 0, "reorder_point": 20, "reorder_qty": 80, "vendor_id": 4},
    {"sku_code": "IND-25KG", "product_name": "India Gate Rice 25kg", "name_es": "Arroz India Gate 25kg", "category": "Rice", "case_size": 2, "avg_shelf_life_days": 0, "reorder_point": 10, "reorder_qty": 40, "vendor_id": 4},
    # Dals
    {"sku_code": "TOR-500", "product_name": "Toor Dal 500g", "name_es": "Lentejas Toor 500g", "category": "Dals", "case_size": 20, "avg_shelf_life_days": 730, "reorder_point": 15, "reorder_qty": 60, "vendor_id": 2},
    {"sku_code": "TOR-1KG", "product_name": "Toor Dal 1kg", "name_es": "Lentejas Toor 1kg", "category": "Dals", "case_size": 10, "avg_shelf_life_days": 730, "reorder_point": 12, "reorder_qty": 48, "vendor_id": 2},
    {"sku_code": "CHN-500", "product_name": "Chana Dal 500g", "name_es": "Dal de Garbanzo 500g", "category": "Dals", "case_size": 20, "avg_shelf_life_days": 730, "reorder_point": 10, "reorder_qty": 40, "vendor_id": 2},
    {"sku_code": "MAS-500", "product_name": "Masoor Dal 500g", "name_es": "Lentejas Rojas 500g", "category": "Dals", "case_size": 20, "avg_shelf_life_days": 730, "reorder_point": 10, "reorder_qty": 40, "vendor_id": 2},
    {"sku_code": "MOO-500", "product_name": "Moong Dal 500g", "name_es": "Lentejas Verdes 500g", "category": "Dals", "case_size": 20, "avg_shelf_life_days": 730, "reorder_point": 8, "reorder_qty": 40, "vendor_id": 2},
    # Flour
    {"sku_code": "ATT-5KG", "product_name": "Wheat Atta 5kg", "name_es": "Harina de Trigo 5kg", "category": "Flour", "case_size": 8, "avg_shelf_life_days": 180, "reorder_point": 15, "reorder_qty": 60, "vendor_id": 4},
    {"sku_code": "MAI-1KG", "product_name": "Maida 1kg", "name_es": "Harina Refinada 1kg", "category": "Flour", "case_size": 20, "avg_shelf_life_days": 180, "reorder_point": 10, "reorder_qty": 40, "vendor_id": 4},
    {"sku_code": "BES-500", "product_name": "Besan 500g", "name_es": "Harina de Garbanzo 500g", "category": "Flour", "case_size": 20, "avg_shelf_life_days": 365, "reorder_point": 10, "reorder_qty": 40, "vendor_id": 4},
    # Oil
    {"sku_code": "SUN-1L", "product_name": "Sunflower Oil 1L", "name_es": "Aceite de Girasol 1L", "category": "Oil", "case_size": 12, "avg_shelf_life_days": 540, "reorder_point": 15, "reorder_qty": 60, "vendor_id": 1},
    {"sku_code": "MUS-1L", "product_name": "Mustard Oil 1L", "name_es": "Aceite de Mostaza 1L", "category": "Oil", "case_size": 12, "avg_shelf_life_days": 365, "reorder_point": 10, "reorder_qty": 48, "vendor_id": 1},
    # Sugar & Salt
    {"sku_code": "SUG-1KG", "product_name": "Sugar 1kg", "name_es": "Azúcar 1kg", "category": "Sugar & Salt", "case_size": 20, "avg_shelf_life_days": 0, "reorder_point": 20, "reorder_qty": 80, "vendor_id": 2},
    {"sku_code": "SAL-1KG", "product_name": "Iodized Salt 1kg", "name_es": "Sal Yodada 1kg", "category": "Sugar & Salt", "case_size": 20, "avg_shelf_life_days": 0, "reorder_point": 15, "reorder_qty": 60, "vendor_id": 2},
]

skus = []
for s in skus_data:
    sku = SKU(**s)
    db.add(sku)
    skus.append(sku)
db.flush()

# ── Inventory + Batches ─────────────────────────────────────────
today = date.today()
random.seed(42)

for sku in skus:
    # Init inventory
    wh1_inv = Inventory(sku_id=sku.id, warehouse="WH1", cases_on_hand=0)
    wh2_inv = Inventory(sku_id=sku.id, warehouse="WH2", cases_on_hand=0)
    db.add(wh1_inv)
    db.add(wh2_inv)
    db.flush()

    # Create 1-3 batches per SKU
    num_batches = random.randint(1, 3)
    for b_idx in range(num_batches):
        wh = "WH1" if b_idx == 0 else "WH2"
        cases = random.randint(5, 40)
        received = today - timedelta(days=random.randint(5, 90))

        expiry = None
        has_expiry = sku.avg_shelf_life_days > 0
        if has_expiry:
            expiry = received + timedelta(days=sku.avg_shelf_life_days + random.randint(-30, 30))

        batch = Batch(
            batch_code=f"BATCH-{sku.sku_code}-{received.strftime('%Y%m%d')}-{chr(65+b_idx)}",
            sku_id=sku.id,
            cases_received=cases,
            cases_remaining=cases,
            warehouse=wh,
            received_date=received,
            expiry_date=expiry,
            has_expiry=has_expiry,
            supplier_ref=f"INV-{random.randint(1000,9999)}",
        )
        db.add(batch)

        # Update inventory
        if wh == "WH1":
            wh1_inv.cases_on_hand += cases
        else:
            wh2_inv.cases_on_hand += cases

    # Seed monthly consumption for last 4 months
    for m_offset in range(4):
        month = ((today.month - m_offset - 1) % 12) + 1
        year = today.year if today.month - m_offset > 0 else today.year - 1
        dispatched = random.randint(10, 80)
        received_qty = random.randint(20, 100)
        mc = MonthlyConsumption(
            sku_id=sku.id,
            year=year,
            month=month,
            cases_dispatched=dispatched,
            cases_received=received_qty,
        )
        db.add(mc)

db.commit()
print(f"✅ Seeded {len(vendors_data)} vendors and {len(skus_data)} SKUs with inventory and monthly data")
db.close()
