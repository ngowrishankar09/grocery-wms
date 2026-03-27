import { useEffect, useState } from 'react'
import { dashboardAPI } from '../api/client'
import { useT } from '../i18n/translations'
import { useAuth } from '../context/AuthContext'
import {
  AlertTriangle, Package, TrendingDown, Clock, ShoppingCart, ArrowRight,
  TrendingUp, Archive, BarChart2, RefreshCw, Zap, CheckCircle,
  Receipt, Truck, UserCircle2, RotateCcw, FileText, Plus,
  Activity, MapPin, ChevronRight, Boxes, DollarSign, TrendingUp as Trend
} from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'

// ── Tiny helpers ──────────────────────────────────────────────
function StatCard({ label, value, sub, icon: Icon, color, to, alert }) {
  const content = (
    <div className={`card flex items-center gap-4 ${to ? 'hover:shadow-md transition-shadow cursor-pointer' : ''} ${alert ? 'border-l-4 border-red-400' : ''}`}>
      <div className={`p-3 rounded-xl flex-shrink-0 ${color}`}>
        <Icon size={22} className="text-white" />
      </div>
      <div className="min-w-0">
        <div className="text-2xl font-bold text-gray-900 leading-none">{value}</div>
        <div className="text-sm text-gray-500 mt-0.5">{label}</div>
        {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
      </div>
    </div>
  )
  return to ? <Link to={to}>{content}</Link> : content
}

function MiniStatCard({ label, value, color = 'text-gray-900', sub }) {
  return (
    <div className="text-center">
      <div className={`text-xl font-bold ${color} leading-none`}>{value}</div>
      <div className="text-xs text-gray-500 mt-0.5">{label}</div>
      {sub && <div className="text-[10px] text-gray-400">{sub}</div>}
    </div>
  )
}

// ── Activity Feed ─────────────────────────────────────────────
const ACTIVITY_ICONS = {
  dispatch:  { Icon: Truck,       bg: 'bg-blue-100',   text: 'text-blue-600'   },
  receiving: { Icon: Package,     bg: 'bg-green-100',  text: 'text-green-600'  },
  invoice:   { Icon: Receipt,     bg: 'bg-purple-100', text: 'text-purple-600' },
  return:    { Icon: RotateCcw,   bg: 'bg-orange-100', text: 'text-orange-600' },
}

function timeAgo(iso) {
  if (!iso) return ''
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  if (diff < 60)    return 'just now'
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

function ActivityFeed({ items }) {
  if (!items || items.length === 0) {
    return (
      <div className="py-8 text-center text-gray-400">
        <Activity size={28} className="mx-auto mb-2 opacity-30" />
        <p className="text-sm">No recent activity</p>
      </div>
    )
  }
  return (
    <div className="divide-y divide-gray-50">
      {items.map((item, i) => {
        const { Icon, bg, text } = ACTIVITY_ICONS[item.type] || ACTIVITY_ICONS['dispatch']
        return (
          <Link key={i} to={item.link || '/'} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${bg}`}>
              <Icon size={14} className={text} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-gray-800 truncate">{item.title}</div>
              <div className="text-xs text-gray-400 truncate">{item.detail}</div>
            </div>
            <div className="text-xs text-gray-300 flex-shrink-0">{timeAgo(item.time)}</div>
          </Link>
        )
      })}
    </div>
  )
}

// ── Quick Actions ─────────────────────────────────────────────
function QuickActions() {
  const navigate = useNavigate()
  const actions = [
    { label: 'New Order',    icon: ShoppingCart, color: 'bg-blue-600   hover:bg-blue-700',   to: '/orders' },
    { label: 'New Invoice',  icon: Receipt,      color: 'bg-purple-600 hover:bg-purple-700', to: '/invoices' },
    { label: 'New Run',      icon: Truck,        color: 'bg-teal-600   hover:bg-teal-700',   to: '/drivers' },
    { label: 'Receive Stock',icon: Package,      color: 'bg-green-600  hover:bg-green-700',  to: '/receiving' },
    { label: 'New Return',   icon: RotateCcw,    color: 'bg-orange-500 hover:bg-orange-600', to: '/returns' },
    { label: 'Stock Take',   icon: FileText,     color: 'bg-gray-600   hover:bg-gray-700',   to: '/stock-take' },
  ]
  return (
    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
      {actions.map(({ label, icon: Icon, color, to }) => (
        <button
          key={label}
          onClick={() => navigate(to)}
          className={`${color} text-white rounded-xl py-3 px-2 flex flex-col items-center gap-1.5 transition-colors`}
        >
          <Icon size={18} />
          <span className="text-xs font-medium leading-tight text-center">{label}</span>
        </button>
      ))}
    </div>
  )
}

// ── Delivery Status Panel ─────────────────────────────────────
function DeliveryPanel({ summary }) {
  const total    = summary.runs_today
  const done     = summary.runs_completed_today
  const pct      = total > 0 ? Math.round((done / total) * 100) : 0

  return (
    <div className="card">
      <h3 className="font-semibold text-gray-900 mb-4 flex items-center justify-between">
        <span className="flex items-center gap-2">
          <Truck size={16} className="text-blue-500" />
          Today's Deliveries
        </span>
        <Link to="/drivers" className="text-xs text-blue-500 hover:underline">Manage →</Link>
      </h3>
      <div className="grid grid-cols-3 gap-3 mb-4">
        <MiniStatCard label="Runs Today"    value={total} color="text-gray-900" />
        <MiniStatCard label="Completed"     value={done}  color="text-green-700" />
        <MiniStatCard label="On Route"      value={summary.drivers_on_route} color="text-blue-700"
          sub={`${summary.drivers_available} available`} />
      </div>
      {total > 0 && (
        <div>
          <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
            <span>Completion</span><span>{pct}%</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}
      {total === 0 && (
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <MapPin size={14} /> No delivery runs scheduled for today
        </div>
      )}
    </div>
  )
}

// ── Invoice / Financial Panel ─────────────────────────────────
function InvoicePanel({ summary }) {
  return (
    <div className="card">
      <h3 className="font-semibold text-gray-900 mb-4 flex items-center justify-between">
        <span className="flex items-center gap-2">
          <Receipt size={16} className="text-purple-500" />
          Invoices & Revenue
        </span>
        <Link to="/invoices" className="text-xs text-blue-500 hover:underline">View all →</Link>
      </h3>
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-purple-50 rounded-xl p-3 text-center">
          <div className="text-xl font-bold text-purple-700">
            ${summary.invoice_outstanding?.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-xs text-purple-600 mt-0.5">Outstanding</div>
        </div>
        <div className="bg-green-50 rounded-xl p-3 text-center">
          <div className="text-xl font-bold text-green-700">
            ${summary.invoiced_this_month?.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-xs text-green-600 mt-0.5">Invoiced This Month</div>
        </div>
      </div>
      {summary.invoices_overdue > 0 && (
        <div className="mt-3 flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-lg p-2.5">
          <AlertTriangle size={14} />
          <span>{summary.invoices_overdue} overdue invoice{summary.invoices_overdue > 1 ? 's' : ''} need attention</span>
          <Link to="/invoices" className="ml-auto text-xs underline">Review →</Link>
        </div>
      )}
    </div>
  )
}

// ── Operations Status Row ─────────────────────────────────────
function OpsStatusRow({ summary }) {
  const items = [
    {
      label: 'Pending Returns',
      value: summary.pending_returns,
      color: summary.pending_returns > 0 ? 'text-orange-600' : 'text-gray-400',
      bg: summary.pending_returns > 0 ? 'bg-orange-50 border-orange-200' : 'bg-gray-50 border-gray-200',
      icon: RotateCcw,
      to: '/returns',
    },
    {
      label: 'Purchase Orders',
      value: summary.pending_pos,
      color: summary.pending_pos > 0 ? 'text-blue-600' : 'text-gray-400',
      bg: summary.pending_pos > 0 ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-200',
      icon: FileText,
      to: '/purchase-orders',
    },
    {
      label: 'Slow Movers',
      value: summary.slow_movers_count,
      color: summary.slow_movers_count > 0 ? 'text-gray-600' : 'text-gray-400',
      bg: 'bg-gray-50 border-gray-200',
      icon: Archive,
      to: '/inventory',
    },
    {
      label: 'Today Dispatched',
      value: summary.today_dispatched,
      color: 'text-teal-700',
      bg: 'bg-teal-50 border-teal-200',
      icon: Truck,
      to: '/dispatch',
    },
    {
      label: 'Ready to Dispatch',
      value: summary.orders_ready_to_dispatch ?? 0,
      color: summary.orders_ready_to_dispatch > 0 ? 'text-green-700' : 'text-gray-400',
      bg: summary.orders_ready_to_dispatch > 0 ? 'bg-green-50 border-green-300' : 'bg-gray-50 border-gray-200',
      icon: CheckCircle,
      to: '/orders',
    },
    {
      label: 'Awaiting Invoice',
      value: summary.orders_awaiting_invoice ?? 0,
      color: summary.orders_awaiting_invoice > 0 ? 'text-purple-700' : 'text-gray-400',
      bg: summary.orders_awaiting_invoice > 0 ? 'bg-purple-50 border-purple-300' : 'bg-gray-50 border-gray-200',
      icon: Receipt,
      to: '/invoices',
    },
  ]
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {items.map(({ label, value, color, bg, icon: Icon, to }) => (
        <Link key={label} to={to}
          className={`border rounded-xl p-3 flex items-center gap-3 hover:shadow-sm transition-shadow ${bg}`}>
          <Icon size={18} className={color} />
          <div>
            <div className={`text-xl font-bold leading-none ${color}`}>{value}</div>
            <div className="text-xs text-gray-500 mt-0.5">{label}</div>
          </div>
        </Link>
      ))}
    </div>
  )
}

// ── Welcome Hero Card ─────────────────────────────────────────
function WelcomeCard({ user, summary, onRefresh, refreshing }) {
  const hour = new Date().getHours()
  const greeting = hour < 5 ? 'Good night' : hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const name = user?.full_name?.split(' ')[0] || user?.username || ''
  const date = new Date().toLocaleDateString('en', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

  const hero = [
    {
      label: 'Total SKUs',
      value: summary?.total_skus ?? '—',
      icon: Boxes,
      sub: `${(summary?.total_cases_in_stock ?? 0).toLocaleString()} cases`,
    },
    {
      label: 'Pending Orders',
      value: summary?.pending_orders ?? '—',
      icon: ShoppingCart,
      sub: summary?.overdue_orders > 0 ? `${summary.overdue_orders} overdue` : 'all on time',
      warn: summary?.overdue_orders > 0,
    },
    {
      label: 'Monthly Revenue',
      value: `$${((summary?.invoiced_this_month ?? 0)).toLocaleString('en', { maximumFractionDigits: 0 })}`,
      icon: DollarSign,
      sub: `$${((summary?.invoice_outstanding ?? 0)).toLocaleString('en', { maximumFractionDigits: 0 })} outstanding`,
    },
    {
      label: 'Cases Dispatched',
      value: (summary?.dispatched_this_month ?? 0).toLocaleString(),
      icon: Truck,
      sub: 'this month',
    },
  ]

  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 p-6 text-white shadow-lg">
      {/* Decorative circles */}
      <div className="pointer-events-none absolute -right-12 -top-12 h-52 w-52 rounded-full bg-white/5" />
      <div className="pointer-events-none absolute -bottom-10 left-16 h-36 w-36 rounded-full bg-white/5" />
      <div className="pointer-events-none absolute right-1/3 top-0 h-24 w-24 rounded-full bg-white/5" />

      {/* Top row */}
      <div className="relative flex items-start justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-green-400" />
            <span className="text-xs font-semibold uppercase tracking-widest text-blue-200">Live Dashboard</span>
          </div>
          <h2 className="text-2xl font-bold leading-tight">
            {greeting}{name ? `, ${name}` : ''}!
          </h2>
          <p className="mt-1 text-sm text-blue-200">{date}</p>
        </div>
        <button
          onClick={onRefresh}
          disabled={refreshing}
          className="flex items-center gap-2 rounded-xl bg-white/10 px-3 py-1.5 text-sm text-blue-100 transition-colors hover:bg-white/20 hover:text-white disabled:opacity-50"
        >
          <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Stats row */}
      <div className="relative mt-5 grid grid-cols-2 gap-4 border-t border-white/20 pt-5 sm:grid-cols-4">
        {hero.map(({ label, value, icon: Icon, sub, warn }) => (
          <div key={label} className="flex items-start gap-3">
            <div className="mt-0.5 rounded-lg bg-white/10 p-1.5 flex-shrink-0">
              <Icon size={14} className={warn ? 'text-red-300' : 'text-blue-200'} />
            </div>
            <div>
              <div className={`text-xl font-bold leading-none ${warn ? 'text-red-300' : 'text-white'}`}>{value}</div>
              <div className="mt-0.5 text-xs text-blue-300">{label}</div>
              <div className={`mt-0.5 text-[10px] ${warn ? 'text-red-300' : 'text-blue-400'}`}>{sub}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Main Dashboard ────────────────────────────────────────────
export default function Dashboard({ lang }) {
  const t = useT(lang)
  const { user } = useAuth()
  const [data,      setData]      = useState(null)
  const [loading,   setLoading]   = useState(true)
  const [refreshing,setRefreshing] = useState(false)

  const load = async (silent = false) => {
    if (!silent) setLoading(true)
    else setRefreshing(true)
    try {
      const r = await dashboardAPI.get()
      setData(r.data)
    } catch {}
    setLoading(false)
    setRefreshing(false)
  }

  useEffect(() => { load() }, [])

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <RefreshCw size={24} className="animate-spin text-blue-400" />
    </div>
  )
  if (!data) return null

  const { summary, expiring_soon, wh2_only_items, top_sellers, slow_movers, overdue_orders, activity_feed } = data

  const expiryBadge = (days) => {
    if (days < 0)   return <span className="badge-danger">Expired</span>
    if (days <= 30) return <span className="badge-danger">{days}d</span>
    if (days <= 60) return <span className="badge-warning">{days}d</span>
    return <span className="badge-ok">{days}d</span>
  }

  const hasAlerts = summary.stockout_count > 0 || summary.expiring_critical > 0
    || summary.overdue_orders > 0 || summary.invoices_overdue > 0
    || summary.orders_ready_to_dispatch > 0 || summary.orders_awaiting_invoice > 0

  return (
    <div className="space-y-5">

      {/* ── Welcome Hero ── */}
      <WelcomeCard user={user} summary={summary} onRefresh={() => load(true)} refreshing={refreshing} />

      {/* ── Alert banner ── */}
      {hasAlerts && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-1">
          <div className="flex items-center gap-2 font-semibold text-red-800 text-sm">
            <AlertTriangle size={16} className="text-red-500" /> Action Required
          </div>
          <div className="flex flex-wrap gap-4 text-sm text-red-700 pl-6">
            {summary.stockout_count > 0 && (
              <Link to="/inventory" className="hover:underline">🔴 {summary.stockout_count} stockout{summary.stockout_count > 1 ? 's' : ''}</Link>
            )}
            {summary.expiring_critical > 0 && (
              <Link to="/inventory" className="hover:underline">🟠 {summary.expiring_critical} batch{summary.expiring_critical > 1 ? 'es' : ''} expiring &lt;30d</Link>
            )}
            {summary.overdue_orders > 0 && (
              <Link to="/orders" className="hover:underline">⏰ {summary.overdue_orders} overdue order{summary.overdue_orders > 1 ? 's' : ''}</Link>
            )}
            {summary.invoices_overdue > 0 && (
              <Link to="/invoices" className="hover:underline">💳 {summary.invoices_overdue} overdue invoice{summary.invoices_overdue > 1 ? 's' : ''}</Link>
            )}
            {summary.orders_ready_to_dispatch > 0 && (
              <Link to="/orders" className="hover:underline">✅ {summary.orders_ready_to_dispatch} order{summary.orders_ready_to_dispatch > 1 ? 's' : ''} ready to dispatch</Link>
            )}
            {summary.orders_awaiting_invoice > 0 && (
              <Link to="/invoices" className="hover:underline">📄 {summary.orders_awaiting_invoice} order{summary.orders_awaiting_invoice > 1 ? 's' : ''} awaiting invoice</Link>
            )}
          </div>
        </div>
      )}

      {/* ── Quick Actions ── */}
      <div className="card">
        <h3 className="font-semibold text-gray-700 text-sm mb-3 flex items-center gap-2">
          <Zap size={14} className="text-yellow-500" /> Quick Actions
        </h3>
        <QuickActions />
      </div>

      {/* ── Row 1: core inventory ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label={t('totalSKUs')}    value={summary.total_skus}
          sub={`${summary.total_cases_in_stock?.toLocaleString()} cases in stock`}
          icon={Package} color="bg-blue-500" to="/skus" />
        <StatCard label={t('stockouts')}    value={summary.stockout_count}
          icon={TrendingDown} color={summary.stockout_count > 0 ? 'bg-red-500' : 'bg-green-500'}
          to="/inventory" alert={summary.stockout_count > 0} />
        <StatCard label={t('lowStock')}     value={summary.low_stock_count}
          icon={AlertTriangle} color={summary.low_stock_count > 0 ? 'bg-yellow-500' : 'bg-green-500'}
          to="/inventory" />
        <StatCard label={t('pendingOrders')} value={summary.pending_orders}
          sub={summary.overdue_orders > 0 ? `${summary.overdue_orders} overdue` : undefined}
          icon={ShoppingCart} color={summary.overdue_orders > 0 ? 'bg-red-500' : 'bg-purple-500'}
          to="/orders" alert={summary.overdue_orders > 0} />
      </div>

      {/* ── Row 2: expiry + throughput ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label={t('expiringCritical')} value={summary.expiring_critical}
          icon={Clock} color={summary.expiring_critical > 0 ? 'bg-orange-500' : 'bg-green-500'}
          to="/inventory" alert={summary.expiring_critical > 0} />
        <StatCard label={t('expiringWarning')}  value={summary.expiring_warning}
          icon={Clock} color="bg-amber-400" to="/inventory" />
        <StatCard label={t('receivedThisMonth')}   value={summary.received_this_month}
          sub="cases received" icon={Package} color="bg-green-500" />
        <StatCard label={t('dispatchedThisMonth')} value={summary.dispatched_this_month}
          sub="cases dispatched" icon={ArrowRight} color="bg-teal-500" />
      </div>

      {/* ── Ops status row ── */}
      <OpsStatusRow summary={summary} />

      {/* ── Delivery + Invoice row ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <DeliveryPanel summary={summary} />
        <InvoicePanel  summary={summary} />
      </div>

      {/* ── Main 3-panel grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Activity Feed */}
        <div className="card lg:col-span-1 !p-0 overflow-hidden">
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
              <Activity size={15} className="text-gray-400" /> Recent Activity
            </h3>
          </div>
          <ActivityFeed items={activity_feed} />
        </div>

        {/* Top Sellers */}
        <div className="card">
          <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <TrendingUp size={16} className="text-green-500" />
            Top Sellers <span className="text-xs font-normal text-gray-400">(last 30 days)</span>
          </h3>
          {top_sellers.length === 0 ? (
            <p className="text-sm text-gray-400">No dispatch data yet</p>
          ) : (
            <div className="space-y-2">
              {top_sellers.map((s, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-xs font-bold text-gray-300 w-4">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-800 truncate">{s.product_name}</div>
                    <div className="text-xs text-gray-400">{s.sku_code} · {s.category}</div>
                  </div>
                  <div className="flex-shrink-0 text-right">
                    <div className="text-sm font-bold text-green-600">{s.cases_dispatched_30d}</div>
                    <div className="text-xs text-gray-400">cases</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Expiring Soon */}
        <div className="card">
          <h3 className="font-semibold text-gray-900 mb-4 flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Clock size={16} className="text-orange-500" /> {t('expiringSoon')}
            </span>
            <Link to="/reports" className="text-xs text-blue-500 hover:underline">View all →</Link>
          </h3>
          {expiring_soon.length === 0 ? (
            <div className="flex flex-col items-center py-6 text-gray-300">
              <CheckCircle size={32} className="text-green-400 mb-2" />
              <p className="text-sm text-gray-500">No items expiring within 60 days</p>
            </div>
          ) : (
            <div className="space-y-2">
              {expiring_soon.map((b, i) => (
                <div key={i} className={`flex items-center justify-between p-2.5 rounded-lg ${b.days_to_expiry <= 30 ? 'bg-red-50' : 'bg-yellow-50'}`}>
                  <div className="min-w-0">
                    <div className="font-medium text-sm text-gray-800 truncate">{b.product_name}</div>
                    <div className="text-xs text-gray-400">{b.sku_code} · {b.warehouse} · {b.cases_remaining} cases</div>
                  </div>
                  <div className="ml-3 flex-shrink-0">{expiryBadge(b.days_to_expiry)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Bottom row ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Overdue Orders */}
        <div className="card">
          <h3 className="font-semibold text-gray-900 mb-4 flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Zap size={16} className={overdue_orders.length > 0 ? 'text-red-500' : 'text-gray-400'} />
              Overdue Orders
            </span>
            <Link to="/orders" className="text-xs text-blue-500 hover:underline">All orders →</Link>
          </h3>
          {overdue_orders.length === 0 ? (
            <div className="flex items-center gap-2 text-green-600 text-sm">
              <CheckCircle size={16} /> <span>All orders on time</span>
            </div>
          ) : (
            <div className="space-y-2">
              {overdue_orders.map((o, i) => (
                <div key={i} className="flex items-center justify-between p-2.5 bg-red-50 rounded-lg">
                  <div>
                    <div className="font-medium text-sm text-gray-800">{o.order_number}</div>
                    <div className="text-xs text-gray-500">{o.store_name}</div>
                  </div>
                  <span className="badge-danger ml-3">{o.days_pending}d</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Slow Movers */}
        <div className="card">
          <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Archive size={16} className="text-gray-400" />
            Slow Movers <span className="text-xs font-normal text-gray-400">(no movement)</span>
          </h3>
          {slow_movers.length === 0 ? (
            <div className="flex flex-col items-center py-6">
              <BarChart2 size={28} className="text-gray-300 mb-2" />
              <p className="text-sm text-gray-400">All stocked items have movement</p>
            </div>
          ) : (
            <div className="space-y-2">
              {slow_movers.slice(0, 6).map((s, i) => (
                <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-gray-50">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-gray-700 truncate">{s.product_name}</div>
                    <div className="text-xs text-gray-400">{s.sku_code} · {s.category}</div>
                  </div>
                  <div className="ml-3 flex-shrink-0 text-right">
                    <div className="text-sm font-bold text-gray-500">{s.total_cases}</div>
                    <div className="text-xs text-gray-400">cases</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* WH2 items needing transfer */}
        <div className="card">
          <h3 className="font-semibold text-gray-900 mb-4 flex items-center justify-between">
            <span className="flex items-center gap-2">
              <AlertTriangle size={16} className={wh2_only_items.length > 0 ? 'text-yellow-500' : 'text-gray-400'} />
              WH2 Only — Needs Transfer
            </span>
            <Link to="/transfers" className="text-xs text-blue-500 hover:underline">Transfers →</Link>
          </h3>
          {wh2_only_items.length === 0 ? (
            <div className="flex items-center gap-2 text-green-600 text-sm">
              <CheckCircle size={16} /> <span>All items accessible from WH1</span>
            </div>
          ) : (
            <div className="space-y-2">
              {wh2_only_items.slice(0, 6).map((item, i) => (
                <div key={i} className="flex items-center justify-between p-2.5 bg-yellow-50 rounded-lg">
                  <div>
                    <div className="font-medium text-sm text-gray-800">{item.product_name}</div>
                    <div className="text-xs text-gray-400">{item.sku_code}</div>
                  </div>
                  <span className="font-bold text-yellow-700">{item.wh2_cases} cases</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

    </div>
  )
}
