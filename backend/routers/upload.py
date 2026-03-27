from fastapi import APIRouter, UploadFile, File, Depends, HTTPException
from sqlalchemy.orm import Session
import pdfplumber
import re
import io
from typing import List, Optional
from datetime import date

import sys, os
sys.path.append(os.path.dirname(os.path.dirname(__file__)))
from database import get_db
from models import SKU, Category, Inventory

# Optional OCR support — gracefully disabled if not installed
try:
    import pytesseract
    from PIL import Image, ImageFilter, ImageEnhance
    OCR_AVAILABLE = True
except ImportError:
    OCR_AVAILABLE = False

# Optional Excel support
try:
    import openpyxl
    EXCEL_AVAILABLE = True
except ImportError:
    EXCEL_AVAILABLE = False

router = APIRouter(prefix="/upload", tags=["Upload"])


def parse_date(text: str) -> Optional[str]:
    """Try to parse various date formats from PDF text"""
    patterns = [
        r'(\d{2})[/\-\.](\d{2})[/\-\.](\d{4})',   # DD/MM/YYYY or DD-MM-YYYY
        r'(\d{4})[/\-\.](\d{2})[/\-\.](\d{2})',   # YYYY-MM-DD
        r'(\d{2})[/\-\.](\d{4})',                   # MM/YYYY
        r'(\d{2})\s+(\w{3})\s+(\d{4})',            # DD Mon YYYY
    ]
    months = {'jan':1,'feb':2,'mar':3,'apr':4,'may':5,'jun':6,
              'jul':7,'aug':8,'sep':9,'oct':10,'nov':11,'dec':12}

    for pat in patterns:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            groups = m.groups()
            try:
                if len(groups) == 3:
                    g = groups
                    if g[2].isdigit() and len(g[2]) == 4:
                        # DD/MM/YYYY
                        return f"{g[2]}-{g[1].zfill(2)}-{g[0].zfill(2)}"
                    elif g[0].isdigit() and len(g[0]) == 4:
                        # YYYY-MM-DD
                        return f"{g[0]}-{g[1].zfill(2)}-{g[2].zfill(2)}"
                    else:
                        # DD Mon YYYY
                        mon = months.get(g[1].lower()[:3], 1)
                        return f"{g[2]}-{str(mon).zfill(2)}-{g[0].zfill(2)}"
                elif len(groups) == 2:
                    return f"{groups[1]}-{groups[0].zfill(2)}-01"
            except:
                continue
    return None


def extract_quantity(text: str) -> Optional[int]:
    """Extract case/box quantity from text"""
    patterns = [
        r'(\d+)\s*(?:cases?|boxes?|ctns?|cartons?|pkts?)',
        r'(?:qty|quantity|pcs|units?)[\s:]+(\d+)',
        r'^\s*(\d+)\s*$',
    ]
    for pat in patterns:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            return int(m.group(1))
    # Try plain number
    m = re.search(r'\b(\d{1,4})\b', text)
    if m:
        val = int(m.group(1))
        if 1 <= val <= 9999:
            return val
    return None


def match_sku(text: str, skus: list) -> Optional[dict]:
    """Try to match text against known SKUs"""
    text_lower = text.lower()

    best_match = None
    best_score = 0

    for sku in skus:
        score = 0
        name_lower = sku.product_name.lower()
        code_lower = sku.sku_code.lower()

        # Exact code match
        if code_lower in text_lower:
            score += 100
        # Name words match
        words = [w for w in name_lower.split() if len(w) > 2]
        matched = sum(1 for w in words if w in text_lower)
        score += matched * 20

        if score > best_score and score >= 20:
            best_score = score
            best_match = sku

    return best_match


@router.post("/pdf-invoice")
async def parse_pdf_invoice(
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    """
    Parse a supplier PDF invoice/packing list.
    Returns a list of detected line items with matched SKUs.
    """
    if not file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Only PDF files are supported")

    content = await file.read()
    skus = db.query(SKU).filter(SKU.is_active == True).all()

    extracted_items = []
    raw_text_lines = []

    try:
        with pdfplumber.open(io.BytesIO(content)) as pdf:
            for page in pdf.pages:
                # Try table extraction first
                tables = page.extract_tables()
                if tables:
                    for table in tables:
                        for row in table:
                            if not row or all(c is None or str(c).strip() == '' for c in row):
                                continue
                            row_text = ' | '.join(str(c or '').strip() for c in row)
                            raw_text_lines.append(row_text)

                            # Try to extract data from row
                            full_text = ' '.join(str(c or '') for c in row)
                            matched_sku = match_sku(full_text, skus)

                            # Find quantity in any cell
                            qty = None
                            for cell in row:
                                if cell:
                                    qty = extract_quantity(str(cell))
                                    if qty:
                                        break

                            # Find expiry date in any cell
                            expiry = None
                            for cell in row:
                                if cell:
                                    expiry = parse_date(str(cell))
                                    if expiry:
                                        break

                            if matched_sku or qty:
                                extracted_items.append({
                                    "raw_text": row_text[:100],
                                    "matched_sku_id": matched_sku.id if matched_sku else None,
                                    "matched_sku_code": matched_sku.sku_code if matched_sku else None,
                                    "matched_product_name": matched_sku.product_name if matched_sku else None,
                                    "cases": qty,
                                    "expiry_date": expiry,
                                    "confidence": "high" if matched_sku else "low",
                                })

                # Also extract raw text for unstructured PDFs
                text = page.extract_text()
                if text:
                    for line in text.split('\n'):
                        line = line.strip()
                        if len(line) < 3:
                            continue
                        raw_text_lines.append(line)

                        if not tables:
                            matched_sku = match_sku(line, skus)
                            qty = extract_quantity(line)
                            expiry = parse_date(line)

                            if matched_sku or qty:
                                # Avoid duplicates
                                already = any(
                                    i.get('matched_sku_id') == (matched_sku.id if matched_sku else None)
                                    and i.get('cases') == qty
                                    for i in extracted_items
                                )
                                if not already:
                                    extracted_items.append({
                                        "raw_text": line[:100],
                                        "matched_sku_id": matched_sku.id if matched_sku else None,
                                        "matched_sku_code": matched_sku.sku_code if matched_sku else None,
                                        "matched_product_name": matched_sku.product_name if matched_sku else None,
                                        "cases": qty,
                                        "expiry_date": expiry,
                                        "confidence": "high" if matched_sku and qty else "low",
                                    })

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"PDF parsing failed: {str(e)}")

    # Deduplicate and filter low-confidence with no useful data
    seen = set()
    final_items = []
    for item in extracted_items:
        key = (item['matched_sku_id'], item['cases'])
        if key not in seen and (item['matched_sku_id'] or item['cases']):
            seen.add(key)
            final_items.append(item)

    return {
        "filename": file.filename,
        "pages_processed": 1,
        "items_detected": len(final_items),
        "items": final_items,
        "raw_preview": raw_text_lines[:20],  # First 20 lines for debugging
    }


@router.post("/image-dispatch")
async def parse_image_dispatch(
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    """
    Parse a photo or scanned image of a dispatch/packing list.
    Uses OCR to extract text then matches against SKUs by name or code.
    Accepts: jpg, jpeg, png, webp, bmp, tiff
    """
    if not OCR_AVAILABLE:
        raise HTTPException(status_code=503, detail="OCR not available on this server. Please install pytesseract and tesseract.")

    allowed = {'.jpg', '.jpeg', '.png', '.webp', '.bmp', '.tiff', '.tif'}
    ext = os.path.splitext(file.filename or '')[1].lower()
    if ext not in allowed:
        raise HTTPException(status_code=400, detail=f"Unsupported file type '{ext}'. Please upload a JPG, PNG, or WEBP image.")

    content = await file.read()
    skus = db.query(SKU).filter(SKU.is_active == True).all()

    try:
        # Open and pre-process image for better OCR accuracy
        img = Image.open(io.BytesIO(content))

        # Convert to RGB if needed (handles RGBA/palette modes)
        if img.mode not in ('RGB', 'L'):
            img = img.convert('RGB')

        # Upscale small images — OCR works better at higher DPI
        w, h = img.size
        if w < 1000:
            scale = 1000 / w
            img = img.resize((int(w * scale), int(h * scale)), Image.LANCZOS)

        # Enhance contrast for printed lists
        img = ImageEnhance.Contrast(img).enhance(2.0)
        img = ImageEnhance.Sharpness(img).enhance(2.0)

        # Run OCR
        raw_text = pytesseract.image_to_string(img, lang='eng', config='--psm 6')

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Image processing failed: {str(e)}")

    # Parse lines — same logic as PDF text extraction
    extracted_items = []
    raw_text_lines = []
    seen = set()

    for line in raw_text.split('\n'):
        line = line.strip()
        if len(line) < 3:
            continue
        raw_text_lines.append(line)

        matched_sku = match_sku(line, skus)
        qty = extract_quantity(line)

        if matched_sku or qty:
            key = (matched_sku.id if matched_sku else None, qty)
            if key in seen:
                continue
            seen.add(key)
            extracted_items.append({
                "raw_text": line[:120],
                "matched_sku_id": matched_sku.id if matched_sku else None,
                "matched_sku_code": matched_sku.sku_code if matched_sku else None,
                "matched_product_name": matched_sku.product_name if matched_sku else None,
                "cases": qty,
                "expiry_date": None,          # dispatch list typically has no expiry
                "confidence": "high" if matched_sku and qty else "low",
            })

    return {
        "filename": file.filename,
        "pages_processed": 1,
        "items_detected": len(extracted_items),
        "items": extracted_items,
        "raw_preview": raw_text_lines[:30],
    }


@router.get("/lookup-barcode/{barcode}")
def lookup_barcode(barcode: str, db: Session = Depends(get_db)):
    """
    Look up a scanned barcode against the SKU database.
    Priority: barcode field → exact sku_code → partial sku_code.
    """
    def _sku_result(sku, **extra):
        return {
            "found": True,
            "sku_id": sku.id,
            "sku_code": sku.sku_code,
            "barcode": sku.barcode,
            "product_name": sku.product_name,
            "name_es": sku.name_es,
            "category": sku.category,
            "case_size": sku.case_size,
            "vendor_name": sku.vendor.name if sku.vendor else None,
            **extra,
        }

    # 1. Exact match on barcode field (UPC/EAN-13)
    sku = db.query(SKU).filter(SKU.barcode == barcode, SKU.is_active == True).first()
    if sku:
        return _sku_result(sku)

    # 2. Exact match on SKU code
    sku = db.query(SKU).filter(SKU.sku_code == barcode, SKU.is_active == True).first()
    if sku:
        return _sku_result(sku)

    # 3. Partial match on SKU code
    sku = db.query(SKU).filter(SKU.sku_code.ilike(f"%{barcode}%"), SKU.is_active == True).first()
    if sku:
        return _sku_result(sku, partial_match=True)

    return {
        "found": False,
        "barcode": barcode,
        "message": "Barcode not found in SKU database. You can add it as a new SKU.",
    }


# ──────────────────────────────────────────────────────────────────────────────
# Bulk SKU Upload helpers
# ──────────────────────────────────────────────────────────────────────────────

# Column name aliases accepted in the uploaded file
_CODE_ALIASES   = {"sku code","sku_code","item code","item_code","code","sku","barcode","id"}
_NAME_ALIASES   = {"product name","product_name","name","description","item name","item_name","product"}
_CAT_ALIASES    = {"category","cat","group","type","department"}
_WH1_ALIASES    = {"wh1","wh1 stock","wh1_stock","wh1 cases","stock wh1","warehouse 1","main stock"}
_WH2_ALIASES    = {"wh2","wh2 stock","wh2_stock","wh2 cases","stock wh2","warehouse 2","overflow stock"}
_STOCK_ALIASES  = {"stock","cases","qty","quantity","total stock","opening stock","on hand","on_hand"}
_SIZE_ALIASES   = {"case size","case_size","units per case","units/case","pack size"}
_LABEL_ALIASES  = {"unit label","unit_label","unit","units","pack type"}


def _normalise(s: str) -> str:
    return s.strip().lower().replace("-", " ").replace("/", " ")


def _find_col(headers: list, aliases: set) -> Optional[int]:
    """Return index of first header that matches any alias, else None."""
    for i, h in enumerate(headers):
        if _normalise(str(h or "")) in aliases:
            return i
    return None


def _parse_rows_from_text(raw_text: str) -> list:
    """
    Fallback: try to extract tabular data from free text
    (OCR output from image/PDF with no table structure).
    Each line that contains a plausible SKU code (uppercase alphanum 2-10 chars)
    is treated as one row.
    """
    rows = []
    sku_re = re.compile(r'\b([A-Z][A-Z0-9]{1,9})\b')
    for line in raw_text.splitlines():
        line = line.strip()
        if len(line) < 4:
            continue
        codes = sku_re.findall(line)
        # Remove very common words that look like codes
        codes = [c for c in codes if c not in ("THE","AND","FOR","WITH","FROM","THIS","THAT","CASE")]
        if not codes:
            continue
        # Rest of the line after the code = product name candidate
        code = codes[0]
        name_part = line[line.upper().find(code) + len(code):].strip(" :-|")
        name_part = re.sub(r'\s+', ' ', name_part)
        rows.append({"sku_code": code, "product_name": name_part or code, "category": "", "stock": 0})
    return rows


def _extract_rows_from_excel(content: bytes) -> list:
    wb = openpyxl.load_workbook(io.BytesIO(content), read_only=True, data_only=True)
    ws = wb.active
    rows_iter = list(ws.iter_rows(values_only=True))
    if not rows_iter:
        return []

    # Find header row (first row that has recognisable column names)
    header_row_idx = 0
    headers = [str(c or "") for c in rows_iter[0]]
    code_col = _find_col(headers, _CODE_ALIASES)
    if code_col is None and len(rows_iter) > 1:
        headers = [str(c or "") for c in rows_iter[1]]
        code_col = _find_col(headers, _CODE_ALIASES)
        if code_col is not None:
            header_row_idx = 1

    name_col  = _find_col(headers, _NAME_ALIASES)
    cat_col   = _find_col(headers, _CAT_ALIASES)
    wh1_col   = _find_col(headers, _WH1_ALIASES)
    wh2_col   = _find_col(headers, _WH2_ALIASES)
    stk_col   = _find_col(headers, _STOCK_ALIASES)
    size_col  = _find_col(headers, _SIZE_ALIASES)
    label_col = _find_col(headers, _LABEL_ALIASES)

    results = []
    for row in rows_iter[header_row_idx + 1:]:
        cells = [str(c).strip() if c is not None else "" for c in row]
        if not any(cells):
            continue

        code = cells[code_col].upper() if code_col is not None and code_col < len(cells) else ""
        name = cells[name_col] if name_col is not None and name_col < len(cells) else ""
        cat  = cells[cat_col]  if cat_col  is not None and cat_col  < len(cells) else ""

        if not code and not name:
            continue

        # stock resolution: prefer per-WH columns, else total stock column
        wh1_qty = 0
        wh2_qty = 0
        if wh1_col is not None and wh1_col < len(cells):
            try: wh1_qty = int(float(cells[wh1_col]))
            except: pass
        if wh2_col is not None and wh2_col < len(cells):
            try: wh2_qty = int(float(cells[wh2_col]))
            except: pass
        if wh1_qty == 0 and wh2_qty == 0 and stk_col is not None and stk_col < len(cells):
            try: wh1_qty = int(float(cells[stk_col]))
            except: pass

        case_size = 1
        if size_col is not None and size_col < len(cells):
            try: case_size = int(float(cells[size_col]))
            except: pass

        unit_label = "units"
        if label_col is not None and label_col < len(cells) and cells[label_col]:
            unit_label = cells[label_col]

        results.append({
            "sku_code": code or name[:8].upper().replace(" ", ""),
            "product_name": name or code,
            "category": cat,
            "case_size": case_size,
            "unit_label": unit_label,
            "wh1_stock": wh1_qty,
            "wh2_stock": wh2_qty,
        })
    return results


def _extract_rows_from_pdf_text(content: bytes) -> list:
    rows = []
    try:
        with pdfplumber.open(io.BytesIO(content)) as pdf:
            for page in pdf.pages:
                tables = page.extract_tables()
                if tables:
                    for table in tables:
                        if not table or len(table) < 2:
                            continue
                        headers = [str(c or "") for c in table[0]]
                        code_col = _find_col(headers, _CODE_ALIASES)
                        name_col = _find_col(headers, _NAME_ALIASES)
                        cat_col  = _find_col(headers, _CAT_ALIASES)
                        wh1_col  = _find_col(headers, _WH1_ALIASES)
                        wh2_col  = _find_col(headers, _WH2_ALIASES)
                        stk_col  = _find_col(headers, _STOCK_ALIASES)
                        size_col = _find_col(headers, _SIZE_ALIASES)
                        label_col= _find_col(headers, _LABEL_ALIASES)

                        for row in table[1:]:
                            cells = [str(c or "").strip() for c in row]
                            if not any(cells):
                                continue
                            code = cells[code_col].upper() if code_col is not None and code_col < len(cells) else ""
                            name = cells[name_col] if name_col is not None and name_col < len(cells) else ""
                            cat  = cells[cat_col]  if cat_col  is not None and cat_col  < len(cells) else ""
                            if not code and not name:
                                continue

                            wh1_qty = wh2_qty = 0
                            if wh1_col is not None and wh1_col < len(cells):
                                try: wh1_qty = int(float(cells[wh1_col]))
                                except: pass
                            if wh2_col is not None and wh2_col < len(cells):
                                try: wh2_qty = int(float(cells[wh2_col]))
                                except: pass
                            if wh1_qty == 0 and wh2_qty == 0 and stk_col is not None and stk_col < len(cells):
                                try: wh1_qty = int(float(cells[stk_col]))
                                except: pass
                            case_size = 1
                            if size_col is not None and size_col < len(cells):
                                try: case_size = int(float(cells[size_col]))
                                except: pass
                            unit_label = "units"
                            if label_col is not None and label_col < len(cells) and cells[label_col]:
                                unit_label = cells[label_col]

                            rows.append({
                                "sku_code": code or name[:8].upper().replace(" ", ""),
                                "product_name": name or code,
                                "category": cat,
                                "case_size": case_size,
                                "unit_label": unit_label,
                                "wh1_stock": wh1_qty,
                                "wh2_stock": wh2_qty,
                            })
                else:
                    # Free-text fallback
                    text = page.extract_text() or ""
                    rows.extend(_parse_rows_from_text(text))
    except Exception:
        pass
    return rows


def _extract_rows_from_image(content: bytes) -> list:
    if not OCR_AVAILABLE:
        return []
    try:
        img = Image.open(io.BytesIO(content))
        if img.mode not in ('RGB', 'L'):
            img = img.convert('RGB')
        w, h = img.size
        if w < 1000:
            scale = 1000 / w
            img = img.resize((int(w * scale), int(h * scale)), Image.LANCZOS)
        img = ImageEnhance.Contrast(img).enhance(2.0)
        img = ImageEnhance.Sharpness(img).enhance(2.0)
        raw_text = pytesseract.image_to_string(img, lang='eng', config='--psm 6')
        return _parse_rows_from_text(raw_text)
    except Exception:
        return []


@router.post("/bulk-skus/preview")
async def bulk_sku_preview(
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    """
    Parse an Excel / PDF / image file that lists SKUs and return a preview
    of rows that would be created.  Does NOT write to the database.
    Expected columns (flexible naming): Item Code, Name, Category, Stock (WH1/WH2).
    """
    content = await file.read()
    fname = (file.filename or "").lower()
    ext = os.path.splitext(fname)[1]

    # Extract rows depending on file type
    if ext in ('.xlsx', '.xls', '.xlsm'):
        if not EXCEL_AVAILABLE:
            raise HTTPException(status_code=503, detail="Excel parsing not available (openpyxl missing).")
        rows = _extract_rows_from_excel(content)
        parse_method = "excel"
    elif ext == '.pdf':
        rows = _extract_rows_from_pdf_text(content)
        parse_method = "pdf"
    elif ext in ('.jpg', '.jpeg', '.png', '.webp', '.bmp', '.tiff', '.tif'):
        rows = _extract_rows_from_image(content)
        parse_method = "image-ocr"
    else:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{ext}'. Upload .xlsx, .pdf, or an image."
        )

    if not rows:
        return {"filename": file.filename, "parse_method": parse_method, "items": [], "message": "No rows could be extracted from this file."}

    # Fetch existing SKU codes for duplicate check
    existing_codes = {s.sku_code.upper() for s in db.query(SKU.sku_code).all()}

    # Fetch all known categories
    known_cats = {c.name for c in db.query(Category).all()}
    default_cats = {"Spices","Rice","Dals & Lentils","Nuts & Dry Fruits","Seeds",
                    "Flour & Grains","Snacks","Ghee & Oil","Frozen","Other"}
    all_cats = known_cats | default_cats

    preview = []
    seen_in_file = set()
    for r in rows:
        code = (r.get("sku_code") or "").upper().strip()
        name = (r.get("product_name") or "").strip()
        if not code or not name:
            continue
        # De-dup within file
        if code in seen_in_file:
            continue
        seen_in_file.add(code)

        # Normalise category — fuzzy match
        cat_raw = (r.get("category") or "").strip()
        cat = cat_raw
        if cat_raw:
            cat_lower = cat_raw.lower()
            matched_cat = next((c for c in all_cats if c.lower() == cat_lower), None)
            if not matched_cat:
                matched_cat = next(
                    (c for c in all_cats if cat_lower in c.lower() or c.lower() in cat_lower), None
                )
            cat = matched_cat or cat_raw or "Other"
        else:
            cat = "Other"

        status = "duplicate" if code in existing_codes else "new"

        preview.append({
            "sku_code": code,
            "product_name": name,
            "category": cat,
            "case_size": r.get("case_size", 1),
            "unit_label": r.get("unit_label", "units"),
            "wh1_stock": r.get("wh1_stock", 0),
            "wh2_stock": r.get("wh2_stock", 0),
            "status": status,     # "new" or "duplicate"
        })

    return {
        "filename": file.filename,
        "parse_method": parse_method,
        "total_rows": len(preview),
        "new_count": sum(1 for p in preview if p["status"] == "new"),
        "duplicate_count": sum(1 for p in preview if p["status"] == "duplicate"),
        "items": preview,
    }


from pydantic import BaseModel as _BaseModel
from typing import List as TList


class BulkSKUItem(_BaseModel):
    sku_code: str
    product_name: str
    category: str
    case_size: int = 1
    unit_label: str = "units"
    wh1_stock: int = 0
    wh2_stock: int = 0


class BulkSKUConfirmRequest(_BaseModel):
    items: TList[BulkSKUItem]
    skip_duplicates: bool = True


@router.post("/bulk-skus/confirm")
def bulk_sku_confirm(
    data: BulkSKUConfirmRequest,
    db: Session = Depends(get_db)
):
    """
    Actually create SKUs from a previously previewed list.
    Skips duplicates by default. Returns created/skipped counts.
    """
    existing_codes = {s.sku_code.upper() for s in db.query(SKU.sku_code).all()}

    # Ensure all categories exist
    existing_cat_names = {c.name for c in db.query(Category).all()}

    created = []
    skipped = []
    errors = []

    for item in data.items:
        code = item.sku_code.upper().strip()
        if not code or not item.product_name.strip():
            continue

        if code in existing_codes:
            if data.skip_duplicates:
                skipped.append(code)
                continue
            # If not skipping, update is out of scope — just skip anyway
            skipped.append(code)
            continue

        # Create category if it doesn't exist
        if item.category and item.category not in existing_cat_names:
            new_cat = Category(name=item.category, is_active=True, sort_order=99)
            db.add(new_cat)
            existing_cat_names.add(item.category)

        try:
            sku = SKU(
                sku_code=code,
                product_name=item.product_name.strip(),
                category=item.category or "Other",
                case_size=max(1, item.case_size),
                unit_label=item.unit_label or "units",
                reorder_point=5,
                reorder_qty=20,
                max_stock=200,
                lead_time_days=14,
                is_active=True,
            )
            db.add(sku)
            db.flush()  # get sku.id

            # Init inventory rows
            for wh in ["WH1", "WH2"]:
                inv = Inventory(sku_id=sku.id, warehouse=wh, cases_on_hand=0)
                db.add(inv)
            db.flush()

            # Apply opening stock via direct inventory update
            if item.wh1_stock > 0:
                inv_wh1 = db.query(Inventory).filter(
                    Inventory.sku_id == sku.id, Inventory.warehouse == "WH1"
                ).first()
                if inv_wh1:
                    inv_wh1.cases_on_hand = item.wh1_stock

            if item.wh2_stock > 0:
                inv_wh2 = db.query(Inventory).filter(
                    Inventory.sku_id == sku.id, Inventory.warehouse == "WH2"
                ).first()
                if inv_wh2:
                    inv_wh2.cases_on_hand = item.wh2_stock

            existing_codes.add(code)
            created.append(code)

        except Exception as e:
            db.rollback()
            errors.append({"sku_code": code, "error": str(e)})
            continue

    db.commit()

    return {
        "created": len(created),
        "skipped": len(skipped),
        "errors": errors,
        "created_codes": created,
    }


# ── Product Image Upload ──────────────────────────────────────
import shutil
import pathlib

PRODUCTS_DIR = pathlib.Path(__file__).parent.parent / "static" / "products"

@router.post("/product-image/{sku_id}")
async def upload_product_image(
    sku_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    """Upload a product image for a SKU. Saves to static/products/ and updates sku.image_url."""
    sku = db.query(SKU).filter(SKU.id == sku_id).first()
    if not sku:
        raise HTTPException(status_code=404, detail="SKU not found")

    # Validate file type
    ext = pathlib.Path(file.filename).suffix.lower()
    if ext not in {".jpg", ".jpeg", ".png", ".webp", ".gif"}:
        raise HTTPException(status_code=400, detail="Only JPG, PNG, WEBP, GIF allowed")

    PRODUCTS_DIR.mkdir(parents=True, exist_ok=True)
    filename = f"{sku_id}{ext}"
    dest = PRODUCTS_DIR / filename

    with dest.open("wb") as f_out:
        shutil.copyfileobj(file.file, f_out)

    image_url = f"/static/products/{filename}"
    sku.image_url = image_url
    db.commit()

    return {"image_url": image_url, "sku_id": sku_id}
