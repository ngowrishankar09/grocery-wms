import { useState, useEffect, useCallback } from 'react'
import { Plus, Edit2, Trash2, X, Save, Shield, Mail, Copy, Check, AlertCircle } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import api from '../api/client'

const ROLES = ['admin', 'manager', 'warehouse', 'driver', 'readonly']
const ROLE_COLORS = {
  admin:     'bg-purple-100 text-purple-700',
  manager:   'bg-blue-100   text-blue-700',
  warehouse: 'bg-green-100  text-green-700',
  driver:    'bg-teal-100   text-teal-700',
  readonly:  'bg-gray-100   text-gray-600',
}
const ROLE_DESC = {
  admin:     'Full access including user management',
  manager:   'All operations except user management',
  warehouse: 'Inventory, receiving, dispatch, picking',
  driver:    'Drivers page and dispatch board only',
  readonly:  'View-only access to dashboard and reports',
}

function UserModal({ initial, onClose, onSave }) {
  const [form, setForm] = useState({
    username: '', password: '', full_name: '', email: '', role: 'warehouse',
    ...(initial || {})
  })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState(null)
  const isEdit = !!initial?.id

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setErr(null)
    try {
      if (isEdit) {
        const payload = { ...form }
        if (!payload.password) delete payload.password
        await api.put(`/users/${initial.id}`, payload)
      } else {
        await api.post('/users/', form)
      }
      onSave()
    } catch (e) {
      setErr(e.response?.data?.detail || 'Save failed')
    }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="font-bold text-gray-900">{isEdit ? 'Edit User' : 'Add User'}</h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-700 rounded-lg"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Username *</label>
              <input value={form.username} onChange={e => set('username', e.target.value)}
                required disabled={isEdit}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {isEdit ? 'New Password (optional)' : 'Password *'}
              </label>
              <input type="password" value={form.password} onChange={e => set('password', e.target.value)}
                required={!isEdit}
                placeholder={isEdit ? 'Leave blank to keep' : ''}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
            <input value={form.full_name || ''} onChange={e => set('full_name', e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input type="email" value={form.email || ''} onChange={e => set('email', e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Role *</label>
            <div className="grid grid-cols-1 gap-2">
              {ROLES.map(r => (
                <label key={r} className={`flex items-center gap-3 px-3 py-2 rounded-lg border-2 cursor-pointer transition-colors ${
                  form.role === r ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                }`}>
                  <input type="radio" name="role" value={r} checked={form.role === r}
                    onChange={() => set('role', r)} className="sr-only" />
                  <span className={`px-2 py-0.5 rounded-full text-xs font-bold flex-shrink-0 ${ROLE_COLORS[r]}`}>{r}</span>
                  <span className="text-xs text-gray-500">{ROLE_DESC[r]}</span>
                </label>
              ))}
            </div>
          </div>
          {err && <div className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{err}</div>}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm border rounded-lg text-gray-700 hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={saving}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
              <Save size={15} /> {saving ? 'Saving…' : isEdit ? 'Update User' : 'Create User'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── TempPassword Result Modal ────────────────────────────────
function TempPasswordModal({ result, onClose }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(result.temp_password)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6 space-y-4">
        <div className="flex items-center gap-3">
          {result.emailed
            ? <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center"><Mail size={20} className="text-green-600" /></div>
            : <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center"><AlertCircle size={20} className="text-amber-600" /></div>
          }
          <div>
            <h3 className="font-bold text-gray-900">{result.emailed ? 'Welcome Email Sent!' : 'Password Set'}</h3>
            <p className="text-xs text-gray-500">{result.emailed ? 'Credentials emailed to the user.' : 'Share these credentials manually.'}</p>
          </div>
        </div>

        {result.email_error && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800">
            {result.email_error}
          </div>
        )}

        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-2">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Temporary Password</p>
          <div className="flex items-center gap-2">
            <span className="font-mono font-bold text-xl text-gray-900 tracking-widest flex-1">{result.temp_password}</span>
            <button onClick={copy} className="p-2 rounded-lg hover:bg-gray-200 text-gray-500 transition-colors">
              {copied ? <Check size={16} className="text-green-600" /> : <Copy size={16} />}
            </button>
          </div>
          <p className="text-xs text-gray-400">The user will be forced to change this on first login.</p>
        </div>

        <button onClick={onClose}
          className="w-full bg-gray-900 hover:bg-gray-800 text-white font-semibold py-2.5 rounded-xl text-sm">
          Done
        </button>
      </div>
    </div>
  )
}

export default function Users() {
  const { user: me, isAdmin } = useAuth()
  const [users,   setUsers]   = useState([])
  const [modal,   setModal]   = useState(null)
  const [loading, setLoading] = useState(true)
  const [tempResult, setTempResult] = useState(null)  // result from send-welcome
  const [sending, setSending] = useState({})  // { [userId]: true }
  const [deactivateConfirm, setDeactivateConfirm] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api.get('/users/')
      setUsers(r.data || [])
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const handleDelete = async (id) => {
    setDeactivateConfirm(null)
    await api.delete(`/users/${id}`)
    load()
  }

  const handleSendWelcome = async (u) => {
    setSending(prev => ({ ...prev, [u.id]: true }))
    try {
      const r = await api.post(`/users/${u.id}/send-welcome`)
      setTempResult(r.data)
      load()
    } catch (e) {
      alert(e.response?.data?.detail || 'Failed to send welcome email')
    }
    setSending(prev => ({ ...prev, [u.id]: false }))
  }

  const byRole = (role) => users.filter(u => u.role === role)

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Shield size={24} className="text-blue-600" /> User Management
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage staff accounts and access roles</p>
        </div>
        {isAdmin && (
          <button onClick={() => setModal('new')}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-xl hover:bg-blue-700">
            <Plus size={15} /> Add User
          </button>
        )}
      </div>

      {/* Role summary */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {ROLES.map(r => (
          <div key={r} className="bg-white border rounded-xl p-3 text-center shadow-sm">
            <div className="text-xl font-bold text-gray-900">{byRole(r).length}</div>
            <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-bold ${ROLE_COLORS[r]}`}>{r}</span>
          </div>
        ))}
      </div>

      {/* Users table */}
      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-12 text-center text-gray-400 text-sm">Loading users…</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 uppercase tracking-wide border-b bg-gray-50">
                  <th className="px-4 py-3 text-left">User</th>
                  <th className="px-4 py-3 text-left">Role</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Last Login</th>
                  {isAdmin && <th className="px-4 py-3 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {users.map(u => (
                  <tr key={u.id} className={`hover:bg-gray-50 ${!u.is_active ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                          {(u.full_name || u.username)[0].toUpperCase()}
                        </div>
                        <div>
                          <div className="font-semibold text-gray-900">
                            {u.full_name || u.username}
                            {u.id === me?.id && <span className="ml-1 text-xs text-blue-500">(you)</span>}
                          </div>
                          <div className="text-xs text-gray-400">@{u.username}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${ROLE_COLORS[u.role]}`}>
                        {u.role}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          u.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                        }`}>
                          {u.is_active ? 'Active' : 'Inactive'}
                        </span>
                        {u.must_change_password && (
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                            ⏳ Awaiting Setup
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400">
                      {u.last_login
                        ? new Date(u.last_login).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })
                        : 'Never'}
                    </td>
                    {isAdmin && (
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {/* Send / Resend Welcome Email */}
                          <button
                            onClick={() => handleSendWelcome(u)}
                            disabled={sending[u.id]}
                            title={u.must_change_password ? 'Resend Welcome Email' : 'Send Welcome Email'}
                            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 ${
                              u.must_change_password
                                ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                                : 'bg-blue-50 text-blue-600 hover:bg-blue-100'
                            }`}
                          >
                            <Mail size={12} />
                            {sending[u.id] ? '…' : u.must_change_password ? 'Resend' : 'Invite'}
                          </button>
                          <button onClick={() => setModal(u)}
                            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg">
                            <Edit2 size={14} />
                          </button>
                          {u.id !== me?.id && (
                            <button onClick={() => setDeactivateConfirm(u)}
                              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg">
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal && (
        <UserModal
          initial={modal === 'new' ? null : modal}
          onClose={() => setModal(null)}
          onSave={() => { setModal(null); load() }}
        />
      )}

      {tempResult && (
        <TempPasswordModal result={tempResult} onClose={() => setTempResult(null)} />
      )}

      {/* Deactivate confirm */}
      {deactivateConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6 space-y-4">
            <h3 className="font-bold text-gray-900">Deactivate {deactivateConfirm.full_name || deactivateConfirm.username}?</h3>
            <p className="text-sm text-gray-600">The user will no longer be able to log in. You can reactivate them later by editing their account.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeactivateConfirm(null)} className="flex-1 btn-secondary">Cancel</button>
              <button
                onClick={() => handleDelete(deactivateConfirm.id)}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold py-2 rounded-lg text-sm"
              >Deactivate</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
