import { useState, useEffect } from 'react'
import { DollarSign, TrendingUp, Building2, RefreshCw, Printer, CheckCircle, XCircle, Package, CreditCard } from 'lucide-react'
import { reportAPI } from '../api/client'

const fmt = (n) => `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`

function Section({ title, color, items, total, totalLabel }) {
  return (
    <div className={`bg-white rounded-xl border border-gray-200 border-l-4 ${color} overflow-hidden`}>
      <div className="px-5 py-3 border-b border-gray-100">
        <h2 className="font-semibold text-gray-800 text-base">{title}</h2>
      </div>
      <div className="divide-y divide-gray-50">
        {items.map(([label, value]) => (
          <div key={label} className="flex justify-between items-center px-5 py-3">
            <span className="text-sm text-gray-600">{label}</span>
            <span className="text-sm font-medium text-gray-900">{fmt(value)}</span>
          </div>
        ))}
      </div>
      <div className="flex justify-between items-center px-5 py-3 bg-gray-50 border-t border-gray-200">
        <span className="text-sm font-bold text-gray-800">{totalLabel}</span>
        <span className="text-base font-bold text-gray-900">{fmt(total)}</span>
      </div>
    </div>
  )
}

export default function BalanceSheet() {
  const [data, setData]     = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]   = useState(false)

  const load = async () => {
    setLoading(true); setError(false)
    try {
      const r = await reportAPI.balanceSheet()
      setData(r.data)
    } catch { setError(true) }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  return (
    <div className="p-6 space-y-5">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Balance Sheet</h1>
          <p className="text-sm text-gray-500 mt-1">
            {data ? <>As of <strong>{data.as_of}</strong></> : 'Financial position statement'}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50">
            <RefreshCw className={`w-4 h-4 text-gray-500 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={() => window.print()} className="flex items-center gap-2 border border-gray-300 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">
            <Printer className="w-4 h-4" /> Print
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-20 text-gray-400">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-3 text-gray-300" />
          <p>Building balance sheet...</p>
        </div>
      ) : error ? (
        <div className="text-center py-12 text-red-500">Failed to load balance sheet data</div>
      ) : data && (
        <div id="balance-sheet-content" className="space-y-5">
          {/* Balance check banner */}
          <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${data.check ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
            {data.check
              ? <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
              : <XCircle className="w-5 h-5 text-red-600 flex-shrink-0" />}
            <span className={`text-sm font-medium ${data.check ? 'text-green-800' : 'text-red-800'}`}>
              {data.check
                ? 'Balance sheet is balanced — Assets = Liabilities + Equity ✓'
                : 'Warning: Balance sheet does not balance. Some data may be missing.'}
            </span>
          </div>

          {/* Equation summary */}
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Total Assets', value: data.assets.total_assets, color: 'text-green-700', bg: 'bg-green-50 border-green-200' },
              { label: 'Total Liabilities', value: data.liabilities.total_liabilities, color: 'text-red-700', bg: 'bg-red-50 border-red-200' },
              { label: 'Total Equity', value: data.equity.total_equity, color: 'text-blue-700', bg: 'bg-blue-50 border-blue-200' },
            ].map(({ label, value, color, bg }) => (
              <div key={label} className={`rounded-xl border p-4 text-center ${bg}`}>
                <p className="text-sm text-gray-500">{label}</p>
                <p className={`text-3xl font-bold mt-2 ${color}`}>{fmt(value)}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            {/* Assets */}
            <Section
              title="Assets"
              color="border-green-500"
              items={[
                ['Cash & Bank Received', data.assets.cash_and_bank],
                ['Accounts Receivable (AR)', data.assets.accounts_receivable],
                ['Inventory Value', data.assets.inventory_value],
              ]}
              total={data.assets.total_assets}
              totalLabel="Total Assets"
            />

            <div className="space-y-5">
              {/* Liabilities */}
              <Section
                title="Liabilities"
                color="border-red-500"
                items={[
                  ['Accounts Payable (AP)', data.liabilities.accounts_payable],
                ]}
                total={data.liabilities.total_liabilities}
                totalLabel="Total Liabilities"
              />

              {/* Equity */}
              <Section
                title="Equity"
                color="border-blue-500"
                items={[
                  ['Retained Earnings', data.equity.retained_earnings],
                ]}
                total={data.equity.total_equity}
                totalLabel="Total Equity"
              />
            </div>
          </div>

          <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500 text-center">
              This is a simplified balance sheet based on system data. For audited financials, consult your accountant.
              Cash reflects total payments received · AR reflects outstanding invoice balances · Inventory uses cost price × cases on hand.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
