import { useEffect, useState } from 'react'
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from 'lucide-react'

const STYLES = {
  success: {
    bar:  'bg-gray-900 text-white',
    icon: <CheckCircle2 size={16} className="text-emerald-400 flex-shrink-0" />,
  },
  error: {
    bar:  'bg-red-600 text-white',
    icon: <XCircle size={16} className="text-red-200 flex-shrink-0" />,
  },
  warning: {
    bar:  'bg-amber-500 text-white',
    icon: <AlertTriangle size={16} className="text-amber-100 flex-shrink-0" />,
  },
  info: {
    bar:  'bg-blue-600 text-white',
    icon: <Info size={16} className="text-blue-200 flex-shrink-0" />,
  },
}

const DURATION = 3500

export default function ToastContainer() {
  const [toasts, setToasts] = useState([])

  useEffect(() => {
    const handler = (e) => {
      const toast = { id: e.detail.id ?? Date.now(), message: e.detail.message, type: e.detail.type ?? 'success' }
      setToasts(prev => [...prev.slice(-4), toast]) // keep max 5
      setTimeout(() => remove(toast.id), DURATION)
    }
    window.addEventListener('app:toast', handler)
    return () => window.removeEventListener('app:toast', handler)
  }, [])

  const remove = (id) => setToasts(prev => prev.filter(t => t.id !== id))

  if (!toasts.length) return null

  return (
    <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-2 pointer-events-none">
      {toasts.map(t => {
        const s = STYLES[t.type] ?? STYLES.success
        return (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-xl text-sm font-medium max-w-sm animate-slide-up ${s.bar}`}
          >
            {s.icon}
            <span className="flex-1 leading-snug">{t.message}</span>
            <button
              onClick={() => remove(t.id)}
              className="ml-1 opacity-60 hover:opacity-100 transition-opacity flex-shrink-0"
              aria-label="Dismiss"
            >
              <X size={14} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
