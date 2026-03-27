"""
Email Router
============
Send invoices and purchase orders by email using the company's SMTP settings.

POST /email/test               → test SMTP connection
POST /email/invoice/{id}       → email invoice to customer
POST /email/purchase-order/{id} → email PO to vendor
"""

import smtplib
import ssl
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from sqlalchemy.orm import Session

import sys, os
sys.path.append(os.path.dirname(os.path.dirname(__file__)))
from database import get_db
from models import CompanyProfile, Invoice, PurchaseOrder

router = APIRouter(prefix="/email", tags=["Email"])


# ── Schemas ───────────────────────────────────────────────────

class SendInvoiceRequest(BaseModel):
    to: str
    subject: Optional[str] = None
    body: Optional[str] = None   # extra note prepended to the email body


class SendPORequest(BaseModel):
    to: str
    subject: Optional[str] = None
    body: Optional[str] = None


# ── Helpers ───────────────────────────────────────────────────

def _get_smtp_config(db: Session):
    cp = db.query(CompanyProfile).filter(CompanyProfile.id == 1).first()
    if not cp:
        raise HTTPException(400, "Company profile not configured")
    if not cp.smtp_host or not cp.smtp_user or not cp.smtp_password:
        raise HTTPException(400, "SMTP not configured. Go to Settings → Company Profile → Email (SMTP) and fill in your email settings.")
    return cp


def _send_email(cp: CompanyProfile, to: str, subject: str, html_body: str):
    """Send an HTML email via the company's SMTP config."""
    from_addr = cp.smtp_from or cp.smtp_user
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = from_addr
    msg["To"] = to
    msg.attach(MIMEText(html_body, "html"))

    port = cp.smtp_port or 587
    try:
        if port == 465:
            context = ssl.create_default_context()
            with smtplib.SMTP_SSL(cp.smtp_host, port, context=context) as server:
                server.login(cp.smtp_user, cp.smtp_password)
                server.sendmail(from_addr, to, msg.as_string())
        else:
            with smtplib.SMTP(cp.smtp_host, port) as server:
                server.ehlo()
                server.starttls()
                server.login(cp.smtp_user, cp.smtp_password)
                server.sendmail(from_addr, to, msg.as_string())
    except smtplib.SMTPAuthenticationError:
        raise HTTPException(400, "SMTP authentication failed — check username/password.")
    except smtplib.SMTPConnectError:
        raise HTTPException(400, f"Cannot connect to SMTP server {cp.smtp_host}:{port}")
    except Exception as e:
        raise HTTPException(500, f"Email send failed: {str(e)}")


def _invoice_html(inv: Invoice, cp: CompanyProfile, extra_note: str = "") -> str:
    co_name = cp.name or "Company"
    lines = "".join(
        f"<tr><td style='padding:8px 12px;border-bottom:1px solid #f0f0f0'>{it.description}"
        f"{'<br><small style=color:#999>'+it.sku.sku_code+'</small>' if it.sku else ''}</td>"
        f"<td style='padding:8px 12px;border-bottom:1px solid #f0f0f0;text-align:center'>{it.cases_qty}</td>"
        f"<td style='padding:8px 12px;border-bottom:1px solid #f0f0f0;text-align:right'>${it.unit_price:.2f}</td>"
        f"<td style='padding:8px 12px;border-bottom:1px solid #f0f0f0;text-align:right'>${it.line_total:.2f}</td></tr>"
        for it in inv.items
    )
    tax_rows = "".join(
        f"<tr><td>{tx.name} ({tx.rate}%)</td><td style='text-align:right'>${tx.amount:.2f}</td></tr>"
        for tx in inv.taxes
    ) if inv.taxes else ""

    disc = inv.discount_amount or 0
    prev = inv.previous_balance or 0
    grand = inv.grand_total or inv.total

    note_block = f"<p style='background:#fffbeb;padding:12px;border-radius:6px;font-size:14px;color:#555;margin-bottom:20px'>{extra_note}</p>" if extra_note else ""

    return f"""
<!DOCTYPE html><html><head><meta charset='utf-8'></head>
<body style='font-family:Arial,sans-serif;color:#111;padding:0;margin:0;background:#f4f4f4'>
<div style='max-width:680px;margin:30px auto;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.12)'>
  <div style='background:#1e3a5f;padding:28px 36px;color:#fff'>
    <div style='font-size:22px;font-weight:bold'>{co_name}</div>
    {f"<div style='font-size:13px;opacity:.8;margin-top:4px'>{cp.address.replace(chr(10),'  ')}</div>" if cp.address else ""}
    {f"<div style='font-size:13px;opacity:.8'>{cp.email}</div>" if cp.email else ""}
  </div>
  <div style='padding:28px 36px'>
    <div style='display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px'>
      <div>
        <div style='font-size:20px;font-weight:bold;color:#1e3a5f'>INVOICE</div>
        <div style='font-size:15px;color:#374151;margin-top:2px'>{inv.invoice_number}</div>
        <div style='margin-top:8px;font-size:13px;color:#555'>Date: {inv.invoice_date}</div>
        {f"<div style='font-size:13px;color:#555'>Due: {inv.due_date}</div>" if inv.due_date else ""}
      </div>
      <div style='text-align:right;font-size:13px;color:#555'>
        <strong>Bill To:</strong><br>{inv.customer_name or inv.store_name}
        {f"<br>{inv.store_name}" if inv.customer_name and inv.store_name != inv.customer_name else ""}
      </div>
    </div>
    {note_block}
    <table width='100%' cellspacing='0' cellpadding='0' style='border-collapse:collapse;margin-bottom:20px'>
      <thead>
        <tr style='background:#1e3a5f;color:#fff'>
          <th style='padding:10px 12px;text-align:left;font-size:12px'>Description</th>
          <th style='padding:10px 12px;text-align:center;font-size:12px'>Cases</th>
          <th style='padding:10px 12px;text-align:right;font-size:12px'>Unit Price</th>
          <th style='padding:10px 12px;text-align:right;font-size:12px'>Amount</th>
        </tr>
      </thead>
      <tbody>{lines}</tbody>
    </table>
    <div style='display:flex;justify-content:flex-end;margin-bottom:20px'>
      <table style='width:280px;border-collapse:collapse'>
        <tr><td style='padding:5px 12px;font-size:14px'>Subtotal</td><td style='padding:5px 12px;text-align:right'>${inv.subtotal:.2f}</td></tr>
        {f"<tr><td style='padding:5px 12px;font-size:14px'>Discount</td><td style='padding:5px 12px;text-align:right;color:#16a34a'>-${disc:.2f}</td></tr>" if disc > 0 else ""}
        {tax_rows}
        <tr style='border-top:2px solid #e5e7eb'><td style='padding:8px 12px;font-weight:bold'>Invoice Total</td><td style='padding:8px 12px;text-align:right;font-weight:bold'>${inv.total:.2f}</td></tr>
        {f"<tr><td style='padding:5px 12px;color:#dc2626;font-weight:600'>Previous Balance</td><td style='padding:5px 12px;text-align:right;color:#dc2626;font-weight:600'>${prev:.2f}</td></tr>" if prev > 0 else ""}
        {f"<tr style='border-top:3px solid #1e3a5f'><td style='padding:8px 12px;font-weight:bold;font-size:16px;color:#1e3a5f'>Amount Due</td><td style='padding:8px 12px;text-align:right;font-weight:bold;font-size:16px;color:#1e3a5f'>${grand:.2f}</td></tr>" if prev > 0 else ""}
      </table>
    </div>
    {f"<div style='padding:12px;background:#f9fafb;border-radius:6px;font-size:13px;color:#555;margin-bottom:20px'><strong>Notes:</strong> {inv.notes}</div>" if inv.notes else ""}
    {f"<div style='font-size:13px;color:#555'><strong>Payment Details:</strong><br>{cp.bank_details.replace(chr(10),'<br>')}</div>" if cp.bank_details else ""}
  </div>
  <div style='background:#f9fafb;padding:16px 36px;font-size:12px;color:#999;text-align:center'>
    Thank you for your business — {co_name}
  </div>
</div>
</body></html>"""


def _po_html(po: PurchaseOrder, cp: CompanyProfile, extra_note: str = "") -> str:
    co_name = cp.name or "Company"
    lines = "".join(
        f"<tr>"
        f"<td style='padding:8px 12px;border-bottom:1px solid #f0f0f0'>{it.sku.product_name if it.sku else f'SKU {it.sku_id}'}</td>"
        f"<td style='padding:8px 12px;border-bottom:1px solid #f0f0f0;color:#999;font-size:12px'>{it.sku.sku_code if it.sku else ''}</td>"
        f"<td style='padding:8px 12px;border-bottom:1px solid #f0f0f0;text-align:center'>{it.cases_ordered}</td>"
        f"<td style='padding:8px 12px;border-bottom:1px solid #f0f0f0;text-align:right'>${(it.unit_cost or 0):.2f}</td>"
        f"<td style='padding:8px 12px;border-bottom:1px solid #f0f0f0;text-align:right'>${round((it.unit_cost or 0)*it.cases_ordered,2):.2f}</td>"
        f"</tr>"
        for it in po.items
    )
    total_cost = sum((it.unit_cost or 0) * it.cases_ordered for it in po.items)
    note_block = f"<p style='background:#fffbeb;padding:12px;border-radius:6px;font-size:14px;color:#555;margin-bottom:20px'>{extra_note}</p>" if extra_note else ""

    return f"""
<!DOCTYPE html><html><head><meta charset='utf-8'></head>
<body style='font-family:Arial,sans-serif;color:#111;padding:0;margin:0;background:#f4f4f4'>
<div style='max-width:720px;margin:30px auto;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.12)'>
  <div style='background:#1e3a5f;padding:28px 36px;color:#fff'>
    <div style='font-size:22px;font-weight:bold'>{co_name}</div>
    {f"<div style='font-size:13px;opacity:.8;margin-top:4px'>{cp.address.replace(chr(10),'  ')}</div>" if cp.address else ""}
    {f"<div style='font-size:13px;opacity:.8'>{cp.email}</div>" if cp.email else ""}
  </div>
  <div style='padding:28px 36px'>
    <div style='display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px'>
      <div>
        <div style='font-size:20px;font-weight:bold;color:#1e3a5f'>PURCHASE ORDER</div>
        <div style='font-size:15px;color:#374151;margin-top:2px'>{po.po_number}</div>
        <div style='margin-top:8px;font-size:13px;color:#555'>Date: {date.today().isoformat()}</div>
        {f"<div style='font-size:13px;color:#555'>Expected: {po.expected_date}</div>" if po.expected_date else ""}
      </div>
      <div style='text-align:right;font-size:13px;color:#555'>
        <strong>To:</strong><br>{po.vendor.name if po.vendor else 'Vendor'}
        {f"<br>{po.vendor.contact_person}" if po.vendor and po.vendor.contact_person else ""}
        {f"<br>{po.vendor.phone}" if po.vendor and po.vendor.phone else ""}
        <br><strong>Warehouse:</strong> {po.warehouse}
      </div>
    </div>
    {note_block}
    <table width='100%' cellspacing='0' cellpadding='0' style='border-collapse:collapse;margin-bottom:20px'>
      <thead>
        <tr style='background:#1e3a5f;color:#fff'>
          <th style='padding:10px 12px;text-align:left;font-size:12px'>Product</th>
          <th style='padding:10px 12px;text-align:left;font-size:12px'>SKU</th>
          <th style='padding:10px 12px;text-align:center;font-size:12px'>Cases</th>
          <th style='padding:10px 12px;text-align:right;font-size:12px'>Unit Cost</th>
          <th style='padding:10px 12px;text-align:right;font-size:12px'>Total</th>
        </tr>
      </thead>
      <tbody>{lines}</tbody>
    </table>
    <div style='display:flex;justify-content:flex-end;margin-bottom:20px'>
      <table style='width:260px;border-collapse:collapse'>
        <tr style='border-top:3px solid #1e3a5f'><td style='padding:8px 12px;font-weight:bold;font-size:16px;color:#1e3a5f'>Total Order Value</td><td style='padding:8px 12px;text-align:right;font-weight:bold;font-size:16px;color:#1e3a5f'>${total_cost:.2f}</td></tr>
      </table>
    </div>
    {f"<div style='padding:12px;background:#f9fafb;border-radius:6px;font-size:13px;color:#555'><strong>Notes:</strong> {po.notes}</div>" if po.notes else ""}
  </div>
  <div style='background:#f9fafb;padding:16px 36px;font-size:12px;color:#999;text-align:center'>
    Please confirm receipt of this purchase order — {co_name}
  </div>
</div>
</body></html>"""


# ── Endpoints ─────────────────────────────────────────────────

@router.post("/test")
def test_smtp(db: Session = Depends(get_db)):
    """Send a test email to the configured smtp_user address."""
    cp = _get_smtp_config(db)
    html = f"<p>SMTP connection test from <strong>{cp.name or 'Grocery WMS'}</strong>. If you received this, your email settings are working correctly.</p>"
    _send_email(cp, cp.smtp_user, f"[{cp.name or 'WMS'}] SMTP Test", html)
    return {"ok": True, "sent_to": cp.smtp_user}


@router.post("/invoice/{invoice_id}")
def email_invoice(invoice_id: int, req: SendInvoiceRequest, db: Session = Depends(get_db)):
    cp = _get_smtp_config(db)
    inv = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not inv:
        raise HTTPException(404, "Invoice not found")

    subject = req.subject or f"Invoice {inv.invoice_number} from {cp.name or 'Us'}"
    html = _invoice_html(inv, cp, req.body or "")
    _send_email(cp, req.to, subject, html)

    # Auto-advance status Draft → Sent
    if inv.status == "Draft":
        inv.status = "Sent"
        db.commit()

    return {"ok": True, "sent_to": req.to, "invoice": inv.invoice_number, "new_status": inv.status}


@router.post("/purchase-order/{po_id}")
def email_purchase_order(po_id: int, req: SendPORequest, db: Session = Depends(get_db)):
    cp = _get_smtp_config(db)
    po = db.query(PurchaseOrder).filter(PurchaseOrder.id == po_id).first()
    if not po:
        raise HTTPException(404, "Purchase order not found")

    subject = req.subject or f"Purchase Order {po.po_number} from {cp.name or 'Us'}"
    html = _po_html(po, cp, req.body or "")
    _send_email(cp, req.to, subject, html)

    # Auto-advance status draft → sent
    if po.status == "draft":
        po.status = "sent"
        db.commit()

    return {"ok": True, "sent_to": req.to, "po_number": po.po_number, "new_status": po.status}
