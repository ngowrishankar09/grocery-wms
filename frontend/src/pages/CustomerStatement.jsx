import { useState, useEffect } from 'react'
import { Printer, Download, FileText, Calendar, DollarSign } from 'lucide-react'
import { invoiceAPI, customerAPI } from '../api/client'

export default function CustomerStatement() {
  const [customers, setCustomers] = useState([])
  const [selectedCustomer, setSelectedCustomer] = useState('')
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() - 3)
    return d.toISOString().split('T')[0]
  })
  const [toDate, setToDate] = useState(() => new Date().toISOString().split('T')[0])
  const [statement, setStatement] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    customerAPI.list().then(r => setCustomers(r.data)).catch(() => {})
  }, [])

  const loadStatement = async () => {
    if (!selectedCustomer) return
    setLoading(true)
    try {
      const r = await invoiceAPI.statement(selectedCustomer, { from_date: fromDate, to_date: toDate })
      setStatement(r.data)
    } catch {}
    setLoading(false)
  }

  const fmt = (n) => `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
  const statusColor = (s) => ({
    'Paid': 'text-green-700 bg-green-100',
    'Partial': 'text-indigo-700 bg-indigo-100',
    'Overdue': 'text-red-700 bg-red-100',
    'Sent': 'text-blue-700 bg-blue-100',
    'Draft': 'text-gray-700 bg-gray-100',
  }[s] || 'text-gray-700 bg-gray-100')

  return (
    <div className="p-6 space-y-4">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Customer Statements</h1>
          <p className="text-sm text-gray-500 mt-1">Account statement with running balance</p>
        </div>
        {statement && (
          <button onClick={() => window.print()} className="flex items-center gap-2 border border-gray-300 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">
            <Printer className="w-4 h-4" /> Print Statement
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="grid grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Customer</label>
            <select value={selectedCustomer} onChange={e => setSelectedCustomer(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">Select customer...</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">From Date</label>
            <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">To Date</label>
            <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="flex items-end">
            <button onClick={loadStatement} disabled={!selectedCustomer || loading}
              className="w-full bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
              {loading ? 'Loading...' : 'Generate Statement'}
            </button>
          </div>
        </div>
      </div>

      {statement && (
        <div id="statement-content" className="bg-white rounded-xl border border-gray-200">
          {/* Header */}
          <div className="p-6 border-b border-gray-200">
            <div className="flex justify-between">
              <div>
                <h2 className="text-xl font-bold text-gray-900">{statement.customer.name}</h2>
                <p className="text-sm text-gray-500">{statement.customer.email}</p>
                <p className="text-sm text-gray-500">{statement.customer.phone}</p>
                {statement.customer.address && <p className="text-sm text-gray-500 mt-1">{statement.customer.address}</p>}
              </div>
              <div className="text-right">
                <h3 className="text-lg font-bold text-gray-800">ACCOUNT STATEMENT</h3>
                <p className="text-sm text-gray-500">{fromDate} — {toDate}</p>
                {statement.customer.payment_terms && (
                  <p className="text-sm text-gray-500 mt-1">Terms: {statement.customer.payment_terms}</p>
                )}
              </div>
            </div>
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-3 divide-x divide-gray-200 border-b border-gray-200">
            {[
              ['Total Billed', statement.summary.total_billed, 'text-gray-900'],
              ['Total Paid', statement.summary.total_paid, 'text-green-700'],
              ['Outstanding', statement.summary.total_outstanding, statement.summary.total_outstanding > 0 ? 'text-red-700' : 'text-green-700'],
            ].map(([label, val, color]) => (
              <div key={label} className="p-4 text-center">
                <div className="text-sm text-gray-500">{label}</div>
                <div className={`text-2xl font-bold mt-1 ${color}`}>{fmt(val)}</div>
              </div>
            ))}
          </div>

          {/* Invoice rows */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {['Invoice #','Invoice Date','Due Date','Status','Amount','Paid','Balance Due','Running Balance'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {statement.rows.length === 0 ? (
                  <tr><td colSpan={8} className="text-center py-10 text-gray-400">No invoices in this period</td></tr>
                ) : statement.rows.map((row, i) => (
                  <tr key={i} className={`hover:bg-gray-50 ${row.balance_due > 0 && row.status === 'Overdue' ? 'bg-red-50' : ''}`}>
                    <td className="px-4 py-3 font-medium text-blue-600">{row.invoice_number}</td>
                    <td className="px-4 py-3 text-gray-500">{row.invoice_date}</td>
                    <td className="px-4 py-3 text-gray-500">{row.due_date || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColor(row.status)}`}>{row.status}</span>
                    </td>
                    <td className="px-4 py-3 font-medium">{fmt(row.grand_total)}</td>
                    <td className="px-4 py-3 text-green-700">{fmt(row.amount_paid)}</td>
                    <td className={`px-4 py-3 font-medium ${row.balance_due > 0 ? 'text-red-600' : 'text-green-600'}`}>{fmt(row.balance_due)}</td>
                    <td className={`px-4 py-3 font-bold ${row.running_balance > 0 ? 'text-red-700' : 'text-green-700'}`}>{fmt(row.running_balance)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50 border-t-2 border-gray-300">
                <tr>
                  <td colSpan={4} className="px-4 py-3 font-bold text-gray-700">TOTALS</td>
                  <td className="px-4 py-3 font-bold">{fmt(statement.summary.total_billed)}</td>
                  <td className="px-4 py-3 font-bold text-green-700">{fmt(statement.summary.total_paid)}</td>
                  <td className="px-4 py-3 font-bold text-red-600">{fmt(statement.summary.total_outstanding)}</td>
                  <td className="px-4 py-3 font-bold text-red-700">{fmt(statement.summary.total_outstanding)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
