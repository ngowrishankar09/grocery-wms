"""
Labels Router
=============
PDF label generation for products and bin locations.

Endpoints:
  GET /labels/sku/{sku_id}          → single SKU barcode label (PDF)
  GET /labels/skus?ids=1,2,3        → multi-SKU label sheet (PDF)
  GET /labels/bin/{bin_id}          → single bin QR label (PDF)
  GET /labels/bins?ids=1,2,3        → multi-bin label sheet (PDF)
"""

import io
import qrcode
from barcode import Code128
from barcode.writer import ImageWriter

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from typing import List, Optional

from reportlab.lib.pagesizes import A4, letter
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Spacer, Paragraph, Image as RLImage
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.graphics.barcode import code128
from reportlab.graphics.shapes import Drawing
from reportlab.graphics import renderPDF

import sys, os
sys.path.append(os.path.dirname(os.path.dirname(__file__)))
from database import get_db
from models import SKU, BinLocation, Inventory
from security import get_current_user, get_company_id

router = APIRouter(prefix="/labels", tags=["Labels"])


# ── Label dimensions (Avery-style) ────────────────────────────
LABEL_W   = 63.5 * mm   # label width
LABEL_H   = 38.1 * mm   # label height
COLS      = 3
ROWS      = 7
PAGE_W, PAGE_H = A4
MARGIN_X  = (PAGE_W - COLS * LABEL_W) / 2
MARGIN_Y  = (PAGE_H - ROWS * LABEL_H) / 2


# ── Helpers ───────────────────────────────────────────────────

def _barcode_image(text: str, width_mm: float = 50, height_mm: float = 12) -> io.BytesIO:
    """Generate a Code-128 barcode as PNG in a BytesIO buffer."""
    buf = io.BytesIO()
    bc = Code128(text, writer=ImageWriter())
    bc.write(buf, options={
        "module_width": 0.5,
        "module_height": height_mm,
        "font_size": 7,
        "text_distance": 1.5,
        "quiet_zone": 2,
        "write_text": True,
        "dpi": 200,
    })
    buf.seek(0)
    return buf


def _qr_image(text: str, box_size: int = 4) -> io.BytesIO:
    """Generate a QR code as PNG in a BytesIO buffer."""
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=box_size,
        border=2,
    )
    qr.add_data(text)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    return buf


def _truncate(text: str, max_len: int) -> str:
    return text if len(text) <= max_len else text[:max_len - 1] + "…"


# ── SKU Label Drawing ─────────────────────────────────────────

def _draw_sku_label(canvas, x, y, sku, inv_wh1=0, inv_wh2=0):
    """Draw a single SKU label at position (x, y) on the canvas."""
    from reportlab.pdfbase.pdfmetrics import stringWidth

    w, h = LABEL_W, LABEL_H
    pad = 2 * mm

    # Border
    canvas.setStrokeColor(colors.HexColor("#e5e7eb"))
    canvas.setLineWidth(0.4)
    canvas.rect(x, y, w, h)

    # SKU Code (top left, blue, monospace)
    canvas.setFont("Courier-Bold", 7)
    canvas.setFillColor(colors.HexColor("#1d4ed8"))
    canvas.drawString(x + pad, y + h - pad - 6, sku.sku_code)

    # Category (top right, grey)
    canvas.setFont("Helvetica", 5.5)
    canvas.setFillColor(colors.HexColor("#6b7280"))
    cat = _truncate(sku.category, 18)
    canvas.drawRightString(x + w - pad, y + h - pad - 5.5, cat)

    # Product name
    canvas.setFont("Helvetica-Bold", 7)
    canvas.setFillColor(colors.black)
    name = _truncate(sku.product_name, 42)
    canvas.drawString(x + pad, y + h - pad - 15, name)

    # Barcode
    bc_text = sku.barcode or sku.sku_code
    try:
        bc_buf = _barcode_image(bc_text, width_mm=50, height_mm=10)
        bc_img = RLImage(bc_buf, width=w - 2 * pad, height=12 * mm)
        bc_img.drawOn(canvas, x + pad, y + 10 * mm)
    except Exception:
        canvas.setFont("Courier", 6)
        canvas.setFillColor(colors.HexColor("#374151"))
        canvas.drawCentredString(x + w / 2, y + 13 * mm, bc_text)

    # Bottom strip: case size | stock
    canvas.setFillColor(colors.HexColor("#f3f4f6"))
    canvas.setStrokeColor(colors.HexColor("#e5e7eb"))
    canvas.rect(x, y, w, 9 * mm, fill=1)

    canvas.setFont("Helvetica", 6)
    canvas.setFillColor(colors.HexColor("#374151"))
    canvas.drawString(x + pad, y + 3.5 * mm, f"Case: {sku.case_size} {sku.unit_label}")

    stock_text = f"WH1: {inv_wh1}  WH2: {inv_wh2}"
    canvas.drawRightString(x + w - pad, y + 3.5 * mm, stock_text)


# ── Bin Label Drawing ─────────────────────────────────────────

def _draw_bin_label(canvas, x, y, bin_loc):
    """Draw a single bin location label at position (x, y)."""
    w, h = LABEL_W, LABEL_H
    pad = 2 * mm

    # Border
    canvas.setStrokeColor(colors.HexColor("#e5e7eb"))
    canvas.setLineWidth(0.4)
    canvas.rect(x, y, w, h)

    # QR code (right side)
    qr_size = 22 * mm
    try:
        qr_buf = _qr_image(bin_loc.code, box_size=4)
        qr_img = RLImage(qr_buf, width=qr_size, height=qr_size)
        qr_img.drawOn(canvas, x + w - pad - qr_size, y + h - pad - qr_size)
    except Exception:
        pass

    text_width = w - qr_size - 3 * pad

    # BIN label
    canvas.setFont("Helvetica", 6)
    canvas.setFillColor(colors.HexColor("#6b7280"))
    canvas.drawString(x + pad, y + h - pad - 7, "BIN LOCATION")

    # Bin code (large)
    canvas.setFont("Helvetica-Bold", 13)
    canvas.setFillColor(colors.black)
    canvas.drawString(x + pad, y + h - pad - 21, bin_loc.code)

    # Zone / Aisle / Shelf info
    canvas.setFont("Helvetica", 7)
    canvas.setFillColor(colors.HexColor("#374151"))
    details = []
    if bin_loc.zone:  details.append(f"Zone: {bin_loc.zone}")
    if bin_loc.aisle: details.append(f"Aisle: {bin_loc.aisle}")
    if bin_loc.shelf: details.append(f"Shelf: {bin_loc.shelf}")
    if bin_loc.position: details.append(f"Pos: {bin_loc.position}")

    y_pos = y + h - pad - 32
    for detail in details:
        canvas.drawString(x + pad, y_pos, detail)
        y_pos -= 8

    # Description (bottom)
    if bin_loc.description:
        canvas.setFont("Helvetica", 6)
        canvas.setFillColor(colors.HexColor("#9ca3af"))
        desc = _truncate(bin_loc.description, 35)
        canvas.drawString(x + pad, y + 3 * mm, desc)

    # Barcode of bin code at bottom
    try:
        bc_buf = _barcode_image(bin_loc.code, height_mm=8)
        bc_img = RLImage(bc_buf, width=w - 2 * pad, height=10 * mm)
        bc_img.drawOn(canvas, x + pad, y + pad)
    except Exception:
        canvas.setFont("Courier-Bold", 7)
        canvas.setFillColor(colors.HexColor("#374151"))
        canvas.drawCentredString(x + w / 2, y + 4 * mm, bin_loc.code)


# ── PDF builder ───────────────────────────────────────────────

def _build_label_pdf(draw_fn, items) -> io.BytesIO:
    """
    Lay out labels in a COLS x ROWS grid on A4 pages.
    draw_fn(canvas, x, y, item) is called for each item.
    """
    buf = io.BytesIO()

    from reportlab.pdfgen import canvas as rl_canvas
    c = rl_canvas.Canvas(buf, pagesize=A4)

    idx = 0
    per_page = COLS * ROWS

    while idx < len(items):
        page_items = items[idx:idx + per_page]
        for i, item_data in enumerate(page_items):
            col = i % COLS
            row = i // COLS
            x = MARGIN_X + col * LABEL_W
            # ReportLab y=0 is bottom; we want row 0 at top
            y = PAGE_H - MARGIN_Y - (row + 1) * LABEL_H
            draw_fn(c, x, y, *item_data)

        idx += per_page
        if idx < len(items):
            c.showPage()

    c.save()
    buf.seek(0)
    return buf


# ── Endpoints ─────────────────────────────────────────────────

@router.get("/sku/{sku_id}")
def sku_label(
    sku_id: int,
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    """Generate a single SKU barcode label as PDF."""
    sku = db.query(SKU).filter(SKU.id == sku_id, SKU.company_id == company_id).first()
    if not sku:
        raise HTTPException(status_code=404, detail="SKU not found")

    inv = db.query(Inventory).filter(
        Inventory.sku_id == sku_id,
        Inventory.company_id == company_id,
    ).all()
    wh1 = next((i.cases_on_hand for i in inv if i.warehouse == "WH1"), 0)
    wh2 = next((i.cases_on_hand for i in inv if i.warehouse == "WH2"), 0)

    pdf_buf = _build_label_pdf(_draw_sku_label, [(sku, wh1, wh2)])

    return StreamingResponse(
        pdf_buf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="label-{sku.sku_code}.pdf"'},
    )


@router.get("/skus")
def sku_labels_sheet(
    ids: str = Query(..., description="Comma-separated SKU IDs"),
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    """Generate a label sheet for multiple SKUs (up to 21 per page)."""
    try:
        id_list = [int(i.strip()) for i in ids.split(",") if i.strip()]
    except ValueError:
        raise HTTPException(status_code=400, detail="ids must be comma-separated integers")

    if not id_list:
        raise HTTPException(status_code=400, detail="No SKU IDs provided")
    if len(id_list) > 200:
        raise HTTPException(status_code=400, detail="Max 200 labels per request")

    skus = db.query(SKU).filter(SKU.id.in_(id_list), SKU.company_id == company_id).all()
    sku_map = {s.id: s for s in skus}

    inv_all = db.query(Inventory).filter(
        Inventory.sku_id.in_(id_list),
        Inventory.company_id == company_id,
    ).all()
    inv_map = {}
    for inv in inv_all:
        inv_map.setdefault(inv.sku_id, {})
        inv_map[inv.sku_id][inv.warehouse] = inv.cases_on_hand

    items = []
    for sid in id_list:
        if sid in sku_map:
            sku = sku_map[sid]
            wh1 = inv_map.get(sid, {}).get("WH1", 0)
            wh2 = inv_map.get(sid, {}).get("WH2", 0)
            items.append((sku, wh1, wh2))

    if not items:
        raise HTTPException(status_code=404, detail="No matching SKUs found")

    pdf_buf = _build_label_pdf(_draw_sku_label, items)
    return StreamingResponse(
        pdf_buf,
        media_type="application/pdf",
        headers={"Content-Disposition": 'inline; filename="sku-labels.pdf"'},
    )


@router.get("/bin/{bin_id}")
def bin_label(
    bin_id: int,
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    """Generate a single bin location label as PDF."""
    bin_loc = db.query(BinLocation).filter(
        BinLocation.id == bin_id,
        BinLocation.company_id == company_id,
    ).first()
    if not bin_loc:
        raise HTTPException(status_code=404, detail="Bin location not found")

    pdf_buf = _build_label_pdf(_draw_bin_label, [(bin_loc,)])
    return StreamingResponse(
        pdf_buf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="bin-{bin_loc.code}.pdf"'},
    )


@router.get("/bins")
def bin_labels_sheet(
    ids: str = Query(..., description="Comma-separated bin location IDs"),
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    """Generate a label sheet for multiple bin locations."""
    try:
        id_list = [int(i.strip()) for i in ids.split(",") if i.strip()]
    except ValueError:
        raise HTTPException(status_code=400, detail="ids must be comma-separated integers")

    if not id_list:
        raise HTTPException(status_code=400, detail="No bin IDs provided")
    if len(id_list) > 200:
        raise HTTPException(status_code=400, detail="Max 200 labels per request")

    bins = db.query(BinLocation).filter(
        BinLocation.id.in_(id_list),
        BinLocation.company_id == company_id,
    ).all()
    if not bins:
        raise HTTPException(status_code=404, detail="No matching bin locations found")

    items = [(b,) for b in bins]
    pdf_buf = _build_label_pdf(_draw_bin_label, items)
    return StreamingResponse(
        pdf_buf,
        media_type="application/pdf",
        headers={"Content-Disposition": 'inline; filename="bin-labels.pdf"'},
    )


@router.get("/bins/all")
def all_bin_labels(
    db: Session = Depends(get_db),
    company_id: int = Depends(get_company_id),
):
    """Generate labels for all active bin locations."""
    bins = db.query(BinLocation).filter(
        BinLocation.is_active == True,
        BinLocation.company_id == company_id,
    ).order_by(BinLocation.code).all()
    if not bins:
        raise HTTPException(status_code=404, detail="No bin locations found")

    items = [(b,) for b in bins]
    pdf_buf = _build_label_pdf(_draw_bin_label, items)
    return StreamingResponse(
        pdf_buf,
        media_type="application/pdf",
        headers={"Content-Disposition": 'inline; filename="all-bin-labels.pdf"'},
    )
