import { useEffect, useState } from 'react'
import { transferAPI, receivingAPI } from '../api/client'
import { useT } from '../i18n/translations'
import { ArrowRight, Lightbulb, Plus, Trash2 } from 'lucide-react'

const today = () => new Date().toISOString().split('T')[0]

export default function Transfers({ lang }) {
  const t = useT(lang)
  const [transfers, setTransfers] = useState([])
  const [suggestions, setSuggestions] = useState([])
  const [batches, setBatches] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [fromWH, setFromWH] = useState('WH2')
  const [toWH, setToWH] = useState('WH1')
  const [transferDate, setTransferDate] = useState(today())
  const [items, setItems] = useState([{ batch_id: '', cases: '' }])
  const [notes, setNotes] = useState('')

  const load = () => {
    transferAPI.list().then(r => setTransfers(r.data))
    transferAPI.suggestions().then(r => setSuggestions(r.data))
    receivingAPI.listBatches({ warehouse: fromWH }).then(r => setBatches(r.data))
  }

  useEffect(() => { load() }, [])
  useEffect(() => {
    if (fromWH) receivingAPI.listBatches({ warehouse: fromWH }).then(r => setBatches(r.data))
  }, [fromWH])

  const addItem = () => setItems([...items, { batch_id: '', cases: '' }])
  const removeItem = (i) => setItems(items.filter((_, idx) => idx !== i))
  const updateItem = (i, field, val) => { const u = [...items]; u[i][field] = val; setItems(u) }

  const handleSubmit = async () => {
    const valid = items.filter(i => i.batch_id && i.cases)
    if (!valid.length) return alert('Add at least one item')
    try {
      await transferAPI.create({
        from_warehouse: fromWH,
        to_warehouse: toWH,
        transfer_date: transferDate,
        notes,
        items: valid.map(i => ({ batch_id: parseInt(i.batch_id), cases_to_move: parseInt(i.cases) }))
      })
      setShowForm(false); setItems([{ batch_id: '', cases: '' }]); load()
    } catch (e) {
      alert('Error: ' + (e.response?.data?.detail || e.message))
    }
  }

  const applysuggestion = (s) => {
    if (s.batches.length > 0) {
      const b = s.batches[0]
      setItems([{ batch_id: String(b.batch_id), cases: String(Math.min(s.suggested_transfer, b.cases_remaining)) }])
      setFromWH('WH2'); setToWH('WH1')
      setShowForm(true)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">{t('transfers')}</h2>
        <button className="btn-primary flex items-center gap-2" onClick={() => setShowForm(!showForm)}>
          <Plus size={16} /> {t('newTransfer')}
        </button>
      </div>

      {/* Suggestions */}
      {suggestions.length > 0 && (
        <div className="card bg-amber-50 border-amber-200">
          <h3 className="font-semibold text-amber-900 flex items-center gap-2 mb-3">
            <Lightbulb size={18} className="text-amber-500" /> {t('suggestions')} ({suggestions.length})
          </h3>
          <div className="space-y-2">
            {suggestions.slice(0, 5).map((s, i) => (
              <div key={i} className="flex items-center justify-between bg-white border border-amber-200 rounded-lg p-3">
                <div>
                  <div className="font-medium text-sm">{s.product_name} <span className="text-gray-400 text-xs">({s.sku_code})</span></div>
                  <div className="text-xs text-gray-500">
                    WH1: <strong className="text-red-600">{s.wh1_cases}</strong> cases · WH2: <strong className="text-green-700">{s.wh2_cases}</strong> cases · Suggest moving: <strong>{s.suggested_transfer}</strong>
                  </div>
                </div>
                <button className="btn-secondary text-xs flex items-center gap-1" onClick={() => applysuggestion(s)}>
                  Use <ArrowRight size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Form */}
      {showForm && (
        <div className="card space-y-4">
          <h3 className="font-semibold text-gray-900">{t('newTransfer')}</h3>
          <div className="flex gap-4">
            <div>
              <label className="label">{t('from')}</label>
              <select className="input w-40" value={fromWH} onChange={e => { setFromWH(e.target.value); setToWH(e.target.value === 'WH1' ? 'WH2' : 'WH1') }}>
                <option value="WH2">WH2</option>
                <option value="WH1">WH1</option>
              </select>
            </div>
            <div className="flex items-end pb-2"><ArrowRight className="text-gray-400" /></div>
            <div>
              <label className="label">{t('to')}</label>
              <select className="input w-40" value={toWH} onChange={e => setToWH(e.target.value)}>
                <option value="WH1">WH1</option>
                <option value="WH2">WH2</option>
              </select>
            </div>
            <div>
              <label className="label">{t('transferDate')}</label>
              <input type="date" className="input" value={transferDate} onChange={e => setTransferDate(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            {items.map((item, i) => (
              <div key={i} className="flex gap-3 items-center bg-gray-50 p-3 rounded-lg">
                <select className="input flex-1" value={item.batch_id} onChange={e => updateItem(i, 'batch_id', e.target.value)}>
                  <option value="">Select batch from {fromWH}...</option>
                  {batches.map(b => (
                    <option key={b.id} value={b.id}>
                      {b.product_name} · {b.batch_code} · {b.cases_remaining} cases
                      {b.expiry_date ? ` · Exp: ${b.expiry_date}` : ''}
                    </option>
                  ))}
                </select>
                <input type="number" min="1" className="input w-28" placeholder="Cases" value={item.cases} onChange={e => updateItem(i, 'cases', e.target.value)} />
                <button onClick={() => removeItem(i)} className="text-red-400 hover:text-red-600"><Trash2 size={18} /></button>
              </div>
            ))}
          </div>

          <input className="input" placeholder="Notes (optional)" value={notes} onChange={e => setNotes(e.target.value)} />

          <div className="flex gap-3">
            <button className="btn-secondary flex items-center gap-2" onClick={addItem}><Plus size={16} />Add Item</button>
            <button className="btn-primary" onClick={handleSubmit}>Confirm Transfer</button>
            <button className="btn-secondary" onClick={() => setShowForm(false)}>{t('cancel')}</button>
          </div>
        </div>
      )}

      {/* History */}
      <div className="card p-0 overflow-hidden">
        <div className="p-4 border-b"><h3 className="font-semibold text-gray-900">Transfer History</h3></div>
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="table-th">Transfer #</th>
              <th className="table-th">Route</th>
              <th className="table-th">Date</th>
              <th className="table-th text-center">Items</th>
              <th className="table-th text-center">Total Cases</th>
            </tr>
          </thead>
          <tbody>
            {transfers.length === 0 ? (
              <tr><td colSpan={5} className="table-td text-center text-gray-400 py-8">{t('noData')}</td></tr>
            ) : transfers.map((tr, i) => (
              <tr key={i} className="border-b hover:bg-gray-50">
                <td className="table-td font-mono text-xs text-blue-700">{tr.transfer_number}</td>
                <td className="table-td">
                  <span className="badge-neutral">{tr.from_warehouse}</span>
                  <ArrowRight size={14} className="inline mx-1 text-gray-400" />
                  <span className="badge-blue">{tr.to_warehouse}</span>
                </td>
                <td className="table-td text-gray-500">{tr.transfer_date}</td>
                <td className="table-td text-center">{tr.item_count}</td>
                <td className="table-td text-center font-medium">{tr.total_cases}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
