import { useEffect, useState } from 'react'
import { vendorAPI } from '../api/client'
import { useT } from '../i18n/translations'
import { Plus, Edit2 } from 'lucide-react'

export default function Vendors({ lang }) {
  const t = useT(lang)
  const [vendors, setVendors] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState({ name: '', contact_person: '', phone: '', email: '', lead_time_days: 7, notes: '' })

  const load = () => vendorAPI.list().then(r => setVendors(r.data))
  useEffect(() => { load() }, [])

  const handleSubmit = async () => {
    if (!form.name) return alert('Vendor name required')
    try {
      if (editId) await vendorAPI.update(editId, form)
      else await vendorAPI.create(form)
      setShowForm(false); setEditId(null)
      setForm({ name: '', contact_person: '', phone: '', email: '', lead_time_days: 7, notes: '' })
      load()
    } catch (e) { alert('Error: ' + (e.response?.data?.detail || e.message)) }
  }

  const startEdit = (v) => { setForm(v); setEditId(v.id); setShowForm(true) }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">{t('vendors')}</h2>
        <button className="btn-primary flex items-center gap-2" onClick={() => { setShowForm(!showForm); setEditId(null) }}>
          <Plus size={16} /> Add Vendor
        </button>
      </div>

      {showForm && (
        <div className="card space-y-4">
          <h3 className="font-semibold">{editId ? 'Edit Vendor' : 'New Vendor'}</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Vendor Name *</label>
              <input className="input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label className="label">Contact Person</label>
              <input className="input" value={form.contact_person || ''} onChange={e => setForm({ ...form, contact_person: e.target.value })} />
            </div>
            <div>
              <label className="label">Phone</label>
              <input className="input" value={form.phone || ''} onChange={e => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div>
              <label className="label">Email</label>
              <input className="input" type="email" value={form.email || ''} onChange={e => setForm({ ...form, email: e.target.value })} />
            </div>
            <div>
              <label className="label">Lead Time (days)</label>
              <input type="number" className="input" value={form.lead_time_days} onChange={e => setForm({ ...form, lead_time_days: parseInt(e.target.value) })} />
            </div>
            <div>
              <label className="label">Notes</label>
              <input className="input" value={form.notes || ''} onChange={e => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <div className="flex gap-3">
            <button className="btn-primary" onClick={handleSubmit}>{t('save')}</button>
            <button className="btn-secondary" onClick={() => setShowForm(false)}>{t('cancel')}</button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {vendors.map(v => (
          <div key={v.id} className="card hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-bold text-gray-900">{v.name}</h3>
                {v.contact_person && <p className="text-sm text-gray-500 mt-1">{v.contact_person}</p>}
              </div>
              <button onClick={() => startEdit(v)} className="text-gray-400 hover:text-blue-600">
                <Edit2 size={16} />
              </button>
            </div>
            <div className="mt-3 space-y-1 text-sm text-gray-600">
              {v.phone && <div>📞 {v.phone}</div>}
              {v.email && <div>✉️ {v.email}</div>}
              <div>⏱ Lead time: <strong>{v.lead_time_days} days</strong></div>
              <div>📦 SKUs: <strong>{v.sku_count}</strong></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
