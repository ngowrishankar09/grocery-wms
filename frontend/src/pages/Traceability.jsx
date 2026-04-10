import { useState, useEffect } from 'react'
import { Search, AlertTriangle, ArrowRight, ArrowLeft, Package, RotateCcw, CheckCircle, RefreshCw } from 'lucide-react'
import { traceabilityAPI } from '../api/client'

const TABS = ['Forward Trace', 'Backward Trace', 'Recall Management']

export default function Traceability() {
  const [tab, setTab] = useState('Forward Trace')
  const [searchQ, setSearchQ] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [batchCode, setBatchCode] = useState('')
  const [traceResult, setTraceResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [recalls, setRecalls] = useState([])
  const [recallBatch, setRecallBatch] = useState(null)
  const [recallReason, setRecallReason] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (tab === 'Recall Management') loadRecalls()
  }, [tab])

  const loadRecalls = async () => {
    try {
      const r = await traceabilityAPI.listRecalls()
      setRecalls(r.data)
    } catch {}
  }

  const doSearch = async () => {
    if (!searchQ.trim()) return
    setLoading(true)
    try {
      const r = await traceabilityAPI.search(searchQ)
      setSearchResults(r.data)
    } catch { setSearchResults([]) }
    setLoading(false)
  }

  const doTrace = async () => {
    if (!batchCode.trim()) return
    setLoading(true)
    setError('')
    try {
      const fn = tab === 'Forward Trace' ? traceabilityAPI.forwardTrace : traceabilityAPI.backwardTrace
      const r = await fn(batchCode.trim())
      setTraceResult(r.data)
    } catch (e) {
      setError(e.response?.data?.detail || 'Batch not found')
      setTraceResult(null)
    }
    setLoading(false)
  }

  const doRecall = async () => {
    if (!recallBatch) return
    try {
      await traceabilityAPI.recall(recallBatch.batch_code, recallReason)
      setRecallBatch(null)
      setRecallReason('')
      loadRecalls()
    } catch {}
  }

  const undoRecall = async (batchCode) => {
    try {
      await traceabilityAPI.undoRecall(batchCode)
      loadRecalls()
    } catch {}
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Batch Traceability</h1>
          <p className="text-sm text-gray-500 mt-1">Forward/backward trace batches · Manage recalls</p>
        </div>
      </div>

      {/* Quick Search */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h2 className="font-semibold text-gray-700 mb-3">Quick Batch Search</h2>
        <div className="flex gap-2">
          <input
            value={searchQ}
            onChange={e => setSearchQ(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && doSearch()}
            placeholder="Search by batch code, lot number, supplier ref..."
            className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button onClick={doSearch} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 flex items-center gap-2">
            <Search className="w-4 h-4" /> Search
          </button>
        </div>
        {searchResults.length > 0 && (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {['Batch Code','SKU','Product','Warehouse','Received','Expiry','Lot#','Recalled'].map(h => (
                    <th key={h} className="text-left px-3 py-2 text-xs font-medium text-gray-500 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {searchResults.map(b => (
                  <tr key={b.id} className={`hover:bg-gray-50 cursor-pointer ${b.is_recalled ? 'bg-red-50' : ''}`}
                    onClick={() => { setBatchCode(b.batch_code); setTab('Forward Trace') }}>
                    <td className="px-3 py-2 font-mono font-medium text-blue-600">{b.batch_code}</td>
                    <td className="px-3 py-2 text-gray-500">{b.sku_code}</td>
                    <td className="px-3 py-2">{b.product_name}</td>
                    <td className="px-3 py-2">{b.warehouse}</td>
                    <td className="px-3 py-2">{b.received_date}</td>
                    <td className="px-3 py-2">{b.expiry_date || '—'}</td>
                    <td className="px-3 py-2">{b.lot_number || '—'}</td>
                    <td className="px-3 py-2">
                      {b.is_recalled ? <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded-full text-xs font-medium">RECALLED</span> : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="flex border-b border-gray-200">
          {TABS.map(t => (
            <button key={t} onClick={() => { setTab(t); setTraceResult(null); setError('') }}
              className={`px-5 py-3 text-sm font-medium ${tab === t ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}>
              {t === 'Recall Management' && recalls.length > 0 && <span className="mr-1 bg-red-100 text-red-700 rounded-full px-1.5 text-xs">{recalls.length}</span>}
              {t}
            </button>
          ))}
        </div>

        <div className="p-4">
          {(tab === 'Forward Trace' || tab === 'Backward Trace') && (
            <div className="space-y-4">
              <div className="flex gap-2">
                <input
                  value={batchCode}
                  onChange={e => setBatchCode(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && doTrace()}
                  placeholder="Enter batch code..."
                  className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button onClick={doTrace} disabled={loading}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 flex items-center gap-2 disabled:opacity-50">
                  {tab === 'Forward Trace' ? <ArrowRight className="w-4 h-4" /> : <ArrowLeft className="w-4 h-4" />}
                  {loading ? 'Tracing...' : 'Trace'}
                </button>
              </div>
              {error && <div className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}

              {traceResult && tab === 'Forward Trace' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-4 gap-3">
                    {[
                      ['Batch Code', traceResult.batch?.batch_code],
                      ['Product', traceResult.batch?.product_name],
                      ['Affected Customers', traceResult.affected_customers],
                      ['Cases Dispatched', traceResult.total_cases_dispatched],
                    ].map(([label, val]) => (
                      <div key={label} className="bg-blue-50 rounded-lg p-3">
                        <div className="text-xs text-blue-600 font-medium">{label}</div>
                        <div className="text-lg font-bold text-blue-900 mt-1">{val}</div>
                      </div>
                    ))}
                  </div>
                  {traceResult.batch?.is_recalled && (
                    <div className="bg-red-50 border border-red-300 rounded-lg p-3 flex items-center gap-2">
                      <AlertTriangle className="w-5 h-5 text-red-600" />
                      <div>
                        <span className="font-semibold text-red-800">RECALLED BATCH</span>
                        <span className="text-red-600 ml-2 text-sm">{traceResult.batch.recall_reason}</span>
                      </div>
                    </div>
                  )}
                  <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
                    <thead className="bg-gray-50">
                      <tr>
                        {['Order #','Date','Status','Customer','Phone','Cases Picked','Picked At'].map(h => (
                          <th key={h} className="text-left px-3 py-2 text-xs font-medium text-gray-500 uppercase">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {traceResult.dispatches.map((d, i) => (
                        <tr key={i} className="hover:bg-gray-50">
                          <td className="px-3 py-2 font-medium">{d.order_number}</td>
                          <td className="px-3 py-2 text-gray-500">{d.order_date}</td>
                          <td className="px-3 py-2">{d.order_status}</td>
                          <td className="px-3 py-2">{d.customer_name}</td>
                          <td className="px-3 py-2 text-gray-500">{d.customer_phone || '—'}</td>
                          <td className="px-3 py-2">{d.cases_picked}</td>
                          <td className="px-3 py-2 text-gray-500">{d.picked_at?.split('T')[0]}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {traceResult && tab === 'Backward Trace' && (
                <div className="grid grid-cols-3 gap-4">
                  <div className="border border-gray-200 rounded-lg p-4">
                    <h3 className="font-semibold text-gray-700 mb-2 flex items-center gap-2"><Package className="w-4 h-4" />Batch</h3>
                    {Object.entries({
                      'Batch Code': traceResult.batch?.batch_code,
                      'Lot Number': traceResult.batch?.lot_number || '—',
                      'Received': traceResult.batch?.received_date,
                      'Expiry': traceResult.batch?.expiry_date || '—',
                      'Cases Received': traceResult.batch?.cases_received,
                      'Cases Remaining': traceResult.batch?.cases_remaining,
                    }).map(([k, v]) => (
                      <div key={k} className="flex justify-between text-sm py-1 border-b border-gray-50">
                        <span className="text-gray-500">{k}</span><span className="font-medium">{v}</span>
                      </div>
                    ))}
                  </div>
                  <div className="border border-gray-200 rounded-lg p-4">
                    <h3 className="font-semibold text-gray-700 mb-2">SKU / Product</h3>
                    {traceResult.sku ? Object.entries({
                      'SKU Code': traceResult.sku.sku_code,
                      'Product': traceResult.sku.product_name,
                      'Category': traceResult.sku.category,
                    }).map(([k, v]) => (
                      <div key={k} className="flex justify-between text-sm py-1 border-b border-gray-50">
                        <span className="text-gray-500">{k}</span><span className="font-medium">{v}</span>
                      </div>
                    )) : <p className="text-gray-400 text-sm">No SKU info</p>}
                  </div>
                  <div className="border border-gray-200 rounded-lg p-4">
                    <h3 className="font-semibold text-gray-700 mb-2">Vendor / PO</h3>
                    {traceResult.vendor ? Object.entries({
                      'Vendor': traceResult.vendor.name,
                      'Contact': traceResult.vendor.contact_person || '—',
                      'Phone': traceResult.vendor.phone || '—',
                      'Email': traceResult.vendor.email || '—',
                    }).map(([k, v]) => (
                      <div key={k} className="flex justify-between text-sm py-1 border-b border-gray-50">
                        <span className="text-gray-500">{k}</span><span className="font-medium">{v}</span>
                      </div>
                    )) : <p className="text-gray-400 text-sm">No vendor info</p>}
                    {traceResult.purchase_order && (
                      <div className="mt-2 pt-2 border-t border-gray-100">
                        <div className="text-xs text-gray-500 font-medium mb-1">Purchase Order</div>
                        {Object.entries({
                          'PO #': traceResult.purchase_order.po_number,
                          'Status': traceResult.purchase_order.status,
                          'Unit Cost': `$${traceResult.purchase_order.unit_cost || 0}`,
                        }).map(([k, v]) => (
                          <div key={k} className="flex justify-between text-sm py-0.5">
                            <span className="text-gray-500">{k}</span><span className="font-medium">{v}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === 'Recall Management' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="font-semibold text-gray-700">Active Recalls ({recalls.length})</h3>
                <div className="flex gap-2">
                  <input value={batchCode} onChange={e => setBatchCode(e.target.value)}
                    placeholder="Batch code to recall..."
                    className="border rounded-lg px-3 py-2 text-sm focus:outline-none" />
                  <button onClick={() => { if (batchCode) setRecallBatch({ batch_code: batchCode }) }}
                    className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-700 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" /> Initiate Recall
                  </button>
                </div>
              </div>
              {recalls.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <CheckCircle className="w-12 h-12 mx-auto mb-3 text-green-300" />
                  <p>No active recalls</p>
                </div>
              ) : (
                <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
                  <thead className="bg-red-50">
                    <tr>
                      {['Batch Code','SKU','Product','Recall Reason','Recalled At','Actions'].map(h => (
                        <th key={h} className="text-left px-3 py-2 text-xs font-medium text-red-700 uppercase">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {recalls.map(b => (
                      <tr key={b.id} className="bg-red-50 hover:bg-red-100">
                        <td className="px-3 py-2 font-mono font-bold text-red-700">{b.batch_code}</td>
                        <td className="px-3 py-2 text-gray-600">{b.sku_code}</td>
                        <td className="px-3 py-2">{b.product_name}</td>
                        <td className="px-3 py-2">{b.recall_reason}</td>
                        <td className="px-3 py-2 text-gray-500">{b.recalled_at?.split('T')[0]}</td>
                        <td className="px-3 py-2">
                          <button onClick={() => undoRecall(b.batch_code)}
                            className="text-blue-600 hover:text-blue-800 text-xs flex items-center gap-1">
                            <RotateCcw className="w-3 h-3" /> Undo Recall
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Recall Modal */}
      {recallBatch && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-[450px]">
            <h2 className="text-lg font-bold text-red-700 mb-3 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" /> Initiate Recall
            </h2>
            <p className="text-gray-600 text-sm mb-4">
              You are recalling batch <strong>{recallBatch.batch_code}</strong>. This will flag all dispatched stock from this batch.
            </p>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Recall Reason *</label>
              <textarea value={recallReason} onChange={e => setRecallReason(e.target.value)}
                rows={3} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                placeholder="e.g. Contamination found, Foreign object, Labelling error..." />
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => { setRecallBatch(null); setRecallReason('') }}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
              <button onClick={doRecall} disabled={!recallReason.trim()}
                className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50">
                Confirm Recall
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
