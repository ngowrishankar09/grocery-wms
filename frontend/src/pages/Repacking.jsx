import { useState, useEffect, useCallback } from 'react'
import { repackingAPI, skuAPI } from '../api/client'
import {
  Loader2, Plus, Trash2, Package, ChevronLeft, AlertTriangle,
  CheckCircle2, X, Factory, Scale, DollarSign, Edit2, Save,
  Info, ChevronDown, ChevronUp,
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

// ── Setup Guide ───────────────────────────────────────────────
function SetupGuide() {
  const [open, setOpen] = useState(true)
  const steps = [
    { n: 1, title: 'Create SKUs', desc: 'Go to the SKUs page and create a bulk material SKU (e.g. "Coriander Powder Bulk") and a retail output SKU (e.g. "Coriander Powder 200g Case").', tab: null },
    { n: 2, title: 'Add a Bill of Materials', desc: 'In the BOM tab, link your bulk SKU → retail SKU and enter how many kg of bulk are consumed per case packed (e.g. 4.0 kg/case for 20 × 200g sachets).', tab: 0 },
    { n: 3, title: 'Record a Purchase / Shipment', desc: 'In the Purchases tab, create a new purchase batch. Add each bulk SKU received with its quantity and material cost. Enter shared freight and duty once — the system allocates them proportionally by weight and computes cost per kg per SKU.', tab: 1 },
    { n: 4, title: 'Start a Packing Run', desc: 'In the Packing Runs tab, click "New Run". Select the bulk SKU, weigh it and enter the starting weight. Optionally link the landed cost batch for accurate costing.', tab: 2 },
    { n: 5, title: 'Pack & Record Cases', desc: 'Add each product you packed and how many cases. The blue panel shows the expected weight remaining on the scale at all times.', tab: 2 },
    { n: 6, title: 'Weigh & Close', desc: 'When done, weigh the leftover bulk and close the run. The system calculates variance and flags anything above your allowed waste %.', tab: 2 },
  ]
  return (
    <div className="mb-6 border border-blue-200 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-blue-50 text-blue-800 font-semibold text-sm hover:bg-blue-100 transition-colors"
      >
        <span className="flex items-center gap-2"><Info size={15} /> Getting Started — How to use Repacking</span>
        {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
      </button>
      {open && (
        <div className="p-4 bg-white">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {steps.map(s => (
              <div key={s.n} className="flex gap-3 p-3 rounded-lg bg-gray-50 border border-gray-100">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center mt-0.5">{s.n}</div>
                <div>
                  <p className="font-semibold text-gray-800 text-sm">{s.title}</p>
                  <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Searchable SKU input ──────────────────────────────────────
function SKUSearch({ skus, value, onChange, placeholder = 'Search SKU…', required = false }) {
  const [query, setQuery]   = useState('')
  const [focused, setFocused] = useState(false)
  const selected = skus.find(s => String(s.id) === String(value))
  const displayValue = focused
    ? query
    : (selected ? `${selected.product_name} (${selected.sku_code})` : '')
  const filtered = (query.trim()
    ? skus.filter(s =>
        s.product_name.toLowerCase().includes(query.toLowerCase()) ||
        s.sku_code.toLowerCase().includes(query.toLowerCase())
      )
    : skus
  ).slice(0, 12)
  const handleSelect = (sku) => {
    onChange(String(sku.id)); setQuery(''); setFocused(false)
  }
  return (
    <div className="relative">
      <input
        type="text"
        className="input w-full text-sm"
        placeholder={placeholder}
        value={displayValue}
        required={required && !value}
        onChange={e => { setQuery(e.target.value); setFocused(true) }}
        onFocus={() => { setFocused(true); setQuery('') }}
        onBlur={() => setTimeout(() => setFocused(false), 180)}
        autoComplete="off"
      />
      {focused && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-48 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="px-3 py-2.5 text-xs text-gray-400 italic">No matching SKUs found</div>
          ) : filtered.map(s => (
            <button
              key={s.id}
              type="button"
              className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 transition-colors border-b border-gray-50 last:border-0"
              onMouseDown={() => handleSelect(s)}
            >
              <span className="font-medium text-gray-800">{s.product_name}</span>
              <span className="ml-2 text-xs text-gray-400 font-mono">{s.sku_code}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Tab 1: Bills of Materials ─────────────────────────────────
function BOMTab({ skus }) {
  const [boms, setBoms]         = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [editBomId, setEditBomId] = useState(null)
  const [form, setForm]         = useState({
    output_sku_id: '', input_sku_id: '', qty_per_unit: '', unit: 'kg',
    waste_pct_allowed: 2, notes: '',
  })
  const [saving, setSaving]     = useState(false)
  const [formError, setFormError] = useState(null)

  const emptyForm = { output_sku_id: '', input_sku_id: '', qty_per_unit: '', unit: 'kg', waste_pct_allowed: 2, notes: '' }

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

  const openNew = () => {
    setEditBomId(null)
    setForm(emptyForm)
    setFormError(null)
    setShowForm(true)
  }

  const openEdit = (bom) => {
    setEditBomId(bom.id)
    setForm({
      output_sku_id:     String(bom.output_sku_id),
      input_sku_id:      String(bom.input_sku_id),
      qty_per_unit:      String(bom.qty_per_unit),
      unit:              bom.unit || 'kg',
      waste_pct_allowed: bom.waste_pct_allowed ?? 2,
      notes:             bom.notes || '',
    })
    setFormError(null)
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleSubmit = async (e) => {
    e.preventDefault(); setFormError(null)
    if (!form.output_sku_id || !form.input_sku_id || !form.qty_per_unit) {
      setFormError('Please fill all required fields.'); return
    }
    if (form.output_sku_id === form.input_sku_id) {
      setFormError('Output and input SKU must be different.'); return
    }
    const payload = {
      output_sku_id:     parseInt(form.output_sku_id),
      input_sku_id:      parseInt(form.input_sku_id),
      qty_per_unit:      parseFloat(form.qty_per_unit),
      unit:              form.unit,
      waste_pct_allowed: parseFloat(form.waste_pct_allowed),
      notes:             form.notes || null,
    }
    setSaving(true)
    try {
      if (editBomId) {
        await repackingAPI.updateBOM(editBomId, payload)
      } else {
        await repackingAPI.createBOM(payload)
      }
      setShowForm(false)
      setEditBomId(null)
      setForm(emptyForm)
      load()
    } catch (e) {
      setFormError(e.response?.data?.detail || 'Failed to save BOM')
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
        <button onClick={openNew} className="btn-primary flex items-center gap-1.5">
          <Plus size={15} /> Add BOM
        </button>
      </div>

      {showForm && (
        <div className="card mb-4 border border-blue-200 bg-blue-50">
          <h3 className="font-semibold text-gray-800 mb-3">
            {editBomId ? '✏️ Edit Bill of Material' : 'New Bill of Material'}
          </h3>
          <form onSubmit={handleSubmit} className="space-y-3">
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
                <p className="text-xs text-gray-400 mt-1">Example: 20 × 200g sachets per case = 4.0 kg consumed per case packed.</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Allowed waste % (flag threshold)</label>
                <input type="number" step="0.1" min="0" max="100" className="input w-full" value={form.waste_pct_allowed} onChange={e => setForm(f => ({ ...f, waste_pct_allowed: e.target.value }))} />
                <p className="text-xs text-gray-400 mt-1">Variance above this % will be flagged red.</p>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Notes</label>
              <input type="text" className="input w-full" placeholder="Optional notes…" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
            {formError && <p className="text-sm text-red-600 flex items-center gap-1"><AlertTriangle size={14} /> {formError}</p>}
            <div className="flex gap-2">
              <button type="submit" className="btn-primary flex items-center gap-1.5" disabled={saving}>
                {saving && <Loader2 size={14} className="animate-spin" />}
                {editBomId ? 'Update BOM' : 'Save BOM'}
              </button>
              <button type="button" className="btn-secondary" onClick={() => { setShowForm(false); setEditBomId(null) }}>Cancel</button>
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
          <p className="text-sm mt-1">Add a BOM to define how much bulk is consumed per retail case.</p>
          <button onClick={openNew} className="btn-primary mt-4 mx-auto">+ Add First BOM</button>
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
                <tr key={b.id} className={`hover:bg-gray-50 ${editBomId === b.id ? 'bg-blue-50' : ''}`}>
                  <td className="px-4 py-3"><div className="font-medium text-gray-800">{b.output_sku_name}</div><div className="text-xs text-gray-400">{b.output_sku_code}</div></td>
                  <td className="px-4 py-3"><div className="font-medium text-gray-800">{b.input_sku_name}</div><div className="text-xs text-gray-400">{b.input_sku_code}</div></td>
                  <td className="px-4 py-3 text-right font-mono">{b.qty_per_unit} {b.unit}</td>
                  <td className="px-4 py-3 text-right">{b.waste_pct_allowed}%</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{b.notes || '—'}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => openEdit(b)} className="p-1.5 text-gray-400 hover:text-blue-500 rounded transition-colors" title="Edit BOM"><Edit2 size={13} /></button>
                      <button onClick={() => handleDelete(b.id)} className="p-1.5 text-gray-400 hover:text-red-500 rounded transition-colors" title="Delete BOM"><Trash2 size={14} /></button>
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

// ── Tab 2: Purchases / Shipments ─────────────────────────────
function PurchasesTab({ skus }) {
  const [purchases, setPurchases]   = useState([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState(null)
  const [expandedId, setExpandedId] = useState(null)
  const [utilisation, setUtilisation] = useState({})   // {batchId: data | 'loading' | null}
  const [showForm, setShowForm]     = useState(false)
  const [editId, setEditId]         = useState(null)
  const [saving, setSaving]         = useState(false)
  const [formError, setFormError]   = useState(null)
  const [deleting, setDeleting]     = useState(null)

  const emptyLine = () => ({ bulk_sku_id: '', qty_kg: '', cost_material: '', cost_packaging_mat: '', cost_labor: '' })
  const emptyForm = () => ({
    batch_ref: '', supplier: '', currency: 'USD', purchase_date: '', exchange_rate: '1',
    shared_freight: '', shared_duty: '', shared_overhead: '', shared_other: '',
    notes: '',
    lines: [emptyLine()],
  })
  const [form, setForm] = useState(emptyForm())

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await repackingAPI.listPurchases()
      setPurchases(res.data)
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to load purchases')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  // Live cost-per-kg preview for one line
  const calcLinePreview = (lineIdx) => {
    const line   = form.lines[lineIdx]
    const lineKg = parseFloat(line.qty_kg) || 0
    if (lineKg === 0) return null
    const totalKg     = form.lines.reduce((s, l) => s + (parseFloat(l.qty_kg) || 0), 0) || 1
    const weightShare = lineKg / totalKg
    const allocFreight  = (parseFloat(form.shared_freight)  || 0) * weightShare
    const allocDuty     = (parseFloat(form.shared_duty)     || 0) * weightShare
    const allocOverhead = (parseFloat(form.shared_overhead) || 0) * weightShare
    const allocOther    = (parseFloat(form.shared_other)    || 0) * weightShare
    const lineCost =
      (parseFloat(line.cost_material)      || 0) +
      (parseFloat(line.cost_packaging_mat) || 0) +
      (parseFloat(line.cost_labor)         || 0) +
      allocFreight + allocDuty + allocOverhead + allocOther
    const cpk = lineCost / lineKg
    const fx  = parseFloat(form.exchange_rate) || 1.0
    return { cpk, cpkBase: cpk * fx, fx, isForeign: form.currency !== 'USD' }
  }

  const addLine    = () => setForm(f => ({ ...f, lines: [...f.lines, emptyLine()] }))
  const removeLine = (i) => {
    if (form.lines.length <= 1) return
    setForm(f => ({ ...f, lines: f.lines.filter((_, idx) => idx !== i) }))
  }
  const updateLine = (i, key, val) => setForm(f => {
    const lines = [...f.lines]; lines[i] = { ...lines[i], [key]: val }; return { ...f, lines }
  })

  const openNew = () => {
    setEditId(null); setForm(emptyForm()); setFormError(null); setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const openEdit = async (purchase) => {
    setEditId(purchase.id); setFormError(null); setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
    try {
      const res = await repackingAPI.getPurchase(purchase.id)
      const d = res.data
      setForm({
        batch_ref:       d.batch_ref      || '',
        supplier:        d.supplier       || '',
        currency:        d.currency       || 'USD',
        purchase_date:   d.purchase_date  || '',
        exchange_rate:   String(d.exchange_rate ?? 1),
        shared_freight:  String(d.shared_freight  ?? 0),
        shared_duty:     String(d.shared_duty     ?? 0),
        shared_overhead: String(d.shared_overhead ?? 0),
        shared_other:    String(d.shared_other    ?? 0),
        notes:           d.notes || '',
        lines: (d.items || []).map(item => ({
          bulk_sku_id:        String(item.bulk_sku_id),
          qty_kg:             String(item.qty_kg),
          cost_material:      String(item.cost_material      ?? 0),
          cost_packaging_mat: String(item.cost_packaging_mat ?? 0),
          cost_labor:         String(item.cost_labor         ?? 0),
        })),
      })
    } catch (e) {
      setFormError(e.response?.data?.detail || 'Failed to load purchase details')
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault(); setFormError(null)
    const validLines = form.lines.filter(l => l.bulk_sku_id && l.qty_kg)
    if (validLines.length === 0) {
      setFormError('Please add at least one SKU line with a quantity.'); return
    }
    const payload = {
      batch_ref:       form.batch_ref     || null,
      supplier:        form.supplier      || null,
      currency:        form.currency,
      purchase_date:   form.purchase_date || null,
      exchange_rate:   parseFloat(form.exchange_rate) || 1.0,
      shared_freight:  parseFloat(form.shared_freight)  || 0,
      shared_duty:     parseFloat(form.shared_duty)     || 0,
      shared_overhead: parseFloat(form.shared_overhead) || 0,
      shared_other:    parseFloat(form.shared_other)    || 0,
      notes:           form.notes || null,
      lines: validLines.map(l => ({
        bulk_sku_id:        parseInt(l.bulk_sku_id),
        qty_kg:             parseFloat(l.qty_kg),
        cost_material:      parseFloat(l.cost_material)      || 0,
        cost_packaging_mat: parseFloat(l.cost_packaging_mat) || 0,
        cost_labor:         parseFloat(l.cost_labor)         || 0,
      })),
    }
    setSaving(true)
    try {
      if (editId) {
        await repackingAPI.updatePurchase(editId, payload)
      } else {
        await repackingAPI.createPurchase(payload)
      }
      setShowForm(false); setEditId(null); setForm(emptyForm()); load()
    } catch (e) {
      setFormError(e.response?.data?.detail || 'Failed to save purchase')
    } finally { setSaving(false) }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this purchase batch? All associated cost records will also be deleted.')) return
    setDeleting(id)
    try { await repackingAPI.deletePurchase(id); load() }
    catch (e) { alert(e.response?.data?.detail || 'Failed to delete') }
    finally { setDeleting(null) }
  }

  const totalSharedCost =
    (parseFloat(form.shared_freight)  || 0) +
    (parseFloat(form.shared_duty)     || 0) +
    (parseFloat(form.shared_overhead) || 0) +
    (parseFloat(form.shared_other)    || 0)

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">Purchases / Shipments</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Record multi-SKU purchase shipments. Shared freight, duty &amp; overhead are auto-allocated proportionally by weight to each bulk SKU line.
          </p>
        </div>
        <button onClick={openNew} className="btn-primary flex items-center gap-1.5">
          <Plus size={15} /> New Purchase
        </button>
      </div>

      {showForm && (
        <div className="card mb-6 border border-green-200 bg-green-50">
          <h3 className="font-semibold text-gray-800 mb-4">
            {editId ? '✏️ Edit Purchase Batch' : '📦 New Purchase Batch'}
          </h3>
          <form onSubmit={handleSubmit} className="space-y-5">

            {/* ── Shipment header ─────────────────────────────── */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Shipment Details</p>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Batch Reference</label>
                  <input type="text" className="input w-full" placeholder="e.g. India Apr 2026" value={form.batch_ref} onChange={e => setForm(f => ({ ...f, batch_ref: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Supplier</label>
                  <input type="text" className="input w-full" placeholder="e.g. Spice Traders Ltd" value={form.supplier} onChange={e => setForm(f => ({ ...f, supplier: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Purchase Date</label>
                  <input type="date" className="input w-full" value={form.purchase_date} onChange={e => setForm(f => ({ ...f, purchase_date: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Currency</label>
                  <select className="input w-full" value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value, exchange_rate: e.target.value === 'USD' ? '1' : f.exchange_rate }))}>
                    {['USD','AUD','EUR','GBP','CAD','INR','NZD'].map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              {/* Exchange rate row — only show when currency ≠ USD */}
              {form.currency !== 'USD' && (
                <div className="mt-3 flex items-end gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Exchange Rate to USD
                      <span className="ml-1 text-gray-400 font-normal">(1 {form.currency} = ? USD)</span>
                    </label>
                    <input
                      type="number" step="0.000001" min="0.000001" className="input w-full"
                      placeholder={`e.g. 1 ${form.currency} = 0.012 USD`}
                      value={form.exchange_rate}
                      onChange={e => setForm(f => ({ ...f, exchange_rate: e.target.value }))}
                    />
                  </div>
                  <div className="text-sm text-amber-700 pb-1">
                    {parseFloat(form.exchange_rate) > 0
                      ? <span>All {form.currency} amounts × <strong>{parseFloat(form.exchange_rate).toFixed(6)}</strong> → USD for cost summaries</span>
                      : <span className="text-red-600">Enter a valid exchange rate</span>}
                  </div>
                </div>
              )}
            </div>

            {/* ── Shared costs ────────────────────────────────── */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">
                Shared Costs
                <span className="ml-1 font-normal text-gray-400 normal-case">— entered once, split proportionally by weight across all SKU lines</span>
              </p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { key: 'shared_freight',  label: 'Freight / Shipping ($)' },
                  { key: 'shared_duty',     label: 'Import Duty ($)' },
                  { key: 'shared_overhead', label: 'Overhead ($)' },
                  { key: 'shared_other',    label: 'Other Shared ($)' },
                ].map(({ key, label }) => (
                  <div key={key}>
                    <label className="block text-xs font-medium text-gray-700 mb-1">{label}</label>
                    <input type="number" step="0.01" min="0" className="input w-full" placeholder="0.00"
                      value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} />
                  </div>
                ))}
              </div>
              {totalSharedCost > 0 && (
                <p className="text-xs text-green-700 mt-1.5 font-medium">
                  Total shared: ${totalSharedCost.toFixed(2)} — will be proportionally allocated below
                </p>
              )}
            </div>

            {/* ── SKU Lines ───────────────────────────────────── */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  SKU Lines <span className="font-normal text-gray-400 normal-case ml-1">— add each bulk material in this shipment</span>
                </p>
                <button type="button" onClick={addLine} className="text-xs text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-1">
                  <Plus size={12} /> Add SKU
                </button>
              </div>
              <div className="space-y-3">
                {form.lines.map((line, i) => {
                  const preview    = calcLinePreview(i)
                  const totalKg    = form.lines.reduce((s, l) => s + (parseFloat(l.qty_kg) || 0), 0)
                  const lineKg     = parseFloat(line.qty_kg) || 0
                  const shareLabel = totalKg > 0 && lineKg > 0
                    ? `${((lineKg / totalKg) * 100).toFixed(1)}% of weight → $${((totalSharedCost * lineKg) / totalKg).toFixed(2)} shared`
                    : null
                  return (
                    <div key={i} className="bg-white border border-gray-200 rounded-xl p-3 shadow-sm">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">SKU #{i + 1}</span>
                        {form.lines.length > 1 && (
                          <button type="button" onClick={() => removeLine(i)} className="text-gray-300 hover:text-red-500 p-0.5 rounded transition-colors" title="Remove line">
                            <X size={13} />
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-2">
                        <div className="md:col-span-2">
                          <label className="block text-xs font-medium text-gray-700 mb-1">Bulk SKU <span className="text-red-500">*</span></label>
                          <SKUSearch
                            skus={skus}
                            value={line.bulk_sku_id}
                            onChange={val => updateLine(i, 'bulk_sku_id', val)}
                            placeholder="Search or type SKU name…"
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Qty (kg) <span className="text-red-500">*</span></label>
                          <input type="number" step="0.001" min="0.001" className="input w-full text-sm" placeholder="e.g. 1000"
                            value={line.qty_kg} onChange={e => updateLine(i, 'qty_kg', e.target.value)} required />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Material Cost ($)</label>
                          <input type="number" step="0.01" min="0" className="input w-full text-sm" placeholder="0.00"
                            value={line.cost_material} onChange={e => updateLine(i, 'cost_material', e.target.value)} />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Packaging ($)</label>
                          <input type="number" step="0.01" min="0" className="input w-full text-sm" placeholder="0.00"
                            value={line.cost_packaging_mat} onChange={e => updateLine(i, 'cost_packaging_mat', e.target.value)} />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Labor ($)</label>
                          <input type="number" step="0.01" min="0" className="input w-full text-sm" placeholder="0.00"
                            value={line.cost_labor} onChange={e => updateLine(i, 'cost_labor', e.target.value)} />
                        </div>
                      </div>
                      {/* Live preview */}
                      {preview != null && (
                        <div className="mt-2 flex flex-wrap items-center gap-3">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-gray-500">Cost/kg ({form.currency}):</span>
                            <span className="text-sm font-bold text-green-700">{preview.cpk.toFixed(4)} {form.currency}</span>
                          </div>
                          {preview.isForeign && (
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs text-gray-500">Cost/kg (USD):</span>
                              <span className="text-sm font-bold text-blue-700">${preview.cpkBase.toFixed(4)}</span>
                            </div>
                          )}
                          {shareLabel && (
                            <span className="text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">{shareLabel}</span>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Notes</label>
              <input type="text" className="input w-full" placeholder="Optional notes…"
                value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>

            {formError && <p className="text-sm text-red-600 flex items-center gap-1"><AlertTriangle size={14} /> {formError}</p>}
            <div className="flex gap-2">
              <button type="submit" className="btn-primary flex items-center gap-1.5" disabled={saving}>
                {saving && <Loader2 size={14} className="animate-spin" />}
                {editId ? 'Update Purchase' : 'Save Purchase'}
              </button>
              <button type="button" className="btn-secondary" onClick={() => { setShowForm(false); setEditId(null) }}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="animate-spin text-blue-500" size={28} /></div>
      ) : error ? (
        <div className="card text-red-600 flex items-center gap-2"><AlertTriangle size={18} /> {error}</div>
      ) : purchases.length === 0 ? (
        <div className="card text-center py-12 text-gray-400">
          <DollarSign size={36} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium">No purchase batches recorded yet.</p>
          <p className="text-sm mt-1">Create a purchase to track costs across multiple bulk SKUs in one shipment.</p>
          <button onClick={openNew} className="btn-primary mt-4 mx-auto">+ New Purchase</button>
        </div>
      ) : (
        <div className="space-y-3">
          {purchases.map(purchase => (
            <div key={purchase.id} className="card p-0 overflow-hidden border border-gray-200">
              {/* Batch header */}
              <div
                className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors"
                onClick={() => {
                  const next = expandedId === purchase.id ? null : purchase.id
                  setExpandedId(next)
                  if (next && !utilisation[next]) {
                    setUtilisation(u => ({ ...u, [next]: 'loading' }))
                    repackingAPI.getPurchaseUtilisation(next)
                      .then(r => setUtilisation(u => ({ ...u, [next]: r.data })))
                      .catch(() => setUtilisation(u => ({ ...u, [next]: null })))
                  }
                }}
              >
                <div className="flex items-center gap-3">
                  <span className={`text-gray-400 transition-transform duration-150 ${expandedId === purchase.id ? 'rotate-180' : ''}`}>
                    <ChevronDown size={16} />
                  </span>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-800">{purchase.batch_ref || `Batch #${purchase.id}`}</span>
                      {purchase.supplier && <span className="text-xs text-gray-500">· {purchase.supplier}</span>}
                      <span className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded font-mono">{purchase.currency}</span>
                      {purchase.exchange_rate && purchase.exchange_rate !== 1 && (
                        <span className="text-xs px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded font-mono">
                          @{(+purchase.exchange_rate).toFixed(4)} USD
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      {purchase.purchase_date
                        ? <span className="text-gray-600 font-medium">Purchased: {new Date(purchase.purchase_date + 'T00:00:00').toLocaleDateString()}</span>
                        : purchase.created_at ? new Date(purchase.created_at).toLocaleDateString() : '—'
                      }
                      {' · '}{purchase.items?.length ?? 0} SKU{(purchase.items?.length ?? 0) !== 1 ? 's' : ''}
                      {purchase.total_kg > 0 && ` · ${(+purchase.total_kg).toFixed(0)} kg total`}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right hidden sm:block">
                    <div className="text-sm font-bold text-gray-800">{fmt$(purchase.total_cost)}</div>
                    <div className="text-xs text-gray-400">total cost</div>
                  </div>
                  <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                    <button onClick={() => openEdit(purchase)} className="p-1.5 text-gray-400 hover:text-blue-500 rounded transition-colors" title="Edit"><Edit2 size={13} /></button>
                    <button onClick={() => handleDelete(purchase.id)} className="p-1.5 text-gray-400 hover:text-red-500 rounded transition-colors" title="Delete" disabled={deleting === purchase.id}>
                      {deleting === purchase.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                    </button>
                  </div>
                </div>
              </div>

              {/* Expanded detail */}
              {expandedId === purchase.id && (
                <div className="border-t border-gray-100">
                  {/* Shared costs pills */}
                  {(purchase.shared_freight > 0 || purchase.shared_duty > 0 || purchase.shared_overhead > 0 || purchase.shared_other > 0) && (
                    <div className="px-4 py-2 bg-blue-50 flex flex-wrap gap-3 text-xs text-blue-800 border-b border-blue-100">
                      <span className="font-semibold">Shared costs:</span>
                      {purchase.shared_freight  > 0 && <span className="bg-blue-100 px-2 py-0.5 rounded-full">Freight {fmt$(purchase.shared_freight)}</span>}
                      {purchase.shared_duty     > 0 && <span className="bg-blue-100 px-2 py-0.5 rounded-full">Duty {fmt$(purchase.shared_duty)}</span>}
                      {purchase.shared_overhead > 0 && <span className="bg-blue-100 px-2 py-0.5 rounded-full">Overhead {fmt$(purchase.shared_overhead)}</span>}
                      {purchase.shared_other    > 0 && <span className="bg-blue-100 px-2 py-0.5 rounded-full">Other {fmt$(purchase.shared_other)}</span>}
                    </div>
                  )}
                  {purchase.items?.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                          <tr>
                            <th className="px-4 py-2 text-left pl-10">Bulk SKU</th>
                            <th className="px-4 py-2 text-right">Qty (kg)</th>
                            <th className="px-4 py-2 text-right">Material</th>
                            <th className="px-4 py-2 text-right text-blue-600">Freight alloc</th>
                            <th className="px-4 py-2 text-right text-blue-600">Duty alloc</th>
                            <th className="px-4 py-2 text-right">Pkg Mat</th>
                            <th className="px-4 py-2 text-right">Labor</th>
                            <th className="px-4 py-2 text-right font-bold text-gray-700">Total</th>
                            <th className="px-4 py-2 text-right font-bold text-green-700">Cost/kg</th>
                            {purchase.currency !== 'USD' && <th className="px-4 py-2 text-right font-bold text-blue-700">Cost/kg (USD)</th>}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {purchase.items.map((item, idx) => (
                            <tr key={idx} className="hover:bg-gray-50">
                              <td className="px-4 py-2.5 pl-10">
                                <div className="font-medium text-gray-800">{item.bulk_sku_name}</div>
                                <div className="text-xs text-gray-400">{item.bulk_sku_code}</div>
                              </td>
                              <td className="px-4 py-2.5 text-right font-mono">{(+item.qty_kg).toFixed(2)}</td>
                              <td className="px-4 py-2.5 text-right font-mono">{fmt$(item.cost_material)}</td>
                              <td className="px-4 py-2.5 text-right font-mono text-blue-700">{fmt$(item.cost_freight)}</td>
                              <td className="px-4 py-2.5 text-right font-mono text-blue-700">{fmt$(item.cost_duty)}</td>
                              <td className="px-4 py-2.5 text-right font-mono">{fmt$(item.cost_packaging_mat)}</td>
                              <td className="px-4 py-2.5 text-right font-mono">{fmt$(item.cost_labor)}</td>
                              <td className="px-4 py-2.5 text-right font-mono font-bold text-gray-800">{fmt$(item.total_cost)}</td>
                              <td className="px-4 py-2.5 text-right font-mono font-bold text-green-700">
                                {item.cost_per_kg != null ? `${(+item.cost_per_kg).toFixed(4)} ${purchase.currency}/kg` : '—'}
                              </td>
                              {purchase.currency !== 'USD' && (
                                <td className="px-4 py-2.5 text-right font-mono font-bold text-blue-700">
                                  {item.cost_per_kg_base != null ? `$${(+item.cost_per_kg_base).toFixed(4)}/kg` : '—'}
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="px-4 py-3 text-sm text-gray-400 italic">No SKU lines found.</p>
                  )}
                  {purchase.notes && (
                    <div className="px-4 py-2 text-xs text-gray-500 italic border-t border-gray-100 bg-gray-50">{purchase.notes}</div>
                  )}
                  {/* ── Utilisation section ───────────────────── */}
                  <div className="border-t border-gray-200 px-4 py-3 bg-gray-50">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
                      📦 Cases Packed from this Purchase
                    </p>
                    {utilisation[purchase.id] === 'loading' ? (
                      <div className="flex items-center gap-2 text-xs text-gray-400 py-1">
                        <Loader2 size={12} className="animate-spin" /> Loading packing runs…
                      </div>
                    ) : !utilisation[purchase.id] || utilisation[purchase.id].total_runs === 0 ? (
                      <p className="text-xs text-gray-400 italic">
                        No packing runs linked to this batch yet. When you start a run and select a landed cost from this purchase, it will appear here.
                      </p>
                    ) : (() => {
                      const u = utilisation[purchase.id]
                      return (
                        <div className="space-y-2">
                          {/* Totals row */}
                          <div className="flex flex-wrap gap-4 text-sm">
                            <div className="flex items-center gap-1.5 bg-green-100 text-green-800 px-3 py-1.5 rounded-lg font-semibold">
                              <Package size={14} />
                              {u.total_cases.toLocaleString()} cases packed total
                            </div>
                            <div className="flex items-center gap-1.5 bg-blue-100 text-blue-800 px-3 py-1.5 rounded-lg font-semibold">
                              <Scale size={14} />
                              {u.total_kg_consumed.toFixed(1)} kg consumed ({purchase.total_kg > 0 ? `${((u.total_kg_consumed / purchase.total_kg) * 100).toFixed(1)}% of ${purchase.total_kg.toFixed(0)} kg bought` : 'of purchased qty'})
                            </div>
                            <div className="text-xs text-gray-500 self-center">{u.total_runs} packing run{u.total_runs !== 1 ? 's' : ''}</div>
                          </div>
                          {/* SKU totals */}
                          {u.sku_totals?.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                              {u.sku_totals.map(s => (
                                <span key={s.sku_id} className="text-xs bg-white border border-gray-200 px-2 py-1 rounded font-medium text-gray-700">
                                  {s.sku_name}: <span className="text-green-700 font-bold">{s.total_cases.toLocaleString()} cases</span>
                                </span>
                              ))}
                            </div>
                          )}
                          {/* Run list */}
                          <div className="space-y-1 mt-1">
                            {u.runs.map(r => (
                              <div key={r.run_id} className="flex items-center justify-between text-xs bg-white border border-gray-100 rounded px-3 py-1.5">
                                <span className="font-medium text-gray-700">{r.run_ref || `Run #${r.run_id}`}</span>
                                <span className="text-gray-500">{r.linked_bulk_sku}</span>
                                <span className={`px-1.5 py-0.5 rounded-full font-semibold ${r.status === 'closed' ? 'bg-gray-200 text-gray-600' : 'bg-blue-100 text-blue-700'}`}>{r.status}</span>
                                <span className="font-bold text-green-700">{r.total_cases} cases</span>
                                <span className="text-gray-400">{r.kg_consumed.toFixed(1)} kg</span>
                                <span className="text-gray-400">{r.created_at ? new Date(r.created_at).toLocaleDateString() : '—'}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                    })()}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Operational Costs card (inside Run Detail) ────────────────
function OperationalCostsCard({ runDetail, onSaved }) {
  const [costs, setCosts]         = useState(null)
  const [summary, setSummary]     = useState(null)
  const [loadingCosts, setLoadingCosts]     = useState(true)
  const [loadingSummary, setLoadingSummary] = useState(false)
  const [form, setForm] = useState({
    cost_packaging_mat: '', cost_labor: '', cost_overhead: '', cost_other: '', labor_hours: '', notes: '',
  })
  const [saving, setSaving]     = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [saveOk, setSaveOk]     = useState(false)

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
    return <div className="card flex justify-center py-8"><Loader2 className="animate-spin text-blue-500" size={22} /></div>
  }

  return (
    <div className="card space-y-5">
      <div className="flex items-center gap-2">
        <DollarSign size={18} className="text-green-600" />
        <h3 className="font-semibold text-gray-800 text-base">Operational Costs</h3>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">Section A — Packing Run Costs</p>
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
                <input type="number" step="0.01" min="0" className="input w-full" placeholder="0.00" value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} />
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Labor Hours (optional)</label>
              <input type="number" step="0.25" min="0" className="input w-full" placeholder="e.g. 8.5" value={form.labor_hours} onChange={e => setForm(f => ({ ...f, labor_hours: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Notes</label>
              <input type="text" className="input w-full" placeholder="Optional notes…" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
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

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">Section B — Full Cost Breakdown</p>
        {runDetail.status === 'open' ? (
          <div className="text-sm text-gray-500 italic bg-gray-50 rounded-lg p-3">
            Cost breakdown will be available once you close the run.
          </div>
        ) : loadingSummary ? (
          <div className="flex justify-center py-6"><Loader2 className="animate-spin text-blue-500" size={20} /></div>
        ) : summary && summary.cost_per_kg === 0 && (summary.bulk_entries?.every(b => b.cost_per_kg === 0) ?? true) ? (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2 text-sm text-amber-800">
            <AlertTriangle size={15} className="mt-0.5 shrink-0" />
            <span>
              No landed cost found for <strong>{summary.bulk_sku_name || 'the bulk materials in this run'}</strong> — record a purchase in the <strong>Purchases</strong> tab first, then the cost breakdown will appear here.
            </span>
          </div>
        ) : summary ? (
          <div className="bg-gray-900 text-gray-100 rounded-xl p-5 font-mono text-sm space-y-4">
            <div className="border-b border-gray-600 pb-2 text-gray-300 text-xs">{'━'.repeat(52)}</div>
            <div className="space-y-1">
              <div className="text-green-400 font-bold uppercase tracking-wide text-xs">
                Bulk Material Cost {summary.landed_cost_ref ? `(Batch: "${summary.landed_cost_ref}")` : '(most recent batch)'}
                {summary.landed_cost_currency && summary.landed_cost_currency !== 'USD' && (
                  <span className="ml-2 text-amber-400 normal-case font-normal text-xs">
                    · Purchase in {summary.landed_cost_currency} @ {(summary.landed_cost_exchange_rate || 1).toFixed(4)} USD
                  </span>
                )}
              </div>
              <div className="flex justify-between text-gray-200">
                <span>
                  {(+summary.total_theoretical_kg).toFixed(3)} kg × ${(+summary.cost_per_kg).toFixed(4)}/kg
                  {summary.landed_cost_currency && summary.landed_cost_currency !== 'USD' && (
                    <span className="text-gray-400 ml-1 text-xs">(USD)</span>
                  )}
                </span>
                <span className="font-bold text-white">{fmt$(summary.bulk_material_cost)}</span>
              </div>
            </div>
            <div className="space-y-1">
              <div className="text-blue-400 font-bold uppercase tracking-wide text-xs">Packing Run Costs</div>
              {[
                ['Packaging materials', summary.packing_costs.cost_packaging_mat],
                ['Labor' + (summary.packing_costs.labor_hours ? ` (${summary.packing_costs.labor_hours} hrs)` : ''), summary.packing_costs.cost_labor],
                ['Overhead', summary.packing_costs.cost_overhead],
                ['Other',    summary.packing_costs.cost_other],
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
                        <span>Material: {o.bom_qty_per_unit} kg × ${(+summary.cost_per_kg).toFixed(4)}/kg USD</span>
                        <span>{fmt$(o.material_per_case)}/case</span>
                      </div>
                    )}
                    <div className="flex justify-between text-gray-400 pl-4">
                      <span>+ Packing share</span>
                      <span>{fmt$(o.packing_per_case)}/case</span>
                    </div>
                    <div className="flex justify-between text-white font-bold pl-4 border-t border-gray-700 pt-0.5">
                      <span>══ Total cost per case</span>
                      <span>{fmt$(o.total_per_case)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
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
function RunsTab({ skus, landedCosts }) {
  const [runs, setRuns]             = useState([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState(null)
  const [selectedRun, setSelectedRun] = useState(null)
  const [runDetail, setRunDetail]   = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [showNewRun, setShowNewRun] = useState(false)

  const [runForm, setRunForm] = useState({
    run_ref: '', bulk_sku_id: '', qty_start: '', started_by: '', notes: '', landed_cost_id: '',
  })
  const [runFormError, setRunFormError] = useState(null)
  const [creatingRun, setCreatingRun]   = useState(false)

  const [showAddOutput, setShowAddOutput] = useState(false)
  const [outputForm, setOutputForm]       = useState({ sku_id: '', qty_packed: '' })
  const [outputFormError, setOutputFormError] = useState(null)
  const [addingOutput, setAddingOutput]   = useState(false)

  const [showClose, setShowClose]     = useState(false)
  const [closeQtyEnd, setCloseQtyEnd] = useState({})
  const [closing, setClosing]         = useState(false)
  const [closeError, setCloseError]   = useState(null)

  // Add-bulk-material to open run
  const [showAddBulk, setShowAddBulk]   = useState(false)
  const [addBulkForm, setAddBulkForm]   = useState({ bulk_sku_id: '', qty_start: '' })
  const [addBulkError, setAddBulkError] = useState(null)
  const [addingBulk, setAddingBulk]     = useState(false)

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
    setShowAddBulk(false)
    setAddBulkError(null)
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
        run_ref:        runForm.run_ref || null,
        bulk_sku_id:    parseInt(runForm.bulk_sku_id),
        qty_start:      parseFloat(runForm.qty_start),
        started_by:     runForm.started_by || null,
        notes:          runForm.notes || null,
        landed_cost_id: runForm.landed_cost_id ? parseInt(runForm.landed_cost_id) : null,
      })
      setShowNewRun(false)
      setRunForm({ run_ref: '', bulk_sku_id: '', qty_start: '', started_by: '', notes: '', landed_cost_id: '' })
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

  const handleAddBulk = async (e) => {
    e.preventDefault(); setAddBulkError(null)
    if (!addBulkForm.bulk_sku_id || !addBulkForm.qty_start) {
      setAddBulkError('Please select a bulk SKU and enter starting weight.'); return
    }
    setAddingBulk(true)
    try {
      await repackingAPI.addBulk(runDetail.id, {
        bulk_sku_id: parseInt(addBulkForm.bulk_sku_id),
        qty_start:   parseFloat(addBulkForm.qty_start),
      })
      setShowAddBulk(false)
      setAddBulkForm({ bulk_sku_id: '', qty_start: '' })
      loadDetail(runDetail.id)
    } catch (e) {
      setAddBulkError(e.response?.data?.detail || 'Failed to add bulk material')
    } finally { setAddingBulk(false) }
  }

  const handleReopenRun = async () => {
    if (!window.confirm('Reopen this run? Variance stats will be cleared and recalculated on next close.')) return
    try {
      const res = await repackingAPI.reopenRun(runDetail.id)
      setRunDetail(res.data)
      setShowClose(false)
      loadRuns()
    } catch (e) { alert(e.response?.data?.detail || 'Failed to reopen run') }
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

  // Landed costs for the currently selected bulk SKU (for new run form)
  const matchingLandedCosts = runForm.bulk_sku_id
    ? (landedCosts || []).filter(lc => String(lc.bulk_sku_id) === String(runForm.bulk_sku_id))
    : []

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
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <StatusBadge status={runDetail.status} />
                    {runDetail.flag_high_variance && (
                      <span className="flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                        <AlertTriangle size={11} /> HIGH VARIANCE
                      </span>
                    )}
                    {runDetail.linked_batch_ref && (
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                        📦 Batch: {runDetail.linked_batch_ref}
                      </span>
                    )}
                    {runDetail.status === 'closed' && (
                      <button
                        onClick={handleReopenRun}
                        className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 hover:bg-amber-200 transition-colors"
                        title="Re-open this run to add more outputs or adjust bulk weights"
                      >
                        ↩ Reopen Run
                      </button>
                    )}
                  </div>
                  <h2 className="text-lg font-bold text-gray-800">{runDetail.run_ref || `Run #${runDetail.id}`}</h2>
                  <div className="flex flex-wrap gap-4 mt-2 text-sm text-gray-500">
                    <span>Started: {runDetail.created_at ? new Date(runDetail.created_at).toLocaleString() : '—'}</span>
                    {runDetail.started_by && <span>Operator: <span className="font-medium text-gray-700">{runDetail.started_by}</span></span>}
                    {runDetail.closed_at && <span>Closed: {new Date(runDetail.closed_at).toLocaleString()}</span>}
                    {runDetail.linked_cost_per_kg != null && (
                      <span>
                        Cost rate: <span className="font-medium text-green-700">${(+runDetail.linked_cost_per_kg).toFixed(4)}/kg</span>
                      </span>
                    )}
                  </div>
                  {runDetail.notes && <p className="text-sm text-gray-500 mt-1 italic">{runDetail.notes}</p>}
                </div>
              </div>

              {runDetail.status === 'closed' && (
                <div className={`mt-4 rounded-lg p-3 ${varianceBg(runDetail.variance_pct)}`}>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                    <div><div className="text-xs text-gray-500 mb-0.5">Theoretical</div><div className="font-bold text-gray-800">{(runDetail.theoretical_kg ?? 0).toFixed(3)} kg</div></div>
                    <div><div className="text-xs text-gray-500 mb-0.5">Actual Used</div><div className="font-bold text-gray-800">{(runDetail.actual_kg ?? 0).toFixed(3)} kg</div></div>
                    <div>
                      <div className="text-xs text-gray-500 mb-0.5">Variance</div>
                      <div className={`font-bold ${varianceColor(runDetail.variance_pct)}`}>
                        {runDetail.variance_kg != null ? `${runDetail.variance_kg >= 0 ? '+' : ''}${runDetail.variance_kg.toFixed(3)} kg` : '—'}
                      </div>
                    </div>
                    <div><div className="text-xs text-gray-500 mb-0.5">Variance %</div><div className={`font-bold ${varianceColor(runDetail.variance_pct)}`}><VarianceBadge pct={runDetail.variance_pct} /></div></div>
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
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-gray-800">Bulk Material Usage</h3>
                {runDetail.status === 'open' && (
                  <button
                    onClick={() => { setShowAddBulk(s => !s); setAddBulkError(null) }}
                    className="btn-secondary flex items-center gap-1.5 text-sm"
                  >
                    <Plus size={14} /> Add Bulk Material
                  </button>
                )}
              </div>

              {showAddBulk && runDetail.status === 'open' && (
                <form onSubmit={handleAddBulk} className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg space-y-2">
                  <p className="text-xs font-semibold text-blue-800 mb-1">Add another bulk material to this run (e.g. a second spice added mid-run)</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Bulk SKU</label>
                      <select className="input w-full" value={addBulkForm.bulk_sku_id}
                        onChange={e => setAddBulkForm(f => ({ ...f, bulk_sku_id: e.target.value }))} required>
                        <option value="">Select bulk material…</option>
                        {skus
                          .filter(s => !runDetail.bulk_entries.some(b => b.bulk_sku_id === s.id))
                          .map(s => <option key={s.id} value={s.id}>{s.product_name} ({s.sku_code})</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Starting Weight (kg)</label>
                      <input type="number" step="0.001" min="0.001" className="input w-full"
                        placeholder="e.g. 500" value={addBulkForm.qty_start}
                        onChange={e => setAddBulkForm(f => ({ ...f, qty_start: e.target.value }))} required />
                    </div>
                  </div>
                  {addBulkError && <p className="text-xs text-red-600 flex items-center gap-1"><AlertTriangle size={12} /> {addBulkError}</p>}
                  <div className="flex gap-2">
                    <button type="submit" className="btn-primary text-sm" disabled={addingBulk}>
                      {addingBulk && <Loader2 size={13} className="animate-spin inline mr-1" />} Add Material
                    </button>
                    <button type="button" className="btn-secondary text-sm" onClick={() => setShowAddBulk(false)}>Cancel</button>
                  </div>
                </form>
              )}

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

            {/* Operational Costs */}
            <OperationalCostsCard runDetail={runDetail} onSaved={() => loadDetail(runDetail.id)} />

            {/* Close run */}
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

  // ── Run list view ───────────────────────────────────────────
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
                <select className="input w-full" value={runForm.bulk_sku_id} onChange={e => setRunForm(f => ({ ...f, bulk_sku_id: e.target.value, landed_cost_id: '' }))} required>
                  <option value="">Select bulk material…</option>
                  {skus.map(s => <option key={s.id} value={s.id}>{s.product_name} ({s.sku_code})</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Starting Weight (kg) <span className="text-red-500">*</span></label>
                <input type="number" step="0.001" min="0.001" className="input w-full" placeholder="e.g. 1000" value={runForm.qty_start} onChange={e => setRunForm(f => ({ ...f, qty_start: e.target.value }))} required />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Link Landed Cost Batch
                  <span className="ml-1 text-xs text-gray-400 font-normal">(optional — for accurate costing)</span>
                </label>
                {runForm.bulk_sku_id && matchingLandedCosts.length === 0 ? (
                  <div className="text-xs text-amber-600 italic mt-1 flex items-center gap-1">
                    <AlertTriangle size={12} /> No landed costs recorded for this SKU — add one in the Landed Costs tab.
                  </div>
                ) : (
                  <select
                    className="input w-full"
                    value={runForm.landed_cost_id}
                    onChange={e => setRunForm(f => ({ ...f, landed_cost_id: e.target.value }))}
                    disabled={!runForm.bulk_sku_id || matchingLandedCosts.length === 0}
                  >
                    <option value="">Use most recent batch automatically</option>
                    {matchingLandedCosts.map(lc => (
                      <option key={lc.id} value={lc.id}>
                        {lc.batch_ref || `LC #${lc.id}`} · {lc.bulk_sku_name} — ${(+lc.cost_per_kg).toFixed(4)}/kg · {(+lc.qty_kg).toFixed(0)} kg · {new Date(lc.created_at).toLocaleDateString()}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Operator Name</label>
                <input type="text" className="input w-full" placeholder="Who is running this pack?" value={runForm.started_by} onChange={e => setRunForm(f => ({ ...f, started_by: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Notes</label>
                <input type="text" className="input w-full" placeholder="Optional notes…" value={runForm.notes} onChange={e => setRunForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
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
                  <td className="px-4 py-3 text-gray-600">
                    {r.bulk_sku_names?.length > 0
                      ? r.bulk_sku_names.join(' + ')
                      : (r.bulk_sku_name || '—')}
                  </td>
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
  const [summary, setSummary]   = useState(null)
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)
  const [costData, setCostData] = useState({})
  const [costsLoading, setCostsLoading] = useState(false)
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate]     = useState('')

  const load = useCallback(async (from, to) => {
    setLoading(true); setError(null)
    try {
      const params = {}
      if (from) params.from_date = from
      if (to)   params.to_date   = to
      const res = await repackingAPI.summary(params)
      setSummary(res.data)
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to load summary')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load(fromDate, toDate) }, [load, fromDate, toDate])

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

  const flaggedRuns = summary?.worst_runs?.filter(r => r.flag_high_variance) ?? []
  const closedRunsWithCost = (summary?.worst_runs ?? []).filter(r => costData[r.id]?.grand_total_cost > 0)

  return (
    <div className="space-y-6">
      {/* Date filter */}
      <div className="card py-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium text-gray-700">Filter by date:</span>
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500">From</label>
            <input
              type="date"
              className="input text-sm py-1.5 px-2"
              value={fromDate}
              onChange={e => setFromDate(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500">To</label>
            <input
              type="date"
              className="input text-sm py-1.5 px-2"
              value={toDate}
              onChange={e => setToDate(e.target.value)}
            />
          </div>
          {(fromDate || toDate) && (
            <button
              onClick={() => { setFromDate(''); setToDate('') }}
              className="text-xs text-blue-600 hover:text-blue-800 font-medium"
            >
              Clear filter
            </button>
          )}
          {(fromDate || toDate) && summary && (
            <span className="text-xs text-gray-400">
              Showing {summary.total_runs} run{summary.total_runs !== 1 ? 's' : ''} in range
            </span>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="animate-spin text-blue-500" size={28} /></div>
      ) : error ? (
        <div className="card text-red-600 flex items-center gap-2"><AlertTriangle size={18} /> {error}</div>
      ) : !summary ? null : (
        <>
          {/* Flagged runs alert */}
          {flaggedRuns.length > 0 && (
            <div className="border border-red-300 bg-red-50 rounded-xl p-4 flex items-start gap-3">
              <AlertTriangle size={20} className="text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-red-800 text-sm">
                  {flaggedRuns.length} run{flaggedRuns.length > 1 ? 's' : ''} flagged for high variance — investigate immediately
                </p>
                <ul className="mt-1.5 space-y-0.5">
                  {flaggedRuns.map(r => (
                    <li key={r.id} className="text-xs text-red-700">
                      <strong>{r.run_ref || `Run #${r.id}`}</strong> — variance{' '}
                      {r.variance_pct != null ? `${r.variance_pct >= 0 ? '+' : ''}${r.variance_pct.toFixed(1)}%` : '?'}
                      {r.variance_kg != null ? ` (${r.variance_kg >= 0 ? '+' : ''}${r.variance_kg.toFixed(3)} kg unaccounted)` : ''}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* Cost Overview */}
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

          {/* Worst runs */}
          {summary.worst_runs.length > 0 && (
            <div>
              <h3 className="font-semibold text-gray-800 mb-3">Closed Runs — Sorted by Worst Variance</h3>
              <div className="card p-0 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                    <tr>
                      <th className="px-4 py-3 text-left">Run</th>
                      <th className="px-4 py-3 text-left">Bulk Material</th>
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
                        <td className="px-4 py-3 text-gray-500 text-xs">
                          {r.bulk_sku_names?.length > 0 ? r.bulk_sku_names.join(' + ') : '—'}
                        </td>
                        <td className="px-4 py-3 text-gray-500 text-xs">{r.closed_at ? new Date(r.closed_at).toLocaleDateString() : '—'}</td>
                        <td className="px-4 py-3 text-right font-mono">{(r.theoretical_kg ?? 0).toFixed(3)}</td>
                        <td className="px-4 py-3 text-right font-mono">{(r.actual_kg ?? 0).toFixed(3)}</td>
                        <td className={`px-4 py-3 text-right font-mono ${varianceColor(r.variance_pct)}`}>
                          {r.variance_kg != null ? `${r.variance_kg >= 0 ? '+' : ''}${r.variance_kg.toFixed(3)}` : '—'}
                        </td>
                        <td className="px-4 py-3 text-right"><VarianceBadge pct={r.variance_pct} /></td>
                        <td className="px-4 py-3 text-center">
                          {r.flag_high_variance
                            ? <span className="flex items-center justify-center gap-1 text-xs text-red-700 font-semibold"><AlertTriangle size={13} /> HIGH VARIANCE</span>
                            : <span className="text-green-500"><CheckCircle2 size={14} /></span>
                          }
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
              <p className="font-medium">No closed runs yet{(fromDate || toDate) ? ' in this date range' : ''}.</p>
              <p className="text-sm mt-1">Summary statistics will appear once runs are completed.</p>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── Main Repacking page ───────────────────────────────────────
const TABS = ['Bills of Materials', 'Purchases', 'Packing Runs', 'Summary']

export default function Repacking() {
  const [activeTab, setActiveTab]       = useState(2)
  const [skus, setSkus]                 = useState([])
  const [skusLoading, setSkusLoading]   = useState(true)
  const [landedCosts, setLandedCosts]   = useState([])
  const [flaggedCount, setFlaggedCount] = useState(0)

  // Load SKUs and landed costs together on mount
  useEffect(() => {
    const init = async () => {
      try {
        const [skuRes, lcRes, sumRes] = await Promise.all([
          skuAPI.list({ limit: 500 }),
          repackingAPI.listLandedCosts(),
          repackingAPI.summary({}),
        ])
        const items = Array.isArray(skuRes.data) ? skuRes.data : (skuRes.data?.items || skuRes.data?.skus || [])
        setSkus(items)
        setLandedCosts(Array.isArray(lcRes.data) ? lcRes.data : [])
        setFlaggedCount(sumRes.data?.flagged_runs ?? 0)
      } catch {
        setSkus([])
        setLandedCosts([])
      } finally {
        setSkusLoading(false)
      }
    }
    init()
  }, [])

  // Refresh landed costs when user switches to Purchases or Packing Runs tab
  const handleTabChange = async (i) => {
    setActiveTab(i)
    // Always refresh landed cost list when switching to Purchases (tab 1) or Packing Runs (tab 2),
    // so that the "Link Landed Cost Batch" dropdown in new-run form stays up to date.
    if (i === 1 || i === 2) {
      try {
        const res = await repackingAPI.listLandedCosts()
        setLandedCosts(Array.isArray(res.data) ? res.data : [])
      } catch {}
    }
  }

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

      {/* Global flagged-runs banner (always visible, all tabs) */}
      {flaggedCount > 0 && (
        <div className="mb-4 flex items-center gap-3 bg-red-50 border border-red-300 rounded-xl px-4 py-3">
          <AlertTriangle size={18} className="text-red-600 flex-shrink-0" />
          <p className="text-sm text-red-800 font-medium flex-1">
            <strong>{flaggedCount} packing run{flaggedCount > 1 ? 's' : ''}</strong> flagged for high variance.
            Check the <button onClick={() => setActiveTab(3)} className="underline font-bold">Summary tab</button> to investigate.
          </p>
        </div>
      )}

      <SetupGuide />

      <div className="flex gap-1 mb-6 bg-gray-100 rounded-xl p-1 w-fit">
        {TABS.map((tab, i) => (
          <button
            key={tab}
            onClick={() => handleTabChange(i)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors relative ${
              activeTab === i
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            {tab}
            {/* Red dot on Summary tab when there are flagged runs */}
            {i === 3 && flaggedCount > 0 && (
              <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full" />
            )}
          </button>
        ))}
      </div>

      {skusLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="animate-spin text-blue-500" size={28} /></div>
      ) : (
        <>
          {activeTab === 0 && <BOMTab skus={skus} />}
          {activeTab === 1 && <PurchasesTab skus={skus} />}
          {activeTab === 2 && <RunsTab skus={skus} landedCosts={landedCosts} />}
          {activeTab === 3 && <SummaryTab />}
        </>
      )}
    </div>
  )
}
