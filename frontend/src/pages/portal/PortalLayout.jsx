import { useState, useEffect } from 'react'
import { useNavigate, NavLink } from 'react-router-dom'
import { portalAPI } from '../../api/client'
import { ShoppingCart, Package, ClipboardList, FileText, LogOut, User } from 'lucide-react'

export default function PortalLayout({ children, cartCount = 0 }) {
  const navigate = useNavigate()
  const customer = (() => {
    try { return JSON.parse(localStorage.getItem('portal_customer') || '{}') } catch { return {} }
  })()

  const [settings, setSettings] = useState(null)

  useEffect(() => {
    portalAPI.settings()
      .then(r => setSettings(r.data))
      .catch(() => {})
  }, [])

  function logout() {
    localStorage.removeItem('portal_token')
    localStorage.removeItem('portal_customer')
    navigate('/portal/login')
  }

  const navCls = ({ isActive }) =>
    `flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
      isActive
        ? 'bg-indigo-700 text-white'
        : 'text-indigo-100 hover:bg-indigo-700/60'
    }`

  const companyName = settings?.company_name || 'Order Portal'
  const showInvoices = settings?.portal_show_invoices !== false

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top nav */}
      <nav className="bg-indigo-600 shadow">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2 text-white font-bold text-lg">
              <ShoppingCart size={22} />
              {companyName}
            </div>
            <NavLink to="/portal/catalog" className={navCls}>
              <Package size={16} /> Catalog
            </NavLink>
            <NavLink to="/portal/orders" className={navCls}>
              <ClipboardList size={16} /> My Orders
            </NavLink>
            {showInvoices && (
              <NavLink to="/portal/invoices" className={navCls}>
                <FileText size={16} /> Invoices
              </NavLink>
            )}
          </div>
          <div className="flex items-center gap-4 text-white text-sm">
            <span className="flex items-center gap-1 text-indigo-200">
              <User size={15} /> {customer.name || customer.email}
            </span>
            <button
              onClick={logout}
              className="flex items-center gap-1 text-indigo-200 hover:text-white transition-colors"
            >
              <LogOut size={15} /> Sign out
            </button>
          </div>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-4 py-6">
        {children}
      </main>
    </div>
  )
}
