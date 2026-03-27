import { useEffect, useState, useRef } from 'react'
import { stockTakeAPI, settingsAPI, uploadAPI } from '../api/client'
import {
  ClipboardList, Search, Check, X, AlertTriangle,
  TrendingDown, TrendingUp, Minus, RefreshCw, Trash2, Camera
} from 'lucide-react'
import BarcodeScanner from '../components/BarcodeScanner'

// ── Write-off modal ──────────────────────────────────────────
const WRITEOFF_REASONS = ['Damaged', 'Expired', 'Theft', 'Contaminated', 'Customer Return', 'Other']

function WriteOffModal({ onClose, onSaved }) {
  const [skus, setSkus]       = useState([])
  const [search, setSearch]   = useState('')
  const [items, setItems]     = useState([])
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')

  useEffect(() => {
    // Load SKUs via inventory endpoint
    fetch('http://localhost:8000/skus/?limit=500')
      .then(r => r.json())
      .then(d => setSkus(d))
      .catch(() => {})
  }, [])

  const filteredSkus = skus.filter(s =>
    !search || s.product_name.toLowerCase().includes(search.toLowerCase()) || s.sku_code.toLowerCase().includes(search.toLowerCase())
  ).slice(0, 20)

  const addItem = (sku) => {
    if (items.find(i => i.sku_id === sku.id && i.warehouse === 'WH1')) return
    setItems(prev => [...prev, {
      sku_id: sku.id,
      sku_code: sku.sku_code,
      product_name: sku.product_name,
      warehouse: 'WH1',
      cases: 1,
      reason: 'Damaged',
      notes: '',
    }])
    setSearch('')
  }

  const updateItem = (idx, key, val) => setItems(prev => prev.map((r, i) => i === idx ? { ...r, [key]: val } : r))
  const removeItem = (idx) => setItems(prev => prev.filter((_, i) => i !== idx))

  const handleSave = async () => {
    if (items.length === 0) return setError('Add at least one item')
    setSaving(true)
    setError('')
    try {
      await stockTakeAPI.writeOff(items.map(i => ({
        sku_id:    i.sku_id,
        warehouse: i.warehouse,
        cases:     parseInt(i.cases) || 1,
        reason:    i.reason,
        notes:     i.notes || undefined,
      })))
      onSaved()
    } catch (e) {
      setError(e.response?.data?.detail || e.message || 'Write-off failed')
    }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[92vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b flex-shrink-0">
          <div>
            <h3 className="font-bold text-gray-900 text-lg">Log Write-off / Damaged Stock</h3>
            <p className="text-xs text-gray-400 mt-0.5">Records are deducted from inventory with a full audit trail</p>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {/* Search to add SKU */}
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              className="input pl-9"
              placeholder="Search SKU or product name to add…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && filteredSkus.length > 0 && (
              <div className="absolute top-full left-0 right-0 z-10 bg-white border border-gray-200 rounded-xl shadow-xl mt-1 max-h-48 overflow-y-auto">
                {filteredSkus.map(s => (
                  <button key={s.id} className="w-full text-left px-4 py-2.5 hover:bg-blue-50 text-sm border-b border-gray-50 last:border-0"
                    onClick={() => addItem(s)}>
                    <span className="font-mono text-blue-700 text-xs mr-2">{s.sku_code}</span>
                    {s.product_name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-700 text-sm">{error}</div>
          )}

          {items.length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-sm">
              Search and add products above to log a write-off
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="table-th text-left">Product</th>
                  <th className="table-th">WH</th>
                  <th className="table-th">Cases</th>
                  <th className="table-th">Reason</th>
                  <th className="table-th">Notes</th>
                  <th className="table-th w-8"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => (
                  <tr key={idx} className="border-b">
                    <td className="table-td">
                      <div className="font-mono text-xs text-blue-700">{item.sku_code}</div>
                      <div className="text-xs text-gray-600 truncate max-w-[140px]">{item.product_name}</div>
                    </td>
                    <td className="table-td">
                      <select className="input text-xs py-1 px-2 w-16"
                        value={item.warehouse} onChange={e => updateItem(idx, 'warehouse', e.target.value)}>
                        <option>WH1</option>
                        <option>WH2</option>
                      </select>
                    </td>
                    <td className="table-td">
                      <input type="number" min="1" className="input text-xs py-1 px-2 w-16 text-center"
                        value={item.cases} onChange={e => updateItem(idx, 'cases', e.target.value)} />
                    </td>
                    <td className="table-td">
                      <select className="input text-xs py-1 px-2 w-32"
                        value={item.reason} onChange={e => updateItem(idx, 'reason', e.target.value)}>
                        {WRITEOFF_REASONS.map(r => <option key={r}>{r}</option>)}
                      </select>
                    </td>
                    <td className="table-td">
                      <input className="input text-xs py-1 px-2 w-28" placeholder="Optional…"
                        value={item.notes} onChange={e => updateItem(idx, 'notes', e.target.value)} />
                    </td>
                    <td className="table-td">
                      <button onClick={() => removeItem(idx)} className="p-1 text-gray-300 hover:text-red-500">
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="flex gap-3 px-6 py-4 border-t flex-shrink-0 bg-gray-50 rounded-b-2xl">
          <button className="btn-primary flex items-center gap-2 flex-1" onClick={handleSave} disabled={saving || items.length === 0}>
            <Check size={15} />{saving ? 'Saving…' : `Write Off ${items.reduce((s, i) => s + (parseInt(i.cases) || 0), 0)} cases`}
          </button>
          <button className="btn-secondary px-5" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

// ── Variance badge ────────────────────────────────────────────
function VarianceBadge({ v }) {
  if (v === 0)  return <span className="flex items-center gap-1 text-green-600"><Minus size={12} /> 0</span>
  if (v > 0) return <span className="flex items-center gap-1 text-blue-600 font-bold"><TrendingUp size={12} /> +{v}</span>
  return <span className="flex items-center gap-1 text-red-600 font-bold"><TrendingDown size={12} /> {v}</span>
}

// ── Main page ─────────────────────────────────────────────────
export default function StockTake() {
  const today = new Date().toISOString().split('T')[0]

  const [sheet,       setSheet]      = useState([])
  const [warehouse,   setWarehouse]  = useState('WH1')
  const [countDate,   setCountDate]  = useState(today)
  const [notes,       setNotes]      = useState('')
  const [search,      setSearch]     = useState('')
  const [loading,     setLoading]    = useState(false)
  const [submitting,  setSubmitting] = useState(false)
  const [result,      setResult]     = useState(null)
  const [stage,       setStage]      = useState('count')  // 'count' | 'review' | 'done'
  const [showWriteOff, setShowWriteOff] = useState(false)
  const [showScanner, setShowScanner] = useState(false)
  const [scanFeedback, setScanFeedback] = useState(null)
  const [toast,       setToast]      = useState('')
  const [history,     setHistory]    = useState([])
  const rowRefs = useRef({})

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3000) }

  const handleScan = async (barcode) => {
    setScanFeedback({ type: 'loading', msg: `Looking up: ${barcode}…` })
    try {
      const r = await uploadAPI.lookupBarcode(barcode)
      if (r.data.found) {
        const idx = sheet.findIndex(row => row.sku_id === r.data.sku_id)
        if (idx !== -1) {
          setSearch('')
          setScanFeedback({ type: 'success', msg: `✅ Found: ${r.data.product_name} — enter count below` })
          // Scroll to matching row
          setTimeout(() => rowRefs.current[idx]?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100)
        } else {
          setScanFeedback({ type: 'warn', msg: `⚠️ ${r.data.product_name} not in this warehouse's sheet` })
        }
        setShowScanner(false)
      } else {
        setScanFeedback({ type: 'error', msg: `❓ Unknown barcode: ${barcode}` })
        setShowScanner(false)
      }
    } catch {
      setScanFeedback({ type: 'error', msg: 'Lookup failed' })
    }
  }

  const loadSheet = async () => {
    setLoading(true)
    try {
      const r = await stockTakeAPI.getSheet(warehouse)
      setSheet(r.data.rows.map(row => ({ ...row, input_count: '', dirty: false })))
      setStage('count')
      setResult(null)
    } catch (e) {
      alert(e.message)
    }
    setLoading(false)
  }

  const loadHistory = async () => {
    try {
      const r = await stockTakeAPI.history()
      setHistory(r.data)
    } catch {}
  }

  useEffect(() => { loadHistory() }, [])

  const updateCount = (idx, val) => {
    setSheet(prev => prev.map((r, i) => i === idx ? { ...r, input_count: val, dirty: val !== '' } : r))
  }

  const filledRows = sheet.filter(r => r.input_count !== '' && r.input_count !== null)

  const handlePreview = async () => {
    if (filledRows.length === 0) return alert('Enter counts for at least one product')
    setSubmitting(true)
    try {
      const items = filledRows.map(r => ({
        sku_id: r.sku_id,
        warehouse: r.warehouse,
        counted: parseInt(r.input_count) || 0,
      }))
      const r = await stockTakeAPI.submit({
        warehouse,
        counted_date: countDate,
        notes,
        items,
        apply: false,  // preview only
      })
      setResult(r.data)
      setStage('review')
    } catch (e) {
      alert(e.response?.data?.detail || e.message)
    }
    setSubmitting(false)
  }

  const handleApply = async () => {
    setSubmitting(true)
    try {
      const items = filledRows.map(r => ({
        sku_id: r.sku_id,
        warehouse: r.warehouse,
        counted: parseInt(r.input_count) || 0,
      }))
      await stockTakeAPI.submit({
        warehouse,
        counted_date: countDate,
        notes,
        items,
        apply: true,
      })
      setStage('done')
      showToast('✅ Stock take applied — inventory updated')
      loadHistory()
    } catch (e) {
      alert(e.response?.data?.detail || e.message)
    }
    setSubmitting(false)
  }

  const filtered = sheet.filter(r =>
    !search ||
    r.product_name.toLowerCase().includes(search.toLowerCase()) ||
    r.sku_code.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-6">
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 bg-gray-900 text-white text-sm px-4 py-3 rounded-xl shadow-lg">{toast}</div>
      )}
      {showWriteOff && (
        <WriteOffModal
          onClose={() => setShowWriteOff(false)}
          onSaved={() => {
            setShowWriteOff(false)
            showToast('✅ Write-off logged')
          }}
        />
      )}
      {showScanner && (
        <BarcodeScanner onScan={handleScan} onClose={() => setShowScanner(false)} />
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Stock Take</h2>
          <p className="text-sm text-gray-400 mt-1">Physical count vs system — find and fix discrepancies</p>
        </div>
        <button
          className="btn-secondary flex items-center gap-2 text-red-600 border-red-200 hover:bg-red-50"
          onClick={() => setShowWriteOff(true)}
        >
          <Trash2 size={15} /> Log Write-off / Damaged
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ── Left: Count form ── */}
        <div className="lg:col-span-2 space-y-4">
          {/* Setup bar */}
          <div className="card py-3">
            <div className="flex flex-wrap gap-3 items-center">
              <div className="flex items-center gap-2 text-sm">
                <label className="text-gray-500 whitespace-nowrap">Warehouse</label>
                <select className="input py-1.5 text-sm w-24" value={warehouse} onChange={e => setWarehouse(e.target.value)}>
                  <option>WH1</option>
                  <option>WH2</option>
                </select>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <label className="text-gray-500 whitespace-nowrap">Count Date</label>
                <input type="date" className="input py-1.5 text-sm w-36" value={countDate} onChange={e => setCountDate(e.target.value)} />
              </div>
              <button
                className="btn-primary flex items-center gap-2 text-sm"
                onClick={loadSheet}
                disabled={loading}
              >
                {loading ? <RefreshCw size={14} className="animate-spin" /> : <ClipboardList size={14} />}
                {loading ? 'Loading…' : 'Load Count Sheet'}
              </button>
            </div>
          </div>

          {sheet.length > 0 && stage === 'count' && (
            <>
              {/* Search + scan + progress */}
              <div className="flex items-center gap-3">
                <div className="relative flex-1">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input className="input pl-9 py-2 text-sm" placeholder="Filter products…"
                    value={search} onChange={e => setSearch(e.target.value)} />
                </div>
                <button
                  className="btn-secondary flex items-center gap-1.5 text-sm py-2"
                  onClick={() => { setScanFeedback(null); setShowScanner(true) }}
                  title="Scan barcode to find product"
                >
                  <Camera size={15} /> Scan
                </button>
                <div className="text-xs text-gray-400 whitespace-nowrap">
                  {filledRows.length} / {sheet.length} counted
                </div>
              </div>
              {scanFeedback && (
                <div className={`rounded-xl px-4 py-2.5 flex items-center gap-3 text-sm ${
                  scanFeedback.type === 'success' ? 'bg-green-50 border border-green-200 text-green-800' :
                  scanFeedback.type === 'error'   ? 'bg-yellow-50 border border-yellow-200 text-yellow-800' :
                  scanFeedback.type === 'warn'    ? 'bg-orange-50 border border-orange-200 text-orange-800' :
                  'bg-blue-50 border border-blue-200 text-blue-800'
                }`}>
                  {scanFeedback.msg}
                  <button onClick={() => setScanFeedback(null)} className="ml-auto opacity-60 hover:opacity-100"><X size={14} /></button>
                </div>
              )}

              {/* Count table */}
              <div className="card p-0 overflow-hidden">
                <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b sticky top-0">
                      <tr>
                        <th className="table-th">SKU / Product</th>
                        <th className="table-th text-center">System Cases</th>
                        <th className="table-th text-center">Physical Count</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((row, idx) => {
                        const realIdx = sheet.indexOf(row)
                        return (
                          <tr key={`${row.sku_id}-${row.warehouse}`}
                            ref={el => rowRefs.current[realIdx] = el}
                            className={`border-b ${row.dirty ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
                            <td className="table-td">
                              <div className="font-mono text-xs text-blue-700">{row.sku_code}</div>
                              <div className="text-sm font-medium text-gray-800 truncate max-w-[200px]">{row.product_name}</div>
                              <div className="text-xs text-gray-400">{row.case_contents}</div>
                            </td>
                            <td className="table-td text-center">
                              <span className={`font-bold text-lg ${row.system_cases === 0 ? 'text-red-400' : 'text-gray-700'}`}>
                                {row.system_cases}
                              </span>
                            </td>
                            <td className="table-td text-center">
                              <input
                                type="number" min="0"
                                className={`w-20 text-center font-bold text-lg border rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-400 ${
                                  row.dirty ? 'bg-blue-100 border-blue-300' : 'bg-gray-100 border-gray-200'
                                }`}
                                placeholder="—"
                                value={row.input_count}
                                onChange={e => updateCount(realIdx, e.target.value)}
                              />
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="px-4 py-3 bg-gray-50 border-t flex items-center justify-between">
                  <span className="text-xs text-gray-500">{filledRows.length} rows with counts entered</span>
                  <div className="flex gap-2">
                    <input
                      className="input py-1.5 text-sm w-64"
                      placeholder="Notes (optional)…"
                      value={notes}
                      onChange={e => setNotes(e.target.value)}
                    />
                    <button
                      className="btn-primary flex items-center gap-2"
                      onClick={handlePreview}
                      disabled={submitting || filledRows.length === 0}
                    >
                      {submitting ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
                      {submitting ? 'Processing…' : 'Review Variances'}
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* ── Review stage ── */}
          {stage === 'review' && result && (
            <div className="space-y-4">
              {/* Summary */}
              <div className="grid grid-cols-4 gap-3">
                {[
                  { label: 'Lines Counted', value: result.total_lines, color: 'bg-blue-50 text-blue-700' },
                  { label: 'Variances', value: result.variances_found, color: 'bg-orange-50 text-orange-700' },
                  { label: 'Total Gain', value: `+${result.total_gain_cases}`, color: 'bg-green-50 text-green-700' },
                  { label: 'Total Loss', value: `-${result.total_loss_cases}`, color: 'bg-red-50 text-red-700' },
                ].map(s => (
                  <div key={s.label} className={`rounded-xl p-3 text-center ${s.color}`}>
                    <div className="text-2xl font-bold">{s.value}</div>
                    <div className="text-xs mt-1">{s.label}</div>
                  </div>
                ))}
              </div>

              {result.variances_found === 0 ? (
                <div className="card text-center py-8">
                  <div className="text-4xl mb-3">✅</div>
                  <p className="font-semibold text-green-700">No variances found — system matches physical count!</p>
                </div>
              ) : (
                <div className="card p-0 overflow-hidden">
                  <div className="px-4 py-3 border-b bg-orange-50 flex items-center gap-2">
                    <AlertTriangle size={16} className="text-orange-600" />
                    <span className="font-semibold text-orange-800 text-sm">{result.variances_found} variances found — review before applying</span>
                  </div>
                  <div className="overflow-x-auto max-h-72">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b sticky top-0">
                        <tr>
                          {['SKU','Product','WH','System','Counted','Variance','%'].map(h => (
                            <th key={h} className="table-th">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {result.variances.map((v, i) => (
                          <tr key={i} className={`border-b ${v.variance < 0 ? 'bg-red-50' : 'bg-blue-50'}`}>
                            <td className="table-td font-mono text-xs text-blue-700">{v.sku_code}</td>
                            <td className="table-td max-w-[160px] truncate">{v.product_name}</td>
                            <td className="table-td text-center"><span className="badge-neutral text-xs">{v.warehouse}</span></td>
                            <td className="table-td text-center">{v.system_cases}</td>
                            <td className="table-td text-center font-bold">{v.counted_cases}</td>
                            <td className="table-td text-center"><VarianceBadge v={v.variance} /></td>
                            <td className="table-td text-center text-xs text-gray-500">
                              {v.variance_pct != null ? `${v.variance_pct}%` : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="flex gap-3">
                <button className="btn-secondary" onClick={() => setStage('count')}>← Edit Counts</button>
                <button
                  className="btn-primary flex items-center gap-2 flex-1"
                  onClick={handleApply}
                  disabled={submitting}
                >
                  <Check size={15} />{submitting ? 'Applying…' : `Apply ${result.variances_found} Adjustments to Inventory`}
                </button>
              </div>
            </div>
          )}

          {stage === 'done' && (
            <div className="card text-center py-10 space-y-3">
              <div className="text-5xl">✅</div>
              <h3 className="font-bold text-gray-900 text-xl">Stock Take Complete</h3>
              <p className="text-gray-500 text-sm">Inventory has been updated. All adjustments are logged.</p>
              <button className="btn-primary mt-4" onClick={() => { setStage('count'); setSheet([]); setResult(null) }}>
                Start New Count
              </button>
            </div>
          )}
        </div>

        {/* ── Right: History ── */}
        <div className="space-y-4">
          <div className="card">
            <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <ClipboardList size={16} className="text-gray-500" />
              Recent Stock Takes
            </h3>
            {history.length === 0 ? (
              <p className="text-sm text-gray-400">No stock takes recorded yet</p>
            ) : (
              <div className="space-y-3">
                {history.map((h, i) => (
                  <div key={i} className="border border-gray-100 rounded-xl p-3">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm text-gray-800">{h.date}</span>
                      <span className="text-xs text-gray-400">{h.total_adjustments} adjustments</span>
                    </div>
                    {h.lines.slice(0, 3).map((l, j) => (
                      <div key={j} className="text-xs text-gray-500 mt-1 flex items-center justify-between">
                        <span className="truncate max-w-[140px]">{l.sku_code} {l.warehouse}</span>
                        <VarianceBadge v={l.variance} />
                      </div>
                    ))}
                    {h.lines.length > 3 && (
                      <p className="text-xs text-gray-400 mt-1">+{h.lines.length - 3} more</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Quick tips */}
          <div className="card bg-blue-50 border-blue-100">
            <h4 className="font-semibold text-blue-800 text-sm mb-2">💡 How to do a stock take</h4>
            <ol className="text-xs text-blue-700 space-y-1.5 list-decimal list-inside">
              <li>Select warehouse and date</li>
              <li>Click "Load Count Sheet"</li>
              <li>Enter the physical count for each product</li>
              <li>Click "Review Variances" — preview differences</li>
              <li>Apply to update inventory</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  )
}
