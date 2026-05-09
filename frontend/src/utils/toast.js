/**
 * Imperative toast helper — works from any module, no React context needed.
 * Usage: import { showToast } from '../utils/toast'
 *        showToast('Saved!')
 *        showToast('Something went wrong', 'error')
 *        showToast('Check your input', 'warning')
 *        showToast('Loading…', 'info')
 *
 * The ToastContainer component (in Layout) listens for 'app:toast' events.
 */
export function showToast(message, type = 'success') {
  window.dispatchEvent(
    new CustomEvent('app:toast', { detail: { message, type, id: Date.now() + Math.random() } })
  )
}

/** Convenience wrappers */
export const toastError   = (msg) => showToast(msg, 'error')
export const toastWarning = (msg) => showToast(msg, 'warning')
export const toastInfo    = (msg) => showToast(msg, 'info')
export const toastSuccess = (msg) => showToast(msg, 'success')

/** Extract a clean error message from an axios error */
export function errMsg(e, fallback = 'Something went wrong') {
  return e?.response?.data?.detail || e?.message || fallback
}
