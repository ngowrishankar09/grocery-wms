import { useState, useEffect } from 'react'
import { Plus, Truck, Package, CheckCircle, Clock, X, Edit, Trash2 } from 'lucide-react'
import { asnAPI } from '../api/client'

const STATUSES = ['Pending', 'In Transit', 'Arrived', 'Received']
const STATUS_STYLES = {
  'Pending': 'bg-yellow-100 text-yellow-700',
  'In Transit': 'bg-blue-100 text-blue-700',
  'Arrived': 'bg-purple-100 text-purple-700',
  'Received': 'bg-green-100 text-green-700',
}

export default function SupplierASN() {
  const [asns, setAsns] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editASN, setEditASN] = useState(null)
  const [expandedId, setExpandedId] = useState(null)
  const [filterStatus, setFilterStatus] = useState('All')
  const [form, setForm] = useState({
    po_id: '', vendor_id: '', ship_date: '', eta: '', carrier: '', tracking_number: '', notes: '', items: []
  })

  useEffect(() => { loadASNs() }, [])

  const loadASNs = async () => {
    setLoading(true)
    try {
      const r = await asnAPI.list()
      setAsns(r.data)
    } catch {}
    setLoading(false)
  }

  const openCreate = () => {
    setEditASN(null)
    setForm({ po_id: '', vendor_id: '', ship_date: '', eta: '', carrier: '', tracking_number: '', notes: '', items: [] })
    setShowModal(true)
  }

  const openEdit = (asn) => {
    setEditASN(asn)
    setForm({
      po_id: asn.po_id || '',
      vendor_id: asn.vendor_id || '',
      ship_date: asn.ship_date || '',
      eta: asn.eta || '',
      carrier: asn.carrier || '',
      tracking_number: asn.tracking_number || '',
      notes: asn.notes || '',
      items: asn.items || [],
    })
    setShowModal(true)
  }

  const saveASN = async () => {
    try {
      const payload = { ...form, po_id: form.po_id || null, vendor_id: form.vendor_id || null }
      if (editASN) await asnAPI.update(editASN.id, payload)
      else await asnAPI.create(payload)
      setShowModal(false)
      loadASNs()
    } catch {}
  }

  const deleteASN = async (id) => {
    if (!confirm('Delete this ASN?')) return
    await asnAPI.delete(id)
    loadASNs()
  }

  const changeStatus = async (id, status) => {
    await asnAPI.updateStatus(id, status)
    loadASNs()
  }

  const filtered = filterStatus === 'All' ? asns : asns.filter(a => a.status === filterStatus)

  return (
    <div className="p-6 space-y-4">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Supplier ASN</h1>
          <p className="text-sm text-gray-500 mt-1">Advance Ship Notices from suppliers before delivery</p>
        </div>
        <button onClick={openCreate} className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2 hover:bg-blue-700">
          <Plus className="w-4 h-4" /> New ASN
        </button>
      </div>

      {/* Status filter */}
      <div className="flex gap-2">
        {['All', ...STATUSES].map(s => (
          <button key={s} onClick={() => setFilterStatus(s)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium ${filterStatus === s ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
            {s}
            {s !== 'All' && <span className="ml-1 text-xs">({asns.filter(a => a.status === s).length})</span>}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {['ASN #','Vendor','PO #','Status','Ship Date','ETA','Carrier','Tracking','Items','Actions'].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={10} className="text-center py-12 text-gray-400">Loading...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={10} className="text-center py-12 text-gray-400">
                <Truck className="w-10 h-10 mx-auto mb-2 text-gray-200" />
                <p>No ASNs found</p>
              </td></tr>
            ) : filtered.map(asn => (
              <>
                <tr key={asn.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => setExpandedId(expandedId === asn.id ? null : asn.id)}>
                  <td className="px-4 py-3 font-mono font-medium text-blue-600">{asn.asn_number}</td>
                  <td className="px-4 py-3">{asn.vendor_name || '—'}</td>
                  <td className="px-4 py-3 text-gray-500">{asn.po_number || '—'}</td>
                  <td className="px-4 py-3">
                    <select value={asn.status} onClick={e => e.stopPropagation()}
                      onChange={e => changeStatus(asn.id, e.target.value)}
                      className={`text-xs font-medium px-2 py-1 rounded-full border-0 cursor-pointer ${STATUS_STYLES[asn.status] || ''}`}>
                      {STATUSES.map(s => <option key={s}>{s}</option>)}
                    </select>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{asn.ship_date || '—'}</td>
                  <td className="px-4 py-3 text-gray-500">{asn.eta || '—'}</td>
                  <td className="px-4 py-3 text-gray-500">{asn.carrier || '—'}</td>
                  <td className="px-4 py-3 text-gray-500 font-mono text-xs">{asn.tracking_number || '—'}</td>
                  <td className="px-4 py-3">{asn.items?.length || 0} SKUs</td>
                  <td className="px-4 py-3 flex gap-2" onClick={e => e.stopPropagation()}>
                    <button onClick={() => openEdit(asn)} className="text-blue-600 hover:text-blue-800"><Edit className="w-4 h-4" /></button>
                    <button onClick={() => deleteASN(asn.id)} className="text-red-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                  </td>
                </tr>
                {expandedId === asn.id && (
                  <tr key={`exp-${asn.id}`} className="bg-blue-50">
                    <td colSpan={10} className="px-6 py-3">
                      <table className="w-full text-xs border border-blue-200 rounded-lg overflow-hidden">
                        <thead className="bg-blue-100">
                          <tr>
                            {['SKU Code','Product','Expected','Received','Lot #','Expiry'].map(h => (
                              <th key={h} className="text-left px-3 py-2 font-medium text-blue-700">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {asn.items?.map(item => (
                            <tr key={item.id} className="border-t border-blue-200">
                              <td className="px-3 py-1.5 font-mono">{item.sku_code}</td>
                              <td className="px-3 py-1.5">{item.product_name}</td>
                              <td className="px-3 py-1.5">{item.cases_expected}</td>
                              <td className="px-3 py-1.5">{item.cases_received}</td>
                              <td className="px-3 py-1.5">{item.lot_number || '—'}</td>
                              <td className="px-3 py-1.5">{item.expiry_date || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {asn.notes && <p className="text-blue-700 text-xs mt-2">Notes: {asn.notes}</p>}
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-[600px] max-h-[85vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold">{editASN ? 'Edit ASN' : 'New Supplier ASN'}</h2>
              <button onClick={() => setShowModal(false)}><X className="w-5 h-5" /></button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[
                ['PO ID (optional)', 'po_id', 'number'],
                ['Vendor ID (optional)', 'vendor_id', 'number'],
                ['Ship Date', 'ship_date', 'date'],
                ['ETA', 'eta', 'date'],
                ['Carrier', 'carrier', 'text'],
                ['Tracking Number', 'tracking_number', 'text'],
              ].map(([label, key, type]) => (
                <div key={key}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
                  <input type={type} value={form[key]} onChange={e => setForm(f => ({...f, [key]: e.target.value}))}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              ))}
            </div>
            <div className="mt-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
              <textarea value={form.notes} onChange={e => setForm(f => ({...f, notes: e.target.value}))}
                rows={2} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none" />
            </div>
            <div className="flex gap-2 justify-end mt-4">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
              <button onClick={saveASN} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
                {editASN ? 'Update' : 'Create ASN'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
