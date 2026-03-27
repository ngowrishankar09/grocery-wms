import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import {
  CheckCircle, XCircle, RefreshCw, Link, Link2Off,
  ChevronDown, ChevronRight, ExternalLink, AlertTriangle,
  Users, Package, FileText, UserCheck, Zap, BookOpen,
  Copy, Check
} from 'lucide-react'

const API = axios.create({ baseURL: 'http://localhost:8000' })

// ── Setup steps component ──────────────────────────────────────
function SetupGuide({ redirectUri }) {
  const [open, setOpen] = useState(true)
  const [copied, setCopied] = useState(false)

  const copy = (text) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="card border border-blue-200 bg-blue-50">
      <button onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between text-left">
        <div className="flex items-center gap-2">
          <BookOpen size={18} className="text-blue-600" />
          <span className="font-semibold text-blue-900">How to set up your Intuit Developer App</span>
        </div>
        {open ? <ChevronDown size={16} className="text-blue-400" /> : <ChevronRight size={16} className="text-blue-400" />}
      </button>

      {open && (
        <ol className="mt-4 space-y-4 text-sm text-blue-900">
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold">1</span>
            <div>
              <p className="font-medium">Go to Intuit Developer Portal</p>
              <a href="https://developer.intuit.com" target="_blank" rel="noreferrer"
                className="flex items-center gap-1 text-blue-600 hover:underline mt-0.5">
                developer.intuit.com <ExternalLink size={11} />
              </a>
              <p className="text-blue-700 mt-1">Sign in or create a free account. No credit card needed.</p>
            </div>
          </li>

          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold">2</span>
            <div>
              <p className="font-medium">Create a new app</p>
              <p className="text-blue-700 mt-1">Click <strong>Dashboard → Create an app</strong>. Choose <strong>QuickBooks Online and Payments</strong>. Give it any name (e.g. "Grocery WMS").</p>
            </div>
          </li>

          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold">3</span>
            <div>
              <p className="font-medium">Add the Redirect URI</p>
              <p className="text-blue-700 mt-1">In your app's <strong>Keys & OAuth → Redirect URIs</strong>, add this exact URL:</p>
              <div className="flex items-center gap-2 mt-1 bg-white rounded border border-blue-200 px-3 py-2 font-mono text-xs">
                <span className="flex-1 break-all">{redirectUri}</span>
                <button onClick={() => copy(redirectUri)} className="text-blue-400 hover:text-blue-700 flex-shrink-0">
                  {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
                </button>
              </div>
            </div>
          </li>

          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold">4</span>
            <div>
              <p className="font-medium">Copy your Client ID and Client Secret</p>
              <p className="text-blue-700 mt-1">Found under <strong>Keys &amp; OAuth → Development keys</strong> (use Sandbox for testing, Production for live). Paste them into the form below.</p>
            </div>
          </li>

          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold">5</span>
            <div>
              <p className="font-medium">Click Connect &amp; authorize</p>
              <p className="text-blue-700 mt-1">After saving credentials, click <strong>Connect to QuickBooks</strong>. You'll be taken to Intuit's login page to authorize access to your company.</p>
            </div>
          </li>
        </ol>
      )}
    </div>
  )
}

// ── Credential form ────────────────────────────────────────────
function CredentialForm({ status, onSaved }) {
  const [clientId,     setClientId]     = useState(status?.has_credentials ? '••••••••' : '')
  const [clientSecret, setClientSecret] = useState(status?.has_credentials ? '••••••••' : '')
  const [env,          setEnv]          = useState(status?.environment || 'sandbox')
  const [redirectUri,  setRedirectUri]  = useState(status?.redirect_uri || 'http://localhost:8000/quickbooks/callback')
  const [saving,       setSaving]       = useState(false)
  const [msg,          setMsg]          = useState('')
  const [editing,      setEditing]      = useState(!status?.has_credentials)

  const save = async () => {
    if (!clientId.trim() || clientId === '••••••••') { setMsg('Enter Client ID'); return }
    if (!clientSecret.trim() || clientSecret === '••••••••') { setMsg('Enter Client Secret'); return }
    setSaving(true); setMsg('')
    try {
      await API.post('/quickbooks/credentials', {
        client_id:     clientId,
        client_secret: clientSecret,
        environment:   env,
        redirect_uri:  redirectUri,
      })
      setMsg('Saved!')
      setEditing(false)
      onSaved()
    } catch (e) {
      setMsg(e.response?.data?.detail || 'Save failed')
    }
    setSaving(false)
  }

  if (!editing) {
    return (
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <CheckCircle size={15} className="text-green-500" />
          Credentials saved ({env})
        </div>
        <button onClick={() => setEditing(true)} className="text-xs text-blue-600 hover:underline">Change</button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Client ID</label>
          <input value={clientId} onChange={e => setClientId(e.target.value)}
            onFocus={() => clientId === '••••••••' && setClientId('')}
            placeholder="Client ID from Intuit Developer"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 font-mono" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Client Secret</label>
          <input type="password" value={clientSecret} onChange={e => setClientSecret(e.target.value)}
            onFocus={() => clientSecret === '••••••••' && setClientSecret('')}
            placeholder="Client Secret"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 font-mono" />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Environment</label>
          <select value={env} onChange={e => setEnv(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
            <option value="sandbox">Sandbox (testing)</option>
            <option value="production">Production (live)</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Redirect URI</label>
          <input value={redirectUri} onChange={e => setRedirectUri(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-400" />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button onClick={save} disabled={saving}
          className="btn-primary text-sm px-4 py-2 flex items-center gap-2">
          {saving && <RefreshCw size={13} className="animate-spin" />}
          Save Credentials
        </button>
        {msg && <span className={`text-sm ${msg === 'Saved!' ? 'text-green-600' : 'text-red-500'}`}>{msg}</span>}
      </div>
    </div>
  )
}

// ── Generic action card (used for both push sync and pull import) ──
function ActionCard({ icon: Icon, title, description, colour, buttonLabel, buttonColour, onRun, disabled }) {
  const [loading, setLoading] = useState(false)
  const [result,  setResult]  = useState(null)
  const [error,   setError]   = useState('')

  const run = async () => {
    setLoading(true); setResult(null); setError('')
    try {
      const r = await onRun()
      setResult(r.data)
    } catch (e) {
      setError(e.response?.data?.detail || 'Operation failed')
    }
    setLoading(false)
  }

  const btnCls = disabled
    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
    : buttonColour || 'bg-blue-600 text-white hover:bg-blue-700'

  return (
    <div className={`card border-l-4 ${colour}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className={`p-2 rounded-xl ${colour.replace('border-', 'bg-').replace('-500', '-100')}`}>
            <Icon size={18} className={colour.replace('border-l-4 border-', 'text-')} />
          </div>
          <div>
            <div className="font-semibold text-gray-900 text-sm">{title}</div>
            <div className="text-xs text-gray-500 mt-0.5">{description}</div>
          </div>
        </div>
        <button onClick={run} disabled={disabled || loading}
          className={`flex-shrink-0 flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${btnCls}`}>
          {loading ? <RefreshCw size={12} className="animate-spin" /> : <Zap size={12} />}
          {loading ? 'Running…' : (buttonLabel || 'Run')}
        </button>
      </div>

      {result && (
        <div className="mt-3 pt-3 border-t border-gray-100">
          <div className="flex flex-wrap gap-3 text-xs">
            {result.pushed    !== undefined && <span className="flex items-center gap-1 text-green-600"><CheckCircle size={11} /> {result.pushed} pushed</span>}
            {result.imported  !== undefined && <span className="flex items-center gap-1 text-green-600"><CheckCircle size={11} /> {result.imported} imported</span>}
            {result.updated   !== undefined && <span className="flex items-center gap-1 text-blue-600"><RefreshCw size={11} /> {result.updated} updated</span>}
            {result.errors    !== undefined && result.errors > 0 && <span className="flex items-center gap-1 text-red-500"><XCircle size={11} /> {result.errors} errors</span>}
            {result.skipped   !== undefined && result.skipped > 0 && <span className="flex items-center gap-1 text-gray-400">⊘ {result.skipped} skipped</span>}
            {result.count     !== undefined && <span className="flex items-center gap-1 text-purple-600"><UserCheck size={11} /> {result.count} found</span>}
          </div>
          {result.details?.slice(0, 5).map((d, i) => (
            <div key={i} className={`text-xs mt-1 px-2 py-1 rounded ${d.action === 'error' ? 'bg-red-50 text-red-600' : 'bg-gray-50 text-gray-500'}`}>
              {d.item || d.sku || d.vendor || d.order || d.message || JSON.stringify(d)}
              {d.sku_code && <span className="ml-1 font-mono text-gray-400">[{d.sku_code}]</span>}
              {d.action && d.action !== 'error' && <span className="ml-1 text-gray-400">→ {d.action}</span>}
              {d.reason && <span className="ml-1 text-gray-400">({d.reason})</span>}
            </div>
          ))}
          {result.details?.length > 5 && (
            <div className="text-xs text-gray-400 mt-1">+{result.details.length - 5} more…</div>
          )}
          {result.customers && (
            <div className="mt-2 max-h-32 overflow-y-auto space-y-1">
              {result.customers.slice(0, 10).map(c => (
                <div key={c.qb_id} className="text-xs bg-purple-50 rounded px-2 py-1 flex justify-between">
                  <span>{c.name}</span>
                  {c.balance > 0 && <span className="text-orange-500">${c.balance}</span>}
                </div>
              ))}
              {result.customers.length > 10 && (
                <div className="text-xs text-gray-400">+{result.customers.length - 10} more</div>
              )}
            </div>
          )}
        </div>
      )}
      {error && (
        <div className="mt-2 text-xs text-red-600 bg-red-50 rounded px-2 py-1 flex items-center gap-1">
          <AlertTriangle size={11} /> {error}
        </div>
      )}
    </div>
  )
}

// Keep the old name as an alias so we don't need to change call sites
const SyncCard = (props) => <ActionCard {...props} buttonLabel="Sync Now" />

// ── Sync log table ─────────────────────────────────────────────
function SyncLog() {
  const [logs,    setLogs]    = useState([])
  const [loading, setLoading] = useState(false)
  const [open,    setOpen]    = useState(true)

  const load = async () => {
    setLoading(true)
    try { const r = await API.get('/quickbooks/sync/logs?limit=50'); setLogs(r.data) }
    catch {}
    setLoading(false)
  }

  useEffect(() => { if (open) load() }, [open])

  const STATUS_STYLE = {
    success: 'bg-green-50 text-green-700',
    error:   'bg-red-50 text-red-600',
    skipped: 'bg-gray-50 text-gray-500',
  }
  const ENTITY_ICON = { vendor: Users, item: Package, invoice: FileText, customer: UserCheck }

  return (
    <div className="card">
      <div onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between cursor-pointer">
        <span className="font-semibold text-gray-800">Sync History</span>
        <div className="flex items-center gap-2">
          {open && <button onClick={e => { e.stopPropagation(); load() }} className="p-1 text-gray-400 hover:text-gray-700"><RefreshCw size={13} className={loading ? 'animate-spin' : ''} /></button>}
          {open ? <ChevronDown size={15} className="text-gray-400" /> : <ChevronRight size={15} className="text-gray-400" />}
        </div>
      </div>

      {open && (
        <div className="mt-3 overflow-x-auto">
          {logs.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">No sync records yet</p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-2 px-2 text-gray-500 font-medium">Type</th>
                  <th className="text-left py-2 px-2 text-gray-500 font-medium">Name / Ref</th>
                  <th className="text-left py-2 px-2 text-gray-500 font-medium">QB ID</th>
                  <th className="text-left py-2 px-2 text-gray-500 font-medium">Action</th>
                  <th className="text-left py-2 px-2 text-gray-500 font-medium">Status</th>
                  <th className="text-left py-2 px-2 text-gray-500 font-medium">Time</th>
                </tr>
              </thead>
              <tbody>
                {logs.map(log => {
                  const Icon = ENTITY_ICON[log.entity_type] || FileText
                  return (
                    <tr key={log.id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="py-2 px-2">
                        <div className="flex items-center gap-1 text-gray-600">
                          <Icon size={11} />
                          <span className="capitalize">{log.entity_type}</span>
                        </div>
                      </td>
                      <td className="py-2 px-2 text-gray-700 max-w-[180px] truncate" title={log.wms_ref}>{log.wms_ref}</td>
                      <td className="py-2 px-2 font-mono text-gray-500">{log.qb_id || '—'}</td>
                      <td className="py-2 px-2 capitalize text-gray-600">{log.action}</td>
                      <td className="py-2 px-2">
                        <span className={`px-1.5 py-0.5 rounded text-[11px] font-medium capitalize ${STATUS_STYLE[log.status] || 'bg-gray-50 text-gray-500'}`}>
                          {log.status}
                        </span>
                        {log.message && log.status === 'error' && (
                          <span className="ml-1 text-red-400 truncate max-w-[120px] inline-block align-middle" title={log.message}>{log.message.slice(0, 40)}</span>
                        )}
                      </td>
                      <td className="py-2 px-2 text-gray-400 whitespace-nowrap">{new Date(log.synced_at).toLocaleString()}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────
export default function QuickBooks() {
  const [status,       setStatus]       = useState(null)
  const [loading,      setLoading]      = useState(true)
  const [connecting,   setConnecting]   = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [syncingAll,   setSyncingAll]   = useState(false)

  const load = useCallback(async () => {
    try {
      const r = await API.get('/quickbooks/status')
      setStatus(r.data)
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
    // Check URL params for OAuth callback result
    const params = new URLSearchParams(window.location.search)
    if (params.get('connected') === 'true') {
      window.history.replaceState({}, '', '/quickbooks')
      load()
    }
    if (params.get('error')) {
      window.history.replaceState({}, '', '/quickbooks')
    }
  }, [load])

  const connect = async () => {
    setConnecting(true)
    try {
      const r = await API.get('/quickbooks/auth-url')
      window.location.href = r.data.auth_url  // full redirect to Intuit
    } catch (e) {
      alert(e.response?.data?.detail || 'Could not generate auth URL. Check credentials.')
      setConnecting(false)
    }
  }

  const disconnect = async () => {
    if (!confirm('Disconnect QuickBooks? Sync history will be kept.')) return
    setDisconnecting(true)
    try {
      await API.delete('/quickbooks/disconnect')
      load()
    } catch {}
    setDisconnecting(false)
  }

  const syncAll = async () => {
    setSyncingAll(true)
    try { await API.post('/quickbooks/sync/all') }
    catch {}
    setSyncingAll(false)
    load()
  }

  const urlParams = new URLSearchParams(window.location.search)
  const oauthError = urlParams.get('error')

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <RefreshCw size={22} className="animate-spin text-blue-400" />
    </div>
  )

  const isConnected = status?.is_connected
  const envLabel    = status?.environment === 'production' ? 'Production' : 'Sandbox'

  return (
    <div className="space-y-6 max-w-4xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/d/db/QuickBooks_Logo_2022.svg/200px-QuickBooks_Logo_2022.svg.png"
              alt="QB" className="h-7 object-contain" onError={e => e.target.style.display='none'} />
            QuickBooks Integration
          </h1>
          <p className="text-sm text-gray-500 mt-1">Sync vendors, products, and invoices with QuickBooks Online</p>
        </div>
        <div className="flex items-center gap-2">
          {isConnected && (
            <button onClick={syncAll} disabled={syncingAll}
              className="flex items-center gap-2 btn-primary text-sm">
              {syncingAll ? <RefreshCw size={14} className="animate-spin" /> : <Zap size={14} />}
              Sync All
            </button>
          )}
          <button onClick={load} className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg">
            <RefreshCw size={15} />
          </button>
        </div>
      </div>

      {/* OAuth callback error banner */}
      {oauthError && (
        <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
          <div>
            <strong>QuickBooks authorization failed:</strong> {decodeURIComponent(oauthError)}
          </div>
        </div>
      )}

      {/* Connection status card */}
      <div className={`card border-2 ${isConnected ? 'border-green-200 bg-green-50' : 'border-gray-200'}`}>
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div className="flex items-start gap-3">
            <div className={`p-2.5 rounded-xl ${isConnected ? 'bg-green-100' : 'bg-gray-100'}`}>
              {isConnected
                ? <Link size={20} className="text-green-600" />
                : <Link2Off size={20} className="text-gray-400" />}
            </div>
            <div>
              <div className="font-semibold text-gray-900">
                {isConnected ? 'Connected to QuickBooks Online' : 'Not connected'}
              </div>
              {isConnected ? (
                <div className="text-sm text-gray-600 mt-1 space-y-0.5">
                  <div>Company ID: <span className="font-mono">{status.realm_id}</span></div>
                  <div>Environment: <span className={`font-medium ${status.environment === 'production' ? 'text-orange-600' : 'text-blue-600'}`}>{envLabel}</span></div>
                  {status.connected_at && <div>Connected: {new Date(status.connected_at).toLocaleString()}</div>}
                  {status.last_sync_at && <div>Last sync: {new Date(status.last_sync_at).toLocaleString()}</div>}
                  {!status.token_valid && (
                    <div className="flex items-center gap-1 text-amber-600 text-xs mt-1">
                      <AlertTriangle size={12} /> Token expired — click Sync to refresh automatically
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-gray-500 mt-1">
                  {status?.has_credentials
                    ? 'Credentials saved. Click Connect to authorize with your QuickBooks company.'
                    : 'Enter your Intuit Developer credentials below to get started.'}
                </p>
              )}
            </div>
          </div>

          <div className="flex gap-2 flex-wrap">
            {isConnected ? (
              <button onClick={disconnect} disabled={disconnecting}
                className="flex items-center gap-1.5 text-sm px-4 py-2 bg-red-50 text-red-600 hover:bg-red-100 rounded-xl font-medium transition-colors border border-red-200">
                {disconnecting ? <RefreshCw size={13} className="animate-spin" /> : <Link2Off size={13} />}
                Disconnect
              </button>
            ) : (
              <button onClick={connect} disabled={connecting || !status?.has_credentials}
                className={`flex items-center gap-1.5 text-sm px-5 py-2 rounded-xl font-medium transition-colors
                  ${status?.has_credentials
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}>
                {connecting ? <RefreshCw size={13} className="animate-spin" /> : <Link size={13} />}
                {connecting ? 'Redirecting…' : 'Connect to QuickBooks'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Setup guide (shown when not connected) */}
      {!isConnected && (
        <SetupGuide redirectUri={status?.redirect_uri || 'http://localhost:8000/quickbooks/callback'} />
      )}

      {/* Credentials form */}
      <div className="card">
        <h3 className="font-semibold text-gray-800 mb-3">API Credentials</h3>
        <CredentialForm status={status} onSaved={load} />
      </div>

      {/* Sync / Import cards — only shown when connected */}
      {isConnected && (
        <>
          {/* ── Import from QB ── */}
          <div>
            <div className="mb-3">
              <h3 className="font-semibold text-gray-800 text-sm uppercase tracking-wide">Import from QuickBooks → WMS</h3>
              <p className="text-xs text-gray-500 mt-0.5">Already have data in QB? Pull it into the WMS to avoid re-entering everything.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <ActionCard
                icon={Users}
                title="Import Vendors from QB"
                description="Pull QB Vendors and create them as WMS suppliers (skips existing names)"
                colour="border-l-4 border-blue-500"
                buttonLabel="Import"
                buttonColour="bg-blue-600 text-white hover:bg-blue-700"
                disabled={!isConnected}
                onRun={() => API.post('/quickbooks/import/vendors')}
              />
              <ActionCard
                icon={Package}
                title="Import Items (SKUs) from QB"
                description="Pull QB Inventory & Non-Inventory items and create them as WMS SKUs (skips existing names)"
                colour="border-l-4 border-green-500"
                buttonLabel="Import"
                buttonColour="bg-green-600 text-white hover:bg-green-700"
                disabled={!isConnected}
                onRun={() => API.post('/quickbooks/import/items')}
              />
            </div>
            <p className="text-xs text-gray-400 mt-2">
              After import: set correct <strong>case sizes</strong>, <strong>categories</strong>, and <strong>reorder points</strong> for each SKU in the SKU Master page.
            </p>
          </div>

          {/* ── Push to QB ── */}
          <div>
            <div className="mb-3">
              <h3 className="font-semibold text-gray-800 text-sm uppercase tracking-wide">Push from WMS → QuickBooks</h3>
              <p className="text-xs text-gray-500 mt-0.5">Send WMS data back to QB to keep records in sync.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <SyncCard
                icon={Users}
                title="Sync Vendors"
                description="Push WMS suppliers to QuickBooks Vendors"
                colour="border-l-4 border-blue-400"
                disabled={!isConnected}
                onSync={() => API.post('/quickbooks/sync/vendors')}
              />
              <SyncCard
                icon={Package}
                title="Sync Products (SKUs)"
                description="Push WMS SKUs to QuickBooks Items"
                colour="border-l-4 border-green-400"
                disabled={!isConnected}
                onSync={() => API.post('/quickbooks/sync/items')}
              />
              <SyncCard
                icon={FileText}
                title="Sync Sales Orders"
                description="Push pending/picking orders to QB as Sales Orders — enables printing pick lists from QuickBooks"
                colour="border-l-4 border-yellow-500"
                disabled={!isConnected}
                onSync={() => API.post('/quickbooks/sync/sales-orders')}
              />
              <SyncCard
                icon={FileText}
                title="Sync Invoices"
                description="Push dispatched orders as QuickBooks Invoices — converts the QB Sales Order to a billable Invoice"
                colour="border-l-4 border-orange-500"
                disabled={!isConnected}
                onSync={() => API.post('/quickbooks/sync/invoices')}
              />
              <SyncCard
                icon={UserCheck}
                title="Pull Customers"
                description="View your QuickBooks customers / stores list"
                colour="border-l-4 border-purple-500"
                disabled={!isConnected}
                onSync={() => API.post('/quickbooks/sync/customers')}
              />
            </div>
          </div>

          {/* Sync log */}
          <SyncLog />
        </>
      )}

      {/* What syncs where */}
      <div className="card bg-gray-50">
        <h3 className="font-semibold text-gray-700 mb-3 text-sm">Data flow summary</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          {[
            { from: 'QB Vendors',   arrow: '→ WMS', to: 'WMS Vendors',  badge: 'import', note: 'Name, email, phone. Skips names that already exist.' },
            { from: 'QB Items',     arrow: '→ WMS', to: 'WMS SKUs',     badge: 'import', note: 'Inventory + NonInventory items. Case size defaults to 1 — update after import.' },
            { from: 'WMS Vendors',  arrow: '→ QB',  to: 'QB Vendors',   badge: 'push',   note: 'Name, phone, email. Creates or links to existing.' },
            { from: 'WMS SKUs',     arrow: '→ QB',  to: 'QB Items',     badge: 'push',   note: 'Code, name, category, description.' },
            { from: 'WMS Orders',   arrow: '→ QB',  to: 'QB Invoices',  badge: 'push',   note: 'Dispatched orders only. Prices default to $1 — update in QB.' },
            { from: 'QB Customers', arrow: '→',     to: 'View only',    badge: 'pull',   note: 'Pull customer list for reference — no WMS record created.' },
          ].map(row => (
            <div key={row.from + row.to} className="flex items-start gap-2 bg-white rounded-lg p-3 border border-gray-100">
              <div className="flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-medium text-gray-800">{row.from}</span>
                  <span className="text-gray-400 text-xs">{row.arrow}</span>
                  <span className="text-blue-600 font-medium">{row.to}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold uppercase
                    ${row.badge === 'import' ? 'bg-green-100 text-green-700'
                    : row.badge === 'push'   ? 'bg-blue-100 text-blue-700'
                    : 'bg-purple-100 text-purple-700'}`}>
                    {row.badge}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">{row.note}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  )
}
