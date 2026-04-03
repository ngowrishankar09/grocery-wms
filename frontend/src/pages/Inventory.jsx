import { useEffect, useState } from 'react'
import { inventoryAPI, skuAPI, uploadAPI, receivingAPI, warehouseTaskAPI } from '../api/client'
import { useT } from '../i18n/translations'
import { Search, Filter, MapPin, X, Check, Camera, Layers, Package, Lock, Unlock, AlertTriangle } from 'lucide-react'
import axios from 'axios'
import BarcodeScanner from '../components/BarcodeScanner'

const API = axios.create({ baseURL: 'http://localhost:8000' })

const stockBadge = (status) => {
  if (status === 'stockout') return <span className="badge-danger">Stockout</span>
  if (status === 'low') return <span className="badge-warning">Low Stock</span>
  return <span className="badge-ok">OK</span>
}

const expiryBadge = (status, days) => {
  if (status === 'no_expiry') return <span className="badge-neutral">No Expiry</span>
  if (status === 'expired') return <span className="badge-danger">Expired</span>
  if (status === 'critical') return <span className="badge-danger">{days}d</span>
  if (status === 'warning') return <span className="badge-warning">{days}d</span>
  return <span className="badge-ok">{days}d</span>
}

// ── Inline bin assignment cell ────────────────────────────────
function BinCell({ inventoryId, currentBin, onAssigned }) {
  const [editing,   setEditing]   = useState(false)
  const [bins,      setBins]      = useState([])
  const [saving,    setSaving]    = useState(false)
  const [binSearch, setBinSearch] = useState('')

  const openPicker = async () => {
    setBinSearch('')
    setEditing(true)
    try {
      const r = await API.get('/bin-locations?active_only=true')
      setBins(r.data)
    } catch {}
  }

  const assign = async (binId) => {
    if (!inventoryId) return
    setSaving(true)
    try {
      await API.post('/bin-locations/assign', { inventory_id: inventoryId, bin_location_id: binId })
      onAssigned()
    } catch {}
    setSaving(false)
    setEditing(false)
  }

  if (!inventoryId) return <span className="text-gray-300 text-xs">—</span>

  if (!editing) {
    return (
      <button onClick={openPicker}
        className="flex items-center gap-1 group text-xs rounded px-1.5 py-0.5 hover:bg-indigo-50 transition-colors">
        {currentBin
          ? <span className="flex items-center gap-1 px-2 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded font-mono font-semibold">
              <MapPin size={10} />{currentBin.code}
            </span>
          : <span className="text-gray-300 group-hover:text-indigo-400 flex items-center gap-1">
              <MapPin size={11} /> Assign bin
            </span>
        }
      </button>
    )
  }

  const q = binSearch.trim().toUpperCase()
  const filtered = q ? bins.filter(b => b.code.includes(q)) : bins

  return (
    <div className="relative">
      <div className="absolute z-20 top-0 left-0 bg-white rounded-xl shadow-2xl border border-gray-200 p-2 min-w-56">
        <div className="flex items-center justify-between mb-2 px-1">
          <span className="text-xs font-semibold text-gray-600">Select bin</span>
          <button onClick={() => setEditing(false)}><X size={12} className="text-gray-400" /></button>
        </div>
        <input
          autoFocus
          value={binSearch}
          onChange={e => setBinSearch(e.target.value)}
          placeholder="Type to search…"
          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs font-mono mb-2 focus:outline-none focus:ring-2 focus:ring-indigo-400"
        />
        <div className="max-h-52 overflow-y-auto">
          {currentBin && !q && (
            <button onClick={() => assign(null)}
              className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-red-50 text-red-500 mb-1">
              ✕ Unassign
            </button>
          )}
          {filtered.length === 0
            ? <p className="text-xs text-gray-400 px-2 py-1">{bins.length === 0 ? 'No bins — create some in Bin Locations' : 'No match'}</p>
            : filtered.map(b => (
              <button key={b.id} onClick={() => assign(b.id)}
                className={`w-full text-left text-xs px-2 py-1.5 rounded flex items-center justify-between hover:bg-indigo-50 ${currentBin?.id === b.id ? 'bg-indigo-50 text-indigo-700 font-semibold' : 'text-gray-700'}`}>
                <span className="font-mono">{b.code}</span>
                <span className="text-gray-400">{b.sku_count}SKUs</span>
              </button>
            ))
          }
        </div>
      </div>
    </div>
  )
}

const EXPIRY_BADGE = {
  expired:   'bg-red-100 text-red-700 border border-red-200',
  critical:  'bg-orange-100 text-orange-700 border border-orange-200',
  warning:   'bg-yellow-100 text-yellow-700 border border-yellow-200',
  ok:        'bg-green-100 text-green-700 border border-green-200',
  no_expiry: 'bg-gray-100 text-gray-500',
}

export default function Inventory({ lang }) {
  const t = useT(lang)
  const [view, setView]         = useState('stock')   // stock | batches
  const [items, setItems]       = useState([])
  const [batches, setBatches]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [batchLoading, setBatchLoading] = useState(false)
  const [search, setSearch]     = useState('')
  const [batchSearch, setBatchSearch] = useState('')
  const [category, setCategory] = useState('')
  const [warehouse, setWarehouse] = useState('')
  const [lowStockOnly, setLowStockOnly] = useState(false)
  const [expiryFilter, setExpiryFilter] = useState('')
  const [categories, setCategories] = useState([])
  const [showScanner, setShowScanner] = useState(false)
  const [scanFeedback, setScanFeedback] = useState(null)
  const [stockModal, setStockModal] = useState(null)  // { mode:'block'|'release', item, warehouse }
  const [stockQty, setStockQty] = useState(1)
  const [stockReason, setStockReason] = useState('')
  const [stockSaving, setStockSaving] = useState(false)

  const load = () => {
    if (!items.length) setLoading(true)
    const params = {}
    if (warehouse) params.warehouse = warehouse
    if (category) params.category = category
    if (lowStockOnly) params.low_stock = true
    inventoryAPI.list(params).then(r => { setItems(r.data); setLoading(false) })
  }

  const loadBatches = () => {
    setBatchLoading(true)
    const params = {}
    if (warehouse) params.warehouse = warehouse
    if (expiryFilter) params.expiring_in_days = expiryFilter
    receivingAPI.listBatches(params).then(r => { setBatches(r.data); setBatchLoading(false) })
  }

  useEffect(() => {
    skuAPI.categories().then(r => setCategories(r.data))
    load()
  }, [warehouse, category, lowStockOnly])

  useEffect(() => {
    if (view === 'batches') loadBatches()
  }, [view, warehouse, expiryFilter])

  const filtered = items.filter(i =>
    !search || i.product_name.toLowerCase().includes(search.toLowerCase()) || i.sku_code.toLowerCase().includes(search.toLowerCase())
  )

  const handleScan = async (barcode) => {
    setScanFeedback({ type: 'loading', msg: `Looking up: ${barcode}…` })
    try {
      const r = await uploadAPI.lookupBarcode(barcode)
      if (r.data.found) {
        setSearch(r.data.product_name)
        setScanFeedback({ type: 'success', msg: `✅ ${r.data.product_name}` })
      } else {
        setScanFeedback({ type: 'error', msg: `❓ Unknown barcode: ${barcode}` })
      }
    } catch {
      setScanFeedback({ type: 'error', msg: 'Lookup failed' })
    }
    setShowScanner(false)
  }

  const openBlockModal = (item, wh) => {
    setStockModal({ mode: 'block', item, warehouse: wh })
    setStockQty(1)
    setStockReason('')
  }
  const openReleaseModal = (item, wh) => {
    setStockModal({ mode: 'release', item, warehouse: wh })
    setStockQty(1)
    setStockReason('')
  }
  const handleStockAction = async () => {
    if (!stockModal) return
    setStockSaving(true)
    try {
      const payload = { sku_id: stockModal.item.sku_id, warehouse: stockModal.warehouse, quantity: Number(stockQty), reason: stockReason || undefined }
      if (stockModal.mode === 'block') await warehouseTaskAPI.blockStock(payload)
      else await warehouseTaskAPI.releaseStock(payload)
      setStockModal(null)
      load()
    } catch (e) {
      alert(e?.response?.data?.detail || 'Error')
    }
    setStockSaving(false)
  }

  const filteredBatches = batches.filter(b =>
    !batchSearch ||
    b.product_name.toLowerCase().includes(batchSearch.toLowerCase()) ||
    b.sku_code.toLowerCase().includes(batchSearch.toLowerCase()) ||
    (b.lot_number || '').toLowerCase().includes(batchSearch.toLowerCase()) ||
    (b.batch_code || '').toLowerCase().includes(batchSearch.toLowerCase())
  )

  return (
    <div className="space-y-6">
      {showScanner && <BarcodeScanner onScan={handleScan} onClose={() => setShowScanner(false)} />}

      {/* Block / Release Stock Modal */}
      {stockModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className={`flex items-center gap-2 mb-4 ${stockModal.mode === 'block' ? 'text-red-600' : 'text-emerald-600'}`}>
              {stockModal.mode === 'block' ? <Lock size={18} /> : <Unlock size={18} />}
              <h3 className="text-base font-bold">
                {stockModal.mode === 'block' ? 'Block Stock (Quarantine)' : 'Release Blocked Stock'}
              </h3>
            </div>
            <p className="text-sm text-gray-500 mb-4">
              <strong>{stockModal.item.product_name}</strong> · {stockModal.warehouse}
              {stockModal.mode === 'block'
                ? <span className="block text-xs mt-1 text-gray-400">Moving from <b>unrestricted → blocked</b>. Blocked stock cannot be ordered.</span>
                : <span className="block text-xs mt-1 text-gray-400">Moving from <b>blocked → unrestricted</b>. Stock becomes available for orders.</span>
              }
            </p>
            <label className="block text-xs font-medium text-gray-600 mb-1">Quantity (cases)</label>
            <input
              type="number" min={1}
              value={stockQty}
              onChange={e => setStockQty(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
            <label className="block text-xs font-medium text-gray-600 mb-1">Reason (optional)</label>
            <input
              type="text"
              value={stockReason}
              onChange={e => setStockReason(e.target.value)}
              placeholder={stockModal.mode === 'block' ? 'e.g. Damaged, recall, QC hold' : 'e.g. QC passed, cleared for sale'}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setStockModal(null)} className="px-4 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-100">Cancel</button>
              <button
                onClick={handleStockAction}
                disabled={stockSaving || !stockQty}
                className={`px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors ${
                  stockModal.mode === 'block' ? 'bg-red-500 hover:bg-red-600' : 'bg-emerald-500 hover:bg-emerald-600'
                } disabled:opacity-50`}
              >
                {stockSaving ? 'Saving…' : stockModal.mode === 'block' ? 'Block Stock' : 'Release Stock'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <h2 className="text-2xl font-bold text-gray-900">{t('inventory')}</h2>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setView('stock')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${view === 'stock' ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}
          >
            <Package size={15} /> Stock View
          </button>
          <button
            onClick={() => setView('batches')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${view === 'batches' ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}
          >
            <Layers size={15} /> Batch / Lot Tracking
          </button>
        </div>
      </div>

      {/* ── Batch Tracking View ── */}
      {view === 'batches' && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="card">
            <div className="flex flex-wrap gap-3 items-center">
              <div className="relative flex-1 min-w-48">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                <input
                  className="input pl-9"
                  placeholder="Search product, batch code, lot number…"
                  value={batchSearch}
                  onChange={e => setBatchSearch(e.target.value)}
                />
              </div>
              <select className="input w-auto" value={warehouse} onChange={e => setWarehouse(e.target.value)}>
                <option value="">Both Warehouses</option>
                <option value="WH1">WH1 - Main</option>
                <option value="WH2">WH2 - Backup</option>
              </select>
              <select className="input w-auto" value={expiryFilter} onChange={e => setExpiryFilter(e.target.value)}>
                <option value="">All Expiry</option>
                <option value="7">Expiring in 7 days</option>
                <option value="30">Expiring in 30 days</option>
                <option value="60">Expiring in 60 days</option>
                <option value="90">Expiring in 90 days</option>
              </select>
            </div>
          </div>

          {/* Summary chips */}
          <div className="flex gap-3 flex-wrap">
            {['expired', 'critical', 'warning', 'ok', 'no_expiry'].map(status => {
              const count = batches.filter(b => b.expiry_status === status).length
              if (count === 0) return null
              const labels = { expired: 'Expired', critical: 'Critical (<30d)', warning: 'Warning (31-60d)', ok: 'Good (>60d)', no_expiry: 'No Expiry' }
              return (
                <span key={status} className={`text-xs font-medium px-3 py-1.5 rounded-full ${EXPIRY_BADGE[status]}`}>
                  {count} {labels[status]}
                </span>
              )
            })}
          </div>

          {/* Batch table */}
          <div className="card p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="table-th">Product</th>
                    <th className="table-th">Batch Code</th>
                    <th className="table-th">Lot Number</th>
                    <th className="table-th text-center">WH</th>
                    <th className="table-th text-center">Received</th>
                    <th className="table-th text-center">Remaining</th>
                    <th className="table-th text-center">Expiry Date</th>
                    <th className="table-th">Status</th>
                    <th className="table-th">Supplier Ref</th>
                  </tr>
                </thead>
                <tbody>
                  {batchLoading ? (
                    <tr><td colSpan={9} className="table-td text-center py-8 text-gray-400">Loading batches…</td></tr>
                  ) : filteredBatches.length === 0 ? (
                    <tr><td colSpan={9} className="table-td text-center py-8 text-gray-400">No active batches found</td></tr>
                  ) : filteredBatches.map(b => (
                    <tr key={b.id} className={`border-b hover:bg-gray-50 ${b.expiry_status === 'expired' ? 'bg-red-50/30' : b.expiry_status === 'critical' ? 'bg-orange-50/20' : ''}`}>
                      <td className="table-td">
                        <div className="font-medium text-gray-900">{b.product_name}</div>
                        <div className="text-xs text-gray-400">{b.sku_code} · {b.category}</div>
                      </td>
                      <td className="table-td font-mono text-xs text-gray-600">{b.batch_code}</td>
                      <td className="table-td">
                        {b.lot_number
                          ? <span className="font-mono text-sm bg-purple-50 text-purple-700 border border-purple-200 px-2 py-0.5 rounded">{b.lot_number}</span>
                          : <span className="text-gray-300">—</span>
                        }
                      </td>
                      <td className="table-td text-center">
                        <span className={`text-xs font-bold ${b.warehouse === 'WH1' ? 'text-blue-700' : 'text-gray-500'}`}>{b.warehouse}</span>
                      </td>
                      <td className="table-td text-center text-sm">{b.received_date}</td>
                      <td className="table-td text-center">
                        <span className="font-bold text-gray-900">{b.cases_remaining}</span>
                        <span className="text-xs text-gray-400 ml-1">/ {b.cases_received}</span>
                      </td>
                      <td className="table-td text-center text-sm">
                        {b.expiry_date || <span className="text-gray-300">—</span>}
                      </td>
                      <td className="table-td">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${EXPIRY_BADGE[b.expiry_status] || ''}`}>
                          {b.expiry_status === 'no_expiry' ? 'No Expiry'
                            : b.expiry_status === 'expired' ? 'Expired'
                            : b.expiry_status === 'critical' ? `${b.days_to_expiry}d left`
                            : b.expiry_status === 'warning' ? `${b.days_to_expiry}d left`
                            : `${b.days_to_expiry}d left`}
                        </span>
                      </td>
                      <td className="table-td text-xs text-gray-500">{b.supplier_ref || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-3 bg-gray-50 border-t text-sm text-gray-500">
              {filteredBatches.length} batches · {filteredBatches.reduce((s, b) => s + b.cases_remaining, 0)} cases remaining
            </div>
          </div>
        </div>
      )}

      {/* ── Stock View ── */}
      {view === 'stock' && (
      <>
      {/* Filters */}
      <div className="card">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input
              className="input pl-9"
              placeholder={t('search')}
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <button
            className="btn-secondary flex items-center gap-1.5"
            onClick={() => { setScanFeedback(null); setShowScanner(true) }}
            title="Scan barcode to find product"
          >
            <Camera size={15} /> Scan
          </button>
          <select className="input w-auto" value={category} onChange={e => setCategory(e.target.value)}>
            <option value="">All Categories</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className="input w-auto" value={warehouse} onChange={e => setWarehouse(e.target.value)}>
            <option value="">Both Warehouses</option>
            <option value="WH1">{t('wh1')}</option>
            <option value="WH2">{t('wh2')}</option>
          </select>
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input type="checkbox" checked={lowStockOnly} onChange={e => setLowStockOnly(e.target.checked)} />
            Low Stock Only
          </label>
        </div>
        {scanFeedback && (
          <div className={`mt-3 rounded-xl px-4 py-2.5 flex items-center gap-3 text-sm ${
            scanFeedback.type === 'success' ? 'bg-green-50 border border-green-200 text-green-800' :
            'bg-yellow-50 border border-yellow-200 text-yellow-800'
          }`}>
            {scanFeedback.msg}
            <button onClick={() => setScanFeedback(null)} className="ml-auto opacity-60 hover:opacity-100"><X size={14} /></button>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="table-th">{t('product')}</th>
                <th className="table-th hidden sm:table-cell">{t('category')}</th>
                <th className="table-th text-center">WH1</th>
                <th className="table-th text-center">WH2</th>
                <th className="table-th text-center hidden sm:table-cell">Total</th>
                <th className="table-th hidden sm:table-cell">{t('status')}</th>
                <th className="table-th hidden sm:table-cell">Bin (WH1)</th>
                <th className="table-th hidden md:table-cell">Earliest Expiry</th>
                <th className="table-th hidden md:table-cell">Vendor</th>
                <th className="table-th hidden lg:table-cell">Stock Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} className="table-td text-center text-gray-400 py-8">{t('loading')}</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={9} className="table-td text-center text-gray-400 py-8">{t('noData')}</td></tr>
              ) : filtered.map(item => (
                <tr key={item.sku_id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="table-td">
                    <div className="font-medium text-gray-900">{item.product_name}</div>
                    {lang === 'es' && item.name_es && <div className="text-xs text-gray-400">{item.name_es}</div>}
                    <div className="text-xs text-gray-400">{item.sku_code} · {item.case_size} units/case</div>
                    {/* Mobile: show status badge + total inline */}
                    <div className="sm:hidden flex items-center gap-2 mt-1">
                      {stockBadge(item.stock_status)}
                      <span className="text-xs text-gray-400">Total: <strong className="text-gray-700">{item.total_cases}</strong></span>
                    </div>
                  </td>
                  <td className="table-td hidden sm:table-cell">
                    <span className="badge-neutral">{item.category}</span>
                  </td>
                  <td className="table-td text-center">
                    <span className={`font-semibold ${item.wh1_cases === 0 ? 'text-red-500' : 'text-gray-900'}`}>
                      {item.wh1_cases}
                    </span>
                  </td>
                  <td className="table-td text-center">
                    <span className={`font-semibold ${item.wh2_cases === 0 ? 'text-gray-300' : 'text-blue-700'}`}>
                      {item.wh2_cases}
                    </span>
                  </td>
                  <td className="table-td text-center font-bold text-gray-900 hidden sm:table-cell">{item.total_cases}</td>
                  <td className="table-td hidden sm:table-cell">{stockBadge(item.stock_status)}</td>
                  <td className="table-td hidden sm:table-cell">
                    <BinCell
                      inventoryId={item.wh1_inventory_id}
                      currentBin={item.wh1_bin}
                      onAssigned={load}
                    />
                  </td>
                  <td className="table-td hidden md:table-cell">
                    {item.earliest_expiry ? (
                      <div>
                        <div className="text-xs text-gray-500">{item.earliest_expiry}</div>
                        {expiryBadge(item.expiry_status, item.days_to_expiry)}
                      </div>
                    ) : (
                      <span className="badge-neutral">No Expiry</span>
                    )}
                  </td>
                  <td className="table-td hidden md:table-cell text-gray-500 text-xs">{item.vendor_name || '—'}</td>
                  <td className="table-td hidden lg:table-cell">
                    <div className="flex flex-col gap-1">
                      {item.wh1_cases > 0 && (
                        <div className="flex gap-1">
                          <span className="text-xs text-gray-400">WH1:</span>
                          <button onClick={() => openBlockModal(item, 'WH1')}
                            className="text-xs px-1.5 py-0.5 rounded bg-red-50 text-red-600 hover:bg-red-100 flex items-center gap-0.5 transition-colors">
                            <Lock size={9} /> Block
                          </button>
                        </div>
                      )}
                      {item.wh2_cases > 0 && (
                        <div className="flex gap-1">
                          <span className="text-xs text-gray-400">WH2:</span>
                          <button onClick={() => openBlockModal(item, 'WH2')}
                            className="text-xs px-1.5 py-0.5 rounded bg-red-50 text-red-600 hover:bg-red-100 flex items-center gap-0.5 transition-colors">
                            <Lock size={9} /> Block
                          </button>
                        </div>
                      )}
                      {(item.wh1_blocked > 0 || item.wh2_blocked > 0) && (
                        <div className="flex gap-1">
                          <span className="text-xs text-amber-600">Blocked: {(item.wh1_blocked||0)+(item.wh2_blocked||0)}</span>
                          <button onClick={() => openReleaseModal(item, item.wh1_blocked > 0 ? 'WH1' : 'WH2')}
                            className="text-xs px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100 flex items-center gap-0.5 transition-colors">
                            <Unlock size={9} /> Release
                          </button>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 text-sm text-gray-500">
          Showing {filtered.length} of {items.length} items
        </div>
      </div>
      </>
      )}
    </div>
  )
}
