// ── Shared invoice template functions ─────────────────────────
// Used by Invoices.jsx (printing) and Settings.jsx (preview)

function _invoiceShared(inv) {
  const hasExpiry = inv.items.some(it => it.expiry_date)
  const disc = inv.discount_amount || 0
  const prev = inv.previous_balance || 0
  return { hasExpiry, disc, prev }
}

// Renders logo: image if base64 uploaded, otherwise emoji/initials
function _logoBlock(co, size = 52, style = '') {
  if (co.logo_base64) {
    return `<img src="${co.logo_base64}" width="${size}" height="${size}" style="object-fit:contain;display:block;${style}" alt="Logo"/>`
  }
  return `<span style="font-size:${Math.round(size * 0.45)}px;line-height:1">${co.logo_text || '🏪'}</span>`
}

// Shared QR + meta footer strip (rep / ship-via / pallets / catalog QR) for any template
function _metaStrip(co, inv) {
  const showQr  = co.show_qr_code && co.catalog_url
  const qrUrl   = showQr ? `https://api.qrserver.com/v1/create-qr-code/?size=72x72&data=${encodeURIComponent(co.catalog_url)}` : ''
  const pallets = (inv.num_pallets != null && inv.num_pallets !== '') ? inv.num_pallets : null
  const hasData = co.rep_name || inv.payment_terms || co.ship_via || pallets != null || showQr
  if (!hasData) return ''
  return `
  <div style="display:flex;align-items:flex-start;gap:16px;margin-top:12px;padding-top:10px;border-top:1px solid #ddd;font-size:11px">
    <div style="flex:1;display:flex;gap:8px;flex-wrap:wrap">
      ${co.rep_name     ? `<div style="background:#f5f5f5;border:1px solid #ddd;padding:4px 10px;border-radius:4px"><span style="font-size:9px;color:#888;display:block;font-weight:700;text-transform:uppercase">Rep</span>${co.rep_name}</div>` : ''}
      ${inv.payment_terms ? `<div style="background:#f5f5f5;border:1px solid #ddd;padding:4px 10px;border-radius:4px"><span style="font-size:9px;color:#888;display:block;font-weight:700;text-transform:uppercase">Terms</span>${inv.payment_terms}</div>` : ''}
      ${co.ship_via     ? `<div style="background:#f5f5f5;border:1px solid #ddd;padding:4px 10px;border-radius:4px"><span style="font-size:9px;color:#888;display:block;font-weight:700;text-transform:uppercase">Ship Via</span>${co.ship_via}</div>` : ''}
      ${pallets != null ? `<div style="background:#fff7ed;border:1px solid #fed7aa;padding:4px 10px;border-radius:4px"><span style="font-size:9px;color:#c2410c;display:block;font-weight:700;text-transform:uppercase">Pallets</span><strong>${pallets}</strong></div>` : ''}
    </div>
    ${showQr ? `<div style="text-align:center;flex-shrink:0"><img src="${qrUrl}" width="72" height="72" alt="QR"/><div style="font-size:8px;color:#666;margin-top:2px;font-weight:700;text-transform:uppercase;letter-spacing:.04em">Scan for catalog</div></div>` : ''}
  </div>`
}

// ── Template 1 (bold uppercase name, bordered boxes, gray-header table) ──────
export function templateOne(inv, co) {
  const { hasExpiry, disc, prev } = _invoiceShared(inv)
  const invoiceNote = co.invoice_note || ''
  const docTitle    = co.invoice_title || 'Invoice'
  const lines = inv.items.map((it, i) => `
    <tr style="background:${i % 2 === 0 ? '#fff' : '#f5f5f5'}">
      <td style="padding:6px 8px;border:1px solid #ccc;font-size:12px">${it.sku_code || ''}</td>
      <td style="padding:6px 8px;border:1px solid #ccc;font-size:12px">${it.description}</td>
      ${hasExpiry ? `<td style="padding:6px 8px;border:1px solid #ccc;text-align:center;font-size:11px">${it.expiry_date || '—'}</td>` : ''}
      <td style="padding:6px 8px;border:1px solid #ccc;text-align:center;font-size:12px;font-weight:600">${it.cases_qty}</td>
      <td style="padding:6px 8px;border:1px solid #ccc;text-align:right;font-size:12px">$${it.unit_price.toFixed(2)}</td>
      <td style="padding:6px 8px;border:1px solid #ccc;text-align:right;font-size:12px;font-weight:600">$${it.line_total.toFixed(2)}</td>
    </tr>`).join('')
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/>
  <title>Invoice ${inv.invoice_number}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:Arial,sans-serif;padding:36px;color:#000;font-size:12px;line-height:1.5}
    .top{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px}
    .co-name{font-size:22px;font-weight:900;letter-spacing:-.3px;color:#000;text-transform:uppercase}
    .co-details{font-size:11px;color:#333;margin-top:4px;line-height:1.7}
    .inv-block{text-align:right}
    .inv-title{font-size:20px;font-weight:700;color:#000;margin-bottom:8px}
    .bill-row{display:flex;gap:16px;margin-bottom:14px}
    .bill-box{flex:1;border:1px solid #888;padding:8px 10px}
    .bill-box h4{font-size:10px;font-weight:700;text-transform:uppercase;color:#555;margin-bottom:4px;border-bottom:1px solid #ccc;padding-bottom:3px}
    .bill-box p{font-size:11px;color:#000;margin:1px 0;line-height:1.6}
    table{width:100%;border-collapse:collapse;margin-bottom:14px}
    thead tr{background:#d0d0d0}
    thead th{padding:7px 8px;text-align:left;font-size:11px;font-weight:700;border:1px solid #888;text-transform:uppercase}
    tfoot td{padding:7px 8px;font-weight:700;border:1px solid #888;background:#f0f0f0}
    .totals-area{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px}
    .notes-box{flex:1;margin-right:24px;font-size:11px;color:#333;border:1px solid #ccc;padding:8px;min-height:40px}
    .totals-table{width:240px;border-collapse:collapse}
    .totals-table td{padding:5px 10px;font-size:12px;border:1px solid #ccc}
    .totals-table td:last-child{text-align:right;font-weight:600}
    .totals-table .bal-row td{font-weight:800;font-size:14px;background:#000;color:#fff;border-color:#000}
    .footer-line{border-top:1px solid #ccc;margin-top:14px;padding-top:8px;font-size:10px;color:#555;text-align:center;font-style:italic}
    @media print{body{padding:20px}}
  </style>
</head><body>
  <div class="top">
    <div style="display:flex;align-items:flex-start;gap:10px">
      ${co.logo_base64 ? `<img src="${co.logo_base64}" width="52" height="52" style="object-fit:contain;flex-shrink:0" alt="Logo"/>` : ''}
      <div>
      <div class="co-name">${co.name}</div>
      <div class="co-details">
        ${co.address ? co.address.replace(/\n/g, '<br>') : ''}
        ${co.phone ? `<br>Ph: ${co.phone}` : ''}${co.fax ? ` | Fax: ${co.fax}` : ''}${co.email ? `<br>Email: ${co.email}` : ''}
        ${co.website ? `<br>${co.website}` : ''}
        ${co.tax_number ? `<br>Tax No: ${co.tax_number}` : ''}
      </div>
      </div>
    </div>
    <div class="inv-block">
      <div class="inv-title">${docTitle}</div>
      <table style="width:auto;border-collapse:collapse;margin:0">
        <tr>
          <td style="border:1px solid #888;padding:4px 12px;font-size:11px;font-weight:700;background:#e8e8e8">Date</td>
          <td style="border:1px solid #888;padding:4px 12px;font-size:11px;font-weight:700;background:#e8e8e8">Invoice No.</td>
        </tr>
        <tr>
          <td style="border:1px solid #888;padding:4px 12px;font-size:12px">${inv.invoice_date}</td>
          <td style="border:1px solid #888;padding:4px 12px;font-size:12px;font-weight:600">${inv.invoice_number}</td>
        </tr>
        ${inv.due_date ? `<tr><td style="border:1px solid #888;padding:4px 12px;font-size:10px;font-weight:700;background:#e8e8e8">Due Date</td><td style="border:1px solid #888;padding:4px 12px;font-size:10px;font-weight:700;background:#e8e8e8">Status</td></tr><tr><td style="border:1px solid #888;padding:4px 12px;font-size:12px">${inv.due_date}</td><td style="border:1px solid #888;padding:4px 12px;font-size:12px">${inv.status}</td></tr>` : ''}
      </table>
    </div>
  </div>
  <div class="bill-row">
    <div class="bill-box">
      <h4>Bill To</h4>
      <p><strong>${inv.customer_name || inv.store_name}</strong></p>
      ${inv.customer_name && inv.store_name !== inv.customer_name ? `<p>${inv.store_name}</p>` : ''}
    </div>
    <div class="bill-box">
      <h4>Ship To</h4>
      <p><strong>${inv.customer_name || inv.store_name}</strong></p>
      ${inv.customer_name && inv.store_name !== inv.customer_name ? `<p>${inv.store_name}</p>` : ''}
    </div>
  </div>
  ${inv.payment_terms || inv.order_number ? `
  <div style="display:flex;border:1px solid #888;margin-bottom:12px">
    ${inv.payment_terms ? `<div style="flex:1;text-align:center;border-right:1px solid #888"><div style="padding:4px 8px;font-size:10px;font-weight:700;text-transform:uppercase;background:#e8e8e8;border-bottom:1px solid #888">Terms</div><div style="padding:4px 8px;font-size:11px">${inv.payment_terms}</div></div>` : ''}
    ${inv.order_number ? `<div style="flex:1;text-align:center;border-right:1px solid #888"><div style="padding:4px 8px;font-size:10px;font-weight:700;text-transform:uppercase;background:#e8e8e8;border-bottom:1px solid #888">Order Ref</div><div style="padding:4px 8px;font-size:11px">${inv.order_number}</div></div>` : ''}
    <div style="flex:1;text-align:center"><div style="padding:4px 8px;font-size:10px;font-weight:700;text-transform:uppercase;background:#e8e8e8;border-bottom:1px solid #888">Ship Date</div><div style="padding:4px 8px;font-size:11px">${inv.invoice_date}</div></div>
  </div>` : ''}
  <table style="margin-top:0">
    <thead><tr>
      <th style="width:80px">Item #</th>
      <th>Description</th>
      ${hasExpiry ? '<th style="width:90px;text-align:center">Best Before</th>' : ''}
      <th style="width:60px;text-align:center">Qty</th>
      <th style="width:80px;text-align:right">Price</th>
      <th style="width:90px;text-align:right">Amount</th>
    </tr></thead>
    <tbody>${lines}</tbody>
  </table>
  <div class="totals-area">
    <div class="notes-box">${inv.notes ? `<strong>Notes:</strong> ${inv.notes}` : '<span style="color:#aaa">Notes / Terms</span>'}</div>
    <table class="totals-table">
      <tr><td>Subtotal</td><td>$${inv.subtotal.toFixed(2)}</td></tr>
      ${disc > 0 ? `<tr><td>Discount</td><td style="color:green">-$${disc.toFixed(2)}</td></tr>` : ''}
      ${(inv.taxes || []).map(tx => `<tr><td>${tx.name} (${tx.rate}%)</td><td>$${tx.amount.toFixed(2)}</td></tr>`).join('')}
      <tr><td style="font-weight:700">Total</td><td>$${inv.total.toFixed(2)}</td></tr>
      ${prev > 0 ? `<tr><td>Previous Balance</td><td style="color:#c00">$${prev.toFixed(2)}</td></tr>` : ''}
      <tr class="bal-row"><td>${prev > 0 ? 'Balance Due' : 'Total Due'}</td><td>$${(inv.grand_total || inv.total).toFixed(2)}</td></tr>
    </table>
  </div>
  ${co.bank_details ? `<div style="font-size:11px;color:#333;border:1px solid #ccc;padding:8px;margin-bottom:10px"><strong>Payment Details:</strong> ${co.bank_details.replace(/\n/g, ' · ')}</div>` : ''}
  ${invoiceNote ? `<div style="font-size:11px;color:#555;margin-bottom:8px;padding:6px 8px;border-left:3px solid #888;background:#f9f9f9">${invoiceNote}</div>` : ''}
  ${_metaStrip(co, inv)}
  <div class="footer-line">Thank you for your business${co.website ? ` · ${co.website}` : ''}</div>
</body></html>`
}

// ── Template 2 (bold italic name, bordered date/invoice boxes, black Balance Due) ─
export function templateTwo(inv, co) {
  const { hasExpiry, disc, prev } = _invoiceShared(inv)
  const invoiceNote = co.invoice_note || ''
  const docTitle    = co.invoice_title || 'Invoice'
  const lines = inv.items.map((it, i) => `
    <tr style="background:${i % 2 === 0 ? '#fff' : '#f2f2f2'}">
      <td style="padding:7px 10px;border-bottom:1px solid #ddd;font-size:12px;text-align:center">${it.cases_qty}</td>
      <td style="padding:7px 10px;border-bottom:1px solid #ddd;font-size:12px">${it.description}${it.sku_code ? ` <span style="color:#888;font-size:11px">(${it.sku_code})</span>` : ''}
        ${hasExpiry && it.expiry_date ? `<span style="margin-left:6px;font-size:10px;color:#b91c1c;background:#fff1f2;padding:1px 6px;border-radius:8px">exp: ${it.expiry_date}</span>` : ''}
        ${it.notes ? `<div style="font-size:10px;color:#6366f1;font-style:italic;margin-top:2px">${it.notes}</div>` : ''}
      </td>
      <td style="padding:7px 10px;border-bottom:1px solid #ddd;text-align:right;font-size:12px">$${it.unit_price.toFixed(2)}</td>
      <td style="padding:7px 10px;border-bottom:1px solid #ddd;text-align:right;font-size:12px;font-weight:600">$${it.line_total.toFixed(2)}</td>
    </tr>`).join('')
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/>
  <title>Invoice ${inv.invoice_number}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:Arial,sans-serif;padding:40px;color:#000;font-size:12px;line-height:1.5}
    .top{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px}
    .co-name{font-size:24px;font-weight:900;font-style:italic;color:#000;letter-spacing:-.5px}
    .co-sub{font-size:11px;color:#333;margin-top:5px;line-height:1.8}
    .inv-right{text-align:right}
    .inv-label{font-size:22px;font-weight:700;color:#000;margin-bottom:10px}
    .info-boxes{display:flex;gap:0;margin-bottom:16px}
    .info-box{border:1px solid #999;padding:6px 12px;margin-right:-1px;min-width:120px}
    .info-box-label{font-size:9px;font-weight:700;text-transform:uppercase;color:#555;letter-spacing:.06em;display:block;margin-bottom:2px}
    .info-box-val{font-size:12px;font-weight:600;color:#000}
    .bill-row{display:flex;gap:20px;margin-bottom:16px}
    .bill-box{flex:1;border:1px solid #999;padding:10px 12px}
    .bill-box h4{font-size:10px;font-weight:700;text-transform:uppercase;color:#555;margin-bottom:6px}
    .bill-box p{font-size:12px;color:#000;margin:1px 0;line-height:1.6}
    table{width:100%;border-collapse:collapse;margin-bottom:0}
    thead tr{background:#c8c8c8}
    thead th{padding:8px 10px;text-align:left;font-size:11px;font-weight:700;border:1px solid #aaa;text-transform:uppercase;letter-spacing:.04em}
    tbody td{border-bottom:1px solid #ddd}
    .summary-block{display:flex;justify-content:flex-end;margin-top:0;border-top:1px solid #999}
    .summary-table{width:280px;border-collapse:collapse}
    .summary-table td{padding:7px 12px;font-size:12px;border:1px solid #ccc;border-top:none}
    .summary-table td:last-child{text-align:right}
    .summary-table .total-row td{font-weight:700;font-size:13px;background:#f0f0f0}
    .summary-table .due-row td{font-weight:800;font-size:15px;background:#000;color:#fff;border-color:#000}
    .legal{margin-top:16px;font-size:10px;color:#666;border-top:1px solid #ddd;padding-top:10px;line-height:1.7}
    @media print{body{padding:24px}}
  </style>
</head><body>
  <div class="top">
    <div style="display:flex;align-items:flex-start;gap:10px">
      ${co.logo_base64 ? `<img src="${co.logo_base64}" width="52" height="52" style="object-fit:contain;flex-shrink:0" alt="Logo"/>` : ''}
      <div>
      <div class="co-name">${co.name}</div>
      <div class="co-sub">
        ${co.address ? co.address.replace(/\n/g, '<br>') : ''}
        ${co.phone ? `<br>Ph: ${co.phone}` : ''}${co.fax ? ` | Fax: ${co.fax}` : ''}${co.email ? `<br>${co.email}` : ''}
        ${co.website ? `<br>${co.website}` : ''}
        ${co.tax_number ? `<br>Tax No: ${co.tax_number}` : ''}
      </div>
      </div>
    </div>
    <div class="inv-right">
      <div class="inv-label">${docTitle}</div>
      <div class="info-boxes">
        <div class="info-box"><span class="info-box-label">Date</span><span class="info-box-val">${inv.invoice_date}</span></div>
        <div class="info-box"><span class="info-box-label">Invoice #</span><span class="info-box-val">${inv.invoice_number}</span></div>
        ${inv.order_number ? `<div class="info-box"><span class="info-box-label">S.O. No.</span><span class="info-box-val">${inv.order_number}</span></div>` : ''}
      </div>
    </div>
  </div>
  <div class="bill-row">
    <div class="bill-box">
      <h4>Bill To</h4>
      <p><strong>${inv.customer_name || inv.store_name}</strong></p>
      ${inv.customer_name && inv.store_name !== inv.customer_name ? `<p>${inv.store_name}</p>` : ''}
    </div>
    <div class="bill-box">
      <h4>Ship To</h4>
      <p><strong>${inv.customer_name || inv.store_name}</strong></p>
      ${inv.customer_name && inv.store_name !== inv.customer_name ? `<p>${inv.store_name}</p>` : ''}
    </div>
  </div>
  ${inv.payment_terms ? `<div style="margin-bottom:12px;font-size:12px"><strong>Terms:</strong> <span style="background:#fef9c3;padding:2px 8px">${inv.payment_terms}</span></div>` : ''}
  <table>
    <thead><tr>
      <th style="width:60px;text-align:center">QTY</th>
      <th>Description</th>
      <th style="width:100px;text-align:right">Price Each</th>
      <th style="width:100px;text-align:right">Amount</th>
    </tr></thead>
    <tbody>${lines}</tbody>
  </table>
  <div class="summary-block">
    <table class="summary-table">
      <tr><td>Subtotal</td><td>$${inv.subtotal.toFixed(2)}</td></tr>
      ${disc > 0 ? `<tr><td>Discount</td><td style="color:green">-$${disc.toFixed(2)}</td></tr>` : ''}
      ${(inv.taxes || []).map(tx => `<tr><td>${tx.name} (${tx.rate}%)</td><td>$${tx.amount.toFixed(2)}</td></tr>`).join('')}
      <tr class="total-row"><td>Total</td><td>$${inv.total.toFixed(2)}</td></tr>
      <tr><td>Payments/Credits</td><td>$${prev > 0 ? prev.toFixed(2) : '0.00'}</td></tr>
      <tr class="due-row"><td>Balance Due</td><td>$${(inv.grand_total || inv.total).toFixed(2)}</td></tr>
    </table>
  </div>
  ${inv.notes ? `<div style="margin-top:12px;font-size:11px;color:#333;border:1px solid #ddd;padding:8px"><strong>Notes:</strong> ${inv.notes}</div>` : ''}
  ${co.bank_details ? `<div style="margin-top:10px;font-size:11px;color:#333"><strong>Payment Details:</strong> ${co.bank_details.replace(/\n/g, ' · ')}</div>` : ''}
  ${invoiceNote ? `<div style="margin-top:10px;font-size:11px;color:#555;padding:6px 10px;border-left:3px solid #aaa;background:#f8f8f8">${invoiceNote}</div>` : ''}
  ${_metaStrip(co, inv)}
  <div class="legal">
    ${co.website ? `${co.website} · ` : ''}Thank you for your business. ${inv.payment_terms ? `Payment terms: ${inv.payment_terms}.` : ''} All claims must be made within 24 hours of receipt.
  </div>
</body></html>`
}

// ── Template 3 (square logo, blue title, Rep/Terms/Ship row, blue-header table) ─
export function templateThree(inv, co) {
  const { hasExpiry, disc, prev } = _invoiceShared(inv)
  const invoiceNote = co.invoice_note || ''
  const docTitle    = co.invoice_title || 'Invoice'
  const blue = '#1a56db'
  const lines = inv.items.map((it, i) => `
    <tr style="background:${i % 2 === 0 ? '#fff' : '#f8faff'}">
      <td style="padding:7px 10px;border:1px solid #dde3f0;font-size:11px;color:#555;font-weight:600">${it.sku_code || '—'}</td>
      <td style="padding:7px 10px;border:1px solid #dde3f0;font-size:12px">${it.description}${it.notes ? `<div style="font-size:10px;color:#6366f1;font-style:italic;margin-top:2px">${it.notes}</div>` : ''}</td>
      ${hasExpiry ? `<td style="padding:7px 10px;border:1px solid #dde3f0;text-align:center;font-size:11px">${it.expiry_date ? `<span style="color:#b91c1c;background:#fff1f2;padding:1px 6px;border-radius:8px">${it.expiry_date}</span>` : '—'}</td>` : ''}
      <td style="padding:7px 10px;border:1px solid #dde3f0;text-align:center;font-size:12px;font-weight:700">${it.cases_qty}</td>
      <td style="padding:7px 10px;border:1px solid #dde3f0;text-align:right;font-size:12px;color:#555">$${it.unit_price.toFixed(2)}</td>
      <td style="padding:7px 10px;border:1px solid #dde3f0;text-align:right;font-size:12px;font-weight:700;color:${blue}">$${it.line_total.toFixed(2)}</td>
    </tr>`).join('')
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/>
  <title>Invoice ${inv.invoice_number}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:Arial,sans-serif;padding:36px;color:#1a1a2e;font-size:12px;line-height:1.5}
    .top{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;padding-bottom:16px;border-bottom:2px solid ${blue}}
    .logo-wrap{display:flex;align-items:center;gap:14px}
    .logo-sq{width:52px;height:52px;border:2px solid ${blue};display:flex;align-items:center;justify-content:center;font-size:22px;color:${blue};font-weight:900;flex-shrink:0}
    .co-name{font-size:18px;font-weight:800;color:#000;text-transform:uppercase;letter-spacing:-.3px;line-height:1.2}
    .co-sub{font-size:10px;color:#444;margin-top:4px;line-height:1.8}
    .inv-right{text-align:right}
    .inv-label{font-size:22px;font-weight:900;color:${blue};letter-spacing:1px;margin-bottom:8px}
    .inv-grid{display:grid;grid-template-columns:1fr 1fr;gap:0;border:1px solid #b0bec5}
    .inv-grid-cell{padding:4px 10px;border-right:1px solid #b0bec5;border-bottom:1px solid #b0bec5;font-size:10px;font-weight:700;text-transform:uppercase;color:#555;background:#eef2ff}
    .inv-grid-val{padding:4px 10px;border-right:1px solid #b0bec5;border-bottom:1px solid #b0bec5;font-size:12px;font-weight:600;color:#000}
    .inv-grid-cell:nth-child(even),.inv-grid-val:nth-child(even){border-right:none}
    .inv-grid-cell:nth-last-child(-n+2),.inv-grid-val:nth-last-child(-n+2){border-bottom:none}
    .addr-row{display:flex;gap:16px;margin-bottom:14px}
    .addr-box{flex:1;border:1px solid #b0bec5;padding:8px 10px}
    .addr-box h4{font-size:9px;font-weight:700;text-transform:uppercase;color:#6b7280;letter-spacing:.1em;margin-bottom:5px;border-bottom:1px solid #e0e7ff;padding-bottom:3px}
    .addr-box p{font-size:11px;color:#1a1a2e;margin:1px 0}
    .meta-row{display:flex;border:1px solid #b0bec5;border-bottom:none;margin-bottom:0}
    .meta-hd{flex:1;padding:4px 8px;font-size:10px;font-weight:700;text-transform:uppercase;text-align:center;background:#eef2ff;border-right:1px solid #b0bec5;color:#374151}
    .meta-hd:last-child{border-right:none}
    .meta-val-row{display:flex;border:1px solid #b0bec5;margin-bottom:12px}
    .meta-val{flex:1;padding:5px 8px;font-size:11px;text-align:center;border-right:1px solid #b0bec5;color:#1a1a2e}
    .meta-val:last-child{border-right:none}
    table{width:100%;border-collapse:collapse;margin-bottom:14px}
    thead tr{background:${blue}}
    thead th{padding:8px 10px;text-align:left;font-size:10px;font-weight:700;color:#fff;border:1px solid #1246b0;text-transform:uppercase;letter-spacing:.04em}
    .totals-wrap{display:flex;justify-content:flex-end;margin-bottom:12px}
    .t-table{width:260px;border-collapse:collapse}
    .t-table td{padding:6px 12px;font-size:12px;border:1px solid #dde3f0}
    .t-table td:last-child{text-align:right;font-weight:600}
    .t-table .grand td{background:${blue};color:#fff;font-weight:800;font-size:14px;border-color:${blue}}
    .footer{margin-top:12px;padding-top:10px;border-top:2px solid ${blue};display:flex;justify-content:space-between;font-size:10px;color:#6b7280}
    @media print{body{padding:20px}}
  </style>
</head><body>
  <div class="top">
    <div class="logo-wrap">
      <div class="logo-sq">${co.logo_base64 ? `<img src="${co.logo_base64}" width="44" height="44" style="object-fit:contain" alt="Logo"/>` : (co.logo_text || '🏪')}</div>
      <div>
        <div class="co-name">${co.name}</div>
        <div class="co-sub">
          ${co.address ? co.address.replace(/\n/g, '<br>') : ''}
          ${co.phone ? `<br>Phone: ${co.phone}` : ''}${co.fax ? ` | Fax: ${co.fax}` : ''}${co.email ? `<br>${co.email}` : ''}
          ${co.tax_number ? `<br>Tax No: ${co.tax_number}` : ''}
        </div>
      </div>
    </div>
    <div class="inv-right">
      <div class="inv-label">${docTitle}</div>
      <div class="inv-grid">
        <div class="inv-grid-cell">Date</div><div class="inv-grid-cell">Invoice #</div>
        <div class="inv-grid-val">${inv.invoice_date}</div><div class="inv-grid-val">${inv.invoice_number}</div>
        ${inv.due_date ? `<div class="inv-grid-cell">Due Date</div><div class="inv-grid-cell">Status</div><div class="inv-grid-val">${inv.due_date}</div><div class="inv-grid-val">${inv.status}</div>` : ''}
      </div>
    </div>
  </div>
  <div class="addr-row">
    <div class="addr-box">
      <h4>Bill To</h4>
      <p><strong>${inv.customer_name || inv.store_name}</strong></p>
      ${inv.customer_name && inv.store_name !== inv.customer_name ? `<p>${inv.store_name}</p>` : ''}
    </div>
    <div class="addr-box">
      <h4>Ship To</h4>
      <p><strong>${inv.customer_name || inv.store_name}</strong></p>
      ${inv.customer_name && inv.store_name !== inv.customer_name ? `<p>${inv.store_name}</p>` : ''}
    </div>
  </div>
  ${inv.payment_terms || inv.order_number ? `
  <div class="meta-row">
    <div class="meta-hd">Rep</div>
    <div class="meta-hd">Terms</div>
    ${inv.order_number ? '<div class="meta-hd">Order Ref</div>' : ''}
    <div class="meta-hd">Ship Date</div>
    <div class="meta-hd">Ship Via</div>
  </div>
  <div class="meta-val-row">
    <div class="meta-val">—</div>
    <div class="meta-val">${inv.payment_terms || '—'}</div>
    ${inv.order_number ? `<div class="meta-val">${inv.order_number}</div>` : ''}
    <div class="meta-val">${inv.invoice_date}</div>
    <div class="meta-val">—</div>
  </div>` : ''}
  <table>
    <thead><tr>
      <th style="width:80px">Item</th>
      <th>Description</th>
      ${hasExpiry ? '<th style="width:90px;text-align:center">Best Before</th>' : ''}
      <th style="width:60px;text-align:center">QTY</th>
      <th style="width:90px;text-align:right">Rate</th>
      <th style="width:100px;text-align:right">Amount</th>
    </tr></thead>
    <tbody>${lines}</tbody>
  </table>
  <div class="totals-wrap"><table class="t-table">
    <tr><td>Subtotal</td><td>$${inv.subtotal.toFixed(2)}</td></tr>
    ${disc > 0 ? `<tr><td>Discount</td><td style="color:green">-$${disc.toFixed(2)}</td></tr>` : ''}
    ${(inv.taxes || []).map(tx => `<tr><td>${tx.name} (${tx.rate}%)</td><td>$${tx.amount.toFixed(2)}</td></tr>`).join('')}
    <tr><td>Total</td><td>$${inv.total.toFixed(2)}</td></tr>
    ${prev > 0 ? `<tr><td>Previous Balance</td><td style="color:#c00">$${prev.toFixed(2)}</td></tr>` : ''}
    <tr class="grand"><td>${prev > 0 ? 'Balance Due' : 'Total Due'}</td><td>$${(inv.grand_total || inv.total).toFixed(2)}</td></tr>
  </table></div>
  ${inv.notes ? `<div style="font-size:11px;margin-bottom:10px;padding:8px;border:1px solid #dde3f0;background:#f8faff"><strong>Notes:</strong> ${inv.notes}</div>` : ''}
  ${invoiceNote ? `<div style="font-size:11px;margin-bottom:10px;padding:6px 10px;border-left:3px solid ${blue};background:#eef2ff;color:#374151">${invoiceNote}</div>` : ''}
  ${_metaStrip(co, inv)}
  <div class="footer">
    <span>${co.bank_details ? `Payment: ${co.bank_details.replace(/\n/g, ' · ')}` : ''}</span>
    <span>Thank you for your business${co.website ? ' · ' + co.website : ''}</span>
  </div>
</body></html>`
}

// ── Template 4 — Sales Order (United Trading style) ───────────
export function templateFour(inv, co) {
  const { disc, prev } = _invoiceShared(inv)
  const docTitle    = co.invoice_title  || 'Sales Order'
  const invoiceNote = co.invoice_note   || ''
  const showQr      = co.show_qr_code   && co.catalog_url
  const qrUrl       = showQr ? `https://api.qrserver.com/v1/create-qr-code/?size=88x88&data=${encodeURIComponent(co.catalog_url)}` : ''

  const lines = inv.items.map((it, i) => `
    <tr style="background:${i % 2 === 0 ? '#fff' : '#f5f5f5'}">
      <td style="padding:4px 6px;border:1px solid #ccc;font-size:11px;font-weight:600;white-space:nowrap">${it.sku_code || ''}</td>
      <td style="padding:4px 6px;border:1px solid #ccc;font-size:11px">${it.description}</td>
      <td style="padding:4px 6px;border:1px solid #ccc;font-size:11px;text-align:center">${it.notes || ''}</td>
      <td style="padding:4px 6px;border:1px solid #ccc;font-size:11px;text-align:center;font-weight:700">${it.cases_qty}</td>
      <td style="padding:4px 6px;border:1px solid #ccc;font-size:11px;text-align:right">${it.unit_price.toFixed(2)}</td>
      <td style="padding:4px 6px;border:1px solid #ccc;font-size:11px;text-align:right;font-weight:600">${it.line_total.toFixed(2)}</td>
    </tr>`).join('')

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/>
  <title>${docTitle} ${inv.invoice_number}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:Arial,sans-serif;padding:28px;color:#000;font-size:11px;line-height:1.45}
    .hdr{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px}
    .co-wrap{display:flex;align-items:flex-start;gap:10px}
    .logo-box{border:2px solid #555;width:64px;height:64px;display:flex;align-items:center;justify-content:center;font-size:26px;flex-shrink:0}
    .co-name{font-size:16px;font-weight:900;text-transform:uppercase;line-height:1.15;letter-spacing:-.2px}
    .co-addr{font-size:10px;margin-top:5px;line-height:1.7;color:#222}
    .qr-block{text-align:center;margin:0 10px}
    .qr-label{font-size:8px;font-weight:700;margin-top:3px;text-transform:uppercase;letter-spacing:.04em}
    .title-block{text-align:right}
    .doc-title{font-size:26px;font-weight:900;color:#1a56db;margin-bottom:8px;letter-spacing:.5px}
    .meta-tbl{border-collapse:collapse;margin-left:auto;min-width:180px}
    .meta-tbl th{background:#e8e8e8;border:1px solid #999;padding:4px 18px;font-size:10px;font-weight:700;text-align:center}
    .meta-tbl td{border:1px solid #999;padding:5px 18px;font-size:11px;text-align:center}
    .addr-row{display:flex;gap:10px;margin-bottom:8px}
    .addr-box{flex:1;border:1px solid #aaa;padding:6px 8px}
    .addr-title{font-size:10px;font-weight:700;margin-bottom:3px;border-bottom:1px solid #ccc;padding-bottom:2px}
    .addr-box p{font-size:11px;margin:1px 0;line-height:1.5}
    .ship-row{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:0}
    .meta-bar{display:flex;border:1px solid #aaa;border-bottom:none;margin-bottom:0}
    .meta-hd{flex:1;padding:4px 6px;background:#e8e8e8;font-size:10px;font-weight:700;text-align:center;border-right:1px solid #aaa}
    .meta-hd:last-child{border-right:none}
    .meta-val-bar{display:flex;border:1px solid #aaa;margin-bottom:8px}
    .meta-val{flex:1;padding:5px 6px;font-size:11px;text-align:center;border-right:1px solid #aaa}
    .meta-val:last-child{border-right:none}
    table.items{width:100%;border-collapse:collapse;margin-bottom:0}
    table.items thead th{background:#e8e8e8;border:1px solid #aaa;padding:5px 6px;font-size:10px;font-weight:700;text-align:left}
    table.items tfoot td{border:1px solid #aaa;padding:5px 8px;font-weight:700;font-size:12px}
    .note-box{margin-top:8px;font-size:10px;color:#444;border-left:3px solid #aaa;padding-left:6px}
    .pg-footer{margin-top:12px;text-align:center;font-size:10px;color:#777}
    @media print{body{padding:16px}}
  </style>
</head><body>
  <!-- ── Header ── -->
  <div class="hdr">
    <div class="co-wrap">
      <div class="logo-box">${co.logo_base64 ? `<img src="${co.logo_base64}" width="56" height="56" style="object-fit:contain" alt="Logo"/>` : (co.logo_text || '🏪')}</div>
      <div>
        <div class="co-name">${co.name}</div>
        <div class="co-addr">
          ${co.address ? co.address.replace(/\n/g, '<br>') : ''}
          ${co.phone ? `<br>Phone: &nbsp;${co.phone}` : ''}
          ${co.fax   ? `<br>Fax: &nbsp;&nbsp;&nbsp;${co.fax}` : ''}
          ${co.email ? `<br>Email: &nbsp;${co.email}` : ''}
        </div>
      </div>
    </div>
    ${showQr ? `<div class="qr-block"><img src="${qrUrl}" width="88" height="88" alt="QR Code"/><div class="qr-label">Scan me to see the catalog</div></div>` : ''}
    <div class="title-block">
      <div class="doc-title">${docTitle}</div>
      <table class="meta-tbl">
        <tr><th>Date</th><th>S.O. No.</th></tr>
        <tr><td>${inv.invoice_date}</td><td><strong>${inv.invoice_number}</strong></td></tr>
        ${inv.due_date ? `<tr><th>Due Date</th><th>Status</th></tr><tr><td>${inv.due_date}</td><td>${inv.status}</td></tr>` : ''}
      </table>
    </div>
  </div>

  <!-- ── Bill To / Ship To ── -->
  <div class="addr-row">
    <div class="addr-box" style="flex:1.2">
      <div class="addr-title">Name / Address</div>
      <p><strong>${inv.customer_name || inv.store_name}</strong></p>
      ${inv.customer_name && inv.store_name !== inv.customer_name ? `<p>${inv.store_name}</p>` : ''}
    </div>
    <div class="addr-box" style="flex:1.2">
      <div class="addr-title">Ship To</div>
      <p><strong>${inv.customer_name || inv.store_name}</strong></p>
      ${inv.customer_name && inv.store_name !== inv.customer_name ? `<p>${inv.store_name}</p>` : ''}
    </div>
  </div>

  <!-- ── Rep / Terms / Est. Ship Date / Ship Via ── -->
  <div class="meta-bar">
    <div class="meta-hd">Rep</div>
    <div class="meta-hd">Terms</div>
    <div class="meta-hd">Est. Ship Date</div>
    <div class="meta-hd">Ship Via</div>
  </div>
  <div class="meta-val-bar">
    <div class="meta-val">${co.rep_name || '—'}</div>
    <div class="meta-val">${inv.payment_terms || '—'}</div>
    <div class="meta-val">${inv.due_date || inv.invoice_date}</div>
    <div class="meta-val">${co.ship_via || '—'}</div>
  </div>

  <!-- ── Items table ── -->
  <table class="items">
    <thead>
      <tr>
        <th style="width:80px">Item</th>
        <th>Description</th>
        <th style="width:90px;text-align:center">Notes</th>
        <th style="width:50px;text-align:center">QTY</th>
        <th style="width:72px;text-align:right">Rate</th>
        <th style="width:80px;text-align:right">Amount</th>
      </tr>
    </thead>
    <tbody>${lines}</tbody>
    <tfoot>
      ${disc > 0 ? `<tr><td colspan="4"></td><td style="text-align:right">Discount</td><td style="text-align:right;color:green">-$${disc.toFixed(2)}</td></tr>` : ''}
      ${(inv.taxes || []).map(tx => `<tr><td colspan="4"></td><td style="text-align:right">${tx.name} (${tx.rate}%)</td><td style="text-align:right">$${tx.amount.toFixed(2)}</td></tr>`).join('')}
      ${prev > 0 ? `<tr><td colspan="4"></td><td style="text-align:right">Previous Balance</td><td style="text-align:right;color:#c00">$${prev.toFixed(2)}</td></tr>` : ''}
      <tr>
        <td colspan="4" style="border:none;background:#fff"></td>
        <td style="text-align:right;background:#e8e8e8;border:1px solid #aaa;font-weight:700;font-size:12px">Total</td>
        <td style="text-align:right;background:#e8e8e8;border:1px solid #aaa;font-weight:700;font-size:12px">$${(inv.grand_total || inv.total).toFixed(2)}</td>
      </tr>
    </tfoot>
  </table>

  ${inv.notes ? `<div class="note-box"><strong>Notes:</strong> ${inv.notes}</div>` : ''}
  ${invoiceNote ? `<div class="note-box" style="margin-top:4px">${invoiceNote}</div>` : ''}
  ${co.bank_details ? `<div style="margin-top:8px;font-size:10px;color:#333"><strong>Payment:</strong> ${co.bank_details.replace(/\n/g,' · ')}</div>` : ''}
  <div class="pg-footer">Page 1</div>
</body></html>`
}

// ── Print an invoice using the company's chosen template ───────
export function printInvoice(inv, company = {}) {
  const co = {
    name:          company.name          || 'My Company',
    address:       company.address       || '',
    phone:         company.phone         || '',
    fax:           company.fax           || '',
    email:         company.email         || '',
    website:       company.website       || '',
    tax_number:    company.tax_number    || '',
    bank_details:  company.bank_details  || '',
    invoice_note:  company.invoice_note  || '',
    invoice_title: company.invoice_title || 'Invoice',
    logo_text:     company.logo_text     || '🏪',
    logo_base64:   company.logo_base64   || '',
    rep_name:      company.rep_name      || '',
    ship_via:      company.ship_via      || '',
    catalog_url:   company.catalog_url   || '',
    show_qr_code:  company.show_qr_code  || false,
  }
  const tpl = company.invoice_template || 'attari'
  const html = tpl === 'fahman'     ? templateTwo(inv, co)
             : tpl === 'united'     ? templateThree(inv, co)
             : tpl === 'salesorder' ? templateFour(inv, co)
             :                        templateOne(inv, co)

  const win = window.open('', '_blank', 'width=950,height=750')
  win.document.write(html)
  win.document.close()
  win.onload = () => win.print()
}

// ── Dummy invoice data for template preview ────────────────────
export const DUMMY_INVOICE = {
  invoice_number: 'INV-2026-0042',
  invoice_date:   '2026-03-22',
  due_date:       '2026-04-05',
  status:         'Draft',
  store_name:     'Metro Supermarket',
  customer_name:  'Metro Supermarket',
  order_number:   'ORD-20260322-0007',
  payment_terms:  'Net 30',
  notes:          '',
  subtotal:       1248.00,
  total:          1248.00,
  grand_total:    1248.00,
  discount_amount: 0,
  previous_balance: 0,
  taxes:          [],
  items: [
    { sku_code: 'COKE-24', description: 'Coca-Cola Classic 24x330ml',       cases_qty: 20, unit_price: 18.50, line_total: 370.00, expiry_date: '2026-12-31', notes: '' },
    { sku_code: 'BIRYANI-12', description: 'Chicken Biryani Ready Meal 12x500g', cases_qty: 15, unit_price: 32.00, line_total: 480.00, expiry_date: '2026-06-15', notes: '' },
    { sku_code: 'RICE-PR', description: 'Basmati Rice Premium 10x2kg',       cases_qty: 8,  unit_price: 22.00, line_total: 176.00, expiry_date: null, notes: '' },
    { sku_code: 'JUICE-MF', description: 'Mixed Fruit Juice 12x1L',           cases_qty: 8,  unit_price: 28.00, line_total: 224.00, expiry_date: '2026-09-01', notes: '' },
  ],
}

export const DUMMY_COMPANY = {
  name:          'Sunrise Foods & Distribution',
  address:       '4747 Commerce Way, Suite 805\nDallas, TX 75247',
  phone:         '+1 (555) 867-5309',
  fax:           '+1 (555) 867-5310',
  email:         'accounts@sunrisefoods.com',
  website:       'www.sunrisefoods.com',
  tax_number:    'GST 12-3456789',
  bank_details:  'Bank: National Bank\nAccount: 00-1234-5678',
  invoice_note:  '',
  invoice_title: 'Sales Order',
  logo_text:     '🌅',
  rep_name:      'AS',
  ship_via:      'OUR TRUCK',
  catalog_url:   'https://sunrisefoods.com/catalog',
  show_qr_code:  true,
}
