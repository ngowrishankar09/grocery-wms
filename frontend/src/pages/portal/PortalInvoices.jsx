import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { portalAPI } from '../../api/client'
import PortalLayout from './PortalLayout'
import { FileText, ChevronDown, ChevronUp } from 'lucide-react'

const STATUS_COLOURS = {
  Draft:   'bg-gray-100 text-gray-600',
  Sent:    'bg-blue-100 text-blue-700',
  Paid:    'bg-green-100 text-green-700',
  Overdue: 'bg-red-100 text-red-700',
}

export default function PortalInvoices() {
  const navigate = useNavigate()
  const [invoices, setInvoices] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState('')
  const [expanded, setExpanded] = useState(null)

  useEffect(() => {
    if (!localStorage.getItem('portal_token')) { navigate('/portal/login'); return }
    portalAPI.invoices()
      .then(r => setInvoices(r.data))
      .catch(err => {
        if (err.response?.status === 401) navigate('/portal/login')
        else setError('Failed to load invoices')
      })
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <PortalLayout><div className="py-20 text-center text-gray-400">Loading invoices…</div></PortalLayout>

  return (
    <PortalLayout>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">My Invoices</h1>

      {error && <div className="text-red-600 mb-4 text-sm">{error}</div>}

      {invoices.length === 0 ? (
        <div className="py-20 text-center text-gray-400">
          <FileText size={40} className="mx-auto mb-3 opacity-30" />
          <p>No invoices yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {invoices.map(inv => (
            <div key={inv.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              {/* Header row */}
              <button
                className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50 transition-colors"
                onClick={() => setExpanded(expanded === inv.id ? null : inv.id)}
              >
                <div className="flex items-center gap-4">
                  <div>
                    <div className="font-semibold text-gray-900">{inv.invoice_number}</div>
                    <div className="text-xs text-gray-400">{inv.invoice_date}</div>
                  </div>
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOURS[inv.status] || 'bg-gray-100 text-gray-600'}`}>
                    {inv.status}
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className="font-semibold">${(inv.total || 0).toFixed(2)}</div>
                    {inv.due_date && (
                      <div className="text-xs text-gray-400">Due {inv.due_date}</div>
                    )}
                  </div>
                  {expanded === inv.id ? <ChevronUp size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
                </div>
              </button>

              {/* Expanded detail */}
              {expanded === inv.id && (
                <div className="border-t border-gray-100 p-4">
                  {inv.notes && <p className="text-sm text-gray-500 italic mb-3">{inv.notes}</p>}
                  {inv.items && inv.items.length > 0 ? (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs text-gray-400 border-b">
                          <th className="text-left pb-1.5 font-medium">Description</th>
                          <th className="text-left pb-1.5 font-medium">SKU</th>
                          <th className="text-center pb-1.5 font-medium">Cases</th>
                          <th className="text-right pb-1.5 font-medium">Unit Price</th>
                          <th className="text-right pb-1.5 font-medium">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {inv.items.map((it, idx) => (
                          <tr key={idx} className="border-b border-gray-50 last:border-0">
                            <td className="py-2 font-medium">{it.description}</td>
                            <td className="py-2 text-gray-400 text-xs">{it.sku_code}</td>
                            <td className="py-2 text-center">{it.cases_qty}</td>
                            <td className="py-2 text-right">${(it.unit_price || 0).toFixed(2)}</td>
                            <td className="py-2 text-right font-medium">${(it.line_total || 0).toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="font-bold">
                          <td colSpan={4} className="pt-3 text-right text-gray-600">Invoice Total</td>
                          <td className="pt-3 text-right text-gray-900">${(inv.total || 0).toFixed(2)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  ) : (
                    <p className="text-sm text-gray-400">No line items.</p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </PortalLayout>
  )
}
