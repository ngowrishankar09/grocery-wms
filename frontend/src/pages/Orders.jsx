import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { orderAPI, skuAPI, customerAPI, invoiceAPI } from '../api/client'
import { useT } from '../i18n/translations'
import {
  Plus, Truck, Search, ShoppingCart,
  Printer, Package, Minus, X, Smartphone, Eye, Edit2, Check, User, ChevronRight,
  FileText, ArrowRight, ClipboardList,
} from 'lucide-react'

const today = () => new Date().toISOString().split('T')[0]

function printPickList(pickList) {
  const now = new Date()
  const dateStr = now.toLocaleDateString()
  const timeStr = now.toLocaleTimeString()
  const rows = pickList.pick_list.map((item, i) => `
    <tr>
      <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;text-align:center;font-size:11px;color:#6b7280">${item.pick_order}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb">
        <div style="font-weight:600;font-size:12px">${item.product_name}</div>
        <div style="font-size:10px;color:#6b7280;font-family:monospace">${item.sku_code}</div>
      </td>
      <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;font-weight:700;color:#1d4ed8;font-family:monospace;font-size:13px;text-align:center">${item.bin_location || '—'}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;text-align:center">
        <div style="display:inline-block;width:36px;height:24px;border:1.5px solid #374151;border-radius:4px"></div>
      </td>
      <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;text-align:center;font-weight:600">${item.cases_requested}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;font-size:10px;color:#6b7280">
        ${item.picks.map(p => `${p.warehouse} · ${p.batch_code}${p.expiry_date ? ` · exp ${p.expiry_date}` : ''} (${p.cases_to_pick}cs)`).join('<br>')}
      </td>
      <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;text-align:center">
        <span style="padding:2px 8px;border-radius:12px;font-size:10px;font-weight:600;background:${item.status==='ok'?'#d1fae5':item.status==='partial'?'#fef3c7':'#fee2e2'};color:${item.status==='ok'?'#065f46':item.status==='partial'?'#92400e':'#991b1b'}">${item.status==='ok'?'FULL':item.status==='partial'?'PARTIAL':'STOCKOUT'}</span>
      </td>
    </tr>`).join('')

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Pick List — ${pickList.order_number}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; font-size: 12px; padding: 20px; color: #111; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #1e3a5f; padding-bottom: 10px; margin-bottom: 14px; }
    .header-left h1 { font-size: 20px; font-weight: 800; color: #1e3a5f; }
    .header-left p { font-size: 12px; color: #555; margin-top: 2px; }
    .header-right { text-align: right; font-size: 11px; color: #555; }
    .header-right strong { font-size: 13px; color: #111; }
    .meta { display: flex; gap: 32px; margin-bottom: 14px; font-size: 11px; color: #374151; }
    .meta span strong { color: #111; font-size: 12px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
    thead tr { background: #1e3a5f; color: #fff; }
    thead th { padding: 8px; text-align: left; font-size: 11px; font-weight: 600; letter-spacing: .04em; }
    thead th:nth-child(1), thead th:nth-child(3), thead th:nth-child(4), thead th:nth-child(5), thead th:nth-child(7) { text-align: center; }
    tfoot td { padding: 8px; font-weight: 700; border-top: 2px solid #1e3a5f; }
    .footer { margin-top: 20px; padding-top: 10px; border-top: 1px solid #e5e7eb; font-size: 10px; color: #9ca3af; text-align: center; }
    @media print { body { padding: 10px; } }
  </style>
</head>
<body>
  <div class="header">
    <div class="header-left">
      <h1>Pick List</h1>
      <p>${pickList.store_name}</p>
    </div>
    <div class="header-right">
      <strong>${pickList.order_number}</strong><br>
      ${dateStr} &nbsp; ${timeStr}<br>
      Order Date: ${pickList.order_date}
    </div>
  </div>
  <div class="meta">
    <span>Total Lines: <strong>${pickList.pick_list.length}</strong></span>
    <span>Total Cases: <strong>${pickList.pick_list.reduce((s,i)=>s+i.cases_requested,0)}</strong></span>
    <span>Available: <strong>${pickList.pick_list.reduce((s,i)=>s+i.cases_available,0)}</strong></span>
    <span>Short: <strong style="color:${pickList.pick_list.some(i=>i.status!=='ok')?'#b91c1c':'#065f46'}">${pickList.pick_list.filter(i=>i.status!=='ok').length} lines</strong></span>
  </div>
  <table>
    <thead>
      <tr>
        <th style="width:36px">#</th>
        <th>Item Description</th>
        <th style="width:70px">Location</th>
        <th style="width:52px">Picked</th>
        <th style="width:60px">Released</th>
        <th>Batch / Expiry</th>
        <th style="width:70px">Status</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
    <tfoot>
      <tr>
        <td colspan="3"></td>
        <td style="text-align:center">____</td>
        <td style="text-align:center">${pickList.pick_list.reduce((s,i)=>s+i.cases_requested,0)}</td>
        <td colspan="2" style="text-align:right;font-size:10px;color:#6b7280">Picker signature: ________________________</td>
      </tr>
    </tfoot>
  </table>
  <div class="footer">Printed ${dateStr} ${timeStr} — ${pickList.order_number}</div>
</body>
</html>`

  const win = window.open('', '_blank', 'width=900,height=700')
  win.document.write(html)
  win.document.close()
  win.focus()
  setTimeout(() => win.print(), 400)
}

const statusBadge = (status) => {
  if (status === 'Dispatched') return <span className="badge-ok">{status}</span>
  if (status === 'Pending')    return <span className="badge-warning">{status}</span>
  if (status === 'Cancelled')  return <span className="badge-danger">{status}</span>
  return <span className="badge-neutral">{status}</span>
}

const pickStatusBadge = (status) => {
  if (status === 'ok')      return <span className="badge-ok">✅ Full</span>
  if (status === 'partial') return <span className="badge-warning">⚠️ Partial</span>
  return <span className="badge-danger">🚫 Stockout</span>
}

function printSalesOrder(detail) {
  const w = window.open('', '_blank', 'width=820,height=620')
  if (!w) return alert('Allow popups to print the sales order')
  const rows = detail.items.map(i => `
    <tr>
      <td>${i.sku_code || ''}</td>
      <td>${i.product_name || ''}</td>
      <td style="text-align:right">${i.cases_requested}</td>
      <td style="text-align:right">${i.cases_fulfilled ?? '—'}</td>
    </tr>`).join('')
  w.document.write(`<!DOCTYPE html><html><head>
    <title>Sales Order ${detail.order_number}</title>
    <style>
      *{box-sizing:border-box}body{font-family:Arial,sans-serif;padding:40px;color:#111}
      h1{font-size:22px;margin:0 0 4px}
      .sub{color:#555;font-size:13px;margin-bottom:24px}
      table{width:100%;border-collapse:collapse;margin-top:16px}
      th,td{border:1px solid #ccc;padding:8px 10px;font-size:13px;text-align:left}
      th{background:#f5f5f5;font-weight:600}
      .footer{margin-top:32px;font-size:12px;color:#888}
      @media print{.no-print{display:none}}
    </style>
  </head><body>
    <h1>Sales Order — ${detail.order_number}</h1>
    <div class="sub">
      Store: <strong>${detail.store_name}</strong> &nbsp;|&nbsp;
      Date: ${detail.order_date} &nbsp;|&nbsp; Status: ${detail.status}
      ${detail.notes ? `<br>Notes: ${detail.notes}` : ''}
    </div>
    <table>
      <thead><tr><th>SKU</th><th>Product</th><th style="text-align:right">Cases Ordered</th><th style="text-align:right">Cases Fulfilled</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="footer">Printed ${new Date().toLocaleString()}</div>
    <script>window.onload=()=>window.print()</script>
  </body></html>`)
  w.document.close()
}

// ── Catalog Modal (New Order / Edit Order) ───────────────────
function CatalogModal({ skus, customers, mode, orderNumber, initialCart = {}, initialItemMeta = {}, initialStoreName = '', initialOrderDate = null, initialNotes = '', onClose, onSubmit }) {
  const [search, setSearch]       = useState('')
  const [category, setCategory]   = useState('All')
  const [customerId, setCustomerId] = useState('')
  const [storeName, setStoreName] = useState(initialStoreName)
  const [orderDate, setOrderDate] = useState(initialOrderDate || today())
  const [notes, setNotes]         = useState(initialNotes)
  const [cart, setCart]           = useState(initialCart)
  const [itemMeta, setItemMeta]   = useState(initialItemMeta) // { [id]: { unit_price, notes } }
  const [placing, setPlacing]     = useState(false)
  const [showMobileCart, setShowMobileCart] = useState(false)
  const [removeConfirm, setRemoveConfirm] = useState(null) // { id, name }
  const catRef = useRef(null)

  const isCreate = mode === 'create'

  const categories = ['All', ...Array.from(new Set(skus.map(s => s.category).filter(Boolean)))]
  const filtered = skus.filter(s => {
    const matchCat = category === 'All' || s.category === category
    const matchSearch = !search ||
      s.product_name?.toLowerCase().includes(search.toLowerCase()) ||
      s.sku_code?.toLowerCase().includes(search.toLowerCase())
    return matchCat && matchSearch
  })

  const setQty = (id, qty) => {
    if (qty <= 0 || isNaN(qty)) return
    setCart(prev => ({ ...prev, [id]: qty }))
  }
  const tryRemove = (id, name) => setRemoveConfirm({ id, name })
  const confirmRemove = (id) => {
    setCart(prev => { const c = { ...prev }; delete c[id]; return c })
    setItemMeta(prev => { const c = { ...prev }; delete c[id]; return c })
    setRemoveConfirm(null)
  }
  const setMeta = (id, field, value) =>
    setItemMeta(prev => ({ ...prev, [id]: { ...(prev[id] || {}), [field]: value } }))

  const cartItems = Object.entries(cart).map(([id, qty]) => {
    const s = skus.find(x => x.id === parseInt(id))
    const meta = itemMeta[id] || {}
    return s ? { ...s, qty, unit_price_override: meta.unit_price ?? '', item_notes: meta.notes ?? '' } : null
  }).filter(Boolean)

  const cartCount = Object.values(cart).reduce((a, b) => a + b, 0)

  const handleSubmit = async () => {
    if (!storeName.trim()) return alert('Enter store name')
    if (!cartItems.length) return alert('Add at least one product')
    setPlacing(true)
    try {
      await onSubmit({
        customerId: customerId ? parseInt(customerId) : null,
        storeName: storeName.trim(),
        orderDate,
        notes,
        items: cartItems.map(i => ({
          sku_id: i.id,
          cases_requested: i.qty,
          unit_price: i.unit_price_override !== '' ? parseFloat(i.unit_price_override) : null,
          notes: i.item_notes || null,
        })),
      })
    } catch (e) {
      alert('Error: ' + (e.response?.data?.detail || e.message))
      setPlacing(false)
    }
  }

  const cartPanelJSX = (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b">
        <h3 className="font-bold text-gray-900 flex items-center gap-2 text-sm">
          <ShoppingCart size={15} className="text-indigo-600" />
          Order Items
          {cartCount > 0 && <span className="ml-auto text-xs text-gray-400">{cartCount} cases</span>}
        </h3>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {cartItems.length === 0 ? (
          <div className="py-10 text-center text-gray-400">
            <ShoppingCart size={28} className="mx-auto mb-2 opacity-20" />
            <p className="text-xs">No items added yet</p>
          </div>
        ) : cartItems.map(i => (
          <div key={i.id} className="py-2 border-b border-gray-50 last:border-0 space-y-1.5">
            {/* Name + qty controls */}
            <div className="flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-900 leading-snug">{i.product_name}</div>
                <div className="text-[11px] text-gray-400">{i.sku_code}</div>
              </div>
              <div className="flex items-center gap-0.5 bg-gray-50 rounded-lg px-0.5 shrink-0">
                <button
                  onClick={() => i.qty <= 1 ? tryRemove(i.id, i.product_name) : setQty(i.id, Math.max(0.01, i.qty - 1))}
                  className="w-6 h-6 flex items-center justify-center rounded hover:bg-red-100 text-gray-500 hover:text-red-500"
                ><Minus size={11} /></button>
                <input
                  type="number" min="0" step="any"
                  key={i.qty}
                  defaultValue={i.qty}
                  className="w-10 text-center text-sm font-bold bg-transparent focus:outline-none focus:bg-white focus:rounded"
                  onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v) && v > 0) setQty(i.id, v) }}
                  onBlur={e => { const v = parseFloat(e.target.value); if (isNaN(v) || v <= 0) tryRemove(i.id, i.product_name) }}
                />
                <button onClick={() => setQty(i.id, i.qty + 1)} className="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-200 text-gray-600"><Plus size={11} /></button>
              </div>
            </div>
            {/* Price override + notes */}
            <div className="flex gap-1.5">
              <div className="relative flex-1">
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs pointer-events-none">$</span>
                <input
                  type="number" min="0" step="any"
                  key={'price-' + i.id}
                  defaultValue={i.unit_price_override}
                  onChange={e => setMeta(i.id, 'unit_price', e.target.value)}
                  placeholder={i.selling_price != null ? i.selling_price.toFixed(2) : 'Default price'}
                  className="w-full pl-5 pr-2 py-1 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-white"
                />
              </div>
              <input
                type="text"
                key={'note-' + i.id}
                defaultValue={i.item_notes}
                onChange={e => setMeta(i.id, 'notes', e.target.value)}
                placeholder="Line note…"
                className="flex-[2] px-2 py-1 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-white"
              />
            </div>
          </div>
        ))}
      </div>
      <div className="border-t px-4 py-4">
        <button
          onClick={handleSubmit}
          disabled={placing || cartItems.length === 0}
          className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2 text-sm"
        >
          {placing
            ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Saving…</>
            : <><Check size={15} /> {isCreate ? 'Place Order' : 'Save Changes'} ({cartItems.length} SKU{cartItems.length !== 1 ? 's' : ''})</>
          }
        </button>
      </div>
    </div>
  )

  return (
    <>
    {/* Backdrop — no onClick, user must use X button to avoid accidental close */}
    <div className="fixed inset-0 bg-black/50 z-[55]" />

    {/* Remove item confirmation — rendered above everything */}
    {removeConfirm && (
      <div className="fixed inset-0 bg-black/40 z-[70] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full space-y-4">
            <h4 className="font-bold text-gray-900">Remove Item?</h4>
            <p className="text-sm text-gray-600">Remove <strong>{removeConfirm.name}</strong> from this order completely?</p>
            <div className="flex gap-3">
              <button
                className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold py-2 rounded-xl text-sm transition-colors"
                onClick={() => confirmRemove(removeConfirm.id)}
              >Yes, Remove</button>
              <button
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-2 rounded-xl text-sm transition-colors"
                onClick={() => setRemoveConfirm(null)}
              >Cancel</button>
            </div>
          </div>
        </div>
      )}

    {/* Drawer panel */}
    <div className="fixed inset-y-0 right-0 z-[60] flex w-full max-w-5xl shadow-2xl">

      {/* Main area */}
      <div className="flex-1 bg-gray-50 flex flex-col overflow-hidden min-w-0">
        {/* Top bar */}
        <div className="bg-white border-b px-4 py-3 flex items-center gap-3 shrink-0">
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500 shrink-0">
            <X size={18} />
          </button>
          <h2 className="font-bold text-gray-900 flex-1 text-base truncate">
            {isCreate ? 'New Order — Select Products' : `Edit Order ${orderNumber}`}
          </h2>
          <button
            onClick={() => setShowMobileCart(true)}
            className="lg:hidden relative flex items-center gap-1.5 bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium shrink-0"
          >
            <ShoppingCart size={15} />
            Cart
            {cartCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                {cartCount}
              </span>
            )}
          </button>
        </div>

        {/* Order info */}
        <div className="bg-white border-b px-4 py-2 flex flex-wrap gap-3 items-end shrink-0">
          {isCreate && (
            <div className="min-w-[150px]">
              <label className="label text-[11px] mb-0.5">Customer (optional)</label>
              <select className="input text-sm py-1.5" value={customerId} onChange={e => {
                setCustomerId(e.target.value)
                if (e.target.value) {
                  const c = customers.find(c => c.id === parseInt(e.target.value))
                  if (c) setStoreName(c.name)
                }
              }}>
                <option value="">— Walk-in / Other —</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}
          <div className="min-w-[130px] flex-1">
            <label className="label text-[11px] mb-0.5">Store Name *</label>
            <input className="input text-sm py-1.5" value={storeName} onChange={e => setStoreName(e.target.value)} placeholder="Store A" />
          </div>
          <div>
            <label className="label text-[11px] mb-0.5">Order Date</label>
            <input type="date" className="input text-sm py-1.5" value={orderDate} onChange={e => setOrderDate(e.target.value)} />
          </div>
          <div className="min-w-[160px] flex-1">
            <label className="label text-[11px] mb-0.5">Notes (optional)</label>
            <input className="input text-sm py-1.5" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Special instructions…" />
          </div>
        </div>

        {/* Search */}
        <div className="px-4 pt-3 pb-2 shrink-0">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              className="w-full pl-8 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Search products or SKU…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Category chips */}
        <div className="px-4 pb-2 shrink-0">
          <div ref={catRef} className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setCategory(cat)}
                className={`shrink-0 px-3 py-1 rounded-full text-xs font-medium border transition-all ${
                  category === cat
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300 hover:text-indigo-600'
                }`}
              >{cat}</button>
            ))}
          </div>
        </div>

        {/* Product grid */}
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {filtered.length === 0 ? (
            <div className="py-16 text-center text-gray-400">
              <Package size={36} className="mx-auto mb-3 opacity-30" />
              No products found
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3">
              {filtered.map(p => {
                const qty     = cart[p.id] || 0
                const inStock = (p.total_cases || 0) > 0
                return (
                  <div key={p.id} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden flex flex-col hover:shadow-md transition-shadow">
                    <div className="h-24 bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center overflow-hidden relative">
                      {p.image_url
                        ? <img src={`http://localhost:8000${p.image_url}`} alt={p.product_name} className="h-full w-full object-cover" />
                        : <Package size={28} className="text-gray-300" />
                      }
                      {!inStock && (
                        <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
                          <span className="text-[10px] font-semibold text-red-500 bg-white px-2 py-0.5 rounded-full border border-red-200">Out of stock</span>
                        </div>
                      )}
                    </div>
                    <div className="p-2.5 flex flex-col flex-1">
                      <span className="text-[9px] text-indigo-500 font-semibold uppercase tracking-wider truncate">{p.category || '—'}</span>
                      <h3 className="font-semibold text-gray-900 text-xs leading-tight line-clamp-2 mt-0.5 min-h-[2rem]">{p.product_name}</h3>
                      <p className="text-[10px] text-gray-400 truncate">{p.sku_code}</p>
                      <div className="text-[10px] text-emerald-600 font-medium mt-0.5">
                        {inStock ? `${p.total_cases} in stock` : ''}
                      </div>
                      {p.selling_price != null && (
                        <div className="text-xs font-bold text-gray-800 mt-0.5">${p.selling_price.toFixed(2)}/case</div>
                      )}
                      <div className="mt-2">
                        {qty === 0 ? (
                          <button
                            onClick={() => setQty(p.id, 1)}
                            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium py-1.5 rounded-lg transition-colors"
                          >Add</button>
                        ) : (
                          <div className="flex items-center justify-between bg-indigo-50 rounded-lg px-1 py-0.5">
                            <button
                              onClick={() => qty <= 1 ? tryRemove(p.id, p.product_name) : setQty(p.id, Math.max(0.01, qty - 1))}
                              className="w-6 h-6 flex items-center justify-center rounded hover:bg-red-100 text-indigo-600 hover:text-red-500"
                            ><Minus size={12} /></button>
                            <input
                              type="number" min="0" step="any"
                              key={qty}
                              defaultValue={qty}
                              className="w-9 text-center text-xs font-bold text-indigo-700 bg-transparent focus:outline-none focus:bg-white focus:rounded"
                              onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v) && v > 0) setQty(p.id, v) }}
                              onBlur={e => { const v = parseFloat(e.target.value); if (isNaN(v) || v <= 0) tryRemove(p.id, p.product_name) }}
                            />
                            <button onClick={() => setQty(p.id, qty + 1)} className="w-6 h-6 flex items-center justify-center rounded hover:bg-indigo-100 text-indigo-600"><Plus size={12} /></button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Desktop cart sidebar */}
      <div className="hidden lg:flex w-96 bg-white border-l flex-col shrink-0">
        {cartPanelJSX}
      </div>

      {/* Mobile cart drawer */}
      {showMobileCart && (
        <div className="lg:hidden fixed inset-0 bg-black/50 z-[80] flex items-end" onClick={e => e.target === e.currentTarget && setShowMobileCart(false)}>
          <div className="bg-white w-full rounded-t-2xl max-h-[80vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <h3 className="font-bold text-gray-900 text-sm">Order Items</h3>
              <button onClick={() => setShowMobileCart(false)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 text-lg">✕</button>
            </div>
            {cartPanelJSX}
          </div>
        </div>
      )}
    </div>
    </>
  )
}

// ── Order Detail Drawer ───────────────────────────────────────
function OrderDetailDrawer({ order, detail, pickList, onClose, onEdit, onViewPickList, onClosePickList, onDispatch, onSendToMobile, onCreateInvoice, onGoToInvoices, invoiceCreating, invoiceNumber, t }) {
  const pickingDone = order?.packing_status === 'Packed'
  const dispatched  = order?.status === 'Dispatched'
  const isPending   = order?.status === 'Pending'

  // Workflow step: 1=created, 2=picking, 3=dispatched, 4=invoiced
  const step = dispatched ? (invoiceNumber ? 4 : 3) : pickingDone ? 2 : order?.picking_queued ? 2 : 1

  const StepDot = ({ n, label, done, active }) => (
    <div className="flex flex-col items-center gap-1 min-w-0">
      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
        done   ? 'bg-green-500 text-white'
        : active ? 'bg-indigo-600 text-white ring-2 ring-indigo-200'
        : 'bg-gray-100 text-gray-400'
      }`}>
        {done ? <Check size={12}/> : n}
      </div>
      <span className={`text-[10px] font-medium whitespace-nowrap ${done ? 'text-green-700' : active ? 'text-indigo-700' : 'text-gray-400'}`}>{label}</span>
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop — clicking it closes the drawer (it's a read-only view, no data loss risk) */}
      <div className="flex-1 bg-black/40 cursor-pointer" onClick={onClose} />

      {/* Drawer panel */}
      <div className="w-full max-w-2xl bg-white shadow-2xl flex flex-col overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
          <div className="flex items-center gap-3 min-w-0">
            <span className="font-mono font-bold text-blue-700 text-base">{order?.order_number}</span>
            {order?.order_number?.startsWith('PO-') && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-100 text-indigo-700">Portal</span>
            )}
            {order && (
              dispatched ? <span className="badge-ok">Dispatched</span>
              : isPending  ? <span className="badge-warning">Pending</span>
              : order.status === 'Cancelled' ? <span className="badge-danger">Cancelled</span>
              : <span className="badge-neutral">{order.status}</span>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 flex-shrink-0">
            <X size={20} />
          </button>
        </div>

        {/* Workflow Progress Bar */}
        <div className="px-6 py-4 border-b border-gray-50 bg-gray-50/50">
          <div className="flex items-start justify-between gap-2">
            <StepDot n={1} label="Order Placed"  done={step >= 1} active={step === 1} />
            <div className={`flex-1 h-0.5 mt-3.5 mx-1 rounded ${step >= 2 ? 'bg-green-400' : step === 1 && order?.picking_queued ? 'bg-yellow-300' : 'bg-gray-200'}`} />
            <StepDot n={2} label="Picking"       done={step >= 2 && (pickingDone || dispatched)} active={!!(order?.picking_queued && !pickingDone && !dispatched)} />
            <div className={`flex-1 h-0.5 mt-3.5 mx-1 rounded ${step >= 3 ? 'bg-green-400' : 'bg-gray-200'}`} />
            <StepDot n={3} label="Dispatched"    done={step >= 3} active={!!(pickingDone && !dispatched)} />
            <div className={`flex-1 h-0.5 mt-3.5 mx-1 rounded ${step >= 4 ? 'bg-green-400' : 'bg-gray-200'}`} />
            <StepDot n={4} label="Invoiced"      done={step >= 4} active={!!(dispatched && !invoiceNumber)} />
          </div>
        </div>

        {/* Body */}
        {!detail ? (
          <div className="flex-1 flex items-center justify-center py-16 text-gray-400 text-sm">Loading…</div>
        ) : (
          <div className="p-6 space-y-5">

            {/* ── NEXT-STEP ACTION BANNERS ── */}

            {/* Picking complete → dispatch now */}
            {isPending && pickingDone && (
              <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex gap-3">
                <div className="w-9 h-9 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                  <Check size={18} className="text-green-600"/>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-green-800">Picking Complete — Ready to Dispatch</p>
                  <p className="text-xs text-green-600 mt-0.5">
                    {order.picker_name ? `Picked by ${order.picker_name}. ` : ''}
                    Confirm dispatch to fulfil the order and reduce stock.
                  </p>
                  <button
                    onClick={onDispatch}
                    className="mt-3 flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white font-semibold px-4 py-2 rounded-lg text-sm transition-colors"
                  >
                    <Truck size={15} /> Confirm Dispatch & Reduce Stock
                  </button>
                </div>
              </div>
            )}

            {/* Picking in progress */}
            {isPending && order?.picking_queued && !pickingDone && (
              <div className="bg-purple-50 border border-purple-200 rounded-xl p-3 flex items-center gap-3">
                <Smartphone size={16} className="text-purple-600 flex-shrink-0"/>
                <p className="text-sm text-purple-800">
                  <strong>Currently being picked</strong>
                  {order.picker_name ? ` by ${order.picker_name}` : ''}.
                  {' '}This order will be ready to dispatch once picking is complete.
                </p>
              </div>
            )}

            {/* Dispatched → create invoice */}
            {dispatched && !invoiceNumber && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex gap-3">
                <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                  <FileText size={18} className="text-blue-600"/>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-blue-800">Order Dispatched — Next: Create Invoice</p>
                  <p className="text-xs text-blue-600 mt-0.5">Generate an invoice to send to the customer for this order.</p>
                  <div className="mt-3 flex gap-2 flex-wrap">
                    <button
                      onClick={onCreateInvoice}
                      disabled={invoiceCreating}
                      className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold px-4 py-2 rounded-lg text-sm transition-colors disabled:opacity-50"
                    >
                      <FileText size={14}/> {invoiceCreating ? 'Creating…' : 'Create Invoice'}
                    </button>
                    <button
                      onClick={onGoToInvoices}
                      className="flex items-center gap-2 bg-white border border-blue-200 text-blue-700 hover:bg-blue-50 font-medium px-4 py-2 rounded-lg text-sm transition-colors"
                    >
                      View All Invoices <ArrowRight size={13}/>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Invoice created success */}
            {invoiceNumber && (
              <div className="bg-green-50 border border-green-200 rounded-xl p-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Check size={16} className="text-green-600"/>
                  <span className="text-sm font-semibold text-green-800">Invoice Created — <span className="font-mono">{invoiceNumber}</span></span>
                </div>
                <button onClick={onGoToInvoices} className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                  View Invoice <ArrowRight size={12}/>
                </button>
              </div>
            )}

            {/* Meta strip */}
            <div className="flex flex-wrap gap-x-6 gap-y-1.5 text-sm bg-gray-50 rounded-xl px-4 py-3">
              <span><span className="text-gray-400 text-xs">Store</span><br/><strong className="text-gray-800">{detail.store_name}</strong></span>
              {detail.store_contact && <span><span className="text-gray-400 text-xs">Contact</span><br/><span className="text-gray-700">{detail.store_contact}</span></span>}
              <span><span className="text-gray-400 text-xs">Order Date</span><br/><span className="text-gray-700">{detail.order_date}</span></span>
              {detail.dispatch_date && <span><span className="text-gray-400 text-xs">Dispatched</span><br/><span className="text-gray-700">{detail.dispatch_date}</span></span>}
              {detail.notes && <span className="w-full"><span className="text-gray-400 text-xs">Notes</span><br/><span className="text-gray-700">{detail.notes}</span></span>}
            </div>

            {/* Items table */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Order Items</p>
              <div className="rounded-xl border border-gray-100 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="text-left px-4 py-2.5 font-medium text-gray-500 text-xs">Product</th>
                      <th className="text-left px-4 py-2.5 font-medium text-gray-500 text-xs">SKU</th>
                      <th className="text-center px-4 py-2.5 font-medium text-gray-500 text-xs">Ordered</th>
                      <th className="text-center px-4 py-2.5 font-medium text-gray-500 text-xs">Fulfilled</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.items.map((item, idx) => (
                      <tr key={idx} className="border-t border-gray-100 hover:bg-gray-50">
                        <td className="px-4 py-2.5 font-medium text-sm text-gray-900">
                          {item.product_name}
                          {item.notes && <div className="text-xs text-indigo-500 italic mt-0.5">{item.notes}</div>}
                        </td>
                        <td className="px-4 py-2.5 text-gray-400 text-xs font-mono">{item.sku_code}</td>
                        <td className="px-4 py-2.5 text-center text-sm">{item.cases_requested}</td>
                        <td className="px-4 py-2.5 text-center text-sm">
                          {item.cases_fulfilled != null
                            ? <span className={item.cases_fulfilled < item.cases_requested ? 'text-yellow-600 font-semibold' : 'text-green-700 font-semibold'}>{item.cases_fulfilled}</span>
                            : <span className="text-gray-300">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Secondary action buttons */}
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                onClick={() => printSalesOrder(detail)}
                className="flex items-center gap-1.5 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded-lg font-medium transition-colors"
              >
                <Printer size={13} /> Print Sales Order
              </button>
              {isPending && (
                <>
                  <button
                    onClick={onEdit}
                    className="flex items-center gap-1.5 text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 px-3 py-1.5 rounded-lg font-medium transition-colors"
                  >
                    <Edit2 size={13} /> Edit Items
                  </button>
                  {!pickingDone && (
                    <>
                      <button
                        onClick={onViewPickList}
                        className="flex items-center gap-1.5 text-xs bg-indigo-50 hover:bg-indigo-100 text-indigo-700 px-3 py-1.5 rounded-lg font-medium transition-colors"
                      >
                        <ClipboardList size={13} /> {pickList ? 'Refresh' : 'View'} Pick List
                      </button>
                      {!order.picking_queued && (
                        <button
                          onClick={onSendToMobile}
                          className="flex items-center gap-1.5 text-xs bg-purple-50 hover:bg-purple-100 text-purple-700 px-3 py-1.5 rounded-lg font-medium transition-colors"
                        >
                          <Smartphone size={13} /> Send to Mobile Picking
                        </button>
                      )}
                    </>
                  )}
                  {/* Dispatch directly without pick list if needed */}
                  {!pickingDone && !order.picking_queued && (
                    <button
                      onClick={onDispatch}
                      className="flex items-center gap-1.5 text-xs bg-orange-50 hover:bg-orange-100 text-orange-700 px-3 py-1.5 rounded-lg font-medium transition-colors"
                    >
                      <Truck size={13} /> Dispatch Now
                    </button>
                  )}
                </>
              )}
            </div>

            {/* Pick List (collapsible detail) */}
            {pickList && (
              <div className="border border-blue-200 rounded-xl overflow-hidden bg-white">
                <div className="flex items-center justify-between px-4 py-3 bg-blue-50 border-b border-blue-100">
                  <h4 className="font-bold text-gray-900 text-sm">📋 Pick List — {pickList.order_number}</h4>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => printPickList(pickList)}
                      className="flex items-center gap-1 text-xs bg-white border border-blue-300 text-blue-700 hover:bg-blue-50 px-2.5 py-1 rounded-lg font-medium transition-colors"
                    >
                      <Printer size={12} /> Print
                    </button>
                    <button onClick={onClosePickList} className="text-xs text-gray-400 hover:text-gray-600">Close</button>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[600px]">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="table-th text-center">#</th>
                        <th className="table-th">{t('product')}</th>
                        <th className="table-th text-center">Location</th>
                        <th className="table-th text-center">{t('requested')}</th>
                        <th className="table-th text-center">{t('available')}</th>
                        <th className="table-th">{t('pickFrom')}</th>
                        <th className="table-th">{t('status')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pickList.pick_list.map((item, i) => (
                        <tr key={i} className="border-b hover:bg-gray-50">
                          <td className="table-td text-center text-xs font-mono text-gray-400">{item.pick_order}</td>
                          <td className="table-td">
                            <div className="font-medium text-sm">{item.product_name}</div>
                            <div className="text-xs text-gray-400">{item.sku_code}</div>
                          </td>
                          <td className="table-td text-center">
                            {item.bin_location
                              ? <span className="font-mono font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded text-xs">{item.bin_location}</span>
                              : <span className="text-gray-300 text-xs">—</span>
                            }
                          </td>
                          <td className="table-td text-center font-medium">{item.cases_requested}</td>
                          <td className="table-td text-center font-medium">{item.cases_available}</td>
                          <td className="table-td">
                            {item.picks.map((p, pi) => (
                              <div key={pi} className="text-xs text-gray-600">
                                <span className={`font-medium ${p.warehouse === 'WH1' ? 'text-blue-700' : 'text-gray-700'}`}>{p.warehouse}</span>
                                {' '}· {p.cases_to_pick} cases · {p.batch_code}
                                {p.expiry_date && <span className="text-orange-500 ml-1">(exp: {p.expiry_date})</span>}
                              </div>
                            ))}
                          </td>
                          <td className="table-td">{pickStatusBadge(item.status)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex gap-2 px-4 py-3 border-t bg-gray-50">
                  <button
                    className="btn-success flex items-center gap-2 text-sm"
                    onClick={onDispatch}
                  >
                    <Truck size={15} /> {t('confirmDispatch')}
                  </button>
                  <button className="btn-secondary text-sm" onClick={onClosePickList}>
                    {t('cancel')}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main Orders Page ─────────────────────────────────────────
export default function Orders({ lang }) {
  const t = useT(lang)
  const navigate = useNavigate()

  const [orders,    setOrders]    = useState([])
  const [skus,      setSkus]      = useState([])
  const [customers, setCustomers] = useState([])
  const [loading,   setLoading]   = useState(true)
  const [statusFilter, setStatusFilter] = useState('')

  // Catalog modal: null | { mode:'create' } | { mode:'edit', orderId, orderNumber, initialCart }
  const [catalogMode, setCatalogMode] = useState(null)

  // Row expansion / detail drawer
  const [expandedId,  setExpandedId]  = useState(null)
  const [detailData,  setDetailData]  = useState({})   // id → detail
  const [pickLists,   setPickLists]   = useState({})   // id → pick list

  // Invoice creation
  const [invoiceCreating, setInvoiceCreating] = useState(false)
  const [invoiceSuccess,  setInvoiceSuccess]  = useState({})  // id → invoice_number

  // Send to mobile picking modal
  const [sendPickingModal, setSendPickingModal] = useState(null)
  const [pickerInput,      setPickerInput]      = useState('')
  const [pickingSending,   setPickingSending]   = useState(false)

  // Dispatch confirm modal
  const [dispatchConfirmId, setDispatchConfirmId] = useState(null)
  const [dispatching,       setDispatching]       = useState(false)
  const [palletInput,       setPalletInput]       = useState('')

  const loadOrders = () => {
    const params = statusFilter ? { status: statusFilter } : {}
    orderAPI.list(params).then(r => { setOrders(r.data); setLoading(false) })
  }

  useEffect(() => {
    skuAPI.list().then(r => setSkus(r.data))
    customerAPI.list({ active_only: true }).then(r => setCustomers(r.data))
    loadOrders()
  }, [statusFilter])

  const toggleExpand = async (orderId) => {
    setExpandedId(orderId)
    if (!detailData[orderId]) {
      const r = await orderAPI.get(orderId)
      setDetailData(prev => ({ ...prev, [orderId]: r.data }))
    }
  }

  const loadPickList = async (orderId) => {
    const r = await orderAPI.pickList(orderId)
    setPickLists(prev => ({ ...prev, [orderId]: r.data }))
  }

  const closePickList = (orderId) =>
    setPickLists(prev => { const d = { ...prev }; delete d[orderId]; return d })

  const handleDispatch = (orderId) => {
    setPalletInput('')
    setDispatchConfirmId(orderId)
  }

  const confirmDispatch = async () => {
    const orderId = dispatchConfirmId
    setDispatching(true)
    try {
      const pallets = palletInput !== '' ? parseInt(palletInput) || null : null
      await orderAPI.dispatch(orderId, pallets)
      closePickList(orderId)
      setDetailData(prev => { const d = { ...prev }; delete d[orderId]; return d })
      loadOrders()
      const r = await orderAPI.get(orderId)
      setDetailData(prev => ({ ...prev, [orderId]: r.data }))
    } catch (e) {
      alert('Error: ' + (e.response?.data?.detail || e.message))
    }
    setDispatching(false)
    setDispatchConfirmId(null)
  }

  const handleCreateInvoice = async (orderId) => {
    setInvoiceCreating(true)
    try {
      const r = await invoiceAPI.fromOrder(orderId)
      setInvoiceSuccess(prev => ({ ...prev, [orderId]: r.data.invoice_number }))
      loadOrders()
    } catch (e) {
      const msg = e.response?.data?.detail || e.message
      if (msg?.toLowerCase().includes('already')) {
        // Invoice already exists — refresh detail to show it
        const r2 = await orderAPI.get(orderId)
        setDetailData(prev => ({ ...prev, [orderId]: r2.data }))
      } else {
        alert('Error creating invoice: ' + msg)
      }
    }
    setInvoiceCreating(false)
  }

  const openEditOrder = (orderId) => {
    const detail = detailData[orderId]
    const order  = orders.find(o => o.id === orderId)
    if (!detail) return
    const initialCart = {}
    const initialItemMeta = {}
    detail.items.forEach(i => {
      initialCart[i.sku_id] = i.cases_requested
      if (i.unit_price != null || i.notes) {
        initialItemMeta[i.sku_id] = {
          unit_price: i.unit_price ?? '',
          notes: i.notes ?? '',
        }
      }
    })
    setCatalogMode({
      mode: 'edit', orderId, orderNumber: order?.order_number, initialCart, initialItemMeta,
      initialStoreName: detail.store_name || '',
      initialOrderDate: detail.order_date || null,
      initialNotes: detail.notes || '',
    })
  }

  const handleCreateOrder = async ({ customerId, storeName, orderDate, notes, items }) => {
    await orderAPI.create({ customer_id: customerId, store_name: storeName, order_date: orderDate, notes, items })
    setCatalogMode(null)
    loadOrders()
  }

  const handleUpdateOrder = async ({ storeName, orderDate, notes, items }) => {
    const orderId = catalogMode.orderId
    await orderAPI.update(orderId, { store_name: storeName, order_date: orderDate, notes, items })
    const r = await orderAPI.get(orderId)
    setDetailData(prev => ({ ...prev, [orderId]: r.data }))
    setCatalogMode(null)
    loadOrders()
  }

  const doSendToPicking = async () => {
    if (!sendPickingModal) return
    setPickingSending(true)
    try {
      await orderAPI.sendToPicking(sendPickingModal.orderId, pickerInput.trim() || null)
      setOrders(prev => prev.map(o =>
        o.id === sendPickingModal.orderId
          ? { ...o, picking_queued: true, picker_name: pickerInput.trim() || o.picker_name }
          : o
      ))
      setSendPickingModal(null)
      setPickerInput('')
    } catch (e) {
      alert('Error: ' + (e.response?.data?.detail || e.message))
    } finally {
      setPickingSending(false)
    }
  }

  return (
    <div className="space-y-6">

      {/* Catalog Modal */}
      {catalogMode && (
        <CatalogModal
          skus={skus}
          customers={customers}
          mode={catalogMode.mode}
          orderNumber={catalogMode.orderNumber}
          initialCart={catalogMode.initialCart || {}}
          initialItemMeta={catalogMode.initialItemMeta || {}}
          initialStoreName={catalogMode.initialStoreName || ''}
          initialOrderDate={catalogMode.initialOrderDate || null}
          initialNotes={catalogMode.initialNotes || ''}
          onClose={() => setCatalogMode(null)}
          onSubmit={catalogMode.mode === 'create' ? handleCreateOrder : handleUpdateOrder}
        />
      )}

      {/* Send to Mobile Picking modal */}
      {sendPickingModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <div className="flex items-center gap-3 mb-4">
              <Smartphone size={20} className="text-purple-600" />
              <h3 className="font-bold text-gray-900">Send to Mobile Picking</h3>
            </div>
            <p className="text-sm text-gray-500 mb-4">
              Order <strong>{sendPickingModal.orderNumber}</strong> will appear in the Mobile Picking queue.
            </p>
            <label className="label text-xs mb-1">Assign Picker (optional)</label>
            <div className="flex items-center gap-2 bg-gray-50 rounded-lg border border-gray-200 px-3 py-2.5 mb-4">
              <User size={15} className="text-gray-400 shrink-0" />
              <input
                className="flex-1 text-sm outline-none bg-transparent placeholder-gray-400"
                placeholder="Picker name…"
                value={pickerInput}
                onChange={e => setPickerInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && doSendToPicking()}
                autoFocus
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => { setSendPickingModal(null); setPickerInput('') }}
                className="flex-1 btn-secondary"
                disabled={pickingSending}
              >Cancel</button>
              <button
                onClick={doSendToPicking}
                disabled={pickingSending}
                className="flex-1 bg-purple-600 hover:bg-purple-700 text-white font-semibold py-2 rounded-lg transition-colors disabled:opacity-50"
              >{pickingSending ? 'Sending…' : 'Send to Picking'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Dispatch Confirm Modal */}
      {dispatchConfirmId && (
        <div className="fixed inset-0 bg-black/50 z-[65] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0">
                <Truck size={20} className="text-orange-600" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900">Confirm Dispatch</h3>
                <p className="text-xs text-gray-500">This will deduct stock from inventory</p>
              </div>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Stock will be deducted and the order will move to <strong>Dispatched</strong>.
            </p>

            {/* Pallet count input */}
            <div className="mb-5">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Number of Pallets <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <input
                type="number"
                min="0"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                placeholder="e.g. 3"
                value={palletInput}
                onChange={e => setPalletInput(e.target.value)}
              />
              <p className="text-xs text-gray-400 mt-1">Printed on the invoice under Pallets</p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setDispatchConfirmId(null)}
                disabled={dispatching}
                className="flex-1 btn-secondary"
              >Cancel</button>
              <button
                onClick={confirmDispatch}
                disabled={dispatching}
                className="flex-1 bg-orange-600 hover:bg-orange-700 text-white font-semibold py-2 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {dispatching
                  ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Dispatching…</>
                  : <><Truck size={15} /> Yes, Dispatch</>
                }
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Order Detail Drawer */}
      {expandedId && (() => {
        const order    = orders.find(o => o.id === expandedId)
        const detail   = detailData[expandedId]
        const pickList = pickLists[expandedId]
        return (
          <OrderDetailDrawer
            order={order}
            detail={detail}
            pickList={pickList}
            onClose={() => setExpandedId(null)}
            onEdit={() => { setExpandedId(null); openEditOrder(expandedId) }}
            onViewPickList={() => loadPickList(expandedId)}
            onClosePickList={() => closePickList(expandedId)}
            onDispatch={() => handleDispatch(expandedId)}
            onSendToMobile={() => {
              setSendPickingModal({ orderId: order.id, orderNumber: order.order_number })
              setPickerInput(order.picker_name || '')
            }}
            onCreateInvoice={() => handleCreateInvoice(expandedId)}
            onGoToInvoices={() => { setExpandedId(null); navigate('/invoices') }}
            invoiceCreating={invoiceCreating}
            invoiceNumber={invoiceSuccess[expandedId] || detailData[expandedId]?.invoice_number}
            t={t}
          />
        )
      })()}

      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">{t('orders')}</h2>
        <button className="btn-primary flex items-center gap-2" onClick={() => setCatalogMode({ mode: 'create' })}>
          <Plus size={16} /> {t('newOrder')}
        </button>
      </div>

      {/* Orders Table */}
      <div className="card p-0 overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex gap-3 items-center">
          <h3 className="font-semibold text-gray-900 flex-1">All Orders</h3>
          <select className="input w-40" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="">All Status</option>
            <option>Pending</option>
            <option>Dispatched</option>
            <option>Cancelled</option>
          </select>
        </div>

        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="table-th">Order #</th>
              <th className="table-th">Store</th>
              <th className="table-th hidden sm:table-cell">Date</th>
              <th className="table-th hidden sm:table-cell">Items</th>
              <th className="table-th">{t('status')}</th>
              <th className="table-th w-8"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="table-td text-center text-gray-400 py-8">{t('loading')}</td></tr>
            ) : orders.length === 0 ? (
              <tr><td colSpan={6} className="table-td text-center text-gray-400 py-8">{t('noData')}</td></tr>
            ) : orders.map(order => (
                  <tr
                    key={order.id}
                    className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer"
                    onClick={() => toggleExpand(order.id)}
                  >
                    <td className="table-td">
                      <span className="font-mono text-xs text-blue-700 font-medium">{order.order_number}</span>
                      {order.order_number?.startsWith('PO-') && (
                        <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-100 text-indigo-700">Portal</span>
                      )}
                    </td>
                    <td className="table-td font-medium">
                      {order.customer_name || order.store_name}
                      {order.customer_name && order.customer_name !== order.store_name && (
                        <span className="block text-xs text-gray-400">{order.store_name}</span>
                      )}
                    </td>
                    <td className="table-td text-gray-500 text-sm hidden sm:table-cell">{order.order_date}</td>
                    <td className="table-td text-center hidden sm:table-cell">{order.item_count}</td>
                    <td className="table-td">
                      {statusBadge(order.status)}
                      {order.status === 'Pending' && order.packing_status === 'Packed' && (
                        <div className="mt-1"><span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">✅ Ready to dispatch</span></div>
                      )}
                      {order.status === 'Pending' && order.picking_queued && order.packing_status !== 'Packed' && (
                        <div className="mt-1"><span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full">📱 Picking{order.picker_name ? ` · ${order.picker_name}` : ''}</span></div>
                      )}
                    </td>
                    <td className="table-td text-gray-300"><ChevronRight size={16} /></td>
                  </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
