import { useState, useEffect } from 'react'
import { Plus, FileX, CheckCircle, XCircle, X, DollarSign, AlertTriangle } from 'lucide-react'
import { creditNoteAPI, invoiceAPI, customerAPI } from '../api/client'

const STATUS_STYLES = {
  Open: 'bg-blue-100 text-blue-700',
  Applied: 'bg-green-100 text-green-700',
  Void: 'bg-gray-100 text-gray-500',
}

const REASONS = ['Return', 'Price Correction', 'Goodwill', 'Duplicate Invoice', 'Other']

const BLANK_FORM = {
  customer_id: '', invoice_id: '', credit_date: new Date().toISOString().split('T')[0],
  reason: 'Return', notes: '', items: [{ description: '', qty: 1, unit_price: 0 }]
}

const fmt = (n) => `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`

export default function CreditNotes() {
  const [notes, setNotes] = useState([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [applyModal, setApplyModal] = useState(null)   // { cn, invoices }
  const [form, setForm] = useState(BLANK_FORM)
  const [customers, setCustomers] = useState([])
  const [invoices, setInvoices] = useState([])
  const [applyInvoiceId, setApplyInvoiceId] = useState('')
  const [applyAmount, setApplyAmount] = useState('')
  const [expandedId, setExpandedId] = useState(null)

  useEffect(() => {
    load()
    customerAPI.list().then(r => setCustomers(r.data)).catch(() => {})
    invoiceAPI.list().then(r => setInvoices(r.data)).catch(() => {})
  }, [])

  const load = async () => {
    setLoading(true)
    try { const r = await creditNoteAPI.list(); setNotes(r.data) } catch {}
    setLoading(false)
  }

  const setItem = (idx, key, val) => setForm(f => {
    const items = [...f.items]
    items[idx] = { ...items[idx], [key]: val }
    return { ...f, items }
  })
  const addItem = () => setForm(f => ({ ...f, items: [...f.items, { description: '', qty: 1, unit_price: 0 }] }))
  const removeItem = (idx) => setForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }))

  const save = async () => {
    try {
      const payload = {
        ...form,
        customer_id: form.customer_id || null,
        invoice_id: form.invoice_id || null,
        items: form.items.map(i => ({ ...i, qty: parseFloat(i.qty), unit_price: parseFloat(i.unit_price) }))
      }
      await creditNoteAPI.create(payload)
      setShowCreate(false)
      setForm(BLANK_FORM)
      load()
    } catch {}
  }

  const doApply = async () => {
    if (!applyModal || !applyInvoiceId || !applyAmount) return
    try {
      await creditNoteAPI.apply(applyModal.cn.id, { invoice_id: parseInt(applyInvoiceId), amount: parseFloat(applyAmount) })
      setApplyModal(null); setApplyInvoiceId(''); setApplyAmount('')
      load()
    } catch (e) { alert(e.response?.data?.detail || 'Error applying credit note') }
  }

  const doVoid = async (id) => {
    if (!confirm('Void this credit note?')) return
    await creditNoteAPI.void(id); load()
  }

  const subtotal = form.items.reduce((s, i) => s + (parseFloat(i.qty)||0) * (parseFloat(i.unit_price)||0), 0)

  return (
    <div className="p-6 space-y-4">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Credit Notes</h1>
          <p className="text-sm text-gray-500 mt-1">Issue credits to customers for returns, price corrections, or goodwill</p>
        </div>
        <button onClick={() => { setForm(BLANK_FORM); setShowCreate(true) }}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2 hover:bg-blue-700">
          <Plus className="w-4 h-4" /> New Credit Note
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>{['Credit Note #','Customer','Linked Invoice','Date','Reason','Total','Applied','Balance','Status','Actions'].map(h => (
              <th key={h} className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">{h}</th>
            ))}</tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? <tr><td colSpan={10} className="text-center py-12 text-gray-400">Loading...</td></tr>
            : notes.length === 0 ? <tr><td colSpan={10} className="text-center py-12 text-gray-400">
                <FileX className="w-10 h-10 mx-auto mb-2 text-gray-200" /><p>No credit notes yet</p></td></tr>
            : notes.map(cn => (
              <>
                <tr key={cn.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => setExpandedId(expandedId === cn.id ? null : cn.id)}>
                  <td className="px-4 py-3 font-medium text-blue-600">{cn.credit_note_number}</td>
                  <td className="px-4 py-3">{cn.customer_name || '—'}</td>
                  <td className="px-4 py-3 text-gray-500">{cn.invoice_number || '—'}</td>
                  <td className="px-4 py-3 text-gray-500">{cn.credit_date}</td>
                  <td className="px-4 py-3">{cn.reason}</td>
                  <td className="px-4 py-3 font-medium">{fmt(cn.total)}</td>
                  <td className="px-4 py-3 text-green-700">{fmt(cn.amount_applied)}</td>
                  <td className={`px-4 py-3 font-medium ${cn.balance > 0 ? 'text-blue-700' : 'text-gray-400'}`}>{fmt(cn.balance)}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[cn.status] || 'bg-gray-100 text-gray-600'}`}>{cn.status}</span>
                  </td>
                  <td className="px-4 py-3 flex gap-2" onClick={e => e.stopPropagation()}>
                    {cn.status === 'Open' && cn.balance > 0 && (
                      <button onClick={() => { setApplyModal({ cn }); setApplyAmount(String(cn.balance)) }}
                        className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded hover:bg-green-200">Apply</button>
                    )}
                    {cn.status === 'Open' && (
                      <button onClick={() => doVoid(cn.id)} className="text-gray-400 hover:text-red-500">
                        <XCircle className="w-4 h-4" /></button>
                    )}
                  </td>
                </tr>
                {expandedId === cn.id && (
                  <tr key={`exp-${cn.id}`} className="bg-blue-50">
                    <td colSpan={10} className="px-6 py-3">
                      <table className="w-full text-xs border border-blue-200 rounded overflow-hidden">
                        <thead className="bg-blue-100"><tr>
                          {['Description','SKU','Qty','Unit Price','Line Total'].map(h => (
                            <th key={h} className="text-left px-3 py-2 text-blue-700 font-medium">{h}</th>
                          ))}</tr>
                        </thead>
                        <tbody>{(cn.items || []).map(i => (
                          <tr key={i.id} className="border-t border-blue-200">
                            <td className="px-3 py-1.5">{i.description}</td>
                            <td className="px-3 py-1.5 font-mono">{i.sku_code || '—'}</td>
                            <td className="px-3 py-1.5">{i.qty}</td>
                            <td className="px-3 py-1.5">{fmt(i.unit_price)}</td>
                            <td className="px-3 py-1.5 font-medium">{fmt(i.line_total)}</td>
                          </tr>
                        ))}</tbody>
                      </table>
                      {cn.notes && <p className="text-blue-700 text-xs mt-2">Notes: {cn.notes}</p>}
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-[700px] max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center p-5 border-b">
              <h2 className="text-lg font-bold">New Credit Note</h2>
              <button onClick={() => setShowCreate(false)}><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Customer</label>
                  <select value={form.customer_id} onChange={e => setForm(f => ({...f, customer_id: e.target.value}))}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">Select customer...</option>
                    {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Linked Invoice (optional)</label>
                  <select value={form.invoice_id} onChange={e => setForm(f => ({...f, invoice_id: e.target.value}))}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">None</option>
                    {invoices.map(inv => <option key={inv.id} value={inv.id}>{inv.invoice_number} — {inv.store_name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Credit Date</label>
                  <input type="date" value={form.credit_date} onChange={e => setForm(f => ({...f, credit_date: e.target.value}))}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Reason</label>
                  <select value={form.reason} onChange={e => setForm(f => ({...f, reason: e.target.value}))}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    {REASONS.map(r => <option key={r}>{r}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-xs font-medium text-gray-600">Line Items</label>
                  <button onClick={addItem} className="text-xs text-blue-600 hover:underline">+ Add line</button>
                </div>
                <table className="w-full text-sm">
                  <thead className="bg-gray-50"><tr>
                    {['Description','Qty','Unit Price','Total',''].map(h => (
                      <th key={h} className="text-left px-2 py-1.5 text-xs font-medium text-gray-500">{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody>{form.items.map((item, idx) => (
                    <tr key={idx}>
                      <td className="px-1 py-1"><input value={item.description} onChange={e => setItem(idx, 'description', e.target.value)}
                        placeholder="Description" className="w-full border rounded px-2 py-1 text-sm" /></td>
                      <td className="px-1 py-1 w-20"><input type="number" value={item.qty} onChange={e => setItem(idx, 'qty', e.target.value)}
                        className="w-full border rounded px-2 py-1 text-sm" /></td>
                      <td className="px-1 py-1 w-28"><input type="number" value={item.unit_price} onChange={e => setItem(idx, 'unit_price', e.target.value)}
                        className="w-full border rounded px-2 py-1 text-sm" /></td>
                      <td className="px-2 py-1 text-right font-medium">{fmt((parseFloat(item.qty)||0)*(parseFloat(item.unit_price)||0))}</td>
                      <td className="px-1 py-1"><button onClick={() => removeItem(idx)} className="text-red-400 hover:text-red-600"><X className="w-3 h-3" /></button></td>
                    </tr>
                  ))}</tbody>
                </table>
                <div className="text-right mt-2 text-sm font-bold text-gray-800">Total: {fmt(subtotal)}</div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
                <textarea value={form.notes} onChange={e => setForm(f => ({...f, notes: e.target.value}))}
                  rows={2} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none" />
              </div>
            </div>
            <div className="flex gap-2 justify-end p-5 border-t">
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
              <button onClick={save} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">Issue Credit Note</button>
            </div>
          </div>
        </div>
      )}

      {/* Apply Modal */}
      {applyModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-[450px]">
            <h2 className="text-lg font-bold mb-1">Apply Credit Note</h2>
            <p className="text-sm text-gray-500 mb-4">
              Apply <strong>{applyModal.cn.credit_note_number}</strong> (balance: {fmt(applyModal.cn.balance)}) against an invoice.
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Invoice</label>
                <select value={applyInvoiceId} onChange={e => setApplyInvoiceId(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">Select invoice...</option>
                  {invoices.filter(inv => inv.status !== 'Paid' && inv.status !== 'Cancelled' && inv.status !== 'Draft')
                    .map(inv => <option key={inv.id} value={inv.id}>{inv.invoice_number} — {inv.store_name} (due: {fmt(inv.balance_due || inv.grand_total)})</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Amount to Apply</label>
                <input type="number" step="0.01" value={applyAmount} onChange={e => setApplyAmount(e.target.value)}
                  max={applyModal.cn.balance}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            <div className="flex gap-2 justify-end mt-4">
              <button onClick={() => setApplyModal(null)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700">Cancel</button>
              <button onClick={doApply} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700">Apply Credit</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
