import { useState, useEffect, useCallback } from 'react'
import { Activity, RefreshCw, Filter, Shield, User, Package, FileText, DollarSign } from 'lucide-react'
import { auditAPI } from '../api/client'

const ACTION_STYLES = {
  create:   'bg-green-100 text-green-700',
  update:   'bg-blue-100 text-blue-700',
  delete:   'bg-red-100 text-red-700',
  login:    'bg-purple-100 text-purple-700',
  dispatch: 'bg-orange-100 text-orange-700',
  payment:  'bg-teal-100 text-teal-700',
  receive:  'bg-indigo-100 text-indigo-700',
  approve:  'bg-emerald-100 text-emerald-700',
  reject:   'bg-rose-100 text-rose-700',
}

const ENTITY_TYPES = ['', 'order', 'invoice', 'customer', 'sku', 'po', 'batch', 'return', 'payment', 'user', 'credit_note', 'vendor_bill', 'quote']
const ACTIONS      = ['', 'create', 'update', 'delete', 'login', 'dispatch', 'receive', 'payment', 'approve', 'reject']

function fmtTime(ts) {
  if (!ts) return '—'
  const d = new Date(ts)
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export default function AuditLog() {
  const [logs, setLogs]             = useState([])
  const [loading, setLoading]       = useState(true)
  const [entityType, setEntityType] = useState('')
  const [action, setAction]         = useState('')
  const [username, setUsername]     = useState('')
  const [limit, setLimit]           = useState(100)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await auditAPI.list({ entity_type: entityType || undefined, action: action || undefined, username: username || undefined, limit })
      setLogs(r.data)
    } catch { setLogs([]) }
    setLoading(false)
  }, [entityType, action, username, limit])

  useEffect(() => { load() }, [load])

  // Auto-refresh every 30s
  useEffect(() => {
    const t = setInterval(load, 30000)
    return () => clearInterval(t)
  }, [load])

  return (
    <div className="p-6 space-y-4">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Shield className="w-6 h-6 text-purple-600" /> Audit Log
          </h1>
          <p className="text-sm text-gray-500 mt-1">Complete record of all system actions · auto-refreshes every 30s</p>
        </div>
        <button onClick={load} className="flex items-center gap-2 border border-gray-300 px-3 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-blue-500' : 'text-gray-500'}`} /> Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Entity Type</label>
            <select value={entityType} onChange={e => setEntityType(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400">
              {ENTITY_TYPES.map(t => <option key={t} value={t}>{t || 'All types'}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Action</label>
            <select value={action} onChange={e => setAction(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400">
              {ACTIONS.map(a => <option key={a} value={a}>{a || 'All actions'}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Username</label>
            <input value={username} onChange={e => setUsername(e.target.value)}
              placeholder="Filter by user..."
              className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 w-40" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Limit</label>
            <select value={limit} onChange={e => setLimit(Number(e.target.value))}
              className="border rounded-lg px-3 py-2 text-sm focus:outline-none">
              {[50, 100, 250, 500].map(n => <option key={n}>{n}</option>)}
            </select>
          </div>
          <button onClick={load} className="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-purple-700 flex items-center gap-2">
            <Filter className="w-4 h-4" /> Apply
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex justify-between text-sm text-gray-500">
          <span>{logs.length} entries</span>
          <span className="text-xs text-gray-400">Most recent first</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['Timestamp', 'User', 'Action', 'Entity', 'Reference', 'Detail'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={6} className="text-center py-12 text-gray-400">
                  <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-gray-300" /> Loading...
                </td></tr>
              ) : logs.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-12 text-gray-400">
                  <Activity className="w-10 h-10 mx-auto mb-2 text-gray-200" />
                  <p>No audit entries found</p>
                </td></tr>
              ) : logs.map(log => (
                <tr key={log.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5 text-gray-500 text-xs font-mono whitespace-nowrap">{fmtTime(log.created_at)}</td>
                  <td className="px-4 py-2.5">
                    <span className="flex items-center gap-1.5 text-gray-700">
                      <User className="w-3.5 h-3.5 text-gray-400" />
                      {log.username || 'system'}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ACTION_STYLES[log.action] || 'bg-gray-100 text-gray-600'}`}>
                      {log.action}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-gray-600 text-xs">{log.entity_type || '—'}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-blue-600">{log.entity_ref || (log.entity_id ? `#${log.entity_id}` : '—')}</td>
                  <td className="px-4 py-2.5 text-gray-500 text-xs max-w-xs truncate">{log.detail || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
