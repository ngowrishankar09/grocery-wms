import { useState, useEffect, useCallback } from 'react'
import { repackingAPI, skuAPI } from '../api/client'
import {
  Loader2, Plus, Trash2, Package, ChevronLeft, AlertTriangle,
  CheckCircle2, X, Factory,
} from 'lucide-react'

// ── Variance colour helper ────────────────────────────────────
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
  if (abs <= 2)        cls += 'bg-green-100 text-green-700'
  else if (abs <= 5)   cls += 'bg-amber-100 text-amber-700'
  else                 cls += 'bg-red-100 text-red-700'
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
    setLoading(true)
    setError(null)
    try {
      const res = await repackingAPI.listBOM()
      setBoms(res.data)
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to load bills of materials')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleCreate = async (e) => {
    e.preventDefault()
    setFormError(null)
    if (!form.output_sku_id || !form.input_sku_id || !form.qty_per_unit) {
      setFormError('Please fill all required fields.')
      return
    }
    if (form.output_sku_id === form.input_sku_id) {
      setFormError('Output and input SKU must be different.')
      return
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
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this bill of materials?')) return
    try {
      await repackingAPI.deleteBOM(id)
      load()
    } catch (e) {
      alert(e.response?.data?.detail || 'Failed to delete BOM')
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">Bills of Materials</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Define how much bulk material is consumed per retail unit packed.
            e.g. 1 box of Coriander 400g uses 0.4 kg of Coriander Powder Bulk.
          </p>
        </div>
        <button
          onClick={() => { setShowForm(s => !s); setFormError(null) }}
          className="btn-primary flex items-center gap-1.5"
        >
          <Plus size={15} />
          Add BOM
        </button>
      </div>

      {/* Add form */}
      {showForm && (
        <div className="card mb-4 border border-blue-200 bg-blue-50">
          <h3 className="font-semibold text-gray-800 mb-3">New Bill of Material</h3>
          <form onSubmit={handleCreate} className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Output SKU (retail/finished) <span className="text-red-500">*</span>
                </label>
                <select
                  className="input w-full"
                  value={form.output_sku_id}
                  onChange={e => setForm(f => ({ ...f, output_sku_id: e.target.value }))}
                  required
                >
                  <option value="">Select output SKU…</option>
                  {skus.map(s => (
                    <option key={s.id} value={s.id}>{s.product_name} ({s.sku_code})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Input SKU (bulk raw material) <span className="text-red-500">*</span>
                </label>
                <select
                  className="input w-full"
                  value={form.input_sku_id}
                  onChange={e => setForm(f => ({ ...f, input_sku_id: e.target.value }))}
                  required
                >
                  <option value="">Select bulk SKU…</option>
                  {skus.map(s => (
                    <option key={s.id} value={s.id}>{s.product_name} ({s.sku_code})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Qty per unit (bulk consumed per 1 retail box) <span className="text-red-500">*</span>
                </label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    step="0.001"
                    min="0.001"
                    className="input flex-1"
                    placeholder="e.g. 0.4"
                    value={form.qty_per_unit}
                    onChange={e => setForm(f => ({ ...f, qty_per_unit: e.target.value }))}
                    required
                  />
                  <input
                    type="text"
                    className="input w-20"
                    placeholder="kg"
                    value={form.unit}
                    onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Allowed waste % (threshold)
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  className="input w-full"
                  value={form.waste_pct_allowed}
                  onChange={e => setForm(f => ({ ...f, waste_pct_allowed: e.target.value }))}
                />
              </div>
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
            {formError && (
              <p className="text-sm text-red-600 flex items-center gap-1">
                <AlertTriangle size={14} /> {formError}
              </p>
            )}
            <div className="flex gap-2">
              <button type="submit" className="btn-primary flex items-center gap-1.5" disabled={saving}>
                {saving && <Loader2 size={14} className="animate-spin" />}
                Save BOM
              </button>
              <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="animate-spin text-blue-500" size={28} />
        </div>
      ) : error ? (
        <div className="card text-red-600 flex items-center gap-2">
          <AlertTriangle size={18} /> {error}
        </div>
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
                <th className="px-4 py-3 text-right">Qty / unit</th>
                <th className="px-4 py-3 text-right">Waste allowed</th>
                <th className="px-4 py-3 text-left">Notes</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {boms.map(b => (
                <tr key={b.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-800">{b.output_sku_name}</div>
                    <div className="text-xs text-gray-400">{b.output_sku_code}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-800">{b.input_sku_name}</div>
                    <div className="text-xs text-gray-400">{b.input_sku_code}</div>
                  </td>
                  <td className="px-4 py-3 text-right font-mono">
                    {b.qty_per_unit} {b.unit}
                  </td>
                  <td className="px-4 py-3 text-right">{b.waste_pct_allowed}%</td>
                  <td className="px-4 py-3 text-gray-500">{b.notes || '—'}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleDelete(b.id)}
                      className="p-1.5 text-gray-400 hover:text-red-500 rounded transition-colors"
                      title="Delete BOM"
                    >
                      <Trash2 size={14} />
                    </button>
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

// ── Tab 2: Packing Runs ───────────────────────────────────────
function RunsTab({ skus }) {
  const [runs, setRuns]         = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)
  const [selectedRun, setSelectedRun] = useState(null)
  const [runDetail, setRunDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [showNewRun, setShowNewRun] = useState(false)

  // New run form
  const [runForm, setRunForm] = useState({
    run_ref: '', bulk_sku_id: '', qty_start: '', started_by: '', notes: '',
  })
  const [runFormError, setRunFormError] = useState(null)
  const [creatingRun, setCreatingRun]   = useState(false)

  // Output add form
  const [showAddOutput, setShowAddOutput] = useState(false)
  const [outputForm, setOutputForm]       = useState({ sku_id: '', qty_packed: '' })
  const [outputFormError, setOutputFormError] = useState(null)
  const [addingOutput, setAddingOutput]   = useState(false)

  // Close run form
  const [showClose, setShowClose]   = useState(false)
  const [closeQtyEnd, setCloseQtyEnd] = useState({})  // {bulk_sku_id: value}
  const [closing, setClosing]         = useState(false)
  const [closeError, setCloseError]   = useState(null)

  const loadRuns = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await repackingAPI.listRuns()
      setRuns(res.data)
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to load runs')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadRuns() }, [loadRuns])

  const loadDetail = async (id) => {
    setDetailLoading(true)
    try {
      const res = await repackingAPI.getRun(id)
      setRunDetail(res.data)
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to load run detail')
    } finally {
      setDetailLoading(false)
    }
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
    e.preventDefault()
    setRunFormError(null)
    if (!runForm.bulk_sku_id || !runForm.qty_start) {
      setRunFormError('Please select a bulk SKU and enter starting weight.')
      return
    }
    setCreatingRun(true)
    try {
      const res = await repackingAPI.createRun({
        run_ref:    runForm.run_ref || null,
        bulk_sku_id: parseInt(runForm.bulk_sku_id),
        qty_start:  parseFloat(runForm.qty_start),
        started_by: runForm.started_by || null,
        notes:      runForm.notes || null,
      })
      setShowNewRun(false)
      setRunForm({ run_ref: '', bulk_sku_id: '', qty_start: '', started_by: '', notes: '' })
      await loadRuns()
      handleSelectRun(res.data)
    } catch (e) {
      setRunFormError(e.response?.data?.detail || 'Failed to create run')
    } finally {
      setCreatingRun(false)
    }
  }

  const handleAddOutput = async (e) => {
    e.preventDefault()
    setOutputFormError(null)
    if (!outputForm.sku_id || !outputForm.qty_packed) {
      setOutputFormError('Please select a SKU and enter quantity packed.')
      return
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
    } finally {
      setAddingOutput(false)
    }
  }

  const handleRemoveOutput = async (skuId) => {
    if (!window.confirm('Remove this output line?')) return
    try {
      await repackingAPI.removeOutput(runDetail.id, skuId)
      loadDetail(runDetail.id)
    } catch (e) {
      alert(e.response?.data?.detail || 'Failed to remove output')
    }
  }

  const handleCloseRun = async (e) => {
    e.preventDefault()
    setCloseError(null)
    const bulkEntries = runDetail.bulk_entries.map(b => ({
      bulk_sku_id: b.bulk_sku_id,
      qty_end: parseFloat(closeQtyEnd[b.bulk_sku_id] ?? 0),
    }))
    const invalid = bulkEntries.some(b => isNaN(b.qty_end) || b.qty_end < 0)
    if (invalid) {
      setCloseError('Please enter a valid ending weight for all bulk materials.')
      return
    }
    setClosing(true)
    try {
      const res = await repackingAPI.closeRun(runDetail.id, { bulk_entries: bulkEntries })
      setRunDetail(res.data)
      setShowClose(false)
      loadRuns()
    } catch (e) {
      setCloseError(e.response?.data?.detail || 'Failed to close run')
    } finally {
      setClosing(false)
    }
  }

  // If a run is selected, show detail view
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
          <div className="flex justify-center py-12">
            <Loader2 className="animate-spin text-blue-500" size={28} />
          </div>
        ) : runDetail ? (
          <div className="space-y-4">
            {/* Run header card */}
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
                  <h2 className="text-lg font-bold text-gray-800">
                    {runDetail.run_ref || `Run #${runDetail.id}`}
                  </h2>
                  <div className="flex flex-wrap gap-4 mt-2 text-sm text-gray-500">
                    <span>Started: {runDetail.created_at ? new Date(runDetail.created_at).toLocaleString() : '—'}</span>
                    {runDetail.started_by && <span>Operator: <span className="font-medium text-gray-700">{runDetail.started_by}</span></span>}
                    {runDetail.closed_at && <span>Closed: {new Date(runDetail.closed_at).toLocaleString()}</span>}
                  </div>
                  {runDetail.notes && <p className="text-sm text-gray-500 mt-1 italic">{runDetail.notes}</p>}
                </div>
              </div>

              {/* Variance summary for closed runs */}
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
                      <AlertTriangle size={16} />
                      HIGH VARIANCE — Possible Waste or Theft. Investigate immediately.
                    </div>
                  )}
                  {runDetail.variance_pct != null && Math.abs(runDetail.variance_pct) > 2 && Math.abs(runDetail.variance_pct) <= 5 && (
                    <div className="mt-2 flex items-center gap-2 text-amber-700 text-sm font-semibold">
                      <AlertTriangle size={16} />
                      Variance above allowed threshold. Review packing records.
                    </div>
                  )}
                  {runDetail.variance_pct != null && Math.abs(runDetail.variance_pct) <= 2 && (
                    <div className="mt-2 flex items-center gap-2 text-green-700 text-sm font-semibold">
                      <CheckCircle2 size={16} />
                      Variance within acceptable range.
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Outputs section */}
            <div className="card">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-gray-800">Retail Outputs Packed</h3>
                {runDetail.status === 'open' && (
                  <button
                    onClick={() => { setShowAddOutput(s => !s); setOutputFormError(null) }}
                    className="btn-secondary flex items-center gap-1.5 text-sm"
                  >
                    <Plus size={14} /> Add Output
                  </button>
                )}
              </div>

              {showAddOutput && runDetail.status === 'open' && (
                <form onSubmit={handleAddOutput} className="mb-4 p-3 bg-gray-50 rounded-lg space-y-2">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Retail SKU</label>
                      <select
                        className="input w-full"
                        value={outputForm.sku_id}
                        onChange={e => setOutputForm(f => ({ ...f, sku_id: e.target.value }))}
                        required
                      >
                        <option value="">Select SKU…</option>
                        {skus.map(s => (
                          <option key={s.id} value={s.id}>{s.product_name} ({s.sku_code})</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Qty Packed (boxes)</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        className="input w-full"
                        placeholder="e.g. 200"
                        value={outputForm.qty_packed}
                        onChange={e => setOutputForm(f => ({ ...f, qty_packed: e.target.value }))}
                        required
                      />
                    </div>
                  </div>
                  {outputFormError && (
                    <p className="text-xs text-red-600 flex items-center gap-1">
                      <AlertTriangle size={12} /> {outputFormError}
                    </p>
                  )}
                  <div className="flex gap-2">
                    <button type="submit" className="btn-primary text-sm" disabled={addingOutput}>
                      {addingOutput && <Loader2 size={13} className="animate-spin inline mr-1" />}
                      Save
                    </button>
                    <button type="button" className="btn-secondary text-sm" onClick={() => setShowAddOutput(false)}>Cancel</button>
                  </div>
                </form>
              )}

              {runDetail.outputs.length === 0 ? (
                <p className="text-sm text-gray-400 py-4 text-center">No outputs added yet.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="text-xs text-gray-500 uppercase tracking-wide">
                    <tr>
                      <th className="pb-2 text-left">SKU</th>
                      <th className="pb-2 text-right">Qty Packed</th>
                      <th className="pb-2 text-right">Theoretical kg</th>
                      {runDetail.status === 'open' && <th className="pb-2" />}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {runDetail.outputs.map(o => (
                      <tr key={o.id}>
                        <td className="py-2">
                          <div className="font-medium text-gray-800">{o.product_name}</div>
                          <div className="text-xs text-gray-400">{o.sku_code}</div>
                        </td>
                        <td className="py-2 text-right font-mono">{o.qty_packed}</td>
                        <td className="py-2 text-right font-mono">
                          {o.theoretical_kg != null ? `${o.theoretical_kg.toFixed(3)} kg` : '—'}
                        </td>
                        {runDetail.status === 'open' && (
                          <td className="py-2 text-right">
                            <button
                              onClick={() => handleRemoveOutput(o.sku_id)}
                              className="p-1 text-gray-400 hover:text-red-500 rounded"
                              title="Remove"
                            >
                              <X size={13} />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

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
                        <div>
                          <div className="text-xs text-gray-500">Start Weight</div>
                          <div className="font-medium">{b.qty_start} kg</div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-500">End Weight</div>
                          <div className="font-medium">{b.qty_end != null ? `${b.qty_end} kg` : '—'}</div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-500">Actual Used</div>
                          <div className="font-medium">{b.actual_used != null ? `${b.actual_used.toFixed(3)} kg` : '—'}</div>
                        </div>
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

            {/* Close run section */}
            {runDetail.status === 'open' && (
              <div className="card border border-orange-200 bg-orange-50">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-gray-800">Close Packing Run</h3>
                  <button
                    onClick={() => {
                      setShowClose(s => !s)
                      setCloseError(null)
                      // Init qty_end state
                      const init = {}
                      runDetail.bulk_entries.forEach(b => { init[b.bulk_sku_id] = '' })
                      setCloseQtyEnd(init)
                    }}
                    className="btn-primary flex items-center gap-1.5 text-sm"
                  >
                    <Factory size={14} /> Close Run
                  </button>
                </div>
                <p className="text-sm text-gray-600 mb-3">
                  Weigh the remaining bulk material and enter the ending weight to calculate actual usage and variance.
                </p>
                {showClose && (
                  <form onSubmit={handleCloseRun} className="space-y-3">
                    {runDetail.bulk_entries.map(b => (
                      <div key={b.id} className="flex items-center gap-3">
                        <div className="flex-1">
                          <label className="block text-xs font-medium text-gray-700 mb-1">
                            Ending weight for: {b.product_name}
                          </label>
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-gray-500">Started: {b.qty_start} kg →</span>
                            <input
                              type="number"
                              step="0.001"
                              min="0"
                              className="input w-36"
                              placeholder="Ending kg"
                              value={closeQtyEnd[b.bulk_sku_id] ?? ''}
                              onChange={e => setCloseQtyEnd(prev => ({ ...prev, [b.bulk_sku_id]: e.target.value }))}
                              required
                            />
                            <span className="text-sm text-gray-500">kg remaining</span>
                          </div>
                        </div>
                      </div>
                    ))}
                    {closeError && (
                      <p className="text-sm text-red-600 flex items-center gap-1">
                        <AlertTriangle size={14} /> {closeError}
                      </p>
                    )}
                    <div className="flex gap-2">
                      <button type="submit" className="btn-primary flex items-center gap-1.5" disabled={closing}>
                        {closing && <Loader2 size={14} className="animate-spin" />}
                        Confirm Close
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
        <button
          onClick={() => { setShowNewRun(s => !s); setRunFormError(null) }}
          className="btn-primary flex items-center gap-1.5"
        >
          <Plus size={15} /> New Run
        </button>
      </div>

      {/* New run form */}
      {showNewRun && (
        <div className="card mb-4 border border-blue-200 bg-blue-50">
          <h3 className="font-semibold text-gray-800 mb-3">Start New Packing Run</h3>
          <form onSubmit={handleCreateRun} className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Run Reference (order name / batch label)</label>
                <input
                  type="text"
                  className="input w-full"
                  placeholder="e.g. ORD-2026-001 or Batch A"
                  value={runForm.run_ref}
                  onChange={e => setRunForm(f => ({ ...f, run_ref: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Bulk Material SKU <span className="text-red-500">*</span>
                </label>
                <select
                  className="input w-full"
                  value={runForm.bulk_sku_id}
                  onChange={e => setRunForm(f => ({ ...f, bulk_sku_id: e.target.value }))}
                  required
                >
                  <option value="">Select bulk material…</option>
                  {skus.map(s => (
                    <option key={s.id} value={s.id}>{s.product_name} ({s.sku_code})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Starting Weight (kg) — weighed before packing <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  step="0.001"
                  min="0.001"
                  className="input w-full"
                  placeholder="e.g. 1000"
                  value={runForm.qty_start}
                  onChange={e => setRunForm(f => ({ ...f, qty_start: e.target.value }))}
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Operator Name</label>
                <input
                  type="text"
                  className="input w-full"
                  placeholder="Who is running this pack?"
                  value={runForm.started_by}
                  onChange={e => setRunForm(f => ({ ...f, started_by: e.target.value }))}
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Notes</label>
              <input
                type="text"
                className="input w-full"
                placeholder="Optional notes…"
                value={runForm.notes}
                onChange={e => setRunForm(f => ({ ...f, notes: e.target.value }))}
              />
            </div>
            {runFormError && (
              <p className="text-sm text-red-600 flex items-center gap-1">
                <AlertTriangle size={14} /> {runFormError}
              </p>
            )}
            <div className="flex gap-2">
              <button type="submit" className="btn-primary flex items-center gap-1.5" disabled={creatingRun}>
                {creatingRun && <Loader2 size={14} className="animate-spin" />}
                Start Run
              </button>
              <button type="button" className="btn-secondary" onClick={() => setShowNewRun(false)}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* Runs list */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="animate-spin text-blue-500" size={28} />
        </div>
      ) : error ? (
        <div className="card text-red-600 flex items-center gap-2">
          <AlertTriangle size={18} /> {error}
        </div>
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
                <tr
                  key={r.id}
                  className="hover:bg-blue-50 cursor-pointer transition-colors"
                  onClick={() => handleSelectRun(r)}
                >
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-800">{r.run_ref || `Run #${r.id}`}</div>
                    {r.started_by && <div className="text-xs text-gray-400">{r.started_by}</div>}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{r.bulk_sku_name || '—'}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {r.created_at ? new Date(r.created_at).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                  <td className="px-4 py-3 text-right">
                    <VarianceBadge pct={r.variance_pct} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    {r.flag_high_variance && (
                      <span title="High variance detected" className="text-red-500">
                        <AlertTriangle size={15} />
                      </span>
                    )}
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

// ── Tab 3: Summary ────────────────────────────────────────────
function SummaryTab() {
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await repackingAPI.summary()
      setSummary(res.data)
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to load summary')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  if (loading) return (
    <div className="flex justify-center py-16">
      <Loader2 className="animate-spin text-blue-500" size={28} />
    </div>
  )

  if (error) return (
    <div className="card text-red-600 flex items-center gap-2">
      <AlertTriangle size={18} /> {error}
    </div>
  )

  if (!summary) return null

  return (
    <div className="space-y-6">
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
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {r.closed_at ? new Date(r.closed_at).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">{(r.theoretical_kg ?? 0).toFixed(3)}</td>
                    <td className="px-4 py-3 text-right font-mono">{(r.actual_kg ?? 0).toFixed(3)}</td>
                    <td className={`px-4 py-3 text-right font-mono ${varianceColor(r.variance_pct)}`}>
                      {r.variance_kg != null ? `${r.variance_kg >= 0 ? '+' : ''}${r.variance_kg.toFixed(3)}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <VarianceBadge pct={r.variance_pct} />
                    </td>
                    <td className="px-4 py-3 text-center">
                      {r.flag_high_variance ? (
                        <span className="flex items-center justify-center gap-1 text-xs text-red-700 font-semibold">
                          <AlertTriangle size={13} />
                          HIGH VARIANCE — Possible Waste or Theft
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
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-800">{b.sku_name}</div>
                      <div className="text-xs text-gray-400">{b.sku_code}</div>
                    </td>
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
const TABS = ['Bills of Materials', 'Packing Runs', 'Summary']

export default function Repacking() {
  const [activeTab, setActiveTab] = useState(1)  // default: Packing Runs
  const [skus, setSkus]           = useState([])
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
      {/* Page header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <Factory size={22} className="text-blue-600" />
          <h1 className="text-2xl font-bold text-gray-900">Repacking / Production</h1>
        </div>
        <p className="text-sm text-gray-500">
          Track bulk-to-retail repacking, calculate material consumption, and flag variance or theft.
        </p>
      </div>

      {/* Tabs */}
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

      {/* Tab content */}
      {skusLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="animate-spin text-blue-500" size={28} />
        </div>
      ) : (
        <>
          {activeTab === 0 && <BOMTab skus={skus} />}
          {activeTab === 1 && <RunsTab skus={skus} />}
          {activeTab === 2 && <SummaryTab />}
        </>
      )}
    </div>
  )
}
