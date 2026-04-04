import React, { useState, useEffect, useCallback } from 'react'
import { invoiceAPI, orderAPI, customerAPI, skuAPI, settingsAPI, emailAPI } from '../api/client'
import { printInvoice } from '../utils/invoiceTemplates'
import {
  FileText, Plus, Printer, Send, CheckCircle, Trash2,
  ChevronDown, ChevronUp, X, Search, RefreshCw,
  Edit2, AlertCircle, DollarSign, Mail, Clock, AlertTriangle
} from 'lucide-react'

// ── Status badge ─────────────────────────────────────────────
const STATUS_STYLES = {
  Draft:     'bg-gray-100 text-gray-700',
  Sent:      'bg-blue-100 text-blue-700',
  Paid:      'bg-green-100 text-green-700',
  Overdue:   'bg-red-100 text-red-700',
  Cancelled: 'bg-orange-100 text-orange-700',
}

function StatusBadge({ status }) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_STYLES[status] || 'bg-gray-100 text-gray-600'}`}>
      {status}
    </span>
  )
}

const fmt = (n) => `$${(n || 0).toFixed(2)}`

// ── Invoice Form (shared for Create & Edit) ───────────────────
function InvoiceForm({ initial, onClose, onSaved }) {
  const today = new Date().toISOString().split('T')[0]
  const isEdit = !!initial?.id

  const [customers, setCustomers] = useState([])
  const [skus,      setSkus]      = useState([])
  const [form, setForm] = useState(() => initial ? {
    customer_id:      initial.customer_id || '',
    store_name:       initial.store_name,
    invoice_date:     initial.invoice_date,
    due_date:         initial.due_date || '',
    payment_terms:    initial.payment_terms || '',
    notes:            initial.notes || '',
    discount_amount:  initial.discount_amount || 0,
    previous_balance: initial.previous_balance || 0,
    taxes: initial.taxes?.length ? initial.taxes.map(t => ({ name: t.name, rate: t.rate })) : [{ name: 'GST', rate: 0 }],
    items: initial.items.map(i => ({ sku_id: i.sku_id || '', description: i.description, cases_qty: i.cases_qty, unit_price: i.unit_price, notes: i.notes || '' })),
  } : {
    customer_id: '', store_name: '', invoice_date: today, due_date: '',
    payment_terms: '', notes: '', discount_amount: 0, previous_balance: 0,
    taxes: [{ name: 'GST', rate: 0 }],
    items: [{ sku_id: '', description: '', cases_qty: 1, unit_price: 0, notes: '' }],
  })
  const [saving, setSaving] = useState(false)
  const [err,    setErr]    = useState('')

  useEffect(() => {
    customerAPI.list().then(r => setCustomers(r.data)).catch(() => {})
    skuAPI.list({ limit: 500 }).then(r => setSkus(r.data.items || r.data)).catch(() => {})
  }, [])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const onCustChange = (id) => {
    const c = customers.find(c => c.id === parseInt(id))
    set('customer_id', id)
    if (c) set('store_name', c.name)
  }

  const setItem = (idx, k, v) => {
    setForm(f => {
      const items = [...f.items]
      items[idx] = { ...items[idx], [k]: v }
      if (k === 'sku_id' && v) {
        const sku = skus.find(s => s.id === parseInt(v))
        if (sku) {
          items[idx].description = sku.product_name
          items[idx].unit_price  = sku.cost_price || 0
        }
      }
      return { ...f, items }
    })
  }

  const setTax = (idx, k, v) => {
    setForm(f => {
      const taxes = [...f.taxes]
      taxes[idx] = { ...taxes[idx], [k]: v }
      return { ...f, taxes }
    })
  }

  const addItem = () => setForm(f => ({ ...f, items: [...f.items, { sku_id: '', description: '', cases_qty: 1, unit_price: 0, notes: '' }] }))
  const removeItem = (idx) => setForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }))
  const addTax    = () => setForm(f => ({ ...f, taxes: [...f.taxes, { name: '', rate: 0 }] }))
  const removeTax = (idx) => setForm(f => ({ ...f, taxes: f.taxes.filter((_, i) => i !== idx) }))

  // Live totals
  const subtotal    = form.items.reduce((s, it) => s + ((+it.cases_qty || 0) * (+it.unit_price || 0)), 0)
  const discounted  = subtotal - (+form.discount_amount || 0)
  const taxTotal    = form.taxes.reduce((s, tx) => s + discounted * ((+tx.rate || 0) / 100), 0)
  const total       = discounted + taxTotal
  const grandTotal  = total + (+form.previous_balance || 0)

  const submit = async (e) => {
    e.preventDefault()
    if (!form.store_name) return setErr('Store name is required')
    if (!form.items.length || !form.items[0].description) return setErr('At least one item required')
    setSaving(true); setErr('')
    try {
      const payload = {
        customer_id:      form.customer_id ? parseInt(form.customer_id) : null,
        store_name:       form.store_name,
        invoice_date:     form.invoice_date,
        due_date:         form.due_date || null,
        payment_terms:    form.payment_terms || null,
        notes:            form.notes || null,
        discount_amount:  parseFloat(form.discount_amount) || 0,
        previous_balance: parseFloat(form.previous_balance) || 0,
        taxes: form.taxes.filter(t => t.name && +t.rate > 0).map(t => ({ name: t.name, rate: parseFloat(t.rate) })),
        items: form.items.map(it => ({
          sku_id:      it.sku_id ? parseInt(it.sku_id) : null,
          description: it.description,
          cases_qty:   parseInt(it.cases_qty) || 1,
          unit_price:  parseFloat(it.unit_price) || 0,
          notes:       it.notes || null,
        })),
      }
      const r = isEdit
        ? await invoiceAPI.update(initial.id, payload)
        : await invoiceAPI.create(payload)
      onSaved(r.data)
    } catch (e) {
      setErr(e.response?.data?.detail || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 flex flex-col max-h-[92vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h3 className="font-bold text-gray-900">{isEdit ? `Edit ${initial.invoice_number}` : 'New Invoice'}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100"><X size={16} /></button>
        </div>

        <form onSubmit={submit} className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {err && <div className="p-3 bg-red-50 text-red-700 text-sm rounded-lg">{err}</div>}

          {/* Basic info */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Customer</label>
              <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.customer_id} onChange={e => onCustChange(e.target.value)}>
                <option value="">— Select —</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Store / Bill To *</label>
              <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.store_name} onChange={e => set('store_name', e.target.value)} required />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Invoice Date *</label>
              <input type="date" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.invoice_date} onChange={e => set('invoice_date', e.target.value)} required />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Due Date</label>
              <input type="date" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.due_date} onChange={e => set('due_date', e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Payment Terms</label>
              <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.payment_terms} onChange={e => set('payment_terms', e.target.value)}>
                <option value="">— None —</option>
                {['Due on Receipt','Net 7','Net 14','Net 30','Net 60','COD'].map(pt =>
                  <option key={pt} value={pt}>{pt}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Notes</label>
              <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.notes} onChange={e => set('notes', e.target.value)} />
            </div>
          </div>

          {/* Line items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-gray-700">Line Items</span>
              <button type="button" onClick={addItem} className="text-xs text-blue-600 hover:underline font-medium">+ Add Item</button>
            </div>
            <div className="space-y-2">
              {form.items.map((it, idx) => (
                <div key={idx} className="space-y-1">
                  <div className="grid gap-1.5 items-center" style={{gridTemplateColumns:'2fr 1fr 1fr 1fr auto'}}>
                    <div className="flex gap-1">
                      <select className="w-24 shrink-0 border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                        value={it.sku_id} onChange={e => setItem(idx, 'sku_id', e.target.value)}>
                        <option value="">SKU</option>
                        {skus.map(s => <option key={s.id} value={s.id}>{s.sku_code}</option>)}
                      </select>
                      <input className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Description" value={it.description} onChange={e => setItem(idx, 'description', e.target.value)} required />
                    </div>
                    <input type="number" min="1" className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Cases" value={it.cases_qty} onChange={e => setItem(idx, 'cases_qty', e.target.value)} />
                    <input type="number" min="0" step="0.01" className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Unit $" value={it.unit_price} onChange={e => setItem(idx, 'unit_price', e.target.value)} />
                    <div className="text-xs text-right font-medium text-gray-700">
                      ${((+it.cases_qty||0)*(+it.unit_price||0)).toFixed(2)}
                    </div>
                    {form.items.length > 1 && (
                      <button type="button" onClick={() => removeItem(idx)} className="text-red-400 hover:text-red-600"><X size={14} /></button>
                    )}
                  </div>
                  <input
                    className="w-full border border-gray-100 rounded-lg px-2 py-1 text-xs text-gray-500 placeholder-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-gray-50"
                    placeholder="Line note (optional — e.g. discount reason, special instruction)…"
                    value={it.notes}
                    onChange={e => setItem(idx, 'notes', e.target.value)}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Taxes */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-gray-700">Tax Lines</span>
              <button type="button" onClick={addTax} className="text-xs text-blue-600 hover:underline font-medium">+ Add Tax</button>
            </div>
            <div className="space-y-1.5">
              {form.taxes.map((tx, idx) => (
                <div key={idx} className="flex gap-2 items-center">
                  <input className="w-28 border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Name (GST, VAT…)" value={tx.name} onChange={e => setTax(idx, 'name', e.target.value)} />
                  <input type="number" min="0" max="100" step="0.1" className="w-20 border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Rate %" value={tx.rate} onChange={e => setTax(idx, 'rate', e.target.value)} />
                  <span className="text-xs text-gray-500 w-20 text-right">
                    = ${(discounted * (+tx.rate||0) / 100).toFixed(2)}
                  </span>
                  <button type="button" onClick={() => removeTax(idx)} className="text-gray-300 hover:text-red-500"><X size={13} /></button>
                </div>
              ))}
            </div>
          </div>

          {/* Discount + Previous Balance */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Discount ($)</label>
              <input type="number" min="0" step="0.01" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.discount_amount} onChange={e => set('discount_amount', e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Previous Balance Due ($)</label>
              <input type="number" min="0" step="0.01" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.previous_balance} onChange={e => set('previous_balance', e.target.value)} />
            </div>
          </div>

          {/* Live totals */}
          <div className="bg-gray-50 rounded-xl p-4 text-sm space-y-1.5 border border-gray-100">
            <div className="flex justify-between text-gray-600"><span>Subtotal</span><span className="font-medium">{fmt(subtotal)}</span></div>
            {+form.discount_amount > 0 && (
              <div className="flex justify-between text-green-700"><span>Discount</span><span className="font-medium">-{fmt(+form.discount_amount)}</span></div>
            )}
            {form.taxes.filter(t => t.name && +t.rate > 0).map((tx, i) => (
              <div key={i} className="flex justify-between text-gray-600">
                <span>{tx.name} ({tx.rate}%)</span>
                <span className="font-medium">{fmt(discounted * (+tx.rate) / 100)}</span>
              </div>
            ))}
            <div className="flex justify-between font-semibold text-gray-800 border-t border-gray-200 pt-1.5">
              <span>Invoice Total</span><span>{fmt(total)}</span>
            </div>
            {+form.previous_balance > 0 && (
              <div className="flex justify-between text-red-600 font-medium"><span>Previous Balance</span><span>{fmt(+form.previous_balance)}</span></div>
            )}
            {+form.previous_balance > 0 && (
              <div className="flex justify-between font-bold text-base text-gray-900 border-t border-gray-300 pt-1.5">
                <span>Amount Due</span><span>{fmt(grandTotal)}</span>
              </div>
            )}
          </div>
        </form>

        <div className="px-5 py-4 border-t flex justify-end gap-3">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200">Cancel</button>
          <button onClick={submit} disabled={saving}
            className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700 disabled:opacity-50">
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Invoice'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Send Invoice Email Modal ───────────────────────────────────
function SendInvoiceEmailModal({ inv, onClose, onSent }) {
  const [to,      setTo]      = useState('')
  const [subject, setSubject] = useState(`Invoice ${inv.invoice_number}`)
  const [body,    setBody]    = useState('')
  const [sending, setSending] = useState(false)
  const [err,     setErr]     = useState('')

  // Pre-fill customer email if available
  useEffect(() => {
    if (inv.customer_id) {
      customerAPI.get(inv.customer_id)
        .then(r => { if (r.data.email) setTo(r.data.email) })
        .catch(() => {})
    }
  }, [inv.customer_id])

  const send = async () => {
    if (!to.trim()) { setErr('Email address is required'); return }
    setSending(true); setErr('')
    try {
      const r = await emailAPI.sendInvoice(inv.id, { to: to.trim(), subject, body })
      onSent(r.data)
      onClose()
    } catch (e) {
      setErr(e.response?.data?.detail || 'Send failed')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b">
          <div className="flex items-center gap-2 font-bold text-gray-900">
            <Mail size={18} className="text-blue-600" />
            Email Invoice {inv.invoice_number}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4">
          {err && <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">{err}</div>}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">To (email address)</label>
            <input className="input w-full" type="email" placeholder="customer@example.com" value={to} onChange={e => setTo(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Subject</label>
            <input className="input w-full" value={subject} onChange={e => setSubject(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Message <span className="text-gray-400 font-normal">(optional note added to email)</span></label>
            <textarea className="input w-full" rows={3} placeholder="Please find your invoice attached…" value={body} onChange={e => setBody(e.target.value)} />
          </div>
          <p className="text-xs text-gray-400">The full invoice will be sent as a formatted HTML email. Status will change from Draft → Sent after sending.</p>
        </div>
        <div className="px-5 pb-5 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200">Cancel</button>
          <button onClick={send} disabled={sending}
            className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
            <Mail size={14} />{sending ? 'Sending…' : 'Send Invoice'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── From-Order Modal ──────────────────────────────────────────
function FromOrderModal({ onClose, onCreated }) {
  const [orders,  setOrders]  = useState([])
  const [search,  setSearch]  = useState('')
  const [loading, setLoading] = useState(false)
  const [busy,    setBusy]    = useState(false)
  const [err,     setErr]     = useState('')

  useEffect(() => {
    setLoading(true)
    orderAPI.list({ status: 'Dispatched' })
      .then(r => setOrders(r.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const filtered = orders.filter(o =>
    o.order_number.toLowerCase().includes(search.toLowerCase()) ||
    o.store_name.toLowerCase().includes(search.toLowerCase())
  )

  const generate = async (orderId) => {
    setBusy(true); setErr('')
    try {
      const r = await invoiceAPI.fromOrder(orderId)
      onCreated(r.data)
    } catch (e) {
      setErr(e.response?.data?.detail || 'Failed to generate invoice')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h3 className="font-bold text-gray-900">Generate Invoice from Dispatched Order</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100"><X size={16} /></button>
        </div>
        <div className="px-5 py-3 border-b">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input className="w-full border border-gray-200 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Search order or store…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-3">
          {err && <div className="mb-3 p-3 bg-red-50 text-red-700 text-sm rounded-lg">{err}</div>}
          {loading ? (
            <p className="text-center text-gray-400 py-8 text-sm">Loading…</p>
          ) : filtered.length === 0 ? (
            <p className="text-center text-gray-400 py-8 text-sm">No dispatched orders found</p>
          ) : (
            <div className="space-y-2">
              {filtered.map(o => (
                <div key={o.id} className="flex items-center justify-between p-3 border border-gray-100 rounded-xl hover:bg-gray-50">
                  <div>
                    <p className="font-semibold text-sm text-gray-900">{o.order_number}</p>
                    <p className="text-xs text-gray-500">{o.store_name} · {o.dispatch_date || o.order_date}</p>
                  </div>
                  <button onClick={() => generate(o.id)} disabled={busy}
                    className="px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50">
                    Generate
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Aging Summary Panel ───────────────────────────────────────
function AgingPanel({ onMarkOverdue }) {
  const [aging,    setAging]    = useState(null)
  const [marking,  setMarking]  = useState(false)
  const [show,     setShow]     = useState(false)

  useEffect(() => {
    invoiceAPI.agingSummary().then(r => setAging(r.data)).catch(() => {})
  }, [])

  const handleMarkOverdue = async () => {
    if (!window.confirm('Mark all Sent invoices with a past due date as Overdue?')) return
    setMarking(true)
    try {
      const r = await invoiceAPI.markOverdueBatch()
      alert(`${r.data.updated} invoice(s) marked Overdue.`)
      onMarkOverdue()
      const r2 = await invoiceAPI.agingSummary()
      setAging(r2.data)
    } catch (e) {
      alert(e?.response?.data?.detail || 'Failed')
    } finally { setMarking(false) }
  }

  if (!aging) return null
  const { amounts, counts } = aging
  if (amounts.total === 0) return null

  const buckets = [
    { label: 'Current',  amt: amounts.current,    cnt: counts.current,    color: 'text-blue-700',   bg: 'bg-blue-50'   },
    { label: '1-30 days', amt: amounts.days_1_30, cnt: counts.days_1_30,  color: 'text-amber-700',  bg: 'bg-amber-50'  },
    { label: '31-60',    amt: amounts.days_31_60,  cnt: counts.days_31_60, color: 'text-orange-700', bg: 'bg-orange-50' },
    { label: '61-90',    amt: amounts.days_61_90,  cnt: counts.days_61_90, color: 'text-red-600',    bg: 'bg-red-50'    },
    { label: '90+ days', amt: amounts.over_90,     cnt: counts.over_90,    color: 'text-red-800',    bg: 'bg-red-100'   },
  ]
  const hasOverdue = (amounts.days_1_30 + amounts.days_31_60 + amounts.days_61_90 + amounts.over_90) > 0

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <button onClick={() => setShow(s => !s)} className="flex items-center gap-2 text-sm font-semibold text-gray-700 hover:text-gray-900">
          <Clock size={15} className="text-blue-600" />
          Aged Receivables — <span className="text-blue-700">{fmt(amounts.total)}</span> outstanding
          {show ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
        {hasOverdue && (
          <button
            onClick={handleMarkOverdue}
            disabled={marking}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-red-50 text-red-700 border border-red-200 rounded-lg hover:bg-red-100 disabled:opacity-50"
          >
            <AlertTriangle size={12} /> {marking ? 'Updating…' : 'Mark Overdue'}
          </button>
        )}
      </div>
      {show && (
        <div className="grid grid-cols-5 gap-2">
          {buckets.map(b => (
            <div key={b.label} className={`${b.bg} rounded-lg p-3 text-center`}>
              <p className={`text-sm font-bold ${b.color}`}>{fmt(b.amt)}</p>
              <p className="text-xs text-gray-500 mt-0.5">{b.label}</p>
              <p className="text-xs text-gray-400">{b.cnt} inv.</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main Invoices Page ────────────────────────────────────────
export default function Invoices() {
  const [invoices,      setInvoices]     = useState([])
  const [company,       setCompany]      = useState({})
  const [loading,       setLoading]      = useState(true)
  const [statusFilter,  setStatusFilter] = useState('all')
  const [expanded,      setExpanded]     = useState(null)
  const [showCreate,    setShowCreate]   = useState(false)
  const [showFromOrder, setFromOrder]    = useState(false)
  const [editInvoice,   setEditInvoice]  = useState(null)
  const [emailInvoice,  setEmailInvoice] = useState(null)
  const [busy,          setBusy]         = useState({})

  const load = useCallback(async () => {
    if (!invoices.length) setLoading(true)
    try {
      const params = statusFilter !== 'all' ? { status: statusFilter } : {}
      const r = await invoiceAPI.list(params)
      setInvoices(r.data)
    } catch {}
    setLoading(false)
  }, [statusFilter])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    settingsAPI.getCompany().then(r => setCompany(r.data)).catch(() => {})
  }, [])

  const counts = invoices.reduce((acc, inv) => {
    acc[inv.status] = (acc[inv.status] || 0) + 1
    return acc
  }, {})

  const totalOutstanding = invoices
    .filter(i => ['Sent', 'Overdue'].includes(i.status))
    .reduce((s, i) => s + (i.grand_total || i.total), 0)

  const doAction = async (id, fn, label) => {
    if (busy[id]) return
    setBusy(b => ({ ...b, [id]: label }))
    try {
      const r = await fn()
      setInvoices(prev => prev.map(i => i.id === id ? r.data : i))
    } catch (e) {
      alert(e.response?.data?.detail || `${label} failed`)
    } finally {
      setBusy(b => { const n = { ...b }; delete n[id]; return n })
    }
  }

  const deleteInv = async (id) => {
    if (!confirm('Delete this invoice?')) return
    try {
      await invoiceAPI.delete(id)
      setInvoices(prev => prev.filter(i => i.id !== id))
    } catch (e) {
      alert(e.response?.data?.detail || 'Delete failed')
    }
  }

  const onCreated = (inv) => {
    setInvoices(prev => [inv, ...prev.filter(i => i.id !== inv.id)])
    setShowCreate(false); setFromOrder(false); setEditInvoice(null)
    setExpanded(inv.id)
  }

  const FILTERS = ['all', 'Draft', 'Sent', 'Paid', 'Overdue', 'Cancelled']

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <FileText size={24} className="text-blue-600" />
            Invoices
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Customer billing and payment tracking</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setFromOrder(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50 shadow-sm">
            <RefreshCw size={15} /> From Order
          </button>
          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 shadow-sm">
            <Plus size={16} /> New Invoice
          </button>
        </div>
      </div>

      {/* Aging panel */}
      <AgingPanel onMarkOverdue={load} />

      {/* Summary chips */}
      <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
        {[
          { label: 'Total',       value: invoices.length,       color: 'text-gray-700',  bg: 'bg-gray-50'   },
          { label: 'Draft',       value: counts.Draft || 0,     color: 'text-gray-600',  bg: 'bg-gray-100'  },
          { label: 'Sent',        value: counts.Sent  || 0,     color: 'text-blue-700',  bg: 'bg-blue-50'   },
          { label: 'Paid',        value: counts.Paid  || 0,     color: 'text-green-700', bg: 'bg-green-50'  },
          { label: 'Overdue',     value: counts.Overdue || 0,   color: 'text-red-700',   bg: 'bg-red-50'    },
          { label: 'Outstanding', value: fmt(totalOutstanding),  color: 'text-orange-700',bg: 'bg-orange-50' },
        ].map(chip => (
          <div key={chip.label} className={`${chip.bg} rounded-xl p-3 text-center`}>
            <p className={`text-lg font-bold ${chip.color}`}>{chip.value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{chip.label}</p>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 flex-wrap">
        {FILTERS.map(f => (
          <button key={f} onClick={() => setStatusFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              statusFilter === f ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}>
            {f === 'all' ? 'All' : f}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-gray-400 text-sm">Loading…</div>
        ) : invoices.length === 0 ? (
          <div className="py-16 text-center">
            <FileText size={40} className="mx-auto text-gray-300 mb-3" />
            <p className="text-gray-400 font-medium">No invoices yet</p>
            <p className="text-xs text-gray-400 mt-1">Create one manually or generate from a dispatched order</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100 text-xs text-gray-500 uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3 text-left w-6"></th>
                <th className="px-4 py-3 text-left">Invoice #</th>
                <th className="px-4 py-3 text-left">Customer / Store</th>
                <th className="px-4 py-3 text-left">Date</th>
                <th className="px-4 py-3 text-left">Due / Terms</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3 text-right">Amount Due</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map(inv => (
                <React.Fragment key={inv.id}>
                  <tr className={`border-b border-gray-50 hover:bg-gray-50/50 cursor-pointer transition-colors ${expanded === inv.id ? 'bg-blue-50/30' : ''}`}
                    onClick={() => setExpanded(expanded === inv.id ? null : inv.id)}>
                    <td className="px-4 py-3 text-gray-400">
                      {expanded === inv.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </td>
                    <td className="px-4 py-3 font-mono font-semibold text-gray-900 text-xs">{inv.invoice_number}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{inv.customer_name || inv.store_name}</p>
                      {inv.customer_name && inv.store_name !== inv.customer_name && (
                        <p className="text-xs text-gray-400">{inv.store_name}</p>
                      )}
                      {inv.order_number && <p className="text-xs text-gray-400">Ord: {inv.order_number}</p>}
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{inv.invoice_date}</td>
                    <td className="px-4 py-3 text-xs">
                      {inv.due_date && <p className="text-gray-600">{inv.due_date}</p>}
                      {inv.payment_terms && <p className="text-gray-400">{inv.payment_terms}</p>}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-800 text-xs">{fmt(inv.total)}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={`font-bold text-sm ${inv.previous_balance > 0 ? 'text-red-600' : 'text-gray-900'}`}>
                        {fmt(inv.grand_total || inv.total)}
                      </span>
                      {inv.previous_balance > 0 && (
                        <p className="text-xs text-red-400">incl. {fmt(inv.previous_balance)} prev.</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center"><StatusBadge status={inv.status} /></td>
                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-center gap-0.5">
                        {/* Print */}
                        <button title="Print" onClick={() => printInvoice(inv, company)}
                          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg">
                          <Printer size={13} />
                        </button>
                        {/* Email */}
                        {inv.status !== 'Paid' && inv.status !== 'Cancelled' && (
                          <button title="Email invoice" onClick={() => setEmailInvoice(inv)}
                            className="p-1.5 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg">
                            <Mail size={13} />
                          </button>
                        )}
                        {/* Edit */}
                        {inv.status !== 'Paid' && (
                          <button title="Edit" onClick={() => setEditInvoice(inv)}
                            className="p-1.5 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg">
                            <Edit2 size={13} />
                          </button>
                        )}
                        {/* Send */}
                        {inv.status === 'Draft' && (
                          <button title="Mark Sent" onClick={() => doAction(inv.id, () => invoiceAPI.send(inv.id), 'Send')}
                            disabled={!!busy[inv.id]}
                            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg disabled:opacity-40">
                            <Send size={13} />
                          </button>
                        )}
                        {/* Mark Overdue */}
                        {inv.status === 'Sent' && (
                          <button title="Mark Overdue" onClick={() => doAction(inv.id, () => invoiceAPI.markOverdue(inv.id), 'Overdue')}
                            disabled={!!busy[inv.id]}
                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-40">
                            <AlertCircle size={13} />
                          </button>
                        )}
                        {/* Mark Paid */}
                        {['Sent', 'Overdue'].includes(inv.status) && (
                          <button title="Mark Paid" onClick={() => doAction(inv.id, () => invoiceAPI.markPaid(inv.id), 'Paid')}
                            disabled={!!busy[inv.id]}
                            className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg disabled:opacity-40">
                            <CheckCircle size={13} />
                          </button>
                        )}
                        {/* Delete */}
                        {inv.status !== 'Paid' && (
                          <button title="Delete" onClick={() => deleteInv(inv.id)}
                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg">
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>

                  {/* Expanded row */}
                  {expanded === inv.id && (
                    <tr className="bg-blue-50/20">
                      <td colSpan={9} className="px-8 py-4">
                        <table className="w-full text-xs mb-3">
                          <thead>
                            <tr className="text-gray-500 border-b border-gray-200">
                              <th className="pb-2 text-left font-semibold">Description</th>
                              {inv.items.some(it => it.expiry_date) && <th className="pb-2 text-center font-semibold">Best Before</th>}
                              <th className="pb-2 text-center font-semibold">Cases</th>
                              <th className="pb-2 text-right font-semibold">Unit $</th>
                              <th className="pb-2 text-right font-semibold">Amount</th>
                            </tr>
                          </thead>
                          <tbody>
                            {inv.items.map(it => (
                              <tr key={it.id} className="border-b border-gray-100">
                                <td className="py-1.5">
                                  <span className="font-medium text-gray-800">{it.description}</span>
                                  {it.sku_code && <span className="ml-2 text-gray-400">({it.sku_code})</span>}
                                  {it.notes && <div className="text-[11px] text-indigo-500 italic mt-0.5">{it.notes}</div>}
                                </td>
                                {inv.items.some(i => i.expiry_date) && (
                                  <td className="py-1.5 text-center">
                                    {it.expiry_date
                                      ? <span className="text-xs px-2 py-0.5 bg-red-50 border border-red-200 rounded-full text-red-700 font-mono">{it.expiry_date}</span>
                                      : <span className="text-gray-300">—</span>
                                    }
                                  </td>
                                )}
                                <td className="py-1.5 text-center text-gray-700">{it.cases_qty}</td>
                                <td className="py-1.5 text-right text-gray-700">{fmt(it.unit_price)}</td>
                                <td className="py-1.5 text-right font-semibold text-gray-800">{fmt(it.line_total)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>

                        {/* Totals breakdown */}
                        <div className="flex justify-end">
                          <div className="w-64 text-xs space-y-1">
                            <div className="flex justify-between text-gray-600"><span>Subtotal</span><span>{fmt(inv.subtotal)}</span></div>
                            {inv.discount_amount > 0 && (
                              <div className="flex justify-between text-green-700"><span>Discount</span><span>-{fmt(inv.discount_amount)}</span></div>
                            )}
                            {(inv.taxes || []).map(tx => (
                              <div key={tx.id} className="flex justify-between text-gray-600">
                                <span>{tx.name} ({tx.rate}%)</span><span>{fmt(tx.amount)}</span>
                              </div>
                            ))}
                            <div className="flex justify-between font-semibold text-gray-800 border-t border-gray-200 pt-1">
                              <span>Invoice Total</span><span>{fmt(inv.total)}</span>
                            </div>
                            {inv.previous_balance > 0 && (
                              <div className="flex justify-between text-red-600 font-medium">
                                <span>Previous Balance</span><span>{fmt(inv.previous_balance)}</span>
                              </div>
                            )}
                            {inv.previous_balance > 0 && (
                              <div className="flex justify-between font-bold text-sm text-gray-900 border-t border-gray-300 pt-1">
                                <span>Amount Due</span><span>{fmt(inv.grand_total)}</span>
                              </div>
                            )}
                          </div>
                        </div>
                        {inv.payment_terms && (
                          <p className="mt-2 text-xs text-gray-500">Terms: {inv.payment_terms}</p>
                        )}
                        {inv.notes && <p className="mt-1 text-xs text-gray-500 italic">Notes: {inv.notes}</p>}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modals */}
      {showCreate   && <InvoiceForm  onClose={() => setShowCreate(false)} onSaved={onCreated} />}
      {editInvoice  && <InvoiceForm  initial={editInvoice} onClose={() => setEditInvoice(null)} onSaved={onCreated} />}
      {showFromOrder && <FromOrderModal onClose={() => setFromOrder(false)} onCreated={onCreated} />}
      {emailInvoice && (
        <SendInvoiceEmailModal
          inv={emailInvoice}
          onClose={() => setEmailInvoice(null)}
          onSent={(data) => {
            // Update invoice status in list if it changed
            setInvoices(prev => prev.map(i => i.id === emailInvoice.id ? { ...i, status: data.new_status || i.status } : i))
            setEmailInvoice(null)
          }}
        />
      )}
    </div>
  )
}
