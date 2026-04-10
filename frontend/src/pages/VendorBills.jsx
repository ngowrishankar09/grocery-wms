import { useState, useEffect } from 'react'
import { Receipt, Building2, Clock, CheckCircle, AlertTriangle, DollarSign, Plus, X, ChevronDown } from 'lucide-react'
import { vendorBillAPI, purchaseOrderAPI } from '../api/client'

const STATUS_STYLES = {
  Draft:    'bg-gray-100 text-gray-600',
  Received: 'bg-blue-100 text-blue-700',
  Approved: 'bg-purple-100 text-purple-700',
  Partial:  'bg-yellow-100 text-yellow-700',
  Paid:     'bg-green-100 text-green-700',
  Overdue:  'bg-red-100 text-red-700',
}

const STATUS_TABS = ['All', 'Draft', 'Received', 'Approved', 'Partial', 'Paid', 'Overdue']

const fmt = (n) => `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`

const BLANK_FORM = {
  vendor_id: '', po_id: '', bill_number: '', bill_date: new Date().toISOString().split('T')[0],
  due_date: '', notes: '', items: [{ description: '', qty: 1, unit_price: 0 }]
}

const BLANK_PAYMENT = {
  amount: '', payment_date: new Date().toISOString().split('T')[0],
  method: 'Bank Transfer', reference: '', notes: ''
}

export default function VendorBills() {
  const [bills, setBills] = useState([])
  const [loading, setLoading] = useState(true)
  const [statusTab, setStatusTab] = useState('All')
  const [aging, setAging] = useState(null)
  const [agingOpen, setAgingOpen] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [paymentModal, setPaymentModal] = useState(null) // bill
  const [form, setForm] = useState(BLANK_FORM)
  const [payForm, setPayForm] = useState(BLANK_PAYMENT)
  const [vendors, setVendors] = useState([])
  const [pos, setPos] = useState([])
  const [expandedId, setExpandedId] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    load()
    loadAging()
    // Load vendors and POs for create form
    import('../api/client').then(({ vendorAPI, purchaseOrderAPI: poAPI }) => {
      vendorAPI.list().then(r => setVendors(r.data || [])).catch(() => {})
      poAPI.list({ status: 'Approved' }).then(r => setPos(r.data || [])).catch(() => {})
    })
  }, [])

  const load = async (status) => {
    setLoading(true)
    try {
      const params = (status && status !== 'All') ? { status } : {}
      const r = await vendorBillAPI.list(params)
      setBills(r.data || [])
    } catch {}
    setLoading(false)
  }

  const loadAging = async () => {
    try { const r = await vendorBillAPI.aging(); setAging(r.data) } catch {}
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

  const saveBill = async () => {
    setSaving(true)
    try {
      const payload = {
        ...form,
        vendor_id: form.vendor_id ? parseInt(form.vendor_id) : null,
        po_id: form.po_id ? parseInt(form.po_id) : null,
        items: form.items.map(i => ({ ...i, qty: parseFloat(i.qty), unit_price: parseFloat(i.unit_price) }))
      }
      await vendorBillAPI.create(payload)
      setShowCreate(false)
      setForm(BLANK_FORM)
      load(statusTab)
    } catch (e) { alert(e.response?.data?.detail || 'Error creating bill') }
    setSaving(false)
  }

  const createFromPO = async (poId) => {
    try {
      await vendorBillAPI.fromPO(poId)
      load(statusTab)
    } catch (e) { alert(e.response?.data?.detail || 'Error creating bill from PO') }
  }

  const updateStatus = async (id, status) => {
    try { await vendorBillAPI.updateStatus(id, status); load(statusTab) } catch (e) { alert(e.response?.data?.detail || 'Error') }
  }

  const recordPayment = async () => {
    if (!paymentModal) return
    setSaving(true)
    try {
      await vendorBillAPI.recordPayment(paymentModal.id, {
        ...payForm,
        amount: parseFloat(payForm.amount),
      })
      setPaymentModal(null)
      setPayForm(BLANK_PAYMENT)
      load(statusTab)
    } catch (e) { alert(e.response?.data?.detail || 'Error recording payment') }
    setSaving(false)
  }

  // Summary stats
  const totalBills = bills.length
  const outstanding = bills.filter(b => !['Paid', 'Draft'].includes(b.status)).reduce((s, b) => s + (b.balance || 0), 0)
  const overdue = bills.filter(b => b.status === 'Overdue').reduce((s, b) => s + (b.balance || 0), 0)
  const now = new Date()
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
  const paidThisMonth = bills.filter(b => b.status === 'Paid' && b.bill_date >= firstOfMonth).reduce((s, b) => s + (b.total || 0), 0)

  const filteredBills = statusTab === 'All' ? bills : bills.filter(b => b.status === statusTab)

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Vendor Bills</h1>
          <p className="text-sm text-gray-500 mt-1">Manage accounts payable — vendor invoices, approvals, and payments</p>
        </div>
        <button onClick={() => { setForm(BLANK_FORM); setShowCreate(true) }}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2 hover:bg-blue-700">
          <Plus className="w-4 h-4" /> New Bill
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
              <Receipt className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Total Bills</p>
              <p className="text-xl font-bold text-gray-900">{totalBills}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-yellow-50 flex items-center justify-center">
              <Building2 className="w-5 h-5 text-yellow-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Outstanding AP</p>
              <p className="text-xl font-bold text-gray-900">{fmt(outstanding)}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Overdue</p>
              <p className="text-xl font-bold text-red-600">{fmt(overdue)}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center">
              <CheckCircle className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Paid This Month</p>
              <p className="text-xl font-bold text-green-600">{fmt(paidThisMonth)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* AP Aging Panel */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <button
          onClick={() => setAgingOpen(o => !o)}
          className="w-full flex items-center justify-between px-5 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50"
        >
          <span className="flex items-center gap-2"><Clock className="w-4 h-4 text-gray-500" /> AP Aging Summary</span>
          <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${agingOpen ? 'rotate-180' : ''}`} />
        </button>
        {agingOpen && (
          <div className="px-5 pb-4 border-t border-gray-100">
            {aging ? (
              <div className="grid grid-cols-5 gap-3 mt-3">
                {[
                  { label: 'Current', key: 'current', color: 'text-green-700 bg-green-50 border-green-200' },
                  { label: '1–30 Days', key: 'days_1_30', color: 'text-yellow-700 bg-yellow-50 border-yellow-200' },
                  { label: '31–60 Days', key: 'days_31_60', color: 'text-orange-700 bg-orange-50 border-orange-200' },
                  { label: '61–90 Days', key: 'days_61_90', color: 'text-red-700 bg-red-50 border-red-200' },
                  { label: '90+ Days', key: 'days_over_90', color: 'text-red-900 bg-red-100 border-red-300' },
                ].map(b => (
                  <div key={b.key} className={`rounded-lg border p-3 text-center ${b.color}`}>
                    <p className="text-xs font-medium mb-1">{b.label}</p>
                    <p className="text-lg font-bold">{fmt(aging[b.key] || 0)}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400 mt-3">Loading aging data...</p>
            )}
          </div>
        )}
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

      {/* Bills Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>{['Bill #','Vendor','PO #','Bill Date','Due Date','Status','Total','Paid','Balance','Actions'].map(h => (
              <th key={h} className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">{h}</th>
            ))}</tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={10} className="text-center py-12 text-gray-400">Loading...</td></tr>
            ) : filteredBills.length === 0 ? (
              <tr><td colSpan={10} className="text-center py-12 text-gray-400">
                <Receipt className="w-10 h-10 mx-auto mb-2 text-gray-200" />
                <p>No bills found</p>
              </td></tr>
            ) : filteredBills.map(bill => (
              <>
                <tr key={bill.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => setExpandedId(expandedId === bill.id ? null : bill.id)}>
                  <td className="px-4 py-3 font-medium text-blue-600">{bill.bill_number}</td>
                  <td className="px-4 py-3">{bill.vendor_name || '—'}</td>
                  <td className="px-4 py-3 text-gray-500 font-mono text-xs">{bill.po_number || '—'}</td>
                  <td className="px-4 py-3 text-gray-500">{bill.bill_date}</td>
                  <td className={`px-4 py-3 text-sm ${bill.status === 'Overdue' ? 'text-red-600 font-medium' : 'text-gray-500'}`}>{bill.due_date || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[bill.status] || 'bg-gray-100 text-gray-600'}`}>{bill.status}</span>
                  </td>
                  <td className="px-4 py-3 font-medium">{fmt(bill.total)}</td>
                  <td className="px-4 py-3 text-green-700">{fmt(bill.amount_paid)}</td>
                  <td className={`px-4 py-3 font-medium ${(bill.balance || 0) > 0 ? 'text-red-700' : 'text-gray-400'}`}>{fmt(bill.balance)}</td>
                  <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                    <div className="flex gap-1 flex-wrap">
                      {bill.status === 'Draft' && (
                        <button onClick={() => updateStatus(bill.id, 'Received')}
                          className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded hover:bg-blue-200">Receive</button>
                      )}
                      {bill.status === 'Received' && (
                        <button onClick={() => updateStatus(bill.id, 'Approved')}
                          className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded hover:bg-purple-200">Approve</button>
                      )}
                      {['Approved', 'Partial', 'Overdue'].includes(bill.status) && (
                        <button onClick={() => { setPaymentModal(bill); setPayForm({ ...BLANK_PAYMENT, amount: String(bill.balance || '') }) }}
                          className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded hover:bg-green-200">Pay</button>
                      )}
                    </div>
                  </td>
                </tr>
                {expandedId === bill.id && (
                  <tr key={`exp-${bill.id}`} className="bg-gray-50">
                    <td colSpan={10} className="px-6 py-3">
                      <table className="w-full text-xs border border-gray-200 rounded overflow-hidden">
                        <thead className="bg-gray-100"><tr>
                          {['Description','Qty','Unit Price','Line Total'].map(h => (
                            <th key={h} className="text-left px-3 py-2 text-gray-600 font-medium">{h}</th>
                          ))}</tr>
                        </thead>
                        <tbody>{(bill.items || []).map((item, i) => (
                          <tr key={i} className="border-t border-gray-200">
                            <td className="px-3 py-1.5">{item.description}</td>
                            <td className="px-3 py-1.5">{item.qty}</td>
                            <td className="px-3 py-1.5">{fmt(item.unit_price)}</td>
                            <td className="px-3 py-1.5 font-medium">{fmt(item.line_total)}</td>
                          </tr>
                        ))}</tbody>
                      </table>
                      {bill.notes && <p className="text-gray-600 text-xs mt-2">Notes: {bill.notes}</p>}
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>

      {/* Create Bill Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-[700px] max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center p-5 border-b">
              <h2 className="text-lg font-bold">New Vendor Bill</h2>
              <button onClick={() => setShowCreate(false)}><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Vendor</label>
                  <select value={form.vendor_id} onChange={e => setForm(f => ({...f, vendor_id: e.target.value}))}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">Select vendor...</option>
                    {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Linked PO (optional)</label>
                  <select value={form.po_id} onChange={e => setForm(f => ({...f, po_id: e.target.value}))}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">None</option>
                    {pos.map(po => <option key={po.id} value={po.id}>{po.po_number} — {po.vendor_name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Bill Number</label>
                  <input value={form.bill_number} onChange={e => setForm(f => ({...f, bill_number: e.target.value}))}
                    placeholder="e.g. BILL-001" className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Bill Date</label>
                  <input type="date" value={form.bill_date} onChange={e => setForm(f => ({...f, bill_date: e.target.value}))}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Due Date</label>
                  <input type="date" value={form.due_date} onChange={e => setForm(f => ({...f, due_date: e.target.value}))}
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
              <button onClick={saveBill} disabled={saving}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                {saving ? 'Saving...' : 'Create Bill'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Record Payment Modal */}
      {paymentModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-[450px]">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold">Record Payment</h2>
              <button onClick={() => setPaymentModal(null)}><X className="w-5 h-5" /></button>
            </div>
            <p className="text-sm text-gray-500 mb-4">
              Bill <strong>{paymentModal.bill_number}</strong> — Balance due: <strong>{fmt(paymentModal.balance)}</strong>
            </p>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Amount</label>
                  <input type="number" step="0.01" value={payForm.amount} onChange={e => setPayForm(f => ({...f, amount: e.target.value}))}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Payment Date</label>
                  <input type="date" value={payForm.payment_date} onChange={e => setPayForm(f => ({...f, payment_date: e.target.value}))}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Payment Method</label>
                <select value={payForm.method} onChange={e => setPayForm(f => ({...f, method: e.target.value}))}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {['Bank Transfer', 'Check', 'Cash', 'Credit Card', 'ACH', 'Wire'].map(m => <option key={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Reference / Check #</label>
                <input value={payForm.reference} onChange={e => setPayForm(f => ({...f, reference: e.target.value}))}
                  placeholder="Optional reference" className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
                <textarea value={payForm.notes} onChange={e => setPayForm(f => ({...f, notes: e.target.value}))}
                  rows={2} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none" />
              </div>
            </div>
            <div className="flex gap-2 justify-end mt-4">
              <button onClick={() => setPaymentModal(null)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700">Cancel</button>
              <button onClick={recordPayment} disabled={saving}
                className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50">
                {saving ? 'Saving...' : 'Record Payment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
