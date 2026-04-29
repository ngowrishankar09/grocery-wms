import { useState, useEffect, useCallback, useMemo } from 'react'
import { repackingAPI, skuAPI } from '../api/client'
import {
  Loader2, Plus, Trash2, Package, ChevronLeft, AlertTriangle,
  CheckCircle2, X, Factory, Scale, DollarSign, Edit2, Save,
  ChevronDown, Play,
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

// ── Workflow Guide (collapsible flow strip) ───────────────────
function WorkflowGuide({ activeTab, onTabChange }) {
  const steps = [
    { n: 1, label: 'Bill of Materials', tabIdx: 0 },
    { n: 2, label: 'Purchases',         tabIdx: 1 },
    { n: 3, label: 'Packing Runs',      tabIdx: 2 },
    { n: 4, label: 'Summary',           tabIdx: 3 },
  ]
  return (
    <div className="mb-4">
      {/* Compact tab-like strip */}
      <div className="flex items-center gap-1 overflow-x-auto">
        {steps.map((s, idx) => (
          <div key={s.n} className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onTabChange(s.tabIdx)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                activeTab === s.tabIdx
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <span className={`w-4 h-4 rounded-full text-[10px] font-bold flex items-center justify-center flex-shrink-0 ${
                activeTab === s.tabIdx ? 'bg-white/30 text-white' : 'bg-gray-300 text-gray-600'
              }`}>{s.n}</span>
              {s.label}
            </button>
            {idx < steps.length - 1 && <span className="text-gray-300 text-sm">›</span>}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Searchable SKU input ──────────────────────────────────────
function SKUSearch({ skus, value, onChange, placeholder = 'Search SKU…', required = false, disabled = false, alreadyLinked = [] }) {
  const [query, setQuery]     = useState('')
  const [focused, setFocused] = useState(false)
  const selected = skus.find(s => String(s.id) === String(value))
  const displayValue = focused
    ? query
    : (selected ? `${selected.product_name} (${selected.sku_code})` : '')

  const filtered = query.trim()
    ? skus.filter(s =>
        s.product_name.toLowerCase().includes(query.toLowerCase()) ||
        s.sku_code.toLowerCase().includes(query.toLowerCase())
      )
    : skus.slice(0, 40)   // show first 40 when no query; typing narrows further

  const handleSelect = (sku) => {
    if (alreadyLinked.includes(sku.id)) return
    onChange(String(sku.id)); setQuery(''); setFocused(false)
  }

  return (
    <div className="relative">
      <input
        type="text"
        className={`input w-full text-sm ${disabled ? 'opacity-50 cursor-not-allowed bg-gray-50' : ''}`}
        placeholder={disabled ? 'Select a bulk material first…' : placeholder}
        value={displayValue}
        required={required && !value}
        disabled={disabled}
        onChange={e => { setQuery(e.target.value); setFocused(true) }}
        onFocus={() => { if (!disabled) { setFocused(true); setQuery('') } }}
        onBlur={() => setTimeout(() => setFocused(false), 180)}
        autoComplete="off"
      />
      {focused && !disabled && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-64 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="px-3 py-2.5 text-xs text-gray-400 italic">No matching SKUs found</div>
          ) : filtered.map(s => {
            const linked = alreadyLinked.includes(s.id)
            return (
              <button
                key={s.id}
                type="button"
                className={`w-full text-left px-3 py-2 text-sm border-b border-gray-50 last:border-0 transition-colors
                  ${linked ? 'opacity-40 cursor-not-allowed bg-gray-50' : 'hover:bg-blue-50'}`}
                onMouseDown={() => handleSelect(s)}
              >
                <span className={`font-medium ${linked ? 'text-gray-400' : 'text-gray-800'}`}>{s.product_name}</span>
                <span className="ml-2 text-xs text-gray-400 font-mono">{s.sku_code}</span>
                {linked && <span className="ml-2 text-xs text-orange-400">already added</span>}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Unit weight conversion helpers ───────────────────────────
function toKg(weight, uom) {
  if (!weight) return null
  const w = parseFloat(weight)
  if (isNaN(w)) return null
  switch (uom) {
    case 'kg':  return w
    case 'g':   return w / 1000
    case 'oz':  return w * 0.0283495
    case 'lbs': return w * 0.453592
    case 'ml':  return w / 1000   // ml treated as g (water density)
    case 'l':   return w           // l treated as kg
    default:    return w / 1000
  }
}

// ── Multi-currency cost line row component ────────────────────
const CURRENCIES = ['USD','INR','GBP','EUR','PKR']
function CostLineRow({ line, idx, onChange, onRemove, onFetchFx, fetchingFx }) {
  const usdEq = ((parseFloat(line.amount) || 0) * (parseFloat(line.fx_rate_to_usd) || 1)).toFixed(2)
  return (
    <div className="flex items-end gap-2 flex-wrap">
      <div className="flex-1 min-w-[140px]">
        {idx === 0 && <label className="block text-xs text-gray-500 mb-1">Description</label>}
        <input type="text" className="input w-full text-sm" placeholder="e.g. Material cost, Freight…"
          value={line.description} onChange={e => onChange(idx, 'description', e.target.value)} />
      </div>
      <div className="w-28">
        {idx === 0 && <label className="block text-xs text-gray-500 mb-1">Amount</label>}
        <input type="number" step="0.01" min="0" className="input w-full text-sm" placeholder="0.00"
          value={line.amount} onChange={e => onChange(idx, 'amount', e.target.value)} />
      </div>
      <div className="w-20">
        {idx === 0 && <label className="block text-xs text-gray-500 mb-1">Currency</label>}
        <select className="input w-full text-sm" value={line.currency} onChange={e => onChange(idx, 'currency', e.target.value)}>
          {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <div className="w-28">
        {idx === 0 && <label className="block text-xs text-gray-500 mb-1">Rate → USD</label>}
        <div className="flex gap-1">
          <input type="number" step="0.000001" min="0" className="input flex-1 text-sm min-w-0" placeholder="1.0"
            value={line.fx_rate_to_usd} onChange={e => onChange(idx, 'fx_rate_to_usd', e.target.value)} />
          <button type="button"
            className="text-xs bg-blue-50 border border-blue-200 text-blue-700 rounded px-1.5 hover:bg-blue-100 transition-colors whitespace-nowrap"
            title={`Fetch live ${line.currency}→USD rate`}
            onClick={() => onFetchFx(idx, line.currency)}
            disabled={fetchingFx === idx || line.currency === 'USD'}
          >
            {fetchingFx === idx ? <Loader2 size={10} className="animate-spin" /> : '↻'}
          </button>
        </div>
      </div>
      <div className="w-24 text-right">
        {idx === 0 && <label className="block text-xs text-gray-500 mb-1">≈ USD</label>}
        <div className="text-sm font-semibold text-green-700 py-2">${usdEq}</div>
      </div>
      <button type="button" onClick={() => onRemove(idx)}
        className="text-gray-300 hover:text-red-500 p-1.5 rounded transition-colors mb-0.5">
        <X size={14} />
      </button>
    </div>
  )
}

// ── Inline weight setter — shown when a retail SKU has no unit_weight ────────
function InlineWeightSetter({ sku, qtyMode, onApply }) {
  const [weight, setWeight] = useState('')
  const [uom, setUom]       = useState('g')
  const [saving, setSaving] = useState(false)
  const [done, setDone]     = useState(false)

  const handle = async () => {
    const w = parseFloat(weight)
    if (!w || w <= 0) return
    setSaving(true)
    try {
      // Save to SKU Master (best-effort — if column not on server yet, still fill locally)
      try { await skuAPI.update(sku.id, { unit_weight: w, unit_weight_uom: uom }) } catch {}
      const kgPerUnit = toKg(w, uom)
      onApply(kgPerUnit)
      setDone(true)
    } finally { setSaving(false) }
  }

  if (done) return (
    <p className="text-xs text-emerald-600 mt-1">✓ Weight saved — bulk qty auto-filled</p>
  )

  const preview = (() => {
    const w = parseFloat(weight)
    if (!w) return null
    const kgPerUnit = toKg(w, uom)
    if (!kgPerUnit) return null
    if (qtyMode === 'case' && sku.case_size)
      return `${sku.case_size} × ${w}${uom} = ${(kgPerUnit * sku.case_size).toFixed(3)} kg/case`
    return `${w}${uom} = ${kgPerUnit.toFixed(4)} kg/unit`
  })()

  return (
    <div className="mt-1.5 rounded-lg border border-amber-200 bg-amber-50 p-2 space-y-1.5">
      <p className="text-xs text-amber-700 font-medium flex items-center gap-1">
        <AlertTriangle size={11} /> No unit weight in SKU Master — set it once to enable auto-fill forever
      </p>
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-gray-600 whitespace-nowrap">1 unit weighs:</span>
        <input
          type="number" min="0.001" step="0.001"
          className="input text-sm w-20 py-1"
          placeholder="200"
          value={weight}
          onChange={e => setWeight(e.target.value)}
        />
        <select className="input text-sm w-16 py-1" value={uom} onChange={e => setUom(e.target.value)}>
          <option value="g">g</option>
          <option value="kg">kg</option>
          <option value="oz">oz</option>
          <option value="lbs">lbs</option>
        </select>
        <button
          type="button"
          disabled={!weight || saving}
          onClick={handle}
          className="text-xs font-semibold px-2 py-1 rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-40 whitespace-nowrap"
        >
          {saving ? '…' : 'Use & Save'}
        </button>
      </div>
      {preview && <p className="text-xs text-blue-600">→ {preview}</p>}
    </div>
  )
}

// ── Tab 1: Bill of Materials (Bulk → Retail yields) ───────────
function BOMTab({ skus, refreshSkus, onGoToStock }) {
  const [boms, setBoms]           = useState([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState(null)
  const [showForm, setShowForm]   = useState(false)
  const [editBomId, setEditBomId] = useState(null)   // null = add mode, number = edit single row
  const [saving, setSaving]       = useState(false)
  const [formError, setFormError] = useState(null)
  const [showAllRetail, setShowAllRetail] = useState(false)
  // Custom bulk creation (when no bulk SKUs exist in master)
  const [customBulkName, setCustomBulkName]           = useState('')
  const [customBulkWeight, setCustomBulkWeight]       = useState('')
  const [customBulkWeightUom, setCustomBulkWeightUom] = useState('kg')
  const [customBulkCostPerKg, setCustomBulkCostPerKg] = useState('')
  const [bulkCostInput, setBulkCostInput]             = useState('')  // cost/kg for existing bulk SKU
  const [creatingNewBulk, setCreatingNewBulk]         = useState(false) // "add a new bulk material" mode when hasBulkFlag

  // ── Form state ───────────────────────────────────────────────
  // input_sku_id: the one bulk material selected for this form session
  // rows: one or more retail output rows (multi-add)
  const emptyRow  = () => ({ id: Date.now() + Math.random(), output_sku_id: '', qty_per_unit: '', unit: 'kg', waste_pct_allowed: 2, qtyMode: 'case' })
  const emptyForm = { input_sku_id: '', rows: [emptyRow()] }
  const [form, setForm] = useState(emptyForm)

  // ── Row helpers ──────────────────────────────────────────────
  const updateRow = (idx, patch) =>
    setForm(f => ({ ...f, rows: f.rows.map((r, i) => i === idx ? { ...r, ...patch } : r) }))

  const addRow = () => setForm(f => ({ ...f, rows: [...f.rows, emptyRow()] }))

  const removeRow = (idx) => setForm(f => ({ ...f, rows: f.rows.filter((_, i) => i !== idx) }))

  // Auto-fill qty when retail SKU is selected for a row
  // Compute auto-fill qty for a SKU given the row's qtyMode
  const autoQtyFromSku = (sku, qtyMode) => {
    if (!sku?.unit_weight) return null
    const kgPerUnit = toKg(sku.unit_weight, sku.unit_weight_uom || 'g')
    if (kgPerUnit == null) return null
    if (qtyMode === 'unit') return kgPerUnit.toFixed(4)
    if (qtyMode === 'case' && sku.case_size) return (kgPerUnit * sku.case_size).toFixed(4)
    // Has unit_weight but no case_size → switch to per-unit mode automatically
    return kgPerUnit.toFixed(4)
  }

  const handleRetailSkuChange = (idx, skuId) => {
    const sku     = skus.find(s => String(s.id) === String(skuId))
    const qtyMode = form.rows[idx]?.qtyMode || 'case'
    const autoQty = autoQtyFromSku(sku, qtyMode)
    // If SKU has no case_size but has unit_weight, switch row to per-unit mode
    const modeOverride = sku?.unit_weight && !sku?.case_size ? { qtyMode: 'unit' } : {}
    updateRow(idx, {
      output_sku_id: skuId,
      qty_per_unit:  autoQty ?? '',
      ...modeOverride,
    })
  }

  // Per-row auto-calc preview (shown under the retail product name)
  const rowPreview = (row) => {
    const sku = skus.find(s => String(s.id) === String(row.output_sku_id))
    if (!sku?.unit_weight) return null
    const kgPerUnit = toKg(sku.unit_weight, sku.unit_weight_uom || 'g')
    if (!kgPerUnit) return null
    const uom     = sku.unit_weight_uom || 'g'
    if (row.qtyMode === 'unit') {
      return { label: `${sku.unit_weight}${uom}/unit = ${kgPerUnit.toFixed(4)} kg/unit` }
    }
    if (sku.case_size) {
      return { label: `${sku.case_size} × ${sku.unit_weight}${uom} = ${(kgPerUnit * sku.case_size).toFixed(4)} kg/case` }
    }
    return { label: `${sku.unit_weight}${uom}/unit = ${kgPerUnit.toFixed(4)} kg` }
  }

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try { const res = await repackingAPI.listBOM(); setBoms(res.data) }
    catch (e) { setError(e.response?.data?.detail || 'Failed to load BOM') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  // Group BOMs by bulk (input) SKU for the display cards
  const grouped = useMemo(() => {
    const map = {}
    boms.forEach(b => {
      const key = b.input_sku_id
      if (!map[key]) map[key] = { bulk_id: key, bulk_name: b.input_sku_name, bulk_code: b.input_sku_code, outputs: [] }
      map[key].outputs.push(b)
    })
    return Object.values(map)
  }, [boms])

  const resetForm = () => {
    setForm(emptyForm)
    setCustomBulkName(''); setCustomBulkWeight(''); setCustomBulkWeightUom('kg'); setCustomBulkCostPerKg('')
    setBulkCostInput(''); setCreatingNewBulk(false)
    setFormError(null)
  }

  const openNew = (prefillBulkId = '') => {
    setEditBomId(null)
    setForm({ input_sku_id: prefillBulkId ? String(prefillBulkId) : '', rows: [emptyRow()] })
    setCustomBulkName(''); setCustomBulkWeight(''); setCustomBulkWeightUom('kg'); setCustomBulkCostPerKg('')
    setBulkCostInput(''); setCreatingNewBulk(false)
    setFormError(null); setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // Edit a single existing BOM row
  const openEdit = (bom) => {
    setEditBomId(bom.id)
    setForm({
      input_sku_id: String(bom.input_sku_id),
      rows: [{
        id: bom.id,
        output_sku_id:     String(bom.output_sku_id),
        qty_per_unit:      String(bom.qty_per_unit),
        unit:              bom.unit || 'kg',
        waste_pct_allowed: bom.waste_pct_allowed ?? 2,
        qtyMode: 'case',
      }],
    })
    setCustomBulkName(''); setCustomBulkWeight(''); setCustomBulkWeightUom('kg'); setCustomBulkCostPerKg('')
    setBulkCostInput(''); setCreatingNewBulk(false)
    setFormError(null); setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleSubmit = async (e) => {
    e.preventDefault(); setFormError(null)

    // ── Step 1: resolve bulk SKU ID ──────────────────────────
    let resolvedInputSkuId = form.input_sku_id
    if (!hasBulkFlag || creatingNewBulk) {
      const name = customBulkName.trim()
      if (!name) { setFormError('Please enter the name of the raw material.'); return }
      setSaving(true)
      try {
        const autoCode = 'BULK-' + name.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10) + '-' + Date.now().toString().slice(-4)
        const skuRes = await skuAPI.create({
          sku_code: autoCode, product_name: name, category: 'Bulk',
          case_size: 1,
          unit_weight:     customBulkWeight ? parseFloat(customBulkWeight) : null,
          unit_weight_uom: customBulkWeightUom || 'kg',
          is_bulk_material: true,
          cost_price: customBulkCostPerKg ? parseFloat(customBulkCostPerKg) : null,
        })
        resolvedInputSkuId = String(skuRes.data.id)
        await refreshSkus()
      } catch (err) {
        setFormError('Could not create bulk material: ' + (err.response?.data?.detail || err.message))
        setSaving(false); return
      }
    }
    if (!resolvedInputSkuId) { setFormError('Please select a bulk material.'); setSaving(false); return }

    // If user entered a cost/kg for an existing bulk SKU, save it now
    if (hasBulkFlag && !creatingNewBulk && bulkCostInput) {
      try { await skuAPI.update(parseInt(resolvedInputSkuId), { cost_price: parseFloat(bulkCostInput) }) }
      catch {}  // best-effort — don't block BOM save
    }

    // ── Step 2: validate rows ────────────────────────────────
    const validRows = form.rows.filter(r => r.output_sku_id && r.qty_per_unit)
    if (validRows.length === 0) { setFormError('Please fill in at least one retail product row.'); setSaving(false); return }
    const dupInForm = validRows.map(r => r.output_sku_id).filter((v, i, a) => a.indexOf(v) !== i)
    if (dupInForm.length) { setFormError('You have the same retail product in more than one row.'); setSaving(false); return }

    // ── Step 3: save ─────────────────────────────────────────
    setSaving(true)
    try {
      if (editBomId) {
        // Edit mode — always single row
        const r = validRows[0]
        let qty = parseFloat(r.qty_per_unit)
        if (r.qtyMode === 'unit') {
          const outSku = skus.find(s => String(s.id) === String(r.output_sku_id))
          if (outSku?.case_size > 1) qty = qty * outSku.case_size
        }
        await repackingAPI.updateBOM(editBomId, {
          output_sku_id: parseInt(r.output_sku_id), input_sku_id: parseInt(resolvedInputSkuId),
          qty_per_unit: qty, unit: r.unit, waste_pct_allowed: parseFloat(r.waste_pct_allowed), notes: null,
        })
      } else {
        // Add mode — save all rows in parallel
        await Promise.all(validRows.map(r => {
          let qty = parseFloat(r.qty_per_unit)
          if (r.qtyMode === 'unit') {
            const outSku = skus.find(s => String(s.id) === String(r.output_sku_id))
            if (outSku?.case_size > 1) qty = qty * outSku.case_size
          }
          return repackingAPI.createBOM({
            output_sku_id: parseInt(r.output_sku_id), input_sku_id: parseInt(resolvedInputSkuId),
            qty_per_unit: qty, unit: r.unit, waste_pct_allowed: parseFloat(r.waste_pct_allowed), notes: null,
          })
        }))
      }
      setShowForm(false); setEditBomId(null); resetForm(); load()
    } catch (err) { setFormError(err.response?.data?.detail || 'Failed to save') }
    finally { setSaving(false) }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Remove this retail product from this bulk material?')) return
    try { await repackingAPI.deleteBOM(id); load() }
    catch (e) { alert(e.response?.data?.detail || 'Failed to delete') }
  }

  // SKUs already saved in the BOM for the selected bulk (for duplicate warnings)
  const savedLinked = useMemo(() => {
    const bulkId = form.input_sku_id
    if (!bulkId) return []
    const grp = grouped.find(g => String(g.bulk_id) === String(bulkId))
    const saved = grp ? grp.outputs.map(o => o.output_sku_id) : []
    // In edit mode, exclude the row being edited
    return editBomId ? saved.filter(id => {
      const editing = form.rows[0]?.output_sku_id
      return String(id) !== String(editing)
    }) : saved
  }, [form.input_sku_id, form.rows, grouped, editBomId])

  // Smart dropdown lists
  const bulkSkuList   = skus.filter(s => s.is_bulk_material)
  const hasBulkFlag   = bulkSkuList.length > 0
  const bomRetailBase = (hasBulkFlag && !showAllRetail)
    ? skus.filter(s => !s.is_bulk_material)
    : skus

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">My Products</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            For each raw material you buy in bulk, tell us which retail pack sizes you produce from it. Do this once — the system uses it to track usage and costs automatically.
          </p>
        </div>
        <button onClick={() => openNew()} className="btn-primary flex items-center gap-1.5">
          <Plus size={15} /> Add Product
        </button>
      </div>

      {/* ── Add / Edit form ── */}
      {showForm && (
        <div className="card mb-5 border border-blue-200 space-y-4">
          <h3 className="font-semibold text-gray-800">
            {editBomId ? 'Edit retail size' : 'Set up a bulk material'}
          </h3>

          <form onSubmit={handleSubmit} className="space-y-4">

            {/* ── STEP 1: Pick the bulk material ── */}
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 space-y-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Step 1 — Raw material you buy in bulk</p>
              {(!hasBulkFlag || creatingNewBulk) ? (
                /* ── Create a brand-new bulk material ── */
                <div className="space-y-2">
                  {creatingNewBulk && (
                    <button type="button" onClick={() => { setCreatingNewBulk(false); setCustomBulkName(''); setCustomBulkWeight(''); setCustomBulkCostPerKg('') }}
                      className="text-xs text-blue-500 hover:underline flex items-center gap-1">
                      ← Back to existing materials
                    </button>
                  )}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">Material name <span className="text-red-500">*</span></label>
                      <input type="text" className="input w-full" placeholder="e.g. Turmeric Powder"
                        value={customBulkName} onChange={e => setCustomBulkName(e.target.value)} required />
                      <p className="text-xs text-gray-400 mt-1">Will be saved to SKU Master automatically.</p>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">Bag / sack weight</label>
                      <div className="flex gap-2">
                        <input type="number" step="0.01" min="0.01" className="input flex-1" placeholder="e.g. 25"
                          value={customBulkWeight} onChange={e => setCustomBulkWeight(e.target.value)} />
                        <select className="input w-20" value={customBulkWeightUom} onChange={e => setCustomBulkWeightUom(e.target.value)}>
                          <option value="kg">kg</option>
                          <option value="g">g</option>
                          <option value="lbs">lbs</option>
                          <option value="oz">oz</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">Cost per kg ($) <span className="text-gray-400 font-normal">optional</span></label>
                      <input type="number" step="0.01" min="0" className="input w-full" placeholder="e.g. 2.50"
                        value={customBulkCostPerKg} onChange={e => setCustomBulkCostPerKg(e.target.value)} />
                      <p className="text-xs text-gray-400 mt-1">Pre-fills Material Cost in Stock Received.</p>
                    </div>
                  </div>
                </div>
              ) : (
                /* ── Select from existing bulk materials ── */
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-3 items-end">
                    <div className="flex-1 min-w-[200px]">
                      <label className="block text-xs text-gray-600 mb-1">Select bulk material <span className="text-red-500">*</span></label>
                      <select className="input w-full"
                        value={form.input_sku_id}
                        onChange={e => { setForm(f => ({ ...f, input_sku_id: e.target.value, rows: [emptyRow()] })); setBulkCostInput('') }}
                        required disabled={!!editBomId}
                      >
                        <option value="">Select…</option>
                        {bulkSkuList.map(s => <option key={s.id} value={s.id}>{s.product_name} ({s.sku_code})</option>)}
                      </select>
                    </div>
                    {form.input_sku_id && (() => {
                      const selSku = skus.find(s => String(s.id) === String(form.input_sku_id))
                      return (
                        <div className="w-40">
                          <label className="block text-xs text-gray-600 mb-1">
                            Cost per kg ($)
                            {selSku?.cost_price ? <span className="text-green-600 ml-1">✓ ${selSku.cost_price}/kg</span> : <span className="text-gray-400 font-normal ml-1">optional</span>}
                          </label>
                          <input type="number" step="0.01" min="0" className="input w-full"
                            placeholder={selSku?.cost_price ? String(selSku.cost_price) : 'e.g. 2.50'}
                            value={bulkCostInput} onChange={e => setBulkCostInput(e.target.value)} />
                        </div>
                      )
                    })()}
                  </div>
                  {!editBomId && (
                    <button type="button" onClick={() => { setCreatingNewBulk(true); setForm(f => ({ ...f, input_sku_id: '', rows: [emptyRow()] })) }}
                      className="text-xs text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1">
                      <Plus size={11} /> Add a different bulk material
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* ── STEP 2: Retail sizes produced from it ── */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Step 2 — Retail sizes you pack from it
                </p>
                {hasBulkFlag && (
                  <button type="button" onClick={() => setShowAllRetail(v => !v)}
                    className="text-xs text-blue-500 hover:underline">
                    {showAllRetail ? '↑ Retail SKUs only' : '↓ Show all SKUs'}
                  </button>
                )}
              </div>

              {/* Already-linked retail products for the selected bulk — shown in add mode */}
              {!editBomId && form.input_sku_id && (() => {
                const existingGroup = grouped.find(g => String(g.bulk_id) === String(form.input_sku_id))
                if (!existingGroup || existingGroup.outputs.length === 0) return null
                return (
                  <div className="bg-green-50 border border-green-200 rounded-xl px-3 py-2 mb-1">
                    <p className="text-xs font-semibold text-green-700 mb-1.5">✓ Already set up ({existingGroup.outputs.length})</p>
                    <div className="flex flex-wrap gap-1.5">
                      {existingGroup.outputs.map(o => {
                        const sku = skus.find(s => s.id === o.output_sku_id)
                        return (
                          <span key={o.id} className="inline-flex items-center gap-1 text-xs bg-white border border-green-200 text-green-800 px-2 py-1 rounded-lg">
                            <CheckCircle2 size={10} className="text-green-500" />
                            {o.output_sku_name}
                            {sku?.case_size && sku?.unit_weight ? <span className="text-green-500 ml-0.5">{sku.case_size}×{sku.unit_weight}{sku.unit_weight_uom||'g'}</span> : null}
                          </span>
                        )
                      })}
                    </div>
                    <p className="text-xs text-green-600 mt-1.5">Add more sizes below ↓</p>
                  </div>
                )
              })()}

              {/* Column headers — desktop only */}
              <div className="hidden md:grid grid-cols-12 gap-2 text-xs font-medium text-gray-400 px-1">
                <div className="col-span-5">Retail product</div>
                <div className="col-span-4">Bulk used per case</div>
                <div className="col-span-2">Waste %</div>
                <div className="col-span-1"></div>
              </div>

              {form.rows.map((row, idx) => {
                const isDisabled = (hasBulkFlag && !creatingNewBulk) ? !form.input_sku_id : !customBulkName.trim()
                // Retail SKUs available for this row: exclude other rows' selections + already saved
                const usedInOtherRows = form.rows.filter((_, i) => i !== idx).map(r => r.output_sku_id).filter(Boolean).map(Number)
                const rowRetailList = bomRetailBase.filter(s =>
                  String(s.id) !== String(form.input_sku_id) && !usedInOtherRows.includes(s.id)
                )
                const preview = rowPreview(row)
                return (
                  <div key={row.id} className="bg-white border border-gray-200 rounded-xl p-3 space-y-2 md:space-y-0 md:grid md:grid-cols-12 md:gap-2 md:items-start">
                    {/* Retail product search */}
                    <div className="md:col-span-5">
                      <label className="block text-xs text-gray-500 mb-1 md:hidden">Retail product *</label>
                      <SKUSearch
                        skus={rowRetailList}
                        value={row.output_sku_id}
                        onChange={skuId => handleRetailSkuChange(idx, skuId)}
                        placeholder="Search product…"
                        required
                        disabled={isDisabled}
                        alreadyLinked={savedLinked}
                      />
                      {preview && (
                        <p className="text-xs text-emerald-600 mt-1">
                          ✓ {preview.label}
                        </p>
                      )}
                      {/* Inline weight setter — shown when SKU selected but unit_weight missing */}
                      {row.output_sku_id && (() => {
                        const outSku = skus.find(s => String(s.id) === String(row.output_sku_id))
                        if (!outSku || outSku.unit_weight) return null
                        return (
                          <InlineWeightSetter
                            sku={outSku}
                            qtyMode={row.qtyMode}
                            onApply={(kgPerUnit) => {
                              const newQty = row.qtyMode === 'case' && outSku.case_size
                                ? (kgPerUnit * outSku.case_size).toFixed(4)
                                : kgPerUnit.toFixed(4)
                              updateRow(idx, { qty_per_unit: newQty })
                              // Also refresh skus so future rows auto-fill too
                              refreshSkus()
                            }}
                          />
                        )
                      })()}
                    </div>

                    {/* Qty used + unit */}
                    <div className="md:col-span-4">
                      <label className="block text-xs text-gray-500 mb-1 md:hidden">Bulk used *</label>
                      <div className="space-y-1">
                        <div className="flex gap-1">
                          <input type="number" step="0.001" min="0.001" className="input flex-1 text-sm"
                            placeholder={row.qtyMode === 'unit' ? 'per unit' : 'per case'}
                            value={row.qty_per_unit}
                            onChange={e => updateRow(idx, { qty_per_unit: e.target.value })}
                            required />
                          <select className="input w-16 text-sm" value={row.unit}
                            onChange={e => updateRow(idx, { unit: e.target.value })}>
                            <option value="kg">kg</option>
                            <option value="g">g</option>
                            <option value="lbs">lbs</option>
                            <option value="oz">oz</option>
                          </select>
                        </div>
                        {/* per unit / per case pill */}
                        <div className="flex text-xs border border-gray-200 rounded-lg overflow-hidden w-fit">
                          {['unit', 'case'].map(m => (
                            <button key={m} type="button"
                              className={`px-2 py-0.5 transition-colors ${row.qtyMode === m ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-100'}`}
                              onClick={() => {
                                // Recalculate qty when switching mode
                                const outSku  = skus.find(s => String(s.id) === String(row.output_sku_id))
                                const newQty  = autoQtyFromSku(outSku, m)
                                updateRow(idx, { qtyMode: m, ...(newQty ? { qty_per_unit: newQty } : {}) })
                              }}>
                              per {m}
                            </button>
                          ))}
                        </div>
                        {(() => {
                          const outSku = skus.find(s => String(s.id) === String(row.output_sku_id))
                          if (!outSku) return null
                          if (row.qtyMode === 'unit' && row.qty_per_unit && outSku.case_size > 1) {
                            return <p className="text-xs text-blue-600">= {(parseFloat(row.qty_per_unit) * outSku.case_size).toFixed(3)} {row.unit}/case</p>
                          }
                          if (row.qty_per_unit && outSku.unit_weight) {
                            return <p className="text-xs text-emerald-600">✓ auto-filled from SKU master</p>
                          }
                          return null
                        })()}
                      </div>
                    </div>

                    {/* Waste % */}
                    <div className="md:col-span-2">
                      <label className="block text-xs text-gray-500 mb-1 md:hidden">Waste %</label>
                      <input type="number" step="0.1" min="0" max="100" className="input w-full text-sm"
                        value={row.waste_pct_allowed}
                        onChange={e => updateRow(idx, { waste_pct_allowed: e.target.value })} />
                    </div>

                    {/* Remove row */}
                    <div className="md:col-span-1 flex items-start justify-end pt-0.5">
                      {form.rows.length > 1 && (
                        <button type="button" onClick={() => removeRow(idx)}
                          className="p-1 text-gray-300 hover:text-red-500 rounded transition-colors" title="Remove">
                          <X size={15} />
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}

              {/* Add another row — only in add mode */}
              {!editBomId && (
                <button type="button" onClick={addRow}
                  className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 font-medium mt-1 transition-colors">
                  <Plus size={15} /> Add another size
                </button>
              )}
            </div>

            {formError && <p className="text-sm text-red-600 flex items-center gap-1"><AlertTriangle size={14} /> {formError}</p>}

            <div className="flex gap-2 pt-1">
              <button type="submit" className="btn-primary flex items-center gap-1.5" disabled={saving}>
                {saving && <Loader2 size={14} className="animate-spin" />}
                {editBomId ? 'Update' : `Save${form.rows.length > 1 ? ` (${form.rows.filter(r => r.output_sku_id).length} sizes)` : ''}`}
              </button>
              <button type="button" className="btn-secondary"
                onClick={() => { setShowForm(false); setEditBomId(null); resetForm() }}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* ── List ── */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="animate-spin text-blue-500" size={28} /></div>
      ) : error ? (
        <div className="card text-red-600 flex items-center gap-2"><AlertTriangle size={18} /> {error}</div>
      ) : grouped.length === 0 ? (
        <div className="card text-center py-12 text-gray-400">
          <Package size={36} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium">No products set up yet.</p>
          <p className="text-sm mt-1 max-w-sm mx-auto">
            Start here. Pick the raw material you buy (e.g. Chilli Powder bulk sack), then tell us which retail sizes you pack from it — e.g. 400g bags, 800g bags, 5lb bags.
          </p>
          <button onClick={() => openNew()} className="btn-primary mt-4 mx-auto">+ Add My First Product</button>
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.map(group => (
            <div key={group.bulk_id} className="card p-0 overflow-hidden border border-gray-200">
              {/* Bulk material header */}
              <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200">
                <div className="flex items-center gap-2.5">
                  <span className="text-lg">📦</span>
                  <div>
                    <p className="font-semibold text-gray-800 text-sm">{group.bulk_name}</p>
                    <p className="text-xs text-gray-400 font-mono">{group.bulk_code}</p>
                  </div>
                  <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium ml-2">
                    {group.outputs.length} retail pack{group.outputs.length !== 1 ? 's' : ''}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {onGoToStock && (
                    <button
                      type="button"
                      onClick={() => onGoToStock(group.bulk_id)}
                      className="text-xs text-green-700 hover:text-green-900 border border-green-300 hover:border-green-500 bg-green-50 hover:bg-green-100 px-2.5 py-1 rounded-lg transition-colors flex items-center gap-1 font-medium"
                    >
                      Log delivery →
                    </button>
                  )}
                  <button
                    onClick={() => openNew(group.bulk_id)}
                    className="text-xs text-blue-600 hover:text-blue-800 border border-blue-200 hover:border-blue-400 px-2.5 py-1 rounded-lg transition-colors flex items-center gap-1"
                  >
                    <Plus size={11} /> Add retail product
                  </button>
                </div>
              </div>

              {/* Retail outputs table */}
              <table className="w-full text-sm">
                <thead className="bg-white text-xs text-gray-400 uppercase tracking-wide border-b border-gray-100">
                  <tr>
                    <th className="px-4 py-2 text-left pl-8">Retail product</th>
                    <th className="px-4 py-2 text-right">Pack size</th>
                    <th className="px-4 py-2 text-right">Raw material per case</th>
                    <th className="px-4 py-2 text-right">Acceptable loss %</th>
                    <th className="px-4 py-2 text-left">Notes</th>
                    <th className="px-4 py-2 w-16" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {group.outputs.map(b => {
                    const sku = skus.find(s => s.id === b.output_sku_id)
                    return (
                      <tr key={b.id} className={`hover:bg-gray-50 transition-colors ${editBomId === b.id ? 'bg-blue-50' : ''}`}>
                        <td className="px-4 py-3 pl-8">
                          <div className="flex items-center gap-2">
                            <span className="text-gray-400">↳</span>
                            <div>
                              <div className="font-medium text-gray-800">{b.output_sku_name}</div>
                              <div className="text-xs text-gray-400 font-mono">{b.output_sku_code}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right text-gray-600">
                          {sku?.case_size ? (
                            <span>{sku.case_size} × {sku.unit_weight ? `${sku.unit_weight}${sku.unit_weight_uom || 'g'}` : sku.unit_label}</span>
                          ) : '—'}
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-semibold text-gray-800">
                          {b.qty_per_unit} {b.unit}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                            b.waste_pct_allowed <= 2 ? 'bg-green-100 text-green-700' :
                            b.waste_pct_allowed <= 5 ? 'bg-amber-100 text-amber-700' :
                            'bg-red-100 text-red-700'
                          }`}>{b.waste_pct_allowed}%</span>
                        </td>
                        <td className="px-4 py-3 text-gray-400 text-xs">{b.notes || '—'}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={() => openEdit(b)} className="p-1.5 text-gray-400 hover:text-blue-500 rounded transition-colors" title="Edit"><Edit2 size={13} /></button>
                            <button onClick={() => handleDelete(b.id)} className="p-1.5 text-gray-400 hover:text-red-500 rounded transition-colors" title="Remove"><Trash2 size={14} /></button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Tab 2: Purchases / Shipments ─────────────────────────────
function PurchasesTab({ skus, onStartPacking, preFillSkuId }) {
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
  const [bomInputIds, setBomInputIds]   = useState([])            // input_sku_ids — catches non-flagged bulk SKUs
  const [bomsByInput, setBomsByInput]   = useState({})            // { input_sku_id: [bom,...] } for retail-pack hints

  const emptyCostLine = () => ({ description: '', amount: '', currency: 'USD', fx_rate_to_usd: '1', sort_order: 0 })
  const emptyLine = () => ({ bulk_sku_id: '', qty_kg: '', qty_uom: 'kg', bag_weight_kg: '', sku_cases: {}, cost_material: '', cost_packaging_mat: '', cost_labor: '' })

  // Convert any unit to kg for calculations / saving
  const resolveKg = (line) => {
    const qty = parseFloat(line.qty_kg) || 0
    const uom = line.qty_uom || 'kg'
    if (uom === 'kg')   return qty
    if (uom === 'g')    return qty / 1000
    if (uom === 'lbs')  return qty * 0.453592
    if (uom === 'oz')   return qty * 0.0283495
    if (uom === 'bags') return qty * (parseFloat(line.bag_weight_kg) || 0)
    return qty
  }
  const emptyForm = () => ({
    batch_ref: '', supplier: '', supplier_country: '', currency: 'USD', purchase_date: '', exchange_rate: '1',
    shared_freight: '', shared_duty: '', shared_overhead: '', shared_other: '',
    notes: '',
    lines: [emptyLine()],
    cost_lines: [],   // new multi-currency cost lines
  })
  const [form, setForm] = useState(emptyForm())
  const [fetchingFx, setFetchingFx] = useState(null)  // idx of line currently fetching

  const fetchFxRate = async (idx, currency) => {
    if (currency === 'USD') return
    setFetchingFx(idx)
    try {
      const res = await repackingAPI.getFxRate(currency)
      const rate = res.data.rate
      setForm(f => {
        const cl = [...f.cost_lines]
        cl[idx] = { ...cl[idx], fx_rate_to_usd: String(rate) }
        return { ...f, cost_lines: cl }
      })
    } catch (e) {
      alert(`Could not fetch live ${currency}/USD rate. Please enter manually.`)
    } finally { setFetchingFx(null) }
  }

  const updateCostLine  = (i, key, val) => setForm(f => {
    const cl = [...f.cost_lines]; cl[i] = { ...cl[i], [key]: val }; return { ...f, cost_lines: cl }
  })
  const addCostLine    = () => setForm(f => ({ ...f, cost_lines: [...f.cost_lines, emptyCostLine()] }))
  const removeCostLine = (i) => setForm(f => ({ ...f, cost_lines: f.cost_lines.filter((_, idx) => idx !== i) }))

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await repackingAPI.listPurchases()
      setPurchases(res.data)
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to load purchases')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => {
    load()
    // Load BOM — (1) surface non-flagged bulk SKUs, (2) build retail-pack hints per input SKU
    repackingAPI.listBOM()
      .then(res => {
        const data = Array.isArray(res.data) ? res.data : []
        setBomInputIds([...new Set(data.map(b => b.input_sku_id))])
        const grouped = {}
        data.forEach(b => { const k = String(b.input_sku_id); grouped[k] = [...(grouped[k] || []), b] })
        setBomsByInput(grouped)
      })
      .catch(() => {})
  }, [load])

  // When navigated from My Products "Log delivery →", auto-open form pre-selecting that bulk SKU
  useEffect(() => {
    if (!preFillSkuId) return
    setEditId(null)
    setForm({ ...emptyForm(), lines: [{ ...emptyLine(), bulk_sku_id: String(preFillSkuId) }] })
    setFormError(null)
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [preFillSkuId]) // eslint-disable-line

  // Live cost-per-kg preview for one line
  const calcLinePreview = (lineIdx) => {
    const line   = form.lines[lineIdx]
    const lineKg = resolveKg(line)
    if (lineKg === 0) return null
    const totalKg     = form.lines.reduce((s, l) => s + resolveKg(l), 0) || 1
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
    const lines = [...f.lines]
    lines[i] = { ...lines[i], [key]: val }

    // Auto-fill Material Cost from SKU's standard cost_price when qty or SKU changes
    if (key === 'qty_kg' || key === 'bulk_sku_id') {
      const line = lines[i]
      const sku = skus.find(s => String(s.id) === String(line.bulk_sku_id))
      if (sku?.cost_price && !parseFloat(line.cost_material)) {
        const qty = parseFloat(line.qty_kg) || 0
        const uom = line.qty_uom || 'kg'
        let kg = qty
        if (uom === 'g')    kg = qty / 1000
        else if (uom === 'lbs') kg = qty * 0.453592
        else if (uom === 'oz')  kg = qty * 0.0283495
        else if (uom === 'bags') kg = qty * (parseFloat(line.bag_weight_kg) || 0)
        if (kg > 0) lines[i] = { ...lines[i], cost_material: (kg * sku.cost_price).toFixed(2) }
      }
    }

    return { ...f, lines }
  })

  // Update case count for a specific retail SKU within a delivery line,
  // and auto-recalculate total bulk kg from all case entries
  const updateSkuCases = (lineIdx, skuId, cases) => setForm(f => {
    const lines = [...f.lines]
    const line  = lines[lineIdx]
    const newSkuCases = { ...line.sku_cases, [String(skuId)]: cases }
    // Sum up: total kg = Σ (cases × qty_per_unit from BOM)
    const linkedBOMs = bomsByInput[String(line.bulk_sku_id)] || []
    const totalKg = linkedBOMs.reduce((sum, b) => {
      const c = parseFloat(newSkuCases[String(b.output_sku_id)] || 0)
      return sum + c * (parseFloat(b.qty_per_unit) || 0)
    }, 0)
    // Auto-fill cost_material from cost_price if not yet entered
    const bulkSku = skus.find(s => String(s.id) === String(line.bulk_sku_id))
    const newCost = (!parseFloat(line.cost_material) && bulkSku?.cost_price && totalKg > 0)
      ? (totalKg * bulkSku.cost_price).toFixed(2)
      : line.cost_material
    lines[lineIdx] = { ...line, sku_cases: newSkuCases, qty_kg: totalKg > 0 ? totalKg.toFixed(3) : line.qty_kg, cost_material: newCost }
    return { ...f, lines }
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
        batch_ref:        d.batch_ref       || '',
        supplier:         d.supplier        || '',
        supplier_country: d.supplier_country || '',
        currency:         d.currency        || 'USD',
        purchase_date:    d.purchase_date   || '',
        exchange_rate:    String(d.exchange_rate ?? 1),
        shared_freight:   String(d.shared_freight  ?? 0),
        shared_duty:      String(d.shared_duty     ?? 0),
        shared_overhead:  String(d.shared_overhead ?? 0),
        shared_other:     String(d.shared_other    ?? 0),
        notes:            d.notes || '',
        lines: (d.items || []).map(item => ({
          bulk_sku_id:        String(item.bulk_sku_id),
          qty_kg:             String(item.qty_kg),
          qty_uom:            'kg',      // saved data is always in kg
          bag_weight_kg:      '',
          cost_material:      String(item.cost_material      ?? 0),
          cost_packaging_mat: String(item.cost_packaging_mat ?? 0),
          cost_labor:         String(item.cost_labor         ?? 0),
        })),
        cost_lines: (d.cost_lines || []).map(cl => ({
          description:    cl.description,
          amount:         String(cl.amount),
          currency:       cl.currency || 'USD',
          fx_rate_to_usd: String(cl.fx_rate_to_usd ?? 1),
          sort_order:     cl.sort_order || 0,
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
    // Validate bags: must have a bag weight
    const badBagLine = validLines.find(l => l.qty_uom === 'bags' && !parseFloat(l.bag_weight_kg))
    if (badBagLine) {
      setFormError('Please enter the weight per bag for bag-unit lines.'); return
    }
    const payload = {
      batch_ref:        form.batch_ref      || null,
      supplier:         form.supplier       || null,
      supplier_country: form.supplier_country || null,
      currency:         form.currency,
      purchase_date:    form.purchase_date  || null,
      exchange_rate:    parseFloat(form.exchange_rate) || 1.0,
      shared_freight:   parseFloat(form.shared_freight)  || 0,
      shared_duty:      parseFloat(form.shared_duty)     || 0,
      shared_overhead:  parseFloat(form.shared_overhead) || 0,
      shared_other:     parseFloat(form.shared_other)    || 0,
      notes:            form.notes || null,
      lines: validLines.map(l => ({
        bulk_sku_id:        parseInt(l.bulk_sku_id),
        qty_kg:             resolveKg(l),          // always saved as kg
        cost_material:      parseFloat(l.cost_material)      || 0,
        cost_packaging_mat: parseFloat(l.cost_packaging_mat) || 0,
        cost_labor:         parseFloat(l.cost_labor)         || 0,
      })),
      cost_lines: form.cost_lines
        .filter(cl => cl.description && cl.amount)
        .map((cl, i) => ({
          description:    cl.description,
          amount:         parseFloat(cl.amount) || 0,
          currency:       cl.currency || 'USD',
          fx_rate_to_usd: parseFloat(cl.fx_rate_to_usd) || 1.0,
          sort_order:     i,
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

  // Show any SKU that is flagged as bulk OR referenced as a raw material in any BOM
  const bulkSkus = skus.filter(s => s.is_bulk_material || bomInputIds.includes(s.id))

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">Stock Received</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Every time bulk material arrives from your supplier, log it here. Include what it cost — material, freight, duty, anything. The system calculates your exact cost per kg.
          </p>
        </div>
        <button onClick={openNew} className="btn-primary flex items-center gap-1.5">
          <Plus size={15} /> Record a Delivery
        </button>
      </div>

      {showForm && (
        <div className="card mb-6 border border-green-200 bg-green-50">
          <h3 className="font-semibold text-gray-800 mb-4">
            {editId ? '✏️ Edit delivery record' : '📦 Record a new delivery'}
          </h3>
          <form onSubmit={handleSubmit} className="space-y-5">

            {/* ── Shipment header ─────────────────────────────── */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Delivery Details</p>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Invoice / Reference No.</label>
                  <input type="text" className="input w-full" placeholder="e.g. INV-2026-041" value={form.batch_ref} onChange={e => setForm(f => ({ ...f, batch_ref: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Supplier / Mill</label>
                  <input type="text" className="input w-full" placeholder="e.g. Kohinoor Foods Ltd" value={form.supplier} onChange={e => setForm(f => ({ ...f, supplier: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Country of Origin</label>
                  <input type="text" className="input w-full" placeholder="e.g. India, Pakistan…" value={form.supplier_country} onChange={e => setForm(f => ({ ...f, supplier_country: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Date Received</label>
                  <input type="date" className="input w-full" value={form.purchase_date} onChange={e => setForm(f => ({ ...f, purchase_date: e.target.value }))} />
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

            {/* ── Cost Lines (multi-currency) ──────────────────── */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    What did this delivery cost?
                    <span className="ml-1 font-normal text-gray-400 normal-case">— add as many cost lines as you need, each in its own currency</span>
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">Include everything: material cost, sea freight, import duty, handling charges. Each can be in a different currency.</p>
                </div>
                <button type="button" onClick={addCostLine} className="text-xs text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-1 whitespace-nowrap">
                  <Plus size={12} /> Add Cost Line
                </button>
              </div>
              {form.cost_lines.length === 0 ? (
                <p className="text-xs text-gray-400 italic py-2">No cost lines yet — click "Add Cost Line" to start.</p>
              ) : (
                <div className="space-y-2 bg-white border border-gray-200 rounded-xl p-3">
                  {form.cost_lines.map((cl, i) => (
                    <CostLineRow
                      key={i} line={cl} idx={i}
                      onChange={updateCostLine}
                      onRemove={removeCostLine}
                      onFetchFx={fetchFxRate}
                      fetchingFx={fetchingFx}
                    />
                  ))}
                  <div className="border-t border-gray-100 pt-2 flex justify-end gap-4 text-sm">
                    <span className="text-gray-500">Total cost (USD equivalent):</span>
                    <span className="font-bold text-gray-800">
                      ${form.cost_lines.reduce((sum, cl) => sum + ((parseFloat(cl.amount) || 0) * (parseFloat(cl.fx_rate_to_usd) || 1)), 0).toFixed(2)}
                    </span>
                  </div>
                </div>
              )}
              {/* Legacy shared costs (kept for backward compat on saved records) */}
              <details className="mt-2">
                <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600">Legacy shared cost fields (optional)</summary>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-2">
                  {[
                    { key: 'shared_freight',  label: 'Freight ($)' },
                    { key: 'shared_duty',     label: 'Import Duty ($)' },
                    { key: 'shared_overhead', label: 'Overhead ($)' },
                    { key: 'shared_other',    label: 'Other ($)' },
                  ].map(({ key, label }) => (
                    <div key={key}>
                      <label className="block text-xs font-medium text-gray-700 mb-1">{label}</label>
                      <input type="number" step="0.01" min="0" className="input w-full" placeholder="0.00"
                        value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} />
                    </div>
                  ))}
                </div>
              </details>
            </div>

            {/* ── SKU Lines ───────────────────────────────────── */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  What arrived in this delivery? <span className="font-normal text-gray-400 normal-case ml-1">— one row per product</span>
                </p>
                <button type="button" onClick={addLine} className="text-xs text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-1">
                  <Plus size={12} /> Add product
                </button>
              </div>
              <div className="space-y-3">
                {form.lines.map((line, i) => {
                  const preview    = calcLinePreview(i)
                  const totalKg    = form.lines.reduce((s, l) => s + resolveKg(l), 0)
                  const lineKg     = resolveKg(line)
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
                      {/* Raw material — quick-select cards from Step 1 setup */}
                      <div className="mb-3">
                        <label className="block text-xs font-medium text-gray-700 mb-2">
                          Which raw material arrived? <span className="text-red-500">*</span>
                        </label>
                        {bulkSkus.length === 0 ? (
                          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 flex items-start gap-2">
                            <AlertTriangle size={13} className="mt-0.5 flex-shrink-0" />
                            <span>No bulk materials set up yet. Go to <strong>My Products</strong> (Step 1) and add your bulk materials first.</span>
                          </div>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            {bulkSkus.map(sku => {
                              const isSelected = String(line.bulk_sku_id) === String(sku.id)
                              return (
                                <button
                                  key={sku.id}
                                  type="button"
                                  onClick={() => updateLine(i, 'bulk_sku_id', String(sku.id))}
                                  className={`flex items-center gap-2 px-3 py-2 rounded-xl border-2 text-sm font-medium transition-all ${
                                    isSelected
                                      ? 'border-blue-500 bg-blue-50 text-blue-800 shadow-sm'
                                      : 'border-gray-200 bg-white text-gray-700 hover:border-blue-300 hover:bg-blue-50'
                                  }`}
                                >
                                  <span className="text-base">📦</span>
                                  <span className="font-semibold">{sku.product_name}</span>
                                  <span className="text-xs text-gray-400 font-normal">{sku.sku_code}</span>
                                  {isSelected && <CheckCircle2 size={14} className="text-blue-500 ml-1" />}
                                </button>
                              )
                            })}
                          </div>
                        )}
                        {/* ── Per-SKU case-count inputs → auto-calculates bulk kg ── */}
                        {line.bulk_sku_id && (bomsByInput[line.bulk_sku_id] || []).length > 0 && (() => {
                          const linkedBOMs = bomsByInput[line.bulk_sku_id] || []
                          const totalKg = linkedBOMs.reduce((sum, b) => {
                            const c = parseFloat(line.sku_cases?.[String(b.output_sku_id)] || 0)
                            return sum + c * (parseFloat(b.qty_per_unit) || 0)
                          }, 0)
                          return (
                            <div className="mt-2 rounded-xl bg-indigo-50 border border-indigo-200 p-3">
                              <p className="text-xs font-semibold text-indigo-700 mb-2">
                                Cases received per product
                                <span className="font-normal text-indigo-400 ml-1">— bulk total calculates automatically</span>
                              </p>
                              <div className="space-y-1.5">
                                {linkedBOMs.map(b => {
                                  const retailSku = skus.find(s => s.id === b.output_sku_id)
                                  const cases     = line.sku_cases?.[String(b.output_sku_id)] || ''
                                  const kgEquiv   = parseFloat(cases || 0) * (parseFloat(b.qty_per_unit) || 0)
                                  return (
                                    <div key={b.id} className="flex items-center gap-2">
                                      <div className="flex-1 min-w-0">
                                        <span className="text-xs font-medium text-indigo-800 truncate block">{b.output_sku_name}</span>
                                        <span className="text-xs text-indigo-400">{b.qty_per_unit} {b.unit}/case
                                          {retailSku?.case_size && retailSku?.unit_weight ? ` · ${retailSku.case_size}×${retailSku.unit_weight}${retailSku.unit_weight_uom||'g'}` : ''}
                                        </span>
                                      </div>
                                      <div className="flex items-center gap-1.5 shrink-0">
                                        <input
                                          type="number" min="0" step="1"
                                          className="input w-24 text-sm text-right"
                                          placeholder="0 cases"
                                          value={cases}
                                          onChange={e => updateSkuCases(i, b.output_sku_id, e.target.value)}
                                        />
                                        {kgEquiv > 0 && (
                                          <span className="text-xs text-indigo-500 w-20 text-right shrink-0">= {kgEquiv.toFixed(1)} kg</span>
                                        )}
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>
                              {totalKg > 0 && (
                                <div className="mt-2 pt-2 border-t border-indigo-200 flex items-center justify-between">
                                  <span className="text-xs text-indigo-500">Total bulk used</span>
                                  <span className="text-sm font-bold text-indigo-700">{totalKg.toFixed(2)} kg</span>
                                </div>
                              )}
                            </div>
                          )
                        })()}
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2">
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">
                            {(bomsByInput[line.bulk_sku_id] || []).length > 0 ? 'Total bulk received (kg)' : 'Quantity received'} <span className="text-red-500">*</span>
                          </label>
                          <div className="flex gap-1.5">
                            <input type="number" step="0.001" min="0.001" className="input flex-1 text-sm"
                              placeholder={line.qty_uom === 'bags' ? 'no. of bags' : 'auto-filled from cases above'}
                              value={line.qty_kg} onChange={e => updateLine(i, 'qty_kg', e.target.value)} required />
                            <select className="input w-20 text-sm" value={line.qty_uom}
                              onChange={e => {
                                const uom = e.target.value
                                // Auto-fill bag weight from SKU master when switching to bags
                                if (uom === 'bags') {
                                  const sku = skus.find(s => String(s.id) === String(line.bulk_sku_id))
                                  if (sku?.unit_weight) {
                                    const bagWtKg = toKg(sku.unit_weight, sku.unit_weight_uom || 'g')
                                    updateLine(i, 'qty_uom', uom)
                                    updateLine(i, 'bag_weight_kg', bagWtKg ? String(bagWtKg) : '')
                                    return
                                  }
                                }
                                updateLine(i, 'qty_uom', uom)
                              }}>
                              <option value="kg">kg</option>
                              <option value="g">g</option>
                              <option value="lbs">lbs</option>
                              <option value="oz">oz</option>
                              <option value="bags">bags</option>
                            </select>
                          </div>
                          {/* Bag weight field — only when bags is selected */}
                          {line.qty_uom === 'bags' && (
                            <div className="mt-1.5">
                              <div className="flex gap-1.5 items-center">
                                <input type="number" step="0.001" min="0.001" className="input flex-1 text-sm"
                                  placeholder="kg per bag"
                                  value={line.bag_weight_kg}
                                  onChange={e => updateLine(i, 'bag_weight_kg', e.target.value)} />
                                <span className="text-xs text-gray-400 whitespace-nowrap">kg / bag</span>
                              </div>
                              {line.qty_kg && line.bag_weight_kg && (
                                <p className="text-xs text-blue-600 mt-0.5 font-medium">
                                  = {(parseFloat(line.qty_kg) * parseFloat(line.bag_weight_kg)).toFixed(2)} kg total
                                </p>
                              )}
                            </div>
                          )}
                          {/* Conversion preview for non-kg units */}
                          {line.qty_uom !== 'kg' && line.qty_uom !== 'bags' && line.qty_kg && (
                            <p className="text-xs text-blue-600 mt-0.5">
                              = {resolveKg(line).toFixed(3)} kg
                            </p>
                          )}
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Material Cost ($)</label>
                          <input type="number" step="0.01" min="0" className="input w-full text-sm" placeholder="0.00"
                            value={line.cost_material} onChange={e => updateLine(i, 'cost_material', e.target.value)} />
                          {(() => {
                            const sku = skus.find(s => String(s.id) === String(line.bulk_sku_id))
                            if (!sku?.cost_price) return null
                            return <p className="text-xs text-green-600 mt-0.5">💡 ${sku.cost_price}/kg standard</p>
                          })()}
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
                {editId ? 'Update Record' : 'Save Delivery Record'}
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
          <p className="font-medium">No deliveries recorded yet.</p>
          <p className="text-sm mt-1">When bulk material arrives from your supplier, record it here with the weight and what it cost. That's how the system knows your cost per kg.</p>
          <button onClick={openNew} className="btn-primary mt-4 mx-auto">+ Record First Delivery</button>
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
                      {purchase.supplier_country && <span className="text-xs px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded">🌍 {purchase.supplier_country}</span>}
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
                  <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                    {/* Start packing CTA — the core cross-step connection */}
                    {onStartPacking && (purchase.items?.length ?? 0) > 0 && (
                      <button
                        onClick={() => {
                          const items = purchase.items
                          if (items.length === 1) {
                            onStartPacking(purchase.id, items[0].bulk_sku_id, purchase.batch_ref || `Batch #${purchase.id}`, items[0].bulk_sku_name)
                          } else {
                            // Multiple bulk SKUs — switch tab and let user pick
                            onStartPacking(purchase.id, null, purchase.batch_ref || `Batch #${purchase.id}`, null)
                          }
                        }}
                        className="flex items-center gap-1 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 px-2.5 py-1.5 rounded-lg transition-colors shadow-sm"
                        title="Start a packing session using this batch"
                      >
                        <Play size={11} /> Pack
                      </button>
                    )}
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
                            {onStartPacking && <th className="px-4 py-2 w-24" />}
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
                              {onStartPacking && (
                                <td className="px-4 py-2.5 text-right">
                                  <button
                                    onClick={() => onStartPacking(purchase.id, item.bulk_sku_id, purchase.batch_ref || `Batch #${purchase.id}`, item.bulk_sku_name)}
                                    className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-white hover:bg-blue-600 border border-blue-200 hover:border-blue-600 px-2 py-1 rounded-lg transition-all whitespace-nowrap"
                                  >
                                    <Play size={10} /> Pack this
                                  </button>
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
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-gray-400 italic">No packing sessions from this batch yet.</p>
                        {onStartPacking && (purchase.items?.length ?? 0) > 0 && (
                          <button
                            onClick={() => {
                              const items = purchase.items
                              onStartPacking(purchase.id, items.length === 1 ? items[0].bulk_sku_id : null, purchase.batch_ref || `Batch #${purchase.id}`, items.length === 1 ? items[0].bulk_sku_name : null)
                            }}
                            className="flex items-center gap-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-lg transition-colors"
                          >
                            <Play size={11} /> Start Packing from this batch →
                          </button>
                        )}
                      </div>
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
  const [summary, setSummary]     = useState(null)
  const [loadingCosts, setLoadingCosts]     = useState(true)
  const [loadingSummary, setLoadingSummary] = useState(false)
  // New multi-currency cost lines
  const [costLines, setCostLines]   = useState([])
  const [savingLines, setSavingLines] = useState(false)
  const [saveLineOk, setSaveLineOk]  = useState(false)
  const [saveLineErr, setSaveLineErr] = useState(null)
  const [fetchingFx, setFetchingFx]  = useState(null)

  const emptyCostLine = () => ({ description: '', amount: '', currency: 'USD', fx_rate_to_usd: '1' })

  const loadCostLines = useCallback(async () => {
    setLoadingCosts(true)
    try {
      const res = await repackingAPI.getRunCostLines(runDetail.id)
      const lines = res.data
      setCostLines(lines.length > 0
        ? lines.map(l => ({ description: l.description, amount: String(l.amount), currency: l.currency, fx_rate_to_usd: String(l.fx_rate_to_usd) }))
        : [emptyCostLine()]
      )
    } catch { setCostLines([emptyCostLine()]) }
    finally { setLoadingCosts(false) }
  }, [runDetail.id])

  const fetchFxRate = async (idx, currency) => {
    if (currency === 'USD') return
    setFetchingFx(idx)
    try {
      const res = await repackingAPI.getFxRate(currency)
      setCostLines(cl => {
        const n = [...cl]; n[idx] = { ...n[idx], fx_rate_to_usd: String(res.data.rate) }; return n
      })
    } catch { alert(`Could not fetch live ${currency}/USD rate.`) }
    finally { setFetchingFx(null) }
  }

  const updateLine  = (i, k, v) => setCostLines(cl => { const n = [...cl]; n[i] = { ...n[i], [k]: v }; return n })
  const addLine     = () => setCostLines(cl => [...cl, emptyCostLine()])
  const removeLine  = (i) => setCostLines(cl => cl.filter((_, idx) => idx !== i))

  const loadSummary = useCallback(async () => {
    if (runDetail.status !== 'closed') return
    setLoadingSummary(true)
    try {
      const res = await repackingAPI.costSummary(runDetail.id)
      setSummary(res.data)
    } catch {}
    finally { setLoadingSummary(false) }
  }, [runDetail.id, runDetail.status])

  useEffect(() => { loadCostLines() }, [loadCostLines])
  useEffect(() => { loadSummary() }, [loadSummary])

  const handleSaveLines = async (e) => {
    e.preventDefault(); setSaveLineErr(null); setSaveLineOk(false)
    setSavingLines(true)
    try {
      const valid = costLines.filter(cl => cl.description && cl.amount)
      await repackingAPI.saveRunCostLines(runDetail.id, valid.map((cl, i) => ({
        description:    cl.description,
        amount:         parseFloat(cl.amount) || 0,
        currency:       cl.currency || 'USD',
        fx_rate_to_usd: parseFloat(cl.fx_rate_to_usd) || 1.0,
        sort_order:     i,
      })))
      setSaveLineOk(true)
      await loadCostLines()
      await loadSummary()
      if (onSaved) onSaved()
    } catch (e) {
      setSaveLineErr(e.response?.data?.detail || 'Failed to save costs')
    } finally { setSavingLines(false) }
  }

  const totalLinesUsd = costLines.reduce((s, cl) => s + ((parseFloat(cl.amount) || 0) * (parseFloat(cl.fx_rate_to_usd) || 1)), 0)
  const totalCases    = runDetail.outputs?.reduce((s, o) => s + (o.qty_packed || 0), 0) ?? 0

  if (loadingCosts) {
    return <div className="card flex justify-center py-8"><Loader2 className="animate-spin text-blue-500" size={22} /></div>
  }

  return (
    <div className="card space-y-5">
      <div className="flex items-center gap-2">
        <DollarSign size={18} className="text-green-600" />
        <h3 className="font-semibold text-gray-800 text-base">What did this session cost?</h3>
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Costs incurred during packing
              <span className="ml-1 normal-case font-normal text-gray-400">— e.g. labour, packaging materials, transport — each in any currency</span>
            </p>
          </div>
          <button type="button" onClick={addLine} className="text-xs text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-1">
            <Plus size={12} /> Add Line
          </button>
        </div>
        <form onSubmit={handleSaveLines} className="space-y-3">
          <div className="space-y-2">
            {costLines.map((cl, i) => (
              <CostLineRow
                key={i} line={cl} idx={i}
                onChange={updateLine}
                onRemove={removeLine}
                onFetchFx={fetchFxRate}
                fetchingFx={fetchingFx}
              />
            ))}
          </div>
          <div className="bg-gray-50 rounded-lg px-4 py-3 grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-500">Total packing cost (USD)</span>
              <span className="ml-2 font-bold text-gray-800">{fmt$(totalLinesUsd)}</span>
            </div>
            <div>
              <span className="text-gray-500">Cost per box</span>
              <span className="ml-2 font-bold text-gray-800">{fmt$(totalCases > 0 ? totalLinesUsd / totalCases : 0)}</span>
              <span className="text-xs text-gray-400 ml-1">({totalCases.toFixed(2)} cases)</span>
            </div>
          </div>
          {saveLineErr && <p className="text-sm text-red-600 flex items-center gap-1"><AlertTriangle size={14} /> {saveLineErr}</p>}
          {saveLineOk && <p className="text-sm text-green-600 flex items-center gap-1"><CheckCircle2 size={14} /> Costs saved.</p>}
          <button type="submit" className="btn-primary flex items-center gap-1.5" disabled={savingLines}>
            {savingLines ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Save Costs
          </button>
        </form>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">
          Total cost per box
          <span className="ml-1 normal-case font-normal text-gray-400">— raw material + packing costs combined (available after closing the session)</span>
        </p>
        {runDetail.status === 'open' ? (
          <div className="text-sm text-gray-500 italic bg-gray-50 rounded-lg p-3">
            Full cost breakdown will show here once you close the session.
          </div>
        ) : loadingSummary ? (
          <div className="flex justify-center py-6"><Loader2 className="animate-spin text-blue-500" size={20} /></div>
        ) : summary && summary.cost_per_kg === 0 && (summary.bulk_entries?.every(b => b.cost_per_kg === 0) ?? true) ? (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2 text-sm text-amber-800">
            <AlertTriangle size={15} className="mt-0.5 shrink-0" />
            <span>
              No purchase cost found for <strong>{summary.bulk_sku_name || 'the raw materials in this session'}</strong>.
              {' '}Go to <strong>Stock Received</strong> and record the delivery you used — then come back here to see the full cost breakdown.
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
function RunsTab({ skus, landedCosts, preFill, onPreFillConsumed }) {
  const [runs, setRuns]             = useState([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState(null)
  const [selectedRun, setSelectedRun] = useState(null)
  const [runDetail, setRunDetail]   = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [showNewRun, setShowNewRun] = useState(false)
  const [preFillBanner, setPreFillBanner] = useState(null)  // { batchRef, bulkSkuName }
  const [sessionBOMs, setSessionBOMs] = useState([])  // BOMs for the open session detail

  const [runForm, setRunForm] = useState({
    run_ref: '', bulk_sku_id: '', qty_start: '', started_by: '', notes: '', landed_cost_id: '', units_planned: '',
  })

  // When parent sends a preFill (from "Pack" button on a batch), open form and pre-fill
  useEffect(() => {
    if (!preFill) return
    setRunForm(f => ({
      ...f,
      landed_cost_id: preFill.landed_cost_id ? String(preFill.landed_cost_id) : '',
      bulk_sku_id:    preFill.bulk_sku_id    ? String(preFill.bulk_sku_id)    : '',
    }))
    setPreFillBanner({ batchRef: preFill.batchRef, bulkSkuName: preFill.bulkSkuName })
    setShowNewRun(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
    onPreFillConsumed?.()
  }, [preFill])
  const [runFormError, setRunFormError] = useState(null)
  const [creatingRun, setCreatingRun]   = useState(false)

  const [showAddOutput, setShowAddOutput] = useState(false)
  const [outputForm, setOutputForm]       = useState({ sku_id: '', units_packed: '', units_planned: '' })
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
      const [runRes, bomRes] = await Promise.all([
        repackingAPI.getRun(id),
        repackingAPI.listBOM(),
      ])
      setRunDetail(runRes.data)
      setSessionBOMs(bomRes.data)
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
        units_planned:  runForm.units_planned ? parseInt(runForm.units_planned) : null,
      })
      setShowNewRun(false)
      setRunForm({ run_ref: '', bulk_sku_id: '', qty_start: '', started_by: '', notes: '', landed_cost_id: '', units_planned: '' })
      await loadRuns()
      handleSelectRun(res.data)
    } catch (e) {
      setRunFormError(e.response?.data?.detail || 'Failed to create run')
    } finally { setCreatingRun(false) }
  }

  const handleAddOutput = async (e) => {
    e.preventDefault(); setOutputFormError(null)
    if (!outputForm.sku_id || (!outputForm.units_packed && !outputForm.qty_packed)) {
      setOutputFormError('Please select a SKU and enter units packed.'); return
    }
    const sku = skus.find(s => String(s.id) === String(outputForm.sku_id))
    const unitsPacked  = parseInt(outputForm.units_packed) || 0
    const caseSize     = sku?.case_size || 1
    // Derive cases from units (can be fractional)
    const qtyPacked    = outputForm.units_packed ? unitsPacked / caseSize : parseFloat(outputForm.qty_packed) || 0
    setAddingOutput(true)
    try {
      await repackingAPI.addOutput(runDetail.id, {
        sku_id:        parseInt(outputForm.sku_id),
        qty_packed:    qtyPacked,
        units_packed:  outputForm.units_packed ? unitsPacked : null,
        units_planned: outputForm.units_planned ? parseInt(outputForm.units_planned) : null,
      })
      setShowAddOutput(false)
      setOutputForm({ sku_id: '', units_packed: '', units_planned: '' })
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
    if (!window.confirm('Re-open this session? The difference calculation will be cleared and recalculated when you close again.')) return
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

  // Only SKUs tagged as raw/bulk materials
  const bulkSkus = skus.filter(s => s.is_bulk_material)

  // ── Capacity calculator (used in session detail view) ────────
  const sessionBulkIds  = runDetail ? runDetail.bulk_entries.map(b => b.bulk_sku_id) : []
  const relevantBOMs    = sessionBOMs.filter(b => sessionBulkIds.includes(b.input_sku_id))
  const totalStartKg    = runDetail ? runDetail.bulk_entries.reduce((s, b) => s + (b.qty_start || 0), 0) : 0
  const consumedKg      = runDetail ? calcTheoreticalKg(runDetail.outputs) : 0
  const remainingKg     = Math.max(0, totalStartKg - consumedKg)
  const usedPct         = totalStartKg > 0 ? Math.min(100, consumedKg / totalStartKg * 100) : 0
  const bomCapacities   = relevantBOMs.map(bom => ({
    ...bom,
    maxUnits:      bom.qty_per_unit > 0 ? Math.floor(remainingKg / bom.qty_per_unit) : 0,
    alreadyLogged: runDetail?.outputs.find(o => String(o.sku_id) === String(bom.output_sku_id)) || null,
  })).sort((a, b) => b.maxUnits - a.maxUnits)

  // ── Run detail view ─────────────────────────────────────────
  if (selectedRun) {
    return (
      <div>
        <button
          onClick={() => { setSelectedRun(null); setRunDetail(null) }}
          className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 mb-4 font-medium"
        >
          <ChevronLeft size={16} /> Back to Sessions
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
                        <AlertTriangle size={11} /> More bulk used than expected — investigate
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
                        title="Re-open this session to add more outputs or adjust bulk weights"
                      >
                        ↩ Re-open Session
                      </button>
                    )}
                  </div>
                  <h2 className="text-lg font-bold text-gray-800">{runDetail.run_ref || `Session #${runDetail.id}`}</h2>
                  <div className="flex flex-wrap gap-4 mt-2 text-sm text-gray-500">
                    <span>Started: {runDetail.created_at ? new Date(runDetail.created_at).toLocaleString() : '—'}</span>
                    {runDetail.started_by && <span>Packed by: <span className="font-medium text-gray-700">{runDetail.started_by}</span></span>}
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

            {/* ── Smart Bulk Meter ─────────────────────────────────── */}
            {runDetail.status === 'open' && totalStartKg > 0 && (
              <div className="rounded-xl border-2 border-blue-400 bg-gradient-to-r from-blue-50 to-indigo-50 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-blue-800 font-bold text-sm">
                    <Scale size={16} /> Bulk Remaining
                  </div>
                  <div className="text-right">
                    <span className="text-2xl font-black text-blue-700">{remainingKg.toFixed(2)} kg</span>
                    <span className="text-xs text-blue-500 ml-1">left</span>
                  </div>
                </div>
                {/* Progress bar */}
                <div className="w-full h-3 bg-blue-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${usedPct > 90 ? 'bg-red-500' : usedPct > 70 ? 'bg-amber-500' : 'bg-blue-500'}`}
                    style={{ width: `${usedPct}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs text-blue-600">
                  <span>Used: {consumedKg.toFixed(2)} kg ({usedPct.toFixed(1)}%)</span>
                  <span>Started with: {totalStartKg.toFixed(2)} kg</span>
                </div>

                {/* BOM capacity cards */}
                {bomCapacities.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-blue-800 mb-2 uppercase tracking-wide">With remaining bulk you can pack:</p>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                      {bomCapacities.map(bom => {
                        const alreadyUnits = bom.alreadyLogged ? bom.alreadyLogged.units_packed : 0
                        const kgUsed       = bom.alreadyLogged ? (bom.alreadyLogged.bom_live_kg ?? 0) : 0
                        return (
                          <div key={bom.output_sku_id}
                            className="bg-white rounded-xl border-2 border-blue-200 p-3 text-center relative"
                          >
                            {bom.alreadyLogged && (
                              <div className="absolute top-1.5 right-1.5">
                                <CheckCircle2 size={14} className="text-green-500" />
                              </div>
                            )}
                            <div className="text-xs font-semibold text-gray-700 leading-tight mb-1">{bom.output_sku_name}</div>
                            <div className="text-xs text-gray-400 mb-2">{bom.qty_per_unit} kg/unit</div>
                            <div className={`text-2xl font-black ${bom.maxUnits === 0 ? 'text-red-500' : 'text-blue-700'}`}>
                              {bom.maxUnits.toLocaleString()}
                            </div>
                            <div className="text-xs text-gray-500">units possible</div>
                            {bom.alreadyLogged && (
                              <div className="mt-1.5 text-xs text-green-600 font-medium">
                                {alreadyUnits} logged · {kgUsed.toFixed(2)} kg used
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Outputs section */}
            <div className="card">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-gray-800">What was packed</h3>
                {runDetail.status === 'open' && (
                  <button onClick={() => { setShowAddOutput(s => !s); setOutputFormError(null); setOutputForm({ sku_id: '', units_packed: '', units_planned: '' }) }}
                    className="btn-secondary flex items-center gap-1.5 text-sm">
                    <Plus size={14} /> Log what I packed
                  </button>
                )}
              </div>

              {showAddOutput && runDetail.status === 'open' && (
                <form onSubmit={handleAddOutput} className="mb-4 rounded-xl border-2 border-blue-300 bg-blue-50 p-4 space-y-3">
                  {/* Step 1: pick product from BOM cards if available, else dropdown */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-2">
                      Which product did you pack? <span className="text-red-500">*</span>
                    </label>
                    {bomCapacities.length > 0 ? (
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-2">
                        {bomCapacities.map(bom => {
                          const isSelected = String(outputForm.sku_id) === String(bom.output_sku_id)
                          return (
                            <button
                              key={bom.output_sku_id}
                              type="button"
                              onClick={() => setOutputForm(f => ({
                                ...f,
                                sku_id: String(bom.output_sku_id),
                                units_planned: bom.maxUnits > 0 ? String(bom.maxUnits) : f.units_planned,
                              }))}
                              className={`text-left p-3 rounded-xl border-2 transition-all ${
                                isSelected
                                  ? 'border-blue-500 bg-blue-100 ring-2 ring-blue-300'
                                  : 'border-gray-200 bg-white hover:border-blue-300'
                              }`}
                            >
                              <div className="font-semibold text-sm text-gray-800 leading-tight">{bom.output_sku_name}</div>
                              <div className="text-xs text-gray-400 mt-0.5">{bom.output_sku_code}</div>
                              <div className="mt-2 flex items-baseline gap-1">
                                <span className={`text-xl font-black ${bom.maxUnits === 0 ? 'text-red-500' : 'text-blue-700'}`}>
                                  {bom.maxUnits.toLocaleString()}
                                </span>
                                <span className="text-xs text-gray-500">max units</span>
                              </div>
                              <div className="text-xs text-gray-400">{bom.qty_per_unit} kg/unit</div>
                            </button>
                          )
                        })}
                      </div>
                    ) : (
                      /* Fallback: plain dropdown if no BOM set up */
                      <select className="input w-full" value={outputForm.sku_id}
                        onChange={e => setOutputForm(f => ({ ...f, sku_id: e.target.value }))} required>
                        <option value="">Select product…</option>
                        {(skus.some(s => s.is_bulk_material) ? skus.filter(s => !s.is_bulk_material) : skus)
                          .map(s => <option key={s.id} value={s.id}>{s.product_name} ({s.sku_code})</option>)}
                      </select>
                    )}
                  </div>

                  {/* Step 2: qty — only shown when product selected */}
                  {outputForm.sku_id && (() => {
                    const sku          = skus.find(s => String(s.id) === String(outputForm.sku_id))
                    const caseSize     = sku?.case_size
                    const unitsPacked  = parseInt(outputForm.units_packed) || 0
                    const casesFromUnits = caseSize && unitsPacked ? (unitsPacked / caseSize).toFixed(2) : null
                    const bom          = bomCapacities.find(b => String(b.output_sku_id) === String(outputForm.sku_id))
                    const kgNeeded     = bom && unitsPacked ? (unitsPacked * bom.qty_per_unit).toFixed(3) : null
                    const kgRemaining  = bom ? remainingKg - (unitsPacked * bom.qty_per_unit) : null
                    return (
                      <div className="bg-white rounded-xl border border-blue-200 p-3 space-y-3">
                        <p className="text-xs font-semibold text-blue-700">
                          📦 {sku?.product_name} {bom ? `· ${bom.qty_per_unit} kg per unit` : ''}
                        </p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">
                              Units actually packed <span className="text-red-500">*</span>
                              {caseSize && <span className="ml-1 text-gray-400 font-normal">(1 box = {caseSize} units)</span>}
                            </label>
                            <input type="number" step="1" min="0" className="input w-full" placeholder="e.g. 220"
                              value={outputForm.units_packed}
                              onChange={e => setOutputForm(f => ({ ...f, units_packed: e.target.value }))} required />
                            {casesFromUnits && <p className="text-xs text-blue-600 mt-0.5">→ {casesFromUnits} cases</p>}
                            {kgNeeded && <p className="text-xs text-purple-600 mt-0.5">Uses {kgNeeded} kg of bulk</p>}
                            {kgRemaining != null && kgRemaining >= 0 && unitsPacked > 0 && (
                              <p className="text-xs text-green-600 mt-0.5">
                                {kgRemaining.toFixed(2)} kg will remain after this
                              </p>
                            )}
                            {kgRemaining != null && kgRemaining < 0 && (
                              <p className="text-xs text-red-600 font-semibold mt-0.5">
                                ⚠ Exceeds available bulk by {Math.abs(kgRemaining).toFixed(2)} kg!
                              </p>
                            )}
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">
                              Units planned <span className="text-gray-400 font-normal">(auto-filled from capacity)</span>
                            </label>
                            <input type="number" step="1" min="0" className="input w-full"
                              placeholder={bom ? `e.g. ${bom.maxUnits}` : 'e.g. 245'}
                              value={outputForm.units_planned}
                              onChange={e => setOutputForm(f => ({ ...f, units_planned: e.target.value }))} />
                            {outputForm.units_planned && outputForm.units_packed &&
                              parseInt(outputForm.units_planned) > parseInt(outputForm.units_packed) && (
                              <p className="text-xs text-amber-600 mt-0.5 font-semibold">
                                ⚠ Short by {parseInt(outputForm.units_planned) - parseInt(outputForm.units_packed)} units
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })()}

                  {outputFormError && <p className="text-xs text-red-600 flex items-center gap-1"><AlertTriangle size={12} /> {outputFormError}</p>}
                  <div className="flex gap-2">
                    <button type="submit" className="btn-primary text-sm" disabled={addingOutput || !outputForm.sku_id}>
                      {addingOutput && <Loader2 size={13} className="animate-spin inline mr-1" />} Save
                    </button>
                    <button type="button" className="btn-secondary text-sm" onClick={() => { setShowAddOutput(false); setOutputForm({ sku_id: '', units_packed: '', units_planned: '' }) }}>Cancel</button>
                  </div>
                </form>
              )}

              {runDetail.outputs.length === 0 ? (
                <p className="text-sm text-gray-400 py-4 text-center">Nothing logged yet. Use "Log what I packed" to record each retail product you packed in this session.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="text-xs text-gray-500 uppercase tracking-wide">
                    <tr>
                      <th className="pb-2 text-left">Product</th>
                      <th className="pb-2 text-right">Units packed</th>
                      <th className="pb-2 text-right">Boxes</th>
                      <th className="pb-2 text-right">Expected usage</th>
                      <th className="pb-2 text-right">Raw material used</th>
                      {runDetail.status === 'open' && <th className="pb-2" />}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {runDetail.outputs.map(o => {
                      const liveKg = o.bom_live_kg ?? o.theoretical_kg
                      const shortage = (o.units_planned && o.units_packed && o.units_planned > o.units_packed)
                        ? o.units_planned - o.units_packed : 0
                      return (
                        <tr key={o.id}>
                          <td className="py-2">
                            <div className="font-medium text-gray-800">{o.product_name}</div>
                            <div className="text-xs text-gray-400">{o.sku_code}</div>
                          </td>
                          <td className="py-2 text-right">
                            {o.units_packed != null ? (
                              <div>
                                <span className="font-mono font-semibold">{o.units_packed}</span>
                                {o.units_planned && (
                                  <span className="text-xs text-gray-400 ml-1">/ {o.units_planned}</span>
                                )}
                                {shortage > 0 && (
                                  <div className="text-xs font-semibold text-amber-600">⚠ -{shortage} short</div>
                                )}
                                {o.units_planned && !shortage && (
                                  <div className="text-xs text-green-600">✓ fulfilled</div>
                                )}
                              </div>
                            ) : '—'}
                          </td>
                          <td className="py-2 text-right font-mono font-semibold">{(+o.qty_packed).toFixed(2)}</td>
                          <td className="py-2 text-right text-xs text-gray-500">
                            {o.bom_qty_per_unit != null
                              ? `${o.bom_qty_per_unit} ${o.bom_unit ?? 'kg'}/box`
                              : <span className="text-orange-500">Not set up</span>}
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


            {/* Bulk usage section */}
            <div className="card">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-gray-800">Raw Material Used</h3>
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
                        {bulkSkus
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
                                <p className="text-xs text-gray-500">Expected weight remaining on scale</p>
                                <p className="text-2xl font-black text-blue-700">{expected != null ? `${expected.toFixed(3)} kg` : '—'}</p>
                                <p className="text-xs text-gray-400 mt-0.5">({b.qty_start} kg you started with − {theoretical.toFixed(3)} kg expected to be used)</p>
                              </div>
                            </div>
                          </div>
                          <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">
                              Put the leftover bulk back on the scale — what does it weigh? (kg)
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
                                <div><p className="text-xs text-gray-500">Expected to be used</p><p className="font-bold">{theoretical.toFixed(3)} kg</p></div>
                                <div><p className="text-xs text-gray-500">Actually used</p><p className="font-bold">{actualUsed?.toFixed(3)} kg</p></div>
                                <div>
                                  <p className="text-xs text-gray-500">Difference</p>
                                  <p className={`font-bold ${varianceColor(liveVariancePct)}`}>
                                    {liveVariance >= 0 ? '+' : ''}{liveVariance.toFixed(3)} kg
                                    {liveVariancePct != null && <span className="ml-1 text-xs">({liveVariancePct >= 0 ? '+' : ''}{liveVariancePct.toFixed(1)}%)</span>}
                                  </p>
                                </div>
                              </div>
                              {liveVariancePct != null && Math.abs(liveVariancePct) > 5 && (
                                <p className="mt-2 text-sm font-bold text-red-700 flex items-center gap-1"><AlertTriangle size={14} /> {Math.abs(liveVariance).toFixed(3)} kg is unaccounted for — this is more than expected. You should investigate before closing.</p>
                              )}
                              {liveVariancePct != null && Math.abs(liveVariancePct) > 2 && Math.abs(liveVariancePct) <= 5 && (
                                <p className="mt-2 text-sm font-semibold text-amber-700 flex items-center gap-1"><AlertTriangle size={14} /> Slightly more bulk was used than expected. Worth noting — you can still close.</p>
                              )}
                              {liveVariancePct != null && Math.abs(liveVariancePct) <= 2 && (
                                <p className="mt-2 text-sm font-semibold text-green-700 flex items-center gap-1"><CheckCircle2 size={14} /> All bulk is accounted for — everything looks good.</p>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                    {closeError && <p className="text-sm text-red-600 flex items-center gap-1"><AlertTriangle size={14} /> {closeError}</p>}
                    <div className="flex gap-2">
                      <button type="submit" className="btn-primary flex items-center gap-1.5" disabled={closing}>
                        {closing && <Loader2 size={14} className="animate-spin" />} Confirm & Close Session
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
          <h2 className="text-lg font-semibold text-gray-800">Packing Sessions</h2>
          <p className="text-sm text-gray-500 mt-0.5">Each time you pack, start a session. The system tracks how much raw material you used, how many units you produced, and flags anything unusual.</p>
        </div>
        <button onClick={() => { setShowNewRun(s => !s); setRunFormError(null) }} className="btn-primary flex items-center gap-1.5">
          <Plus size={15} /> Start a Session
        </button>
      </div>

      {showNewRun && (
        <div className="card mb-4 border border-blue-200 bg-blue-50">
          <h3 className="font-semibold text-gray-800 mb-1">Start a new packing session</h3>
          <p className="text-sm text-gray-500 mb-3">Fill in what you're packing today. You'll log the actual units packed as you go, then close the session when done.</p>

          {/* Batch context banner — shown when form was opened from a Stock Received batch */}
          {preFillBanner && (
            <div className="flex items-center gap-3 bg-blue-100 border border-blue-300 rounded-xl px-3 py-2.5 mb-3">
              <span className="text-blue-500 text-lg">📦</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-blue-800">
                  Packing from: {preFillBanner.batchRef}
                </p>
                {preFillBanner.bulkSkuName && (
                  <p className="text-xs text-blue-600 mt-0.5">Material: {preFillBanner.bulkSkuName}</p>
                )}
              </div>
              <button type="button" onClick={() => { setPreFillBanner(null); setRunForm(f => ({ ...f, landed_cost_id: '', bulk_sku_id: '' })) }}
                className="text-blue-400 hover:text-blue-600 text-xs underline flex-shrink-0">
                Change
              </button>
            </div>
          )}

          <form onSubmit={handleCreateRun} className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Session name <span className="text-gray-400 font-normal">(optional)</span></label>
                <input type="text" className="input w-full" placeholder="e.g. Morning run — 25 Apr" value={runForm.run_ref} onChange={e => setRunForm(f => ({ ...f, run_ref: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Which raw material are you packing today? <span className="text-red-500">*</span></label>
                {bulkSkus.length === 0 ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 flex items-start gap-2">
                    <AlertTriangle size={13} className="mt-0.5 flex-shrink-0" />
                    <span>No bulk/raw materials found. Go to <strong>SKU Master</strong> → edit an item → tick <em>"This is a raw / bulk material"</em> to make it appear here.</span>
                  </div>
                ) : (
                  <select className="input w-full" value={runForm.bulk_sku_id} onChange={e => setRunForm(f => ({ ...f, bulk_sku_id: e.target.value, landed_cost_id: '' }))} required>
                    <option value="">Select raw material…</option>
                    {bulkSkus.map(s => <option key={s.id} value={s.id}>{s.product_name} ({s.sku_code})</option>)}
                  </select>
                )}
              </div>
              {/* Delivery picker — shown first so selecting it auto-fills the weight */}
              {!preFillBanner && <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Which delivery is this bulk from?
                  <span className="ml-1 text-xs text-gray-400 font-normal">(links to cost records — recommended)</span>
                </label>
                {runForm.bulk_sku_id && matchingLandedCosts.length === 0 ? (
                  <div className="text-xs text-amber-600 italic mt-1 flex items-center gap-1">
                    <AlertTriangle size={12} /> No deliveries recorded for this material yet. Go to <strong>Stock Received</strong> and add one first to enable cost tracking.
                  </div>
                ) : (
                  <select
                    className="input w-full"
                    value={runForm.landed_cost_id}
                    onChange={e => {
                      const lcId = e.target.value
                      const lc   = matchingLandedCosts.find(l => String(l.id) === String(lcId))
                      setRunForm(f => ({
                        ...f,
                        landed_cost_id: lcId,
                        // Auto-fill weight from delivery qty if not already set by user
                        qty_start: lc && !f.qty_start ? String(lc.qty_kg) : f.qty_start,
                      }))
                    }}
                    disabled={!runForm.bulk_sku_id || matchingLandedCosts.length === 0}
                  >
                    <option value="">Use most recent delivery for this material</option>
                    {matchingLandedCosts.map(lc => (
                      <option key={lc.id} value={lc.id}>
                        {lc.batch_ref || `Delivery #${lc.id}`} · {(+lc.qty_kg).toFixed(0)} kg · ${(+lc.cost_per_kg).toFixed(4)}/kg · {new Date(lc.created_at).toLocaleDateString()}
                      </option>
                    ))}
                  </select>
                )}
              </div>}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Put your bulk on the scale — what does it weigh? (kg) <span className="text-red-500">*</span>
                </label>
                <input type="number" step="0.001" min="0.001" className="input w-full" placeholder="e.g. 1000"
                  value={runForm.qty_start}
                  onChange={e => setRunForm(f => ({ ...f, qty_start: e.target.value }))} required />
                {runForm.qty_start && runForm.landed_cost_id && (() => {
                  const lc = matchingLandedCosts.find(l => String(l.id) === String(runForm.landed_cost_id))
                  return lc && String(lc.qty_kg) === String(runForm.qty_start)
                    ? <p className="text-xs text-green-600 mt-0.5">✓ Matches delivery weight — adjust if your scale shows different</p>
                    : null
                })()}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Who is doing the packing?</label>
                <input type="text" className="input w-full" placeholder="Operator name" value={runForm.started_by} onChange={e => setRunForm(f => ({ ...f, started_by: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">How many units are you planning to pack?</label>
                <input type="number" step="1" min="1" className="input w-full" placeholder="e.g. 250" value={runForm.units_planned} onChange={e => setRunForm(f => ({ ...f, units_planned: e.target.value }))} />
              </div>
            </div>
            {runFormError && <p className="text-sm text-red-600 flex items-center gap-1"><AlertTriangle size={14} /> {runFormError}</p>}
            <div className="flex gap-2">
              <button type="submit" className="btn-primary flex items-center gap-1.5" disabled={creatingRun}>
                {creatingRun && <Loader2 size={14} className="animate-spin" />} Start Session
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
          <p className="font-medium">No packing sessions yet.</p>
          <p className="text-sm mt-1">When you're ready to pack, click "Start a Session". You'll weigh your bulk, log what you pack, then weigh what's left at the end.</p>
        </div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3 text-left">Session</th>
                <th className="px-4 py-3 text-left">Raw Material</th>
                <th className="px-4 py-3 text-left">Date</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-right">Difference %</th>
                <th className="px-4 py-3 text-right">Alert</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {runs.map(r => (
                <tr key={r.id} className="hover:bg-blue-50 cursor-pointer transition-colors" onClick={() => handleSelectRun(r)}>
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-800">{r.run_ref || `Session #${r.id}`}</div>
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
                  {flaggedRuns.length} packing session{flaggedRuns.length > 1 ? 's' : ''} used significantly more raw material than expected — please investigate
                </p>
                <ul className="mt-1.5 space-y-0.5">
                  {flaggedRuns.map(r => (
                    <li key={r.id} className="text-xs text-red-700">
                      <strong>{r.run_ref || `Session #${r.id}`}</strong> — used{' '}
                      {r.variance_pct != null ? `${Math.abs(r.variance_pct).toFixed(1)}% more bulk than expected` : 'unknown amount'}
                      {r.variance_kg != null ? ` (${Math.abs(r.variance_kg).toFixed(3)} kg unaccounted for)` : ''}
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
                <DollarSign size={16} className="text-green-600" /> Cost per Box — by Session
              </h3>
              {costsLoading ? (
                <div className="card flex justify-center py-6"><Loader2 className="animate-spin text-blue-500" size={20} /></div>
              ) : closedRunsWithCost.length === 0 ? (
                <div className="card text-sm text-gray-500 py-4 text-center">
                  No cost data yet. Record your deliveries in <strong>Stock Received</strong> and log session costs in <strong>Packing Sessions</strong> to see cost per box.
                </div>
              ) : (
                <div className="card p-0 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                      <tr>
                        <th className="px-4 py-3 text-left">Session</th>
                        <th className="px-4 py-3 text-left">Delivery Ref</th>
                        <th className="px-4 py-3 text-right">Total Boxes</th>
                        <th className="px-4 py-3 text-right">Raw Material Cost</th>
                        <th className="px-4 py-3 text-right">Packing Cost</th>
                        <th className="px-4 py-3 text-right font-bold text-gray-700">Total Cost</th>
                        <th className="px-4 py-3 text-right font-bold text-gray-700">Cost per Box</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {closedRunsWithCost.map(r => {
                        const cs = costData[r.id]
                        return (
                          <tr key={r.id} className="hover:bg-gray-50">
                            <td className="px-4 py-3 font-medium text-gray-800">{r.run_ref || `Session #${r.id}`}</td>
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
              <div className="text-sm text-gray-500 mt-1">Total Sessions</div>
            </div>
            <div className="card text-center">
              <div className={`text-3xl font-bold ${summary.total_variance_kg > 0 ? 'text-red-600' : summary.total_variance_kg < 0 ? 'text-green-600' : 'text-gray-800'}`}>
                {summary.total_variance_kg >= 0 ? '+' : ''}{summary.total_variance_kg.toFixed(2)} kg
              </div>
              <div className="text-sm text-gray-500 mt-1">Total Unexplained (kg)</div>
            </div>
            <div className="card text-center">
              <div className={`text-3xl font-bold ${varianceColor(summary.avg_variance_pct)}`}>
                {summary.avg_variance_pct >= 0 ? '+' : ''}{summary.avg_variance_pct.toFixed(1)}%
              </div>
              <div className="text-sm text-gray-500 mt-1">Avg Difference %</div>
            </div>
            <div className="card text-center">
              <div className={`text-3xl font-bold ${summary.flagged_runs > 0 ? 'text-red-600' : 'text-green-600'}`}>
                {summary.flagged_runs}
              </div>
              <div className="text-sm text-gray-500 mt-1">Sessions to Investigate</div>
            </div>
          </div>

          {/* Worst runs */}
          {summary.worst_runs.length > 0 && (
            <div>
              <h3 className="font-semibold text-gray-800 mb-3">All Closed Sessions — Sorted by Largest Difference</h3>
              <div className="card p-0 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                    <tr>
                      <th className="px-4 py-3 text-left">Session</th>
                      <th className="px-4 py-3 text-left">Raw Material</th>
                      <th className="px-4 py-3 text-left">Date Closed</th>
                      <th className="px-4 py-3 text-right">Expected Usage</th>
                      <th className="px-4 py-3 text-right">Actual Usage</th>
                      <th className="px-4 py-3 text-right">Difference</th>
                      <th className="px-4 py-3 text-right">Diff %</th>
                      <th className="px-4 py-3 text-center">Result</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {summary.worst_runs.map(r => (
                      <tr key={r.id} className={r.flag_high_variance ? 'bg-red-50' : ''}>
                        <td className="px-4 py-3 font-medium text-gray-800">{r.run_ref || `Session #${r.id}`}</td>
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
                            ? <span className="flex items-center justify-center gap-1 text-xs text-red-700 font-semibold"><AlertTriangle size={13} /> Investigate</span>
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
              <h3 className="font-semibold text-gray-800 mb-3">Usage by Raw Material</h3>
              <div className="card p-0 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                    <tr>
                      <th className="px-4 py-3 text-left">Raw Material</th>
                      <th className="px-4 py-3 text-right">Sessions</th>
                      <th className="px-4 py-3 text-right">Expected Usage (kg)</th>
                      <th className="px-4 py-3 text-right">Actual Usage (kg)</th>
                      <th className="px-4 py-3 text-right">Difference (kg)</th>
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
              <p className="font-medium">No closed sessions yet{(fromDate || toDate) ? ' in this date range' : ''}.</p>
              <p className="text-sm mt-1">Audit data will appear here once you complete and close packing sessions.</p>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── Flow Pipeline (replaces pill tabs) ───────────────────────
function FlowPipeline({ activeTab, onTabChange, steps }) {
  return (
    <div className="mb-6">
      {/* Mobile: simple tabs */}
      <div className="flex md:hidden gap-1 bg-gray-100 rounded-xl p-1 overflow-x-auto">
        {steps.map((s, i) => (
          <button key={i} onClick={() => onTabChange(i)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors relative flex-shrink-0 ${
              activeTab === i ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500'
            }`}>
            {s.done && <span className="mr-1 text-green-500">✓</span>}
            {s.alert && <span className="mr-1 text-red-500">!</span>}
            {s.label}
          </button>
        ))}
      </div>

      {/* Desktop: visual flow pipeline */}
      <div className="hidden md:flex items-stretch gap-0">
        {steps.map((s, i) => {
          const isActive  = activeTab === i
          const isDone    = s.done && !isActive
          const isAlert   = s.alert
          const isBlocked = !s.done && i > 0 && !steps[i-1].done && activeTab !== i

          return (
            <div key={i} className="flex items-center flex-1 min-w-0">
              {/* Step card */}
              <button
                onClick={() => onTabChange(i)}
                className={`flex-1 min-w-0 rounded-xl px-4 py-3 text-left transition-all border-2 group
                  ${isActive
                    ? 'bg-blue-600 border-blue-600 text-white shadow-md'
                    : isAlert
                    ? 'bg-red-50 border-red-300 hover:border-red-400 text-gray-800'
                    : isDone
                    ? 'bg-green-50 border-green-200 hover:border-green-400 text-gray-800'
                    : 'bg-white border-gray-200 hover:border-blue-300 text-gray-700'
                  }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  {/* Step number badge */}
                  <span className={`text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0
                    ${isActive ? 'bg-white/20 text-white'
                      : isAlert ? 'bg-red-500 text-white'
                      : isDone  ? 'bg-green-500 text-white'
                      : 'bg-gray-200 text-gray-500'}`}>
                    {isDone && !isAlert ? '✓' : isAlert ? '!' : i + 1}
                  </span>
                  <span className={`text-xs font-semibold uppercase tracking-wide truncate
                    ${isActive ? 'text-white/80' : 'text-gray-400'}`}>
                    {s.label}
                  </span>
                </div>
                <p className={`text-sm font-semibold truncate
                  ${isActive ? 'text-white' : isAlert ? 'text-red-700' : isDone ? 'text-green-700' : 'text-gray-500'}`}>
                  {s.stat}
                </p>
                <p className={`text-xs mt-0.5 truncate
                  ${isActive ? 'text-white/70' : 'text-gray-400'}`}>
                  {s.hint}
                </p>
              </button>

              {/* Arrow connector */}
              {i < steps.length - 1 && (
                <div className={`flex-shrink-0 w-8 flex items-center justify-center text-lg font-light
                  ${steps[i].done ? 'text-green-400' : 'text-gray-300'}`}>
                  →
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Main Repacking page ───────────────────────────────────────
export default function Repacking() {
  const [activeTab, setActiveTab]       = useState(0)
  const [skus, setSkus]                 = useState([])
  const [skusLoading, setSkusLoading]   = useState(true)
  const [landedCosts, setLandedCosts]   = useState([])
  const [flaggedCount, setFlaggedCount] = useState(0)
  const [bomCount, setBomCount]         = useState(0)
  const [purchaseCount, setPurchaseCount] = useState(0)
  const [runCount, setRunCount]         = useState(0)
  const [runPreFill, setRunPreFill]         = useState(null)  // { landed_cost_id, bulk_sku_id, batchRef, bulkSkuName }
  const [stockPreFillSkuId, setStockPreFillSkuId] = useState(null)  // pre-select bulk SKU in Stock Received

  // Load everything on mount — SKUs unblock the page first, counts update in background
  useEffect(() => {
    // Priority 1: SKUs — lean mode (no inventory join) for fast dropdowns
    skuAPI.list({ lean: true })
      .then(res => {
        const items = Array.isArray(res.data) ? res.data : (res.data?.items || res.data?.skus || [])
        setSkus(items)
      })
      .catch(() => setSkus([]))
      .finally(() => setSkusLoading(false))

    // Priority 2: background — each updates independently, never blocks the page
    repackingAPI.listLandedCosts()
      .then(res => setLandedCosts(Array.isArray(res.data) ? res.data : []))
      .catch(() => {})

    repackingAPI.summary({})
      .then(res => {
        setFlaggedCount(res.data?.flagged_runs ?? 0)
        setRunCount(res.data?.total_runs ?? 0)
      })
      .catch(() => {})

    repackingAPI.listBOM()
      .then(res => setBomCount(Array.isArray(res.data) ? res.data.length : 0))
      .catch(() => {})

    repackingAPI.listPurchases()
      .then(res => setPurchaseCount(Array.isArray(res.data) ? res.data.length : 0))
      .catch(() => {})
  }, [])

  const refreshSkus = async () => {
    try {
      const res = await skuAPI.list({ lean: true })
      const items = Array.isArray(res.data) ? res.data : (res.data?.items || res.data?.skus || [])
      setSkus(items)
    } catch {}
  }

  const handleTabChange = async (i) => {
    setActiveTab(i)
    if (i === 1 || i === 2) {
      try {
        const res = await repackingAPI.listLandedCosts()
        setLandedCosts(Array.isArray(res.data) ? res.data : [])
      } catch {}
    }
  }

  // Called from PurchasesTab "Pack" button — switches to Packing Sessions with context
  const handleStartPacking = async (landedCostId, bulkSkuId, batchRef, bulkSkuName) => {
    // Refresh landed costs so RunsTab has the latest list
    try {
      const res = await repackingAPI.listLandedCosts()
      setLandedCosts(Array.isArray(res.data) ? res.data : [])
    } catch {}
    setRunPreFill({ landed_cost_id: landedCostId, bulk_sku_id: bulkSkuId, batchRef, bulkSkuName })
    setActiveTab(2)
  }

  // Build step data for the pipeline — drives status from real counts
  const bulkCount = skus.filter(s => s.is_bulk_material).length
  const flowSteps = [
    {
      label: 'My Products',
      stat:  bomCount > 0
        ? `${bomCount} product link${bomCount !== 1 ? 's' : ''}`
        : bulkCount > 0 ? `${bulkCount} bulk SKU${bulkCount !== 1 ? 's' : ''} ready` : 'Not set up yet',
      hint:  bomCount > 0
        ? `${bulkCount} bulk material${bulkCount !== 1 ? 's' : ''} · define pack sizes`
        : 'Define what bulk materials you buy and what retail sizes you pack from them',
      done:  bomCount > 0,
    },
    {
      label: 'Stock Received',
      stat:  purchaseCount > 0 ? `${purchaseCount} batch${purchaseCount !== 1 ? 'es' : ''} recorded` : 'No deliveries yet',
      hint:  purchaseCount > 0
        ? 'Log every delivery with weight and cost'
        : bomCount > 0 ? '← Set up done. Now record your first delivery' : 'Set up My Products first',
      done:  purchaseCount > 0,
    },
    {
      label: 'Packing Sessions',
      stat:  runCount > 0 ? `${runCount} session${runCount !== 1 ? 's' : ''}` : 'No sessions yet',
      hint:  runCount > 0
        ? 'Track every packing run with output and waste'
        : purchaseCount > 0 ? '← Stock logged. Ready to start packing' : 'Receive stock first',
      done:  runCount > 0,
    },
    {
      label: 'Audit Report',
      stat:  flaggedCount > 0 ? `${flaggedCount} to investigate` : runCount > 0 ? 'All clear' : 'No data yet',
      hint:  flaggedCount > 0
        ? 'Some sessions used more material than expected'
        : 'Review variance, costs, and efficiency',
      done:  runCount > 0,
      alert: flaggedCount > 0,
    },
  ]

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-5">
        <div className="flex items-center gap-2 mb-1">
          <Factory size={22} className="text-blue-600" />
          <h1 className="text-2xl font-bold text-gray-900">Production</h1>
        </div>
        <p className="text-sm text-gray-500">
          Follow the steps below — set up once, then use daily.
        </p>
      </div>

      {/* Flow pipeline — replaces pill tabs */}
      <FlowPipeline activeTab={activeTab} onTabChange={handleTabChange} steps={flowSteps} />

      {/* Flagged alert banner */}
      {flaggedCount > 0 && (
        <div className="mb-4 flex items-center gap-3 bg-red-50 border border-red-300 rounded-xl px-4 py-3">
          <AlertTriangle size={18} className="text-red-600 flex-shrink-0" />
          <p className="text-sm text-red-800 font-medium flex-1">
            <strong>{flaggedCount} packing session{flaggedCount > 1 ? 's' : ''}</strong> used more bulk material than expected.
            <button onClick={() => handleTabChange(3)} className="ml-1 underline font-bold">View Audit Report →</button>
          </p>
        </div>
      )}

      {/* "Next step" nudge — shown when current step is done and next isn't active */}
      {activeTab === 0 && bomCount > 0 && purchaseCount === 0 && (
        <div className="mb-4 flex items-center justify-between bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
          <p className="text-sm text-blue-800">
            <strong>Step 1 done!</strong> Now log your first stock delivery.
          </p>
          <button onClick={() => handleTabChange(1)} className="text-sm font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1">
            Go to Stock Received →
          </button>
        </div>
      )}
      {activeTab === 1 && purchaseCount > 0 && runCount === 0 && (
        <div className="mb-4 flex items-center justify-between bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
          <p className="text-sm text-blue-800">
            <strong>Stock logged!</strong> You're ready to start a packing session.
          </p>
          <button onClick={() => handleTabChange(2)} className="text-sm font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1">
            Start Packing →
          </button>
        </div>
      )}
      {activeTab === 2 && runCount > 0 && flaggedCount > 0 && (
        <div className="mb-4 flex items-center justify-between bg-orange-50 border border-orange-200 rounded-xl px-4 py-3">
          <p className="text-sm text-orange-800">
            <strong>{flaggedCount} session{flaggedCount > 1 ? 's' : ''} flagged</strong> — review variance in the Audit Report.
          </p>
          <button onClick={() => handleTabChange(3)} className="text-sm font-semibold text-orange-600 hover:text-orange-800 flex items-center gap-1">
            View Audit Report →
          </button>
        </div>
      )}

      {skusLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="animate-spin text-blue-500" size={28} /></div>
      ) : (
        <>
          {activeTab === 0 && <BOMTab skus={skus} refreshSkus={refreshSkus} onGoToStock={skuId => { setStockPreFillSkuId(skuId); handleTabChange(1) }} />}
          {activeTab === 1 && <PurchasesTab skus={skus} onStartPacking={handleStartPacking} preFillSkuId={stockPreFillSkuId} />}
          {activeTab === 2 && <RunsTab skus={skus} landedCosts={landedCosts} preFill={runPreFill} onPreFillConsumed={() => setRunPreFill(null)} />}
          {activeTab === 3 && <SummaryTab />}
        </>
      )}
    </div>
  )
}
