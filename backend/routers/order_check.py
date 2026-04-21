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

import os, json
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


def _get_client():
    if not ANTHROPIC_API_KEY:
        raise HTTPException(
            status_code=503,
            detail="ANTHROPIC_API_KEY is not configured. "
                   "Add it to the Render environment variables to enable Order Check.",
        )
    import anthropic
    return anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)


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

class AnalyzeRequest(BaseModel):
    # Multi-page support: up to 6 order paper photos
    order_photos:      List[str] = []   # preferred — list of base64 images
    order_photos_mime: List[str] = []
    # Legacy single-photo fields (kept for backward compat)
    order_photo:       str = ""
    order_photo_mime:  str = "image/jpeg"
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

@router.post("/analyze")
async def analyze_order(
    req: AnalyzeRequest,
    db:         Session = Depends(get_db),
    company_id: int     = Depends(get_company_id),
):
    """
    Step 1: Extract items from paper order photo.
    Step 2: Extract items visible on box photos.
    Step 3: Semantic match — returns matched / missing / extra.
    """
    client = _get_client()

    # ── Step 1: Read the paper order (one or more pages) ─────
    # Resolve which photos to process (multi-page or legacy single)
    all_order_photos = req.order_photos if req.order_photos else (
        [req.order_photo] if req.order_photo else []
    )
    all_order_mimes = req.order_photos_mime if req.order_photos_mime else (
        [req.order_photo_mime] if req.order_photo else []
    )

    order_items: list = []
    for page_idx, page_photo in enumerate(all_order_photos):
        page_mime = all_order_mimes[page_idx] if page_idx < len(all_order_mimes) else "image/jpeg"
        page_resp = client.messages.create(
            model=VISION_MODEL,
            max_tokens=1024,
            messages=[{
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type":       "base64",
                            "media_type": page_mime,
                            "data":       page_photo,
                        },
                    },
                    {
                        "type": "text",
                        "text": (
                            f"This is page {page_idx + 1} of a warehouse sales order or pick list. "
                            "Extract EVERY product listed — names, item codes/SKU codes, and quantities. "
                            "Highlighted or ticked items are already picked — include them all. "
                            "Return ONLY valid JSON, no explanation:\n"
                            '{"items": [{"name": "product name", "code": "item or SKU code", "qty": number}]}\n'
                            "Use empty string for code if not visible. Use 1 for qty if not shown."
                        ),
                    },
                ],
            }],
        )
        page_data  = _parse_json(page_resp.content[0].text, {"items": []})
        order_items.extend(page_data.get("items", []))

    # Deduplicate order items by name+code (merge quantities for same item)
    merged: dict = {}
    for item in order_items:
        key = (item.get("name", "").lower().strip()[:40], item.get("code", "").lower().strip())
        if key in merged:
            merged[key]["qty"] = merged[key].get("qty", 1) + item.get("qty", 1)
        else:
            merged[key] = dict(item)
    order_items = list(merged.values())

    # ── Step 2: Read box labels from floor photos ─────────────
    floor_items = []
    for i, photo in enumerate(req.box_photos):
        mime = req.box_photos_mime[i] if i < len(req.box_photos_mime) else "image/jpeg"
        box_resp = client.messages.create(
            model=VISION_MODEL,
            max_tokens=1024,
            messages=[{
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type":       "base64",
                            "media_type": mime,
                            "data":       photo,
                        },
                    },
                    {
                        "type": "text",
                        "text": (
                            "These are product boxes/cartons on a warehouse floor. "
                            "Read ALL visible product names, brand names, item codes, SKU codes, "
                            "and pack sizes from box labels. "
                            "Every distinct product visible — even partially — should be included. "
                            "Return ONLY valid JSON:\n"
                            '{"items": [{"name": "full product name as printed", '
                            '"code": "item/SKU code if visible else empty", '
                            '"brand": "brand name", "size": "pack size e.g. 20x2LB"}]}\n'
                            "If multiple identical boxes are visible, list the product once."
                        ),
                    },
                ],
            }],
        )
        box_data = _parse_json(box_resp.content[0].text, {"items": []})
        floor_items.extend(box_data.get("items", []))

    # ── Step 3: Semantic matching ─────────────────────────────
    # Deduplicate floor items by name (rough)
    seen = set()
    unique_floor = []
    for fi in floor_items:
        key = fi.get("name", "").lower()[:30]
        if key and key not in seen:
            seen.add(key)
            unique_floor.append(fi)

    match_resp = client.messages.create(
        model=VISION_MODEL,
        max_tokens=2048,
        messages=[{
            "role": "user",
            "content": (
                "You are verifying a warehouse dispatch order.\n\n"
                f"ORDER (what SHOULD be on the floor):\n{json.dumps(order_items, indent=2)}\n\n"
                f"FLOOR ITEMS (what was PHOTOGRAPHED on the floor):\n{json.dumps(unique_floor, indent=2)}\n\n"
                "Rules:\n"
                "- Use SEMANTIC matching. 'Chana Dal 2LB' matches 'GAZAB CHANA DAL 20x2LB'. "
                "'KBAS5' or 'Kohinoor Basmati 5KG' can match 'KOHINOOR BASMATI RICE 10x5KG'.\n"
                "- Prefer matching over marking as missing/extra when there is any reasonable similarity.\n"
                "- matched: items present in BOTH the order and floor photos\n"
                "- missing: items in the ORDER but NOT found on floor (possible short pick)\n"
                "- extra:   items on FLOOR but NOT in the order (WRONG item — should not be there)\n\n"
                "Return ONLY valid JSON:\n"
                '{"matched": [{"order_name": "...", "floor_name": "...", "qty": number}],\n'
                ' "missing": [{"name": "...", "code": "...", "qty": number, "note": "not found in photos"}],\n'
                ' "extra":   [{"name": "...", "brand": "...", "note": "NOT in order — possible wrong pick"}]}'
            ),
        }],
    )
    result = _parse_json(match_resp.content[0].text, {
        "matched": [],
        "missing": [{"name": i.get("name"), "code": i.get("code"), "qty": i.get("qty", 1)} for i in order_items],
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
