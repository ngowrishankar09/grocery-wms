import { Link } from 'react-router-dom'
import {
  Truck, Package, ShoppingCart, BarChart2, Receipt, Users,
  ArrowRight, CheckCircle, Warehouse, TrendingUp, Globe, Shield,
  Zap, Clock, Star
} from 'lucide-react'

// ── Feature cards ─────────────────────────────────────────────
const FEATURES = [
  {
    icon: Package,
    title: 'Real-time Inventory',
    desc: 'Track every SKU, batch, and bin location across multiple warehouses with live stock levels and expiry alerts.',
    color: 'bg-blue-50 text-blue-600',
  },
  {
    icon: ShoppingCart,
    title: 'Order Management',
    desc: 'From customer order to picking, packing, and dispatch — manage the entire fulfilment workflow in one place.',
    color: 'bg-purple-50 text-purple-600',
  },
  {
    icon: Truck,
    title: 'Dispatch & Drivers',
    desc: 'Plan delivery runs, assign drivers, track completion, and monitor real-time dispatch progress on a live board.',
    color: 'bg-teal-50 text-teal-600',
  },
  {
    icon: Receipt,
    title: 'Invoicing & QuickBooks',
    desc: 'Auto-generate invoices on dispatch, customise number formats, and sync invoice counters with QuickBooks.',
    color: 'bg-green-50 text-green-600',
  },
  {
    icon: TrendingUp,
    title: 'Forecasting & Reporting',
    desc: 'Understand demand trends, identify slow movers, and make data-driven purchasing decisions with ease.',
    color: 'bg-orange-50 text-orange-600',
  },
  {
    icon: Globe,
    title: 'Customer Portal',
    desc: 'Give your customers a branded self-service portal to browse your catalogue, place orders and view invoices.',
    color: 'bg-indigo-50 text-indigo-600',
  },
]

const STATS = [
  { value: '10,000+', label: 'SKUs managed' },
  { value: '99.9%',   label: 'Uptime SLA' },
  { value: '6',       label: 'User roles' },
  { value: '2',       label: 'Warehouses' },
]

const HIGHLIGHTS = [
  'Multi-warehouse stock tracking',
  'Barcode scanning for receiving & picking',
  'Automatic low-stock & expiry alerts',
  'Mobile-friendly picking interface',
  'Custom invoice number formats',
  'Bilingual English / Español support',
]

export default function Home() {
  return (
    <div className="min-h-screen bg-white font-sans">

      {/* ── Navbar ─────────────────────────────────────────────── */}
      <header className="fixed top-0 inset-x-0 z-50 bg-white/80 backdrop-blur border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-blue-600 rounded-xl flex items-center justify-center">
              <Truck size={16} className="text-white" />
            </div>
            <div>
              <span className="text-[15px] font-bold text-gray-900 leading-none">RapidDock</span>
              <span className="text-[10px] font-semibold text-blue-500 tracking-widest ml-1.5 hidden sm:inline">WMS</span>
            </div>
          </div>

          {/* Nav links (desktop) */}
          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-gray-600">
            <a href="#features" className="hover:text-gray-900 transition-colors">Features</a>
            <a href="#how-it-works" className="hover:text-gray-900 transition-colors">How it works</a>
            <a href="#stats" className="hover:text-gray-900 transition-colors">Platform</a>
          </nav>

          {/* Sign in */}
          <Link
            to="/login"
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors shadow-sm"
          >
            Sign In <ArrowRight size={14} />
          </Link>
        </div>
      </header>

      {/* ── Hero ───────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-950 pt-32 pb-24">
        {/* Decorative blobs */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-32 -right-32 w-[600px] h-[600px] rounded-full bg-blue-600/10 blur-3xl" />
          <div className="absolute -bottom-24 -left-24 w-[400px] h-[400px] rounded-full bg-indigo-600/10 blur-3xl" />
        </div>

        <div className="relative max-w-7xl mx-auto px-6 text-center">
          <div className="inline-flex items-center gap-2 bg-blue-600/20 border border-blue-500/30 text-blue-300 text-xs font-semibold px-4 py-1.5 rounded-full mb-6">
            <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
            Now live at rapiddockwms.com
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-white leading-tight max-w-4xl mx-auto">
            Warehouse Management,{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-400">
              Built for Speed
            </span>
          </h1>

          <p className="mt-6 text-lg text-slate-300 max-w-2xl mx-auto leading-relaxed">
            RapidDock WMS gives grocery distributors and wholesalers full control —
            from receiving and inventory to picking, dispatch, invoicing and beyond.
          </p>

          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              to="/login"
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-bold px-7 py-3.5 rounded-xl text-sm transition-colors shadow-lg shadow-blue-900/40"
            >
              Sign In to Your Account <ArrowRight size={16} />
            </Link>
            <a
              href="#features"
              className="flex items-center gap-2 text-slate-300 hover:text-white font-medium text-sm border border-slate-600 hover:border-slate-400 px-6 py-3.5 rounded-xl transition-colors"
            >
              Explore Features
            </a>
          </div>
        </div>

        {/* Dashboard preview mockup */}
        <div className="relative max-w-5xl mx-auto mt-16 px-6">
          <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur overflow-hidden shadow-2xl">
            {/* Fake browser bar */}
            <div className="flex items-center gap-1.5 px-4 py-3 bg-white/5 border-b border-white/10">
              <div className="w-3 h-3 rounded-full bg-red-400/60" />
              <div className="w-3 h-3 rounded-full bg-yellow-400/60" />
              <div className="w-3 h-3 rounded-full bg-green-400/60" />
              <div className="ml-3 flex-1 bg-white/10 rounded-md h-5 max-w-xs text-[10px] text-white/40 flex items-center px-2">
                rapiddockwms.com/app
              </div>
            </div>
            {/* Dashboard preview */}
            <div className="p-4 bg-slate-800/60">
              {/* Top header */}
              <div className="flex items-center justify-between mb-3 bg-white/5 rounded-lg px-3 py-2">
                <span className="text-xs text-white/60 font-medium">Dashboard</span>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded bg-white/10" />
                  <div className="w-16 h-3 rounded bg-white/10" />
                </div>
              </div>
              {/* Welcome card */}
              <div className="rounded-xl bg-gradient-to-r from-blue-600/80 to-indigo-700/80 p-4 mb-3">
                <div className="text-xs text-blue-200 mb-1 font-semibold">Good morning, Admin!</div>
                <div className="grid grid-cols-4 gap-3 mt-3 pt-3 border-t border-white/20">
                  {['248 SKUs', '12 Orders', '$24,800', '3,200 cases'].map(v => (
                    <div key={v} className="text-center">
                      <div className="text-sm font-bold text-white">{v}</div>
                    </div>
                  ))}
                </div>
              </div>
              {/* Stat cards row */}
              <div className="grid grid-cols-4 gap-2 mb-3">
                {[
                  { c: 'bg-blue-500/30', t: 'Total SKUs', v: '248' },
                  { c: 'bg-red-500/30',  t: 'Stockouts',  v: '3' },
                  { c: 'bg-yellow-500/30',t:'Low Stock',   v: '7' },
                  { c: 'bg-purple-500/30',t:'Pending',    v: '12' },
                ].map(({ c, t, v }) => (
                  <div key={t} className={`${c} rounded-lg p-2.5`}>
                    <div className="text-base font-bold text-white">{v}</div>
                    <div className="text-[10px] text-white/60 mt-0.5">{t}</div>
                  </div>
                ))}
              </div>
              {/* Bottom panels */}
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-1 bg-white/5 rounded-lg p-2.5 h-16 flex flex-col gap-1">
                  <div className="text-[10px] text-white/40 font-semibold">Recent Activity</div>
                  <div className="flex-1 space-y-1">
                    <div className="h-2 bg-white/10 rounded" />
                    <div className="h-2 bg-white/10 rounded w-3/4" />
                  </div>
                </div>
                <div className="col-span-1 bg-white/5 rounded-lg p-2.5 h-16 flex flex-col gap-1">
                  <div className="text-[10px] text-white/40 font-semibold">Top Sellers</div>
                  <div className="flex-1 space-y-1">
                    <div className="h-2 bg-white/10 rounded" />
                    <div className="h-2 bg-white/10 rounded w-2/3" />
                  </div>
                </div>
                <div className="col-span-1 bg-white/5 rounded-lg p-2.5 h-16 flex flex-col gap-1">
                  <div className="text-[10px] text-white/40 font-semibold">Expiring Soon</div>
                  <div className="flex-1 space-y-1">
                    <div className="h-2 bg-red-400/30 rounded" />
                    <div className="h-2 bg-yellow-400/20 rounded w-4/5" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Stats bar ──────────────────────────────────────────── */}
      <section id="stats" className="bg-blue-600 py-12">
        <div className="max-w-5xl mx-auto px-6 grid grid-cols-2 sm:grid-cols-4 gap-8 text-center">
          {STATS.map(({ value, label }) => (
            <div key={label}>
              <div className="text-3xl font-extrabold text-white">{value}</div>
              <div className="text-sm text-blue-100 mt-1">{label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features ───────────────────────────────────────────── */}
      <section id="features" className="py-24 bg-gray-50">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-14">
            <p className="text-blue-600 font-semibold text-sm uppercase tracking-widest mb-3">Everything you need</p>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900">
              One platform. Every warehouse operation.
            </h2>
            <p className="mt-4 text-gray-500 max-w-xl mx-auto">
              RapidDock covers the entire supply chain — from the moment stock arrives to the moment it leaves your door.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map(({ icon: Icon, title, desc, color }) => (
              <div key={title} className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center mb-4 ${color}`}>
                  <Icon size={20} />
                </div>
                <h3 className="font-bold text-gray-900 mb-2">{title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ───────────────────────────────────────── */}
      <section id="how-it-works" className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div>
              <p className="text-blue-600 font-semibold text-sm uppercase tracking-widest mb-3">Built for your workflow</p>
              <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-6">
                Everything in one place,<br />accessible from anywhere
              </h2>
              <p className="text-gray-500 mb-8 leading-relaxed">
                Whether you're on the warehouse floor with a barcode scanner or in the office managing invoices,
                RapidDock is designed to keep your entire team in sync — across devices, warehouses, and roles.
              </p>
              <ul className="space-y-3">
                {HIGHLIGHTS.map(h => (
                  <li key={h} className="flex items-center gap-3 text-sm text-gray-700">
                    <CheckCircle size={16} className="text-green-500 flex-shrink-0" />
                    {h}
                  </li>
                ))}
              </ul>
              <Link
                to="/login"
                className="mt-8 inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm px-6 py-3 rounded-xl transition-colors"
              >
                Get Started <ArrowRight size={15} />
              </Link>
            </div>

            {/* Role cards */}
            <div className="grid grid-cols-2 gap-4">
              {[
                { icon: Shield,    role: 'Admin',     desc: 'Full system access, user management & settings', color: 'bg-red-500' },
                { icon: Warehouse, role: 'Manager',   desc: 'Oversee operations, reports & all workflows',    color: 'bg-purple-500' },
                { icon: Package,   role: 'Warehouse', desc: 'Receive, pick, dispatch & manage stock',         color: 'bg-blue-500' },
                { icon: Truck,     role: 'Driver',    desc: 'View delivery runs and update completion status',color: 'bg-green-500' },
              ].map(({ icon: Icon, role, desc, color }) => (
                <div key={role} className="rounded-2xl border border-gray-100 bg-gray-50 p-5">
                  <div className={`w-9 h-9 rounded-xl ${color} flex items-center justify-center mb-3`}>
                    <Icon size={16} className="text-white" />
                  </div>
                  <div className="font-bold text-gray-900 text-sm mb-1">{role}</div>
                  <div className="text-xs text-gray-500 leading-relaxed">{desc}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA ────────────────────────────────────────────────── */}
      <section className="bg-gradient-to-br from-blue-600 to-indigo-700 py-20">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <Zap size={32} className="text-yellow-300 mx-auto mb-4" />
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white mb-4">
            Ready to run your warehouse smarter?
          </h2>
          <p className="text-blue-100 mb-8 text-lg">
            Sign in to your RapidDock WMS account and take control of your operations today.
          </p>
          <Link
            to="/login"
            className="inline-flex items-center gap-2 bg-white text-blue-700 font-bold text-sm px-8 py-4 rounded-xl hover:bg-blue-50 transition-colors shadow-xl"
          >
            Sign In to RapidDock <ArrowRight size={16} />
          </Link>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────── */}
      <footer className="bg-slate-900 py-10">
        <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center">
              <Truck size={13} className="text-white" />
            </div>
            <span className="text-sm font-bold text-white">RapidDock WMS</span>
          </div>
          <p className="text-xs text-slate-500">© {new Date().getFullYear()} RapidDock WMS. All rights reserved.</p>
          <Link to="/login" className="text-xs text-blue-400 hover:text-blue-300 font-medium transition-colors">
            Sign In →
          </Link>
        </div>
      </footer>
    </div>
  )
}
