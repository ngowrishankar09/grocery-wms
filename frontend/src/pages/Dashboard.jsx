import { useEffect, useState } from 'react'
import { dashboardAPI, invoiceAPI } from '../api/client'
import { useAuth } from '../context/AuthContext'
import {
  AlertTriangle, Package, TrendingDown, Clock, ShoppingCart,
  TrendingUp, Archive, RefreshCw, CheckCircle,
  Receipt, Truck, RotateCcw, FileText, Plus,
  Activity, DollarSign, ArrowUpRight, ArrowDownRight,
  Zap, ChevronRight, Boxes, Star, Sparkles,
  SendHorizonal, ClipboardList, BarChart2, Layers,
} from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'

// ── Helpers ───────────────────────────────────────────────────
const $$ = (v) => `$${(v ?? 0).toLocaleString('en', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`

function timeAgo(iso) {
  if (!iso) return ''
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  if (diff < 60)    return 'just now'
  if (diff < 3600)  return `${Math.floor(diff / 60)}m`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  return `${Math.floor(diff / 86400)}d`
}

// ── Business Health Score ─────────────────────────────────────
function healthScore(summary) {
  let score = 100
  if (summary.stockout_count  > 0) score -= Math.min(summary.stockout_count * 8, 24)
  if (summary.overdue_orders  > 0) score -= Math.min(summary.overdue_orders * 6, 18)
  if (summary.invoices_overdue > 0) score -= Math.min(summary.invoices_overdue * 5, 15)
  if (summary.expiring_critical > 0) score -= Math.min(summary.expiring_critical * 4, 12)
  return Math.max(0, score)
}

function HealthRing({ score }) {
  const r = 22, circ = 2 * Math.PI * r
  const progress = circ - (score / 100) * circ
  const color = score >= 85 ? '#10b981' : score >= 65 ? '#f59e0b' : '#ef4444'
  const label = score >= 85 ? 'Excellent' : score >= 65 ? 'Needs Attention' : 'Critical'
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative w-14 h-14">
        <svg viewBox="0 0 52 52" className="w-14 h-14 -rotate-90">
          <circle cx="26" cy="26" r={r} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="5" />
          <circle cx="26" cy="26" r={r} fill="none" stroke={color} strokeWidth="5"
            strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={progress}
            style={{ transition: 'stroke-dashoffset 1s ease' }} />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-white">{score}</span>
      </div>
      <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color }}>{label}</span>
    </div>
  )
}

// ── Hero Card ─────────────────────────────────────────────────
function HeroCard({ user, summary, onRefresh, refreshing }) {
  const hour = new Date().getHours()
  const greeting = hour < 5 ? '🌙 Good night' : hour < 12 ? '☀️ Good morning' : hour < 17 ? '👋 Good afternoon' : '🌇 Good evening'
  const name = user?.full_name?.split(' ')[0] || user?.username || ''
  const date = new Date().toLocaleDateString('en', { weekday: 'long', month: 'long', day: 'numeric' })
  const score = healthScore(summary)

  const kpis = [
    {
      label: 'Revenue This Month',
      value: $$(summary.invoiced_this_month),
      sub: `${$$(summary.invoice_outstanding)} outstanding`,
      subWarn: summary.invoices_overdue > 0,
      icon: DollarSign,
      to: '/invoices',
    },
    {
      label: 'Pending Orders',
      value: summary.pending_orders ?? 0,
      sub: summary.overdue_orders > 0 ? `${summary.overdue_orders} overdue ⚠️` : '✓ all on time',
      subWarn: summary.overdue_orders > 0,
      icon: ShoppingCart,
      to: '/orders',
    },
    {
      label: 'Cases in Stock',
      value: (summary.total_cases_in_stock ?? 0).toLocaleString(),
      sub: summary.stockout_count > 0 ? `${summary.stockout_count} stockout${summary.stockout_count > 1 ? 's' : ''} ⚠️` : '✓ fully stocked',
      subWarn: summary.stockout_count > 0,
      icon: Boxes,
      to: '/inventory',
    },
    {
      label: "Today's Deliveries",
      value: summary.runs_today ?? 0,
      sub: `${summary.runs_completed_today ?? 0} completed · ${summary.drivers_on_route ?? 0} on route`,
      icon: Truck,
      to: '/drivers',
    },
  ]

  return (
    <div className="relative overflow-hidden rounded-3xl shadow-xl"
      style={{ background: 'linear-gradient(135deg, #1e3a8a 0%, #1d4ed8 40%, #4f46e5 100%)' }}>
      {/* Decorative blobs */}
      <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full opacity-10 bg-white" />
      <div className="pointer-events-none absolute -bottom-12 -left-8 h-48 w-48 rounded-full opacity-10 bg-white" />
      <div className="pointer-events-none absolute right-1/3 bottom-0 h-32 w-32 rounded-full opacity-5 bg-white" />

      <div className="relative p-6 md:p-8">
        {/* Top row */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs font-bold uppercase tracking-widest text-blue-200">Live Dashboard</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold text-white leading-tight">
              {greeting}{name ? `, ${name}` : ''}!
            </h1>
            <p className="text-blue-200 text-sm mt-1">{date}</p>
          </div>
          <div className="flex items-center gap-4">
            <HealthRing score={score} />
            <button onClick={onRefresh} disabled={refreshing}
              className="hidden md:flex items-center gap-1.5 rounded-xl bg-white/10 px-3 py-2 text-sm text-blue-100 hover:bg-white/20 transition-all disabled:opacity-50">
              <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>
        </div>

        {/* KPI grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {kpis.map(({ label, value, sub, subWarn, icon: Icon, to }) => (
            <Link key={label} to={to}
              className="group bg-white/10 hover:bg-white/20 rounded-2xl p-4 transition-all cursor-pointer border border-white/10 hover:border-white/25 hover:shadow-lg">
              <div className="flex items-center justify-between mb-2">
                <div className="p-1.5 rounded-lg bg-white/10">
                  <Icon size={14} className="text-blue-200" />
                </div>
                <ArrowUpRight size={13} className="text-white/30 group-hover:text-white/60 transition-colors" />
              </div>
              <div className="text-xl md:text-2xl font-bold text-white leading-none mb-1">{value}</div>
              <div className="text-[11px] text-blue-200 font-medium">{label}</div>
              <div className={`text-[10px] mt-0.5 ${subWarn ? 'text-amber-300 font-semibold' : 'text-blue-300'}`}>{sub}</div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Needs Your Attention ──────────────────────────────────────
function AttentionPanel({ summary, overdueOrders, expiringItems }) {
  const items = []

  if (summary.invoices_overdue > 0)
    items.push({
      priority: 'urgent',
      emoji: '💸',
      title: `${summary.invoices_overdue} overdue invoice${summary.invoices_overdue > 1 ? 's' : ''}`,
      detail: `${$$(summary.invoice_outstanding)} outstanding — collect before it impacts cash flow`,
      action: 'Manage Invoices',
      to: '/invoices',
    })

  if ((summary.orders_ready_to_dispatch ?? 0) > 0)
    items.push({
      priority: 'urgent',
      emoji: '📦',
      title: `${summary.orders_ready_to_dispatch} order${summary.orders_ready_to_dispatch > 1 ? 's' : ''} ready to dispatch`,
      detail: 'Customers are waiting — get these out today',
      action: 'Go to Dispatch',
      to: '/dispatch',
    })

  if (summary.overdue_orders > 0)
    items.push({
      priority: 'high',
      emoji: '⏰',
      title: `${summary.overdue_orders} overdue order${summary.overdue_orders > 1 ? 's' : ''}`,
      detail: overdueOrders?.[0] ? `Oldest: ${overdueOrders[0].store_name} (${overdueOrders[0].days_pending}d)` : 'These orders are past due',
      action: 'Review Orders',
      to: '/orders',
    })

  if (summary.stockout_count > 0)
    items.push({
      priority: 'high',
      emoji: '🚨',
      title: `${summary.stockout_count} product${summary.stockout_count > 1 ? 's' : ''} out of stock`,
      detail: 'You cannot fulfill orders for these items until restocked',
      action: 'Check Inventory',
      to: '/inventory',
    })

  if ((summary.orders_awaiting_invoice ?? 0) > 0)
    items.push({
      priority: 'medium',
      emoji: '🧾',
      title: `${summary.orders_awaiting_invoice} order${summary.orders_awaiting_invoice > 1 ? 's' : ''} awaiting invoice`,
      detail: 'Dispatched orders that still need to be invoiced',
      action: 'Create Invoices',
      to: '/invoices',
    })

  if (summary.expiring_critical > 0)
    items.push({
      priority: 'medium',
      emoji: '⏳',
      title: `${summary.expiring_critical} batch${summary.expiring_critical > 1 ? 'es' : ''} expiring within 30 days`,
      detail: expiringItems?.[0] ? `${expiringItems[0].product_name} — ${expiringItems[0].cases_remaining} cases, ${expiringItems[0].days_to_expiry}d left` : 'Act fast to avoid waste',
      action: 'Expiry Report',
      to: '/reports',
    })

  if (summary.low_stock_count > 0)
    items.push({
      priority: 'low',
      emoji: '📉',
      title: `${summary.low_stock_count} product${summary.low_stock_count > 1 ? 's' : ''} running low`,
      detail: 'Consider raising purchase orders before they run out',
      action: 'View Inventory',
      to: '/inventory',
    })

  const PRIORITY = { urgent: 0, high: 1, medium: 2, low: 3 }
  items.sort((a, b) => PRIORITY[a.priority] - PRIORITY[b.priority])

  const BADGE = {
    urgent: 'bg-red-100 text-red-700 border border-red-200',
    high:   'bg-amber-100 text-amber-700 border border-amber-200',
    medium: 'bg-blue-100 text-blue-700 border border-blue-200',
    low:    'bg-gray-100 text-gray-600 border border-gray-200',
  }
  const CARD = {
    urgent: 'border-l-4 border-l-red-400 bg-red-50/50',
    high:   'border-l-4 border-l-amber-400 bg-amber-50/50',
    medium: 'border-l-4 border-l-blue-400 bg-blue-50/50',
    low:    'border-l-4 border-l-gray-300 bg-gray-50/30',
  }

  return (
    <div className="card !p-0 overflow-hidden flex flex-col h-full">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-slate-50 to-white">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-amber-100 rounded-lg">
            <Zap size={15} className="text-amber-600" />
          </div>
          <div>
            <h3 className="font-bold text-gray-900 text-sm">Needs Your Attention</h3>
            <p className="text-[11px] text-gray-400">{items.length === 0 ? 'All clear today 🎉' : `${items.filter(i => i.priority === 'urgent' || i.priority === 'high').length} urgent item${items.filter(i => i.priority === 'urgent' || i.priority === 'high').length !== 1 ? 's' : ''}`}</p>
          </div>
        </div>
        {items.length > 0 && (
          <span className="text-xs font-bold text-amber-700 bg-amber-100 px-2 py-1 rounded-full">{items.length}</span>
        )}
      </div>

      <div className="flex-1 divide-y divide-gray-50">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center px-6">
            <div className="text-5xl mb-3">🎉</div>
            <p className="font-semibold text-gray-700">Everything looks great!</p>
            <p className="text-sm text-gray-400 mt-1">No urgent items need your attention right now</p>
          </div>
        ) : (
          items.map((item, i) => (
            <div key={i} className={`flex items-start gap-3 px-5 py-3.5 ${CARD[item.priority]}`}>
              <span className="text-xl leading-none mt-0.5 flex-shrink-0">{item.emoji}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-start gap-2 flex-wrap">
                  <span className="font-semibold text-gray-800 text-sm">{item.title}</span>
                  <span className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full ${BADGE[item.priority]}`}>{item.priority}</span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{item.detail}</p>
              </div>
              <Link to={item.to}
                className="flex-shrink-0 text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1 whitespace-nowrap bg-white border border-blue-200 hover:border-blue-400 rounded-lg px-2.5 py-1.5 transition-all hover:shadow-sm">
                {item.action}
                <ChevronRight size={11} />
              </Link>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

// ── Quick Actions ─────────────────────────────────────────────
function QuickActions() {
  const navigate = useNavigate()
  const actions = [
    { label: 'New Order',      icon: ShoppingCart,  color: 'from-blue-500 to-blue-600',     to: '/orders',      ring: 'ring-blue-200' },
    { label: 'New Invoice',    icon: Receipt,       color: 'from-violet-500 to-violet-600', to: '/invoices',    ring: 'ring-violet-200' },
    { label: 'Receive Stock',  icon: Package,       color: 'from-emerald-500 to-emerald-600', to: '/receiving', ring: 'ring-emerald-200' },
    { label: 'Dispatch',       icon: SendHorizonal, color: 'from-teal-500 to-teal-600',     to: '/dispatch',    ring: 'ring-teal-200' },
    { label: 'Start Packing',  icon: Layers,        color: 'from-purple-500 to-purple-600', to: '/repacking',   ring: 'ring-purple-200' },
    { label: 'New Return',     icon: RotateCcw,     color: 'from-orange-500 to-orange-600', to: '/returns',     ring: 'ring-orange-200' },
    { label: 'Stock Take',     icon: ClipboardList, color: 'from-slate-500 to-slate-600',   to: '/stock-take',  ring: 'ring-slate-200' },
  ]
  return (
    <div className="card !p-0 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-slate-50 to-white flex items-center gap-2">
        <div className="p-1.5 bg-blue-100 rounded-lg">
          <Sparkles size={15} className="text-blue-600" />
        </div>
        <div>
          <h3 className="font-bold text-gray-900 text-sm">Quick Actions</h3>
          <p className="text-[11px] text-gray-400">Start any task in one click</p>
        </div>
      </div>
      <div className="p-4 grid grid-cols-2 gap-2.5">
        {actions.map(({ label, icon: Icon, color, to, ring }) => (
          <button key={label} onClick={() => navigate(to)}
            className={`group relative overflow-hidden bg-gradient-to-br ${color} text-white rounded-xl py-3.5 px-3 flex flex-col items-center gap-2 transition-all hover:shadow-lg hover:scale-[1.02] active:scale-[0.98] ring-2 ring-transparent hover:${ring}`}>
            <div className="absolute inset-0 bg-white/0 group-hover:bg-white/10 transition-all" />
            <Icon size={20} className="relative z-10" />
            <span className="relative z-10 text-[11px] font-bold leading-tight text-center">{label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Today's Snapshot ──────────────────────────────────────────
function TodaySnapshot({ summary }) {
  const items = [
    { label: 'Dispatched Today',  value: summary.today_dispatched,               icon: Truck,        color: 'text-teal-600',   bg: 'bg-teal-50',    to: '/dispatch' },
    { label: 'Ready to Dispatch', value: summary.orders_ready_to_dispatch ?? 0, icon: CheckCircle,  color: summary.orders_ready_to_dispatch > 0 ? 'text-green-700' : 'text-gray-400', bg: summary.orders_ready_to_dispatch > 0 ? 'bg-green-50' : 'bg-gray-50', to: '/orders' },
    { label: 'Open Packing',      value: summary.open_packing_runs ?? 0,         icon: Layers,       color: summary.open_packing_runs > 0 ? 'text-purple-600' : 'text-gray-400', bg: summary.open_packing_runs > 0 ? 'bg-purple-50' : 'bg-gray-50', to: '/repacking' },
    { label: 'Purchase Orders',   value: summary.pending_pos,                    icon: FileText,     color: 'text-blue-600',   bg: 'bg-blue-50',    to: '/purchase-orders' },
    { label: 'Pending Returns',   value: summary.pending_returns,                icon: RotateCcw,    color: summary.pending_returns > 0 ? 'text-orange-600' : 'text-gray-400', bg: summary.pending_returns > 0 ? 'bg-orange-50' : 'bg-gray-50', to: '/returns' },
    { label: 'Slow Movers',       value: summary.slow_movers_count,              icon: Archive,      color: 'text-gray-500',   bg: 'bg-gray-50',    to: '/inventory' },
    { label: 'Drivers On Route',  value: summary.drivers_on_route,               icon: Activity,     color: 'text-indigo-600', bg: 'bg-indigo-50',  to: '/drivers' },
  ]
  return (
    <div className="grid grid-cols-3 sm:grid-cols-7 gap-2">
      {items.map(({ label, value, icon: Icon, color, bg, to }) => (
        <Link key={label} to={to}
          className={`${bg} border border-white rounded-2xl p-3 flex flex-col items-center gap-1.5 hover:shadow-md transition-all hover:scale-[1.02] group`}>
          <Icon size={18} className={`${color} group-hover:scale-110 transition-transform`} />
          <div className={`text-xl font-bold leading-none ${color}`}>{value ?? 0}</div>
          <div className="text-[10px] text-gray-500 font-medium text-center leading-tight">{label}</div>
        </Link>
      ))}
    </div>
  )
}

// ── Top Sellers ───────────────────────────────────────────────
function TopSellers({ items }) {
  const max = Math.max(...(items.map(s => s.cases_dispatched_30d || 0)), 1)
  return (
    <div className="card !p-0 overflow-hidden h-full">
      <div className="px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-slate-50 to-white flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-green-100 rounded-lg">
            <TrendingUp size={15} className="text-green-600" />
          </div>
          <div>
            <h3 className="font-bold text-gray-900 text-sm">Top Sellers</h3>
            <p className="text-[11px] text-gray-400">Last 30 days by cases</p>
          </div>
        </div>
        <Link to="/reports" className="text-xs text-blue-500 hover:text-blue-700 font-medium flex items-center gap-1">
          Full report <ChevronRight size={11} />
        </Link>
      </div>
      <div className="p-4 space-y-3">
        {items.length === 0 ? (
          <div className="py-8 text-center text-gray-300">
            <BarChart2 size={32} className="mx-auto mb-2" />
            <p className="text-sm text-gray-400">No dispatch data yet</p>
          </div>
        ) : items.slice(0, 6).map((s, i) => (
          <div key={i} className="flex items-center gap-3">
            <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0 ${
              i === 0 ? 'bg-yellow-100 text-yellow-700' : i === 1 ? 'bg-gray-100 text-gray-600' : i === 2 ? 'bg-orange-100 text-orange-600' : 'bg-gray-50 text-gray-400'
            }`}>{i + 1}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-gray-800 truncate max-w-[140px]">{s.product_name}</span>
                <span className="text-sm font-bold text-gray-700 ml-2 flex-shrink-0">{s.cases_dispatched_30d}</span>
              </div>
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-green-400 to-emerald-500 rounded-full transition-all"
                  style={{ width: `${(s.cases_dispatched_30d / max) * 100}%` }} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Activity Feed ─────────────────────────────────────────────
const ACT_STYLE = {
  dispatch:  { bg: 'bg-blue-100',  text: 'text-blue-600',  Icon: Truck },
  receiving: { bg: 'bg-green-100', text: 'text-green-600', Icon: Package },
  invoice:   { bg: 'bg-violet-100',text: 'text-violet-600',Icon: Receipt },
  return:    { bg: 'bg-orange-100',text: 'text-orange-600',Icon: RotateCcw },
}

function ActivityFeed({ items }) {
  return (
    <div className="card !p-0 overflow-hidden h-full">
      <div className="px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-slate-50 to-white flex items-center gap-2">
        <div className="p-1.5 bg-indigo-100 rounded-lg">
          <Activity size={15} className="text-indigo-600" />
        </div>
        <div>
          <h3 className="font-bold text-gray-900 text-sm">Recent Activity</h3>
          <p className="text-[11px] text-gray-400">Live business events</p>
        </div>
      </div>
      <div className="divide-y divide-gray-50">
        {(!items || items.length === 0) ? (
          <div className="py-12 text-center text-gray-300">
            <Activity size={28} className="mx-auto mb-2" />
            <p className="text-sm text-gray-400">No recent activity</p>
          </div>
        ) : items.slice(0, 8).map((item, i) => {
          const s = ACT_STYLE[item.type] || ACT_STYLE['dispatch']
          return (
            <Link key={i} to={item.link || '/'} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 transition-colors group">
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${s.bg}`}>
                <s.Icon size={14} className={s.text} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{item.title}</p>
                <p className="text-xs text-gray-400 truncate">{item.detail}</p>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <span className="text-xs text-gray-300">{timeAgo(item.time)}</span>
                <ChevronRight size={12} className="text-gray-200 group-hover:text-gray-400 transition-colors" />
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}

// ── Finance & Delivery row ────────────────────────────────────
function FinanceDeliveryRow({ summary }) {
  const pct = summary.runs_today > 0 ? Math.round((summary.runs_completed_today / summary.runs_today) * 100) : 0

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Finance card */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-violet-100 rounded-lg"><DollarSign size={15} className="text-violet-600" /></div>
            <h3 className="font-bold text-gray-900 text-sm">Finance Overview</h3>
          </div>
          <Link to="/invoices" className="text-xs text-blue-500 hover:text-blue-700 font-medium flex items-center gap-1">
            All invoices <ChevronRight size={11} />
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-gradient-to-br from-violet-50 to-purple-50 rounded-2xl p-4 text-center border border-violet-100">
            <div className="text-2xl font-bold text-violet-700">{$$(summary.invoiced_this_month)}</div>
            <div className="text-xs text-violet-500 mt-1 font-medium">Invoiced This Month</div>
          </div>
          <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-2xl p-4 text-center border border-amber-100">
            <div className="text-2xl font-bold text-amber-700">{$$(summary.invoice_outstanding)}</div>
            <div className="text-xs text-amber-500 mt-1 font-medium">Outstanding</div>
          </div>
        </div>
        {summary.invoices_overdue > 0 && (
          <button
            onClick={handleSendReminders}
            disabled={sendingReminders}
            className="mt-3 w-full flex items-center justify-between gap-2 text-sm bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 group hover:bg-red-100 transition-colors disabled:opacity-60"
          >
            <span className="flex items-center gap-2 text-red-700">
              <AlertTriangle size={13} />
              <span className="font-semibold">{summary.invoices_overdue} overdue invoice{summary.invoices_overdue > 1 ? 's' : ''}</span>
            </span>
            <span className="text-xs text-red-500 font-medium group-hover:text-red-700">
              {sendingReminders ? 'Sending…' : 'Send reminders →'}
            </span>
          </button>
        )}
      </div>

      {/* Delivery card */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-teal-100 rounded-lg"><Truck size={15} className="text-teal-600" /></div>
            <h3 className="font-bold text-gray-900 text-sm">Today's Deliveries</h3>
          </div>
          <Link to="/drivers" className="text-xs text-blue-500 hover:text-blue-700 font-medium flex items-center gap-1">
            Manage <ChevronRight size={11} />
          </Link>
        </div>
        <div className="grid grid-cols-3 gap-3 mb-4">
          {[
            { label: 'Runs Today',   value: summary.runs_today,            color: 'text-gray-800',   bg: 'bg-gray-50' },
            { label: 'Completed',    value: summary.runs_completed_today,  color: 'text-emerald-700',bg: 'bg-emerald-50' },
            { label: 'On Route',     value: summary.drivers_on_route,      color: 'text-blue-700',   bg: 'bg-blue-50' },
          ].map(({ label, value, color, bg }) => (
            <div key={label} className={`${bg} rounded-xl p-3 text-center`}>
              <div className={`text-xl font-bold leading-none ${color}`}>{value ?? 0}</div>
              <div className="text-[11px] text-gray-500 mt-1">{label}</div>
            </div>
          ))}
        </div>
        {summary.runs_today > 0 ? (
          <div>
            <div className="flex justify-between text-xs text-gray-500 mb-1.5">
              <span>Route completion</span>
              <span className="font-semibold text-gray-700">{pct}%</span>
            </div>
            <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-teal-400 to-emerald-500 rounded-full transition-all"
                style={{ width: `${pct}%` }} />
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-400 text-center py-2">No delivery runs scheduled today</p>
        )}
      </div>
    </div>
  )
}

// ── Inventory Health strip ────────────────────────────────────
function InventoryStrip({ summary, wh2Items, expiringItems }) {
  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-blue-100 rounded-lg"><Boxes size={15} className="text-blue-600" /></div>
          <h3 className="font-bold text-gray-900 text-sm">Inventory Health</h3>
        </div>
        <Link to="/inventory" className="text-xs text-blue-500 hover:text-blue-700 font-medium flex items-center gap-1">
          View all <ChevronRight size={11} />
        </Link>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total SKUs',   value: summary.total_skus,          color: 'text-blue-700',   bg: 'from-blue-50 to-blue-50/50',   border: 'border-blue-100' },
          { label: 'Stockouts',    value: summary.stockout_count,      color: summary.stockout_count > 0 ? 'text-red-700' : 'text-emerald-700', bg: summary.stockout_count > 0 ? 'from-red-50 to-red-50/50' : 'from-emerald-50 to-emerald-50/50', border: summary.stockout_count > 0 ? 'border-red-100' : 'border-emerald-100' },
          { label: 'Low Stock',    value: summary.low_stock_count,     color: summary.low_stock_count > 0 ? 'text-amber-700' : 'text-emerald-700', bg: summary.low_stock_count > 0 ? 'from-amber-50 to-amber-50/50' : 'from-emerald-50 to-emerald-50/50', border: summary.low_stock_count > 0 ? 'border-amber-100' : 'border-emerald-100' },
          { label: 'Expiring <30d', value: summary.expiring_critical,  color: summary.expiring_critical > 0 ? 'text-orange-700' : 'text-emerald-700', bg: summary.expiring_critical > 0 ? 'from-orange-50 to-orange-50/50' : 'from-emerald-50 to-emerald-50/50', border: summary.expiring_critical > 0 ? 'border-orange-100' : 'border-emerald-100' },
        ].map(({ label, value, color, bg, border }) => (
          <Link key={label} to="/inventory"
            className={`bg-gradient-to-br ${bg} border ${border} rounded-2xl p-4 text-center hover:shadow-md transition-all hover:scale-[1.02]`}>
            <div className={`text-2xl font-bold ${color} leading-none`}>{value ?? 0}</div>
            <div className="text-xs text-gray-500 mt-1 font-medium">{label}</div>
          </Link>
        ))}
      </div>

      {/* Expiring items list */}
      {expiringItems && expiringItems.length > 0 && (
        <div className="mt-4 space-y-1.5">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Expiring Soon</p>
          {expiringItems.slice(0, 3).map((b, i) => (
            <div key={i} className={`flex items-center justify-between p-2.5 rounded-xl ${b.days_to_expiry <= 30 ? 'bg-red-50 border border-red-100' : 'bg-amber-50 border border-amber-100'}`}>
              <div className="min-w-0">
                <span className="font-medium text-sm text-gray-800 truncate block">{b.product_name}</span>
                <span className="text-xs text-gray-400">{b.sku_code} · {b.cases_remaining} cases</span>
              </div>
              <span className={`ml-3 flex-shrink-0 text-xs font-bold px-2.5 py-1 rounded-full ${b.days_to_expiry <= 30 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                {b.days_to_expiry}d
              </span>
            </div>
          ))}
        </div>
      )}

      {/* WH2 transfer suggestions */}
      {wh2Items && wh2Items.length > 0 && (
        <div className="mt-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">WH2 → WH1 Transfer Needed</p>
            <Link to="/transfers" className="text-xs text-blue-500 hover:text-blue-700 font-medium">Transfer →</Link>
          </div>
          <div className="flex flex-wrap gap-2">
            {wh2Items.slice(0, 5).map((item, i) => (
              <div key={i} className="flex items-center gap-1.5 bg-yellow-50 border border-yellow-200 rounded-xl px-2.5 py-1.5">
                <span className="text-xs font-medium text-gray-700 truncate max-w-[100px]">{item.product_name}</span>
                <span className="text-xs font-bold text-yellow-700 flex-shrink-0">{item.wh2_cases}</span>
              </div>
            ))}
            {wh2Items.length > 5 && (
              <span className="text-xs text-gray-400 self-center">+{wh2Items.length - 5} more</span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Overdue Orders mini card ──────────────────────────────────
function OverdueOrdersCard({ orders }) {
  if (!orders || orders.length === 0) return null
  return (
    <div className="card border-l-4 border-l-red-400 !py-3">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <AlertTriangle size={14} className="text-red-500" />
          <span className="font-bold text-sm text-gray-900">Overdue Orders</span>
          <span className="text-xs font-bold bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full">{orders.length}</span>
        </div>
        <Link to="/orders" className="text-xs text-blue-500 hover:text-blue-700 font-medium flex items-center gap-1">
          All orders <ChevronRight size={11} />
        </Link>
      </div>
      <div className="space-y-1.5">
        {orders.slice(0, 4).map((o, i) => (
          <div key={i} className="flex items-center justify-between p-2 bg-red-50 rounded-xl">
            <div>
              <span className="font-semibold text-sm text-gray-800">{o.order_number}</span>
              <span className="text-xs text-gray-500 ml-2">{o.store_name}</span>
            </div>
            <span className="text-xs font-bold text-red-700 bg-red-100 px-2 py-0.5 rounded-full">{o.days_pending}d overdue</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Main Dashboard ────────────────────────────────────────────
export default function Dashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [data,       setData]       = useState(null)
  const [loading,    setLoading]    = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [loadError,  setLoadError]  = useState(false)
  const [sendingReminders, setSendingReminders] = useState(false)

  const load = async (silent = false) => {
    if (!silent) setLoading(true); else setRefreshing(true)
    setLoadError(false)
    try { const r = await dashboardAPI.get(); setData(r.data) }
    catch { setLoadError(true) }
    setLoading(false); setRefreshing(false)
  }

  const handleSendReminders = async () => {
    setSendingReminders(true)
    try {
      await invoiceAPI.sendReminders()
      navigate('/invoices')
    } catch {
      navigate('/invoices')
    } finally { setSendingReminders(false) }
  }

  useEffect(() => { load() }, [])

  if (loading) return (
    <div className="flex flex-col items-center justify-center h-72 gap-4">
      <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg animate-pulse">
        <RefreshCw size={22} className="text-white animate-spin" />
      </div>
      <p className="text-sm text-gray-400 font-medium">Loading your dashboard…</p>
    </div>
  )
  if (loadError) return (
    <div className="flex flex-col items-center justify-center h-72 gap-4">
      <AlertTriangle size={32} className="text-red-400" />
      <p className="text-sm text-gray-500">Dashboard failed to load.</p>
      <button className="btn-primary text-sm px-4 py-2" onClick={() => load()}>Retry</button>
    </div>
  )
  if (!data) return null

  const { summary, expiring_soon, wh2_only_items, top_sellers, slow_movers, overdue_orders, activity_feed } = data

  return (
    <div className="space-y-5 pb-6">

      {/* ① Hero */}
      <HeroCard user={user} summary={summary} onRefresh={() => load(true)} refreshing={refreshing} />

      {/* ② Today's Operations snapshot */}
      <TodaySnapshot summary={summary} />

      {/* ③ Main split: Attention + Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        <div className="lg:col-span-3">
          <AttentionPanel summary={summary} overdueOrders={overdue_orders} expiringItems={expiring_soon} />
        </div>
        <div className="lg:col-span-2 flex flex-col gap-5">
          <QuickActions />
        </div>
      </div>

      {/* ④ Overdue orders (only shown when exist) */}
      {overdue_orders?.length > 0 && <OverdueOrdersCard orders={overdue_orders} />}

      {/* ⑤ Finance + Delivery */}
      <FinanceDeliveryRow summary={summary} />

      {/* ⑥ Top Sellers + Activity Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <TopSellers items={top_sellers} />
        <ActivityFeed items={activity_feed} />
      </div>

      {/* ⑦ Inventory Health (with expiry + WH2) */}
      <InventoryStrip summary={summary} wh2Items={wh2_only_items} expiringItems={expiring_soon} />

    </div>
  )
}
