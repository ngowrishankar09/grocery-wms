import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import api from '../api/client'

const AuthContext = createContext(null)

const TOKEN_KEY = 'wms_token'
const USER_KEY  = 'wms_user'

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(() => {
    try { return JSON.parse(localStorage.getItem(USER_KEY)) } catch { return null }
  })
  const [token,   setToken]   = useState(() => localStorage.getItem(TOKEN_KEY) || null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)

  // Keep axios default header in sync
  useEffect(() => {
    if (token) {
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`
    } else {
      delete api.defaults.headers.common['Authorization']
    }
  }, [token])

  const login = useCallback(async (username, password) => {
    setLoading(true)
    setError(null)
    try {
      const form = new URLSearchParams()
      form.append('username', username)
      form.append('password', password)
      const res = await api.post('/auth/token', form, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      })
      const { access_token, user: u } = res.data
      localStorage.setItem(TOKEN_KEY, access_token)
      localStorage.setItem(USER_KEY, JSON.stringify(u))
      setToken(access_token)
      setUser(u)
      return true
    } catch (e) {
      setError(e.response?.data?.detail || 'Login failed')
      return false
    } finally {
      setLoading(false)
    }
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
    setToken(null)
    setUser(null)
    delete api.defaults.headers.common['Authorization']
  }, [])

  // Verify token on mount (in case it expired)
  useEffect(() => {
    if (!token) return
    api.get('/auth/me').then(r => {
      setUser(r.data)
      localStorage.setItem(USER_KEY, JSON.stringify(r.data))
    }).catch(() => {
      logout()
    })
  }, []) // eslint-disable-line

  const isSuperAdmin = user?.role === 'superadmin'
  const isAdmin    = user?.role === 'admin'
  const isManager  = user?.role === 'admin' || user?.role === 'manager'
  const canEdit    = ['admin', 'manager', 'warehouse'].includes(user?.role)
  const mustChangePassword = !!user?.must_change_password

  const clearMustChange = useCallback(() => {
    const updated = { ...user, must_change_password: false }
    localStorage.setItem(USER_KEY, JSON.stringify(updated))
    setUser(updated)
  }, [user])

  return (
    <AuthContext.Provider value={{ user, token, loading, error, login, logout, isSuperAdmin, isAdmin, isManager, canEdit, mustChangePassword, clearMustChange }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}

// Role-based nav filter
export const ROLE_NAV = {
  admin:     null,  // null = show all
  manager:   null,
  warehouse: [
    '/', '/inventory', '/receiving', '/dispatch', '/dispatch-board',
    '/drivers', '/orders', '/transfers', '/picking', '/stock-take',
    '/bin-locations', '/returns',
  ],
  driver: ['/', '/drivers', '/dispatch-board'],
  readonly: ['/', '/inventory', '/reports', '/forecasting'],
}
