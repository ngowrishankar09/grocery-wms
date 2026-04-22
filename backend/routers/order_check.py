"""
Order Check — AI-powered dispatch verification.

Workflow:
  1. Checker snaps the paper order/pick slip (1–6 pages) → Claude Vision extracts item list
  2. Checker snaps boxes on floor (1–8 photos) → Claude Vision reads box labels
  3. Claude semantically matches order items vs floor items and returns:
       matched  = correct picks (in order AND on floor)
       missing  = in order but NOT found on floor  → potential short pick
       extra    = on floor but NOT in order         → wrong pick / someone else's item
  4. Checker manually confirms no-box items, adds notes, saves audit record
"""

import os, json, asyncio
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

import sys
sys.path.append(os.path.dirname(os.path.dirname(__file__)))
from database import get_db
from security import get_current_user, get_company_id

router = APIRouter(prefix="/order-check", tags=["Order Check"])

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
VISION_MODEL = "claude-3-5-haiku-20241022"

# ── Shared prompt templates ───────────────────────────────────

def _order_page_prompt(page_num: int) -> str:
    return (
        f"This is page {page_num} of a warehouse sales order / pick list.\n\n"
        "Each line typically shows:  PRODUCT NAME   PACK SIZE   QUANTITY (boxes)\n"
        "Common formats you will see:\n"
        "  'Coriander Whole  20 x 400g   2'          → 2 cartons, pack 20x400g\n"
        "  'Kohinoor Basmati 10x5kg — 3 box'         → 3 cartons, pack 10x5kg\n"
        "  'Toor Dal 2LB  20x2LB  4'                 → 4 cartons, pack 20x2LB\n"
        "  'GAZAB CHANA DAL 20x2LB  2 cs'            → 2 cartons, pack 20x2LB\n\n"
        "Extract EVERY line item. Return ONLY valid JSON:\n"
        '{"items": [{"name": "product name only", "code": "SKU/item code or empty string", '
        '"pack": "pack config e.g. 20x400g", "qty": number_of_boxes}]}\n\n'
        "Rules:\n"
        "- name: product name ONLY — do NOT include the pack size in the name field\n"
        "- pack: pack configuration like '20x400g', '10x5kg', '6x2LB', '24x500ml' "
        "(use x, not ×; no spaces around x); empty string if not shown\n"
        "- qty: the NUMBER OF BOXES/CARTONS ordered — the standalone number at the end "
        "of the line, or after words like 'box', 'boxes', 'carton', 'cs', 'ctn'; use 1 if not shown\n"
        "- code: item or SKU code if visible, else empty string\n"
        "- Include highlighted, ticked, and un-ticked items — every line"
    )

def _box_photo_prompt() -> str:
    return (
        "These are product boxes/cartons on a warehouse floor.\n"
        "Read ALL visible product names, brand names, item codes, and pack sizes from box labels.\n"
        "Include every distinct product visible — even partially.\n\n"
        "Return ONLY valid JSON:\n"
        '{"items": [{"name": "product name as printed on box", "brand": "brand name", '
        '"code": "item/SKU code or empty string", "pack": "pack config e.g. 20x400g or empty"}]}\n\n'
        "- pack: extract pack configuration like '20x400g', '10x5kg', '24x500ml' from the box label\n"
        "- If multiple identical boxes are visible, list the product once"
    )

def _match_prompt(order_items: list, floor_items: list) -> str:
    return (
        "You are verifying a warehouse dispatch order.\n\n"
        f"ORDER (what SHOULD be on the floor):\n{json.dumps(order_items, indent=2)}\n\n"
        f"FLOOR ITEMS (photographed boxes):\n{json.dumps(floor_items, indent=2)}\n\n"
        "Matching rules:\n"
        "- Match by PRODUCT NAME + PACK SIZE together.\n"
        "  Example: order 'Coriander Whole' pack '20x400g' matches floor box "
        "labeled 'CORIANDER WHOLE 20x400g' or 'Coriander Whole 20 x 400g'.\n"
        "- Be flexible with spelling, capitalisation, spacing "
        "('20 x 400g' = '20x400g', 'Kohinoor' = 'KOHINOOR').\n"
        "- If pack sizes differ (e.g. order has 20x400g but floor has 10x400g), mark as EXTRA and MISSING.\n"
        "- qty in matched = number of boxes/cartons ordered (from the order).\n"
        "- matched: order item found on floor (correct pick)\n"
        "- missing: in the order but NOT found on floor (possible short pick)\n"
        "- extra:   on floor but NOT in the order (wrong item — should not be dispatched)\n\n"
        "Return ONLY valid JSON:\n"
        '{"matched": [{"order_name": "...", "pack": "...", "floor_name": "...", "qty": number}],\n'
        ' "missing": [{"name": "...", "pack": "...", "code": "...", "qty": number, "note": "not found in photos"}],\n'
        ' "extra":   [{"name": "...", "pack": "...", "brand": "...", "note": "NOT in order — possible wrong pick"}]}'
    )


def _get_async_client():
    if not ANTHROPIC_API_KEY:
        raise HTTPException(
            status_code=503,
            detail="ANTHROPIC_API_KEY is not configured. "
                   "Add it to the Render environment variables to enable Order Check.",
        )
    import anthropic
    return anthropic.AsyncAnthropic(api_key=ANTHROPIC_API_KEY)


def _parse_json(text: str, fallback: dict) -> dict:
    """Best-effort JSON extraction from Claude's response."""
    text = text.strip()
    # Try direct parse
    try:
        return json.loads(text)
    except Exception:
        pass
    # Try extracting first {...} block
    start = text.find("{")
    end   = text.rfind("}") + 1
    if start >= 0 and end > start:
        try:
            return json.loads(text[start:end])
        except Exception:
            pass
    return fallback


# ── Request / Response schemas ────────────────────────────────

class ScanPageRequest(BaseModel):
    """Single-page quick scan — used by Step 1 live preview."""
    photo:    str
    mime:     str = "image/jpeg"
    page_num: int = 1

class AnalyzeRequest(BaseModel):
    # Multi-page support: up to 6 order paper photos
    order_photos:      List[str] = []   # preferred — list of base64 images
    order_photos_mime: List[str] = []
    # Legacy single-photo fields (kept for backward compat)
    order_photo:       str = ""
    order_photo_mime:  str = "image/jpeg"
    # Pre-extracted order items (from live Step-1 scans) — skip re-scanning if provided
    order_items_prefetched: List[dict] = []
    # Box photos: up to 8
    box_photos:        List[str]
    box_photos_mime:   List[str] = []

class SaveRequest(BaseModel):
    order_ref:     Optional[str] = None
    # Multi-page support
    order_photos:  List[str] = []   # preferred
    order_photo:   str = ""         # legacy fallback
    box_photos:    List[str]
    matched:       List[dict]
    missing:       List[dict]
    extra:         List[dict]
    manual_items:  List[dict] = []
    notes:         Optional[str] = None


# ── Endpoints ────────────────────────────────────────────────

@router.post("/scan-order-page")
async def scan_order_page(
    req:        ScanPageRequest,
    db:         Session = Depends(get_db),
    company_id: int     = Depends(get_company_id),
):
    """
    Instantly extract items from a single order paper photo.
    Called by the frontend as each page photo is added in Step 1,
    so the user can verify the item list before proceeding to box photos.
    """
    client = _get_async_client()
    resp = await client.messages.create(
        model=VISION_MODEL,
        max_tokens=1500,
        messages=[{
            "role": "user",
            "content": [
                {
                    "type": "image",
                    "source": {"type": "base64", "media_type": req.mime, "data": req.photo},
                },
                {"type": "text", "text": _order_page_prompt(req.page_num)},
            ],
        }],
    )
    items = _parse_json(resp.content[0].text, {"items": []}).get("items", [])
    return {"items": items, "page_num": req.page_num}


@router.post("/analyze")
async def analyze_order(
    req: AnalyzeRequest,
    db:         Session = Depends(get_db),
    company_id: int     = Depends(get_company_id),
):
    """
    All Claude Vision calls run in parallel (asyncio.gather) to stay well
    within Render's 30-second HTTP timeout even for multi-page orders.

    Step 1: Extract items from all order paper pages — concurrently.
    Step 2: Extract items from all box photos — concurrently.
    Step 3: Semantic match (single call after Steps 1+2 finish).
    """
    client = _get_async_client()

    # ── Helper coroutines ─────────────────────────────────────

    async def read_order_page(photo: str, mime: str, page_idx: int) -> list:
        resp = await client.messages.create(
            model=VISION_MODEL,
            max_tokens=1500,
            messages=[{
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {"type": "base64", "media_type": mime, "data": photo},
                    },
                    {"type": "text", "text": _order_page_prompt(page_idx + 1)},
                ],
            }],
        )
        return _parse_json(resp.content[0].text, {"items": []}).get("items", [])

    async def read_box_photo(photo: str, mime: str) -> list:
        resp = await client.messages.create(
            model=VISION_MODEL,
            max_tokens=1500,
            messages=[{
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {"type": "base64", "media_type": mime, "data": photo},
                    },
                    {"type": "text", "text": _box_photo_prompt()},
                ],
            }],
        )
        return _parse_json(resp.content[0].text, {"items": []}).get("items", [])

    # ── Step 1: Order items — use prefetched or scan in parallel ─
    if req.order_items_prefetched:
        # Fast path: client already scanned each page live — reuse those items
        order_items = req.order_items_prefetched
        box_tasks = [
            read_box_photo(
                photo,
                req.box_photos_mime[i] if i < len(req.box_photos_mime) else "image/jpeg",
            )
            for i, photo in enumerate(req.box_photos)
        ]
        box_results = await asyncio.gather(*box_tasks)
    else:
        # Slow path: scan order pages + box photos all in parallel
        all_order_photos = req.order_photos if req.order_photos else (
            [req.order_photo] if req.order_photo else []
        )
        all_order_mimes = req.order_photos_mime if req.order_photos_mime else (
            [req.order_photo_mime] if req.order_photo else []
        )
        order_tasks = [
            read_order_page(
                photo,
                all_order_mimes[i] if i < len(all_order_mimes) else "image/jpeg",
                i,
            )
            for i, photo in enumerate(all_order_photos)
        ]
        box_tasks = [
            read_box_photo(
                photo,
                req.box_photos_mime[i] if i < len(req.box_photos_mime) else "image/jpeg",
            )
            for i, photo in enumerate(req.box_photos)
        ]
        all_results  = await asyncio.gather(*order_tasks, *box_tasks)
        n_order      = len(order_tasks)
        page_results = all_results[:n_order]
        box_results  = all_results[n_order:]

        # Flatten + deduplicate order items (merge qty for same name+pack+code)
        raw_order_items = [item for page in page_results for item in page]
        merged: dict = {}
        for item in raw_order_items:
            key = (
                item.get("name", "").lower().strip()[:40],
                item.get("pack", "").lower().replace(" ", ""),
                item.get("code", "").lower().strip(),
            )
            if key in merged:
                merged[key]["qty"] = merged[key].get("qty", 1) + item.get("qty", 1)
            else:
                merged[key] = dict(item)
        order_items = list(merged.values())

    # Flatten + deduplicate floor items
    raw_floor = [item for box in box_results for item in box]
    seen: set = set()
    unique_floor: list = []
    for fi in raw_floor:
        key = fi.get("name", "").lower()[:30]
        if key and key not in seen:
            seen.add(key)
            unique_floor.append(fi)

    # ── Step 3: Semantic matching ─────────────────────────────
    match_resp = await client.messages.create(
        model=VISION_MODEL,
        max_tokens=2048,
        messages=[{
            "role": "user",
            "content": _match_prompt(order_items, unique_floor),
        }],
    )
    result = _parse_json(match_resp.content[0].text, {
        "matched": [],
        "missing": [{"name": i.get("name"), "pack": i.get("pack", ""), "code": i.get("code", ""), "qty": i.get("qty", 1)} for i in order_items],
        "extra":   [],
    })

    return {
        "order_items":  order_items,
        "floor_items":  unique_floor,
        "matched":      result.get("matched", []),
        "missing":      result.get("missing", []),
        "extra":        result.get("extra",   []),
    }


@router.post("/save")
async def save_order_check(
    req:        SaveRequest,
    db:         Session = Depends(get_db),
    user                = Depends(get_current_user),
    company_id: int     = Depends(get_company_id),
):
    from models import OrderCheckRecord
    # Resolve order photos — prefer multi-page list, fall back to legacy single
    all_order_photos = req.order_photos if req.order_photos else (
        [req.order_photo] if req.order_photo else []
    )
    record = OrderCheckRecord(
        company_id      = company_id,
        order_ref       = req.order_ref,
        checker_name    = getattr(user, "full_name", None) or getattr(user, "username", ""),
        order_photo_b64 = json.dumps(all_order_photos),   # stored as JSON array
        box_photos_b64  = json.dumps(req.box_photos),
        items_matched   = json.dumps(req.matched),
        items_missing   = json.dumps(req.missing),
        items_extra     = json.dumps(req.extra),
        items_manual    = json.dumps(req.manual_items),
        notes           = req.notes,
        created_at      = datetime.utcnow(),
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return {"id": record.id, "created_at": record.created_at.isoformat()}


@router.get("/history")
def get_history(
    db:         Session = Depends(get_db),
    company_id: int     = Depends(get_company_id),
):
    from models import OrderCheckRecord
    records = (
        db.query(OrderCheckRecord)
        .filter(OrderCheckRecord.company_id == company_id)
        .order_by(OrderCheckRecord.created_at.desc())
        .limit(100)
        .all()
    )
    return [
        {
            "id":            r.id,
            "order_ref":     r.order_ref,
            "checker_name":  r.checker_name,
            "created_at":    r.created_at.isoformat(),
            "matched_count": len(json.loads(r.items_matched or "[]")),
            "missing_count": len(json.loads(r.items_missing or "[]")),
            "extra_count":   len(json.loads(r.items_extra   or "[]")),
            "manual_count":  len(json.loads(r.items_manual  or "[]")),
            "has_issues":    (
                len(json.loads(r.items_missing or "[]")) > 0 or
                len(json.loads(r.items_extra   or "[]")) > 0
            ),
        }
        for r in records
    ]


@router.get("/history/{record_id}")
def get_record(
    record_id:  int,
    db:         Session = Depends(get_db),
    company_id: int     = Depends(get_company_id),
):
    from models import OrderCheckRecord
    r = db.query(OrderCheckRecord).filter(
        OrderCheckRecord.id == record_id,
        OrderCheckRecord.company_id == company_id,
    ).first()
    if not r:
        raise HTTPException(status_code=404, detail="Record not found")
    # order_photo_b64 may be a JSON array (new) or a raw base64 string (old records)
    raw_op = r.order_photo_b64 or ""
    try:
        parsed_op = json.loads(raw_op)
        order_photos = parsed_op if isinstance(parsed_op, list) else [parsed_op]
    except Exception:
        order_photos = [raw_op] if raw_op else []

    return {
        "id":            r.id,
        "order_ref":     r.order_ref,
        "checker_name":  r.checker_name,
        "created_at":    r.created_at.isoformat(),
        "order_photos":  order_photos,
        "order_photo":   order_photos[0] if order_photos else "",  # legacy compat
        "box_photos":    json.loads(r.box_photos_b64 or "[]"),
        "matched":       json.loads(r.items_matched  or "[]"),
        "missing":       json.loads(r.items_missing  or "[]"),
        "extra":         json.loads(r.items_extra    or "[]"),
        "manual_items":  json.loads(r.items_manual   or "[]"),
        "notes":         r.notes,
    }
