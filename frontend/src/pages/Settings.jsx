import { useEffect, useState } from 'react'
import { settingsAPI, vendorAPI, emailAPI } from '../api/client'
import { useT } from '../i18n/translations'
import { printInvoice, DUMMY_INVOICE, DUMMY_COMPANY } from '../utils/invoiceTemplates'
import {
  Warehouse, Users, Tag, Building2, FileText,
  Plus, Trash2, Edit2, Check, X, AlertTriangle, Star, Save, Mail, Send, Globe, Eye
} from 'lucide-react'

// ── Confirm Delete Dialog ──────────────────────────────────────
function ConfirmDialog({ message, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-red-100 rounded-xl">
            <AlertTriangle className="text-red-600" size={22} />
          </div>
          <h3 className="font-bold text-gray-900">Confirm Delete</h3>
        </div>
        <p className="text-sm text-gray-600">{message}</p>
        <div className="flex gap-3">
          <button className="btn-danger flex-1" onClick={onConfirm}>Yes, Delete</button>
          <button className="btn-secondary flex-1" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

// ── Section header ─────────────────────────────────────────────
function SectionHeader({ icon: Icon, title, color, children }) {
  return (
    <div className="card">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-xl ${color}`}>
            <Icon size={20} className="text-white" />
          </div>
          <h3 className="text-lg font-bold text-gray-900">{title}</h3>
        </div>
      </div>
      {children}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// WAREHOUSE MANAGEMENT
// ══════════════════════════════════════════════════════════════
function WarehouseSection() {
  const [warehouses, setWarehouses] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState(null)
  const [confirm, setConfirm] = useState(null)
  const [form, setForm] = useState({ code: '', name: '', address: '', is_primary: false })
  const [error, setError] = useState(null)

  const load = () => settingsAPI.listWarehouses().then(r => setWarehouses(r.data))
  useEffect(() => { load() }, [])

  const handleSave = async () => {
    if (!form.code || !form.name) return setError('Code and name are required')
    setError(null)
    try {
      if (editId) {
        await settingsAPI.updateWarehouse(editId, { name: form.name, address: form.address, is_primary: form.is_primary })
      } else {
        await settingsAPI.createWarehouse(form)
      }
      setShowForm(false); setEditId(null)
      setForm({ code: '', name: '', address: '', is_primary: false })
      load()
    } catch (e) {
      setError(e.response?.data?.detail || e.message)
    }
  }

  const startEdit = (wh) => {
    setForm({ code: wh.code, name: wh.name, address: wh.address || '', is_primary: wh.is_primary })
    setEditId(wh.id); setShowForm(true)
  }

  const handleDelete = async (wh) => {
    setConfirm({
      message: `Delete warehouse "${wh.name}" (${wh.code})? This cannot be undone.`,
      onConfirm: async () => {
        try {
          await settingsAPI.deleteWarehouse(wh.id)
          setConfirm(null); load()
        } catch (e) {
          alert(e.response?.data?.detail || e.message)
          setConfirm(null)
        }
      },
      onCancel: () => setConfirm(null)
    })
  }

  return (
    <SectionHeader icon={Warehouse} title="Warehouses" color="bg-blue-500">
      {confirm && <ConfirmDialog {...confirm} />}

      {showForm && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-4 space-y-3">
          <h4 className="font-semibold text-gray-800 text-sm">{editId ? 'Edit Warehouse' : 'Add New Warehouse'}</h4>
          {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">{error}</p>}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Warehouse Code * <span className="text-gray-400 font-normal">(e.g. WH3)</span></label>
              <input
                className="input font-mono uppercase"
                placeholder="WH3"
                value={form.code}
                disabled={!!editId}
                onChange={e => setForm({ ...form, code: e.target.value.toUpperCase() })}
              />
            </div>
            <div>
              <label className="label">Warehouse Name *</label>
              <input className="input" placeholder="Cold Storage" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="col-span-2">
              <label className="label">Address / Location</label>
              <input className="input" placeholder="123 Warehouse St, City" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} />
            </div>
            <div className="col-span-2">
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input type="checkbox" checked={form.is_primary} onChange={e => setForm({ ...form, is_primary: e.target.checked })} />
                <Star size={14} className="text-yellow-500" /> Set as Primary (main operations warehouse)
              </label>
            </div>
          </div>
          <div className="flex gap-2">
            <button className="btn-primary" onClick={handleSave}><Check size={14} className="inline mr-1" />Save</button>
            <button className="btn-secondary" onClick={() => { setShowForm(false); setEditId(null); setError(null) }}><X size={14} className="inline mr-1" />Cancel</button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {warehouses.map(wh => (
          <div key={wh.id} className={`flex items-center gap-4 p-4 rounded-xl border ${wh.is_active ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50 opacity-60'}`}>
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-bold text-sm ${wh.is_primary ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'}`}>
              {wh.code}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-gray-900">{wh.name}</span>
                {wh.is_primary && <span className="badge-blue flex items-center gap-1"><Star size={10} />Primary</span>}
                {!wh.is_active && <span className="badge-neutral">Inactive</span>}
              </div>
              {wh.address && <p className="text-xs text-gray-500 mt-0.5">{wh.address}</p>}
              <p className="text-xs text-gray-400 mt-0.5">{wh.skus_with_stock} SKUs with stock</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => startEdit(wh)} className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                <Edit2 size={16} />
              </button>
              {!wh.is_primary && (
                <button onClick={() => handleDelete(wh)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      <button
        className="mt-4 btn-secondary flex items-center gap-2 w-full justify-center"
        onClick={() => { setShowForm(true); setEditId(null); setForm({ code: '', name: '', address: '', is_primary: false }) }}
      >
        <Plus size={16} /> Add Warehouse
      </button>
    </SectionHeader>
  )
}

// ══════════════════════════════════════════════════════════════
// VENDOR MANAGEMENT (with delete)
// ══════════════════════════════════════════════════════════════
function VendorSection() {
  const [vendors, setVendors] = useState([])
  const [confirm, setConfirm] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState({ name: '', contact_person: '', phone: '', email: '', lead_time_days: 7, notes: '' })

  const load = () => vendorAPI.list().then(r => setVendors(r.data))
  useEffect(() => { load() }, [])

  const handleSave = async () => {
    if (!form.name) return alert('Vendor name required')
    try {
      if (editId) await vendorAPI.update(editId, form)
      else await vendorAPI.create(form)
      setShowForm(false); setEditId(null)
      setForm({ name: '', contact_person: '', phone: '', email: '', lead_time_days: 7, notes: '' })
      load()
    } catch (e) { alert(e.response?.data?.detail || e.message) }
  }

  const handleDelete = (v) => {
    setConfirm({
      message: `Delete vendor "${v.name}"? Their ${v.sku_count} SKUs will be unlinked but not deleted.`,
      onConfirm: async () => {
        try {
          await settingsAPI.deleteVendor(v.id)
          setConfirm(null); load()
        } catch (e) {
          alert(e.response?.data?.detail || e.message)
          setConfirm(null)
        }
      },
      onCancel: () => setConfirm(null)
    })
  }

  const startEdit = (v) => { setForm(v); setEditId(v.id); setShowForm(true) }

  return (
    <SectionHeader icon={Users} title="Vendors" color="bg-purple-500">
      {confirm && <ConfirmDialog {...confirm} />}

      {showForm && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-4 space-y-3">
          <h4 className="font-semibold text-sm text-gray-800">{editId ? 'Edit Vendor' : 'Add Vendor'}</h4>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Name *</label><input className="input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
            <div><label className="label">Contact Person</label><input className="input" value={form.contact_person || ''} onChange={e => setForm({ ...form, contact_person: e.target.value })} /></div>
            <div><label className="label">Phone</label><input className="input" value={form.phone || ''} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
            <div><label className="label">Email</label><input className="input" type="email" value={form.email || ''} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
            <div><label className="label">Lead Time (days)</label><input type="number" className="input" value={form.lead_time_days} onChange={e => setForm({ ...form, lead_time_days: parseInt(e.target.value) })} /></div>
            <div><label className="label">Notes</label><input className="input" value={form.notes || ''} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
          </div>
          <div className="flex gap-2">
            <button className="btn-primary" onClick={handleSave}>Save</button>
            <button className="btn-secondary" onClick={() => { setShowForm(false); setEditId(null) }}>Cancel</button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {vendors.map(v => (
          <div key={v.id} className="flex items-center gap-3 p-3 rounded-xl border border-gray-200 hover:bg-gray-50">
            <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center text-purple-700 font-bold text-sm flex-shrink-0">
              {v.name[0].toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-gray-900 text-sm">{v.name}</div>
              <div className="text-xs text-gray-500 flex gap-3 mt-0.5">
                {v.phone && <span>📞 {v.phone}</span>}
                <span>⏱ {v.lead_time_days}d lead</span>
                <span>📦 {v.sku_count} SKUs</span>
              </div>
            </div>
            <div className="flex gap-1">
              <button onClick={() => startEdit(v)} className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg"><Edit2 size={15} /></button>
              <button onClick={() => handleDelete(v)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"><Trash2 size={15} /></button>
            </div>
          </div>
        ))}
      </div>

      <button className="mt-4 btn-secondary flex items-center gap-2 w-full justify-center"
        onClick={() => { setForm({ name: '', contact_person: '', phone: '', email: '', lead_time_days: 7, notes: '' }); setEditId(null); setShowForm(true) }}>
        <Plus size={16} /> Add Vendor
      </button>
    </SectionHeader>
  )
}

// ══════════════════════════════════════════════════════════════
// CATEGORY MANAGEMENT
// ══════════════════════════════════════════════════════════════
function CategorySection() {
  const [cats, setCats] = useState([])
  const [confirm, setConfirm] = useState(null)
  const [editId, setEditId] = useState(null)
  const [editName, setEditName] = useState('')
  const [newName, setNewName] = useState('')
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState(null)

  const load = () => settingsAPI.listCategories().then(r => setCats(r.data))
  useEffect(() => { load() }, [])

  const handleAdd = async () => {
    if (!newName.trim()) return setError('Category name required')
    setError(null)
    try {
      await settingsAPI.createCategory({ name: newName.trim(), sort_order: cats.length + 1 })
      setNewName(''); setAdding(false); load()
    } catch (e) { setError(e.response?.data?.detail || e.message) }
  }

  const handleRename = async (id) => {
    if (!editName.trim()) return
    try {
      await settingsAPI.updateCategory(id, { name: editName.trim() })
      setEditId(null); load()
    } catch (e) { alert(e.response?.data?.detail || e.message) }
  }

  const handleDelete = (cat) => {
    if (cat.sku_count > 0) {
      alert(`Cannot delete "${cat.name}" — ${cat.sku_count} SKU(s) use this category. Reassign them first.`)
      return
    }
    setConfirm({
      message: `Delete category "${cat.name}"?`,
      onConfirm: async () => {
        try {
          await settingsAPI.deleteCategory(cat.id)
          setConfirm(null); load()
        } catch (e) { alert(e.response?.data?.detail || e.message); setConfirm(null) }
      },
      onCancel: () => setConfirm(null)
    })
  }

  return (
    <SectionHeader icon={Tag} title="Categories" color="bg-teal-500">
      {confirm && <ConfirmDialog {...confirm} />}

      <p className="text-sm text-gray-500 mb-4">
        Categories organise your SKUs. A category can only be deleted when no SKUs use it.
        Renaming a category automatically updates all its SKUs.
      </p>

      {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2 mb-3">{error}</p>}

      <div className="space-y-2">
        {cats.map(cat => (
          <div key={cat.id} className="flex items-center gap-3 p-3 rounded-xl border border-gray-200 hover:bg-gray-50">
            <div className="w-8 h-8 rounded-lg bg-teal-100 flex items-center justify-center flex-shrink-0">
              <Tag size={14} className="text-teal-600" />
            </div>

            {editId === cat.id ? (
              <input
                className="input flex-1 py-1 text-sm"
                value={editName}
                onChange={e => setEditName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleRename(cat.id); if (e.key === 'Escape') setEditId(null) }}
                autoFocus
              />
            ) : (
              <div className="flex-1">
                <span className="font-medium text-gray-900 text-sm">{cat.name}</span>
                <span className="ml-2 text-xs text-gray-400">{cat.sku_count} SKU{cat.sku_count !== 1 ? 's' : ''}</span>
              </div>
            )}

            <div className="flex gap-1">
              {editId === cat.id ? (
                <>
                  <button onClick={() => handleRename(cat.id)} className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg"><Check size={14} /></button>
                  <button onClick={() => setEditId(null)} className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg"><X size={14} /></button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => { setEditId(cat.id); setEditName(cat.name) }}
                    className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
                    title="Rename"
                  ><Edit2 size={14} /></button>
                  <button
                    onClick={() => handleDelete(cat)}
                    className={`p-1.5 rounded-lg transition-colors ${
                      cat.sku_count > 0
                        ? 'text-gray-200 cursor-not-allowed'
                        : 'text-gray-400 hover:text-red-600 hover:bg-red-50'
                    }`}
                    title={cat.sku_count > 0 ? `${cat.sku_count} SKUs — reassign first` : 'Delete'}
                    disabled={cat.sku_count > 0}
                  ><Trash2 size={14} /></button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Add new */}
      {adding ? (
        <div className="mt-3 flex gap-2">
          <input
            className="input flex-1 text-sm"
            placeholder="New category name…"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') { setAdding(false); setError(null) } }}
            autoFocus
          />
          <button className="btn-primary px-3" onClick={handleAdd}><Check size={15} /></button>
          <button className="btn-secondary px-3" onClick={() => { setAdding(false); setNewName(''); setError(null) }}><X size={15} /></button>
        </div>
      ) : (
        <button className="mt-4 btn-secondary flex items-center gap-2 w-full justify-center" onClick={() => setAdding(true)}>
          <Plus size={16} /> Add Category
        </button>
      )}
    </SectionHeader>
  )
}

// ══════════════════════════════════════════════════════════════
// COMPANY PROFILE
// ══════════════════════════════════════════════════════════════
function CompanySection() {
  const FIELDS = [
    { key: 'name',         label: 'Company Name',       placeholder: 'My Company Ltd' },
    { key: 'address',      label: 'Address',             placeholder: '123 Main St, City, State', multi: true },
    { key: 'phone',        label: 'Phone',               placeholder: '+1 555-000-1234' },
    { key: 'fax',          label: 'Fax',                 placeholder: '+1 555-000-1235' },
    { key: 'email',        label: 'Email',               placeholder: 'accounts@company.com' },
    { key: 'website',      label: 'Website',             placeholder: 'https://company.com' },
    { key: 'tax_number',   label: 'Tax / ABN / VAT No.', placeholder: 'XX-XXXXXXX' },
    { key: 'bank_details', label: 'Bank / Payment Details (printed on invoice)', placeholder: 'Bank: XYZ\nBSB: 000-000\nAccount: 12345678', multi: true },
    { key: 'logo_text',    label: 'Logo (emoji or initials)',  placeholder: '🏪' },
  ]

  const [form,       setForm]       = useState({})
  const [saving,     setSaving]     = useState(false)
  const [saved,      setSaved]      = useState(false)
  const [err,        setErr]        = useState('')
  const [smtpPwEdit, setSmtpPwEdit] = useState(false)
  const [testMsg,    setTestMsg]    = useState(null)
  const [testing,    setTesting]    = useState(false)
  const [syncing,    setSyncing]    = useState(false)
  const [syncMsg,    setSyncMsg]    = useState(null)

  useEffect(() => {
    settingsAPI.getCompany()
      .then(r => setForm(r.data))
      .catch(() => {})
  }, [])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const save = async () => {
    setSaving(true); setErr(''); setSaved(false)
    // Don't overwrite password if user didn't edit it
    const payload = { ...form }
    if (!smtpPwEdit || payload.smtp_password === '••••••••') {
      delete payload.smtp_password
    }
    try {
      const r = await settingsAPI.updateCompany(payload)
      setForm(r.data)
      setSmtpPwEdit(false)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (e) {
      setErr(e.response?.data?.detail || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const testSMTP = async () => {
    setTesting(true); setTestMsg(null)
    try {
      await emailAPI.testSMTP()
      setTestMsg({ ok: true, text: `Test email sent to ${form.smtp_user}` })
    } catch (e) {
      setTestMsg({ ok: false, text: e.response?.data?.detail || 'Test failed' })
    } finally {
      setTesting(false)
      setTimeout(() => setTestMsg(null), 5000)
    }
  }

  const syncCounter = async () => {
    setSyncing(true); setSyncMsg(null)
    try {
      const r = await settingsAPI.syncInvoiceCounter()
      const { max_found, next_invoice, total_scanned } = r.data
      set('invoice_counter', max_found)
      setSyncMsg({ ok: true, text: `Scanned ${total_scanned} invoices — highest number found: ${max_found}. Next invoice will be #${next_invoice}.` })
    } catch (e) {
      setSyncMsg({ ok: false, text: e.response?.data?.detail || 'Sync failed' })
    } finally {
      setSyncing(false)
      setTimeout(() => setSyncMsg(null), 6000)
    }
  }

  return (
    <SectionHeader icon={Building2} title="Company Profile" color="bg-purple-500">
      <p className="text-sm text-gray-500 mb-4">This information appears on printed invoices.</p>
      {err && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2 mb-3">{err}</p>}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {FIELDS.map(f => (
          <div key={f.key} className={f.multi ? 'sm:col-span-2' : ''}>
            <label className="label">{f.label}</label>
            {f.multi ? (
              <textarea
                rows={3}
                className="input w-full"
                placeholder={f.placeholder}
                value={form[f.key] || ''}
                onChange={e => set(f.key, e.target.value)}
              />
            ) : (
              <input
                className="input w-full"
                placeholder={f.placeholder}
                value={form[f.key] || ''}
                onChange={e => set(f.key, e.target.value)}
              />
            )}
          </div>
        ))}
      </div>

      {/* Logo Image Upload */}
      <div className="mt-5 pt-5 border-t border-gray-200">
        <label className="block text-sm font-medium text-gray-700 mb-3">Company Logo <span className="text-xs font-normal text-gray-400">(printed on all invoices)</span></label>
        <div className="flex items-start gap-5">
          {/* Preview box */}
          <div className="w-20 h-20 border-2 border-dashed border-gray-300 rounded-xl flex items-center justify-center bg-gray-50 flex-shrink-0 overflow-hidden">
            {form.logo_base64
              ? <img src={form.logo_base64} alt="Logo" className="w-full h-full object-contain" />
              : <span className="text-3xl">{form.logo_text || '🏪'}</span>
            }
          </div>
          <div className="space-y-2 flex-1">
            <label className="cursor-pointer inline-flex items-center gap-2 bg-white border border-gray-300 hover:border-indigo-400 text-sm text-gray-700 px-4 py-2 rounded-lg transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              Upload Logo Image
              <input
                type="file"
                accept="image/png,image/jpeg,image/gif,image/svg+xml,image/webp"
                className="hidden"
                onChange={e => {
                  const file = e.target.files[0]
                  if (!file) return
                  if (file.size > 2 * 1024 * 1024) { alert('Image must be under 2MB'); return }
                  const reader = new FileReader()
                  reader.onload = ev => set('logo_base64', ev.target.result)
                  reader.readAsDataURL(file)
                }}
              />
            </label>
            {form.logo_base64 && (
              <button
                type="button"
                onClick={() => set('logo_base64', '')}
                className="block text-xs text-red-500 hover:text-red-700"
              >
                ✕ Remove image (use emoji/initials instead)
              </button>
            )}
            <p className="text-xs text-gray-400">PNG, JPG or SVG · max 2MB · Displayed in the top-left of all printed invoices. If no image, the emoji/initials above are used.</p>
          </div>
        </div>
      </div>

      {/* SMTP Email Config */}
      <div className="mt-6 pt-5 border-t border-gray-200">
        <div className="flex items-center gap-2 mb-3">
          <Mail size={16} className="text-blue-600" />
          <h4 className="font-semibold text-gray-800">Email (SMTP) Settings</h4>
        </div>
        <p className="text-xs text-gray-500 mb-4">
          Configure your outgoing email server to send invoices and purchase orders directly from the app.
          For Gmail use <code className="bg-gray-100 px-1 rounded">smtp.gmail.com</code> port <code className="bg-gray-100 px-1 rounded">587</code> with an App Password.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label">SMTP Host</label>
            <input className="input w-full" placeholder="smtp.gmail.com" value={form.smtp_host || ''} onChange={e => set('smtp_host', e.target.value)} />
          </div>
          <div>
            <label className="label">SMTP Port</label>
            <input className="input w-full" type="number" placeholder="587" value={form.smtp_port || 587} onChange={e => set('smtp_port', parseInt(e.target.value) || 587)} />
          </div>
          <div>
            <label className="label">SMTP Username (email)</label>
            <input className="input w-full" placeholder="yourname@gmail.com" value={form.smtp_user || ''} onChange={e => set('smtp_user', e.target.value)} />
          </div>
          <div>
            <label className="label">SMTP Password</label>
            {smtpPwEdit ? (
              <input className="input w-full" type="password" placeholder="App password / SMTP password" value={form.smtp_password || ''} onChange={e => set('smtp_password', e.target.value)} />
            ) : (
              <div className="flex gap-2">
                <input className="input flex-1" type="password" value={form.smtp_password || ''} readOnly />
                <button className="btn-secondary px-3 text-xs" onClick={() => { set('smtp_password', ''); setSmtpPwEdit(true) }}>Change</button>
              </div>
            )}
          </div>
          <div className="sm:col-span-2">
            <label className="label">From Address <span className="text-gray-400 font-normal">(optional — defaults to SMTP username)</span></label>
            <input className="input w-full" placeholder='My Company <yourname@gmail.com>' value={form.smtp_from || ''} onChange={e => set('smtp_from', e.target.value)} />
          </div>
        </div>

        {testMsg && (
          <div className={`mt-3 p-3 rounded-lg text-sm font-medium ${testMsg.ok ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
            {testMsg.ok ? '✓ ' : '✗ '}{testMsg.text}
          </div>
        )}

        <div className="mt-3">
          <button onClick={testSMTP} disabled={testing || !form.smtp_host} className="btn-secondary flex items-center gap-2 text-sm">
            <Send size={14} /> {testing ? 'Sending test…' : 'Send Test Email'}
          </button>
        </div>
      </div>

      {/* Customer Portal Settings */}
      <div className="mt-6 pt-5 border-t border-gray-200">
        <div className="flex items-center gap-2 mb-3">
          <Globe size={16} className="text-indigo-600" />
          <h4 className="font-semibold text-gray-800">Customer Portal Visibility</h4>
        </div>
        <p className="text-xs text-gray-500 mb-4">
          Control what customers see when they log in to the order portal at <code className="bg-gray-100 px-1 rounded">/portal/login</code>.
        </p>
        <div className="space-y-3">
          {[
            { key: 'portal_show_price',    label: 'Show product prices', desc: 'Customers can see per-case prices in the catalog' },
            { key: 'portal_show_stock',    label: 'Show stock levels',   desc: 'Customers can see how many cases are available' },
            { key: 'portal_show_invoices', label: 'Show invoices tab',   desc: 'Customers can view their invoice history' },
          ].map(({ key, label, desc }) => (
            <label key={key} className="flex items-start gap-3 cursor-pointer group">
              <div className="relative mt-0.5">
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={form[key] ?? true}
                  onChange={e => set(key, e.target.checked)}
                />
                <div className={`w-10 h-6 rounded-full transition-colors ${form[key] ?? true ? 'bg-indigo-600' : 'bg-gray-300'}`} />
                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${form[key] ?? true ? 'translate-x-5' : 'translate-x-1'}`} />
              </div>
              <div>
                <div className="text-sm font-medium text-gray-800">{label}</div>
                <div className="text-xs text-gray-400">{desc}</div>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Invoice Note */}
      <div className="mt-6 pt-5 border-t border-gray-200">
        <div className="flex items-center gap-2 mb-1">
          <FileText size={16} className="text-indigo-600" />
          <h4 className="font-semibold text-gray-800">Invoice Note</h4>
        </div>
        <p className="text-xs text-gray-500 mb-3">This text prints at the bottom of every invoice (e.g. return policy, payment terms, thank-you message).</p>
        <textarea
          rows={3}
          value={form.invoice_note || ''}
          onChange={e => set('invoice_note', e.target.value)}
          placeholder="e.g. All goods must be returned within 7 days. Thank you for your business!"
          className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
        />
      </div>

      {/* Invoice Template Picker */}
      <div className="mt-6 pt-5 border-t border-gray-200">
        <div className="flex items-center gap-2 mb-3">
          <FileText size={16} className="text-indigo-600" />
          <h4 className="font-semibold text-gray-800">Invoice Template</h4>
        </div>
        <p className="text-xs text-gray-500 mb-4">Choose the print style for all invoices. Click <strong>Preview</strong> to see a sample with dummy data.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            {
              id: 'attari',
              name: 'Template 1',
              desc: 'Bold uppercase name, bordered Bill To/Ship To boxes, gray table header',
              preview: (
                <div className="w-full h-24 rounded overflow-hidden border border-gray-300 bg-white text-[0px]">
                  <div className="flex justify-between items-start p-1.5 border-b border-gray-400">
                    <div className="space-y-0.5">
                      <div className="w-16 h-2 bg-gray-900 rounded-sm"/>
                      <div className="w-10 h-1 bg-gray-500 rounded-sm"/>
                      <div className="w-12 h-1 bg-gray-300 rounded-sm"/>
                    </div>
                    <div className="text-right space-y-0.5">
                      <div className="w-8 h-1.5 bg-gray-700 rounded-sm ml-auto"/>
                      <div className="flex gap-0.5 justify-end mt-0.5">
                        <div className="w-7 h-3 bg-gray-100 border border-gray-400"/>
                        <div className="w-7 h-3 bg-gray-100 border border-gray-400"/>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-1 p-1 pb-0">
                    <div className="flex-1 border border-gray-400 p-0.5"><div className="h-1 bg-gray-400 w-8 mb-0.5"/><div className="h-1 bg-gray-200 w-12"/><div className="h-1 bg-gray-200 w-10 mt-0.5"/></div>
                    <div className="flex-1 border border-gray-400 p-0.5"><div className="h-1 bg-gray-400 w-8 mb-0.5"/><div className="h-1 bg-gray-200 w-12"/><div className="h-1 bg-gray-200 w-10 mt-0.5"/></div>
                  </div>
                  <div className="flex mx-1 mt-1 border border-gray-400">
                    {['Item','Desc','Qty','$','Amt'].map((h,i)=><div key={i} className={`flex-1 h-2 bg-gray-300 border-r border-gray-400 last:border-r-0 ${i===1?'flex-[3]':''}`}/>)}
                  </div>
                  <div className="flex mx-1 border border-gray-300 border-t-0">
                    {[1,3,1,1,1].map((w,i)=><div key={i} className={`flex-${w} h-2 bg-white border-r border-gray-200 last:border-r-0`}/>)}
                  </div>
                  <div className="flex mx-1 border border-gray-300 border-t-0">
                    {[1,3,1,1,1].map((w,i)=><div key={i} className={`flex-${w} h-2 bg-gray-50 border-r border-gray-200 last:border-r-0`}/>)}
                  </div>
                </div>
              ),
            },
            {
              id: 'fahman',
              name: 'Template 2',
              desc: 'Bold italic name, bordered date/invoice boxes, clean rows, black Balance Due',
              preview: (
                <div className="w-full h-24 rounded overflow-hidden border border-gray-300 bg-white">
                  <div className="flex justify-between items-start p-1.5 border-b border-gray-300">
                    <div className="space-y-0.5">
                      <div className="w-14 h-2.5 bg-gray-900 rounded-sm italic"/>
                      <div className="w-20 h-1 bg-gray-400 rounded-sm"/>
                      <div className="w-14 h-1 bg-gray-300 rounded-sm"/>
                    </div>
                    <div className="space-y-0.5">
                      <div className="w-8 h-1.5 bg-gray-600 rounded-sm ml-auto"/>
                      <div className="flex gap-0.5">
                        <div className="w-8 h-3 border border-gray-500 bg-gray-50 flex flex-col justify-between p-0.5"><div className="h-0.5 bg-gray-400"/><div className="h-0.5 bg-gray-600"/></div>
                        <div className="w-8 h-3 border border-gray-500 bg-gray-50 flex flex-col justify-between p-0.5"><div className="h-0.5 bg-gray-400"/><div className="h-0.5 bg-gray-600"/></div>
                        <div className="w-8 h-3 border border-gray-500 bg-gray-50 flex flex-col justify-between p-0.5"><div className="h-0.5 bg-gray-400"/><div className="h-0.5 bg-gray-600"/></div>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-1 p-1 pb-0">
                    <div className="flex-1 border border-gray-400 p-0.5"><div className="h-1 bg-gray-400 w-8 mb-0.5"/><div className="h-1 bg-gray-200 w-12"/></div>
                    <div className="flex-1 border border-gray-400 p-0.5"><div className="h-1 bg-gray-400 w-8 mb-0.5"/><div className="h-1 bg-gray-200 w-12"/></div>
                  </div>
                  <div className="mx-1 mt-1 h-2 bg-gray-400"/>
                  <div className="mx-1 h-2 bg-white border-x border-b border-gray-300"/>
                  <div className="flex justify-end mx-1">
                    <div className="flex gap-0.5">
                      <div className="w-10 h-2 border border-gray-300 bg-gray-50"/>
                      <div className="w-10 h-2 bg-black"/>
                    </div>
                  </div>
                </div>
              ),
            },
            {
              id: 'united',
              name: 'Template 3',
              desc: 'Square logo, blue "INVOICE" title, Rep/Terms/Ship meta row, blue-header table',
              preview: (
                <div className="w-full h-24 rounded overflow-hidden border border-gray-300 bg-white">
                  <div className="flex justify-between items-center p-1.5 border-b-2 border-[#1a56db]">
                    <div className="flex items-center gap-1">
                      <div className="w-5 h-5 border-2 border-[#1a56db] flex items-center justify-center text-[8px] font-black text-[#1a56db] shrink-0">🏪</div>
                      <div className="space-y-0.5">
                        <div className="w-12 h-1.5 bg-gray-900 rounded-sm"/>
                        <div className="w-8 h-1 bg-gray-400 rounded-sm"/>
                      </div>
                    </div>
                    <div className="space-y-0.5">
                      <div className="w-10 h-1.5 bg-[#1a56db] rounded-sm ml-auto"/>
                      <div className="grid grid-cols-2 gap-0.5">
                        <div className="h-2 bg-[#eef2ff] border border-[#b0bec5]"/>
                        <div className="h-2 bg-[#eef2ff] border border-[#b0bec5]"/>
                        <div className="h-1.5 bg-white border border-[#b0bec5]"/>
                        <div className="h-1.5 bg-white border border-[#b0bec5]"/>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-1 p-1 pb-0">
                    <div className="flex-1 border border-[#b0bec5] p-0.5"><div className="h-1 bg-[#eef2ff] w-8 mb-0.5"/><div className="h-1 bg-gray-100 w-12"/></div>
                    <div className="flex-1 border border-[#b0bec5] p-0.5"><div className="h-1 bg-[#eef2ff] w-8 mb-0.5"/><div className="h-1 bg-gray-100 w-12"/></div>
                  </div>
                  <div className="flex mx-1 mt-1">
                    {[1,1,1,1].map((_,i)=><div key={i} className="flex-1 h-1.5 bg-[#eef2ff] border border-[#b0bec5] border-r-0 last:border-r"/>)}
                  </div>
                  <div className="mx-1 h-2 bg-[#1a56db]"/>
                  <div className="mx-1 h-2 bg-white border-x border-b border-[#dde3f0]"/>
                  <div className="flex justify-end mx-1 mt-0.5">
                    <div className="w-14 h-1.5 bg-[#1a56db] rounded-sm"/>
                  </div>
                </div>
              ),
            },
            {
              id: 'salesorder',
              name: 'Template 4',
              desc: 'Sales Order style — logo box, QR code, Bill To/Ship To, Rep/Terms/Ship Via row',
              preview: (
                <div className="w-full h-24 rounded overflow-hidden border border-gray-300 bg-white">
                  {/* Header row: logo | qr | title */}
                  <div className="flex justify-between items-start p-1.5 border-b border-gray-300">
                    <div className="flex items-start gap-1">
                      <div className="w-5 h-5 border-2 border-gray-600 flex items-center justify-center text-[8px] shrink-0">🌅</div>
                      <div className="space-y-0.5">
                        <div className="w-14 h-1.5 bg-gray-900 rounded-sm"/>
                        <div className="w-10 h-1 bg-gray-400 rounded-sm"/>
                        <div className="w-12 h-1 bg-gray-300 rounded-sm"/>
                      </div>
                    </div>
                    <div className="w-5 h-5 bg-gray-100 border border-dashed border-gray-400 flex items-center justify-center text-[5px] text-gray-400 shrink-0">QR</div>
                    <div className="text-right space-y-0.5">
                      <div className="w-12 h-2 bg-[#1a56db] rounded-sm ml-auto"/>
                      <div className="flex gap-0.5 justify-end">
                        <div className="w-7 h-3 bg-gray-100 border border-gray-400 flex flex-col justify-between p-0.5"><div className="h-0.5 bg-gray-400"/><div className="h-0.5 bg-gray-700"/></div>
                      </div>
                    </div>
                  </div>
                  {/* Bill To / Ship To */}
                  <div className="flex gap-0.5 mx-1 mt-1">
                    <div className="flex-1 border border-gray-400 p-0.5 h-3"><div className="h-0.5 bg-gray-500 w-6 mb-0.5"/><div className="h-0.5 bg-gray-300 w-10"/></div>
                    <div className="flex-1 border border-gray-400 p-0.5 h-3"><div className="h-0.5 bg-gray-500 w-5 mb-0.5"/><div className="h-0.5 bg-gray-300 w-10"/></div>
                  </div>
                  {/* Rep/Terms/Ship row */}
                  <div className="flex mx-1 mt-1">
                    {['Rep','Terms','Ship Date','Ship Via'].map((h,i)=>(
                      <div key={i} className="flex-1 h-1.5 bg-gray-200 border border-gray-400 border-r-0 last:border-r text-[4px] text-gray-500 flex items-center justify-center">{h}</div>
                    ))}
                  </div>
                  {/* Table header */}
                  <div className="flex mx-1 mt-1 border border-gray-400 bg-gray-200">
                    {[1,3,1,1,1,1].map((w,i)=><div key={i} className={`flex-${w} h-1.5 border-r border-gray-400 last:border-r-0`}/>)}
                  </div>
                  <div className="flex mx-1 border border-gray-300 border-t-0">
                    {[1,3,1,1,1,1].map((w,i)=><div key={i} className={`flex-${w} h-1.5 bg-white border-r border-gray-200 last:border-r-0`}/>)}
                  </div>
                </div>
              ),
            },
          ].map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => set('invoice_template', t.id)}
              className={`text-left rounded-xl border-2 p-3 transition-all ${
                (form.invoice_template || 'attari') === t.id
                  ? 'border-indigo-500 bg-indigo-50 shadow-sm'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              {t.preview}
              <div className="mt-2 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-800">{t.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{t.desc}</p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={e => {
                      e.stopPropagation()
                      printInvoice(DUMMY_INVOICE, { ...DUMMY_COMPANY, invoice_template: t.id, invoice_note: form.invoice_note || '' })
                    }}
                    onKeyDown={e => e.key === 'Enter' && printInvoice(DUMMY_INVOICE, { ...DUMMY_COMPANY, invoice_template: t.id, invoice_note: form.invoice_note || '' })}
                    className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-2 py-1 rounded-lg transition-colors cursor-pointer"
                  >
                    <Eye size={11} /> Preview
                  </span>
                  {(form.invoice_template || 'attari') === t.id && (
                    <span className="w-5 h-5 rounded-full bg-indigo-500 flex items-center justify-center">
                      <Check size={11} className="text-white" />
                    </span>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Document & Print settings — apply to all templates */}
      <div className="mt-6 pt-5 border-t border-gray-200">
        <div className="flex items-center gap-2 mb-1">
          <FileText size={16} className="text-indigo-600" />
          <h4 className="font-semibold text-gray-800">Document & Print Settings</h4>
        </div>
        <p className="text-xs text-gray-500 mb-4">These settings apply across all invoice templates — document heading, delivery details, and optional QR code linking to your catalog.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Document Title</label>
            <input
              className="input w-full text-sm"
              placeholder="Invoice / Sales Order / Tax Invoice"
              value={form.invoice_title || ''}
              onChange={e => set('invoice_title', e.target.value)}
            />
            <p className="text-xs text-gray-400 mt-1">Heading shown on all printed documents (e.g. "Invoice", "Sales Order", "Tax Invoice")</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Default Rep</label>
            <input
              className="input w-full text-sm"
              placeholder="e.g. AS"
              value={form.rep_name || ''}
              onChange={e => set('rep_name', e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Ship Via</label>
            <input
              className="input w-full text-sm"
              placeholder="e.g. OUR TRUCK / FedEx"
              value={form.ship_via || ''}
              onChange={e => set('ship_via', e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Catalog URL <span className="text-xs text-gray-400">(for QR code)</span></label>
            <input
              className="input w-full text-sm"
              placeholder="https://yourstore.com/catalog"
              value={form.catalog_url || ''}
              onChange={e => set('catalog_url', e.target.value)}
            />
          </div>
        </div>
        <label className="flex items-center gap-3 mt-4 cursor-pointer">
          <div className="relative">
            <input type="checkbox" className="sr-only" checked={form.show_qr_code || false} onChange={e => set('show_qr_code', e.target.checked)} />
            <div className={`w-10 h-6 rounded-full transition-colors ${form.show_qr_code ? 'bg-indigo-600' : 'bg-gray-300'}`} />
            <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${form.show_qr_code ? 'translate-x-5' : 'translate-x-1'}`} />
          </div>
          <div>
            <div className="text-sm font-medium text-gray-800">Show QR code on invoices</div>
            <div className="text-xs text-gray-400">Prints a scannable QR code linking to your catalog URL (all templates)</div>
          </div>
        </label>
      </div>

      {/* Invoice Number Format */}
      <div className="mt-6 pt-5 border-t border-gray-200">
        <div className="flex items-center gap-2 mb-1">
          <FileText size={16} className="text-indigo-600" />
          <h4 className="font-semibold text-gray-800">Invoice Number Format</h4>
        </div>
        <p className="text-xs text-gray-500 mb-4">
          Choose how invoice numbers are generated. The counter resets automatically based on the chosen period.
        </p>

        {/* Format cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
          {[
            { id: 'date-daily',   label: 'Date + Daily',    example: 'INV-20260322-001', desc: 'Resets each day' },
            { id: 'date-monthly', label: 'Date + Monthly',  example: 'INV-202603-001',   desc: 'Resets each month' },
            { id: 'date-full',    label: 'Full Date',       example: 'INV-2026-03-22-001', desc: 'Resets each day, readable' },
            { id: 'year-seq',     label: 'Year + Sequence', example: 'INV-2026-0001',    desc: 'Resets each year' },
            { id: 'year-month',   label: 'Year + Month',    example: 'INV-2026-03-001',  desc: 'Resets each month, readable' },
            { id: 'sequential',   label: 'Sequential',      example: 'INV-00001',         desc: 'Never resets' },
          ].map(opt => (
            <button
              key={opt.id}
              type="button"
              onClick={() => set('invoice_number_format', opt.id)}
              className={`text-left p-3 rounded-xl border-2 transition-all ${
                (form.invoice_number_format || 'date-daily') === opt.id
                  ? 'border-indigo-500 bg-indigo-50'
                  : 'border-gray-200 hover:border-gray-300 bg-white'
              }`}
            >
              <div className="font-mono text-xs font-bold text-gray-700 mb-1 truncate">{opt.example}</div>
              <div className="text-xs font-medium text-gray-800">{opt.label}</div>
              <div className="text-[10px] text-gray-400 leading-tight">{opt.desc}</div>
              {(form.invoice_number_format || 'date-daily') === opt.id && (
                <div className="mt-1">
                  <span className="inline-block w-4 h-4 rounded-full bg-indigo-500 text-white text-[8px] flex items-center justify-center">✓</span>
                </div>
              )}
            </button>
          ))}
        </div>

        {/* Prefix + Padding + Counter row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Prefix</label>
            <input
              className="input w-full text-sm font-mono"
              placeholder="INV"
              value={form.invoice_number_prefix || 'INV'}
              onChange={e => set('invoice_number_prefix', e.target.value.toUpperCase())}
            />
            <p className="text-xs text-gray-400 mt-1">Letters before the number (e.g. INV, SO, TAX)</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Digit Padding</label>
            <select
              className="input w-full text-sm"
              value={form.invoice_number_padding || 3}
              onChange={e => set('invoice_number_padding', parseInt(e.target.value))}
            >
              {[2,3,4,5,6].map(n => (
                <option key={n} value={n}>{n} digits &nbsp;({String(1).padStart(n,'0')} → {String(99).padStart(n,'0')}…)</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Reset Counter To</label>
            <div className="flex gap-2">
              <input
                type="number"
                min="0"
                className="input flex-1 text-sm"
                placeholder="0"
                value={form.invoice_counter ?? 0}
                onChange={e => set('invoice_counter', parseInt(e.target.value) || 0)}
              />
            </div>
            <p className="text-xs text-gray-400 mt-1">Next invoice will be counter + 1</p>
          </div>
        </div>

        {/* Sync from existing invoices */}
        <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-xl flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1">
            <div className="text-sm font-medium text-amber-900">Sync counter from existing invoices</div>
            <div className="text-xs text-amber-700 mt-0.5">
              Scans all invoices in the system (including QuickBooks imports or CSV migrations), finds the highest number, and sets the counter automatically — so the next invoice never collides with an existing one.
            </div>
          </div>
          <button
            type="button"
            onClick={syncCounter}
            disabled={syncing}
            className="flex-shrink-0 flex items-center gap-2 bg-amber-600 hover:bg-amber-700 disabled:bg-amber-400 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            {syncing ? (
              <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="32" strokeDashoffset="12"/></svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"/><polyline points="23 20 23 14 17 14"/><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/></svg>
            )}
            {syncing ? 'Scanning…' : 'Auto-Sync Counter'}
          </button>
        </div>
        {syncMsg && (
          <div className={`mt-2 p-3 rounded-lg text-sm font-medium ${syncMsg.ok ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
            {syncMsg.ok ? '✓ ' : '✗ '}{syncMsg.text}
          </div>
        )}

        {/* Live preview */}
        <div className="mt-4 p-3 bg-gray-50 border border-gray-200 rounded-xl">
          <span className="text-xs text-gray-500 mr-2">Next invoice number preview:</span>
          <span className="font-mono font-bold text-indigo-700 text-sm">
            {(() => {
              const fmt    = form.invoice_number_format || 'date-daily'
              const pfx    = (form.invoice_number_prefix || 'INV').toUpperCase()
              const pad    = parseInt(form.invoice_number_padding) || 3
              const ctr    = (parseInt(form.invoice_counter) || 0) + 1
              const seq    = String(ctr).padStart(pad, '0')
              const now    = new Date()
              const YYYY   = now.getFullYear()
              const MM     = String(now.getMonth()+1).padStart(2,'0')
              const DD     = String(now.getDate()).padStart(2,'0')
              if (fmt === 'sequential')   return `${pfx}-${seq}`
              if (fmt === 'date-daily')   return `${pfx}-${YYYY}${MM}${DD}-${seq}`
              if (fmt === 'date-monthly') return `${pfx}-${YYYY}${MM}-${seq}`
              if (fmt === 'year-seq')     return `${pfx}-${YYYY}-${seq}`
              if (fmt === 'year-month')   return `${pfx}-${YYYY}-${MM}-${seq}`
              if (fmt === 'date-full')    return `${pfx}-${YYYY}-${MM}-${DD}-${seq}`
              return `${pfx}-${YYYY}${MM}${DD}-${seq}`
            })()}
          </span>
        </div>
      </div>

      <div className="mt-5 flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="btn-primary flex items-center gap-2"
        >
          <Save size={15} />
          {saving ? 'Saving…' : 'Save Company Profile'}
        </button>
        {saved && <span className="text-sm text-green-600 font-medium flex items-center gap-1"><Check size={14} /> Saved</span>}
      </div>
    </SectionHeader>
  )
}


// ══════════════════════════════════════════════════════════════
// MAIN SETTINGS PAGE
// ══════════════════════════════════════════════════════════════
export default function Settings({ lang }) {
  const t = useT(lang)
  const [activeTab, setActiveTab] = useState('company')

  const tabs = [
    { id: 'company',     label: 'Company',     icon: Building2 },
    { id: 'warehouses',  label: 'Warehouses',  icon: Warehouse },
    { id: 'vendors',     label: 'Vendors',     icon: Users },
    { id: 'categories',  label: 'Categories',  icon: Tag },
  ]

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">⚙️ Settings</h2>

      {/* Tab bar */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit flex-wrap">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === tab.id
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <tab.icon size={16} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'company'     && <CompanySection />}
      {activeTab === 'warehouses'  && <WarehouseSection />}
      {activeTab === 'vendors'     && <VendorSection />}
      {activeTab === 'categories'  && <CategorySection />}
    </div>
  )
}
