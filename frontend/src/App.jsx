import { useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import Layout from './components/Layout'
import Login from './pages/Login'
import PortalLogin    from './pages/portal/PortalLogin'
import PortalCatalog  from './pages/portal/PortalCatalog'
import PortalOrders   from './pages/portal/PortalOrders'
import PortalInvoices from './pages/portal/PortalInvoices'
import Dashboard from './pages/Dashboard'
import Inventory from './pages/Inventory'
import Receiving from './pages/Receiving'
import Orders from './pages/Orders'
import Transfers from './pages/Transfers'
import Forecasting from './pages/Forecasting'
import SKUs from './pages/SKUs'
import Vendors from './pages/Vendors'
import Settings from './pages/Settings'
import Dispatch from './pages/Dispatch'
import Reports from './pages/Reports'
import StockTake from './pages/StockTake'
import DispatchBoard from './pages/DispatchBoard'
import Spreadsheet from './pages/Spreadsheet'
import QuickBooks from './pages/QuickBooks'
import BinLocations from './pages/BinLocations'
import PurchaseOrders from './pages/PurchaseOrders'
import MobilePicking from './pages/MobilePicking'
import Customers from './pages/Customers'
import Returns from './pages/Returns'
import Invoices from './pages/Invoices'
import Drivers from './pages/Drivers'
import Users from './pages/Users'
import PriceLists from './pages/PriceLists'
import ForcePasswordChange from './pages/ForcePasswordChange'
import Register from './pages/Register'
import Superadmin from './pages/Superadmin'

// ── Admin-only route guard ─────────────────────────────────────
function AdminOnly({ children }) {
  const { user } = useAuth()
  if (user?.role !== 'admin') return <Navigate to="/" replace />
  return children
}

// ── Superadmin-only route guard ───────────────────────────────
function SuperadminOnly({ children }) {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  if (user.role !== 'superadmin') return <Navigate to="/" replace />
  return children
}

// ── Protected route wrapper ───────────────────────────────────
function ProtectedRoutes({ lang, setLang }) {
  const { user, mustChangePassword, clearMustChange } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  // Superadmin has its own dedicated page
  if (user.role === 'superadmin') return <Navigate to="/superadmin" replace />
  // Intercept all routes if user must change password first
  if (mustChangePassword) {
    return <ForcePasswordChange user={user} onDone={clearMustChange} />
  }
  return (
    <Layout lang={lang} setLang={setLang}>
      <Routes>
        <Route path="/"                element={<Dashboard      lang={lang} />} />
        <Route path="/inventory"       element={<Inventory      lang={lang} />} />
        <Route path="/receiving"       element={<Receiving      lang={lang} />} />
        <Route path="/orders"          element={<Orders         lang={lang} />} />
        <Route path="/transfers"       element={<Transfers      lang={lang} />} />
        <Route path="/forecasting"     element={<Forecasting    lang={lang} />} />
        <Route path="/skus"            element={<SKUs           lang={lang} />} />
        <Route path="/vendors"         element={<Vendors        lang={lang} />} />
        <Route path="/settings"        element={<Settings       lang={lang} />} />
        <Route path="/dispatch"        element={<Dispatch       lang={lang} />} />
        <Route path="/reports"         element={<Reports />} />
        <Route path="/stock-take"      element={<StockTake />} />
        <Route path="/dispatch-board"  element={<DispatchBoard />} />
        <Route path="/spreadsheet"     element={<Spreadsheet />} />
        <Route path="/quickbooks"      element={<QuickBooks />} />
        <Route path="/bin-locations"   element={<BinLocations />} />
        <Route path="/purchase-orders" element={<PurchaseOrders />} />
        <Route path="/picking"         element={<MobilePicking />} />
        <Route path="/mobile-picking"  element={<Navigate to="/picking" replace />} />
        <Route path="/sku-master"      element={<Navigate to="/skus" replace />} />
        <Route path="/customers"       element={<Customers />} />
        <Route path="/returns"         element={<Returns />} />
        <Route path="/invoices"        element={<Invoices />} />
        <Route path="/drivers"         element={<Drivers />} />
        <Route path="/users"           element={<AdminOnly><Users /></AdminOnly>} />
        <Route path="/price-lists"     element={<PriceLists />} />
        <Route path="*"                element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  )
}

function App() {
  const [lang, setLang] = useState('en')

  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login"          element={<LoginRedirect />} />
          <Route path="/register"       element={<Register />} />
          <Route path="/superadmin"     element={<SuperadminOnly><Superadmin /></SuperadminOnly>} />
          {/* Customer Portal — no WMS auth required */}
          <Route path="/portal/login"    element={<PortalLogin />} />
          <Route path="/portal/catalog"  element={<PortalCatalog />} />
          <Route path="/portal/orders"   element={<PortalOrders />} />
          <Route path="/portal/invoices" element={<PortalInvoices />} />
          <Route path="/portal"          element={<Navigate to="/portal/catalog" replace />} />
          <Route path="/*"              element={<ProtectedRoutes lang={lang} setLang={setLang} />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}

// Redirect to / if already logged in
function LoginRedirect() {
  const { user } = useAuth()
  if (user?.role === 'superadmin') return <Navigate to="/superadmin" replace />
  if (user) return <Navigate to="/" replace />
  return <Login />
}

export default App
