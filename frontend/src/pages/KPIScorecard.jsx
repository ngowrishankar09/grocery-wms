import { useState, useEffect } from 'react'
import { TrendingUp, Package, Clock, DollarSign, Target, AlertTriangle, RefreshCw, BarChart2 } from 'lucide-react'
import { kpiAPI } from '../api/client'

const PERIODS = [
  { label: '7 days', value: 7 },
  { label: '30 days', value: 30 },
  { label: '60 days', value: 60 },
  { label: '90 days', value: 90 },
]

function KPICard({ icon: Icon, title, value, subtitle, color, suffix = '', format }) {
  const display = value === null || value === undefined ? 'N/A' :
    format === 'money' ? `$${Number(value).toLocaleString('en-US', {minimumFractionDigits:2})}` :
    format === 'percent' ? `${value}%` :
    `${value}${suffix}`
  return (
    <div className={`bg-white rounded-xl border-l-4 ${color} border border-gray-200 p-5 shadow-sm`}>
      <div className="flex justify-between items-start">
        <div>
          <p className="text-sm font-medium text-gray-500">{title}</p>
          <p className="text-3xl font-bold text-gray-900 mt-2">{display}</p>
          {subtitle && <p className="text-xs text-gray-400 mt-1">{subtitle}</p>}
        </div>
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color.replace('border-l-4 border-', 'bg-').replace('border-', 'bg-').split(' ')[0]}-100`}>
          <Icon className={`w-5 h-5 ${color.replace('border-l-', 'text-').split(' ')[0]}`} />
        </div>
      </div>
    </div>
  )
}

export default function KPIScorecard() {
  const [period, setPeriod] = useState(30)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadKPI() }, [period])

  const loadKPI = async () => {
    setLoading(true)
    try {
      const r = await kpiAPI.scorecard(period)
      setData(r.data)
    } catch {}
    setLoading(false)
  }

  const getFillColor = (val) => {
    if (val === null || val === undefined) return 'text-gray-400'
    if (val >= 95) return 'text-green-600'
    if (val >= 85) return 'text-yellow-600'
    return 'text-red-600'
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">KPI Scorecard</h1>
          <p className="text-sm text-gray-500 mt-1">Operational performance metrics</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
            {PERIODS.map(p => (
              <button key={p.value} onClick={() => setPeriod(p.value)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${period === p.value ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                {p.label}
              </button>
            ))}
          </div>
          <button onClick={loadKPI} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50">
            <RefreshCw className={`w-4 h-4 text-gray-500 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-20 text-gray-400">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-3" />
          <p>Loading KPIs...</p>
        </div>
      ) : data ? (
        <>
          {/* KPI Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KPICard icon={Target} title="Fill Rate" value={data.fill_rate} format="percent" color="border-l-4 border-green-500" subtitle="Cases fulfilled / requested" />
            <KPICard icon={Clock} title="On-Time Delivery" value={data.on_time_delivery_rate} format="percent" color="border-l-4 border-blue-500" subtitle="Orders on or before promised date" />
            <KPICard icon={TrendingUp} title="Inventory Turnover" value={data.inventory_turnover} color="border-l-4 border-purple-500" subtitle={`Last ${period} days COGS / inventory`} />
            <KPICard icon={DollarSign} title="Avg Days to Pay" value={data.avg_days_to_pay} color="border-l-4 border-orange-500" suffix=" days" subtitle="Average customer payment time" />
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KPICard icon={Target} title="Perfect Order Rate" value={data.perfect_order_rate} format="percent" color="border-l-4 border-teal-500" subtitle="100% fill + on-time" />
            <KPICard icon={DollarSign} title="Revenue" value={data.revenue} format="money" color="border-l-4 border-green-600" subtitle={`Last ${period} days`} />
            <KPICard icon={DollarSign} title="Outstanding AR" value={data.outstanding_ar} format="money" color="border-l-4 border-red-500" subtitle="Unpaid invoices" />
            <KPICard icon={AlertTriangle} title="Low Stock SKUs" value={data.low_stock_count} color="border-l-4 border-amber-500" subtitle="At or below reorder point" />
          </div>

          {/* Performance gauge bars */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-base font-semibold text-gray-800 mb-4">Performance Overview</h2>
            <div className="space-y-4">
              {[
                { label: 'Fill Rate', value: data.fill_rate, target: 98 },
                { label: 'On-Time Delivery', value: data.on_time_delivery_rate, target: 95 },
                { label: 'Perfect Order Rate', value: data.perfect_order_rate, target: 90 },
              ].map(({ label, value, target }) => (
                <div key={label}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-medium text-gray-700">{label}</span>
                    <span className={`font-bold ${getFillColor(value)}`}>
                      {value !== null && value !== undefined ? `${value}%` : 'N/A'}
                      <span className="text-gray-400 font-normal ml-2">target: {target}%</span>
                    </span>
                  </div>
                  <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${
                      value === null ? 'w-0' :
                      value >= target ? 'bg-green-500' :
                      value >= target * 0.85 ? 'bg-yellow-400' : 'bg-red-400'
                    }`} style={{ width: `${Math.min(value || 0, 100)}%` }} />
                  </div>
                  {value !== null && (
                    <div className="flex justify-between text-xs text-gray-400 mt-0.5">
                      <span>0%</span>
                      <span className="text-gray-500">Target: {target}%</span>
                      <span>100%</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Orders summary */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-base font-semibold text-gray-800 mb-3">Period Summary</h2>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-3xl font-bold text-gray-900">{data.total_orders}</div>
                <div className="text-sm text-gray-500 mt-1">Orders Dispatched</div>
              </div>
              <div>
                <div className="text-3xl font-bold text-gray-900">{data.low_stock_count}</div>
                <div className="text-sm text-gray-500 mt-1">SKUs Below Reorder Point</div>
              </div>
              <div>
                <div className={`text-3xl font-bold ${data.outstanding_ar > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  ${Number(data.outstanding_ar).toLocaleString('en-US', {minimumFractionDigits:0})}
                </div>
                <div className="text-sm text-gray-500 mt-1">Outstanding AR</div>
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="text-center py-12 text-gray-400">Failed to load KPI data</div>
      )}
    </div>
  )
}
