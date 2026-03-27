import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { portalAPI } from '../../api/client'
import PortalLayout from './PortalLayout'
import { ShoppingCart, Plus, Minus, Search, CheckCircle, AlertCircle, Package, Tag } from 'lucide-react'

export default function PortalCatalog() {
  const navigate  = useNavigate()
  const catRef    = useRef(null)

  const [products, setProducts] = useState([])
  const [settings, setSettings] = useState(null)
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState('')
  const [search,   setSearch]   = useState('')
  const [category, setCategory] = useState('All')
  const [cart,     setCart]     = useState({})   // sku_id → qty
  const [placing,  setPlacing]  = useState(false)
  const [success,  setSuccess]  = useState('')
  const [notes,    setNotes]    = useState('')
  const [showCart, setShowCart] = useState(false)
  const [removeConfirm, setRemoveConfirm] = useState(null) // { id, name }

  useEffect(() => {
    if (!localStorage.getItem('portal_token')) { navigate('/portal/login'); return }
    Promise.all([portalAPI.catalog(), portalAPI.settings()])
      .then(([catRes, setRes]) => {
        setProducts(catRes.data)
        setSettings(setRes.data)
      })
      .catch(err => {
        if (err.response?.status === 401) navigate('/portal/login')
        else setError('Failed to load catalog')
      })
      .finally(() => setLoading(false))
  }, [])

  // Admin visibility toggles — prices always shown in cart regardless
  const showPriceOnCard = settings?.portal_show_price !== false
  const showStock       = settings?.portal_show_stock !== false

  const categories = ['All', ...Array.from(new Set(products.map(p => p.category).filter(Boolean)))]

  const filtered = products.filter(p => {
    const matchCat    = category === 'All' || p.category === category
    const matchSearch = !search ||
      p.product_name.toLowerCase().includes(search.toLowerCase()) ||
      p.sku_code.toLowerCase().includes(search.toLowerCase())
    return matchCat && matchSearch
  })

  function setQty(id, qty) {
    if (qty <= 0 || isNaN(qty)) return
    setCart(prev => ({ ...prev, [id]: qty }))
  }
  const tryRemove = (id, name) => setRemoveConfirm({ id, name })
  const confirmRemove = (id) => {
    setCart(prev => { const c = { ...prev }; delete c[id]; return c })
    setRemoveConfirm(null)
  }

  const cartItems = Object.entries(cart).map(([id, qty]) => {
    const p = products.find(x => x.id === parseInt(id))
    return p ? { ...p, qty } : null
  }).filter(Boolean)

  const cartTotal = cartItems.reduce((s, i) => s + i.qty * i.unit_price, 0)
  const cartCount = Object.values(cart).reduce((a, b) => a + b, 0)

  async function placeOrder() {
    if (!cartItems.length) return
    setPlacing(true); setSuccess(''); setError('')
    try {
      const res = await portalAPI.placeOrder({
        notes,
        lines: cartItems.map(i => ({ sku_id: i.id, cases_qty: i.qty })),
      })
      setSuccess(`Order ${res.data.order_number} placed successfully!`)
      setCart({}); setNotes(''); setShowCart(false)
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to place order')
    } finally {
      setPlacing(false)
    }
  }

  if (loading) return <PortalLayout><div className="py-20 text-center text-gray-400">Loading catalog…</div></PortalLayout>

  return (
    <PortalLayout cartCount={cartCount}>

      {/* Remove item confirmation */}
      {removeConfirm && (
        <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full space-y-4">
            <h4 className="font-bold text-gray-900">Remove Item?</h4>
            <p className="text-sm text-gray-600">Remove <strong>{removeConfirm.name}</strong> from your cart completely?</p>
            <div className="flex gap-3">
              <button
                className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold py-2 rounded-xl text-sm transition-colors"
                onClick={() => confirmRemove(removeConfirm.id)}
              >Yes, Remove</button>
              <button
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-2 rounded-xl text-sm transition-colors"
                onClick={() => setRemoveConfirm(null)}
              >Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Page header ─────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-2xl font-bold text-gray-900">Product Catalog</h1>
        <button
          onClick={() => setShowCart(true)}
          className="relative flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors shadow-sm"
        >
          <ShoppingCart size={17} />
          <span className="hidden sm:inline">Cart</span>
          {cartCount > 0 && (
            <span className="absolute -top-2 -right-2 bg-red-500 text-white text-[11px] font-bold rounded-full w-5 h-5 flex items-center justify-center">
              {cartCount}
            </span>
          )}
        </button>
      </div>

      {/* ── Alerts ──────────────────────────────────────────── */}
      {success && (
        <div className="flex items-center gap-2 bg-green-50 border border-green-200 text-green-700 rounded-xl px-4 py-3 mb-4 text-sm">
          <CheckCircle size={16} className="shrink-0" /> {success}
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 mb-4 text-sm">
          <AlertCircle size={16} className="shrink-0" /> {error}
        </div>
      )}

      {/* ── Search bar ──────────────────────────────────────── */}
      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        <input
          className="w-full pl-9 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          placeholder="Search products or SKU code…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* ── Category chips — horizontal scroll on mobile ─────── */}
      <div className="relative mb-5">
        {/* fade edges on mobile */}
        <div className="absolute left-0 top-0 bottom-0 w-4 bg-gradient-to-r from-gray-50 to-transparent z-10 pointer-events-none sm:hidden" />
        <div className="absolute right-0 top-0 bottom-0 w-4 bg-gradient-to-l from-gray-50 to-transparent z-10 pointer-events-none sm:hidden" />
        <div
          ref={catRef}
          className="flex gap-2 overflow-x-auto scrollbar-hide pb-1 px-0 sm:flex-wrap"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => {
                setCategory(cat)
                // scroll active chip into view on mobile
                catRef.current?.querySelector(`[data-cat="${cat}"]`)?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
              }}
              data-cat={cat}
              className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-medium border transition-all ${
                category === cat
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300 hover:text-indigo-600'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* ── Product grid ────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <div className="py-16 text-center text-gray-400">
          <Package size={40} className="mx-auto mb-3 opacity-30" />
          No products found
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {filtered.map(p => {
            const qty     = cart[p.id] || 0
            const inStock = p.stock > 0
            return (
              <div key={p.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col hover:shadow-md transition-shadow">
                {/* Product image */}
                <div className="h-28 sm:h-32 bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center overflow-hidden relative">
                  {p.image_url
                    ? <img src={`http://localhost:8000${p.image_url}`} alt={p.product_name} className="h-full w-full object-cover" />
                    : <Package size={34} className="text-gray-300" />
                  }
                  {!inStock && (
                    <div className="absolute inset-0 bg-white/60 flex items-center justify-center">
                      <span className="text-xs font-semibold text-red-500 bg-white px-2 py-0.5 rounded-full border border-red-200">Out of stock</span>
                    </div>
                  )}
                </div>

                <div className="p-3 flex flex-col flex-1">
                  <span className="text-[10px] text-indigo-500 font-semibold uppercase tracking-wider truncate">{p.category || '—'}</span>
                  <h3 className="font-semibold text-gray-900 mt-0.5 text-sm leading-tight line-clamp-2 min-h-[2.5rem]">{p.product_name}</h3>
                  <p className="text-[11px] text-gray-400 mt-0.5 truncate">{p.sku_code}{p.case_size ? ` · ${p.case_size}` : ''}</p>

                  <div className="mt-auto pt-2 space-y-2">
                    {/* Price on card — shown only when admin allows */}
                    {showPriceOnCard ? (
                      <div className="flex items-baseline gap-1">
                        <span className="text-base font-bold text-gray-900">${p.unit_price.toFixed(2)}</span>
                        <span className="text-[10px] text-gray-400">/ case</span>
                      </div>
                    ) : (
                      showStock && inStock && (
                        <div className="h-5" /> /* spacer to keep layout consistent */
                      )
                    )}

                    {/* Stock badge */}
                    {showStock && (
                      <div className={`text-[11px] font-medium ${inStock ? 'text-emerald-600' : 'text-red-400'}`}>
                        {inStock ? `${p.stock} cases available` : ''}
                      </div>
                    )}

                    {/* Add to cart control */}
                    {qty === 0 ? (
                      <button
                        disabled={!inStock}
                        onClick={() => setQty(p.id, 1)}
                        className="w-full bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-sm font-medium py-1.5 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        Add to cart
                      </button>
                    ) : (
                      <div className="flex items-center justify-between bg-indigo-50 rounded-xl px-1 py-0.5">
                        <button
                          onClick={() => qty <= 1 ? tryRemove(p.id, p.product_name) : setQty(p.id, Math.max(0.01, qty - 1))}
                          className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-100 text-indigo-600 hover:text-red-500 transition-colors"
                        ><Minus size={14} /></button>
                        <input
                          type="number" min="0" step="any"
                          key={qty}
                          defaultValue={qty}
                          className="w-10 text-center text-sm font-bold text-indigo-700 bg-transparent focus:outline-none focus:bg-white focus:rounded-lg"
                          onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v) && v > 0) setQty(p.id, v) }}
                          onBlur={e => { const v = parseFloat(e.target.value); if (isNaN(v) || v <= 0) tryRemove(p.id, p.product_name) }}
                        />
                        <button
                          onClick={() => setQty(p.id, qty + 1)}
                          className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-indigo-100 text-indigo-600 transition-colors"
                        ><Plus size={14} /></button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Cart drawer ─────────────────────────────────────── */}
      {showCart && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={e => e.target === e.currentTarget && setShowCart(false)}>
          <div className="bg-white w-full sm:max-w-md sm:rounded-2xl max-h-[90vh] flex flex-col shadow-2xl rounded-t-2xl">

            {/* Cart header */}
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h2 className="text-base font-bold flex items-center gap-2 text-gray-900">
                <ShoppingCart size={18} className="text-indigo-600" />
                Your Cart
                <span className="text-sm font-normal text-gray-400">({cartCount} case{cartCount !== 1 ? 's' : ''})</span>
              </h2>
              <button onClick={() => setShowCart(false)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors text-lg">✕</button>
            </div>

            {/* Cart items — prices always visible here */}
            <div className="flex-1 overflow-y-auto px-5 py-3 space-y-3">
              {cartItems.length === 0 ? (
                <div className="py-10 text-center text-gray-400">
                  <ShoppingCart size={32} className="mx-auto mb-2 opacity-20" />
                  <p className="text-sm">Your cart is empty</p>
                </div>
              ) : cartItems.map(i => (
                <div key={i.id} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm text-gray-900 truncate">{i.product_name}</div>
                    <div className="flex items-center gap-1 mt-0.5">
                      <Tag size={11} className="text-indigo-400" />
                      {/* Price always shown in cart */}
                      <span className="text-xs text-indigo-600 font-semibold">${i.unit_price.toFixed(2)}/case</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-0.5 bg-gray-50 rounded-xl px-0.5 py-0.5">
                    <button
                      onClick={() => i.qty <= 1 ? tryRemove(i.id, i.product_name) : setQty(i.id, Math.max(0.01, i.qty - 1))}
                      className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-red-100 text-gray-500 hover:text-red-500 transition-colors"
                    ><Minus size={12} /></button>
                    <input
                      type="number" min="0" step="any"
                      key={i.qty}
                      defaultValue={i.qty}
                      className="w-10 text-center text-sm font-bold bg-transparent focus:outline-none focus:bg-white focus:rounded"
                      onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v) && v > 0) setQty(i.id, v) }}
                      onBlur={e => { const v = parseFloat(e.target.value); if (isNaN(v) || v <= 0) tryRemove(i.id, i.product_name) }}
                    />
                    <button onClick={() => setQty(i.id, i.qty + 1)} className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-gray-200 transition-colors"><Plus size={12} /></button>
                  </div>
                  <div className="text-sm font-bold text-gray-900 w-16 text-right">${(i.qty * i.unit_price).toFixed(2)}</div>
                </div>
              ))}
            </div>

            {/* Checkout footer */}
            {cartItems.length > 0 && (
              <div className="border-t px-5 py-4 space-y-3">
                {/* Order total — always shown in checkout */}
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">Subtotal</span>
                  <span className="font-bold text-lg text-gray-900">${cartTotal.toFixed(2)}</span>
                </div>
                <textarea
                  rows={2}
                  placeholder="Add a note for this order (optional)…"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none bg-gray-50"
                />
                {error && <p className="text-red-600 text-sm">{error}</p>}
                <button
                  onClick={placeOrder}
                  disabled={placing}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {placing ? (
                    <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Placing order…</>
                  ) : (
                    <><ShoppingCart size={16} /> Place Order · ${cartTotal.toFixed(2)}</>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </PortalLayout>
  )
}
