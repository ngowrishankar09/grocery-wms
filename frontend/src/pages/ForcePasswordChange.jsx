import { useState } from 'react'
import { KeyRound, Eye, EyeOff, CheckCircle } from 'lucide-react'
import api from '../api/client'

export default function ForcePasswordChange({ user, onDone }) {
  const [pw,     setPw]     = useState('')
  const [pw2,    setPw2]    = useState('')
  const [showPw, setShowPw] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState(null)
  const [done,   setDone]   = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    if (pw.length < 6) return setError('Password must be at least 6 characters')
    if (pw !== pw2)    return setError('Passwords do not match')
    setSaving(true)
    try {
      await api.post('/auth/set-password', { new_password: pw })
      setDone(true)
      setTimeout(onDone, 1800)
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to set password')
    }
    setSaving(false)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">

        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-indigo-600 rounded-2xl shadow-lg mb-4">
            <KeyRound size={28} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">Set Your Password</h1>
          <p className="text-gray-400 text-sm mt-1">Welcome, {user?.full_name || user?.username}! Choose a new password to continue.</p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-8">
          {done ? (
            <div className="text-center py-4">
              <CheckCircle size={48} className="text-green-500 mx-auto mb-3" />
              <h3 className="font-bold text-gray-900 text-lg">Password Updated!</h3>
              <p className="text-gray-500 text-sm mt-1">Taking you to the dashboard…</p>
            </div>
          ) : (
            <>
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-5 text-sm text-amber-800">
                Your account was set up with a temporary password. Please choose a permanent password to continue.
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
                  <div className="relative">
                    <input
                      type={showPw ? 'text' : 'password'}
                      value={pw}
                      onChange={e => setPw(e.target.value)}
                      required autoFocus
                      placeholder="At least 6 characters"
                      className="w-full border border-gray-300 rounded-xl px-4 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <button type="button" onClick={() => setShowPw(s => !s)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                      {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Confirm Password</label>
                  <input
                    type={showPw ? 'text' : 'password'}
                    value={pw2}
                    onChange={e => setPw2(e.target.value)}
                    required
                    placeholder="Repeat your password"
                    className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                {/* Password strength indicator */}
                {pw.length > 0 && (
                  <div className="space-y-1">
                    <div className="flex gap-1">
                      {[1,2,3,4].map(i => (
                        <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${
                          pw.length >= i * 3
                            ? i <= 1 ? 'bg-red-400' : i <= 2 ? 'bg-yellow-400' : i <= 3 ? 'bg-blue-400' : 'bg-green-500'
                            : 'bg-gray-200'
                        }`} />
                      ))}
                    </div>
                    <p className="text-xs text-gray-400">
                      {pw.length < 6 ? 'Too short' : pw.length < 9 ? 'Weak' : pw.length < 12 ? 'Good' : 'Strong'}
                    </p>
                  </div>
                )}

                {error && (
                  <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 text-sm text-red-700">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={saving}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-semibold py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2 mt-2"
                >
                  {saving
                    ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Saving…</>
                    : <><KeyRound size={16} /> Set Password & Continue</>
                  }
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
