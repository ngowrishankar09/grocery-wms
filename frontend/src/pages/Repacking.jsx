import { useState, useEffect, useCallback } from 'react'
import { repackingAPI, skuAPI } from '../api/client'
import {
  Loader2, Plus, Trash2, Package, ChevronLeft, AlertTriangle,
  CheckCircle2, X, Factory, Scale, DollarSign, Edit2, Save,
} from 'lucide-react'

// ── Formatting helpers ────────────────────────────────────────
const fmt$ = (v) => `$${(v ?? 0).toFixed(2)}`
const fmtKg = (v) => v != null ? `${(+v).toFixed(3)} kg` : '—'

// ── Live packing summary helpers ─────────────────────────────
function calcTheoreticalKg(outputs) {
  return outputs.reduce((sum, o) => sum + (o.bom_live_kg ?? 0), 0)
}
function calcExpectedRemaining(qtyStart, theoreticalKg) {
  if (qtyStart == null) return null
  return Math.max(0, qtyStart - theoreticalKg)
}

// ── Variance colour helpers ───────────────────────────────────
function varianceColor(pct) {
  if (pct == null) return 'text-gray-500'
  const abs = Math.abs(pct)
  if (abs <= 2)  return 'text-green-600'
  if (abs <= 5)  return 'text-amber-600'
  return 'text-red-600'
}
function varianceBg(pct) {
  if (pct == null) return 'bg-gray-50'
  const abs = Math.abs(pct)
  if (abs <= 2)  return 'bg-green-50'
  if (abs <= 5)  return 'bg-amber-50'
  return 'bg-red-50'
}
function VarianceBadge({ pct }) {
  if (pct == null) return <span className="text-gray-400 text-sm">—</span>
  const abs = Math.abs(pct)
  let cls = 'text-xs font-semibold px-2 py-0.5 rounded-full '
  if (abs <= 2)       cls += 'bg-green-100 text-green-700'
  else if (abs <= 5)  cls += 'bg-amber-100 text-amber-700'
  else                cls += 'bg-red-100 text-red-700'
  return <span className={cls}>{pct >= 0 ? '+' : ''}{pct.toFixed(1)}%</span>
}
function StatusBadge({ status }) {
  return status === 'open'
    ? <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">Open</span>
    : <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-200 text-gray-600">Closed</span>
}

// ── Tab 1: Bills of Materials ─────────────────────────────────
function BOMTab({ skus }) {
  const [boms, setBoms]       = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm]       = useState({
    output_sku_id: '', input_sku_id: '', qty_per_unit: '', unit: 'kg',
    waste_pct_allowed: 2, notes: '',
  })
  const [saving, setSaving]   = useState(false)
  const [formError, setFormError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await repackingAPI.listBOM()
      setBoms(res.data)
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to load bills of materials')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const handleCreate = async (e) => {
    e.preventDefault(); setFormError(null)
    if (!form.output_sku_id || !form.input_sku_id || !form.qty_per_unit) {
      setFormError('Please fill all required fields.'); return
    }
    if (form.output_sku_id === form.input_sku_id) {
      setFormError('Output and input SKU must be different.'); return
    }
    setSaving(true)
    try {
      await repackingAPI.createBOM({
        output_sku_id:     parseInt(form.output_sku_id),
        input_sku_id:      parseInt(form.input_sku_id),
        qty_per_unit:      parseFloat(form.qty_per_unit),
        unit:              form.unit,
        waste_pct_allowed: parseFloat(form.waste_pct_allowed),
        notes:             form.notes || null,
      })
      setShowForm(false)
      setForm({ output_sku_id: '', input_sku_id: '', qty_per_unit: '', unit: 'kg', waste_pct_allowed: 2, notes: '' })
      load()
    } catch (e) {
      setFormError(e.response?.data?.detail || 'Failed to create BOM')
    } finally { setSaving(false) }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this bill of materials?')) return
    try { await repackingAPI.deleteBOM(id); load() }
    catch (e) { alert(e.response?.data?.detail || 'Failed to delete BOM') }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">Bills of Materials</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Define how much bulk material is consumed per retail unit packed.
          </p>
        </div>
        <button onClick={() => { setShowForm(s => !s); setFormError(null) }} className="btn-primary flex items-center gap-1.5">
          <Plus size={15} /> Add BOM
        </button>
      </div>

      {showForm && (
        <div className="card mb-4 border border-blue-200 bg-blue-50">
          <h3 className="font-semibold text-gray-800 mb-3">New Bill of Material</h3>
          <form onSubmit={handleCreate} className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Output SKU (retail/finished) <span className="text-red-500">*</span></label>
                <select className="input w-full" value={form.output_sku_id} onChange={e => setForm(f => ({ ...f, output_sku_id: e.target.value }))} required>
                  <option value="">Select output SKU…</option>
                  {skus.map(s => <option key={s.id} value={s.id}>{s.product_name} ({s.sku_code})</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Input SKU (bulk raw material) <span className="text-red-500">*</span></label>
                <select className="input w-full" value={form.input_sku_id} onChange={e => setForm(f => ({ ...f, input_sku_id: e.target.value }))} required>
                  <option value="">Select bulk SKU…</option>
                  {skus.map(s => <option key={s.id} value={s.id}>{s.product_name} ({s.sku_code})</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Bulk kg per case <span className="text-red-500">*</span></label>
                <div className="flex gap-2">
                  <input type="number" step="0.001" min="0.001" className="input flex-1" placeholder="e.g. 4.0" value={form.qty_per_unit} onChange={e => setForm(f => ({ ...f, qty_per_unit: e.target.value }))} required />
                  <input type="text" className="input w-20" placeholder="kg" value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))} />
                </div>
                <p className="text-xs text-gray-400 mt-1">How much bulk is consumed per 1 case.</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Allowed waste % (threshold)</label>
                <input type="number" step="0.1" min="0" max="100" className="input w-full" value={form.waste_pct_allowed} onChange={e => setForm(f => ({ ...f, waste_pct_allowed: e.target.value }))} />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Notes</label>
              <input type="text" className="input w-full" placeholder="Optional notes…" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
            {formError && <p className="text-sm text-red-600 flex items-center gap-1"><AlertTriangle size={14} /> {formError}</p>}
            <div className="flex gap-2">
              <button type="submit" className="btn-primary flex items-center gap-1.5" disabled={saving}>
                {saving && <Loader2 size={14} className="animate-spin" />} Save BOM
              </button>
              <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="animate-spin text-blue-500" size={28} /></div>
      ) : error ? (
        <div className="card text-red-600 flex items-center gap-2"><AlertTriangle size={18} /> {error}</div>
      ) : boms.length === 0 ? (
        <div className="card text-center py-12 text-gray-400">
          <Package size={36} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium">No bills of materials yet.</p>
          <p className="text-sm mt-1">Add a BOM to define how much bulk is needed per retail pack.</p>
        </div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3 text-left">Output SKU (retail)</th>
                <th className="px-4 py-3 text-left">Input SKU (bulk)</th>
                <th className="px-4 py-3 text-right">Bulk kg / case</th>
                <th className="px-4 py-3 text-right">Waste allowed</th>
                <th className="px-4 py-3 text-left">Notes</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {boms.map(b => (
                <tr key={b.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3"><div className="font-medium text-gray-800">{b.output_sku_name}</div><div className="text-xs text-gray-400">{b.output_sku_code}</div></td>
                  <td className="px-4 py-3"><div className="font-medium text-gray-800">{b.input_sku_name}</div><div className="text-xs text-gray-400">{b.input_sku_code}</div></td>
                  <td className="px-4 py-3 text-right font-mono">{b.qty_per_unit} {b.unit}</td>
                  <td className="px-4 py-3 text-right">{b.waste_pct_allowed}%</td>
                  <td className="px-4 py-3 text-gray-500">{b.notes || '—'}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => handleDelete(b.id)} className="p-1.5 text-gray-400 hover:text-red-500 rounded transition-colors" title="Delete BOM"><Trash2 size={14} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Tab 2: Landed Costs ───────────────────────────────────────
const LC_COST_FIELDS = [
  { key: 'cost_material',      label: 'Material / FOB cost ($)' },
  { key: 'cost_freight',       label: 'Freight / shipping ($)' },
  { key: 'cost_duty',          label: 'Import duty / customs ($)' },
  { key: 'cost_packaging_mat', label: 'Packaging materials ($) — boxes, bags, labels' },
  { key: 'cost_labor',         label: 'Labor ($) — packing labour for this batch' },
  { key: 'cost_overhead',      label: 'Overhead ($) — electricity, rent allocation' },
  { key: 'cost_other',         label: 'Other ($)' },
]

const emptyLCForm = () => ({
  bulk_sku_id: '', batch_ref: '', qty_kg: '',
  cost_material: '', cost_freight: '', cost_duty: '',
  cost_packaging_mat: '', cost_labor: '', cost_overhead: '', cost_other: '',
  currency: 'USD', notes: '',
})

function calcLCTotal(form) {
  return LC_COST_FIELDS.reduce((sum, f) => sum + (parseFloat(form[f.key]) || 0), 0)
}

function LandedCostsTab({ skus }) {
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const [showForm, setShowForm]   = useState(false)
  const [editId, setEditId]       = useState(null)
  const [form, setForm]           = useState(emptyLCForm())
  const [saving, setSaving]       = useState(false)
  const [formError, setFormError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await repackingAPI.listLandedCosts()
      setRecords(res.data)
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to load landed costs')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const openNew = () => {
    setEditId(null)
    setForm(emptyLCForm())
    setFormError(null)
    setShowForm(true)
  }

  const openEdit = (lc) => {
    setEditId(lc.id)
    setForm({
      bulk_sku_id: String(lc.bulk_sku_id),
      batch_ref:   lc.batch_ref || '',
      qty_kg:      String(lc.qty_kg),
      cost_material:      String(lc.cost_material ?? 0),
      cost_freight:       String(lc.cost_freight ?? 0),
      cost_duty:          String(lc.cost_duty ?? 0),
      cost_packaging_mat: String(lc.cost_packaging_mat ?? 0),
      cost_labor:         String(lc.cost_labor ?? 0),
      cost_overhead:      String(lc.cost_overhead ?? 0),
      cost_other:         String(lc.cost_other ?? 0),
      currency:   lc.currency || 'USD',
      notes:      lc.notes || '',
    })
    setFormError(null)
    setShowForm(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault(); setFormError(null)
    if (!form.bulk_sku_id || !form.qty_kg) {
      setFormError('Please select a bulk SKU and enter quantity kg.'); return
    }
    const payload = {
      bulk_sku_id:        parseInt(form.bulk_sku_id),
      batch_ref:          form.batch_ref || null,
      qty_kg:             parseFloat(form.qty_kg),
      cost_material:      parseFloat(form.cost_material) || 0,
      cost_freight:       parseFloat(form.cost_freight) || 0,
      cost_duty:          parseFloat(form.cost_duty) || 0,
      cost_packaging_mat: parseFloat(form.cost_packaging_mat) || 0,
      cost_labor:         parseFloat(form.cost_labor) || 0,
      cost_overhead:      parseFloat(form.cost_overhead) || 0,
      cost_other:         parseFloat(form.cost_other) || 0,
      currency:           form.currency,
      notes:              form.notes || null,
    }
    setSaving(true)
    try {
      if (editId) {
        await repackingAPI.updateLandedCost(editId, payload)
      } else {
        await repackingAPI.createLandedCost(payload)
      }
      setShowForm(false)
      setEditId(null)
      setForm(emptyLCForm())
      load()
    } catch (e) {
      setFormError(e.response?.data?.detail || 'Failed to save landed cost')
    } finally { setSaving(false) }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this landed cost record?')) return
    try { await repackingAPI.deleteLandedCost(id); load() }
    catch (e) { alert(e.response?.data?.detail || 'Failed to delete') }
  }

  const runningTotal = calcLCTotal(form)
  const costPerKgPreview = form.qty_kg && parseFloat(form.qty_kg) > 0
    ? (runningTotal / parseFloat(form.qty_kg)).toFixed(4)
    : null

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">Landed Costs</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Record the full cost of each bulk sourcing batch — material, freight, duty, labour and overhead —
            to compute an accurate cost per kg.
          </p>
        </div>
        <button onClick={openNew} className="btn-primary flex items-center gap-1.5">
          <Plus size={15} /> Add Landed Cost
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="card mb-4 border border-green-200 bg-green-50">
          <h3 className="font-semibold text-gray-800 mb-3">
            {editId ? 'Edit Landed Cost' : 'New Landed Cost'}
          </h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* SKU + Qty + Currency */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Bulk SKU <span className="text-red-500">*</span></label>
                <select className="input w-full" value={form.bulk_sku_id} onChange={e => setForm(f => ({ ...f, bulk_sku_id: e.target.value }))} required>
                  <option value="">Select bulk SKU…</option>
                  {skus.map(s => <option key={s.id} value={s.id}>{s.product_name} ({s.sku_code})</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Batch Reference</label>
                <input type="text" className="input w-full" placeholder="e.g. India Apr 2026" value={form.batch_ref} onChange={e => setForm(f => ({ ...f, batch_ref: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Total Qty (kg) <span className="text-red-500">*</span></label>
                <input type="number" step="0.001" min="0.001" className="input w-full" placeholder="e.g. 5000" value={form.qty_kg} onChange={e => setForm(f => ({ ...f, qty_kg: e.target.value }))} required />
              </div>
            </div>

            {/* Cost fields */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {LC_COST_FIELDS.map(({ key, label }) => (
                <div key={key}>
                  <label className="block text-xs font-medium text-gray-700 mb-1">{label}</label>
                  <input
                    type="number" step="0.01" min="0"
                    className="input w-full"
                    placeholder="0.00"
                    value={form[key]}
                    onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                  />
                </div>
              ))}
            </div>

            {/* Running total preview */}
            <div className="bg-white border border-green-300 rounded-lg px-4 py-3 flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Running Total</p>
                <p className="text-2xl font-black text-green-700">{fmt$(runningTotal)}</p>
              </div>
              {costPerKgPreview && (
                <div className="text-right">
                  <p className="text-xs text-gray-500">Cost per kg</p>
                  <p className="text-xl font-bold text-gray-800">${costPerKgPreview}/kg</p>
                </div>
              )}
            </div>

            {/* Currency + Notes */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Currency</label>
                <select className="input w-full" value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))}>
                  {['USD','AUD','EUR','GBP','CAD','INR','NZD'].map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Notes</label>
                <input type="text" className="input w-full" placeholder="Optional notes…" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
            </div>

            {formError && <p className="text-sm text-red-600 flex items-center gap-1"><AlertTriangle size={14} /> {formError}</p>}
            <div className="flex gap-2">
              <button type="submit" className="btn-primary flex items-center gap-1.5" disabled={saving}>
                {saving && <Loader2 size={14} className="animate-spin" />}
                {editId ? 'Update' : 'Save'} Landed Cost
              </button>
              <button type="button" className="btn-secondary" onClick={() => { setShowForm(false); setEditId(null) }}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="animate-spin text-blue-500" size={28} /></div>
      ) : error ? (
        <div className="card text-red-600 flex items-center gap-2"><AlertTriangle size={18} /> {error}</div>
      ) : records.length === 0 ? (
        <div className="card text-center py-12 text-gray-400">
          <DollarSign size={36} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium">No landed costs recorded yet.</p>
          <p className="text-sm mt-1">Add a landed cost to track the true cost per kg of each bulk batch.</p>
        </div>
      ) : (
        <div className="card p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3 text-left">Batch Ref</th>
                <th className="px-4 py-3 text-left">Bulk SKU</th>
                <th className="px-4 py-3 text-right">Qty (kg)</th>
                <th className="px-4 py-3 text-right">Material</th>
                <th className="px-4 py-3 text-right">Freight</th>
                <th className="px-4 py-3 text-right">Duty</th>
                <th className="px-4 py-3 text-right">Pkg Mat</th>
                <th className="px-4 py-3 text-right">Labor</th>
                <th className="px-4 py-3 text-right">Overhead</th>
                <th className="px-4 py-3 text-right">Other</th>
                <th className="px-4 py-3 text-right font-bold text-gray-700">Total</th>
                <th className="px-4 py-3 text-right font-bold text-gray-700">Cost/kg</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {records.map(lc => (
                <tr key={lc.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-800">{lc.batch_ref || '—'}</div>
                    <div className="text-xs text-gray-400">{lc.currency} · {new Date(lc.created_at).toLocaleDateString()}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-800">{lc.bulk_sku_name}</div>
                    <div className="text-xs text-gray-400">{lc.bulk_sku_code}</div>
                  </td>
                  <td className="px-4 py-3 text-right font-mono">{(+lc.qty_kg).toFixed(2)}</td>
                  <td className="px-4 py-3 text-right font-mono">{fmt$(lc.cost_material)}</td>
                  <td className="px-4 py-3 text-right font-mono">{fmt$(lc.cost_freight)}</td>
                  <td className="px-4 py-3 text-right font-mono">{fmt$(lc.cost_duty)}</td>
                  <td className="px-4 py-3 text-right font-mono">{fmt$(lc.cost_packaging_mat)}</td>
                  <td className="px-4 py-3 text-right font-mono">{fmt$(lc.cost_labor)}</td>
                  <td className="px-4 py-3 text-right font-mono">{fmt$(lc.cost_overhead)}</td>
                  <td className="px-4 py-3 text-right font-mono">{fmt$(lc.cost_other)}</td>
                  <td className="px-4 py-3 text-right font-mono font-bold text-gray-800">{fmt$(lc.total_cost)}</td>
                  <td className="px-4 py-3 text-right font-mono font-bold text-green-700">
                    {lc.cost_per_kg != null ? `$${(+lc.cost_per_kg).toFixed(4)}/kg` : '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => openEdit(lc)} className="p-1.5 text-gray-400 hover:text-blue-500 rounded transition-colors" title="Edit"><Edit2 size={13} /></button>
                      <button onClick={() => handleDelete(lc.id)} className="p-1.5 text-gray-400 hover:text-red-500 rounded transition-colors" title="Delete"><Trash2 size={13} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Operational Costs card (inside Run Detail) ────────────────
function OperationalCostsCard({ runDetail, onSaved }) {
  const [costs, setCosts]     = useState(null)
  const [summary, setSummary] = useState(null)
  const [loadingCosts, setLoadingCosts] = useState(true)
  const [loadingSummary, setLoadingSummary] = useState(false)
  const [form, setForm] = useState({
    cost_packaging_mat: '', cost_labor: '', cost_overhead: '', cost_other: '', labor_hours: '', notes: '',
  })
  const [saving, setSaving]   = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [saveOk, setSaveOk]   = useState(false)

  const loadCosts = useCallback(async () => {
    setLoadingCosts(true)
    try {
      const res = await repackingAPI.getRunCosts(runDetail.id)
      const d = res.data
      setCosts(d)
      setForm({
        cost_packaging_mat: d.cost_packaging_mat != null ? String(d.cost_packaging_mat) : '',
        cost_labor:         d.cost_labor != null ? String(d.cost_labor) : '',
        cost_overhead:      d.cost_overhead != null ? String(d.cost_overhead) : '',
        cost_other:         d.cost_other != null ? String(d.cost_other) : '',
        labor_hours:        d.labor_hours != null ? String(d.labor_hours) : '',
        notes:              d.notes || '',
      })
    } catch {}
    finally { setLoadingCosts(false) }
  }, [runDetail.id])

  const loadSummary = useCallback(async () => {
    if (runDetail.status !== 'closed') return
    setLoadingSummary(true)
    try {
      const res = await repackingAPI.costSummary(runDetail.id)
      setSummary(res.data)
    } catch {}
    finally { setLoadingSummary(false) }
  }, [runDetail.id, runDetail.status])

  useEffect(() => { loadCosts() }, [loadCosts])
  useEffect(() => { loadSummary() }, [loadSummary])

  const handleSave = async (e) => {
    e.preventDefault(); setSaveError(null); setSaveOk(false)
    setSaving(true)
    try {
      await repackingAPI.saveRunCosts(runDetail.id, {
        cost_packaging_mat: parseFloat(form.cost_packaging_mat) || 0,
        cost_labor:         parseFloat(form.cost_labor) || 0,
        cost_overhead:      parseFloat(form.cost_overhead) || 0,
        cost_other:         parseFloat(form.cost_other) || 0,
        labor_hours:        form.labor_hours ? parseFloat(form.labor_hours) : null,
        notes:              form.notes || null,
      })
      setSaveOk(true)
      await loadCosts()
      await loadSummary()
      if (onSaved) onSaved()
    } catch (e) {
      setSaveError(e.response?.data?.detail || 'Failed to save costs')
    } finally { setSaving(false) }
  }

  const totalPacking =
    (parseFloat(form.cost_packaging_mat) || 0) +
    (parseFloat(form.cost_labor) || 0) +
    (parseFloat(form.cost_overhead) || 0) +
    (parseFloat(form.cost_other) || 0)

  const totalCases = runDetail.outputs?.reduce((s, o) => s + (o.qty_packed || 0), 0) ?? 0
  const costPerCase = totalCases > 0 ? totalPacking / totalCases : 0

  if (loadingCosts) {
    return (
      <div className="card flex justify-center py-8">
        <Loader2 className="animate-spin text-blue-500" size={22} />
      </div>
    )
  }

  return (
    <div className="card space-y-5">
      <div className="flex items-center gap-2">
        <DollarSign size={18} className="text-green-600" />
        <h3 className="font-semibold text-gray-800 text-base">Operational Costs</h3>
      </div>

      {/* Section A: Packing run costs form */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">
          Section A — Packing Run Costs
        </p>
        <form onSubmit={handleSave} className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { key: 'cost_packaging_mat', label: 'Packaging Materials ($)' },
              { key: 'cost_labor',         label: 'Labor ($)' },
              { key: 'cost_overhead',      label: 'Overhead ($)' },
              { key: 'cost_other',         label: 'Other ($)' },
            ].map(({ key, label }) => (
              <div key={key}>
                <label className="block text-xs font-medium text-gray-700 mb-1">{label}</label>
                <input
                  type="number" step="0.01" min="0"
                  className="input w-full"
                  placeholder="0.00"
                  value={form[key]}
                  onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                />
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Labor Hours (optional)</label>
              <input
                type="number" step="0.25" min="0"
                className="input w-full"
                placeholder="e.g. 8.5"
                value={form.labor_hours}
                onChange={e => setForm(f => ({ ...f, labor_hours: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Notes</label>
              <input
                type="text"
                className="input w-full"
                placeholder="Optional notes…"
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              />
            </div>
          </div>

          {/* Live totals */}
          <div className="bg-gray-50 rounded-lg px-4 py-3 grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-500">Total packing cost</span>
              <span className="ml-2 font-bold text-gray-800">{fmt$(totalPacking)}</span>
            </div>
            <div>
              <span className="text-gray-500">Cost per case</span>
              <span className="ml-2 font-bold text-gray-800">{fmt$(costPerCase)}</span>
              <span className="text-xs text-gray-400 ml-1">({totalCases} cases)</span>
            </div>
          </div>

          {saveError && <p className="text-sm text-red-600 flex items-center gap-1"><AlertTriangle size={14} /> {saveError}</p>}
          {saveOk && <p className="text-sm text-green-600 flex items-center gap-1"><CheckCircle2 size={14} /> Costs saved successfully.</p>}

          <button type="submit" className="btn-primary flex items-center gap-1.5" disabled={saving}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Save Costs
          </button>
        </form>
      </div>

      {/* Section B: Full cost breakdown (only when closed + landed cost exists) */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">
          Section B — Full Cost Breakdown
        </p>

        {runDetail.status === 'open' ? (
          <div className="text-sm text-gray-500 italic bg-gray-50 rounded-lg p-3">
            Cost breakdown will be available once you close the run.
          </div>
        ) : loadingSummary ? (
          <div className="flex justify-center py-6"><Loader2 className="animate-spin text-blue-500" size={20} /></div>
        ) : summary && summary.cost_per_kg === 0 ? (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2 text-sm text-amber-800">
            <AlertTriangle size={15} className="mt-0.5 shrink-0" />
            <span>
              No landed cost recorded for <strong>{summary.bulk_sku_name || 'this bulk SKU'}</strong> — add one in the <strong>Landed Costs</strong> tab to see full cost breakdown.
            </span>
          </div>
        ) : summary ? (
          <div className="bg-gray-900 text-gray-100 rounded-xl p-5 font-mono text-sm space-y-4">
            {/* Header line */}
            <div className="border-b border-gray-600 pb-2 text-gray-300 text-xs">
              {'━'.repeat(52)}
            </div>

            {/* Bulk material cost */}
            <div className="space-y-1">
              <div className="text-green-400 font-bold uppercase tracking-wide text-xs">
                Bulk Material Cost {summary.landed_cost_ref ? `(Batch: "${summary.landed_cost_ref}")` : ''}
              </div>
              <div className="flex justify-between text-gray-200">
                <span>{(+summary.total_theoretical_kg).toFixed(3)} kg × ${(+summary.cost_per_kg).toFixed(4)}/kg</span>
                <span className="font-bold text-white">{fmt$(summary.bulk_material_cost)}</span>
              </div>
            </div>

            {/* Packing run costs */}
            <div className="space-y-1">
              <div className="text-blue-400 font-bold uppercase tracking-wide text-xs">Packing Run Costs</div>
              {[
                ['Packaging materials', summary.packing_costs.cost_packaging_mat],
                ['Labor' + (summary.packing_costs.labor_hours ? ` (${summary.packing_costs.labor_hours} hrs)` : ''), summary.packing_costs.cost_labor],
                ['Overhead',            summary.packing_costs.cost_overhead],
                ['Other',              summary.packing_costs.cost_other],
              ].map(([label, val]) => (
                <div key={label} className="flex justify-between text-gray-300">
                  <span className="pl-4">{label}</span>
                  <span>{fmt$(val)}</span>
                </div>
              ))}
              <div className="flex justify-between border-t border-gray-600 pt-1 text-white">
                <span className="pl-4 text-gray-400">{'─'.repeat(30)}</span>
                <span className="font-bold">{fmt$(summary.packing_costs.total)}</span>
              </div>
            </div>

            {/* Per output breakdown */}
            {summary.per_output?.length > 0 && (
              <div className="space-y-2">
                <div className="text-yellow-400 font-bold uppercase tracking-wide text-xs">Per Output Breakdown</div>
                {summary.per_output.map(o => (
                  <div key={o.sku_id} className="pl-2 space-y-0.5">
                    <div className="text-gray-200 font-semibold">
                      {o.product_name} ({o.qty_packed} cases{o.kg_used ? `, ${(+o.kg_used).toFixed(1)} kg bulk` : ''})
                    </div>
                    {o.bom_qty_per_unit != null && (
                      <div className="flex justify-between text-gray-400 pl-4">
                        <span>Material: {o.bom_qty_per_unit} kg × ${(+summary.cost_per_kg).toFixed(4)}</span>
                        <span>{fmt$(o.material_per_case)}/case</span>
                      </div>
                    )}
                    <div className="flex justify-between text-gray-400 pl-4">
                      <span>+ Packing share</span>
                      <span>{fmt$(o.packing_per_case)}/case</span>
                    </div>
                    <div className="flex justify-between text-white font-bold pl-4 border-t border-gray-700 pt-0.5">
                      <span>{'══'} Total cost per case</span>
                      <span>{fmt$(o.total_per_case)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Grand totals */}
            <div className="border-t border-gray-500 pt-3 space-y-1">
              <div className="text-gray-300 text-xs">{'━'.repeat(52)}</div>
              <div className="flex justify-between text-white font-bold text-base">
                <span>GRAND TOTAL PRODUCTION COST</span>
                <span className="text-green-400">{fmt$(summary.grand_total_cost)}</span>
              </div>
              <div className="flex justify-between text-gray-300">
                <span>AVG COST PER CASE</span>
                <span className="font-bold text-yellow-300">{fmt$(summary.grand_total_per_case_avg)}</span>
              </div>
              <div className="text-gray-300 text-xs">{'━'.repeat(52)}</div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

// ── Tab 3: Packing Runs ───────────────────────────────────────
function RunsTab({ skus }) {
  const [runs, setRuns]         = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)
  const [selectedRun, setSelectedRun] = useState(null)
  const [runDetail, setRunDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [showNewRun, setShowNewRun] = useState(false)

  const [runForm, setRunForm] = useState({ run_ref: '', bulk_sku_id: '', qty_start: '', started_by: '', notes: '' })
  const [runFormError, setRunFormError] = useState(null)
  const [creatingRun, setCreatingRun]   = useState(false)

  const [showAddOutput, setShowAddOutput] = useState(false)
  const [outputForm, setOutputForm]       = useState({ sku_id: '', qty_packed: '' })
  const [outputFormError, setOutputFormError] = useState(null)
  const [addingOutput, setAddingOutput]   = useState(false)

  const [showClose, setShowClose]   = useState(false)
  const [closeQtyEnd, setCloseQtyEnd] = useState({})
  const [closing, setClosing]         = useState(false)
  const [closeError, setCloseError]   = useState(null)

  const loadRuns = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await repackingAPI.listRuns()
      setRuns(res.data)
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to load runs')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { loadRuns() }, [loadRuns])

  const loadDetail = async (id) => {
    setDetailLoading(true)
    try {
      const res = await repackingAPI.getRun(id)
      setRunDetail(res.data)
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to load run detail')
    } finally { setDetailLoading(false) }
  }

  const handleSelectRun = (run) => {
    setSelectedRun(run)
    setRunDetail(null)
    setShowAddOutput(false)
    setShowClose(false)
    setCloseError(null)
    loadDetail(run.id)
  }

  const handleCreateRun = async (e) => {
    e.preventDefault(); setRunFormError(null)
    if (!runForm.bulk_sku_id || !runForm.qty_start) {
      setRunFormError('Please select a bulk SKU and enter starting weight.'); return
    }
    setCreatingRun(true)
    try {
      const res = await repackingAPI.createRun({
        run_ref:     runForm.run_ref || null,
        bulk_sku_id: parseInt(runForm.bulk_sku_id),
        qty_start:   parseFloat(runForm.qty_start),
        started_by:  runForm.started_by || null,
        notes:       runForm.notes || null,
      })
      setShowNewRun(false)
      setRunForm({ run_ref: '', bulk_sku_id: '', qty_start: '', started_by: '', notes: '' })
      await loadRuns()
      handleSelectRun(res.data)
    } catch (e) {
      setRunFormError(e.response?.data?.detail || 'Failed to create run')
    } finally { setCreatingRun(false) }
  }

  const handleAddOutput = async (e) => {
    e.preventDefault(); setOutputFormError(null)
    if (!outputForm.sku_id || !outputForm.qty_packed) {
      setOutputFormError('Please select a SKU and enter quantity packed.'); return
    }
    setAddingOutput(true)
    try {
      await repackingAPI.addOutput(runDetail.id, {
        sku_id:     parseInt(outputForm.sku_id),
        qty_packed: parseFloat(outputForm.qty_packed),
      })
      setShowAddOutput(false)
      setOutputForm({ sku_id: '', qty_packed: '' })
      loadDetail(runDetail.id)
    } catch (e) {
      setOutputFormError(e.response?.data?.detail || 'Failed to add output')
    } finally { setAddingOutput(false) }
  }

  const handleRemoveOutput = async (skuId) => {
    if (!window.confirm('Remove this output line?')) return
    try {
      await repackingAPI.removeOutput(runDetail.id, skuId)
      loadDetail(runDetail.id)
    } catch (e) { alert(e.response?.data?.detail || 'Failed to remove output') }
  }

  const handleCloseRun = async (e) => {
    e.preventDefault(); setCloseError(null)
    const bulkEntries = runDetail.bulk_entries.map(b => ({
      bulk_sku_id: b.bulk_sku_id,
      qty_end: parseFloat(closeQtyEnd[b.bulk_sku_id] ?? 0),
    }))
    const invalid = bulkEntries.some(b => isNaN(b.qty_end) || b.qty_end < 0)
    if (invalid) { setCloseError('Please enter a valid ending weight for all bulk materials.'); return }
    setClosing(true)
    try {
      const res = await repackingAPI.closeRun(runDetail.id, { bulk_entries: bulkEntries })
      setRunDetail(res.data)
      setShowClose(false)
      loadRuns()
    } catch (e) {
      setCloseError(e.response?.data?.detail || 'Failed to close run')
    } finally { setClosing(false) }
  }

  // ── Run detail view ─────────────────────────────────────────
  if (selectedRun) {
    return (
      <div>
        <button
          onClick={() => { setSelectedRun(null); setRunDetail(null) }}
          className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 mb-4 font-medium"
        >
          <ChevronLeft size={16} /> Back to Runs
        </button>

        {detailLoading && !runDetail ? (
          <div className="flex justify-center py-12"><Loader2 className="animate-spin text-blue-500" size={28} /></div>
        ) : runDetail ? (
          <div className="space-y-4">
            {/* Run header */}
            <div className="card">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <StatusBadge status={runDetail.status} />
                    {runDetail.flag_high_variance && (
                      <span className="flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                        <AlertTriangle size={11} /> HIGH VARIANCE
                      </span>
                    )}
                  </div>
                  <h2 className="text-lg font-bold text-gray-800">{runDetail.run_ref || `Run #${runDetail.id}`}</h2>
                  <div className="flex flex-wrap gap-4 mt-2 text-sm text-gray-500">
                    <span>Started: {runDetail.created_at ? new Date(runDetail.created_at).toLocaleString() : '—'}</span>
                    {runDetail.started_by && <span>Operator: <span className="font-medium text-gray-700">{runDetail.started_by}</span></span>}
                    {runDetail.closed_at && <span>Closed: {new Date(runDetail.closed_at).toLocaleString()}</span>}
                  </div>
                  {runDetail.notes && <p className="text-sm text-gray-500 mt-1 italic">{runDetail.notes}</p>}
                </div>
              </div>

              {runDetail.status === 'closed' && (
                <div className={`mt-4 rounded-lg p-3 ${varianceBg(runDetail.variance_pct)}`}>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                    <div>
                      <div className="text-xs text-gray-500 mb-0.5">Theoretical</div>
                      <div className="font-bold text-gray-800">{(runDetail.theoretical_kg ?? 0).toFixed(3)} kg</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500 mb-0.5">Actual Used</div>
                      <div className="font-bold text-gray-800">{(runDetail.actual_kg ?? 0).toFixed(3)} kg</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500 mb-0.5">Variance</div>
                      <div className={`font-bold ${varianceColor(runDetail.variance_pct)}`}>
                        {runDetail.variance_kg != null ? `${runDetail.variance_kg >= 0 ? '+' : ''}${runDetail.variance_kg.toFixed(3)} kg` : '—'}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500 mb-0.5">Variance %</div>
                      <div className={`font-bold ${varianceColor(runDetail.variance_pct)}`}>
                        <VarianceBadge pct={runDetail.variance_pct} />
                      </div>
                    </div>
                  </div>
                  {runDetail.variance_pct != null && Math.abs(runDetail.variance_pct) > 5 && (
                    <div className="mt-2 flex items-center gap-2 text-red-700 text-sm font-semibold">
                      <AlertTriangle size={16} /> HIGH VARIANCE — Possible Waste or Theft. Investigate immediately.
                    </div>
                  )}
                  {runDetail.variance_pct != null && Math.abs(runDetail.variance_pct) > 2 && Math.abs(runDetail.variance_pct) <= 5 && (
                    <div className="mt-2 flex items-center gap-2 text-amber-700 text-sm font-semibold">
                      <AlertTriangle size={16} /> Variance above allowed threshold. Review packing records.
                    </div>
                  )}
                  {runDetail.variance_pct != null && Math.abs(runDetail.variance_pct) <= 2 && (
                    <div className="mt-2 flex items-center gap-2 text-green-700 text-sm font-semibold">
                      <CheckCircle2 size={16} /> Variance within acceptable range.
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Outputs section */}
            <div className="card">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-gray-800">Cases Packed</h3>
                {runDetail.status === 'open' && (
                  <button onClick={() => { setShowAddOutput(s => !s); setOutputFormError(null) }} className="btn-secondary flex items-center gap-1.5 text-sm">
                    <Plus size={14} /> Add Cases
                  </button>
                )}
              </div>

              {showAddOutput && runDetail.status === 'open' && (
                <form onSubmit={handleAddOutput} className="mb-4 p-3 bg-gray-50 rounded-lg space-y-2">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Retail SKU (what was packed)</label>
                      <select className="input w-full" value={outputForm.sku_id} onChange={e => setOutputForm(f => ({ ...f, sku_id: e.target.value }))} required>
                        <option value="">Select SKU…</option>
                        {skus.map(s => <option key={s.id} value={s.id}>{s.product_name} ({s.sku_code})</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Cases packed</label>
                      <input type="number" step="1" min="1" className="input w-full" placeholder="e.g. 50 cases" value={outputForm.qty_packed} onChange={e => setOutputForm(f => ({ ...f, qty_packed: e.target.value }))} required />
                    </div>
                  </div>
                  {outputFormError && <p className="text-xs text-red-600 flex items-center gap-1"><AlertTriangle size={12} /> {outputFormError}</p>}
                  <div className="flex gap-2">
                    <button type="submit" className="btn-primary text-sm" disabled={addingOutput}>
                      {addingOutput && <Loader2 size={13} className="animate-spin inline mr-1" />} Save
                    </button>
                    <button type="button" className="btn-secondary text-sm" onClick={() => setShowAddOutput(false)}>Cancel</button>
                  </div>
                </form>
              )}

              {runDetail.outputs.length === 0 ? (
                <p className="text-sm text-gray-400 py-4 text-center">No outputs added yet. Add each product type you packed.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="text-xs text-gray-500 uppercase tracking-wide">
                    <tr>
                      <th className="pb-2 text-left">SKU</th>
                      <th className="pb-2 text-right">Cases</th>
                      <th className="pb-2 text-right">BOM rate</th>
                      <th className="pb-2 text-right">Bulk used</th>
                      {runDetail.status === 'open' && <th className="pb-2" />}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {runDetail.outputs.map(o => {
                      const liveKg = o.bom_live_kg ?? o.theoretical_kg
                      return (
                        <tr key={o.id}>
                          <td className="py-2">
                            <div className="font-medium text-gray-800">{o.product_name}</div>
                            <div className="text-xs text-gray-400">{o.sku_code}</div>
                          </td>
                          <td className="py-2 text-right font-mono font-semibold">{o.qty_packed}</td>
                          <td className="py-2 text-right text-xs text-gray-500">
                            {o.bom_qty_per_unit != null
                              ? `${o.bom_qty_per_unit} ${o.bom_unit ?? 'kg'}/case`
                              : <span className="text-orange-500">No BOM</span>}
                          </td>
                          <td className="py-2 text-right font-mono">
                            {liveKg != null
                              ? <span className="font-semibold text-blue-700">{liveKg.toFixed(3)} kg</span>
                              : '—'}
                          </td>
                          {runDetail.status === 'open' && (
                            <td className="py-2 text-right">
                              <button onClick={() => handleRemoveOutput(o.sku_id)} className="p-1 text-gray-400 hover:text-red-500 rounded" title="Remove"><X size={13} /></button>
                            </td>
                          )}
                        </tr>
                      )
                    })}
                    {runDetail.outputs.length > 1 && (
                      <tr className="border-t-2 border-gray-300 bg-gray-50">
                        <td className="py-2 font-semibold text-gray-700" colSpan={2}>Total bulk consumed</td>
                        <td />
                        <td className="py-2 text-right font-bold text-blue-700">
                          {calcTheoreticalKg(runDetail.outputs).toFixed(3)} kg
                        </td>
                        {runDetail.status === 'open' && <td />}
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>

            {/* Expected remaining on scale (open runs) */}
            {runDetail.status === 'open' && runDetail.outputs.length > 0 && runDetail.bulk_entries.length > 0 && (() => {
              const theoretical = calcTheoreticalKg(runDetail.outputs)
              const qtyStart    = runDetail.bulk_entries[0]?.qty_start
              const expected    = calcExpectedRemaining(qtyStart, theoretical)
              const hasBom      = runDetail.outputs.some(o => o.bom_qty_per_unit != null)
              if (!hasBom) return null
              return (
                <div className="rounded-xl border-2 border-blue-400 bg-blue-50 p-4 space-y-3">
                  <div className="flex items-center gap-2 text-blue-800 font-bold text-base">
                    <Scale size={18} /> Packing Summary
                  </div>
                  <div className="space-y-1 text-sm">
                    {runDetail.outputs.filter(o => o.bom_live_kg != null).map(o => (
                      <div key={o.id} className="flex justify-between text-gray-700">
                        <span>{o.product_name} × {o.qty_packed} cases</span>
                        <span className="font-mono font-semibold">{o.bom_live_kg.toFixed(3)} kg</span>
                      </div>
                    ))}
                    <div className="border-t border-blue-200 mt-1 pt-1 flex justify-between font-semibold text-gray-800">
                      <span>Total bulk consumed (theoretical)</span>
                      <span className="font-mono">{theoretical.toFixed(3)} kg</span>
                    </div>
                    <div className="flex justify-between text-gray-600">
                      <span>Bulk starting weight</span>
                      <span className="font-mono">{qtyStart?.toFixed(3)} kg</span>
                    </div>
                  </div>
                  <div className="bg-white border-2 border-blue-500 rounded-lg px-4 py-3 flex items-center justify-between">
                    <div>
                      <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Expected remaining on scale</p>
                      <p className="text-3xl font-black text-blue-700 mt-0.5">{expected?.toFixed(3)} kg</p>
                    </div>
                    <div className="text-right text-xs text-gray-400">
                      <p>{qtyStart?.toFixed(3)} kg start</p>
                      <p>− {theoretical.toFixed(3)} kg used</p>
                    </div>
                  </div>
                  <p className="text-xs text-blue-600">
                    Weigh what's left on the scale. If it matches the expected weight above, all bulk is accounted for.
                  </p>
                </div>
              )
            })()}

            {/* Bulk usage section */}
            <div className="card">
              <h3 className="font-semibold text-gray-800 mb-3">Bulk Material Usage</h3>
              {runDetail.bulk_entries.length === 0 ? (
                <p className="text-sm text-gray-400">No bulk entries.</p>
              ) : (
                <div className="space-y-3">
                  {runDetail.bulk_entries.map(b => (
                    <div key={b.id} className="bg-gray-50 rounded-lg p-3">
                      <div className="font-medium text-gray-800 mb-2">{b.product_name} <span className="text-xs text-gray-400">{b.sku_code}</span></div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                        <div><div className="text-xs text-gray-500">Start Weight</div><div className="font-medium">{b.qty_start} kg</div></div>
                        <div><div className="text-xs text-gray-500">End Weight</div><div className="font-medium">{b.qty_end != null ? `${b.qty_end} kg` : '—'}</div></div>
                        <div><div className="text-xs text-gray-500">Actual Used</div><div className="font-medium">{b.actual_used != null ? `${b.actual_used.toFixed(3)} kg` : '—'}</div></div>
                        <div>
                          <div className="text-xs text-gray-500">Variance</div>
                          <div className={`font-medium ${varianceColor(b.variance_pct)}`}>
                            {b.variance != null ? `${b.variance >= 0 ? '+' : ''}${b.variance.toFixed(3)} kg` : '—'}
                            {b.variance_pct != null && <span className="ml-1 text-xs">({b.variance_pct >= 0 ? '+' : ''}{b.variance_pct.toFixed(1)}%)</span>}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Operational Costs card (new) */}
            <OperationalCostsCard
              runDetail={runDetail}
              onSaved={() => loadDetail(runDetail.id)}
            />

            {/* Close run section */}
            {runDetail.status === 'open' && (
              <div className="card border border-orange-200 bg-orange-50">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-gray-800">Close Packing Run</h3>
                  <button
                    onClick={() => {
                      setShowClose(s => !s)
                      setCloseError(null)
                      const init = {}
                      runDetail.bulk_entries.forEach(b => { init[b.bulk_sku_id] = '' })
                      setCloseQtyEnd(init)
                    }}
                    className="btn-primary flex items-center gap-1.5 text-sm"
                  >
                    <Scale size={14} /> Weigh & Close
                  </button>
                </div>

                {showClose && (
                  <form onSubmit={handleCloseRun} className="space-y-4 mt-3">
                    {runDetail.bulk_entries.map(b => {
                      const theoretical  = calcTheoreticalKg(runDetail.outputs)
                      const expected     = calcExpectedRemaining(b.qty_start, theoretical)
                      const actualInput  = parseFloat(closeQtyEnd[b.bulk_sku_id])
                      const actualUsed   = !isNaN(actualInput) ? b.qty_start - actualInput : null
                      const liveVariance = actualUsed != null ? actualUsed - theoretical : null
                      const liveVariancePct = theoretical > 0 && liveVariance != null
                        ? (liveVariance / theoretical * 100) : null
                      return (
                        <div key={b.id} className="space-y-3">
                          <div className="bg-white border border-blue-300 rounded-xl p-3">
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                              {b.product_name} — {b.qty_start} kg started
                            </p>
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="text-xs text-gray-500">Expected remaining on scale</p>
                                <p className="text-2xl font-black text-blue-700">{expected != null ? `${expected.toFixed(3)} kg` : '—'}</p>
                                <p className="text-xs text-gray-400 mt-0.5">({b.qty_start} kg start − {theoretical.toFixed(3)} kg theoretical use)</p>
                              </div>
                            </div>
                          </div>
                          <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">
                              Weigh the remaining bulk → enter actual weight on scale (kg)
                            </label>
                            <div className="flex items-center gap-3">
                              <input
                                type="number" step="0.001" min="0"
                                className="input w-40 text-lg font-bold"
                                placeholder={expected != null ? `Should be ~${expected.toFixed(1)}` : 'kg'}
                                value={closeQtyEnd[b.bulk_sku_id] ?? ''}
                                onChange={e => setCloseQtyEnd(prev => ({ ...prev, [b.bulk_sku_id]: e.target.value }))}
                                required
                              />
                              <span className="text-sm text-gray-500 font-medium">kg remaining on scale</span>
                            </div>
                          </div>
                          {liveVariance != null && (
                            <div className={`rounded-lg px-4 py-3 ${Math.abs(liveVariancePct ?? 0) <= 2 ? 'bg-green-50 border border-green-200' : Math.abs(liveVariancePct ?? 0) <= 5 ? 'bg-amber-50 border border-amber-200' : 'bg-red-50 border border-red-200'}`}>
                              <div className="grid grid-cols-3 gap-3 text-sm">
                                <div><p className="text-xs text-gray-500">Theoretical used</p><p className="font-bold">{theoretical.toFixed(3)} kg</p></div>
                                <div><p className="text-xs text-gray-500">Actual used</p><p className="font-bold">{actualUsed?.toFixed(3)} kg</p></div>
                                <div>
                                  <p className="text-xs text-gray-500">Variance</p>
                                  <p className={`font-bold ${varianceColor(liveVariancePct)}`}>
                                    {liveVariance >= 0 ? '+' : ''}{liveVariance.toFixed(3)} kg
                                    {liveVariancePct != null && <span className="ml-1 text-xs">({liveVariancePct >= 0 ? '+' : ''}{liveVariancePct.toFixed(1)}%)</span>}
                                  </p>
                                </div>
                              </div>
                              {liveVariancePct != null && Math.abs(liveVariancePct) > 5 && (
                                <p className="mt-2 text-sm font-bold text-red-700 flex items-center gap-1"><AlertTriangle size={14} /> HIGH VARIANCE — {Math.abs(liveVariance).toFixed(3)} kg unaccounted for.</p>
                              )}
                              {liveVariancePct != null && Math.abs(liveVariancePct) > 2 && Math.abs(liveVariancePct) <= 5 && (
                                <p className="mt-2 text-sm font-semibold text-amber-700 flex items-center gap-1"><AlertTriangle size={14} /> Above normal waste tolerance — review before closing.</p>
                              )}
                              {liveVariancePct != null && Math.abs(liveVariancePct) <= 2 && (
                                <p className="mt-2 text-sm font-semibold text-green-700 flex items-center gap-1"><CheckCircle2 size={14} /> All bulk accounted for — within acceptable range.</p>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                    {closeError && <p className="text-sm text-red-600 flex items-center gap-1"><AlertTriangle size={14} /> {closeError}</p>}
                    <div className="flex gap-2">
                      <button type="submit" className="btn-primary flex items-center gap-1.5" disabled={closing}>
                        {closing && <Loader2 size={14} className="animate-spin" />} Confirm & Close Run
                      </button>
                      <button type="button" className="btn-secondary" onClick={() => setShowClose(false)}>Cancel</button>
                    </div>
                  </form>
                )}
              </div>
            )}
          </div>
        ) : null}
      </div>
    )
  }

  // Run list view
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">Packing Runs</h2>
          <p className="text-sm text-gray-500 mt-0.5">Track each bulk-to-retail packing session and measure waste.</p>
        </div>
        <button onClick={() => { setShowNewRun(s => !s); setRunFormError(null) }} className="btn-primary flex items-center gap-1.5">
          <Plus size={15} /> New Run
        </button>
      </div>

      {showNewRun && (
        <div className="card mb-4 border border-blue-200 bg-blue-50">
          <h3 className="font-semibold text-gray-800 mb-3">Start New Packing Run</h3>
          <form onSubmit={handleCreateRun} className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Run Reference (order name / batch label)</label>
                <input type="text" className="input w-full" placeholder="e.g. ORD-2026-001 or Batch A" value={runForm.run_ref} onChange={e => setRunForm(f => ({ ...f, run_ref: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Bulk Material SKU <span className="text-red-500">*</span></label>
                <select className="input w-full" value={runForm.bulk_sku_id} onChange={e => setRunForm(f => ({ ...f, bulk_sku_id: e.target.value }))} required>
                  <option value="">Select bulk material…</option>
                  {skus.map(s => <option key={s.id} value={s.id}>{s.product_name} ({s.sku_code})</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Starting Weight (kg) <span className="text-red-500">*</span></label>
                <input type="number" step="0.001" min="0.001" className="input w-full" placeholder="e.g. 1000" value={runForm.qty_start} onChange={e => setRunForm(f => ({ ...f, qty_start: e.target.value }))} required />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Operator Name</label>
                <input type="text" className="input w-full" placeholder="Who is running this pack?" value={runForm.started_by} onChange={e => setRunForm(f => ({ ...f, started_by: e.target.value }))} />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Notes</label>
              <input type="text" className="input w-full" placeholder="Optional notes…" value={runForm.notes} onChange={e => setRunForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
            {runFormError && <p className="text-sm text-red-600 flex items-center gap-1"><AlertTriangle size={14} /> {runFormError}</p>}
            <div className="flex gap-2">
              <button type="submit" className="btn-primary flex items-center gap-1.5" disabled={creatingRun}>
                {creatingRun && <Loader2 size={14} className="animate-spin" />} Start Run
              </button>
              <button type="button" className="btn-secondary" onClick={() => setShowNewRun(false)}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="animate-spin text-blue-500" size={28} /></div>
      ) : error ? (
        <div className="card text-red-600 flex items-center gap-2"><AlertTriangle size={18} /> {error}</div>
      ) : runs.length === 0 ? (
        <div className="card text-center py-12 text-gray-400">
          <Factory size={36} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium">No packing runs yet.</p>
          <p className="text-sm mt-1">Start a new run to begin tracking bulk-to-retail packing.</p>
        </div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3 text-left">Run</th>
                <th className="px-4 py-3 text-left">Bulk Material</th>
                <th className="px-4 py-3 text-left">Date</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-right">Variance %</th>
                <th className="px-4 py-3 text-right">Flag</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {runs.map(r => (
                <tr key={r.id} className="hover:bg-blue-50 cursor-pointer transition-colors" onClick={() => handleSelectRun(r)}>
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-800">{r.run_ref || `Run #${r.id}`}</div>
                    {r.started_by && <div className="text-xs text-gray-400">{r.started_by}</div>}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{r.bulk_sku_name || '—'}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{r.created_at ? new Date(r.created_at).toLocaleDateString() : '—'}</td>
                  <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                  <td className="px-4 py-3 text-right"><VarianceBadge pct={r.variance_pct} /></td>
                  <td className="px-4 py-3 text-right">
                    {r.flag_high_variance && <span title="High variance detected" className="text-red-500"><AlertTriangle size={15} /></span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Tab 4: Summary ────────────────────────────────────────────
function SummaryTab() {
  const [summary, setSummary]     = useState(null)
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState(null)
  const [costData, setCostData]   = useState({})   // { runId: summaryObj }
  const [costsLoading, setCostsLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await repackingAPI.summary()
      setSummary(res.data)
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to load summary')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  // After summary loads, fetch cost-summary for each closed run
  useEffect(() => {
    if (!summary) return
    const closedRuns = summary.worst_runs ?? []
    if (closedRuns.length === 0) return
    setCostsLoading(true)
    Promise.all(
      closedRuns.map(r =>
        repackingAPI.costSummary(r.id)
          .then(res => ({ id: r.id, data: res.data }))
          .catch(() => null)
      )
    ).then(results => {
      const map = {}
      results.forEach(r => { if (r) map[r.id] = r.data })
      setCostData(map)
    }).finally(() => setCostsLoading(false))
  }, [summary])

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="animate-spin text-blue-500" size={28} /></div>
  if (error) return <div className="card text-red-600 flex items-center gap-2"><AlertTriangle size={18} /> {error}</div>
  if (!summary) return null

  const closedRunsWithCost = (summary.worst_runs ?? []).filter(r => costData[r.id]?.grand_total_cost > 0)

  return (
    <div className="space-y-6">
      {/* Cost Overview (new section) */}
      {summary.closed_runs > 0 && (
        <div>
          <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
            <DollarSign size={16} className="text-green-600" /> Cost Overview
          </h3>
          {costsLoading ? (
            <div className="card flex justify-center py-6"><Loader2 className="animate-spin text-blue-500" size={20} /></div>
          ) : closedRunsWithCost.length === 0 ? (
            <div className="card text-sm text-gray-500 py-4 text-center">
              No cost data yet. Add landed costs and packing run costs to see a cost overview.
            </div>
          ) : (
            <div className="card p-0 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                  <tr>
                    <th className="px-4 py-3 text-left">Run</th>
                    <th className="px-4 py-3 text-left">Batch Ref</th>
                    <th className="px-4 py-3 text-right">Total Cases</th>
                    <th className="px-4 py-3 text-right">Bulk Material</th>
                    <th className="px-4 py-3 text-right">Packing Costs</th>
                    <th className="px-4 py-3 text-right font-bold text-gray-700">Grand Total</th>
                    <th className="px-4 py-3 text-right font-bold text-gray-700">Avg Cost/Case</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {closedRunsWithCost.map(r => {
                    const cs = costData[r.id]
                    return (
                      <tr key={r.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-gray-800">{r.run_ref || `Run #${r.id}`}</td>
                        <td className="px-4 py-3 text-gray-500">{cs?.landed_cost_ref || '—'}</td>
                        <td className="px-4 py-3 text-right">{cs?.total_cases ?? '—'}</td>
                        <td className="px-4 py-3 text-right font-mono">{cs ? fmt$(cs.bulk_material_cost) : '—'}</td>
                        <td className="px-4 py-3 text-right font-mono">{cs ? fmt$(cs.packing_costs?.total) : '—'}</td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-gray-800">{cs ? fmt$(cs.grand_total_cost) : '—'}</td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-green-700">{cs ? fmt$(cs.grand_total_per_case_avg) : '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card text-center">
          <div className="text-3xl font-bold text-gray-800">{summary.total_runs}</div>
          <div className="text-sm text-gray-500 mt-1">Total Runs</div>
        </div>
        <div className="card text-center">
          <div className={`text-3xl font-bold ${summary.total_variance_kg > 0 ? 'text-red-600' : summary.total_variance_kg < 0 ? 'text-green-600' : 'text-gray-800'}`}>
            {summary.total_variance_kg >= 0 ? '+' : ''}{summary.total_variance_kg.toFixed(2)} kg
          </div>
          <div className="text-sm text-gray-500 mt-1">Total Variance</div>
        </div>
        <div className="card text-center">
          <div className={`text-3xl font-bold ${varianceColor(summary.avg_variance_pct)}`}>
            {summary.avg_variance_pct >= 0 ? '+' : ''}{summary.avg_variance_pct.toFixed(1)}%
          </div>
          <div className="text-sm text-gray-500 mt-1">Avg Variance %</div>
        </div>
        <div className="card text-center">
          <div className={`text-3xl font-bold ${summary.flagged_runs > 0 ? 'text-red-600' : 'text-green-600'}`}>
            {summary.flagged_runs}
          </div>
          <div className="text-sm text-gray-500 mt-1">Flagged Runs</div>
        </div>
      </div>

      {/* Worst runs table */}
      {summary.worst_runs.length > 0 && (
        <div>
          <h3 className="font-semibold text-gray-800 mb-3">Closed Runs — Sorted by Worst Variance</h3>
          <div className="card p-0 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-3 text-left">Run</th>
                  <th className="px-4 py-3 text-left">Closed</th>
                  <th className="px-4 py-3 text-right">Theoretical kg</th>
                  <th className="px-4 py-3 text-right">Actual kg</th>
                  <th className="px-4 py-3 text-right">Variance kg</th>
                  <th className="px-4 py-3 text-right">Variance %</th>
                  <th className="px-4 py-3 text-center">Flag</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {summary.worst_runs.map(r => (
                  <tr key={r.id} className={r.flag_high_variance ? 'bg-red-50' : ''}>
                    <td className="px-4 py-3 font-medium text-gray-800">{r.run_ref || `Run #${r.id}`}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{r.closed_at ? new Date(r.closed_at).toLocaleDateString() : '—'}</td>
                    <td className="px-4 py-3 text-right font-mono">{(r.theoretical_kg ?? 0).toFixed(3)}</td>
                    <td className="px-4 py-3 text-right font-mono">{(r.actual_kg ?? 0).toFixed(3)}</td>
                    <td className={`px-4 py-3 text-right font-mono ${varianceColor(r.variance_pct)}`}>
                      {r.variance_kg != null ? `${r.variance_kg >= 0 ? '+' : ''}${r.variance_kg.toFixed(3)}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-right"><VarianceBadge pct={r.variance_pct} /></td>
                    <td className="px-4 py-3 text-center">
                      {r.flag_high_variance ? (
                        <span className="flex items-center justify-center gap-1 text-xs text-red-700 font-semibold">
                          <AlertTriangle size={13} /> HIGH VARIANCE
                        </span>
                      ) : (
                        <span className="text-green-500"><CheckCircle2 size={14} /></span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Breakdown by bulk SKU */}
      {summary.sku_breakdown.length > 0 && (
        <div>
          <h3 className="font-semibold text-gray-800 mb-3">Breakdown by Bulk SKU</h3>
          <div className="card p-0 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-3 text-left">Bulk SKU</th>
                  <th className="px-4 py-3 text-right">Runs</th>
                  <th className="px-4 py-3 text-right">Total Theoretical (kg)</th>
                  <th className="px-4 py-3 text-right">Total Actual (kg)</th>
                  <th className="px-4 py-3 text-right">Total Variance (kg)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {summary.sku_breakdown.map(b => (
                  <tr key={b.bulk_sku_id}>
                    <td className="px-4 py-3"><div className="font-medium text-gray-800">{b.sku_name}</div><div className="text-xs text-gray-400">{b.sku_code}</div></td>
                    <td className="px-4 py-3 text-right">{b.runs_count}</td>
                    <td className="px-4 py-3 text-right font-mono">{b.total_theoretical.toFixed(3)}</td>
                    <td className="px-4 py-3 text-right font-mono">{b.total_actual.toFixed(3)}</td>
                    <td className={`px-4 py-3 text-right font-mono ${b.total_variance > 0 ? 'text-red-600' : b.total_variance < 0 ? 'text-green-600' : 'text-gray-500'}`}>
                      {b.total_variance >= 0 ? '+' : ''}{b.total_variance.toFixed(3)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {summary.closed_runs === 0 && (
        <div className="card text-center py-12 text-gray-400">
          <Factory size={36} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium">No closed runs yet.</p>
          <p className="text-sm mt-1">Summary statistics will appear once runs are completed.</p>
        </div>
      )}
    </div>
  )
}

// ── Main Repacking page ───────────────────────────────────────
const TABS = ['Bills of Materials', 'Landed Costs', 'Packing Runs', 'Summary']

export default function Repacking() {
  const [activeTab, setActiveTab]     = useState(2)  // default: Packing Runs (now tab 2)
  const [skus, setSkus]               = useState([])
  const [skusLoading, setSkusLoading] = useState(true)

  useEffect(() => {
    const loadSkus = async () => {
      try {
        const res = await skuAPI.list({ limit: 500 })
        const items = Array.isArray(res.data) ? res.data : (res.data?.items || res.data?.skus || [])
        setSkus(items)
      } catch {
        setSkus([])
      } finally {
        setSkusLoading(false)
      }
    }
    loadSkus()
  }, [])

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <Factory size={22} className="text-blue-600" />
          <h1 className="text-2xl font-bold text-gray-900">Repacking / Production</h1>
        </div>
        <p className="text-sm text-gray-500">
          Track bulk-to-retail repacking, calculate material consumption, flag variance, and audit true cost per case.
        </p>
      </div>

      <div className="flex gap-1 mb-6 bg-gray-100 rounded-xl p-1 w-fit">
        {TABS.map((tab, i) => (
          <button
            key={tab}
            onClick={() => setActiveTab(i)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === i
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {skusLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="animate-spin text-blue-500" size={28} />
        </div>
      ) : (
        <>
          {activeTab === 0 && <BOMTab skus={skus} />}
          {activeTab === 1 && <LandedCostsTab skus={skus} />}
          {activeTab === 2 && <RunsTab skus={skus} />}
          {activeTab === 3 && <SummaryTab />}
        </>
      )}
    </div>
  )
}
