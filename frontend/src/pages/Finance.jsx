/**
 * Finance Page
 * ============
 * QuickBooks-style P&L dashboard + SAP-style journal ledger.
 *
 * Sections:
 *   1. KPI bar  — Revenue / Cash Received / COGS / Gross Profit / AR Outstanding / Overdue
 *   2. Monthly P&L table  (revenue, cash collected, COGS, GP%, trend)
 *   3. Top customers by revenue
 *   4. Payment method breakdown
 *   5. Journal Entries ledger (SAP-style double-entry view)
 */

import { useState, useEffect } from 'react'
import { financialAPI, invoiceAPI } from '../api/client'
import {
  TrendingUp, TrendingDown, DollarSign, AlertTriangle,
  Users, BookOpen, RefreshCw, ChevronDown, ChevronUp,
  ArrowUpRight, ArrowDownRight, BarChart2, CreditCard,
  Banknote, CheckCircle
} from 'lucide-react'

const fmt  = (n) => `$${(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fmtP = (n) => `${(n || 0).toFixed(1)}%`

const MONTH_LABELS = {
  '01': 'Jan', '02': 'Feb', '03': 'Mar', '04': 'Apr',
  '05': 'May', '06': 'Jun', '07': 'Jul', '08': 'Aug',
  '09': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Dec',
}
const fmtMonth = (k) => {
  const [y, m] = k.split('-')
  return `${MONTH_LABELS[m] || m} ${y}`
}

// ── KPI Card ──────────────────────────────────────────────────
function KPI({ label, value, sub, color = 'text-gray-900', bg = 'bg-white', icon: Icon, trend }) {
  return (
    <div className={`${bg} rounded-xl border border-gray-200 p-4 shadow-sm`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</p>
          <p className={`text-xl font-bold mt-1 ${color}`}>{value}</p>
          {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
        </div>
        {Icon && (
          <div className={`p-2 rounded-lg ${bg === 'bg-white' ? 'bg-gray-50' : 'bg-white/20'}`}>
            <Icon size={18} className={color} />
          </div>
        )}
      </div>
    </div>
  )
}

// ── Bar (simple inline bar chart) ─────────────────────────────
function Bar({ value, max, color = 'bg-blue-500' }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0
  return (
    <div className="w-full bg-gray-100 rounded-full h-1.5 mt-1">
      <div className={`${color} h-1.5 rounded-full transition-all`} style={{ width: `${pct}%` }} />
    </div>
  )
}

// ── Journal Ledger ────────────────────────────────────────────
function JournalLedger() {
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(null)

  useEffect(() => {
    invoiceAPI.journal(100)
      .then(r => setEntries(r.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const sourceColor = (t) => {
    if (t === 'invoice')   return 'bg-blue-50 text-blue-700'
    if (t === 'payment')   return 'bg-green-50 text-green-700'
    if (t === 'purchase')  return 'bg-purple-50 text-purple-700'
    if (t === 'receiving') return 'bg-amber-50 text-amber-700'
    return 'bg-gray-50 text-gray-600'
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b bg-gray-50 flex items-center gap-2">
        <BookOpen size={16} className="text-indigo-600" />
        <h3 className="font-semibold text-gray-900">Journal Ledger</h3>
        <span className="text-xs text-gray-400 ml-1">SAP-style double-entry</span>
        <span className="ml-auto text-xs text-gray-400">{entries.length} entries</span>
      </div>

      {loading ? (
        <div className="py-10 text-center text-gray-400 text-sm">Loading…</div>
      ) : entries.length === 0 ? (
        <div className="py-10 text-center text-gray-400 text-sm">
          <BookOpen size={32} className="mx-auto mb-2 opacity-30" />
          No journal entries yet — they are auto-created when invoices and payments are recorded.
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b text-xs text-gray-500 uppercase tracking-wide">
            <tr>
              <th className="w-6 px-3 py-3"></th>
              <th className="px-4 py-3 text-left">Entry #</th>
              <th className="px-4 py-3 text-left">Date</th>
              <th className="px-4 py-3 text-left">Description</th>
              <th className="px-4 py-3 text-center">Type</th>
              <th className="px-4 py-3 text-right">Debit</th>
              <th className="px-4 py-3 text-right">Credit</th>
            </tr>
          </thead>
          <tbody>
            {entries.map(e => {
              const totalDebit  = e.lines.reduce((s, l) => s + l.debit, 0)
              const totalCredit = e.lines.reduce((s, l) => s + l.credit, 0)
              const isOpen = expanded === e.id
              return [
                <tr key={e.id}
                  className="border-b border-gray-50 hover:bg-gray-50/60 cursor-pointer"
                  onClick={() => setExpanded(isOpen ? null : e.id)}>
                  <td className="px-3 py-3 text-gray-400 text-center">
                    {isOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs font-semibold text-gray-700">{e.entry_number}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{e.entry_date}</td>
                  <td className="px-4 py-3 text-gray-800 text-xs">{e.description}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${sourceColor(e.source_type)}`}>
                      {e.source_type || 'manual'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-xs font-semibold text-gray-800">{fmt(totalDebit)}</td>
                  <td className="px-4 py-3 text-right text-xs font-semibold text-gray-800">{fmt(totalCredit)}</td>
                </tr>,
                isOpen && (
                  <tr key={`${e.id}-lines`} className="border-b border-gray-100 bg-indigo-50/30">
                    <td colSpan={7} className="px-6 py-3">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-gray-500">
                            <th className="text-left pb-1 font-medium">Account</th>
                            <th className="text-right pb-1 font-medium w-28">Debit</th>
                            <th className="text-right pb-1 font-medium w-28">Credit</th>
                          </tr>
                        </thead>
                        <tbody>
                          {e.lines.map((l, i) => (
                            <tr key={i} className="border-t border-indigo-100">
                              <td className="py-1 text-gray-700">{l.account}</td>
                              <td className="py-1 text-right font-mono text-emerald-700">
                                {l.debit > 0 ? fmt(l.debit) : '—'}
                              </td>
                              <td className="py-1 text-right font-mono text-blue-700">
                                {l.credit > 0 ? fmt(l.credit) : '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </td>
                  </tr>
                )
              ]
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────
export default function Finance() {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [months,  setMonths]  = useState(6)
  const [tab,     setTab]     = useState('pl')   // pl | journal

  const load = async (m = months) => {
    setLoading(true)
    try {
      const r = await financialAPI.pl(m)
      setData(r.data)
    } catch {}
    setLoading(false)
  }

  useEffect(() => { load(months) }, [months])

  const t = data?.totals || {}
  const monthly  = data?.monthly  || []
  const topCusts = data?.top_customers || []
  const pmethods = data?.payment_methods || []

  const maxRev = Math.max(...monthly.map(m => m.revenue), 1)

  return (
    <div className="space-y-5 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <BarChart2 size={24} className="text-green-600" /> Finance
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">P&amp;L · Cash flow · Journal ledger</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={months}
            onChange={e => setMonths(Number(e.target.value))}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
          >
            <option value={3}>Last 3 months</option>
            <option value={6}>Last 6 months</option>
            <option value={12}>Last 12 months</option>
          </select>
          <button onClick={() => load(months)} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50">
            <RefreshCw size={15} className={loading ? 'animate-spin text-blue-500' : 'text-gray-500'} />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1">
        {[
          { id: 'pl',      label: 'P&L Report' },
          { id: 'journal', label: 'Journal Ledger' },
        ].map(t2 => (
          <button key={t2.id} onClick={() => setTab(t2.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t2.id ? 'bg-green-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}>
            {t2.label}
          </button>
        ))}
      </div>

      {tab === 'journal' ? (
        <JournalLedger />
      ) : loading ? (
        <div className="py-20 text-center text-gray-400">Loading financial data…</div>
      ) : (
        <>
          {/* KPI Row */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <KPI label="Revenue Billed"  value={fmt(t.revenue)}       icon={TrendingUp}   color="text-blue-700"   bg="bg-blue-50" />
            <KPI label="Cash Received"   value={fmt(t.cash_received)}  icon={Banknote}     color="text-green-700"  bg="bg-green-50" />
            <KPI label="COGS"            value={fmt(t.cogs)}           icon={TrendingDown} color="text-orange-700" bg="bg-orange-50" />
            <KPI label="Gross Profit"    value={fmt(t.gross_profit)}   sub={fmtP(t.gp_pct) + ' margin'}
                                                                        icon={DollarSign}   color="text-emerald-700" bg="bg-emerald-50" />
            <KPI label="AR Outstanding"  value={fmt(t.outstanding)}    icon={CreditCard}   color="text-amber-700"  bg="bg-amber-50" />
            <KPI label="Overdue"         value={fmt(t.overdue)}        icon={AlertTriangle} color="text-red-700"  bg="bg-red-50" />
          </div>

          {/* Monthly P&L Table */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b bg-gray-50">
              <h3 className="font-semibold text-gray-900">Monthly Profit &amp; Loss</h3>
              <p className="text-xs text-gray-400 mt-0.5">Revenue billed · Cash collected · COGS · Gross profit</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b text-xs text-gray-500 uppercase tracking-wide">
                  <tr>
                    <th className="px-5 py-3 text-left">Month</th>
                    <th className="px-5 py-3 text-right">Revenue</th>
                    <th className="px-5 py-3 text-right">Cash In</th>
                    <th className="px-5 py-3 text-right">COGS</th>
                    <th className="px-5 py-3 text-right">Gross Profit</th>
                    <th className="px-5 py-3 text-right">Margin</th>
                    <th className="px-10 py-3 text-left">Revenue Bar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {monthly.length === 0 ? (
                    <tr><td colSpan={7} className="py-10 text-center text-gray-400 text-sm">No invoice data in this period</td></tr>
                  ) : monthly.map((m, i) => (
                    <tr key={m.month} className={`hover:bg-gray-50/60 ${i % 2 === 0 ? '' : 'bg-gray-50/30'}`}>
                      <td className="px-5 py-3 font-semibold text-gray-900">{fmtMonth(m.month)}</td>
                      <td className="px-5 py-3 text-right font-mono text-blue-700">{fmt(m.revenue)}</td>
                      <td className="px-5 py-3 text-right font-mono text-green-700">{fmt(m.cash_received)}</td>
                      <td className="px-5 py-3 text-right font-mono text-orange-600">{fmt(m.cogs)}</td>
                      <td className={`px-5 py-3 text-right font-mono font-semibold ${m.gross_profit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                        {fmt(m.gross_profit)}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                          m.gp_pct >= 30 ? 'bg-green-100 text-green-700' :
                          m.gp_pct >= 15 ? 'bg-yellow-100 text-yellow-700' :
                          'bg-red-100 text-red-700'
                        }`}>
                          {fmtP(m.gp_pct)}
                        </span>
                      </td>
                      <td className="px-5 py-3 min-w-[120px]">
                        <Bar value={m.revenue} max={maxRev} color="bg-blue-400" />
                      </td>
                    </tr>
                  ))}
                </tbody>
                {monthly.length > 0 && (
                  <tfoot className="border-t-2 border-gray-200 bg-gray-50">
                    <tr>
                      <td className="px-5 py-3 font-bold text-gray-900">Total</td>
                      <td className="px-5 py-3 text-right font-bold font-mono text-blue-700">{fmt(t.revenue)}</td>
                      <td className="px-5 py-3 text-right font-bold font-mono text-green-700">{fmt(t.cash_received)}</td>
                      <td className="px-5 py-3 text-right font-bold font-mono text-orange-600">{fmt(t.cogs)}</td>
                      <td className={`px-5 py-3 text-right font-bold font-mono ${t.gross_profit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{fmt(t.gross_profit)}</td>
                      <td className="px-5 py-3 text-right">
                        <span className="text-xs font-bold">{fmtP(t.gp_pct)}</span>
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>

          {/* Bottom row — Top Customers + Payment Methods */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Top Customers */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b bg-gray-50 flex items-center gap-2">
                <Users size={15} className="text-blue-600" />
                <h3 className="font-semibold text-gray-900">Revenue by Customer</h3>
              </div>
              <div className="divide-y divide-gray-50">
                {topCusts.length === 0 ? (
                  <p className="py-8 text-center text-gray-400 text-sm">No customer data</p>
                ) : topCusts.map((c, i) => {
                  const maxC = topCusts[0]?.revenue || 1
                  return (
                    <div key={i} className="px-5 py-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-gray-800 truncate max-w-[200px]">{c.customer_name}</span>
                        <span className="text-sm font-bold text-blue-700 ml-2">{fmt(c.revenue)}</span>
                      </div>
                      <Bar value={c.revenue} max={maxC} color="bg-blue-400" />
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Payment Methods */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b bg-gray-50 flex items-center gap-2">
                <CreditCard size={15} className="text-green-600" />
                <h3 className="font-semibold text-gray-900">Payments by Method</h3>
              </div>
              {pmethods.length === 0 ? (
                <div className="py-8 text-center text-gray-400 text-sm">
                  <CheckCircle size={32} className="mx-auto mb-2 opacity-30" />
                  No payments recorded yet — use Receive Payment on invoices
                </div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {pmethods.map((m, i) => {
                    const maxM = Math.max(...pmethods.map(p => p.total), 1)
                    const colors = ['bg-green-400', 'bg-blue-400', 'bg-purple-400', 'bg-amber-400', 'bg-rose-400']
                    return (
                      <div key={i} className="px-5 py-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium text-gray-800">{m.method}</span>
                          <span className="text-sm font-bold text-green-700">{fmt(m.total)}</span>
                        </div>
                        <Bar value={m.total} max={maxM} color={colors[i % colors.length]} />
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
