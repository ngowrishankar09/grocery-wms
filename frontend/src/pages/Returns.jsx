import React, { useEffect, useState } from 'react'
import { returnsAPI, customerAPI, skuAPI } from '../api/client'
import { Plus, Trash2, CheckCircle, XCircle, ChevronDown, ChevronUp, RotateCcw } from 'lucide-react'

const today = () => new Date().toISOString().split('T')[0]

const REASONS = ['Damaged', 'Expired', 'Excess', 'Wrong Item', 'Other']
const CONDITIONS = ['Good', 'Damaged', 'Expired']
const WAREHOUSES = ['WH1', 'WH2']

const statusBadge = (status) => {
  if (status === 'Accepted') return <span className="badge-ok">{status}</span>
  if (status === 'Rejected') return <span className="badge-danger">{status}</span>
  return <span className="badge-warning">{status}</span>
}

const conditionBadge = (cond) => {
  if (cond === 'Good')    return <span className="badge-ok">{cond}</span>
  if (cond === 'Expired') return <span className="badge-danger">{cond}</span>
  return <span className="badge-warning">{cond}</span>
}

// ── Create Return Form ────────────────────────────────────────
function CreateForm({ customers, skus, onCreated, onClose }) {
  const [customerId, setCustomerId] = useState('')
  const [storeName,  setStoreName]  = useState('')
  const [returnDate, setReturnDate] = useState(today())
  const [reason,     setReason]     = useState('Damaged')
  const [warehouse,  setWarehouse]  = useState('WH1')
  const [notes,      setNotes]      = useState('')
  const [items, setItems] = useState([{ sku_id: '', cases_returned: '', condition: 'Good' }])
  const [saving, setSaving] = useState(false)

  const addItem    = () => setItems([...items, { sku_id: '', cases_returned: '', condition: 'Good' }])
  const removeItem = (i) => setItems(items.filter((_, idx) => idx !== i))
  const updateItem = (i, field, val) => {
    const u = [...items]; u[i] = { ...u[i], [field]: val }; setItems(u)
  }

  const handleSubmit = async () => {
    if (!storeName.trim()) return alert('Enter store / customer name')
    const valid = items.filter(it => it.sku_id && it.cases_returned > 0)
    if (!valid.length) return alert('Add at least one item with cases > 0')
    setSaving(true)
    try {
      await returnsAPI.create({
        return_date: returnDate,
        customer_id: customerId ? parseInt(customerId) : null,
        store_name:  storeName,
        reason,
        warehouse,
        notes: notes || null,
        items: valid.map(it => ({
          sku_id:         parseInt(it.sku_id),
          cases_returned: parseInt(it.cases_returned),
          condition:      it.condition,
        })),
      })
      onCreated()
    } catch (e) {
      alert('Error: ' + (e.response?.data?.detail || e.message))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="card space-y-4">
      <h3 className="font-semibold text-gray-900">New Return</h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div>
          <label className="label">Customer (optional)</label>
          <select className="input" value={customerId} onChange={e => {
            setCustomerId(e.target.value)
            if (e.target.value) {
              const c = customers.find(c => c.id === parseInt(e.target.value))
              if (c) setStoreName(c.name)
            }
          }}>
            <option value="">— Select customer —</option>
            {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        <div>
          <label className="label">Store / Customer Name *</label>
          <input className="input" value={storeName} onChange={e => setStoreName(e.target.value)} placeholder="Store A" />
        </div>

        <div>
          <label className="label">Return Date</label>
          <input type="date" className="input" value={returnDate} onChange={e => setReturnDate(e.target.value)} />
        </div>

        <div>
          <label className="label">Reason</label>
          <select className="input" value={reason} onChange={e => setReason(e.target.value)}>
            {REASONS.map(r => <option key={r}>{r}</option>)}
          </select>
        </div>

        <div>
          <label className="label">Restock to Warehouse</label>
          <select className="input" value={warehouse} onChange={e => setWarehouse(e.target.value)}>
            {WAREHOUSES.map(w => <option key={w}>{w}</option>)}
          </select>
        </div>

        <div>
          <label className="label">Notes</label>
          <input className="input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional notes" />
        </div>
      </div>

      <div className="space-y-2">
        <label className="label">Returned Items</label>
        {items.map((item, i) => (
          <div key={i} className="flex gap-3 items-center bg-gray-50 p-3 rounded-lg flex-wrap">
            <select className="input flex-1 min-w-[200px]" value={item.sku_id} onChange={e => updateItem(i, 'sku_id', e.target.value)}>
              <option value="">Select product...</option>
              {skus.map(s => (
                <option key={s.id} value={s.id}>{s.sku_code} — {s.product_name}</option>
              ))}
            </select>
            <input
              type="number" min="1" className="input w-28"
              placeholder="Cases"
              value={item.cases_returned}
              onChange={e => updateItem(i, 'cases_returned', e.target.value)}
            />
            <select className="input w-32" value={item.condition} onChange={e => updateItem(i, 'condition', e.target.value)}>
              {CONDITIONS.map(c => <option key={c}>{c}</option>)}
            </select>
            <button onClick={() => removeItem(i)} className="text-red-400 hover:text-red-600">
              <Trash2 size={18} />
            </button>
          </div>
        ))}
        <button className="btn-secondary flex items-center gap-2 text-sm" onClick={addItem}>
          <Plus size={15} /> Add Item
        </button>
      </div>

      <div className="flex gap-3 pt-2">
        <button className="btn-primary" onClick={handleSubmit} disabled={saving}>
          {saving ? 'Creating…' : 'Create Return'}
        </button>
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
      </div>
    </div>
  )
}


// ── Accept Modal ──────────────────────────────────────────────
function AcceptModal({ ret, onDone, onClose }) {
  const [accepted, setAccepted] = useState(
    Object.fromEntries(ret.items.map(it => [it.sku_id, it.cases_returned]))
  )
  const [saving, setSaving] = useState(false)

  const handleAccept = async () => {
    setSaving(true)
    try {
      await returnsAPI.accept(ret.id, accepted)
      onDone()
    } catch (e) {
      alert('Error: ' + (e.response?.data?.detail || e.message))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-lg space-y-4">
        <h3 className="font-bold text-gray-900 text-lg">Accept Return — {ret.return_number}</h3>
        <p className="text-sm text-gray-500">Set accepted cases per item. Accepted stock will be restocked into <strong>{ret.warehouse}</strong>.</p>

        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="table-th">Product</th>
              <th className="table-th text-center">Returned</th>
              <th className="table-th text-center">Condition</th>
              <th className="table-th text-center">Accept</th>
            </tr>
          </thead>
          <tbody>
            {ret.items.map(it => (
              <tr key={it.sku_id} className="border-b">
                <td className="table-td">
                  <div className="font-medium">{it.product_name}</div>
                  <div className="text-xs text-gray-400">{it.sku_code}</div>
                </td>
                <td className="table-td text-center">{it.cases_returned}</td>
                <td className="table-td text-center">{conditionBadge(it.condition)}</td>
                <td className="table-td text-center">
                  <input
                    type="number" min="0" max={it.cases_returned}
                    className="input w-20 text-center"
                    value={accepted[it.sku_id] ?? it.cases_returned}
                    onChange={e => setAccepted({ ...accepted, [it.sku_id]: parseInt(e.target.value) || 0 })}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex gap-3 pt-2">
          <button className="btn-success flex items-center gap-2" onClick={handleAccept} disabled={saving}>
            <CheckCircle size={16} /> {saving ? 'Processing…' : 'Accept & Restock'}
          </button>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}


// ── Main Page ─────────────────────────────────────────────────
export default function Returns() {
  const [returns,   setReturns]   = useState([])
  const [customers, setCustomers] = useState([])
  const [skus,      setSkus]      = useState([])
  const [loading,   setLoading]   = useState(true)
  const [showForm,  setShowForm]  = useState(false)
  const [statusFilter, setStatusFilter] = useState('')
  const [expanded,  setExpanded]  = useState(null)
  const [accepting, setAccepting] = useState(null)

  const load = async () => {
    if (!returns.length) setLoading(true)
    try {
      const params = statusFilter ? { status: statusFilter } : {}
      const r = await returnsAPI.list(params)
      setReturns(r.data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    skuAPI.list().then(r => setSkus(r.data))
    customerAPI.list({ active_only: true }).then(r => setCustomers(r.data))
  }, [])

  useEffect(() => { load() }, [statusFilter])

  const handleReject = async (id) => {
    if (!confirm('Reject this return? No stock will be added.')) return
    try { await returnsAPI.reject(id); load() }
    catch (e) { alert('Error: ' + (e.response?.data?.detail || e.message)) }
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this return record?')) return
    try { await returnsAPI.delete(id); load() }
    catch (e) { alert('Error: ' + (e.response?.data?.detail || e.message)) }
  }

  const total    = returns.length
  const pending  = returns.filter(r => r.status === 'Pending').length
  const accepted = returns.filter(r => r.status === 'Accepted').length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <RotateCcw size={24} className="text-orange-500" /> Returns
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">Customer returns &amp; credit notes</p>
        </div>
        <button className="btn-primary flex items-center gap-2" onClick={() => setShowForm(!showForm)}>
          <Plus size={16} /> New Return
        </button>
      </div>

      <div className="flex gap-3 flex-wrap">
        {[
          { label: 'Total',    value: total,    color: 'bg-gray-100 text-gray-700' },
          { label: 'Pending',  value: pending,  color: 'bg-yellow-100 text-yellow-700' },
          { label: 'Accepted', value: accepted, color: 'bg-green-100 text-green-700' },
        ].map(chip => (
          <div key={chip.label} className={`px-4 py-2 rounded-xl text-sm font-semibold ${chip.color}`}>
            {chip.value} {chip.label}
          </div>
        ))}
      </div>

      {showForm && (
        <CreateForm
          customers={customers}
          skus={skus}
          onCreated={() => { setShowForm(false); load() }}
          onClose={() => setShowForm(false)}
        />
      )}

      {accepting && (
        <AcceptModal
          ret={accepting}
          onDone={() => { setAccepting(null); load() }}
          onClose={() => setAccepting(null)}
        />
      )}

      <div className="card p-0 overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex gap-3 items-center flex-wrap">
          <h3 className="font-semibold text-gray-900 flex-1">All Returns</h3>
          <select className="input w-40" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="">All Status</option>
            <option>Pending</option>
            <option>Accepted</option>
            <option>Rejected</option>
          </select>
        </div>

        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="table-th">Return #</th>
              <th className="table-th">Store / Customer</th>
              <th className="table-th">Date</th>
              <th className="table-th">Reason</th>
              <th className="table-th text-center">Items</th>
              <th className="table-th text-center">Cases</th>
              <th className="table-th">Status</th>
              <th className="table-th">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="table-td text-center text-gray-400 py-8">Loading…</td></tr>
            ) : returns.length === 0 ? (
              <tr><td colSpan={8} className="table-td text-center text-gray-400 py-8">No returns yet</td></tr>
            ) : returns.map(ret => (
              <React.Fragment key={ret.id}>
                <tr className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="table-td font-mono text-xs text-orange-700 font-medium">{ret.return_number}</td>
                  <td className="table-td font-medium">
                    {ret.customer_name || ret.store_name}
                    {ret.customer_name && ret.customer_name !== ret.store_name && (
                      <span className="block text-xs text-gray-400">{ret.store_name}</span>
                    )}
                  </td>
                  <td className="table-td text-gray-500 text-sm">{ret.return_date}</td>
                  <td className="table-td">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-orange-50 text-orange-700 font-medium">{ret.reason}</span>
                  </td>
                  <td className="table-td text-center">{ret.item_count}</td>
                  <td className="table-td text-center font-medium">{ret.total_cases}</td>
                  <td className="table-td">{statusBadge(ret.status)}</td>
                  <td className="table-td">
                    <div className="flex gap-2 items-center flex-wrap">
                      <button
                        className="btn-secondary text-xs py-1 px-2 flex items-center gap-1"
                        onClick={() => setExpanded(expanded === ret.id ? null : ret.id)}
                      >
                        {expanded === ret.id ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                        Items
                      </button>
                      {ret.status === 'Pending' && (
                        <React.Fragment>
                          <button
                            className="btn-success text-xs py-1 px-2 flex items-center gap-1"
                            onClick={() => setAccepting(ret)}
                          >
                            <CheckCircle size={13} /> Accept
                          </button>
                          <button
                            className="text-xs py-1 px-2 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 flex items-center gap-1"
                            onClick={() => handleReject(ret.id)}
                          >
                            <XCircle size={13} /> Reject
                          </button>
                        </React.Fragment>
                      )}
                      {ret.status === 'Rejected' && (
                        <button
                          className="text-xs py-1 px-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 flex items-center gap-1"
                          onClick={() => handleDelete(ret.id)}
                        >
                          <Trash2 size={13} /> Delete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
                {expanded === ret.id && (
                  <tr className="bg-orange-50/50">
                    <td colSpan={8} className="px-6 py-3">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-xs text-gray-500 uppercase tracking-wide">
                            <th className="text-left pb-2 pr-4">Product</th>
                            <th className="text-center pb-2 pr-4">Condition</th>
                            <th className="text-center pb-2 pr-4">Returned</th>
                            <th className="text-center pb-2">Accepted</th>
                          </tr>
                        </thead>
                        <tbody>
                          {ret.items.map((it, i) => (
                            <tr key={i} className="border-t border-orange-100">
                              <td className="py-1.5 pr-4">
                                <span className="font-medium">{it.product_name}</span>
                                <span className="text-xs text-gray-400 ml-2">{it.sku_code}</span>
                              </td>
                              <td className="py-1.5 pr-4 text-center">{conditionBadge(it.condition)}</td>
                              <td className="py-1.5 pr-4 text-center font-medium">{it.cases_returned}</td>
                              <td className="py-1.5 text-center">
                                {ret.status === 'Accepted'
                                  ? <span className="font-medium text-green-700">{it.cases_accepted}</span>
                                  : <span className="text-gray-400">—</span>
                                }
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {ret.notes && (
                        <p className="text-xs text-gray-500 mt-2 italic">Notes: {ret.notes}</p>
                      )}
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
