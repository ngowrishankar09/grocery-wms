import { useEffect, useState } from 'react'
import { forecastAPI } from '../api/client'
import { useT } from '../i18n/translations'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { TrendingUp, ShoppingBag, Search, Zap, CheckCircle } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

const reorderBadge = (status) => {
  const map = {
    urgent:     <span className="badge-danger">🚨 Urgent</span>,
    order_now:  <span className="badge-danger">🔴 Order Now</span>,
    order_soon: <span className="badge-warning">🟡 Order Soon</span>,
    monitor:    <span className="badge-blue">👀 Monitor</span>,
    ok:         <span className="badge-ok">✅ OK</span>,
    no_data:    <span className="badge-neutral">No Data</span>,
  }
  return map[status] || <span className="badge-neutral">{status}</span>
}

export default function Forecasting({ lang }) {
  const t = useT(lang)
  const navigate = useNavigate()
  const [forecast, setForecast] = useState([])
  const [reorderList, setReorderList] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [view, setView] = useState('table')  // table | reorder
  const [generating, setGenerating] = useState(false)
  const [genResult, setGenResult] = useState(null)

  useEffect(() => {
    Promise.all([
      forecastAPI.list().then(r => setForecast(r.data)),
      forecastAPI.reorderList().then(r => setReorderList(r.data)),
    ]).finally(() => setLoading(false))
  }, [])

  const handleGeneratePOs = async () => {
    setGenerating(true)
    setGenResult(null)
    try {
      const r = await forecastAPI.generatePOs()
      setGenResult(r.data)
      if (r.data.created > 0) {
        setTimeout(() => navigate('/purchase-orders'), 2000)
      }
    } catch (err) {
      setGenResult({ error: err?.response?.data?.detail || 'Failed to generate POs' })
    }
    setGenerating(false)
  }

  const filtered = forecast.filter(f =>
    !search || f.product_name.toLowerCase().includes(search.toLowerCase()) || f.sku_code.toLowerCase().includes(search.toLowerCase())
  )

  const MONTHS = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">{t('forecasting')}</h2>
        <div className="flex gap-2">
          <button className={view === 'table' ? 'btn-primary' : 'btn-secondary'} onClick={() => setView('table')}>
            <TrendingUp size={16} className="inline mr-1" /> Forecast
          </button>
          <button className={view === 'reorder' ? 'btn-primary' : 'btn-secondary'} onClick={() => setView('reorder')}>
            <ShoppingBag size={16} className="inline mr-1" /> {t('reorderList')}
          </button>
        </div>
      </div>

      {view === 'table' && (
        <>
          {/* Search */}
          <div className="card py-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
              <input className="input pl-9" placeholder={t('search')} value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          </div>

          {/* Forecast Table */}
          <div className="card p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="table-th">{t('product')}</th>
                    <th className="table-th text-center">WH1</th>
                    <th className="table-th text-center">WH2</th>
                    <th className="table-th text-center">{t('avgMonthly')}</th>
                    <th className="table-th text-center">{t('daysOfStock')}</th>
                    <th className="table-th text-center">{t('suggestedQty')}</th>
                    <th className="table-th">Next 3 Months Projection</th>
                    <th className="table-th">{t('status')}</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={8} className="table-td text-center py-8 text-gray-400">{t('loading')}</td></tr>
                  ) : filtered.length === 0 ? (
                    <tr><td colSpan={8} className="table-td text-center py-8 text-gray-400">{t('noData')}</td></tr>
                  ) : filtered.map((item, i) => (
                    <tr key={i} className="border-b hover:bg-gray-50">
                      <td className="table-td">
                        <div className="font-medium">{item.product_name}</div>
                        <div className="text-xs text-gray-400">{item.sku_code} · {item.category}</div>
                        {item.vendor_name && <div className="text-xs text-gray-400">{item.vendor_name}</div>}
                      </td>
                      <td className="table-td text-center font-medium">{item.wh1_cases}</td>
                      <td className="table-td text-center text-blue-700 font-medium">{item.wh2_cases}</td>
                      <td className="table-td text-center">
                        {item.avg_monthly_dispatch > 0 ? `${item.avg_monthly_dispatch}/mo` : '—'}
                      </td>
                      <td className="table-td text-center">
                        {item.days_of_stock !== null ? (
                          <span className={item.days_of_stock <= 14 ? 'text-red-600 font-bold' : item.days_of_stock <= 30 ? 'text-yellow-600 font-medium' : 'text-gray-700'}>
                            {item.days_of_stock}d
                          </span>
                        ) : '—'}
                      </td>
                      <td className="table-td text-center font-medium text-blue-700">{item.suggested_reorder_qty}</td>
                      <td className="table-td">
                        <div className="flex gap-1">
                          {item.projections.map((p, pi) => (
                            <div key={pi} className="text-center">
                              <div className="text-xs text-gray-400">{MONTHS[p.month]}</div>
                              <div className="text-xs font-medium bg-blue-50 px-2 py-0.5 rounded">{p.projected_cases}</div>
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="table-td">{reorderBadge(item.reorder_status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {view === 'reorder' && (
        <div className="space-y-4">
          {/* Generate POs banner */}
          {reorderList.length > 0 && (
            <div className="card bg-blue-50 border border-blue-200 flex items-center justify-between gap-4">
              <div>
                <p className="font-semibold text-blue-900">
                  {reorderList.length} vendor{reorderList.length > 1 ? 's' : ''} need restocking
                </p>
                <p className="text-sm text-blue-700 mt-0.5">
                  Auto-generate draft Purchase Orders for all vendors with urgent/order-now/order-soon items.
                </p>
                {genResult && !genResult.error && (
                  <p className="text-sm text-green-700 font-medium mt-1 flex items-center gap-1">
                    <CheckCircle size={14} /> {genResult.created} PO{genResult.created > 1 ? 's' : ''} created — redirecting to Purchase Orders…
                  </p>
                )}
                {genResult?.error && (
                  <p className="text-sm text-red-600 mt-1">{genResult.error}</p>
                )}
              </div>
              <button
                onClick={handleGeneratePOs}
                disabled={generating}
                className="btn-primary whitespace-nowrap flex items-center gap-2"
              >
                <Zap size={15} />
                {generating ? 'Generating…' : 'Generate POs'}
              </button>
            </div>
          )}

          {reorderList.length === 0 ? (
            <div className="card text-center text-gray-400 py-12">
              <TrendingUp size={40} className="mx-auto mb-3 text-gray-300" />
              <p>No reorder needed right now. All stock levels are healthy!</p>
            </div>
          ) : reorderList.map((vendor, i) => (
            <div key={i} className="card">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-gray-900 text-lg">📦 {vendor.vendor}</h3>
                <span className="text-sm text-gray-500">{vendor.items.length} SKUs · {vendor.total_cases} cases total</span>
              </div>
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="table-th">{t('product')}</th>
                    <th className="table-th text-center">Current Stock</th>
                    <th className="table-th text-center">Avg/Month</th>
                    <th className="table-th text-center">Order Qty</th>
                    <th className="table-th">Priority</th>
                  </tr>
                </thead>
                <tbody>
                  {vendor.items.map((item, j) => (
                    <tr key={j} className="border-b hover:bg-gray-50">
                      <td className="table-td">
                        <div className="font-medium">{item.product_name}</div>
                        <div className="text-xs text-gray-400">{item.sku_code}</div>
                      </td>
                      <td className="table-td text-center">{item.current_stock} cases</td>
                      <td className="table-td text-center">{item.avg_monthly} cases</td>
                      <td className="table-td text-center font-bold text-blue-700">{item.suggested_qty} cases</td>
                      <td className="table-td">{reorderBadge(item.status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
