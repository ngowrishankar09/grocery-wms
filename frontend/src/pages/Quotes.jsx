import { useState, useEffect } from 'react'
import { FileText, Plus, ArrowRight, CheckCircle, XCircle, Send, RefreshCw, X } from 'lucide-react'
import { quoteAPI, customerAPI } from '../api/client'

const STATUS_STYLES = {
  Draft:     'bg-gray-100 text-gray-600',
  Sent:      'bg-blue-100 text-blue-700',
  Accepted:  'bg-green-100 text-green-700',
  Rejected:  'bg-red-100 text-red-700',
  Expired:   'bg-orange-100 text-orange-700',
  Converted: 'bg-purple-100 text-purple-700',
}

const STATUS_TABS = ['All', 'Draft', 'Sent', 'Accepted', 'Rejected', 'Expired', 'Converted']

const fmt = (n) => `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`

const today = new Date().toISOString().split('T')[0]
const in30 = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0]

const BLANK_FORM = {
  customer_id: '', quote_date: today, expiry_date: in30,
  notes: '', items: [{ description: '', qty: 1, unit_price: 0 }]
}

export default function Quotes() {
  const [quotes, setQuotes] = useState([])
  const [loading, setLoading] = useState(true)
  const [statusTab, setStatusTab] = useState('All')
  const [showCreate, setShowCreate] = useState(false)
  const [convertModal, setConvertModal] = useState(null) // { quote, orderNumber }
  const [form, setForm] = useState(BLANK_FORM)
  const [customers, setCustomers] = useState([])
  const [expandedId, setExpandedId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [converting, setConverting] = useState(false)

  useEffect(() => {
    load()
    customerAPI.list().then(r => setCustomers(r.data || [])).catch(() => {})
  }, [])

  const load = async (status) => {
    setLoading(true)
    try {
      const params = (status && status !== 'All') ? { status } : {}
      const r = await quoteAPI.list(params)
      setQuotes(r.data || [])
    } catch {}
    setLoading(false)
  }

  const changeTab = (tab) => {
    setStatusTab(tab)
    load(tab)
  }

  const setItem = (idx, key, val) => setForm(f => {
    const items = [...f.items]
    items[idx] = { ...items[idx], [key]: val }
    return { ...f, items }
  })
  const addItem = () => setForm(f => ({ ...f, items: [...f.items, { description: '', qty: 1, unit_price: 0 }] }))
  const removeItem = (idx) => setForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }))

  const subtotal = form.items.reduce((s, i) => s + (parseFloat(i.qty)||0) * (parseFloat(i.unit_price)||0), 0)

  const save = async () => {
    setSaving(true)
    try {
      const payload = {
        ...form,
        customer_id: form.customer_id ? parseInt(form.customer_id) : null,
        items: form.items.map(i => ({ ...i, qty: parseFloat(i.qty), unit_price: parseFloat(i.unit_price) }))
      }
      await quoteAPI.create(payload)
      setShowCreate(false)
      setForm(BLANK_FORM)
      load(statusTab)
    } catch (e) { alert(e.response?.data?.detail || 'Error creating quote') }
    setSaving(false)
  }

  const updateStatus = async (id, status) => {
    try { await quoteAPI.updateStatus(id, status); load(statusTab) }
    catch (e) { alert(e.response?.data?.detail || 'Error updating status') }
  }

  const convertToOrder = async (quote) => {
    setConverting(true)
    try {
      const r = await quoteAPI.convert(quote.id)
      setConvertModal({ quote, orderNumber: r.data?.order_number || r.data?.id })
      load(statusTab)
    } catch (e) { alert(e.response?.data?.detail || 'Error converting quote') }
    setConverting(false)
  }

  const filteredQuotes = statusTab === 'All' ? quotes : quotes.filter(q => q.status === statusTab)

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sales Quotations</h1>
          <p className="text-sm text-gray-500 mt-1">Create and manage quotes for customers — convert accepted quotes directly to orders</p>
        </div>
        <button onClick={() => { setForm(BLANK_FORM); setShowCreate(true) }}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2 hover:bg-blue-700">
          <Plus className="w-4 h-4" /> New Quote
        </button>
      </div>

      {/* Status Tabs */}
      <div className="flex gap-1 flex-wrap">
        {STATUS_TABS.map(tab => (
          <button key={tab} onClick={() => changeTab(tab)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              statusTab === tab ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}>
            {tab}
          </button>
        ))}
      </div>

      {/* Quotes Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>{['Quote #','Customer','Quote Date','Expiry','Status','Total','Actions'].map(h => (
              <th key={h} className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">{h}</th>
            ))}</tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={7} className="text-center py-12 text-gray-400">Loading...</td></tr>
            ) : filteredQuotes.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-12 text-gray-400">
                <FileText className="w-10 h-10 mx-auto mb-2 text-gray-200" />
                <p>No quotes found</p>
              </td></tr>
            ) : filteredQuotes.map(q => (
              <>
                <tr key={q.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => setExpandedId(expandedId === q.id ? null : q.id)}>
                  <td className="px-4 py-3 font-medium text-blue-600">{q.quote_number}</td>
                  <td className="px-4 py-3">{q.customer_name || '—'}</td>
                  <td className="px-4 py-3 text-gray-500">{q.quote_date}</td>
                  <td className={`px-4 py-3 text-sm ${q.expiry_date && q.expiry_date < today && q.status !== 'Converted' ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
                    {q.expiry_date || '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[q.status] || 'bg-gray-100 text-gray-600'}`}>{q.status}</span>
                  </td>
                  <td className="px-4 py-3 font-medium">{fmt(q.total)}</td>
                  <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                    <div className="flex gap-1 flex-wrap">
                      {q.status === 'Draft' && (
                        <button onClick={() => updateStatus(q.id, 'Sent')}
                          className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded hover:bg-blue-200 flex items-center gap-1">
                          <Send className="w-3 h-3" /> Send
                        </button>
                      )}
                      {['Sent'].includes(q.status) && (
                        <>
                          <button onClick={() => updateStatus(q.id, 'Accepted')}
                            className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded hover:bg-green-200 flex items-center gap-1">
                            <CheckCircle className="w-3 h-3" /> Accept
                          </button>
                          <button onClick={() => updateStatus(q.id, 'Rejected')}
                            className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded hover:bg-red-200 flex items-center gap-1">
                            <XCircle className="w-3 h-3" /> Reject
                          </button>
                        </>
                      )}
                      {['Draft', 'Sent', 'Accepted'].includes(q.status) && (
                        <button onClick={() => convertToOrder(q)} disabled={converting}
                          className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded hover:bg-purple-200 flex items-center gap-1 disabled:opacity-50">
                          <ArrowRight className="w-3 h-3" /> Convert
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
                {expandedId === q.id && (
                  <tr key={`exp-${q.id}`} className="bg-blue-50">
                    <td colSpan={7} className="px-6 py-3">
                      <table className="w-full text-xs border border-blue-200 rounded overflow-hidden">
                        <thead className="bg-blue-100"><tr>
                          {['Description','Qty','Unit Price','Line Total'].map(h => (
                            <th key={h} className="text-left px-3 py-2 text-blue-700 font-medium">{h}</th>
                          ))}</tr>
                        </thead>
                        <tbody>{(q.items || []).map((item, i) => (
                          <tr key={i} className="border-t border-blue-200">
                            <td className="px-3 py-1.5">{item.description}</td>
                            <td className="px-3 py-1.5">{item.qty}</td>
                            <td className="px-3 py-1.5">{fmt(item.unit_price)}</td>
                            <td className="px-3 py-1.5 font-medium">{fmt(item.line_total)}</td>
                          </tr>
                        ))}</tbody>
                      </table>
                      {q.notes && <p className="text-blue-700 text-xs mt-2">Notes: {q.notes}</p>}
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>

      {/* Create Quote Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-[700px] max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center p-5 border-b">
              <h2 className="text-lg font-bold">New Sales Quote</h2>
              <button onClick={() => setShowCreate(false)}><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-3 md:col-span-1">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Customer</label>
                  <select value={form.customer_id} onChange={e => setForm(f => ({...f, customer_id: e.target.value}))}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">Select customer...</option>
                    {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Quote Date</label>
                  <input type="date" value={form.quote_date} onChange={e => setForm(f => ({...f, quote_date: e.target.value}))}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Expiry Date</label>
                  <input type="date" value={form.expiry_date} onChange={e => setForm(f => ({...f, expiry_date: e.target.value}))}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
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
              <button onClick={save} disabled={saving}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                {saving ? 'Saving...' : 'Create Quote'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Convert Success Modal */}
      {convertModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-[400px] text-center">
            <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
              <CheckCircle className="w-7 h-7 text-green-600" />
            </div>
            <h2 className="text-lg font-bold mb-1">Quote Converted!</h2>
            <p className="text-sm text-gray-500 mb-1">
              Quote <strong>{convertModal.quote.quote_number}</strong> has been converted to an order.
            </p>
            {convertModal.orderNumber && (
              <p className="text-sm font-medium text-blue-700 mb-4">Order: {convertModal.orderNumber}</p>
            )}
            <button onClick={() => setConvertModal(null)}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
