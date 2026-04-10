import { useState, useEffect } from 'react'
import { customerAPI, portalAPI } from '../api/client'
import {
  Plus, Search, Pencil, Trash2, X, ChevronRight,
  Phone, Mail, MapPin, User, ShoppingCart, ChevronDown, ChevronUp,
  Globe, KeyRound, CheckCircle, AlertTriangle, Lock, DollarSign
} from 'lucide-react'

const fmtMoney = (n) => n != null ? `$${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'

// ── Portal Access Modal ────────────────────────────────────────
function PortalAccessModal({ customer, onClose, onSaved }) {
  const enabled = customer.portal_enabled
  const [password, setPassword] = useState('')
  const [saving,   setSaving]   = useState(false)
  const [err,      setErr]      = useState('')

  async function handleEnable(e) {
    e.preventDefault()
    if (!password) { setErr('Enter a password for the portal'); return }
    if (!customer.email) { setErr('Customer must have an email address'); return }
    setSaving(true)
    try {
      await portalAPI.setAccess(customer.id, { enabled: true, password })
      onSaved()
    } catch (ex) {
      setErr(ex?.response?.data?.detail || 'Failed to set portal access')
    } finally { setSaving(false) }
  }

  async function handleDisable() {
    if (!window.confirm(`Disable portal access for "${customer.name}"?`)) return
    setSaving(true)
    try {
      await portalAPI.setAccess(customer.id, { enabled: false, password: null })
      onSaved()
    } catch { setErr('Failed') } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Globe size={18} className="text-indigo-600" /> Portal Access
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><X size={18} /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div>
            <p className="font-medium text-gray-900">{customer.name}</p>
            <p className="text-sm text-gray-500">{customer.email || <span className="text-red-500">No email set — required for portal login</span>}</p>
          </div>

          {enabled ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 bg-green-50 border border-green-200 text-green-700 rounded-lg px-4 py-3 text-sm">
                <CheckCircle size={16} /> Portal access is active. Customer can log in at <strong>/portal/login</strong>.
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Reset password (optional)</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="New password…"
                />
              </div>
              {err && <p className="text-sm text-red-600">{err}</p>}
              <div className="flex gap-2 justify-end">
                <button
                  onClick={handleDisable}
                  disabled={saving}
                  className="px-4 py-2 rounded-lg border border-red-300 text-red-600 text-sm hover:bg-red-50 disabled:opacity-50"
                >
                  Disable Access
                </button>
                {password && (
                  <button
                    onClick={handleEnable}
                    disabled={saving}
                    className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {saving ? 'Saving…' : 'Reset Password'}
                  </button>
                )}
              </div>
            </div>
          ) : (
            <form onSubmit={handleEnable} className="space-y-4">
              <p className="text-sm text-gray-600">
                Set a password to give this customer access to the self-service order portal at <strong>/portal/login</strong>.
              </p>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Portal Password *</label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Set a password for this customer…"
                />
              </div>
              {err && <p className="text-sm text-red-600">{err}</p>}
              <div className="flex gap-2 justify-end">
                <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-gray-300 text-sm hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1.5">
                  <KeyRound size={14} /> {saving ? 'Enabling…' : 'Enable Portal Access'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Modal ─────────────────────────────────────────────────────
const BLANK = {
  name: '', contact_person: '', phone: '', email: '',
  address: '', delivery_address: '', notes: '', is_active: true,
  credit_limit: '', payment_terms: '', credit_hold: false,
  discount_pct: 0,
}

function CustomerModal({ customer, onClose, onSaved }) {
  const [form, setForm] = useState(customer ? {
    ...BLANK, ...customer,
    credit_limit: customer.credit_limit ?? '',
    payment_terms: customer.payment_terms ?? '',
    discount_pct: customer.discount_pct ?? 0,
  } : { ...BLANK })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.name.trim()) { setErr('Customer name is required'); return }
    setSaving(true)
    try {
      if (customer) {
        await customerAPI.update(customer.id, form)
      } else {
        await customerAPI.create(form)
      }
      onSaved()
    } catch (e) {
      setErr(e?.response?.data?.detail || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-bold text-gray-900">
            {customer ? 'Edit Customer' : 'New Customer'}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {err && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{err}</p>}

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Customer / Store Name *</label>
            <input
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={form.name}
              onChange={e => set('name', e.target.value)}
              placeholder="e.g. Metro Supermarket"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Contact Person</label>
              <input
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.contact_person || ''}
                onChange={e => set('contact_person', e.target.value)}
                placeholder="John Smith"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Phone</label>
              <input
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.phone || ''}
                onChange={e => set('phone', e.target.value)}
                placeholder="+1 555 000 0000"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Email</label>
            <input
              type="email"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={form.email || ''}
              onChange={e => set('email', e.target.value)}
              placeholder="orders@store.com"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Billing Address</label>
            <textarea
              rows={2}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              value={form.address || ''}
              onChange={e => set('address', e.target.value)}
              placeholder="123 Main St, City, State, ZIP"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Delivery Address</label>
            <textarea
              rows={2}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              value={form.delivery_address || ''}
              onChange={e => set('delivery_address', e.target.value)}
              placeholder="If different from billing address"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Notes</label>
            <textarea
              rows={2}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              value={form.notes || ''}
              onChange={e => set('notes', e.target.value)}
              placeholder="Delivery preferences, special instructions…"
            />
          </div>

          {/* Credit management */}
          <div className="border-t pt-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Credit Settings</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Credit Limit ($)</label>
                <input
                  type="number"
                  min="0"
                  step="100"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={form.credit_limit}
                  onChange={e => set('credit_limit', e.target.value === '' ? null : parseFloat(e.target.value))}
                  placeholder="Unlimited"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Default Payment Terms</label>
                <select
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={form.payment_terms || ''}
                  onChange={e => set('payment_terms', e.target.value || null)}
                >
                  <option value="">None</option>
                  <option>Due on Receipt</option>
                  <option>Net 7</option>
                  <option>Net 14</option>
                  <option>Net 30</option>
                  <option>Net 45</option>
                  <option>Net 60</option>
                </select>
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-red-700 cursor-pointer mt-3">
              <input
                type="checkbox"
                checked={form.credit_hold || false}
                onChange={e => set('credit_hold', e.target.checked)}
                className="rounded accent-red-600"
              />
              <Lock size={13} className="text-red-500" /> Credit hold — block all new order dispatches
            </label>
          </div>

          {/* Pricing / Discount */}
          <div className="border-t pt-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Pricing</p>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">
                Default Invoice Discount %
                <span className="font-normal text-gray-400 ml-1">(applied to all line items; individual lines can be excluded)</span>
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.5"
                  className="w-32 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={form.discount_pct}
                  onChange={e => set('discount_pct', parseFloat(e.target.value) || 0)}
                />
                <span className="text-sm text-gray-500">%</span>
                {form.discount_pct > 0 && (
                  <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-semibold">
                    {form.discount_pct}% off all items
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-400 mt-1">
                When creating an invoice for this customer, each line item will default to this discount. You can override or exclude specific lines.
              </p>
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={e => set('is_active', e.target.checked)}
              className="rounded"
            />
            Active customer
          </label>
        </form>

        <div className="flex justify-end gap-3 px-6 py-4 border-t bg-gray-50 rounded-b-2xl">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-200">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="px-5 py-2 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {saving ? 'Saving…' : customer ? 'Save Changes' : 'Create Customer'}
          </button>
        </div>
      </div>
    </div>
  )
}


// ── Order History drawer ───────────────────────────────────────
function OrderHistory({ customerId, onClose }) {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    customerAPI.orders(customerId)
      .then(r => setOrders(r.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [customerId])

  const statusColor = (s) => {
    if (s === 'Dispatched') return 'bg-green-100 text-green-700'
    if (s === 'Pending')    return 'bg-yellow-100 text-yellow-700'
    return 'bg-gray-100 text-gray-600'
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/30">
      <div className="bg-white h-full w-full max-w-sm shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h3 className="font-bold text-gray-900">Order History</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto divide-y">
          {loading ? (
            <div className="py-12 text-center text-gray-400 text-sm">Loading…</div>
          ) : orders.length === 0 ? (
            <div className="py-12 text-center text-gray-400 text-sm">No orders yet</div>
          ) : orders.map(o => (
            <div key={o.id} className="px-5 py-3">
              <div className="flex items-center justify-between">
                <span className="font-mono text-sm font-semibold text-gray-800">{o.order_number}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor(o.status)}`}>
                  {o.status}
                </span>
              </div>
              <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                <span>{o.order_date}</span>
                <span>{o.items} line{o.items !== 1 ? 's' : ''}</span>
                {o.dispatch_date && <span>Dispatched {o.dispatch_date}</span>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}


// ── Main page ─────────────────────────────────────────────────
export default function Customers() {
  const [customers,   setCustomers]   = useState([])
  const [loading,     setLoading]     = useState(true)
  const [search,      setSearch]      = useState('')
  const [modal,       setModal]       = useState(null)   // null | 'new' | customer obj
  const [history,     setHistory]     = useState(null)   // customer id
  const [portalModal, setPortalModal] = useState(null)   // customer obj

  const load = () => {
    if (!customers.length) setLoading(true)
    customerAPI.list()
      .then(r => setCustomers(r.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const filtered = customers.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.contact_person || '').toLowerCase().includes(search.toLowerCase()) ||
    (c.email || '').toLowerCase().includes(search.toLowerCase()) ||
    (c.phone || '').includes(search)
  )

  async function handleDelete(c) {
    if (!window.confirm(`Deactivate "${c.name}"?`)) return
    await customerAPI.delete(c.id)
    load()
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Customers</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage store accounts and order history</p>
        </div>
        <button
          onClick={() => setModal('new')}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold"
        >
          <Plus size={16} /> New Customer
        </button>
      </div>

      {/* Search */}
      <div className="bg-white rounded-xl border border-gray-200 px-4 py-2.5 flex items-center gap-2 shadow-sm">
        <Search size={16} className="text-gray-400 flex-shrink-0" />
        <input
          className="flex-1 text-sm outline-none placeholder-gray-400"
          placeholder="Search by name, contact, email or phone…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        {search && (
          <button onClick={() => setSearch('')} className="text-gray-400 hover:text-gray-600">
            <X size={14} />
          </button>
        )}
      </div>

      {/* Summary chips */}
      <div className="flex gap-3 flex-wrap text-sm">
        <div className="bg-white border border-gray-200 rounded-lg px-4 py-2 shadow-sm">
          <span className="font-bold text-gray-900">{customers.length}</span>
          <span className="text-gray-500 ml-1">total</span>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg px-4 py-2 shadow-sm">
          <span className="font-bold text-green-600">{customers.filter(c => c.is_active).length}</span>
          <span className="text-gray-500 ml-1">active</span>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-gray-400">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-gray-400">
            <User size={36} className="mx-auto mb-3 opacity-40" />
            <p className="font-medium">{search ? 'No customers match your search' : 'No customers yet'}</p>
            {!search && (
              <button onClick={() => setModal('new')} className="mt-3 text-blue-600 text-sm font-medium hover:underline">
                Add your first customer →
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Customer</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Contact</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Outstanding</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Limit</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Orders</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map(c => (
                  <tr key={c.id} className={`hover:bg-gray-50 transition-colors ${c.credit_hold ? 'bg-red-50/30' : ''}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="font-semibold text-gray-900">{c.name}</p>
                        {c.credit_hold && (
                          <span className="inline-flex items-center gap-0.5 text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full font-semibold">
                            <Lock size={9} /> Hold
                          </span>
                        )}
                        {c.discount_pct > 0 && (
                          <span className="inline-flex items-center gap-0.5 text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-semibold">
                            {c.discount_pct}% disc
                          </span>
                        )}
                      </div>
                      {c.payment_terms && <p className="text-xs text-gray-400 mt-0.5">{c.payment_terms}</p>}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {c.contact_person && (
                        <div className="flex items-center gap-1.5 text-xs">
                          <User size={11} className="text-gray-400" /> {c.contact_person}
                        </div>
                      )}
                      {c.phone && (
                        <div className="flex items-center gap-1.5 text-xs mt-0.5">
                          <Phone size={11} className="text-gray-400" /> {c.phone}
                        </div>
                      )}
                      {c.email && (
                        <div className="flex items-center gap-1.5 text-xs mt-0.5">
                          <Mail size={11} className="text-gray-400" /> {c.email}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {c.outstanding_balance > 0 ? (
                        <span className={`text-xs font-semibold ${
                          c.credit_limit && c.outstanding_balance >= c.credit_limit
                            ? 'text-red-600' : 'text-orange-600'
                        }`}>
                          {fmtMoney(c.outstanding_balance)}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-gray-500">
                      {c.credit_limit ? fmtMoney(c.credit_limit) : <span className="text-gray-300">Unlimited</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => setHistory(c.id)}
                        className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 text-xs font-medium"
                      >
                        <ShoppingCart size={13} />
                        {c.order_count}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                        c.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                      }`}>
                        {c.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={async () => { await customerAPI.toggleHold(c.id); load() }}
                          className={`p-1.5 rounded-lg ${c.credit_hold ? 'text-red-600 bg-red-50 hover:bg-red-100' : 'text-gray-400 hover:bg-red-50 hover:text-red-600'}`}
                          title={c.credit_hold ? 'Remove credit hold' : 'Place on credit hold'}
                        >
                          <Lock size={14} />
                        </button>
                        <button
                          onClick={() => setPortalModal(c)}
                          className={`p-1.5 rounded-lg hover:bg-indigo-50 ${c.portal_enabled ? 'text-indigo-600' : 'text-gray-400 hover:text-indigo-600'}`}
                          title={c.portal_enabled ? 'Portal access active' : 'Enable portal access'}
                        >
                          <Globe size={15} />
                        </button>
                        <button
                          onClick={() => setModal(c)}
                          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-blue-600"
                          title="Edit"
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          onClick={() => handleDelete(c)}
                          className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600"
                          title="Deactivate"
                        >
                          <Trash2 size={15} />
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

      {/* Modals */}
      {modal && (
        <CustomerModal
          customer={modal === 'new' ? null : modal}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); load() }}
        />
      )}
      {history && (
        <OrderHistory customerId={history} onClose={() => setHistory(null)} />
      )}
      {portalModal && (
        <PortalAccessModal
          customer={portalModal}
          onClose={() => setPortalModal(null)}
          onSaved={() => { setPortalModal(null); load() }}
        />
      )}
    </div>
  )
}
