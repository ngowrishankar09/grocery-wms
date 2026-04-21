import { useEffect, useState, useMemo } from 'react'
import { forecastAPI } from '../api/client'
import { useT } from '../i18n/translations'
import {
  AreaChart, Area, LineChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
  ReferenceLine, CartesianGrid, Legend,
} from 'recharts'
import {
  TrendingUp, ShoppingBag, Search, Zap, CheckCircle,
  ChevronDown, ChevronUp, BarChart2,
} from 'lucide-react'
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

// Build 90-day depletion data from forecast item fields
function buildDepletionPoints(item, horizonDays = 90) {
  const today = new Date()
  const points = []
  for (let d = 0; d <= horizonDays; d++) {
    const dt = new Date(today)
    dt.setDate(dt.getDate() + d)
    const label = dt.toLocaleDateString('en-AU', { month: 'short', day: 'numeric' })
    const stock = Math.max(0, item.total_cases - item.daily_rate * d)
    points.push({ day: d, label, stock: Math.round(stock * 10) / 10 })
  }
  return points
}

// Compact depletion chart rendered inside an expanded row
function DepletionChart({ item }) {
  const points = useMemo(() => buildDepletionPoints(item), [item])
  const maxStock = item.total_cases
  const reorderPt = item.reorder_point

  // Days until crossings
  const daysToReorder = item.daily_rate > 0
    ? Math.max(0, Math.floor((item.total_cases - reorderPt) / item.daily_rate))
    : null
  const daysToStockout = item.daily_rate > 0
    ? Math.floor(item.total_cases / item.daily_rate)
    : null

  const fmtDate = (iso) => iso
    ? new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
    : '—'

  // Tick every ~2 weeks (every 14 days)
  const tickDays = [0, 14, 28, 42, 56, 70, 84]
  const ticks = tickDays.map(d => points[d]?.label).filter(Boolean)

  return (
    <div className="bg-gray-50 border-t border-gray-200 px-6 py-4">
      {/* Header stats */}
      <div className="flex flex-wrap gap-6 mb-4 text-sm">
        <div>
          <span className="text-gray-500">Current stock</span>
          <span className="ml-2 font-bold text-gray-900">{item.total_cases} cases</span>
          <span className="ml-1 text-gray-400">(WH1: {item.wh1_cases} + WH2: {item.wh2_cases})</span>
        </div>
        <div>
          <span className="text-gray-500">Avg sales</span>
          <span className="ml-2 font-bold text-gray-900">{item.avg_monthly_dispatch}/mo</span>
          <span className="ml-1 text-gray-400">({item.daily_rate}/day)</span>
        </div>
        <div>
          <span className="text-gray-500">Reorder point</span>
          <span className="ml-2 font-bold text-orange-600">{reorderPt} cases</span>
          {daysToReorder !== null && (
            <span className="ml-1 text-gray-400">
              → reached in {daysToReorder}d ({fmtDate(item.reorder_pt_date)})
            </span>
          )}
        </div>
        {daysToStockout !== null && daysToStockout <= 120 && (
          <div>
            <span className="text-gray-500">Stockout</span>
            <span className="ml-2 font-bold text-red-600">Day {daysToStockout}</span>
            <span className="ml-1 text-gray-400">({fmtDate(item.stockout_date)})</span>
          </div>
        )}
      </div>

      {item.daily_rate === 0 ? (
        <div className="text-center text-gray-400 py-6 text-sm">
          No sales history — cannot project stock depletion.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={180}>
          <AreaChart data={points} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={`grad-${item.sku_id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.03} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey="label"
              ticks={ticks}
              tick={{ fontSize: 11, fill: '#6b7280' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              domain={[0, Math.ceil(maxStock * 1.1)]}
              tick={{ fontSize: 11, fill: '#6b7280' }}
              axisLine={false}
              tickLine={false}
              width={36}
            />
            <Tooltip
              formatter={(v) => [`${v} cases`, 'Projected stock']}
              contentStyle={{ fontSize: 12, borderRadius: 6, border: '1px solid #e5e7eb' }}
            />
            {/* Reorder point threshold */}
            <ReferenceLine
              y={reorderPt}
              stroke="#f97316"
              strokeDasharray="5 3"
              strokeWidth={1.5}
              label={{ value: `Reorder pt (${reorderPt})`, position: 'insideTopRight', fontSize: 10, fill: '#f97316' }}
            />
            {/* Reorder date vertical line */}
            {daysToReorder !== null && daysToReorder <= 90 && (
              <ReferenceLine
                x={points[daysToReorder]?.label}
                stroke="#f97316"
                strokeDasharray="4 3"
                strokeWidth={1.5}
              />
            )}
            {/* Stockout vertical line */}
            {daysToStockout !== null && daysToStockout <= 90 && (
              <ReferenceLine
                x={points[daysToStockout]?.label}
                stroke="#ef4444"
                strokeDasharray="4 3"
                strokeWidth={1.5}
                label={{ value: '⚠ Stockout', position: 'top', fontSize: 10, fill: '#ef4444' }}
              />
            )}
            <Area
              type="monotone"
              dataKey="stock"
              stroke="#3b82f6"
              strokeWidth={2}
              fill={`url(#grad-${item.sku_id})`}
              dot={false}
              activeDot={{ r: 4 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
      <p className="text-xs text-gray-400 mt-2">
        📈 90-day projection based on 3-month weighted avg sales · Orange dashed = reorder point · Red dashed = stockout
      </p>
    </div>
  )
}

export default function Forecasting({ lang }) {
  const t = useT(lang)
  const navigate = useNavigate()
  const [forecast, setForecast] = useState([])
  const [reorderList, setReorderList] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [view, setView] = useState('table')          // table | reorder
  const [expandedSku, setExpandedSku] = useState(null)  // sku_id of expanded row
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
    !search ||
    f.product_name.toLowerCase().includes(search.toLowerCase()) ||
    f.sku_code.toLowerCase().includes(search.toLowerCase())
  )

  const MONTHS = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

  const toggleExpand = (skuId) =>
    setExpandedSku(prev => (prev === skuId ? null : skuId))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">{t('forecasting')}</h2>
        <div className="flex gap-2">
          <button
            className={view === 'table' ? 'btn-primary' : 'btn-secondary'}
            onClick={() => setView('table')}
          >
            <TrendingUp size={16} className="inline mr-1" /> Forecast
          </button>
          <button
            className={view === 'reorder' ? 'btn-primary' : 'btn-secondary'}
            onClick={() => setView('reorder')}
          >
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
              <input
                className="input pl-9"
                placeholder={t('search')}
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          </div>

          {/* Summary banner */}
          {!loading && forecast.length > 0 && (() => {
            const urgent   = forecast.filter(f => f.reorder_status === 'urgent').length
            const orderNow = forecast.filter(f => f.reorder_status === 'order_now').length
            const orderSoon= forecast.filter(f => f.reorder_status === 'order_soon').length
            return (urgent + orderNow + orderSoon) > 0 ? (
              <div className="grid grid-cols-3 gap-3">
                {urgent > 0 && (
                  <div className="card bg-red-50 border border-red-200 text-center py-3">
                    <div className="text-2xl font-bold text-red-600">{urgent}</div>
                    <div className="text-xs text-red-500 font-medium">Urgent — Order Today</div>
                  </div>
                )}
                {orderNow > 0 && (
                  <div className="card bg-orange-50 border border-orange-200 text-center py-3">
                    <div className="text-2xl font-bold text-orange-600">{orderNow}</div>
                    <div className="text-xs text-orange-500 font-medium">Order Now</div>
                  </div>
                )}
                {orderSoon > 0 && (
                  <div className="card bg-yellow-50 border border-yellow-200 text-center py-3">
                    <div className="text-2xl font-bold text-yellow-600">{orderSoon}</div>
                    <div className="text-xs text-yellow-500 font-medium">Order Soon</div>
                  </div>
                )}
              </div>
            ) : null
          })()}

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
                    <th className="table-th text-center">Stockout</th>
                    <th className="table-th text-center">{t('suggestedQty')}</th>
                    <th className="table-th">Next 3 Months</th>
                    <th className="table-th">{t('status')}</th>
                    <th className="table-th text-center w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={10} className="table-td text-center py-8 text-gray-400">
                        {t('loading')}
                      </td>
                    </tr>
                  ) : filtered.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="table-td text-center py-8 text-gray-400">
                        {t('noData')}
                      </td>
                    </tr>
                  ) : filtered.map((item) => {
                    const isExpanded = expandedSku === item.sku_id
                    const fmtStockout = item.stockout_date
                      ? new Date(item.stockout_date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
                      : null
                    return (
                      <>
                        <tr
                          key={item.sku_id}
                          className={`border-b hover:bg-gray-50 cursor-pointer ${isExpanded ? 'bg-blue-50' : ''}`}
                          onClick={() => toggleExpand(item.sku_id)}
                        >
                          <td className="table-td">
                            <div className="font-medium">{item.product_name}</div>
                            <div className="text-xs text-gray-400">
                              {item.sku_code} · {item.category}
                            </div>
                            {item.vendor_name && (
                              <div className="text-xs text-gray-400">{item.vendor_name}</div>
                            )}
                          </td>
                          <td className="table-td text-center font-medium">{item.wh1_cases}</td>
                          <td className="table-td text-center text-blue-700 font-medium">{item.wh2_cases}</td>
                          <td className="table-td text-center">
                            {item.avg_monthly_dispatch > 0 ? `${item.avg_monthly_dispatch}/mo` : '—'}
                          </td>
                          <td className="table-td text-center">
                            {item.days_of_stock !== null ? (
                              <span className={
                                item.days_of_stock <= 14
                                  ? 'text-red-600 font-bold'
                                  : item.days_of_stock <= 30
                                  ? 'text-yellow-600 font-medium'
                                  : 'text-gray-700'
                              }>
                                {item.days_of_stock}d
                              </span>
                            ) : '—'}
                          </td>
                          <td className="table-td text-center text-sm">
                            {fmtStockout ? (
                              <span className={
                                item.days_of_stock !== null && item.days_of_stock <= 30
                                  ? 'text-red-600 font-semibold'
                                  : 'text-gray-600'
                              }>
                                {fmtStockout}
                              </span>
                            ) : '—'}
                          </td>
                          <td className="table-td text-center font-medium text-blue-700">
                            {item.suggested_reorder_qty}
                          </td>
                          <td className="table-td">
                            <div className="flex gap-1">
                              {item.projections.map((p, pi) => (
                                <div key={pi} className="text-center">
                                  <div className="text-xs text-gray-400">{MONTHS[p.month]}</div>
                                  <div className="text-xs font-medium bg-blue-50 px-2 py-0.5 rounded">
                                    {p.projected_cases}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </td>
                          <td className="table-td">{reorderBadge(item.reorder_status)}</td>
                          <td className="table-td text-center text-gray-400">
                            {isExpanded
                              ? <ChevronUp size={16} />
                              : <ChevronDown size={16} />
                            }
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr key={`chart-${item.sku_id}`}>
                            <td colSpan={10} className="p-0">
                              <DepletionChart item={item} />
                            </td>
                          </tr>
                        )}
                      </>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
          <p className="text-xs text-gray-400 text-center">
            <BarChart2 size={12} className="inline mr-1" />
            Click any row to expand a 90-day stock depletion chart
          </p>
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
                  Auto-generate draft Purchase Orders for all vendors with urgent / order-now / order-soon items.
                </p>
                {genResult && !genResult.error && (
                  <p className="text-sm text-green-700 font-medium mt-1 flex items-center gap-1">
                    <CheckCircle size={14} />
                    {genResult.created} PO{genResult.created > 1 ? 's' : ''} created — redirecting to Purchase Orders…
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
                <span className="text-sm text-gray-500">
                  {vendor.items.length} SKUs · {vendor.total_cases} cases total
                </span>
              </div>
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="table-th">{t('product')}</th>
                    <th className="table-th text-center">Current Stock</th>
                    <th className="table-th text-center">Avg / Month</th>
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
                      <td className="table-td text-center font-bold text-blue-700">
                        {item.suggested_qty} cases
                      </td>
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
