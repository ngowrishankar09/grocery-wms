import { useState, useEffect, useCallback } from 'react'
import { warehouseTaskAPI } from '../api/client'
import {
  ClipboardList, CheckCircle2, XCircle, Play, Clock, Filter,
  RefreshCw, Package, ArrowRightLeft, Truck, Search, Lock, Unlock,
  AlertTriangle, ChevronDown
} from 'lucide-react'

const TYPE_LABELS = {
  pick:        { label: 'Pick',       color: 'bg-blue-100 text-blue-700',    icon: Package },
  receive:     { label: 'Receive',    color: 'bg-green-100 text-green-700',  icon: Truck },
  putaway:     { label: 'Put Away',   color: 'bg-purple-100 text-purple-700',icon: ArrowRightLeft },
  transfer:    { label: 'Transfer',   color: 'bg-amber-100 text-amber-700',  icon: ArrowRightLeft },
  block:       { label: 'Block',      color: 'bg-red-100 text-red-700',      icon: Lock },
  release:     { label: 'Release',    color: 'bg-emerald-100 text-emerald-700', icon: Unlock },
  stocktake:   { label: 'Stock Take', color: 'bg-indigo-100 text-indigo-700',icon: ClipboardList },
}

const STATUS_TABS = [
  { key: null,         label: 'All' },
  { key: 'pending',    label: 'Pending' },
  { key: 'in_progress',label: 'In Progress' },
  { key: 'confirmed',  label: 'Confirmed' },
  { key: 'cancelled',  label: 'Cancelled' },
]

function TypeBadge({ type }) {
  const cfg = TYPE_LABELS[type] || { label: type, color: 'bg-gray-100 text-gray-600', icon: ClipboardList }
  const Icon = cfg.icon
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium rounded-full px-2 py-0.5 ${cfg.color}`}>
      <Icon size={10} />{cfg.label}
    </span>
  )
}

function StatusBadge({ status }) {
  const cfg = {
    pending:     'bg-amber-100 text-amber-700',
    in_progress: 'bg-blue-100 text-blue-700',
    confirmed:   'bg-green-100 text-green-700',
    cancelled:   'bg-gray-100 text-gray-500',
  }[status] || 'bg-gray-100 text-gray-500'
  const icons = {
    pending: <Clock size={10} />,
    in_progress: <Play size={10} />,
    confirmed: <CheckCircle2 size={10} />,
    cancelled: <XCircle size={10} />,
  }
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium rounded-full px-2 py-0.5 ${cfg}`}>
      {icons[status]} {status.replace('_', ' ')}
    </span>
  )
}

export default function WarehouseTasks() {
  const [tasks,      setTasks]      = useState([])
  const [stats,      setStats]      = useState({})
  const [loading,    setLoading]    = useState(true)
  const [statusTab,  setStatusTab]  = useState(null)
  const [typeFilter, setTypeFilter] = useState('')
  const [search,     setSearch]     = useState('')
  const [saving,     setSaving]     = useState({})

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = {}
      if (statusTab)  params.status    = statusTab
      if (typeFilter) params.task_type = typeFilter
      const [tasksRes, statsRes] = await Promise.all([
        warehouseTaskAPI.list(params),
        warehouseTaskAPI.stats(),
      ])
      setTasks(tasksRes.data)
      setStats(statsRes.data)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [statusTab, typeFilter])

  useEffect(() => { load() }, [load])

  const action = async (id, fn) => {
    setSaving(s => ({ ...s, [id]: true }))
    try { await fn(); await load() }
    catch (e) { alert(e?.response?.data?.detail || 'Error') }
    finally { setSaving(s => ({ ...s, [id]: false })) }
  }

  const filteredTasks = tasks.filter(t => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      t.sku_code?.toLowerCase().includes(q) ||
      t.product_name?.toLowerCase().includes(q) ||
      t.batch_code?.toLowerCase().includes(q) ||
      t.order_number?.toLowerCase().includes(q) ||
      t.assigned_to_name?.toLowerCase().includes(q)
    )
  })

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Warehouse Tasks</h1>
          <p className="text-sm text-gray-500 mt-0.5">Every movement tracked — pick, block, release, transfer</p>
        </div>
        <button onClick={load} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors">
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Pending',          value: stats.pending          ?? 0, color: 'text-amber-600',  bg: 'bg-amber-50'  },
          { label: 'In Progress',      value: stats.in_progress      ?? 0, color: 'text-blue-600',   bg: 'bg-blue-50'   },
          { label: 'Confirmed Today',  value: stats.confirmed_today  ?? 0, color: 'text-green-600',  bg: 'bg-green-50'  },
          { label: 'Cancelled Today',  value: stats.cancelled_today  ?? 0, color: 'text-gray-500',   bg: 'bg-gray-50'   },
        ].map(s => (
          <div key={s.label} className={`rounded-xl border border-gray-200 ${s.bg} p-4`}>
            <p className="text-xs text-gray-500">{s.label}</p>
            <p className={`text-3xl font-bold mt-1 ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {/* Status tabs */}
        <div className="flex border-b border-gray-100">
          {STATUS_TABS.map(tab => (
            <button
              key={String(tab.key)}
              onClick={() => setStatusTab(tab.key)}
              className={`px-4 py-3 text-sm font-medium transition-colors ${
                statusTab === tab.key
                  ? 'border-b-2 border-blue-600 text-blue-600'
                  : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              {tab.label}
            </button>
          ))}

          {/* Type filter + Search — right side */}
          <div className="ml-auto flex items-center gap-2 px-4">
            <select
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value)}
              className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 outline-none"
            >
              <option value="">All Types</option>
              {Object.entries(TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
            <div className="relative">
              <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search SKU, order..."
                className="pl-7 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg outline-none w-44"
              />
            </div>
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <div className="p-10 text-center text-gray-400 text-sm">Loading…</div>
        ) : filteredTasks.length === 0 ? (
          <div className="p-10 text-center text-gray-400 text-sm">No tasks found.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                <th className="text-left px-4 py-3">Type</th>
                <th className="text-left px-4 py-3">SKU / Product</th>
                <th className="text-left px-4 py-3">Batch</th>
                <th className="text-left px-4 py-3">WH</th>
                <th className="text-right px-4 py-3">Qty</th>
                <th className="text-left px-4 py-3">Order</th>
                <th className="text-left px-4 py-3">Assigned</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-left px-4 py-3">Created</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filteredTasks.map(task => (
                <tr key={task.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3"><TypeBadge type={task.task_type} /></td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{task.sku_code}</div>
                    <div className="text-xs text-gray-400 truncate max-w-36">{task.product_name}</div>
                  </td>
                  <td className="px-4 py-3">
                    {task.batch_code
                      ? <span className="font-mono text-xs text-gray-600">{task.batch_code}</span>
                      : <span className="text-gray-300">—</span>
                    }
                    {task.expiry_date && (
                      <div className="text-xs text-amber-500 mt-0.5">{task.expiry_date}</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs font-mono bg-gray-100 px-1.5 py-0.5 rounded">{task.warehouse || '—'}</span>
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-800">
                    {task.confirmed_qty != null ? (
                      <span>{task.confirmed_qty}<span className="text-gray-400 font-normal">/{task.quantity}</span></span>
                    ) : task.quantity}
                  </td>
                  <td className="px-4 py-3">
                    {task.order_number
                      ? <span className="text-xs font-mono text-blue-600">{task.order_number}</span>
                      : <span className="text-gray-300">—</span>
                    }
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {task.assigned_to_name || <span className="text-gray-300">Unassigned</span>}
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={task.status} /></td>
                  <td className="px-4 py-3 text-xs text-gray-400">
                    {task.created_at ? new Date(task.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      {task.status === 'pending' && (
                        <>
                          <button
                            onClick={() => action(task.id, () => warehouseTaskAPI.start(task.id))}
                            disabled={saving[task.id]}
                            className="text-xs px-2.5 py-1 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
                          >
                            {saving[task.id] ? '…' : 'Start'}
                          </button>
                          <button
                            onClick={() => action(task.id, () => warehouseTaskAPI.confirm(task.id))}
                            disabled={saving[task.id]}
                            className="text-xs px-2.5 py-1 rounded-lg bg-green-50 text-green-700 hover:bg-green-100 transition-colors"
                          >
                            {saving[task.id] ? '…' : 'Confirm'}
                          </button>
                          <button
                            onClick={() => { if (window.confirm('Cancel this task?')) action(task.id, () => warehouseTaskAPI.cancel(task.id)) }}
                            disabled={saving[task.id]}
                            className="text-xs px-2.5 py-1 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                          >
                            Cancel
                          </button>
                        </>
                      )}
                      {task.status === 'in_progress' && (
                        <>
                          <button
                            onClick={() => action(task.id, () => warehouseTaskAPI.confirm(task.id))}
                            disabled={saving[task.id]}
                            className="text-xs px-2.5 py-1 rounded-lg bg-green-50 text-green-700 hover:bg-green-100 transition-colors"
                          >
                            {saving[task.id] ? '…' : 'Confirm'}
                          </button>
                          <button
                            onClick={() => { if (window.confirm('Cancel this task?')) action(task.id, () => warehouseTaskAPI.cancel(task.id)) }}
                            disabled={saving[task.id]}
                            className="text-xs px-2.5 py-1 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                          >
                            Cancel
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
