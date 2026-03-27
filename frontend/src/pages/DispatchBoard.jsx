import { useEffect, useState, useRef, useCallback } from 'react'
import { boardAPI } from '../api/client'
import {
  RefreshCw, ChevronLeft, ChevronRight, Users, Package,
  Truck, CheckCircle, Clock, Zap, AlertTriangle, Edit2,
  Check, X, Calendar, BarChart2, Wifi, WifiOff, Bell
} from 'lucide-react'

// ── Constants ─────────────────────────────────────────────────
const STATUSES = ['Queued', 'Packing', 'Packed', 'Loaded', 'Done']

const STATUS_STYLES = {
  Queued:  { bg: 'bg-gray-100',    text: 'text-gray-600',   border: 'border-gray-300',  dot: 'bg-gray-400',   row: 'bg-white',           icon: Clock },
  Packing: { bg: 'bg-blue-100',    text: 'text-blue-700',   border: 'border-blue-400',  dot: 'bg-blue-500',   row: 'bg-blue-50',         icon: Package },
  Packed:  { bg: 'bg-yellow-100',  text: 'text-yellow-700', border: 'border-yellow-400',dot: 'bg-yellow-500', row: 'bg-yellow-50',       icon: CheckCircle },
  Loaded:  { bg: 'bg-purple-100',  text: 'text-purple-700', border: 'border-purple-400',dot: 'bg-purple-500', row: 'bg-purple-50',       icon: Truck },
  Done:    { bg: 'bg-green-100',   text: 'text-green-700',  border: 'border-green-400', dot: 'bg-green-500',  row: 'bg-green-50 opacity-80', icon: CheckCircle },
}

const PRIORITY_STYLES = {
  Normal:  { badge: 'bg-gray-100 text-gray-600', label: 'Normal' },
  Urgent:  { badge: 'bg-orange-100 text-orange-700 font-bold', label: '⚡ Urgent' },
  Express: { badge: 'bg-red-100 text-red-700 font-bold', label: '🚨 Express' },
}

const fmtTime = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

// ── Inline editable cell ──────────────────────────────────────
function EditableCell({ value, placeholder, onSave, type = 'text', options, width = 'w-32' }) {
  const [editing, setEditing] = useState(false)
  const [draft,   setDraft]   = useState(value || '')
  const inputRef = useRef(null)

  const open  = () => { setDraft(value || ''); setEditing(true) }
  const close = () => setEditing(false)
  const save  = () => { onSave(draft); close() }

  useEffect(() => { if (editing && inputRef.current) inputRef.current.focus() }, [editing])

  if (!editing) {
    return (
      <button
        onClick={open}
        className={`group flex items-center gap-1 text-left ${!value ? 'text-gray-300 italic' : 'text-gray-800'} hover:text-blue-600 transition-colors min-w-[60px]`}
      >
        <span className="truncate max-w-[120px]">{value || placeholder}</span>
        <Edit2 size={11} className="opacity-0 group-hover:opacity-100 flex-shrink-0 text-blue-400" />
      </button>
    )
  }

  return (
    <div className="flex items-center gap-1">
      {options ? (
        <select
          ref={inputRef}
          className={`${width} text-sm border border-blue-400 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-400`}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={save}
          onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') close() }}
        >
          {options.map(o => <option key={o}>{o}</option>)}
        </select>
      ) : (
        <input
          ref={inputRef}
          type={type}
          className={`${width} text-sm border border-blue-400 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-400`}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={save}
          onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') close() }}
          placeholder={placeholder}
        />
      )}
      <button onClick={save}  className="p-1 text-green-500 hover:text-green-700"><Check size={13} /></button>
      <button onClick={close} className="p-1 text-gray-400 hover:text-red-500"><X    size={13} /></button>
    </div>
  )
}

// ── Status pill with click-through cycle ─────────────────────
function StatusPill({ status, onNext, onPrev }) {
  const s = STATUS_STYLES[status] || STATUS_STYLES.Queued
  const Icon = s.icon
  return (
    <div className="flex items-center gap-0.5">
      <button
        onClick={onPrev}
        className="p-0.5 text-gray-300 hover:text-gray-500 rounded"
        title="Move back"
      ><ChevronLeft size={13} /></button>
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${s.bg} ${s.text} ${s.border} whitespace-nowrap`}>
        <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
        {status}
      </span>
      <button
        onClick={onNext}
        className="p-0.5 text-gray-300 hover:text-blue-500 rounded"
        title="Move forward"
      ><ChevronRight size={13} /></button>
    </div>
  )
}

// ── Summary bar cards ─────────────────────────────────────────
function SummaryCard({ label, count, total, style }) {
  const Icon = style.icon
  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${style.bg} ${style.border}`}>
      <Icon size={15} className={style.text} />
      <div>
        <div className={`text-lg font-bold leading-none ${style.text}`}>{count}</div>
        <div className={`text-xs ${style.text} opacity-75`}>{label}</div>
      </div>
    </div>
  )
}

// ── User name prompt modal ────────────────────────────────────
function UserNameModal({ onSet }) {
  const [name, setName] = useState('')
  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
        <div className="text-center">
          <div className="text-3xl mb-2">👤</div>
          <h3 className="font-bold text-gray-900 text-lg">Who are you?</h3>
          <p className="text-sm text-gray-500 mt-1">Enter your name so others can see who is updating the board</p>
        </div>
        <input
          className="input text-center font-semibold"
          placeholder="Your name or initials…"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && name.trim() && onSet(name.trim())}
          autoFocus
        />
        <button
          className="btn-primary w-full"
          disabled={!name.trim()}
          onClick={() => onSet(name.trim())}
        >
          Open Board
        </button>
      </div>
    </div>
  )
}

// ── Order detail flyout ───────────────────────────────────────
function OrderFlyout({ row, onClose, onUpdate, userName }) {
  if (!row) return null
  const s = STATUS_STYLES[row.packing_status] || STATUS_STYLES.Queued

  return (
    <div className="fixed inset-0 bg-black bg-opacity-40 z-40 flex items-end sm:items-center justify-center p-4"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg space-y-0 overflow-hidden">
        {/* Header */}
        <div className={`px-5 py-4 ${s.bg} border-b ${s.border}`}>
          <div className="flex items-center justify-between">
            <div>
              <p className={`text-xs font-mono font-bold ${s.text}`}>{row.order_number}</p>
              <h3 className="font-bold text-gray-900 text-lg mt-0.5">{row.store_name}</h3>
            </div>
            <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-700 hover:bg-white rounded-xl">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Status + Priority row */}
          <div className="flex items-center gap-3 flex-wrap">
            <div>
              <p className="text-xs text-gray-400 mb-1">Packing Status</p>
              <select
                className="input py-1.5 text-sm w-36"
                value={row.packing_status}
                onChange={e => onUpdate(row.id, { packing_status: e.target.value, updated_by: userName })}
              >
                {STATUSES.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-1">Priority</p>
              <select
                className="input py-1.5 text-sm w-28"
                value={row.priority}
                onChange={e => onUpdate(row.id, { priority: e.target.value, updated_by: userName })}
              >
                {['Normal','Urgent','Express'].map(p => <option key={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-1">Picker / Packer</p>
              <input
                className="input py-1.5 text-sm w-32"
                placeholder="Name…"
                defaultValue={row.picker_name}
                onBlur={e => onUpdate(row.id, { picker_name: e.target.value, updated_by: userName })}
              />
            </div>
          </div>

          {/* Pallets + Route */}
          <div className="flex gap-3">
            <div className="flex-1">
              <p className="text-xs text-gray-400 mb-1">No. of Pallets</p>
              <input
                type="number" min="0"
                className="input py-1.5 text-sm"
                placeholder="0"
                defaultValue={row.num_pallets ?? ''}
                onBlur={e => onUpdate(row.id, { num_pallets: parseInt(e.target.value) || null, updated_by: userName })}
              />
            </div>
            <div className="flex-1">
              <p className="text-xs text-gray-400 mb-1">Route / Zone</p>
              <input
                className="input py-1.5 text-sm"
                placeholder="e.g. North, Route 2…"
                defaultValue={row.route}
                onBlur={e => onUpdate(row.id, { route: e.target.value, updated_by: userName })}
              />
            </div>
          </div>

          {/* Delivery notes */}
          <div>
            <p className="text-xs text-gray-400 mb-1">Delivery Notes</p>
            <textarea
              className="input py-1.5 text-sm w-full resize-none"
              rows={2}
              placeholder="Driver instructions, customer notes…"
              defaultValue={row.delivery_notes}
              onBlur={e => onUpdate(row.id, { delivery_notes: e.target.value, updated_by: userName })}
            />
          </div>

          {/* Items */}
          <div>
            <p className="text-xs text-gray-400 mb-2">
              Order Items ({row.item_count} lines ·{' '}
              {row.total_cases_picked != null && row.total_cases_picked !== row.total_cases
                ? <><span className="text-orange-600 font-semibold">{row.total_cases_picked}</span><span className="text-gray-400">/{row.total_cases} cases</span></>
                : <span>{row.total_cases} cases</span>
              }
            </p>
            <div className="bg-gray-50 rounded-xl px-3 py-2 text-sm text-gray-700 font-mono leading-6 max-h-32 overflow-y-auto">
              {row.items_preview}
            </div>
          </div>

          {/* Short-pick alert */}
          {row.has_short_pick && row.short_pick_items?.length > 0 && (
            <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 space-y-2">
              <div className="flex items-center gap-2">
                <AlertTriangle size={15} className="text-orange-500 flex-shrink-0" />
                <p className="text-xs font-bold text-orange-700">Short pick recorded by {row.picker_name || 'picker'}</p>
              </div>
              <div className="space-y-1">
                {row.short_pick_items.map((item, i) => (
                  <div key={i} className="flex items-center justify-between text-xs bg-white rounded-lg px-2 py-1.5 border border-orange-100">
                    <span className="font-mono text-gray-700 font-medium">{item.sku_code}</span>
                    <span className="text-gray-500 truncate mx-2 flex-1">{item.product_name}</span>
                    <span className="font-semibold text-orange-600 whitespace-nowrap">
                      {item.picked} / {item.requested} cs
                    </span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-orange-500">Review before dispatching — customer may need to be notified of shortage.</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-gray-50 border-t flex items-center justify-between text-xs text-gray-400">
          <span>{row.notes}</span>
          {row.board_updated_by && (
            <span>Last updated by <strong>{row.board_updated_by}</strong> at {fmtTime(row.board_updated_at)}</span>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main Board ────────────────────────────────────────────────
export default function DispatchBoard() {
  const todayStr = new Date().toISOString().split('T')[0]

  const [userName,    setUserName]   = useState(() => {
    const stored = localStorage.getItem('wms_user') || ''
    // Guard against accidentally stored JSON objects (e.g. full user object)
    if (stored.startsWith('{')) {
      try { const p = JSON.parse(stored); return p.username || p.name || '' } catch { return '' }
    }
    return stored
  })
  const [boardDate,   setBoardDate]  = useState(todayStr)
  const [rows,        setRows]       = useState([])
  const [summary,     setSummary]    = useState(null)
  const [dates,       setDates]      = useState([])
  const [loading,     setLoading]    = useState(true)
  const [lastChange,  setLastChange] = useState(null)
  const [connected,   setConnected]  = useState(true)
  const [flyout,      setFlyout]     = useState(null)
  const [filter,      setFilter]     = useState('All')   // All | status
  const [search,      setSearch]     = useState('')
  const [lastRefreshed, setLastRefreshed] = useState(new Date())

  const pollRef = useRef(null)

  // Persist user name
  const setUser = (name) => {
    localStorage.setItem('wms_user', name)
    setUserName(name)
  }

  // Full load
  const loadBoard = useCallback(async (date = boardDate) => {
    try {
      const [boardRes, summaryRes] = await Promise.all([
        boardAPI.getBoard(date),
        boardAPI.summary(date),
      ])
      setRows(boardRes.data.rows)
      setSummary(summaryRes.data)
      setLastChange(boardRes.data.rows.reduce((m, r) => r.board_updated_at > m ? r.board_updated_at : m, '') || null)
      setConnected(true)
      setLastRefreshed(new Date())
    } catch {
      setConnected(false)
    }
    setLoading(false)
  }, [boardDate])

  // Initial load + load on date change
  useEffect(() => {
    setLoading(true)
    setRows([])
    loadBoard(boardDate)
  }, [boardDate])

  // Load available dates once
  useEffect(() => {
    boardAPI.dates().then(r => setDates(r.data)).catch(() => {})
  }, [])

  // Poll every 5 seconds
  useEffect(() => {
    const poll = async () => {
      try {
        const r = await boardAPI.poll(boardDate)
        const newChange = r.data.last_change
        if (newChange && newChange !== lastChange) {
          await loadBoard(boardDate)
        }
        setConnected(true)
      } catch {
        setConnected(false)
      }
    }
    pollRef.current = setInterval(poll, 5000)
    return () => clearInterval(pollRef.current)
  }, [boardDate, lastChange, loadBoard])

  // Update a row field
  const handleUpdate = async (orderId, fields) => {
    try {
      const res = await boardAPI.update(orderId, { ...fields, updated_by: fields.updated_by || userName })
      const updated = res.data
      setRows(prev => prev.map(r => r.id === orderId ? updated : r))
      if (flyout?.id === orderId) setFlyout(updated)
      // Refresh summary
      boardAPI.summary(boardDate).then(r => setSummary(r.data)).catch(() => {})
    } catch (e) {
      alert(e.response?.data?.detail || e.message)
    }
  }

  // Step status forward / back
  const stepStatus = (row, dir) => {
    const idx = STATUSES.indexOf(row.packing_status)
    const next = STATUSES[Math.max(0, Math.min(STATUSES.length - 1, idx + dir))]
    if (next !== row.packing_status) {
      handleUpdate(row.id, { packing_status: next })
    }
  }

  // Filtered rows
  const displayed = rows.filter(r => {
    if (filter !== 'All' && r.packing_status !== filter) return false
    if (search) {
      const q = search.toLowerCase()
      return r.store_name.toLowerCase().includes(q) ||
             r.order_number.toLowerCase().includes(q) ||
             (r.picker_name || '').toLowerCase().includes(q) ||
             (r.route || '').toLowerCase().includes(q)
    }
    return true
  })

  // User name gate
  if (!userName) return <UserNameModal onSet={setUser} />

  return (
    <div className="space-y-4">
      {flyout && (
        <OrderFlyout
          row={flyout}
          onClose={() => setFlyout(null)}
          onUpdate={handleUpdate}
          userName={userName}
        />
      )}

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            📋 Dispatch Board
            {connected
              ? <Wifi size={16} className="text-green-500" title="Live" />
              : <WifiOff size={16} className="text-red-400" title="Connection lost" />
            }
          </h2>
          <p className="text-sm text-gray-400 mt-0.5">
            Live tracking · auto-refreshes every 5s · viewing as <strong>{userName}</strong>
            <button onClick={() => { localStorage.removeItem('wms_user'); setUserName('') }}
              className="ml-2 text-blue-400 hover:underline text-xs">change</button>
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Date navigator */}
          <div className="flex items-center gap-1 border border-gray-200 rounded-xl px-2 py-1.5">
            <button
              onClick={() => {
                const d = new Date(boardDate); d.setDate(d.getDate() - 1)
                setBoardDate(d.toISOString().split('T')[0])
              }}
              className="p-1 text-gray-400 hover:text-gray-700 rounded"
            ><ChevronLeft size={16} /></button>
            <input
              type="date" className="text-sm font-medium text-gray-700 bg-transparent outline-none w-36"
              value={boardDate}
              onChange={e => setBoardDate(e.target.value)}
            />
            <button
              onClick={() => {
                const d = new Date(boardDate); d.setDate(d.getDate() + 1)
                setBoardDate(d.toISOString().split('T')[0])
              }}
              className="p-1 text-gray-400 hover:text-gray-700 rounded"
            ><ChevronRight size={16} /></button>
          </div>
          <button
            onClick={() => setBoardDate(todayStr)}
            className={`text-sm px-3 py-1.5 rounded-xl border transition-colors ${boardDate === todayStr ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
          >Today</button>
          <button
            onClick={() => loadBoard(boardDate)}
            className="p-2 text-gray-400 hover:text-gray-700 border border-gray-200 rounded-xl"
            title="Refresh now"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* ── Summary bar ── */}
      {summary && (
        <div className="flex flex-wrap items-center gap-2 bg-gray-50 rounded-xl px-4 py-3">
          <div className="flex items-center gap-1 mr-2">
            <BarChart2 size={14} className="text-gray-400" />
            <span className="text-sm font-bold text-gray-700">{summary.total_orders} orders</span>
            <span className="text-sm text-gray-400">· {summary.total_cases} cases</span>
          </div>
          {STATUSES.map(s => (
            <button
              key={s}
              onClick={() => setFilter(filter === s ? 'All' : s)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border transition-all ${
                filter === s
                  ? `${STATUS_STYLES[s].bg} ${STATUS_STYLES[s].text} ${STATUS_STYLES[s].border} ring-2 ring-offset-1 ring-current`
                  : `${STATUS_STYLES[s].bg} ${STATUS_STYLES[s].text} ${STATUS_STYLES[s].border} opacity-70 hover:opacity-100`
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${STATUS_STYLES[s].dot}`} />
              {s} <span className="font-bold">({summary.by_status[s] || 0})</span>
            </button>
          ))}
          <div className="ml-auto text-xs text-gray-400">
            Last refresh: {lastRefreshed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </div>
        </div>
      )}

      {/* ── Search + filter ── */}
      <div className="flex items-center gap-3">
        <input
          className="input flex-1 py-2 text-sm"
          placeholder="Search store, order number, picker, route…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        {filter !== 'All' && (
          <button onClick={() => setFilter('All')} className="text-xs text-blue-600 hover:underline whitespace-nowrap">
            Clear filter
          </button>
        )}
      </div>

      {/* ── Board table ── */}
      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto sm:overflow-x-auto">
          <table className="w-full text-sm table-fixed">
            <thead className="bg-gray-900 text-white">
              <tr>
                <th className="px-2 sm:px-3 py-3 text-left font-semibold text-gray-200 w-[28%] sm:w-36">Order #</th>
                <th className="px-2 sm:px-3 py-3 text-left font-semibold text-gray-200">Store / Customer</th>
                <th className="px-3 py-3 text-center font-semibold text-gray-200 w-28 hidden sm:table-cell">Priority</th>
                <th className="px-3 py-3 text-left font-semibold text-gray-200 w-40 hidden sm:table-cell">
                  <div className="flex items-center gap-1"><Users size={13} /> Picker</div>
                </th>
                <th className="px-3 py-3 text-center font-semibold text-gray-200 w-16 hidden sm:table-cell">
                  <div className="flex items-center justify-center gap-1"><Package size={13} /> Cases</div>
                </th>
                <th className="px-3 py-3 text-center font-semibold text-gray-200 w-24 hidden sm:table-cell">
                  <div className="flex items-center justify-center gap-1"><Truck size={13} /> Pallets</div>
                </th>
                <th className="px-3 py-3 text-left font-semibold text-gray-200 w-32 hidden sm:table-cell">Route / Zone</th>
                <th className="px-2 sm:px-3 py-3 text-left font-semibold text-gray-200 w-[35%] sm:w-44">Status</th>
                <th className="px-3 py-3 text-right font-semibold text-gray-200 w-28 text-xs hidden sm:table-cell">Updated</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} className="py-12 text-center text-gray-400">
                  <RefreshCw size={20} className="animate-spin mx-auto mb-2 text-blue-400" />
                  Loading board…
                </td></tr>
              ) : displayed.length === 0 ? (
                <tr><td colSpan={9} className="py-12 text-center text-gray-400">
                  <Calendar size={28} className="mx-auto mb-2 text-gray-300" />
                  {rows.length === 0 ? `No orders on ${boardDate}` : 'No orders match filter'}
                </td></tr>
              ) : (
                displayed.map(row => {
                  const s = STATUS_STYLES[row.packing_status] || STATUS_STYLES.Queued
                  const p = PRIORITY_STYLES[row.priority]    || PRIORITY_STYLES.Normal
                  return (
                    <tr
                      key={row.id}
                      className={`border-b border-gray-100 ${s.row} transition-colors`}
                    >
                      {/* Order # */}
                      <td className="px-2 sm:px-3 py-3">
                        <button
                          onClick={() => setFlyout(row)}
                          className="font-mono text-xs text-blue-700 font-bold hover:underline"
                        >{row.order_number}</button>
                        {row.notes && <div className="text-xs text-gray-400 truncate max-w-[100px]">{row.notes}</div>}
                        {/* Mobile: show priority badge inline */}
                        {row.priority && row.priority !== 'Normal' && (
                          <div className="sm:hidden mt-1">
                            <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${p.bg} ${p.text}`}>{row.priority}</span>
                          </div>
                        )}
                      </td>

                      {/* Store */}
                      <td className="px-2 sm:px-3 py-3">
                        <button onClick={() => setFlyout(row)} className="font-semibold text-gray-800 hover:text-blue-700 text-left leading-tight">
                          {row.store_name}
                        </button>
                        <div className="text-xs text-gray-400 mt-0.5 truncate max-w-[140px]">{row.items_preview}</div>
                        {/* Mobile: show picker + cases below store name */}
                        <div className="sm:hidden flex items-center gap-2 mt-1 flex-wrap">
                          {row.picker_name && (
                            <span className="text-xs text-blue-600">👤 {row.picker_name}</span>
                          )}
                          <span className="text-xs text-gray-500">
                            {row.has_short_pick && row.total_cases_picked != null
                              ? <><span className="text-orange-500 font-semibold">{row.total_cases_picked}/{row.total_cases}</span> cs</>
                              : <>{row.total_cases} cs</>
                            }
                            {' · '}{row.item_count} lines
                          </span>
                        </div>
                      </td>

                      {/* Priority — desktop only */}
                      <td className="px-3 py-3 text-center hidden sm:table-cell">
                        <EditableCell
                          value={row.priority}
                          placeholder="Normal"
                          options={['Normal','Urgent','Express']}
                          onSave={v => handleUpdate(row.id, { priority: v })}
                          width="w-24"
                        />
                      </td>

                      {/* Picker — desktop only */}
                      <td className="px-3 py-3 hidden sm:table-cell">
                        <EditableCell
                          value={row.picker_name}
                          placeholder="Assign…"
                          onSave={v => handleUpdate(row.id, { picker_name: v })}
                          width="w-28"
                        />
                      </td>

                      {/* Cases — desktop only */}
                      <td className="px-3 py-3 text-center hidden sm:table-cell">
                        {row.has_short_pick && row.total_cases_picked != null ? (
                          <span className="font-bold text-orange-500">{row.total_cases_picked}<span className="text-gray-400 font-normal">/{row.total_cases}</span></span>
                        ) : (
                          <span className="font-bold text-gray-700">{row.total_cases}</span>
                        )}
                        <div className="text-xs text-gray-400">{row.item_count} lines</div>
                      </td>

                      {/* Pallets — desktop only */}
                      <td className="px-3 py-3 text-center hidden sm:table-cell">
                        <EditableCell
                          value={row.num_pallets?.toString() || ''}
                          placeholder="—"
                          type="number"
                          onSave={v => handleUpdate(row.id, { num_pallets: parseInt(v) || null })}
                          width="w-14"
                        />
                      </td>

                      {/* Route — desktop only */}
                      <td className="px-3 py-3 hidden sm:table-cell">
                        <EditableCell
                          value={row.route}
                          placeholder="Route…"
                          onSave={v => handleUpdate(row.id, { route: v })}
                          width="w-28"
                        />
                      </td>

                      {/* Status */}
                      <td className="px-2 sm:px-3 py-3">
                        <StatusPill
                          status={row.packing_status}
                          onNext={() => stepStatus(row,  1)}
                          onPrev={() => stepStatus(row, -1)}
                        />
                        {row.delivery_notes && (
                          <div className="text-xs text-gray-400 mt-0.5 truncate max-w-[120px]" title={row.delivery_notes}>
                            📝 {row.delivery_notes}
                          </div>
                        )}
                      </td>

                      {/* Updated — desktop only */}
                      <td className="px-3 py-3 text-right hidden sm:table-cell">
                        {row.board_updated_by ? (
                          <>
                            <div className="text-xs font-medium text-gray-600">{row.board_updated_by}</div>
                            <div className="text-xs text-gray-400">{fmtTime(row.board_updated_at)}</div>
                          </>
                        ) : (
                          <span className="text-xs text-gray-300">—</span>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 bg-gray-50 border-t flex items-center justify-between text-xs text-gray-400">
          <span>{displayed.length} of {rows.length} orders shown</span>
          <span className={`flex items-center gap-1 ${connected ? 'text-green-500' : 'text-red-400'}`}>
            {connected ? <Wifi size={11} /> : <WifiOff size={11} />}
            {connected ? 'Live — polling every 5s' : 'Disconnected — retrying…'}
          </span>
        </div>
      </div>

      {/* ── Legend ── */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-gray-400 pt-1">
        <span className="font-medium text-gray-500">Status flow:</span>
        {STATUSES.map((s, i) => (
          <span key={s} className="flex items-center gap-1">
            <span className={`w-2 h-2 rounded-full ${STATUS_STYLES[s].dot}`} />
            <span className={STATUS_STYLES[s].text}>{s}</span>
            {i < STATUSES.length - 1 && <span className="text-gray-300">→</span>}
          </span>
        ))}
        <span className="ml-4">· Click cells to edit inline · Click order # for full detail</span>
      </div>
    </div>
  )
}
