import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { portalAPI } from '../../api/client'
import PortalLayout from './PortalLayout'
import { ClipboardList, ChevronDown, ChevronUp, Package } from 'lucide-react'

const STATUS_COLOURS = {
  Pending:    'bg-yellow-100 text-yellow-800',
  Processing: 'bg-blue-100 text-blue-800',
  Dispatched: 'bg-indigo-100 text-indigo-800',
  Delivered:  'bg-green-100 text-green-800',
  Cancelled:  'bg-red-100 text-red-800',
}

export default function PortalOrders() {
  const navigate = useNavigate()
  const [orders,  setOrders]  = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')
  const [expanded, setExpanded] = useState(null)

  useEffect(() => {
    if (!localStorage.getItem('portal_token')) { navigate('/portal/login'); return }
    portalAPI.orders()
      .then(r => setOrders(r.data))
      .catch(err => {
        if (err.response?.status === 401) navigate('/portal/login')
        else setError('Failed to load orders')
      })
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <PortalLayout><div className="py-20 text-center text-gray-400">Loading orders…</div></PortalLayout>

  return (
    <PortalLayout>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">My Orders</h1>

      {error && <div className="text-red-600 mb-4 text-sm">{error}</div>}

      {orders.length === 0 ? (
        <div className="py-20 text-center text-gray-400">
          <ClipboardList size={40} className="mx-auto mb-3 opacity-30" />
          <p>No orders yet. <a href="/portal/catalog" className="text-indigo-600 hover:underline">Browse the catalog</a> to place your first order.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map(o => (
            <div key={o.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              {/* Header row */}
              <button
                className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50 transition-colors"
                onClick={() => setExpanded(expanded === o.id ? null : o.id)}
              >
                <div className="flex items-center gap-4">
                  <div>
                    <div className="font-semibold text-gray-900">{o.order_number}</div>
                    <div className="text-xs text-gray-400">{o.order_date}</div>
                  </div>
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOURS[o.status] || 'bg-gray-100 text-gray-700'}`}>
                    {o.status}
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className="font-semibold">${o.total.toFixed(2)}</div>
                    <div className="text-xs text-gray-400">{o.items.length} line(s)</div>
                  </div>
                  {expanded === o.id ? <ChevronUp size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
                </div>
              </button>

              {/* Expanded detail */}
              {expanded === o.id && (
                <div className="border-t border-gray-100 p-4">
                  {o.notes && <p className="text-sm text-gray-500 italic mb-3">{o.notes}</p>}
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-gray-400 border-b">
                        <th className="text-left pb-1.5 font-medium">Product</th>
                        <th className="text-left pb-1.5 font-medium">SKU</th>
                        <th className="text-center pb-1.5 font-medium">Cases</th>
                        <th className="text-right pb-1.5 font-medium">Unit Price</th>
                        <th className="text-right pb-1.5 font-medium">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {o.items.map((it, idx) => (
                        <tr key={idx} className="border-b border-gray-50 last:border-0">
                          <td className="py-2 font-medium">{it.product_name}</td>
                          <td className="py-2 text-gray-400 text-xs">{it.sku_code}</td>
                          <td className="py-2 text-center">{it.cases_qty}</td>
                          <td className="py-2 text-right">${(it.unit_price || 0).toFixed(2)}</td>
                          <td className="py-2 text-right font-medium">${it.line_total.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="font-bold">
                        <td colSpan={4} className="pt-3 text-right text-gray-600">Order Total</td>
                        <td className="pt-3 text-right text-gray-900">${o.total.toFixed(2)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </PortalLayout>
  )
}
