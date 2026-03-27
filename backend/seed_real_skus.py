"""
Seed script: clear all existing inventory/SKU data and load real product list
from the 3 GAZAB / KOHINOOR / ROYAL product images.

Format parsing:
  "GAZAB BLACK PEPPER POWDER 20x100G"  → case_size=20, unit_label="100g packs"
  "GAZAB ALMOND 20x200G"               → case_size=20, unit_label="200g packs"
  "GAZAB COW GHEE (GRASS FED) 6x1600G" → case_size=6,  unit_label="1600g jars"
  No size/count given                  → case_size=1,  unit_label="units"
"""

import sys, os
sys.path.append(os.path.dirname(__file__))

from database import SessionLocal, engine
from models import (
    Base, SKU, Inventory, Batch, Category,
    DispatchRecord, DispatchRecordItem, MonthlyConsumption,
    InventoryAdjustment, Vendor, Order, OrderItem, Transfer, Warehouse
)

db = SessionLocal()

# ─────────────────────────────────────────────────────────────────
# 1. DELETE existing transactional + SKU data (keep warehouses, categories, vendors)
# ─────────────────────────────────────────────────────────────────
print("Clearing existing data…")
db.query(DispatchRecordItem).delete()
db.query(DispatchRecord).delete()
db.query(MonthlyConsumption).delete()
db.query(InventoryAdjustment).delete()
db.query(Batch).delete()
db.query(Inventory).delete()
db.query(OrderItem).delete()
db.query(Order).delete()
db.query(Transfer).delete()
db.query(SKU).delete()
db.commit()
print("  ✓ All old SKUs and stock cleared")

# ─────────────────────────────────────────────────────────────────
# 2. Ensure categories exist
# ─────────────────────────────────────────────────────────────────
needed_cats = [
    "Spices", "Rice", "Dals & Lentils", "Nuts & Dry Fruits",
    "Seeds", "Flour & Grains", "Snacks", "Ghee & Oil",
    "Frozen", "Other"
]
existing_cats = {c.name for c in db.query(Category).all()}
for i, name in enumerate(needed_cats):
    if name not in existing_cats:
        db.add(Category(name=name, sort_order=i, is_active=True))
db.commit()
print("  ✓ Categories ready")

# ─────────────────────────────────────────────────────────────────
# 3. SKU data extracted from images
#    Fields: sku_code, product_name, case_size, unit_label, category, avg_shelf_life_days
#
#    Description format NxMG / NxMLB etc:
#      N  = case_size (number of units per case)
#      M  = unit size label
# ─────────────────────────────────────────────────────────────────

SKUS = [
    # ── FROZEN ──────────────────────────────────────────────────
    ("GFRSLMC",  "GAZAB (FROZEN/BULK) LADDU (MOTICHOOR) 5x1KG",     5,  "1kg bags",     "Frozen",          180),
    ("GFRSLN",   "GAZAB (FROZEN/BULK) LADDU (NAVRATTAN) 5x1KG",     5,  "1kg bags",     "Frozen",          180),
    ("GFRSMCP",  "GAZAB (FROZEN/BULK) MALAI CHAP 5x0.85KG",         5,  "850g packs",   "Frozen",          180),

    # ── SPICES & SEEDS ──────────────────────────────────────────
    ("GAJS1",    "GAZAB AJWAIN SEEDS 20x100G",                      20,  "100g packs",   "Spices",          730),
    ("GBPP1",    "GAZAB BLACK PEPPER POWDER 20x100G",               20,  "100g packs",   "Spices",          730),
    ("GBPP2",    "GAZAB BLACK PEPPER POWDER 20x200G",               20,  "200g packs",   "Spices",          730),
    ("GBPW1",    "GAZAB BLACK PEPPER WHOLE 20x100G",                20,  "100g packs",   "Spices",          730),
    ("GBPW2",    "GAZAB BLACK PEPPER WHOLE 20x200G",                20,  "200g packs",   "Spices",          730),
    ("GCCP2",    "GAZAB COCONUT POWDER 20x200G",                    20,  "200g packs",   "Spices",          730),
    ("GCCP4",    "GAZAB COCONUT POWDER 20x400G",                    20,  "400g packs",   "Spices",          730),
    ("GCOP2",    "GAZAB CORIANDER POWDER 20x200G",                  20,  "200g packs",   "Spices",          730),
    ("GCOW2",    "GAZAB CORIANDER WHOLE 20x200G",                   20,  "200g packs",   "Spices",          730),
    ("GCRC1",    "GAZAB CRUSHED CHILLI 20x100G",                    20,  "100g packs",   "Spices",          730),
    ("GCRC2",    "GAZAB CRUSHED CHILLI 20x200G",                    20,  "200g packs",   "Spices",          730),
    ("GCRC4",    "GAZAB CRUSHED CHILLI 20x400G",                    20,  "400g packs",   "Spices",          730),
    ("GCUP2",    "GAZAB CUMIN POWDER 20x200G",                      20,  "200g packs",   "Spices",          730),
    ("GCPEH2",   "GAZAB CHILLI POWDER EX-HOT 20x200G",              20,  "200g packs",   "Spices",          730),
    ("GCPK2",    "GAZAB CHILLI POWDER KASHMIRI 20x200G",            20,  "200g packs",   "Spices",          730),
    ("GGCW1",    "GAZAB GREEN CARDAMOM WHOLE 20x100G",              20,  "100g packs",   "Spices",          730),
    ("GGMP2",    "GAZAB GARAM MASALA POWDER 20x200G",               20,  "200g packs",   "Spices",          730),
    ("GKC1",     "GAZAB KABAB CHINI 20x100G",                       20,  "100g packs",   "Spices",          730),
    ("GKLS1",    "GAZAB KALONJI SEEDS 20x100G",                     20,  "100g packs",   "Seeds",           730),
    ("GNMW1",    "GAZAB NUTMEG WHOLE 20x100G",                      20,  "100g packs",   "Spices",          730),
    ("GPPR2",    "GAZAB PANCHPURAN 20x200G",                        20,  "200g packs",   "Spices",          730),
    ("GPSD2",    "GAZAB POPPY SEEDS 20x200G",                       20,  "200g packs",   "Seeds",           730),
    ("GPSDB1",   "GAZAB POPPY SEEDS (BLACK) 20x100G",               20,  "100g packs",   "Seeds",           730),
    ("GPUMS1",   "GAZAB PUMPKIN SEEDS 20x100G",                     20,  "100g packs",   "Seeds",           730),
    ("GPUMS2",   "GAZAB PUMPKIN SEEDS 20x200G",                     20,  "200g packs",   "Seeds",           730),
    ("GSJ1",     "GAZAB SHAH JEERA 20x100G",                        20,  "100g packs",   "Spices",          730),
    ("GSSW2",    "GAZAB SESAME SEEDS (WHITE) 20x200G",              20,  "200g packs",   "Seeds",           730),
    ("GMSD4",    "GAZAB MUSTARD SEEDS 20x400G",                     20,  "400g packs",   "Seeds",           730),
    ("GWPP1",    "GAZAB WHITE PEPPER PWD 20x100G",                  20,  "100g packs",   "Spices",          730),
    ("GWPP2",    "GAZAB WHITE PEPPER PWD 20x200G",                  20,  "200g packs",   "Spices",          730),
    ("GWPW1",    "GAZAB WHITE PEPPER WHOLE 20x100G",                20,  "100g packs",   "Spices",          730),
    ("GTMR2",    "GAZAB TUKMARIA 20x200G",                          20,  "200g packs",   "Seeds",           730),
    ("GGFS2",    "GAZAB GREEN FENNEL SEEDS 20x200G",                20,  "200g packs",   "Seeds",           730),
    ("GGFS4",    "GAZAB GREEN FENNEL SEEDS 20x400G",                20,  "400g packs",   "Seeds",           730),

    # ── NUTS & DRY FRUITS ────────────────────────────────────────
    ("GALD2",    "GAZAB ALMOND 20x200G",                            20,  "200g packs",   "Nuts & Dry Fruits", 365),
    ("GALD4",    "GAZAB ALMOND 20x400G",                            20,  "400g packs",   "Nuts & Dry Fruits", 365),
    ("GALS2",    "GAZAB SLIVERED ALMOND 20x200G",                   20,  "200g packs",   "Nuts & Dry Fruits", 365),
    ("GALS4",    "GAZAB SLIVERED ALMOND 20x400G",                   20,  "400g packs",   "Nuts & Dry Fruits", 365),
    ("GALSL4",   "GAZAB SLICED ALMOND 20x400G",                     20,  "400g packs",   "Nuts & Dry Fruits", 365),
    ("GALSLN2",  "GAZAB SLICED ALMOND (NATURAL) 20x200G",           20,  "200g packs",   "Nuts & Dry Fruits", 365),
    ("GGOR4",    "GAZAB GOLDEN RAISINS 20x400G",                    20,  "400g packs",   "Nuts & Dry Fruits", 365),
    ("GGRS2",    "GAZAB GREEN RAISINS SUNDERKHANI 20x200G",         20,  "200g packs",   "Nuts & Dry Fruits", 365),
    ("GCPCS2",   "GAZAB CASHEW PIECES 20x200G",                     20,  "200g packs",   "Nuts & Dry Fruits", 365),
    ("GCPCS4",   "GAZAB CASHEW PIECES 20x400G",                     20,  "400g packs",   "Nuts & Dry Fruits", 365),
    ("GRWP8",    "GAZAB RAW PEANUTS 20x800G",                       20,  "800g packs",   "Nuts & Dry Fruits", 365),
    ("GWH2",     "GAZAB WALNUT HALVES 20x200G",                     20,  "200g packs",   "Nuts & Dry Fruits", 365),

    # ── GHEE ─────────────────────────────────────────────────────
    ("GCG9",     "GAZAB COW GHEE (GRASS FED) 6x1600G",              6,  "1600g jars",   "Ghee & Oil",      365),

    # ── DALS & LENTILS ───────────────────────────────────────────
    ("GDJP2",    "GAZAB DHANA JEERA PWD (CORIANDER CUMIN) 20x200G", 20, "200g packs",   "Spices",          730),
    ("GDLC2",    "GAZAB CHANA DAL 20x2LB",                          20,  "2lb bags",     "Dals & Lentils",  730),
    ("GDLKB2",   "GAZAB KABULI CHANA 20x2LB",                       20,  "2lb bags",     "Dals & Lentils",  730),
    ("GDLKB4",   "GAZAB KABULI CHANA 10x4LB",                       10,  "4lb bags",     "Dals & Lentils",  730),
    ("GDLKBL2",  "GAZAB KINDEY BEANS (LIGHT) 20x2LB",               20,  "2lb bags",     "Dals & Lentils",  730),
    ("GDLKC2",   "GAZAB KALA CHANA 20x2LB",                         20,  "2lb bags",     "Dals & Lentils",  730),
    ("GDLKC4",   "GAZAB KALA CHANA 10x4LB",                         10,  "4lb bags",     "Dals & Lentils",  730),
    ("GDLKR4",   "GAZAB RED KASHMIRI KIDNEY BEANS 10x4LB",          10,  "4lb bags",     "Dals & Lentils",  730),
    ("GDLM2",    "GAZAB MOONG DAL 20x2LB",                          20,  "2lb bags",     "Dals & Lentils",  730),
    ("GDLM4",    "GAZAB MOONG DAL 10x4LB",                          10,  "4lb bags",     "Dals & Lentils",  730),
    ("GDLMR4",   "GAZAB MASOOR DAL 10x4LB",                         10,  "4lb bags",     "Dals & Lentils",  730),
    ("GDLMRF4",  "GAZAB MASOOR (FOOTBALL) 10x4LB",                  10,  "4lb bags",     "Dals & Lentils",  730),
    ("GDLMRM4",  "GAZAB MASOOR (MATKI) 10x4LB",                     10,  "4lb bags",     "Dals & Lentils",  730),
    ("GDLU2",    "GAZAB URAD DAL 20x2LB",                           20,  "2lb bags",     "Dals & Lentils",  730),
    ("GDLU4",    "GAZAB URAD DAL 10x4LB",                           10,  "4lb bags",     "Dals & Lentils",  730),

    # ── SNACKS ───────────────────────────────────────────────────
    ("GFSCS10",  "GAZAB SNACKS CASHEW (SPICY) 10x10OZ",             10,  "10oz bags",    "Snacks",          365),
    ("GFSCSP10", "GAZAB SNACKS CASHEW (SALT & PEPPER) 10x10OZ",     10,  "10oz bags",    "Snacks",          365),
    ("GFSPS10",  "GAZAB SNACKS PEANUTS (SPICY) 10x10OZ",            10,  "10oz bags",    "Snacks",          365),
    ("GFSNP340", "GAZAB SNACKS NAMAK PARA 12x340G",                 12,  "340g packs",   "Snacks",          365),
    ("GFT40",    "GAZAB FATKARI 40x200G",                           40,  "200g packs",   "Snacks",          365),
    ("GTCS2",    "GAZAB TILL CHIKKI SQUARE 20x200G",                20,  "200g packs",   "Snacks",          365),
    ("HVPB2",    "HERITAGE V. PEANUT BAR/CHIKKI 50x200G",           50,  "200g packs",   "Snacks",          365),

    # ── RICE ─────────────────────────────────────────────────────
    ("KHBS1",    "KOHINOOR SILVER (EXTRA FINE) RICE 4x10LB",         4,  "10lb bags",    "Rice",            730),
    ("KHBSM20",  "KOHINOOR SONA MASOORI 2x20LB",                     2,  "20lb bags",    "Rice",            730),
    ("RYBB10",   "ROYAL BASMATI RICE (BROWN) 10LB",                  1,  "10lb bags",    "Rice",            730),
    ("RYBW10",   "ROYAL BASMATI RICE WHITE (POLY BAG) 10LB",         1,  "10lb bags",    "Rice",            730),
    ("RYCSP12",  "ROYAL CHEF'S SECRET BASMATI RICE 10LB + 20% EXTRA",1,  "10lb bags",    "Rice",            730),
    ("RYS10",    "ROYAL SELLA BASMATI RICE 10LB",                    1,  "10lb bags",    "Rice",            730),
]

# ─────────────────────────────────────────────────────────────────
# 4. Insert SKUs (skip duplicates by sku_code)
# ─────────────────────────────────────────────────────────────────
print(f"\nInserting {len(SKUS)} SKUs…")
inserted = 0
skipped  = 0

for sku_code, product_name, case_size, unit_label, category, shelf_life in SKUS:
    exists = db.query(SKU).filter(SKU.sku_code == sku_code).first()
    if exists:
        print(f"  ⚠  SKIP duplicate: {sku_code}")
        skipped += 1
        continue

    db.add(SKU(
        sku_code           = sku_code,
        product_name       = product_name,
        name_es            = None,
        category           = category,
        case_size          = case_size,
        unit_label         = unit_label,
        pallet_size        = None,
        avg_shelf_life_days= shelf_life,
        reorder_point      = 5,
        reorder_qty        = 20,
        max_stock          = 200,
        lead_time_days     = 14,
        vendor_id          = None,
        is_active          = True,
    ))
    inserted += 1

db.commit()
print(f"  ✓ Inserted {inserted} SKUs, skipped {skipped} duplicates")
print("\nDone! Restart the backend server to reflect changes.")
db.close()
