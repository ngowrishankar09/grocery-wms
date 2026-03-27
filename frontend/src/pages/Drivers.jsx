import { useState, useEffect, useCallback } from 'react'
import {
  UserCircle2, Truck, Plus, Edit2, Trash2, Play, CheckCircle2,
  ChevronDown, ChevronRight, MapPin, Phone, Mail, Car,
  X, Save, AlertCircle, Package, Wand2
} from 'lucide-react'
import { driverAPI, deliveryRunAPI, orderAPI } from '../api/client'

// ── Status badge helpers ──────────────────────────────────────
const DRIVER_STATUS = {
  'Available':  { bg: 'bg-green-100',  text: 'text-green-700',  dot: 'bg-green-500'  },
  'On Route':   { bg: 'bg-blue-100',   text: 'text-blue-700',   dot: 'bg-blue-500'   },
  'Off Duty':   { bg: 'bg-gray-100',   text: 'text-gray-600',   dot: 'bg-gray-400'   },
}
const RUN_STATUS = {
  'Planned':     { bg: 'bg-yellow-100', text: 'text-yellow-700' },
  'In Progress': { bg: 'bg-blue-100',   text: 'text-blue-700'   },
  'Completed':   { bg: 'bg-green-100',  text: 'text-green-700'  },
  'Cancelled':   { bg: 'bg-gray-100',   text: 'text-gray-500'   },
}
const STOP_STATUS = {
  'Pending':   { bg: 'bg-yellow-50',  text: 'text-yellow-700', dot: 'bg-yellow-400' },
  'Delivered': { bg: 'bg-green-50',   text: 'text-green-700',  dot: 'bg-green-500'  },
  'Failed':    { bg: 'bg-red-50',     text: 'text-red-700',    dot: 'bg-red-500'    },
  'Skipped':   { bg: 'bg-gray-50',    text: 'text-gray-500',   dot: 'bg-gray-400'   },
}

function Badge({ label, map }) {
  const s = map[label] || { bg: 'bg-gray-100', text: 'text-gray-600' }
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${s.bg} ${s.text}`}>
      {s.dot && <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />}
      {label}
    </span>
  )
}

// ── Driver Form Modal ─────────────────────────────────────────
function DriverModal({ initial, onClose, onSave }) {
  const [form, setForm] = useState({
    name: '', phone: '', email: '', vehicle_type: '', license_plate: '',
    status: 'Available', notes: '',
    ...(initial || {})
  })
  const [saving, setSaving] = useState(false)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      if (initial?.id) await driverAPI.update(initial.id, form)
      else await driverAPI.create(form)
      onSave()
    } catch {}
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="font-bold text-gray-900">{initial?.id ? 'Edit Driver' : 'Add Driver'}</h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-700 rounded-lg">
            <X size={18} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
            <input value={form.name} onChange={e => set('name', e.target.value)} required
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
              <input value={form.phone || ''} onChange={e => set('phone', e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input type="email" value={form.email || ''} onChange={e => set('email', e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Vehicle Type</label>
              <select value={form.vehicle_type || ''} onChange={e => set('vehicle_type', e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">Select...</option>
                {['Van', 'Truck', 'Car', 'Bike', 'Refrigerated Van', 'Refrigerated Truck'].map(v =>
                  <option key={v} value={v}>{v}</option>
                )}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">License Plate</label>
              <input value={form.license_plate || ''} onChange={e => set('license_plate', e.target.value)}
                placeholder="ABC-1234"
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select value={form.status} onChange={e => set('status', e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              {['Available', 'On Route', 'Off Duty'].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea value={form.notes || ''} onChange={e => set('notes', e.target.value)} rows={2}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm border rounded-lg text-gray-700 hover:bg-gray-50">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
              <Save size={15} /> {saving ? 'Saving…' : 'Save Driver'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── New Run Modal ─────────────────────────────────────────────
function RunModal({ drivers, onClose, onSave }) {
  const today = new Date().toISOString().slice(0, 10)
  const [form, setForm] = useState({ driver_id: '', run_date: today, notes: '' })
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      await deliveryRunAPI.create({
        driver_id: form.driver_id ? parseInt(form.driver_id) : null,
        run_date: form.run_date,
        notes: form.notes || null,
      })
      onSave()
    } catch {}
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="font-bold text-gray-900">New Delivery Run</h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-700 rounded-lg"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Assign Driver</label>
            <select value={form.driver_id} onChange={e => setForm(f => ({ ...f, driver_id: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">Unassigned</option>
              {drivers.filter(d => d.status !== 'Off Duty').map(d =>
                <option key={d.id} value={d.id}>{d.name} ({d.status})</option>
              )}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Run Date *</label>
            <input type="date" value={form.run_date} onChange={e => setForm(f => ({ ...f, run_date: e.target.value }))} required
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm border rounded-lg text-gray-700 hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={saving}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
              <Plus size={15} /> {saving ? 'Creating…' : 'Create Run'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Add Stop Modal ────────────────────────────────────────────
function AddStopModal({ runId, onClose, onSave }) {
  const [orders, setOrders] = useState([])
  const [form, setForm] = useState({ order_id: '', customer_name: '', address: '', delivery_notes: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    orderAPI.list({ status: 'Dispatched' }).then(r => setOrders(r.data || [])).catch(() => {})
  }, [])

  const handleOrderChange = (orderId) => {
    const o = orders.find(x => String(x.id) === String(orderId))
    setForm(f => ({
      ...f,
      order_id: orderId,
      customer_name: o ? (o.store_name || o.customer_name || '') : f.customer_name,
      address: o ? (o.delivery_address || '') : f.address,
    }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      await deliveryRunAPI.addStop(runId, {
        order_id: form.order_id ? parseInt(form.order_id) : null,
        customer_name: form.customer_name,
        address: form.address || null,
        delivery_notes: form.delivery_notes || null,
      })
      onSave()
    } catch {}
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="font-bold text-gray-900">Add Delivery Stop</h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-700 rounded-lg"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Link to Order (optional)</label>
            <select value={form.order_id} onChange={e => handleOrderChange(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">Manual stop (no order)</option>
              {orders.map(o =>
                <option key={o.id} value={o.id}>#{o.id} – {o.store_name || o.customer_name}</option>
              )}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Customer / Store Name *</label>
            <input value={form.customer_name} onChange={e => setForm(f => ({ ...f, customer_name: e.target.value }))} required
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Delivery Address</label>
            <textarea value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} rows={2}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <input value={form.delivery_notes} onChange={e => setForm(f => ({ ...f, delivery_notes: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm border rounded-lg text-gray-700 hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={saving}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
              <Plus size={15} /> {saving ? 'Adding…' : 'Add Stop'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Drivers Tab ───────────────────────────────────────────────
function DriversTab({ drivers, onRefresh }) {
  const [modal, setModal] = useState(null) // null | 'add' | driver obj

  const handleDelete = async (id) => {
    if (!confirm('Remove this driver?')) return
    await driverAPI.delete(id)
    onRefresh()
  }

  const available = drivers.filter(d => d.status === 'Available').length
  const onRoute   = drivers.filter(d => d.status === 'On Route').length
  const offDuty   = drivers.filter(d => d.status === 'Off Duty').length

  return (
    <div>
      {/* Summary chips */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Total Drivers', value: drivers.length, color: 'text-gray-900' },
          { label: 'Available',     value: available,       color: 'text-green-700' },
          { label: 'On Route',      value: onRoute,         color: 'text-blue-700'  },
          { label: 'Off Duty',      value: offDuty,         color: 'text-gray-500'  },
        ].map(c => (
          <div key={c.label} className="bg-white border rounded-xl p-4 text-center shadow-sm">
            <div className={`text-2xl font-bold ${c.color}`}>{c.value}</div>
            <div className="text-xs text-gray-500 mt-0.5">{c.label}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h3 className="font-semibold text-gray-800">Driver Roster</h3>
          <button onClick={() => setModal('add')}
            className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">
            <Plus size={15} /> Add Driver
          </button>
        </div>
        {drivers.length === 0 ? (
          <div className="py-12 text-center text-gray-400">
            <UserCircle2 size={36} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm">No drivers yet. Add your first driver.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 uppercase tracking-wide border-b bg-gray-50">
                  <th className="px-4 py-2.5 text-left">Driver</th>
                  <th className="px-4 py-2.5 text-left">Contact</th>
                  <th className="px-4 py-2.5 text-left">Vehicle</th>
                  <th className="px-4 py-2.5 text-left">Status</th>
                  <th className="px-4 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {drivers.map(d => (
                  <tr key={d.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-gray-900">{d.name}</div>
                      {d.notes && <div className="text-xs text-gray-400 truncate max-w-[180px]">{d.notes}</div>}
                    </td>
                    <td className="px-4 py-3">
                      {d.phone && <div className="flex items-center gap-1 text-gray-600"><Phone size={12} /> {d.phone}</div>}
                      {d.email && <div className="flex items-center gap-1 text-gray-400 text-xs"><Mail size={12} /> {d.email}</div>}
                    </td>
                    <td className="px-4 py-3">
                      {d.vehicle_type && (
                        <div className="flex items-center gap-1 text-gray-700"><Car size={13} /> {d.vehicle_type}</div>
                      )}
                      {d.license_plate && (
                        <div className="text-xs text-gray-400 font-mono">{d.license_plate}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge label={d.status} map={DRIVER_STATUS} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => setModal(d)}
                          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg">
                          <Edit2 size={14} />
                        </button>
                        <button onClick={() => handleDelete(d.id)}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal && (
        <DriverModal
          initial={modal === 'add' ? null : modal}
          onClose={() => setModal(null)}
          onSave={() => { setModal(null); onRefresh() }}
        />
      )}
    </div>
  )
}

// ── Delivery Stop Row ─────────────────────────────────────────
function StopRow({ stop, runId, onRefresh }) {
  const [updating, setUpdating] = useState(false)

  const setStatus = async (status) => {
    setUpdating(true)
    try {
      await deliveryRunAPI.updateStop(runId, stop.id, { status })
      onRefresh()
    } catch {}
    setUpdating(false)
  }

  const s = STOP_STATUS[stop.status] || STOP_STATUS['Pending']
  return (
    <div className={`flex items-center gap-3 px-4 py-2.5 ${s.bg} rounded-lg`}>
      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${s.dot}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm text-gray-800">{stop.sequence_order}. {stop.customer_name}</span>
          {stop.order_id && (
            <span className="text-xs text-gray-400 bg-white px-1.5 py-0.5 rounded">Order #{stop.order_id}</span>
          )}
        </div>
        {stop.address && (
          <div className="flex items-center gap-1 text-xs text-gray-500 mt-0.5">
            <MapPin size={11} /> {stop.address}
          </div>
        )}
        {stop.delivery_notes && (
          <div className="text-xs text-gray-400 mt-0.5">{stop.delivery_notes}</div>
        )}
        {stop.delivered_at && (
          <div className="text-xs text-green-600 mt-0.5">
            Delivered {new Date(stop.delivered_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
        )}
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        <Badge label={stop.status} map={STOP_STATUS} />
        {stop.status === 'Pending' && (
          <>
            <button onClick={() => setStatus('Delivered')} disabled={updating}
              className="ml-2 px-2 py-1 text-xs bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50">
              ✓ Done
            </button>
            <button onClick={() => setStatus('Failed')} disabled={updating}
              className="px-2 py-1 text-xs bg-red-100 text-red-700 rounded-md hover:bg-red-200 disabled:opacity-50">
              ✗ Failed
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ── Run Card ──────────────────────────────────────────────────
function RunCard({ run, drivers, onRefresh }) {
  const [expanded, setExpanded] = useState(false)
  const [addStop, setAddStop] = useState(false)
  const [acting, setActing] = useState(false)
  const [optimizing, setOptimizing] = useState(false)
  const [optimizeMsg, setOptimizeMsg] = useState(null)

  const progress = run.total_stops > 0
    ? Math.round((run.delivered / run.total_stops) * 100)
    : 0

  const handleStart = async () => {
    setActing(true)
    try { await deliveryRunAPI.start(run.id); onRefresh() } catch {}
    setActing(false)
  }
  const handleComplete = async () => {
    setActing(true)
    try { await deliveryRunAPI.complete(run.id); onRefresh() } catch {}
    setActing(false)
  }
  const handleDelete = async () => {
    if (!confirm('Delete this run?')) return
    await deliveryRunAPI.delete(run.id)
    onRefresh()
  }
  const handleDeleteStop = async (stopId) => {
    await deliveryRunAPI.deleteStop(run.id, stopId)
    onRefresh()
  }
  const handleOptimize = async () => {
    setOptimizing(true)
    setOptimizeMsg(null)
    try {
      const r = await deliveryRunAPI.optimize(run.id)
      setOptimizeMsg(`Route optimized — ${r.data.stops?.length || 0} stops reordered`)
      onRefresh()
      setTimeout(() => setOptimizeMsg(null), 4000)
    } catch (e) {
      setOptimizeMsg('Optimization failed: ' + (e.response?.data?.detail || e.message))
    }
    setOptimizing(false)
  }

  const rs = RUN_STATUS[run.status] || RUN_STATUS['Planned']

  return (
    <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 select-none"
        onClick={() => setExpanded(e => !e)}
      >
        {expanded ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronRight size={16} className="text-gray-400" />}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-gray-900 text-sm">{run.run_number}</span>
            <Badge label={run.status} map={RUN_STATUS} />
            <span className="text-xs text-gray-400">{run.run_date}</span>
          </div>
          <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500">
            {run.driver_name ? (
              <span className="flex items-center gap-1"><UserCircle2 size={12} /> {run.driver_name}</span>
            ) : (
              <span className="text-gray-300">Unassigned</span>
            )}
            <span className="flex items-center gap-1">
              <Package size={12} />
              {run.delivered}/{run.total_stops} delivered
              {run.failed > 0 && <span className="text-red-500 ml-1">{run.failed} failed</span>}
            </span>
          </div>
        </div>

        {/* Progress bar */}
        {run.total_stops > 0 && (
          <div className="hidden sm:flex items-center gap-2 flex-shrink-0">
            <div className="w-24 h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${progress}%` }} />
            </div>
            <span className="text-xs text-gray-500">{progress}%</span>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex items-center gap-1 ml-2" onClick={e => e.stopPropagation()}>
          {run.total_stops > 1 && run.status !== 'Completed' && (
            <button
              onClick={handleOptimize}
              disabled={optimizing}
              title="Auto-sort stops by shortest route"
              className="flex items-center gap-1 px-2.5 py-1 text-xs bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 disabled:opacity-50"
            >
              <Wand2 size={11} /> {optimizing ? 'Optimizing…' : 'Optimize'}
            </button>
          )}
          {run.status === 'Planned' && (
            <button onClick={handleStart} disabled={acting}
              className="flex items-center gap-1 px-2.5 py-1 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
              <Play size={11} /> Start
            </button>
          )}
          {run.status === 'In Progress' && (
            <button onClick={handleComplete} disabled={acting}
              className="flex items-center gap-1 px-2.5 py-1 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50">
              <CheckCircle2 size={11} /> Complete
            </button>
          )}
          <button onClick={handleDelete}
            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg">
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {/* Progress bar mobile */}
      {run.total_stops > 0 && (
        <div className="h-1 bg-gray-100">
          <div className="h-full bg-green-500 transition-all" style={{ width: `${progress}%` }} />
        </div>
      )}

      {/* Expanded stops */}
      {expanded && (
        <div className="px-4 pb-4 pt-2 border-t bg-gray-50 space-y-2">
          {optimizeMsg && (
            <div className="text-xs bg-purple-50 border border-purple-200 text-purple-700 rounded-lg px-3 py-2 flex items-center gap-2">
              <Wand2 size={12} /> {optimizeMsg}
            </div>
          )}
          {run.notes && (
            <p className="text-xs text-gray-500 italic mb-2">{run.notes}</p>
          )}
          {run.stops.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-3">No stops yet. Add delivery stops below.</p>
          ) : (
            run.stops.map(stop => (
              <div key={stop.id} className="relative group">
                <StopRow stop={stop} runId={run.id} onRefresh={onRefresh} />
                <button
                  onClick={() => handleDeleteStop(stop.id)}
                  className="absolute top-2 right-2 p-1 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X size={12} />
                </button>
              </div>
            ))
          )}
          <button
            onClick={() => setAddStop(true)}
            className="w-full mt-1 py-2 border-2 border-dashed border-gray-300 rounded-lg text-xs text-gray-400 hover:border-blue-400 hover:text-blue-500 flex items-center justify-center gap-2"
          >
            <Plus size={13} /> Add Stop
          </button>
        </div>
      )}

      {addStop && (
        <AddStopModal
          runId={run.id}
          onClose={() => setAddStop(false)}
          onSave={() => { setAddStop(false); onRefresh() }}
        />
      )}
    </div>
  )
}

// ── Delivery Runs Tab ─────────────────────────────────────────
function RunsTab({ drivers, onRefresh }) {
  const [runs, setRuns] = useState([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [filterDate, setFilterDate] = useState(new Date().toISOString().slice(0, 10))

  const loadRuns = useCallback(async () => {
    if (!runs.length) setLoading(true)
    try {
      const params = filterDate ? { run_date: filterDate } : {}
      const r = await deliveryRunAPI.list(params)
      setRuns(r.data || [])
    } catch {}
    setLoading(false)
  }, [filterDate])

  useEffect(() => { loadRuns() }, [loadRuns])

  const totalStops   = runs.reduce((a, r) => a + r.total_stops, 0)
  const totalDone    = runs.reduce((a, r) => a + r.delivered,   0)
  const totalFailed  = runs.reduce((a, r) => a + r.failed,      0)
  const totalPending = runs.reduce((a, r) => a + r.pending,     0)

  return (
    <div>
      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Runs Today',  value: runs.length,   color: 'text-gray-900'  },
          { label: 'Stops Done',  value: totalDone,     color: 'text-green-700' },
          { label: 'Pending',     value: totalPending,  color: 'text-yellow-700'},
          { label: 'Failed',      value: totalFailed,   color: 'text-red-600'   },
        ].map(c => (
          <div key={c.label} className="bg-white border rounded-xl p-4 text-center shadow-sm">
            <div className={`text-2xl font-bold ${c.color}`}>{c.value}</div>
            <div className="text-xs text-gray-500 mt-0.5">{c.label}</div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600">Date:</label>
          <input type="date" value={filterDate}
            onChange={e => setFilterDate(e.target.value)}
            className="border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button onClick={() => setFilterDate('')}
            className="text-xs text-gray-400 hover:text-gray-600 underline">All dates</button>
        </div>
        <button onClick={() => setShowNew(true)}
          className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">
          <Plus size={15} /> New Run
        </button>
      </div>

      {/* Run cards */}
      {loading ? (
        <div className="text-center py-10 text-gray-400 text-sm">Loading…</div>
      ) : runs.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <Truck size={36} className="mx-auto mb-2 opacity-30" />
          <p className="text-sm">No delivery runs{filterDate ? ` on ${filterDate}` : ''}. Create one to get started.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {runs.map(run => (
            <RunCard key={run.id} run={run} drivers={drivers} onRefresh={loadRuns} />
          ))}
        </div>
      )}

      {showNew && (
        <RunModal
          drivers={drivers}
          onClose={() => setShowNew(false)}
          onSave={() => { setShowNew(false); loadRuns() }}
        />
      )}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────
export default function Drivers() {
  const [tab, setTab]         = useState('drivers')
  const [drivers, setDrivers] = useState([])

  const loadDrivers = useCallback(async () => {
    try {
      const r = await driverAPI.list()
      setDrivers(r.data || [])
    } catch {}
  }, [])

  useEffect(() => { loadDrivers() }, [loadDrivers])

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Truck size={24} className="text-blue-600" /> Driver & Delivery Management
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage drivers, delivery runs, and stop tracking</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {[
          { id: 'drivers', label: 'Drivers', icon: UserCircle2 },
          { id: 'runs',    label: 'Delivery Runs', icon: Truck },
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === id
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'drivers' && <DriversTab drivers={drivers} onRefresh={loadDrivers} />}
      {tab === 'runs'    && <RunsTab    drivers={drivers} onRefresh={loadDrivers} />}
    </div>
  )
}
