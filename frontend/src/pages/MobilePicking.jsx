import { useState, useEffect, useRef } from 'react'
import { orderAPI } from '../api/client'
import {
  CheckCircle2, Circle, ScanLine, Package, AlertTriangle,
  ChevronLeft, RotateCcw, Search, Clock, User, Play, CheckSquare,
  Bell, Plus, Minus, CalendarDays,
} from 'lucide-react'

// ── Helpers ────────────────────────────────────────────────────
function formatDuration(seconds) {
  if (!seconds && seconds !== 0) return '—'
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}m ${s.toString().padStart(2, '0')}s`
}

function toUTC(s) {
  if (!s) return null
  return s.includes('Z') || s.includes('+') ? s : s + 'Z'
}

function useElapsed(startedAt) {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    if (!startedAt) return
    const ref = new Date(toUTC(startedAt)).getTime()
    setElapsed(Math.floor((Date.now() - ref) / 1000))
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - ref) / 1000)), 1000)
    return () => clearInterval(id)
  }, [startedAt])
  return elapsed
}

function statusBadge(status) {
  if (status === 'ok')       return <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">In Stock</span>
  if (status === 'partial')  return <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-700">Partial Stock</span>
  if (status === 'stockout') return <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">Stockout</span>
  return null
}

function pickedBadge(actualQty, requestedQty) {
  if (actualQty === 0)              return <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">Stockout</span>
  if (actualQty < requestedQty)    return <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-orange-100 text-orange-700">Short: {actualQty}/{requestedQty}</span>
  return <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">✓ {actualQty} cases</span>
}

// ── QtyInput ───────────────────────────────────────────────────
function QtyInput({ value, onChange, max }) {
  return (
    <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl p-2">
      <button
        type="button"
        onClick={() => onChange(Math.max(0, value - 1))}
        className="w-9 h-9 flex items-center justify-center bg-white border border-gray-300 rounded-lg text-gray-600 active:bg-gray-100 font-bold text-lg shadow-sm"
      >
        <Minus size={16} />
      </button>
      <input
        type="number"
        min={0}
        max={max + 5}
        value={value}
        onChange={e => onChange(Math.max(0, parseInt(e.target.value) || 0))}
        className="w-16 text-center text-xl font-bold outline-none bg-transparent"
      />
      <button
        type="button"
        onClick={() => onChange(value + 1)}
        className="w-9 h-9 flex items-center justify-center bg-white border border-gray-300 rounded-lg text-gray-600 active:bg-gray-100 font-bold shadow-sm"
      >
        <Plus size={16} />
      </button>
      <span className="text-xs text-gray-400 ml-1">/ {max} req.</span>
    </div>
  )
}


// ── Order list screen ──────────────────────────────────────────
function OrderList({ onSelect }) {
  const [orders, setOrders]   = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch]   = useState('')

  useEffect(() => {
    orderAPI.list({ picking_queued: true })
      .then(r => setOrders(r.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const filtered = orders.filter(o =>
    o.order_number?.toLowerCase().includes(search.toLowerCase()) ||
    o.store_name?.toLowerCase().includes(search.toLowerCase()) ||
    o.customer_name?.toLowerCase().includes(search.toLowerCase()) ||
    (o.picker_name || '').toLowerCase().includes(search.toLowerCase())
  )

  function getStatusTag(o) {
    if (o.packing_status === 'Packed')   return { label: 'Packed ✓',    cls: 'bg-green-100 text-green-700' }
    if (o.packing_status === 'Packing')  return { label: 'In Progress', cls: 'bg-yellow-100 text-yellow-700' }
    return { label: 'Queued', cls: 'bg-blue-600 text-white' }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-blue-600 text-white px-4 pt-10 pb-5 safe-top">
        <h1 className="text-2xl font-bold">Mobile Picking</h1>
        <p className="text-blue-200 text-sm mt-0.5">Orders assigned to picking queue</p>
      </div>

      <div className="px-4 -mt-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 flex items-center gap-2 px-3 py-2.5">
          <Search size={17} className="text-gray-400 flex-shrink-0" />
          <input
            className="flex-1 text-sm outline-none placeholder-gray-400"
            placeholder="Search order, store, or picker…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="px-4 pt-4 pb-8 space-y-3">
        {loading ? (
          <div className="text-center py-16 text-gray-400">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <Package size={40} className="mx-auto mb-3 opacity-40" />
            <p className="font-medium">No orders in picking queue</p>
            <p className="text-sm mt-1">Admin sends orders here from the Orders page</p>
          </div>
        ) : filtered.map(order => {
          const { label, cls } = getStatusTag(order)
          return (
            <button
              key={order.id}
              onClick={() => onSelect(order)}
              className="w-full bg-white rounded-xl border border-gray-200 shadow-sm p-4 text-left active:bg-blue-50 active:border-blue-300 transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-bold text-gray-900 text-base">{order.order_number}</p>
                  <p className="text-sm text-gray-500 mt-0.5">{order.store_name}</p>
                  {order.picker_name && (
                    <p className="text-xs text-indigo-600 mt-1 flex items-center gap-1">
                      <User size={11} /> {order.picker_name}
                    </p>
                  )}
                </div>
                <span className={`flex-shrink-0 rounded-lg px-3 py-1 text-sm font-semibold ${cls}`}>{label}</span>
              </div>
              <div className="flex items-center gap-4 mt-3 text-xs text-gray-400">
                <span>{order.item_count} lines</span>
                {order.picking_started_at && (
                  <span>Started {new Date(toUTC(order.picking_started_at)).toLocaleTimeString()}</span>
                )}
                {order.picking_ended_at && <span className="text-green-600">Picked ✓</span>}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}


// ── Start / Resume screen ──────────────────────────────────────
function StartScreen({ order, onBack, onStart }) {
  const [pickerName, setPickerName] = useState(order.picker_name || '')
  const [starting, setStarting]     = useState(false)

  const alreadyStarted = !!order.picking_started_at

  const handleStart = async () => {
    setStarting(true)
    try {
      if (alreadyStarted) {
        onStart(pickerName.trim() || order.picker_name || '', order.picking_started_at)
      } else {
        const res = await orderAPI.startPicking(order.id, pickerName.trim() || null)
        onStart(pickerName.trim(), res.data.started_at)
      }
    } catch (e) {
      alert(e?.response?.data?.detail || 'Error starting picking')
      setStarting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <div className="bg-blue-600 text-white px-4 pt-8 pb-5 safe-top">
        <button onClick={onBack} className="flex items-center gap-1 text-blue-200 text-sm mb-3">
          <ChevronLeft size={16} /> Orders
        </button>
        <h2 className="text-xl font-bold">{order.order_number}</h2>
        <p className="text-blue-200 text-sm">{order.store_name}</p>
      </div>

      <div className="flex-1 px-4 py-6 space-y-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
          <p className="text-xs font-semibold uppercase text-gray-400 tracking-wide">Order Details</p>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Items to pick</span>
            <span className="font-bold">{order.item_count}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Order date</span>
            <span>{order.order_date}</span>
          </div>
          {alreadyStarted && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Status</span>
              <span className="text-yellow-600 font-medium">In Progress — resuming</span>
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-2">
          <p className="text-xs font-semibold uppercase text-gray-400 tracking-wide">Your Name</p>
          <div className="flex items-center gap-2 bg-gray-50 rounded-lg border border-gray-200 px-3 py-2.5">
            <User size={16} className="text-gray-400 shrink-0" />
            <input
              className="flex-1 text-sm outline-none bg-transparent placeholder-gray-400"
              placeholder="Enter your name…"
              value={pickerName}
              onChange={e => setPickerName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleStart()}
            />
          </div>
        </div>
      </div>

      <div className="px-4 pb-10 pt-2">
        <button
          onClick={handleStart}
          disabled={starting}
          className="w-full bg-green-500 active:bg-green-600 disabled:opacity-60 text-white rounded-xl py-4 flex items-center justify-center gap-2 text-base font-bold transition-colors"
        >
          <Play size={20} />
          {starting ? 'Starting…' : alreadyStarted ? 'Resume Picking' : 'Start Picking'}
        </button>
      </div>
    </div>
  )
}


// ── Pick session screen ────────────────────────────────────────
function PickSession({ order, pickerName, startedAt, onBack, onFinish }) {
  const [picklist,  setPicklist]  = useState(null)
  const [loading,   setLoading]   = useState(true)
  const [pickedQtys, setPickedQtys] = useState({})   // idx → actual qty picked
  const [confirmed,  setConfirmed]  = useState(new Set())  // idxs fully confirmed
  const [active,    setActive]    = useState(0)
  const [activeQty, setActiveQty] = useState(null)   // qty being entered for active item
  const [scan,        setScan]        = useState('')
  const [scanErr,     setScanErr]     = useState('')
  const [ending,      setEnding]      = useState(false)
  const [expiryDates, setExpiryDates] = useState({})  // idx → 'YYYY-MM-DD'
  const scanRef = useRef(null)
  const elapsed = useElapsed(startedAt)

  useEffect(() => {
    orderAPI.pickList(order.id)
      .then(r => { setPicklist(r.data); setActive(0) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [order.id])

  const items = picklist?.pick_list ?? []
  const allConfirmed = items.length > 0 && confirmed.size >= items.length

  // When active item changes, pre-fill its qty input
  useEffect(() => {
    if (items[active]) {
      setActiveQty(pickedQtys[active] ?? items[active].cases_requested)
    }
  }, [active, items.length])

  function confirmItem(idx, qty) {
    setPickedQtys(prev => ({ ...prev, [idx]: qty }))
    setConfirmed(prev => new Set([...prev, idx]))
    setScan('')
    setScanErr('')
    // Advance to next unconfirmed
    const next = items.findIndex((_, i) => i > idx && !confirmed.has(i))
    if (next !== -1) setActive(next)
    else {
      // try from beginning
      const first = items.findIndex((_, i) => i !== idx && !confirmed.has(i))
      if (first !== -1) setActive(first)
    }
  }

  function handleScan(e) {
    e.preventDefault()
    const item = items[active]
    if (!item) return
    const expected = item.barcode || item.sku_code
    if (!expected) {
      // No barcode — scan counts as confirmation with activeQty
      confirmItem(active, activeQty ?? item.cases_requested)
      return
    }
    if (scan.trim() === expected) {
      confirmItem(active, activeQty ?? item.cases_requested)
    } else {
      setScanErr(`Expected: ${expected}`)
    }
  }

  async function handleEndPicking() {
    setEnding(true)
    try {
      const actualPicks = items.map((item, idx) => ({
        order_item_id: item.order_item_id,
        cases_picked:  confirmed.has(idx) ? (pickedQtys[idx] ?? item.cases_requested) : 0,
        expiry_date:   expiryDates[idx] || null,
      }))
      const res = await orderAPI.endPicking(order.id, actualPicks)
      onFinish(res.data.duration_seconds, actualPicks, items)
    } catch (e) {
      alert(e?.response?.data?.detail || 'Error')
      setEnding(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-400">Loading pick list…</p>
      </div>
    )
  }

  if (!picklist) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-4 px-6">
        <AlertTriangle size={40} className="text-red-400" />
        <p className="text-gray-700 font-medium text-center">Failed to load pick list</p>
        <button onClick={onBack} className="text-blue-600 font-medium">← Back</button>
      </div>
    )
  }

  const confirmedCount = confirmed.size

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-blue-600 text-white px-4 pt-8 pb-4 safe-top">
        <button onClick={onBack} className="flex items-center gap-1 text-blue-200 text-sm mb-3">
          <ChevronLeft size={16} /> Orders
        </button>
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold">{order.order_number}</h2>
            <p className="text-blue-200 text-sm">{order.store_name}</p>
          </div>
          <div className="text-right">
            <span className="text-2xl font-bold">{confirmedCount}</span>
            <span className="text-blue-300 text-lg">/{items.length}</span>
            <p className="text-blue-200 text-xs mt-0.5">items picked</p>
          </div>
        </div>

        {/* Timer row */}
        <div className="flex items-center justify-between mt-2">
          <div className="flex items-center gap-1.5 text-blue-200 text-sm">
            <Clock size={14} />
            <span className="font-mono font-bold text-white">{formatDuration(elapsed)}</span>
          </div>
          {pickerName && (
            <div className="flex items-center gap-1 text-blue-200 text-xs">
              <User size={12} /> {pickerName}
            </div>
          )}
        </div>

        {/* Progress bar */}
        <div className="mt-3 h-2 bg-blue-500 rounded-full overflow-hidden">
          <div
            className="h-full bg-white rounded-full transition-all duration-300"
            style={{ width: `${items.length ? (confirmedCount / items.length) * 100 : 0}%` }}
          />
        </div>
      </div>

      {/* Items list */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 pb-32">
        {items.map((item, idx) => {
          const isConfirmed = confirmed.has(idx)
          const isActive    = idx === active && !isConfirmed
          const qty         = pickedQtys[idx] ?? item.cases_requested

          return (
            <div
              key={idx}
              onClick={() => !isConfirmed && setActive(idx)}
              className={`rounded-xl border transition-all ${
                isConfirmed
                  ? 'bg-green-50 border-green-200 opacity-70'
                  : isActive
                  ? 'bg-white border-blue-400 shadow-md ring-2 ring-blue-300'
                  : 'bg-white border-gray-200 shadow-sm'
              }`}
            >
              <div className="flex items-start gap-3 p-4">
                <div className={`flex-shrink-0 mt-0.5 ${isConfirmed ? 'text-green-500' : 'text-gray-300'}`}>
                  {isConfirmed ? <CheckCircle2 size={24} /> : <Circle size={24} />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-bold text-gray-900 text-base leading-tight">{item.product_name}</p>
                    {item.bin_location && (
                      <span className="flex-shrink-0 font-mono font-black text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded text-sm tracking-wide">{item.bin_location}</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 font-mono mt-0.5">{item.sku_code}</p>
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    {statusBadge(item.status)}
                    {isConfirmed
                      ? pickedBadge(qty, item.cases_requested)
                      : <span className="text-sm text-gray-500">{item.cases_requested} case{item.cases_requested !== 1 ? 's' : ''} requested</span>
                    }
                  </div>

                  {/* Goods / expiry date — if SKU has show_goods_date enabled */}
                  {item.show_goods_date && item.picks && item.picks.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {item.picks.filter(p => p.expiry_date).map((p, pi) => (
                        <span key={pi} className="flex items-center gap-1 text-xs px-2 py-0.5 bg-amber-50 border border-amber-200 rounded-full text-amber-700">
                          <CalendarDays size={11} /> Exp: {p.expiry_date} · {p.cases_to_pick}cs from {p.warehouse}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Quick confirm button when not active */}
                {!isConfirmed && !isActive && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setActive(idx) }}
                    className="flex-shrink-0 bg-gray-100 active:bg-gray-200 text-gray-600 rounded-lg px-3 py-2 text-xs font-semibold"
                  >
                    Pick
                  </button>
                )}
              </div>

              {/* ── Active item: qty + locations + scan ── */}
              {isActive && (
                <div className="px-4 pb-4 border-t border-blue-100 pt-3 space-y-3">

                  {/* Bin location — prominent badge */}
                  {item.bin_location && (
                    <div className="flex items-center gap-3 bg-blue-600 rounded-xl px-4 py-3">
                      <div className="flex-1">
                        <p className="text-xs font-semibold text-blue-200 uppercase tracking-wide">Go To Location</p>
                        <p className="text-2xl font-black text-white font-mono tracking-widest">{item.bin_location}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-blue-200">Pick #{item.pick_order}</p>
                      </div>
                    </div>
                  )}

                  {/* Batch detail */}
                  {item.picks && item.picks.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Pick From</p>
                      {item.picks.map((pick, pi) => (
                        <div key={pi} className="flex items-center justify-between bg-blue-50 rounded-lg px-3 py-2">
                          <div>
                            <span className="font-bold text-blue-700 text-sm">{pick.warehouse}</span>
                            <span className="text-blue-500 text-xs ml-2">Batch {pick.batch_code}</span>
                          </div>
                          <span className="font-bold text-blue-800">{pick.cases_to_pick} cs</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Actual qty entry */}
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Actual Qty Picked</p>
                    <QtyInput
                      value={activeQty ?? item.cases_requested}
                      onChange={setActiveQty}
                      max={item.cases_requested}
                    />
                  </div>

                  {/* Barcode scan */}
                  <form onSubmit={handleScan}>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Scan to Confirm</p>
                    <div className="flex gap-2">
                      <div className="flex-1 flex items-center gap-2 bg-white border border-gray-300 rounded-lg px-3 py-2.5">
                        <ScanLine size={16} className="text-gray-400 flex-shrink-0" />
                        <input
                          ref={scanRef}
                          className="flex-1 text-sm outline-none placeholder-gray-400"
                          placeholder={item.barcode ? `Scan barcode (${item.barcode})…` : 'Scan or tap Confirm…'}
                          value={scan}
                          onChange={e => { setScan(e.target.value); setScanErr('') }}
                          autoComplete="off"
                          inputMode="none"
                        />
                      </div>
                      <button
                        type="submit"
                        className="bg-blue-600 text-white rounded-lg px-4 text-sm font-semibold active:bg-blue-700"
                      >
                        Verify
                      </button>
                    </div>
                    {scanErr && (
                      <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                        <AlertTriangle size={12} /> {scanErr}
                      </p>
                    )}
                  </form>

                  {/* Expiry date entry — only if SKU requires it */}
                  {item.require_expiry_entry && (
                    <div>
                      <p className="text-xs font-semibold text-red-600 uppercase tracking-wide mb-2 flex items-center gap-1">
                        <CalendarDays size={12} /> Best-Before / Expiry Date <span className="text-red-400">(required)</span>
                      </p>
                      <input
                        type="date"
                        className="w-full border border-red-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
                        value={expiryDates[idx] || ''}
                        onChange={e => setExpiryDates(prev => ({ ...prev, [idx]: e.target.value }))}
                      />
                    </div>
                  )}

                  {/* Confirm button */}
                  <button
                    onClick={() => confirmItem(idx, activeQty ?? item.cases_requested)}
                    disabled={item.require_expiry_entry && !expiryDates[idx]}
                    className="w-full bg-green-500 active:bg-green-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl py-3 text-sm font-bold transition-colors flex items-center justify-center gap-2"
                  >
                    <CheckCircle2 size={18} />
                    Confirm Pick — {activeQty ?? item.cases_requested} case{(activeQty ?? item.cases_requested) !== 1 ? 's' : ''}
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Bottom action bar */}
      <div className="fixed bottom-0 inset-x-0 bg-white border-t border-gray-200 px-4 py-4 safe-bottom">
        {allConfirmed ? (
          <button
            onClick={handleEndPicking}
            disabled={ending}
            className="w-full bg-green-500 active:bg-green-600 disabled:opacity-60 text-white rounded-xl py-4 flex items-center justify-center gap-2 text-base font-bold transition-colors"
          >
            <CheckSquare size={20} />
            {ending ? 'Finishing…' : 'Finish Picking'}
          </button>
        ) : (
          <div className="flex items-center justify-between text-sm text-gray-500">
            <span>{items.length - confirmedCount} items remaining</span>
            <button
              onClick={() => {
                const next = items.findIndex((_, i) => !confirmed.has(i))
                if (next !== -1) setActive(next)
              }}
              className="flex items-center gap-1 text-blue-600 font-medium"
            >
              <RotateCcw size={14} /> Next unpicked
            </button>
          </div>
        )}
      </div>
    </div>
  )
}


// ── Picking Done screen — Admin Notify (NO dispatch from picker) ─
function PickingDoneScreen({ order, pickerName, duration, pickedItems, onBack }) {
  const totalPicked    = pickedItems?.reduce((s, i) => s + (i.cases_picked ?? 0), 0) ?? 0
  const totalRequested = pickedItems?.reduce((s, i) => s + (i.cases_requested ?? 0), 0) ?? 0
  const hasShortage    = totalPicked < totalRequested

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-5 px-6">
      <div className="text-6xl">🎉</div>
      <h2 className="text-2xl font-bold text-gray-800 text-center">Picking Complete!</h2>

      <div className="bg-white rounded-2xl border border-gray-200 p-6 w-full max-w-sm space-y-3">
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Order</span>
          <span className="font-bold">{order.order_number}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Store</span>
          <span>{order.store_name}</span>
        </div>
        {pickerName && (
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Picker</span>
            <span className="font-medium">{pickerName}</span>
          </div>
        )}
        {duration != null && (
          <div className="flex justify-between text-sm border-t pt-3">
            <span className="text-gray-500">Duration</span>
            <span className="font-bold text-green-600">{formatDuration(duration)}</span>
          </div>
        )}
        {pickedItems && (
          <div className="flex justify-between text-sm border-t pt-3">
            <span className="text-gray-500">Cases picked</span>
            <span className={`font-bold ${hasShortage ? 'text-orange-600' : 'text-green-600'}`}>
              {totalPicked} / {totalRequested}
            </span>
          </div>
        )}
      </div>

      {/* Admin notification card */}
      <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5 w-full max-w-sm flex items-start gap-3">
        <Bell size={22} className="text-blue-600 flex-shrink-0 mt-0.5" />
        <div>
          <p className="font-bold text-blue-800 text-sm">Admin has been notified</p>
          <p className="text-blue-600 text-xs mt-1">
            The order status is now <strong>Packed</strong>. An admin will review and dispatch this order from the Dispatch Board.
          </p>
        </div>
      </div>

      {hasShortage && (
        <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4 w-full max-w-sm flex items-start gap-3">
          <AlertTriangle size={20} className="text-orange-500 flex-shrink-0 mt-0.5" />
          <p className="text-orange-700 text-xs">
            <strong>Short pick noted.</strong> Some items had less stock than requested. Admin will see the shortage summary on the Dispatch Board.
          </p>
        </div>
      )}

      <button
        onClick={onBack}
        className="w-full max-w-sm bg-blue-600 active:bg-blue-700 text-white rounded-xl py-4 text-base font-bold flex items-center justify-center gap-2"
      >
        <Package size={20} /> Pick Another Order
      </button>
    </div>
  )
}


// ── Main export ────────────────────────────────────────────────
export default function MobilePicking() {
  const [phase, setPhase]               = useState('list')
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [pickerName, setPickerName]     = useState('')
  const [startedAt, setStartedAt]       = useState(null)
  const [duration, setDuration]         = useState(null)
  const [pickedItems, setPickedItems]   = useState(null)

  function reset() {
    setPhase('list')
    setSelectedOrder(null)
    setPickerName('')
    setStartedAt(null)
    setDuration(null)
    setPickedItems(null)
  }

  if (phase === 'done') {
    return (
      <PickingDoneScreen
        order={selectedOrder}
        pickerName={pickerName}
        duration={duration}
        pickedItems={pickedItems}
        onBack={reset}
      />
    )
  }

  if (phase === 'picking') {
    return (
      <PickSession
        order={selectedOrder}
        pickerName={pickerName}
        startedAt={startedAt}
        onBack={() => setPhase('start')}
        onFinish={(dur, actualPicks, items) => {
          // Merge actual picks with item details for the done screen
          const enriched = items.map((item, idx) => ({
            ...item,
            cases_picked: actualPicks[idx]?.cases_picked ?? item.cases_requested,
          }))
          setDuration(dur)
          setPickedItems(enriched)
          setPhase('done')
        }}
      />
    )
  }

  if (phase === 'start') {
    return (
      <StartScreen
        order={selectedOrder}
        onBack={() => setPhase('list')}
        onStart={(name, at) => { setPickerName(name); setStartedAt(at); setPhase('picking') }}
      />
    )
  }

  return (
    <OrderList
      onSelect={(order) => { setSelectedOrder(order); setPhase('start') }}
    />
  )
}
