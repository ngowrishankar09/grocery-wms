import { NavLink, Link, useLocation } from 'react-router-dom'
import { useT } from '../i18n/translations'
import { useEffect, useState, useRef } from 'react'
import { notificationsAPI } from '../api/client'
import { useAuth, ROLE_NAV } from '../context/AuthContext'
import {
  LayoutDashboard, Package, Truck, ShoppingCart,
  Warehouse, ArrowLeftRight, TrendingUp, Users, Globe, Settings, SendHorizonal,
  Bell, FileText, ClipboardList, X, AlertTriangle, Clock, Archive, ChevronRight,
  LayoutGrid, Table2, BookOpen, MapPin, ShoppingBag, Smartphone, Menu, Store,
  RotateCcw, Receipt, UserCircle2, LogOut, Shield, Tags, ChevronDown, CheckSquare, BarChart2,
  GitBranch, FileX, Scale, Activity, CreditCard, DollarSign, ScanLine, Factory
} from 'lucide-react'

const navGroups = (t) => [
  {
    label: 'Operations',
    items: [
      { to: '/app',            icon: LayoutDashboard, label: t('dashboard') },
      { to: '/inventory',      icon: Warehouse,       label: t('inventory') },
      { to: '/receiving',      icon: Truck,           label: t('receiving') },
      { to: '/dispatch',       icon: SendHorizonal,   label: 'Dispatch' },
      { to: '/dispatch-board', icon: LayoutGrid,      label: 'Dispatch Board' },
      { to: '/drivers',        icon: UserCircle2,     label: 'Drivers' },
      { to: '/quotes',         icon: FileText,        label: 'Quotations' },
      { to: '/orders',         icon: ShoppingCart,    label: t('orders') },
      { to: '/transfers',      icon: ArrowLeftRight,  label: t('transfers') },
      { to: '/picking',          icon: Smartphone,      label: 'Mobile Picking' },
      { to: '/order-check',      icon: ScanLine,        label: 'Order Check' },
      { to: '/repacking',        icon: Factory,         label: 'Repacking' },
      { to: '/warehouse-tasks',  icon: CheckSquare,     label: 'Warehouse Tasks' },
      { to: '/traceability',     icon: GitBranch,       label: 'Traceability' },
      { to: '/supplier-asn',     icon: Truck,           label: 'Supplier ASN' },
    ],
  },
  {
    label: 'Planning',
    items: [
      { to: '/forecasting',     icon: TrendingUp,    label: t('forecasting') },
      { to: '/purchase-orders', icon: ShoppingBag,   label: 'Purchase Orders' },
      { to: '/stock-take',      icon: ClipboardList, label: 'Stock Take' },
    ],
  },
  {
    label: 'Management',
    items: [
      { to: '/customers',     icon: Store,     label: 'Customers' },
      { to: '/returns',       icon: RotateCcw, label: 'Returns' },
      { to: '/credit-notes',  icon: FileX,     label: 'Credit Notes' },
      { to: '/invoices',      icon: Receipt,   label: 'Invoices' },
      { to: '/vendor-bills',  icon: DollarSign, label: 'Vendor Bills' },
      { to: '/finance',       icon: BarChart2,  label: 'Finance' },
      { to: '/balance-sheet', icon: Scale,      label: 'Balance Sheet' },
      { to: '/price-lists',   icon: Tags,      label: 'Price Lists' },
      { to: '/skus',          icon: Package,   label: t('skuMaster') },
      { to: '/vendors',       icon: Users,     label: t('vendors') },
      { to: '/bin-locations',        icon: MapPin,     label: 'Bin Locations' },
      { to: '/expiry-alerts',        icon: AlertTriangle, label: 'Expiry Alerts' },
      { to: '/reports',              icon: FileText,   label: 'Reports' },
      { to: '/kpi-scorecard',        icon: BarChart2,  label: 'KPI Scorecard' },
      { to: '/customer-statements',  icon: FileText,   label: 'Statements' },
    ],
  },
  {
    label: 'Admin',
    items: [
      { to: '/users',       icon: Shield,    label: 'Users' },
      { to: '/audit-log',   icon: Activity,  label: 'Audit Log' },
      { to: '/spreadsheet', icon: Table2,    label: 'Spreadsheets' },
      { to: '/quickbooks',  icon: BookOpen,  label: 'QuickBooks' },
      { to: '/settings',    icon: Settings,  label: 'Settings' },
    ],
  },
]

// ── Severity colours ─────────────────────────────────────────
const SEVERITY_STYLES = {
  critical: { dot: 'bg-red-500',    text: 'text-red-700',    bg: 'bg-red-50',    icon: 'text-red-500' },
  high:     { dot: 'bg-orange-500', text: 'text-orange-700', bg: 'bg-orange-50', icon: 'text-orange-500' },
  medium:   { dot: 'bg-yellow-500', text: 'text-yellow-700', bg: 'bg-yellow-50', icon: 'text-yellow-600' },
  low:      { dot: 'bg-blue-400',   text: 'text-blue-700',   bg: 'bg-blue-50',   icon: 'text-blue-500' },
}

function AlertIcon({ type }) {
  if (type === 'expiry') return <Clock size={15} />
  if (type === 'stock')  return <Archive size={15} />
  return <AlertTriangle size={15} />
}

// ── Notifications bell + flyout ───────────────────────────────
function NotificationsBell({ align = 'right', dark = false }) {
  const [data,    setData]    = useState(null)
  const [open,    setOpen]    = useState(false)
  const [loading, setLoading] = useState(false)
  const ref = useRef(null)

  const load = async () => {
    setLoading(true)
    try {
      const r = await notificationsAPI.get()
      setData(r.data)
    } catch {}
    setLoading(false)
  }

  useEffect(() => { load() }, [])
  useEffect(() => {
    const id = setInterval(() => load(), 5 * 60 * 1000)
    return () => clearInterval(id)
  }, [])
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const urgentCount = data ? data.critical + data.high : 0

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => { setOpen(o => !o); if (!open) load() }}
        className={`relative p-2 rounded-lg transition-colors ${
          dark
            ? 'text-gray-400 hover:text-white hover:bg-gray-700'
            : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
        }`}
        title="Notifications"
      >
        <Bell size={18} />
        {urgentCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[17px] h-[17px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
            {urgentCount > 99 ? '99+' : urgentCount}
          </span>
        )}
      </button>

      {open && (
        <div className={`absolute ${align === 'left' ? 'left-0' : 'right-0'} top-full mt-2 w-96 bg-white rounded-2xl shadow-2xl border border-gray-100 z-50 flex flex-col max-h-[80vh]`}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <Bell size={16} className="text-gray-500" />
              <span className="font-bold text-gray-900">Alerts</span>
              {data && data.total > 0 && (
                <span className="bg-red-100 text-red-700 text-xs font-bold px-2 py-0.5 rounded-full">{data.total}</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button onClick={load} className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1 rounded hover:bg-gray-100">Refresh</button>
              <button onClick={() => setOpen(false)} className="p-1 text-gray-400 hover:text-gray-600 rounded"><X size={14} /></button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loading && !data ? (
              <div className="py-8 text-center text-gray-400 text-sm">Loading…</div>
            ) : !data || data.alerts.length === 0 ? (
              <div className="py-10 text-center">
                <div className="text-3xl mb-2">✅</div>
                <p className="text-sm text-green-700 font-medium">All clear! No alerts right now.</p>
                <p className="text-xs text-gray-400 mt-1">We'll notify you of any issues</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {data.alerts.map((alert) => {
                  const s = SEVERITY_STYLES[alert.severity] || SEVERITY_STYLES.low
                  return (
                    <Link
                      key={alert.id}
                      to={alert.link || '/'}
                      onClick={() => setOpen(false)}
                      className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50 transition-colors"
                    >
                      <div className={`mt-0.5 flex-shrink-0 ${s.icon}`}><AlertIcon type={alert.type} /></div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${s.dot}`} />
                          <span className={`text-xs font-bold uppercase tracking-wide ${s.text}`}>{alert.severity}</span>
                          <span className="text-xs text-gray-400">{alert.type}</span>
                        </div>
                        <p className="text-sm font-semibold text-gray-800 truncate">{alert.title}</p>
                        <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{alert.message}</p>
                        {alert.action && (
                          <span className={`inline-block mt-1 text-xs px-2 py-0.5 rounded-full ${s.bg} ${s.text} font-medium`}>→ {alert.action}</span>
                        )}
                      </div>
                      <ChevronRight size={14} className="text-gray-300 flex-shrink-0 mt-1" />
                    </Link>
                  )
                })}
              </div>
            )}
          </div>

          {data && data.total > 0 && (
            <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50 rounded-b-2xl flex items-center justify-between text-xs text-gray-500">
              <span>{data.critical} critical · {data.high} high · {data.medium} medium</span>
              <Link to="/reports" onClick={() => setOpen(false)} className="text-blue-500 hover:underline font-medium">Full report →</Link>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Page title map ────────────────────────────────────────────
const PAGE_TITLES = {
  '/app': 'Dashboard',
  '/inventory': 'Inventory',
  '/receiving': 'Receiving',
  '/dispatch': 'Dispatch',
  '/dispatch-board': 'Dispatch Board',
  '/drivers': 'Drivers',
  '/orders': 'Orders',
  '/transfers': 'Transfers',
  '/picking': 'Mobile Picking',
  '/order-check': 'Order Check',
  '/repacking':   'Repacking / Production',
  '/forecasting': 'Forecasting',
  '/purchase-orders': 'Purchase Orders',
  '/stock-take': 'Stock Take',
  '/customers': 'Customers',
  '/returns': 'Returns',
  '/invoices': 'Invoices',
  '/price-lists': 'Price Lists',
  '/skus': 'SKU Master',
  '/vendors': 'Vendors',
  '/bin-locations': 'Bin Locations',
  '/reports': 'Reports',
  '/users': 'Users',
  '/spreadsheet': 'Spreadsheets',
  '/quickbooks': 'QuickBooks',
  '/finance':    'Finance',
  '/settings': 'Settings',
  '/traceability': 'Traceability',
  '/supplier-asn': 'Supplier ASN',
  '/kpi-scorecard': 'KPI Scorecard',
  '/customer-statements': 'Customer Statements',
  '/quotes': 'Sales Quotations',
  '/credit-notes': 'Credit Notes',
  '/vendor-bills': 'Vendor Bills',
  '/balance-sheet': 'Balance Sheet',
  '/expiry-alerts': 'Expiry Alerts',
  '/audit-log': 'Audit Log',
  '/onboarding': 'Setup Wizard',
}

const ROLE_COLORS = {
  admin:     'bg-red-500',
  manager:   'bg-purple-500',
  warehouse: 'bg-blue-500',
  driver:    'bg-green-500',
  readonly:  'bg-gray-500',
}

// ── Top header bar (desktop only) ────────────────────────────
function TopBar({ user, logout }) {
  const location = useLocation()

  const title = Object.entries(PAGE_TITLES)
    .filter(([path]) => location.pathname === path || location.pathname.startsWith(path + '/'))
    .sort((a, b) => b[0].length - a[0].length)[0]?.[1] || 'RapidDock WMS'

  const initials = user
    ? (user.full_name || user.username || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : '?'

  return (
    <header className="hidden md:flex items-center justify-between h-14 px-6 bg-white border-b border-gray-200 flex-shrink-0">
      <div className="flex items-center gap-3">
        <h2 className="text-[15px] font-semibold text-gray-900">{title}</h2>
      </div>
      <div className="flex items-center gap-1">
        <NotificationsBell align="right" dark={false} />
        <div className="w-px h-6 bg-gray-200 mx-2" />
        <div className="flex items-center gap-2.5">
          <div className={`w-8 h-8 rounded-full ${ROLE_COLORS[user?.role] || 'bg-gray-500'} flex items-center justify-center text-white text-xs font-bold flex-shrink-0`}>
            {initials}
          </div>
          <div className="hidden lg:block leading-none">
            <p className="text-sm font-semibold text-gray-800">{user?.full_name || user?.username}</p>
            <p className="text-[11px] text-gray-400 capitalize mt-0.5">{user?.role}</p>
          </div>
        </div>
        <button
          onClick={logout}
          title="Logout"
          className="ml-2 p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
        >
          <LogOut size={15} />
        </button>
      </div>
    </header>
  )
}

// ── Sidebar nav content ───────────────────────────────────────
function SidebarContent({ t, lang, setLang, onNavClick, user, logout }) {
  const allowed = user ? ROLE_NAV[user.role] : null

  const filteredGroups = navGroups(t).map(group => ({
    ...group,
    items: group.items.filter(item => !allowed || allowed.includes(item.to)),
  })).filter(group => group.items.length > 0)

  const initials = user
    ? (user.full_name || user.username || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : '?'

  return (
    <>
      <nav className="flex-1 p-3 overflow-y-auto space-y-4">
        {filteredGroups.map((group) => (
          <div key={group.label}>
            <p className="px-3 mb-1.5 text-[10px] font-bold uppercase tracking-widest text-gray-500">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {group.items.map(({ to, icon: Icon, label }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={to === '/app'}
                  onClick={onNavClick}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                    }`
                  }
                >
                  <Icon size={16} />
                  {label}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Language toggle */}
      <div className="px-4 py-3 border-t border-gray-800">
        <div className="flex items-center gap-2 text-[11px] text-gray-500 mb-2">
          <Globe size={12} /> Language / Idioma
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setLang('en')}
            className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              lang === 'en' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white'
            }`}
          >
            English
          </button>
          <button
            onClick={() => setLang('es')}
            className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              lang === 'es' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white'
            }`}
          >
            Español
          </button>
        </div>
      </div>

      {/* User panel (mobile / sidebar) */}
      {user && (
        <div className="px-3 py-3 border-t border-gray-800">
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-full ${ROLE_COLORS[user.role] || 'bg-gray-600'} flex items-center justify-center text-white text-xs font-bold flex-shrink-0`}>
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{user.full_name || user.username}</p>
              <p className="text-xs text-gray-400 capitalize">{user.role}</p>
            </div>
            <button
              onClick={logout}
              title="Logout"
              className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-700 transition-colors flex-shrink-0"
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>
      )}
    </>
  )
}

// ── Main Layout ───────────────────────────────────────────────
const FULL_SCREEN_ROUTES = ['/spreadsheet', '/dispatch-board']

export default function Layout({ children, lang, setLang }) {
  const t = useT(lang)
  const location = useLocation()
  const { user, logout } = useAuth()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const isFullScreen = FULL_SCREEN_ROUTES.some(r => location.pathname.startsWith(r))

  useEffect(() => { setDrawerOpen(false) }, [location.pathname])

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">

      {/* ── Desktop sidebar ── */}
      <aside className="hidden md:flex w-60 bg-gray-900 flex-col flex-shrink-0">
        {/* Brand header */}
        <div className="p-4 border-b border-gray-800">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center flex-shrink-0">
              <Truck size={17} className="text-white" />
            </div>
            <div>
              <h1 className="text-[15px] font-bold text-white leading-none">RapidDock</h1>
              <p className="text-[10px] text-blue-400 font-semibold tracking-widest mt-0.5">WMS PLATFORM</p>
            </div>
          </div>
        </div>
        <SidebarContent t={t} lang={lang} setLang={setLang} onNavClick={() => {}} user={user} logout={logout} />
      </aside>

      {/* ── Mobile drawer overlay ── */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 bg-black/60 md:hidden" onClick={() => setDrawerOpen(false)} />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-72 bg-gray-900 flex flex-col transform transition-transform duration-300 md:hidden ${
          drawerOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="p-4 border-b border-gray-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-blue-600 rounded-xl flex items-center justify-center flex-shrink-0">
              <Truck size={15} className="text-white" />
            </div>
            <div>
              <h1 className="text-[14px] font-bold text-white leading-none">RapidDock</h1>
              <p className="text-[10px] text-blue-400 font-semibold tracking-widest mt-0.5">WMS PLATFORM</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <NotificationsBell align="left" dark />
            <button
              onClick={() => setDrawerOpen(false)}
              className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-700"
            >
              <X size={18} />
            </button>
          </div>
        </div>
        <SidebarContent t={t} lang={lang} setLang={setLang} onNavClick={() => setDrawerOpen(false)} user={user} logout={logout} />
      </aside>

      {/* ── Main content ── */}
      <div className="flex-1 overflow-hidden flex flex-col min-w-0">

        {/* Mobile top bar */}
        <header className="md:hidden flex items-center justify-between px-4 py-3 bg-gray-900 flex-shrink-0">
          <button
            onClick={() => setDrawerOpen(true)}
            className="p-1.5 rounded-lg text-gray-300 hover:bg-gray-700"
          >
            <Menu size={22} />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-blue-600 rounded-md flex items-center justify-center">
              <Truck size={12} className="text-white" />
            </div>
            <span className="font-bold text-sm text-white">RapidDock WMS</span>
          </div>
          <NotificationsBell dark />
        </header>

        {/* Desktop top bar */}
        <TopBar user={user} logout={logout} />

        <main className="flex-1 overflow-hidden flex flex-col">
          {isFullScreen ? (
            children
          ) : (
            <div className="flex-1 overflow-y-auto p-4 md:p-6">
              {children}
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
