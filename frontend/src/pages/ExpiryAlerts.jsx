import { useState, useEffect } from 'react'
import { AlertTriangle, Clock, Package, RefreshCw, Thermometer } from 'lucide-react'
import { reportAPI } from '../api/client'

const PERIODS = [
  { label: '7 days', value: 7 },
  { label: '14 days', value: 14 },
  { label: '30 days', value: 30 },
  { label: '60 days', value: 60 },
]

function rowBg(status) {
  if (status === 'Expired')  return 'bg-red-50 hover:bg-red-100'
  if (status === 'Critical') return 'bg-orange-50 hover:bg-orange-100'
  return 'hover:bg-yellow-50'
}

function statusBadge(status) {
  if (status === 'Expired')  return 'bg-red-100 text-red-700'
  if (status === 'Critical') return 'bg-orange-100 text-orange-700'
  return 'bg-yellow-100 text-yellow-700'
}

function daysLabel(n) {
  if (n < 0) return `${Math.abs(n)} days ago`
  if (n === 0) return 'Expires today'
  return `${n} days`
}

export default function ExpiryAlerts() {
  const [data, setData]     = useState(null)
  const [days, setDays]     = useState(30)
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    try {
      const r = await reportAPI.expiryAlerts(days)
      setData(r.data)
    } catch { setData(null) }
    setLoading(false)
  }

  useEffect(() => { load() }, [days])

  const cards = data ? [
    { label: 'Already Expired', value: data.expired, color: 'border-red-500 bg-red-50', text: 'text-red-700', icon: AlertTriangle },
    { label: `Critical (≤7 days)`, value: data.critical, color: 'border-orange-400 bg-orange-50', text: 'text-orange-700', icon: Thermometer },
    { label: `Warning (≤${days} days)`, value: data.warning, color: 'border-yellow-400 bg-yellow-50', text: 'text-yellow-700', icon: Clock },
  ] : []

  return (
    <div className="p-6 space-y-4">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <AlertTriangle className="w-6 h-6 text-orange-500" /> Expiry Alerts
          </h1>
          <p className="text-sm text-gray-500 mt-1">Batches expiring soon — act before stock becomes unsellable</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
            {PERIODS.map(p => (
              <button key={p.value} onClick={() => setDays(p.value)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${days === p.value ? 'bg-white text-orange-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                {p.label}
              </button>
            ))}
          </div>
          <button onClick={load} className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50">
            <RefreshCw className={`w-4 h-4 text-gray-500 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      {data && (
        <div className="grid grid-cols-3 gap-4">
          {cards.map(({ label, value, color, text, icon: Icon }) => (
            <div key={label} className={`rounded-xl border-l-4 border p-4 ${color}`}>
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm font-medium text-gray-600">{label}</p>
                  <p className={`text-4xl font-bold mt-2 ${text}`}>{value}</p>
                  <p className="text-xs text-gray-500 mt-1">{value === 1 ? 'batch' : 'batches'}</p>
                </div>
                <Icon className={`w-8 h-8 ${text} opacity-40`} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="text-center py-16 text-gray-400">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-3 text-gray-300" />
            <p>Loading expiry data...</p>
          </div>
        ) : !data || data.batches.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <Package className="w-12 h-12 mx-auto mb-3 text-gray-200" />
            <p className="font-medium">No batches expiring within {days} days</p>
            <p className="text-sm mt-1">All stock is within safe expiry windows</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['Product', 'SKU', 'Batch Code', 'Warehouse', 'Cases Left', 'Expiry Date', 'Days', 'Status'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.batches.map(b => (
                <tr key={b.batch_id} className={`${rowBg(b.status)} transition-colors`}>
                  <td className="px-4 py-3 font-medium text-gray-900">{b.product_name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">{b.sku_code}</td>
                  <td className="px-4 py-3 font-mono text-xs text-blue-600">{b.batch_code}</td>
                  <td className="px-4 py-3 text-gray-500">{b.warehouse}</td>
                  <td className="px-4 py-3">
                    <span className="font-semibold text-gray-800">{b.cases_remaining}</span>
                    <span className="text-gray-400 ml-1 text-xs">cases</span>
                  </td>
                  <td className="px-4 py-3 text-gray-700">{b.expiry_date}</td>
                  <td className={`px-4 py-3 font-semibold ${b.days_until_expiry < 0 ? 'text-red-700' : b.days_until_expiry <= 7 ? 'text-orange-700' : 'text-yellow-700'}`}>
                    {daysLabel(b.days_until_expiry)}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusBadge(b.status)}`}>
                      {b.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {data && (
        <p className="text-xs text-gray-400 text-right">As of {data.as_of} · Showing batches expiring within {data.days_ahead} days</p>
      )}
    </div>
  )
}
