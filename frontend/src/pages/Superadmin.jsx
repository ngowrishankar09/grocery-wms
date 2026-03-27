import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Building2, Users, ChevronDown, ChevronUp, Shield, LogOut, CheckCircle, XCircle, RefreshCw, Clock } from 'lucide-react'
import { superAdminAPI } from '../api/client'
import { useAuth } from '../context/AuthContext'

export default function Superadmin() {
  const { logout, user } = useAuth()
  const navigate = useNavigate()
  const [companies, setCompanies] = useState([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(null)
  const [users, setUsers] = useState({})
  const [usersLoading, setUsersLoading] = useState({})
  const [saving, setSaving] = useState({})

  const load = async () => {
    setLoading(true)
    try {
      const res = await superAdminAPI.companies()
      setCompanies(res.data)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const toggleExpand = async (id) => {
    if (expanded === id) { setExpanded(null); return }
    setExpanded(id)
    if (!users[id]) {
      setUsersLoading(l => ({ ...l, [id]: true }))
      try {
        const res = await superAdminAPI.companyUsers(id)
        setUsers(u => ({ ...u, [id]: res.data }))
      } finally {
        setUsersLoading(l => ({ ...l, [id]: false }))
      }
    }
  }

  const toggleActive = async (company) => {
    setSaving(s => ({ ...s, [company.id]: true }))
    try {
      await superAdminAPI.updateCompany(company.id, { is_active: !company.is_active })
      setCompanies(cs => cs.map(c => c.id === company.id ? { ...c, is_active: !c.is_active } : c))
    } finally {
      setSaving(s => ({ ...s, [company.id]: false }))
    }
  }

  const approveCompany = async (company) => {
    setSaving(s => ({ ...s, [company.id]: true }))
    try {
      await superAdminAPI.approveCompany(company.id)
      setCompanies(cs => cs.map(c => c.id === company.id ? { ...c, status: 'active', is_active: true } : c))
    } finally {
      setSaving(s => ({ ...s, [company.id]: false }))
    }
  }

  const rejectCompany = async (company) => {
    setSaving(s => ({ ...s, [company.id]: true }))
    try {
      await superAdminAPI.rejectCompany(company.id)
      setCompanies(cs => cs.map(c => c.id === company.id ? { ...c, status: 'rejected', is_active: false } : c))
    } finally {
      setSaving(s => ({ ...s, [company.id]: false }))
    }
  }

  const updatePlan = async (company, plan) => {
    setSaving(s => ({ ...s, [company.id]: true }))
    try {
      await superAdminAPI.updateCompany(company.id, { plan })
      setCompanies(cs => cs.map(c => c.id === company.id ? { ...c, plan } : c))
    } finally {
      setSaving(s => ({ ...s, [company.id]: false }))
    }
  }

  const planColors = {
    standard: 'bg-blue-100 text-blue-700',
    premium:  'bg-purple-100 text-purple-700',
    enterprise: 'bg-amber-100 text-amber-700',
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-red-600 rounded-lg flex items-center justify-center">
            <Shield size={16} className="text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900">Superadmin Panel</h1>
            <p className="text-xs text-gray-400">Logged in as {user?.username}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={load}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <RefreshCw size={14} />
            Refresh
          </button>
          <button
            onClick={() => { logout(); navigate('/login') }}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-red-600 px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors"
          >
            <LogOut size={14} />
            Sign Out
          </button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Stats */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-sm text-gray-500">Total Companies</p>
            <p className="text-3xl font-bold text-gray-900 mt-1">{companies.length}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-sm text-gray-500">Active</p>
            <p className="text-3xl font-bold text-green-600 mt-1">{companies.filter(c => c.status === 'active').length}</p>
          </div>
          <div className="bg-amber-50 rounded-xl border border-amber-200 p-5">
            <p className="text-sm text-amber-600">Pending Approval</p>
            <p className="text-3xl font-bold text-amber-600 mt-1">{companies.filter(c => c.status === 'pending').length}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-sm text-gray-500">Total Users</p>
            <p className="text-3xl font-bold text-gray-900 mt-1">{companies.reduce((s, c) => s + (c.user_count || 0), 0)}</p>
          </div>
        </div>

        {/* Pending Approvals */}
        {companies.filter(c => c.status === 'pending').length > 0 && (
          <div className="bg-white rounded-xl border border-amber-300 overflow-hidden mb-6">
            <div className="px-5 py-4 border-b border-amber-100 flex items-center gap-2 bg-amber-50">
              <Clock size={16} className="text-amber-600" />
              <h2 className="font-semibold text-amber-800">Pending Approvals</h2>
              <span className="ml-auto bg-amber-200 text-amber-800 text-xs font-bold rounded-full px-2 py-0.5">
                {companies.filter(c => c.status === 'pending').length}
              </span>
            </div>
            <div className="divide-y divide-gray-100">
              {companies.filter(c => c.status === 'pending').map(company => (
                <div key={company.id} className="px-5 py-4 flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900">{company.name}</span>
                      <span className="text-xs text-gray-400 font-mono">#{company.id}</span>
                      <span className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-100 rounded-full px-2 py-0.5">
                        <Clock size={10} /> Pending
                      </span>
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      Slug: {company.slug} &bull; Registered: {company.created_at ? new Date(company.created_at).toLocaleDateString() : '—'}
                      &bull; {company.user_count} user{company.user_count !== 1 ? 's' : ''}
                    </div>
                  </div>
                  <button
                    onClick={() => approveCompany(company)}
                    disabled={saving[company.id]}
                    className="text-xs px-4 py-1.5 rounded-lg font-medium bg-green-50 text-green-700 hover:bg-green-100 transition-colors"
                  >
                    {saving[company.id] ? '…' : 'Approve'}
                  </button>
                  <button
                    onClick={() => rejectCompany(company)}
                    disabled={saving[company.id]}
                    className="text-xs px-4 py-1.5 rounded-lg font-medium bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                  >
                    {saving[company.id] ? '…' : 'Reject'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Companies list */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
            <Building2 size={16} className="text-gray-500" />
            <h2 className="font-semibold text-gray-900">Companies</h2>
          </div>

          {loading ? (
            <div className="p-8 text-center text-gray-400">Loading…</div>
          ) : companies.length === 0 ? (
            <div className="p-8 text-center text-gray-400">No companies yet.</div>
          ) : (
            <div className="divide-y divide-gray-100">
              {companies.map(company => (
                <div key={company.id}>
                  {/* Row */}
                  <div className="px-5 py-4 flex items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900 truncate">{company.name}</span>
                        <span className="text-xs text-gray-400 font-mono">#{company.id}</span>
                        {company.status === 'pending' ? (
                          <span className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-100 rounded-full px-2 py-0.5">
                            <Clock size={10} /> Pending
                          </span>
                        ) : company.status === 'rejected' ? (
                          <span className="inline-flex items-center gap-1 text-xs text-gray-600 bg-gray-100 rounded-full px-2 py-0.5">
                            <XCircle size={10} /> Rejected
                          </span>
                        ) : company.is_active ? (
                          <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-100 rounded-full px-2 py-0.5">
                            <CheckCircle size={10} /> Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-red-700 bg-red-100 rounded-full px-2 py-0.5">
                            <XCircle size={10} /> Suspended
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        Slug: {company.slug} &bull; Joined: {company.created_at ? new Date(company.created_at).toLocaleDateString() : '—'}
                      </div>
                    </div>

                    {/* Plan selector */}
                    <select
                      value={company.plan}
                      onChange={e => updatePlan(company, e.target.value)}
                      disabled={saving[company.id]}
                      className={`text-xs font-medium rounded-full px-3 py-1.5 border-0 outline-none cursor-pointer ${planColors[company.plan] || 'bg-gray-100 text-gray-700'}`}
                    >
                      <option value="standard">Standard</option>
                      <option value="premium">Premium</option>
                      <option value="enterprise">Enterprise</option>
                    </select>

                    {/* User count */}
                    <div className="flex items-center gap-1 text-sm text-gray-500 w-16 justify-center">
                      <Users size={13} />
                      <span>{company.user_count}</span>
                    </div>

                    {/* Active toggle */}
                    <button
                      onClick={() => toggleActive(company)}
                      disabled={saving[company.id]}
                      className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                        company.is_active
                          ? 'bg-red-50 text-red-600 hover:bg-red-100'
                          : 'bg-green-50 text-green-600 hover:bg-green-100'
                      }`}
                    >
                      {saving[company.id] ? '…' : company.is_active ? 'Suspend' : 'Activate'}
                    </button>

                    {/* Expand */}
                    <button
                      onClick={() => toggleExpand(company.id)}
                      className="text-gray-400 hover:text-gray-600 p-1"
                    >
                      {expanded === company.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                  </div>

                  {/* Users panel */}
                  {expanded === company.id && (
                    <div className="bg-gray-50 border-t border-gray-100 px-5 py-4">
                      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Users</h3>
                      {usersLoading[company.id] ? (
                        <p className="text-sm text-gray-400">Loading…</p>
                      ) : (users[company.id] || []).length === 0 ? (
                        <p className="text-sm text-gray-400">No users.</p>
                      ) : (
                        <div className="space-y-1.5">
                          {(users[company.id] || []).map(u => (
                            <div key={u.id} className="flex items-center gap-3 bg-white rounded-lg px-3 py-2 border border-gray-100">
                              <div className="w-7 h-7 bg-blue-100 rounded-full flex items-center justify-center text-xs font-bold text-blue-600">
                                {u.username[0].toUpperCase()}
                              </div>
                              <div className="flex-1">
                                <span className="text-sm font-medium text-gray-800">{u.username}</span>
                                {u.email && <span className="text-xs text-gray-400 ml-2">{u.email}</span>}
                              </div>
                              <span className="text-xs bg-gray-100 text-gray-600 rounded px-2 py-0.5 capitalize">{u.role}</span>
                              {u.is_active ? (
                                <span className="text-xs text-green-600">Active</span>
                              ) : (
                                <span className="text-xs text-red-500">Inactive</span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
