import { useEffect, useState } from 'react'
import { purchaseOrderAPI, vendorAPI, skuAPI, emailAPI } from '../api/client'
import {
  ShoppingBag, Plus, Search, ChevronRight, X, Check, Truck,
  Send, Package, AlertTriangle, RefreshCw, Trash2, Edit2,
  ClipboardList, DollarSign, Calendar, Mail
} from 'lucide-react'

// ── Status badge ──────────────────────────────────────────────
const STATUS = {
  draft:     { label: 'Draft',     cls: 'bg-gray-100 text-gray-600' },
  sent:      { label: 'Sent',      cls: 'bg-blue-100 text-blue-700' },
  partial:   { label: 'Partial',   cls: 'bg-yellow-100 text-yellow-700' },
  received:  { label: 'Received',  cls: 'bg-green-100 text-green-700' },
  cancelled: { label: 'Cancelled', cls: 'bg-red-100 text-red-500' },
}

function StatusBadge({ status }) {
  const s = STATUS[status] || STATUS.draft
  return <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${s.cls}`}>{s.label}</span>
}

// ── Create PO Modal ───────────────────────────────────────────
function CreatePOModal({ vendors, skus, onSave, onClose }) {
  const [vendorId,  setVendorId]  = useState('')
  const [warehouse, setWarehouse] = useState('WH1')
  const [expectedDate, setExpectedDate] = useState('')
  const [notes,     setNotes]     = useState('')
  const [items,     setItems]     = useState([])
  const [skuSearch, setSkuSearch] = useState('')
  const [saving,    setSaving]    = useState(false)

  const filteredSkus = skus.filter(s =>
    skuSearch &&
    (s.product_name.toLowerCase().includes(skuSearch.toLowerCase()) ||
     s.sku_code.toLowerCase().includes(skuSearch.toLowerCase()))
  ).slice(0, 8)

  const addSku = (sku) => {
    if (items.find(i => i.sku_id === sku.id)) return
    setItems(prev => [...prev, {
      sku_id: sku.id, sku_code: sku.sku_code, product_name: sku.product_name,
      cases_ordered: 1, unit_cost: sku.cost_price || '',
    }])
    setSkuSearch('')
  }

  const updateItem = (idx, key, val) =>
    setItems(prev => prev.map((r, i) => i === idx ? { ...r, [key]: val } : r))

  const removeItem = (idx) => setItems(prev => prev.filter((_, i) => i !== idx))

  const totalCost = items.reduce((s, i) => s + ((parseFloat(i.unit_cost) || 0) * (parseInt(i.cases_ordered) || 0)), 0)

  const handleSave = async () => {
    if (!items.length) return alert('Add at least one SKU')
    setSaving(true)
    try {
      await onSave({
        vendor_id:     vendorId ? parseInt(vendorId) : null,
        warehouse,
        expected_date: expectedDate || null,
        notes,
        items: items.map(i => ({
          sku_id:        i.sku_id,
          cases_ordered: parseInt(i.cases_ordered) || 1,
          unit_cost:     i.unit_cost !== '' ? parseFloat(i.unit_cost) : null,
        })),
      })
    } catch (e) {
      alert(e.response?.data?.detail || e.message)
    }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div>
            <h3 className="font-bold text-gray-900 text-lg">New Purchase Order</h3>
            <p className="text-xs text-gray-400 mt-0.5">Order stock from a vendor</p>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 rounded-xl hover:bg-gray-100">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* PO header fields */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Vendor</label>
              <select className="input" value={vendorId} onChange={e => setVendorId(e.target.value)}>
                <option value="">— No vendor —</option>
                {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Destination Warehouse</label>
              <select className="input" value={warehouse} onChange={e => setWarehouse(e.target.value)}>
                <option value="WH1">WH1 — Main</option>
                <option value="WH2">WH2 — Backup</option>
              </select>
            </div>
            <div>
              <label className="label">Expected Delivery Date</label>
              <input type="date" className="input" value={expectedDate} onChange={e => setExpectedDate(e.target.value)} />
            </div>
            <div>
              <label className="label">Notes</label>
              <input className="input" placeholder="Optional notes…" value={notes} onChange={e => setNotes(e.target.value)} />
            </div>
          </div>

          {/* SKU search */}
          <div>
            <label className="label">Add Products</label>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                className="input pl-9"
                placeholder="Search SKU or product name…"
                value={skuSearch}
                onChange={e => setSkuSearch(e.target.value)}
              />
              {filteredSkus.length > 0 && (
                <div className="absolute top-full left-0 right-0 z-20 bg-white border border-gray-200 rounded-xl shadow-xl mt-1 max-h-52 overflow-y-auto">
                  {filteredSkus.map(s => (
                    <button key={s.id} onClick={() => addSku(s)}
                      className="w-full text-left px-4 py-2.5 hover:bg-blue-50 text-sm border-b border-gray-50 last:border-0 flex items-center justify-between">
                      <div>
                        <span className="font-mono text-blue-700 text-xs mr-2">{s.sku_code}</span>
                        <span className="text-gray-800">{s.product_name}</span>
                      </div>
                      {s.cost_price && <span className="text-xs text-gray-400">${s.cost_price}/case</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Items table */}
          {items.length > 0 && (
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="table-th text-left">Product</th>
                    <th className="table-th w-28">Cases</th>
                    <th className="table-th w-32">Cost/Case ($)</th>
                    <th className="table-th w-24 text-right">Subtotal</th>
                    <th className="table-th w-8"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {items.map((item, idx) => (
                    <tr key={idx} className="hover:bg-gray-50">
                      <td className="table-td">
                        <div className="font-mono text-xs text-blue-700">{item.sku_code}</div>
                        <div className="text-xs text-gray-600 truncate max-w-[200px]">{item.product_name}</div>
                      </td>
                      <td className="table-td">
                        <input type="number" min="1" className="input text-sm py-1 px-2 w-20 text-center"
                          value={item.cases_ordered}
                          onChange={e => updateItem(idx, 'cases_ordered', e.target.value)} />
                      </td>
                      <td className="table-td">
                        <input type="number" min="0" step="0.01" className="input text-sm py-1 px-2 w-24"
                          placeholder="0.00"
                          value={item.unit_cost}
                          onChange={e => updateItem(idx, 'unit_cost', e.target.value)} />
                      </td>
                      <td className="table-td text-right font-medium text-gray-700">
                        ${((parseFloat(item.unit_cost) || 0) * (parseInt(item.cases_ordered) || 0)).toFixed(2)}
                      </td>
                      <td className="table-td">
                        <button onClick={() => removeItem(idx)} className="p-1 text-gray-300 hover:text-red-500">
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50 border-t">
                  <tr>
                    <td colSpan="3" className="px-4 py-2 text-sm font-semibold text-gray-700 text-right">Total</td>
                    <td className="px-4 py-2 text-sm font-bold text-gray-900 text-right">${totalCost.toFixed(2)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t flex gap-3 bg-gray-50 rounded-b-2xl">
          <button className="btn-primary flex-1 flex items-center justify-center gap-2" onClick={handleSave} disabled={saving}>
            <Plus size={15} /> {saving ? 'Creating…' : 'Create Purchase Order'}
          </button>
          <button className="btn-secondary px-5" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

// ── Receive Modal ─────────────────────────────────────────────
function ReceiveModal({ po, onSave, onClose }) {
  const [receivedDate, setReceivedDate] = useState(new Date().toISOString().split('T')[0])
  const [rows, setRows] = useState(
    po.items
      .filter(i => i.cases_pending > 0)
      .map(i => ({ ...i, recv_cases: i.cases_pending, has_expiry: false, expiry_date: '' }))
  )
  const [saving, setSaving] = useState(false)

  const update = (idx, key, val) =>
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, [key]: val } : r))

  const handleSave = async () => {
    const items = rows
      .filter(r => parseInt(r.recv_cases) > 0)
      .map(r => ({
        po_item_id:     r.id,
        cases_received: parseInt(r.recv_cases) || 0,
        has_expiry:     r.has_expiry,
        expiry_date:    r.has_expiry && r.expiry_date ? r.expiry_date : null,
      }))
    if (!items.length) return alert('Enter at least one received quantity')
    setSaving(true)
    try {
      await onSave(items, receivedDate)
    } catch (e) {
      alert(e.response?.data?.detail || e.message)
    }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[92vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div>
            <h3 className="font-bold text-gray-900 text-lg">Receive — {po.po_number}</h3>
            <p className="text-xs text-gray-400 mt-0.5">Enter quantities physically received</p>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 rounded-xl hover:bg-gray-100"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          <div>
            <label className="label">Received Date</label>
            <input type="date" className="input w-44" value={receivedDate} onChange={e => setReceivedDate(e.target.value)} />
          </div>

          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="table-th text-left">Product</th>
                  <th className="table-th w-20 text-center">Ordered</th>
                  <th className="table-th w-20 text-center">Pending</th>
                  <th className="table-th w-24 text-center">Receiving</th>
                  <th className="table-th w-24">Expiry</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rows.map((row, idx) => (
                  <tr key={row.id} className="hover:bg-gray-50">
                    <td className="table-td">
                      <div className="font-mono text-xs text-blue-700">{row.sku_code}</div>
                      <div className="text-xs text-gray-600 truncate max-w-[160px]">{row.product_name}</div>
                    </td>
                    <td className="table-td text-center text-gray-500">{row.cases_ordered}</td>
                    <td className="table-td text-center font-bold text-orange-600">{row.cases_pending}</td>
                    <td className="table-td text-center">
                      <input type="number" min="0" max={row.cases_pending}
                        className="input text-sm py-1 px-2 w-20 text-center font-bold"
                        value={row.recv_cases}
                        onChange={e => update(idx, 'recv_cases', e.target.value)} />
                    </td>
                    <td className="table-td">
                      <label className="flex items-center gap-1.5 text-xs text-gray-600 mb-1 cursor-pointer">
                        <input type="checkbox" checked={row.has_expiry}
                          onChange={e => update(idx, 'has_expiry', e.target.checked)} />
                        Has expiry
                      </label>
                      {row.has_expiry && (
                        <input type="date" className="input text-xs py-0.5 px-2 w-32"
                          value={row.expiry_date}
                          onChange={e => update(idx, 'expiry_date', e.target.value)} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="px-6 py-4 border-t flex gap-3 bg-gray-50 rounded-b-2xl">
          <button className="btn-primary flex-1 flex items-center justify-center gap-2" onClick={handleSave} disabled={saving}>
            <Truck size={15} /> {saving ? 'Recording…' : 'Record Receipt'}
          </button>
          <button className="btn-secondary px-5" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

// ── Send PO Email Modal ────────────────────────────────────────
function SendPOEmailModal({ po, onClose, onSent }) {
  const [to,      setTo]      = useState(po.vendor_email || '')
  const [subject, setSubject] = useState(`Purchase Order ${po.po_number}`)
  const [body,    setBody]    = useState('')
  const [sending, setSending] = useState(false)
  const [err,     setErr]     = useState('')

  // Pre-fill vendor email from vendor data
  useEffect(() => {
    if (po.vendor_id && !to) {
      vendorAPI.list().then(r => {
        const v = r.data.find(v => v.id === po.vendor_id)
        if (v?.email) setTo(v.email)
      }).catch(() => {})
    }
  }, [])

  const send = async () => {
    if (!to.trim()) { setErr('Email address is required'); return }
    setSending(true); setErr('')
    try {
      const r = await emailAPI.sendPO(po.id, { to: to.trim(), subject, body })
      onSent(r.data)
      onClose()
    } catch (e) {
      setErr(e.response?.data?.detail || 'Send failed')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b">
          <div className="flex items-center gap-2 font-bold text-gray-900">
            <Mail size={18} className="text-blue-600" />
            Email PO {po.po_number}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4">
          {err && <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">{err}</div>}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">To (vendor email)</label>
            <input className="input w-full" type="email" placeholder="vendor@example.com" value={to} onChange={e => setTo(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Subject</label>
            <input className="input w-full" value={subject} onChange={e => setSubject(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Message <span className="text-gray-400 font-normal">(optional)</span></label>
            <textarea className="input w-full" rows={3} placeholder="Please process this order at your earliest convenience…" value={body} onChange={e => setBody(e.target.value)} />
          </div>
          <p className="text-xs text-gray-400">The full PO details will be sent as a formatted HTML email. Status will change from Draft → Sent after sending.</p>
        </div>
        <div className="px-5 pb-5 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200">Cancel</button>
          <button onClick={send} disabled={sending}
            className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
            <Mail size={14} />{sending ? 'Sending…' : 'Send PO'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── PO Detail Panel ───────────────────────────────────────────
function PODetail({ po, onSend, onReceive, onCancel, onEmail, onClose }) {
  const canSend    = po.status === 'draft'
  const canReceive = ['sent', 'partial'].includes(po.status)
  const canCancel  = !['received', 'cancelled'].includes(po.status)

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 z-40 flex items-end sm:items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b">
          <div>
            <div className="flex items-center gap-3">
              <h3 className="font-bold text-gray-900 text-lg">{po.po_number}</h3>
              <StatusBadge status={po.status} />
            </div>
            <p className="text-xs text-gray-400 mt-1">
              {po.vendor_name || 'No vendor'} · {po.warehouse}
              {po.expected_date && ` · Expected ${po.expected_date}`}
            </p>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 rounded-xl hover:bg-gray-100"><X size={18} /></button>
        </div>

        {/* Items */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="table-th text-left">Product</th>
                <th className="table-th text-center">Ordered</th>
                <th className="table-th text-center">Received</th>
                <th className="table-th text-center">Pending</th>
                <th className="table-th text-right">Cost/Case</th>
                <th className="table-th text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {po.items.map(item => (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="table-td">
                    <div className="font-mono text-xs text-blue-700">{item.sku_code}</div>
                    <div className="text-xs text-gray-600 truncate max-w-[180px]">{item.product_name}</div>
                  </td>
                  <td className="table-td text-center">{item.cases_ordered}</td>
                  <td className="table-td text-center text-green-600 font-medium">{item.cases_received}</td>
                  <td className="table-td text-center">
                    {item.cases_pending > 0
                      ? <span className="font-bold text-orange-500">{item.cases_pending}</span>
                      : <Check size={14} className="text-green-500 mx-auto" />}
                  </td>
                  <td className="table-td text-right text-gray-500 text-xs">
                    {item.unit_cost != null ? `$${item.unit_cost.toFixed(2)}` : '—'}
                  </td>
                  <td className="table-td text-right font-medium">${item.line_total.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t bg-gray-50">
              <tr>
                <td colSpan="5" className="px-4 py-2 text-sm font-semibold text-right text-gray-700">Total</td>
                <td className="px-4 py-2 text-sm font-bold text-right text-gray-900">${po.total_cost.toFixed(2)}</td>
              </tr>
            </tfoot>
          </table>
          {po.notes && (
            <div className="mt-4 bg-gray-50 rounded-xl px-4 py-3 text-sm text-gray-600">
              <span className="font-medium text-gray-700">Notes: </span>{po.notes}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="px-6 py-4 border-t flex gap-2 flex-wrap bg-gray-50 rounded-b-2xl">
          {canSend && (
            <button className="btn-primary flex items-center gap-2" onClick={onSend}>
              <Send size={14} /> Mark as Sent
            </button>
          )}
          {canReceive && (
            <button className="btn-primary flex items-center gap-2 bg-green-600 hover:bg-green-700" onClick={onReceive}>
              <Truck size={14} /> Receive Stock
            </button>
          )}
          {po.status !== 'cancelled' && (
            <button className="btn-secondary flex items-center gap-2" onClick={onEmail}>
              <Mail size={14} /> Email to Vendor
            </button>
          )}
          {canCancel && (
            <button className="btn-secondary flex items-center gap-2 text-red-600 border-red-200 hover:bg-red-50 ml-auto" onClick={onCancel}>
              <Trash2 size={14} /> {po.status === 'draft' ? 'Delete' : 'Cancel'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────
export default function PurchaseOrders() {
  const [pos,       setPos]       = useState([])
  const [stats,     setStats]     = useState(null)
  const [vendors,   setVendors]   = useState([])
  const [skus,      setSkus]      = useState([])
  const [loading,   setLoading]   = useState(true)
  const [search,    setSearch]    = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [detailPO,  setDetailPO]  = useState(null)
  const [receivePO, setReceivePO] = useState(null)
  const [emailPO,   setEmailPO]   = useState(null)
  const [toast,     setToast]     = useState('')

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3000) }

  const load = async () => {
    if (!pos.length) setLoading(true)
    try {
      const [posRes, statsRes] = await Promise.all([
        purchaseOrderAPI.list(filterStatus ? { status: filterStatus } : {}),
        purchaseOrderAPI.stats(),
      ])
      setPos(posRes.data)
      setStats(statsRes.data)
    } catch {}
    setLoading(false)
  }

  useEffect(() => {
    vendorAPI.list().then(r => setVendors(r.data))
    skuAPI.list().then(r => setSkus(r.data))
  }, [])

  useEffect(() => { load() }, [filterStatus])

  const handleCreate = async (data) => {
    await purchaseOrderAPI.create(data)
    setShowCreate(false)
    showToast('✅ Purchase order created')
    load()
  }

  const handleSend = async (po) => {
    await purchaseOrderAPI.send(po.id)
    setDetailPO(null)
    showToast(`✅ ${po.po_number} marked as sent`)
    load()
  }

  const handleReceive = async (po, items, receivedDate) => {
    await purchaseOrderAPI.receive(po.id, items, receivedDate)
    setReceivePO(null)
    setDetailPO(null)
    showToast(`✅ Stock received for ${po.po_number}`)
    load()
  }

  const handleCancel = async (po) => {
    if (!confirm(`${po.status === 'draft' ? 'Delete' : 'Cancel'} ${po.po_number}?`)) return
    await purchaseOrderAPI.cancel(po.id)
    setDetailPO(null)
    showToast(`${po.po_number} ${po.status === 'draft' ? 'deleted' : 'cancelled'}`)
    load()
  }

  const filtered = pos.filter(po =>
    !search ||
    po.po_number.toLowerCase().includes(search.toLowerCase()) ||
    (po.vendor_name || '').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-6">
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 bg-gray-900 text-white text-sm px-4 py-3 rounded-xl shadow-lg">{toast}</div>
      )}

      {showCreate && (
        <CreatePOModal vendors={vendors} skus={skus} onSave={handleCreate} onClose={() => setShowCreate(false)} />
      )}

      {detailPO && !receivePO && !emailPO && (
        <PODetail
          po={detailPO}
          onSend={() => handleSend(detailPO)}
          onReceive={() => setReceivePO(detailPO)}
          onCancel={() => handleCancel(detailPO)}
          onEmail={() => setEmailPO(detailPO)}
          onClose={() => setDetailPO(null)}
        />
      )}

      {emailPO && (
        <SendPOEmailModal
          po={emailPO}
          onClose={() => setEmailPO(null)}
          onSent={(data) => {
            showToast(`✅ PO emailed to vendor — status: ${data.new_status}`)
            setEmailPO(null)
            setDetailPO(null)
            load()
          }}
        />
      )}

      {receivePO && (
        <ReceiveModal
          po={receivePO}
          onSave={(items, date) => handleReceive(receivePO, items, date)}
          onClose={() => setReceivePO(null)}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Purchase Orders</h2>
          <p className="text-sm text-gray-400 mt-1">Order stock from vendors and track deliveries</p>
        </div>
        <button className="btn-primary flex items-center gap-2" onClick={() => setShowCreate(true)}>
          <Plus size={16} /> New PO
        </button>
      </div>

      {/* Stats row */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { label: 'Total', value: stats.total,     icon: ClipboardList, cls: 'text-gray-600' },
            { label: 'Draft', value: stats.draft,     icon: Edit2,         cls: 'text-gray-500' },
            { label: 'Sent',  value: stats.sent,      icon: Send,          cls: 'text-blue-600' },
            { label: 'Partial', value: stats.partial, icon: Truck,         cls: 'text-yellow-600' },
            { label: 'Received', value: stats.received, icon: Check,       cls: 'text-green-600' },
          ].map(({ label, value, icon: Icon, cls }) => (
            <button key={label}
              onClick={() => setFilterStatus(label.toLowerCase() === 'total' ? '' : label.toLowerCase())}
              className={`card py-3 flex items-center gap-3 hover:shadow-md transition-shadow text-left ${
                filterStatus === (label.toLowerCase() === 'total' ? '' : label.toLowerCase()) ? 'ring-2 ring-blue-400' : ''
              }`}
            >
              <Icon size={18} className={cls} />
              <div>
                <div className="text-xl font-bold text-gray-900">{value}</div>
                <div className="text-xs text-gray-500">{label}</div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="card py-3">
        <div className="flex gap-3 items-center">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input className="input pl-9 py-2 text-sm" placeholder="Search PO number or vendor…"
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select className="input w-auto text-sm" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="">All statuses</option>
            {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <button onClick={load} className="btn-secondary py-2 px-3">
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        {loading ? (
          <div className="py-12 text-center text-gray-400 text-sm">Loading purchase orders…</div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <ShoppingBag size={40} className="mx-auto text-gray-300 mb-3" />
            <p className="text-gray-500 font-medium">No purchase orders yet</p>
            <p className="text-sm text-gray-400 mt-1">Create your first PO to start ordering from vendors</p>
            <button className="btn-primary mt-4" onClick={() => setShowCreate(true)}>Create PO</button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="table-th text-left">PO Number</th>
                  <th className="table-th text-left">Vendor</th>
                  <th className="table-th">Status</th>
                  <th className="table-th">Warehouse</th>
                  <th className="table-th">Expected</th>
                  <th className="table-th text-right">Cases</th>
                  <th className="table-th text-right">Total Cost</th>
                  <th className="table-th w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(po => {
                  const progress = po.total_ordered > 0
                    ? Math.round((po.total_received / po.total_ordered) * 100) : 0
                  return (
                    <tr key={po.id}
                      className="hover:bg-blue-50 cursor-pointer transition-colors"
                      onClick={() => setDetailPO(po)}>
                      <td className="table-td font-mono font-semibold text-blue-700">{po.po_number}</td>
                      <td className="table-td text-gray-700">{po.vendor_name || <span className="text-gray-400 italic">No vendor</span>}</td>
                      <td className="table-td"><StatusBadge status={po.status} /></td>
                      <td className="table-td text-center text-gray-500">{po.warehouse}</td>
                      <td className="table-td text-center text-gray-500 text-xs">
                        {po.expected_date || '—'}
                      </td>
                      <td className="table-td text-right">
                        <div className="text-gray-900 font-medium">{po.total_ordered}</div>
                        {po.status !== 'draft' && po.total_ordered > 0 && (
                          <div className="mt-1 w-16 ml-auto">
                            <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
                              <div className="h-full bg-green-400 rounded-full" style={{ width: `${progress}%` }} />
                            </div>
                            <div className="text-xs text-gray-400 mt-0.5 text-right">{progress}%</div>
                          </div>
                        )}
                      </td>
                      <td className="table-td text-right font-medium text-gray-700">
                        {po.total_cost > 0 ? `$${po.total_cost.toFixed(2)}` : '—'}
                      </td>
                      <td className="table-td">
                        <ChevronRight size={16} className="text-gray-300" />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
