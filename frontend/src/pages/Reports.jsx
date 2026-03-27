import { useState } from 'react'
import { reportsAPI } from '../api/client'
import {
  FileSpreadsheet, Download, RefreshCw, Package, TrendingDown,
  Calendar, AlertTriangle, ArrowDownUp, ClipboardList
} from 'lucide-react'

// ── Tiny date input component ───────────────────────────────
function DateRange({ from, to, onFrom, onTo }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <label className="text-gray-500 whitespace-nowrap">From</label>
      <input type="date" className="input py-1.5 text-sm w-36" value={from} onChange={e => onFrom(e.target.value)} />
      <label className="text-gray-500">To</label>
      <input type="date" className="input py-1.5 text-sm w-36" value={to} onChange={e => onTo(e.target.value)} />
    </div>
  )
}

// ── Report Card ─────────────────────────────────────────────
function ReportCard({ icon: Icon, iconBg, title, description, children, onExport, exporting }) {
  return (
    <div className="card space-y-4">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className={`p-2.5 rounded-xl ${iconBg}`}>
            <Icon size={20} className="text-white" />
          </div>
          <div>
            <h3 className="font-bold text-gray-900">{title}</h3>
            <p className="text-xs text-gray-400 mt-0.5">{description}</p>
          </div>
        </div>
        <button
          className="btn-primary flex items-center gap-2 text-sm py-2 px-4"
          onClick={onExport}
          disabled={exporting}
        >
          {exporting
            ? <RefreshCw size={14} className="animate-spin" />
            : <Download size={14} />
          }
          {exporting ? 'Generating…' : 'Export Excel'}
        </button>
      </div>
      {children}
    </div>
  )
}

// ── Status badge helper ──────────────────────────────────────
function StatusBadge({ status }) {
  if (status === 'Stockout')  return <span className="badge-danger">Stockout</span>
  if (status === 'Low Stock') return <span className="badge-warning">Low Stock</span>
  if (status === 'Overstock') return <span className="badge-neutral text-purple-700 bg-purple-50">Overstock</span>
  return <span className="badge-ok">OK</span>
}

function UrgencyBadge({ urgency }) {
  if (urgency === 'EXPIRED')  return <span className="badge-danger">Expired</span>
  if (urgency === 'CRITICAL') return <span className="badge-danger">Critical</span>
  if (urgency === 'WARNING')  return <span className="badge-warning">Warning</span>
  return <span className="badge-neutral">Monitor</span>
}

// ── Main page ────────────────────────────────────────────────
export default function Reports() {
  const today = new Date().toISOString().split('T')[0]
  const monthStart = today.substring(0, 8) + '01'

  const [invData,      setInvData]      = useState(null)
  const [dispData,     setDispData]     = useState(null)
  const [rcvData,      setRcvData]      = useState(null)
  const [lowData,      setLowData]      = useState(null)
  const [expiryData,   setExpiryData]   = useState(null)

  const [dispFrom, setDispFrom] = useState(monthStart)
  const [dispTo,   setDispTo]   = useState(today)
  const [rcvFrom,  setRcvFrom]  = useState(monthStart)
  const [rcvTo,    setRcvTo]    = useState(today)
  const [expiryDays, setExpiryDays] = useState(90)

  const [loading, setLoading] = useState({})
  const [exporting, setExporting] = useState({})
  const [error, setError] = useState('')

  const setLoad = (key, val) => setLoading(p => ({ ...p, [key]: val }))
  const setExp  = (key, val) => setExporting(p => ({ ...p, [key]: val }))

  const handleExport = async (key, exportFn) => {
    setExp(key, true)
    try { await exportFn() } catch (e) { setError(e.message || 'Export failed') }
    setExp(key, false)
  }

  const loadInventory = async () => {
    setLoad('inv', true)
    try { const r = await reportsAPI.inventorySnapshot(); setInvData(r.data) } catch {}
    setLoad('inv', false)
  }
  const loadDispatch = async () => {
    setLoad('disp', true)
    try { const r = await reportsAPI.dispatchHistory(dispFrom, dispTo); setDispData(r.data) } catch {}
    setLoad('disp', false)
  }
  const loadReceiving = async () => {
    setLoad('rcv', true)
    try { const r = await reportsAPI.receivingHistory(rcvFrom, rcvTo); setRcvData(r.data) } catch {}
    setLoad('rcv', false)
  }
  const loadLowStock = async () => {
    setLoad('low', true)
    try { const r = await reportsAPI.lowStock(); setLowData(r.data) } catch {}
    setLoad('low', false)
  }
  const loadExpiry = async () => {
    setLoad('expiry', true)
    try { const r = await reportsAPI.expiryReport(expiryDays); setExpiryData(r.data) } catch {}
    setLoad('expiry', false)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Reports & Exports</h2>
          <p className="text-sm text-gray-400 mt-1">Preview data and export to Excel for accounts, audits or suppliers</p>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-700 text-sm flex items-center justify-between">
          {error}
          <button onClick={() => setError('')} className="text-red-400 hover:text-red-600">✕</button>
        </div>
      )}

      {/* ── 1. INVENTORY SNAPSHOT ── */}
      <ReportCard
        icon={Package}
        iconBg="bg-blue-600"
        title="Inventory Snapshot"
        description="Current stock levels for all SKUs — WH1, WH2, status and earliest expiry"
        onExport={() => handleExport('inv_exp', () => reportsAPI.exportInventorySnapshot())}
        exporting={exporting.inv_exp}
      >
        <div className="flex items-center gap-3">
          <button
            className="btn-secondary flex items-center gap-2 text-sm"
            onClick={loadInventory}
            disabled={loading.inv}
          >
            {loading.inv ? <RefreshCw size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            {loading.inv ? 'Loading…' : 'Preview'}
          </button>
          {invData && <span className="text-xs text-gray-400">{invData.rows.length} SKUs · as of {invData.as_of}</span>}
        </div>
        {invData && (
          <div className="overflow-x-auto rounded-xl border border-gray-100 max-h-72">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  {['SKU','Product','Category','WH1','WH2','Total','Reorder At','Status','Earliest Expiry'].map(h => (
                    <th key={h} className="table-th whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {invData.rows.map((r, i) => (
                  <tr key={i} className="border-b hover:bg-gray-50">
                    <td className="table-td font-mono text-xs text-blue-700">{r.sku_code}</td>
                    <td className="table-td font-medium max-w-[200px] truncate">{r.product_name}</td>
                    <td className="table-td"><span className="badge-neutral text-xs">{r.category}</span></td>
                    <td className="table-td text-center">{r.wh1_cases}</td>
                    <td className="table-td text-center text-blue-700">{r.wh2_cases}</td>
                    <td className="table-td text-center font-bold">{r.total_cases}</td>
                    <td className="table-td text-center text-gray-400">{r.reorder_point}</td>
                    <td className="table-td"><StatusBadge status={r.status} /></td>
                    <td className="table-td text-xs text-gray-500">{r.earliest_expiry}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ReportCard>

      {/* ── 2. DISPATCH HISTORY ── */}
      <ReportCard
        icon={ArrowDownUp}
        iconBg="bg-teal-600"
        title="Dispatch History"
        description="All dispatches in a date range — SKU, cases, shortfalls"
        onExport={() => handleExport('disp_exp', () => reportsAPI.exportDispatchHistory(dispFrom, dispTo))}
        exporting={exporting.disp_exp}
      >
        <div className="flex flex-wrap items-center gap-3">
          <DateRange from={dispFrom} to={dispTo} onFrom={setDispFrom} onTo={setDispTo} />
          <button
            className="btn-secondary flex items-center gap-2 text-sm"
            onClick={loadDispatch}
            disabled={loading.disp}
          >
            {loading.disp ? <RefreshCw size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            {loading.disp ? 'Loading…' : 'Preview'}
          </button>
          {dispData && <span className="text-xs text-gray-400">{dispData.rows.length} lines</span>}
        </div>
        {dispData && (
          <div className="overflow-x-auto rounded-xl border border-gray-100 max-h-72">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  {['Date','Reference','SKU','Product','Requested','Fulfilled','Shortfall'].map(h => (
                    <th key={h} className="table-th whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dispData.rows.map((r, i) => (
                  <tr key={i} className={`border-b hover:bg-gray-50 ${r.shortfall > 0 ? 'bg-red-50' : ''}`}>
                    <td className="table-td text-xs whitespace-nowrap">{r.dispatch_date}</td>
                    <td className="table-td font-mono text-xs text-blue-700">{r.ref}</td>
                    <td className="table-td font-mono text-xs">{r.sku_code}</td>
                    <td className="table-td max-w-[160px] truncate">{r.product_name}</td>
                    <td className="table-td text-center">{r.cases_requested}</td>
                    <td className="table-td text-center font-medium">{r.cases_fulfilled}</td>
                    <td className="table-td text-center">
                      {r.shortfall > 0
                        ? <span className="text-red-600 font-bold">-{r.shortfall}</span>
                        : <span className="text-green-500">✓</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ReportCard>

      {/* ── 3. RECEIVING HISTORY ── */}
      <ReportCard
        icon={ClipboardList}
        iconBg="bg-green-600"
        title="Receiving / GRN History"
        description="All goods received (batches) in a date range — quantities, expiry dates, supplier refs"
        onExport={() => handleExport('rcv_exp', () => reportsAPI.exportReceivingHistory(rcvFrom, rcvTo))}
        exporting={exporting.rcv_exp}
      >
        <div className="flex flex-wrap items-center gap-3">
          <DateRange from={rcvFrom} to={rcvTo} onFrom={setRcvFrom} onTo={setRcvTo} />
          <button
            className="btn-secondary flex items-center gap-2 text-sm"
            onClick={loadReceiving}
            disabled={loading.rcv}
          >
            {loading.rcv ? <RefreshCw size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            {loading.rcv ? 'Loading…' : 'Preview'}
          </button>
          {rcvData && <span className="text-xs text-gray-400">{rcvData.rows.length} batches</span>}
        </div>
        {rcvData && (
          <div className="overflow-x-auto rounded-xl border border-gray-100 max-h-72">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  {['Date','Batch','SKU','Product','Received','Remaining','WH','Expiry','Supplier Ref'].map(h => (
                    <th key={h} className="table-th whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rcvData.rows.map((r, i) => (
                  <tr key={i} className="border-b hover:bg-gray-50">
                    <td className="table-td text-xs whitespace-nowrap">{r.received_date}</td>
                    <td className="table-td font-mono text-xs text-gray-500">{r.batch_code}</td>
                    <td className="table-td font-mono text-xs text-blue-700">{r.sku_code}</td>
                    <td className="table-td max-w-[160px] truncate">{r.product_name}</td>
                    <td className="table-td text-center">{r.cases_received}</td>
                    <td className="table-td text-center font-medium">{r.cases_remaining}</td>
                    <td className="table-td text-center"><span className="badge-neutral text-xs">{r.warehouse}</span></td>
                    <td className="table-td text-xs">
                      {r.days_to_expiry !== null && r.days_to_expiry <= 30
                        ? <span className="text-red-600 font-bold">{r.expiry_date}</span>
                        : r.expiry_date}
                    </td>
                    <td className="table-td text-xs text-gray-400">{r.supplier_ref || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ReportCard>

      {/* ── 4. LOW STOCK / REORDER ── */}
      <ReportCard
        icon={TrendingDown}
        iconBg="bg-orange-500"
        title="Low Stock & Reorder Report"
        description="All SKUs at or below their reorder point — what to order and from which vendor"
        onExport={() => handleExport('low_exp', () => reportsAPI.exportLowStock())}
        exporting={exporting.low_exp}
      >
        <div className="flex items-center gap-3">
          <button
            className="btn-secondary flex items-center gap-2 text-sm"
            onClick={loadLowStock}
            disabled={loading.low}
          >
            {loading.low ? <RefreshCw size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            {loading.low ? 'Loading…' : 'Preview'}
          </button>
          {lowData && (
            <span className="text-xs text-gray-400">
              {lowData.rows.filter(r => r.status === 'Stockout').length} stockouts,{' '}
              {lowData.rows.filter(r => r.status === 'Low Stock').length} low stock
            </span>
          )}
        </div>
        {lowData && (
          <div className="overflow-x-auto rounded-xl border border-gray-100 max-h-72">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  {['SKU','Product','Category','Current','Reorder At','Order Qty','Lead Days','Vendor','Status'].map(h => (
                    <th key={h} className="table-th whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lowData.rows.map((r, i) => (
                  <tr key={i} className={`border-b hover:bg-gray-50 ${r.status === 'Stockout' ? 'bg-red-50' : 'bg-yellow-50'}`}>
                    <td className="table-td font-mono text-xs text-blue-700">{r.sku_code}</td>
                    <td className="table-td max-w-[180px] truncate">{r.product_name}</td>
                    <td className="table-td"><span className="badge-neutral text-xs">{r.category}</span></td>
                    <td className="table-td text-center font-bold text-red-600">{r.total_cases}</td>
                    <td className="table-td text-center">{r.reorder_point}</td>
                    <td className="table-td text-center text-green-700 font-medium">{r.reorder_qty}</td>
                    <td className="table-td text-center text-gray-500">{r.lead_time_days}d</td>
                    <td className="table-td text-xs text-gray-500">{r.vendor_name}</td>
                    <td className="table-td"><StatusBadge status={r.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ReportCard>

      {/* ── 5. EXPIRY REPORT ── */}
      <ReportCard
        icon={Calendar}
        iconBg="bg-red-500"
        title="Expiry Report"
        description="Batches expiring within a set window — critical for food compliance"
        onExport={() => handleExport('exp_exp', () => reportsAPI.exportExpiryReport(expiryDays))}
        exporting={exporting.exp_exp}
      >
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-sm">
            <label className="text-gray-500 whitespace-nowrap">Show next</label>
            <select
              className="input py-1.5 text-sm w-28"
              value={expiryDays}
              onChange={e => setExpiryDays(parseInt(e.target.value))}
            >
              <option value={30}>30 days</option>
              <option value={60}>60 days</option>
              <option value={90}>90 days</option>
              <option value={180}>6 months</option>
              <option value={365}>1 year</option>
            </select>
          </div>
          <button
            className="btn-secondary flex items-center gap-2 text-sm"
            onClick={loadExpiry}
            disabled={loading.expiry}
          >
            {loading.expiry ? <RefreshCw size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            {loading.expiry ? 'Loading…' : 'Preview'}
          </button>
          {expiryData && (
            <div className="flex items-center gap-3 text-xs">
              <span className="text-red-600 font-semibold">{expiryData.expired_count} expired</span>
              <span className="text-orange-600 font-semibold">{expiryData.critical_count} critical</span>
              <span className="text-yellow-600 font-semibold">{expiryData.warning_count} warning</span>
            </div>
          )}
        </div>
        {expiryData && (
          <div className="overflow-x-auto rounded-xl border border-gray-100 max-h-72">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  {['Expiry Date','Days Left','Urgency','Batch','SKU','Product','Cases','WH'].map(h => (
                    <th key={h} className="table-th whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {expiryData.rows.map((r, i) => (
                  <tr key={i} className={`border-b hover:bg-gray-50 ${r.urgency === 'EXPIRED' || r.urgency === 'CRITICAL' ? 'bg-red-50' : r.urgency === 'WARNING' ? 'bg-yellow-50' : ''}`}>
                    <td className="table-td text-xs font-medium whitespace-nowrap">{r.expiry_date}</td>
                    <td className="table-td text-center font-bold text-red-600">{r.days_to_expiry}</td>
                    <td className="table-td"><UrgencyBadge urgency={r.urgency} /></td>
                    <td className="table-td font-mono text-xs text-gray-400">{r.batch_code}</td>
                    <td className="table-td font-mono text-xs text-blue-700">{r.sku_code}</td>
                    <td className="table-td max-w-[160px] truncate">{r.product_name}</td>
                    <td className="table-td text-center font-medium">{r.cases_remaining}</td>
                    <td className="table-td text-center"><span className="badge-neutral text-xs">{r.warehouse}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ReportCard>

      {/* ── 6. ADJUSTMENTS / WRITE-OFFS ── */}
      <ReportCard
        icon={FileSpreadsheet}
        iconBg="bg-gray-600"
        title="Stock Adjustments & Write-offs"
        description="Full audit trail of all manual stock changes, write-offs, and count corrections"
        onExport={() => handleExport('adj_exp', () => reportsAPI.exportAdjustments())}
        exporting={exporting.adj_exp}
      >
        <p className="text-xs text-gray-400">Export directly — this report is always up to date.</p>
      </ReportCard>

    </div>
  )
}
