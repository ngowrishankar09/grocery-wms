import { useEffect, useState, useRef } from 'react'
import { skuAPI, uploadAPI } from '../api/client'
import axios from 'axios'
import { useT } from '../i18n/translations'
import {
  Plus, Trash2, CheckCircle, Camera, FileText,
  X, AlertCircle, Send, Clock, ChevronRight, ImageIcon
} from 'lucide-react'

const api = axios.create({ baseURL: 'http://localhost:8000' })
const dispatchAPI = {
  create: (data) => api.post('/dispatch/', data),
  list:   ()     => api.get('/dispatch/'),
  get:    (id)   => api.get(`/dispatch/${id}`),
}

const today = () => new Date().toISOString().split('T')[0]
const emptyItem = () => ({ sku_id: '', cases: '' })

// ── Upload review modal (shared by PDF and image) ──────────────
function UploadReviewModal({ uploadData, skus, onApply, onClose, sourceLabel }) {
  const [selected, setSelected] = useState(
    uploadData.items.map(item => ({
      ...item,
      selected: !!(item.matched_sku_id && item.cases),
      sku_id: item.matched_sku_id ? String(item.matched_sku_id) : '',
      cases: item.cases ? String(item.cases) : '',
    }))
  )
  const toggle = (i) => { const u=[...selected]; u[i].selected=!u[i].selected; setSelected(u) }
  const update = (i,f,v) => { const u=[...selected]; u[i][f]=v; setSelected(u) }

  const readyCount = selected.filter(i => i.selected && i.sku_id && i.cases).length
  const totalSelected = selected.filter(i => i.selected).length

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b">
          <div>
            <h3 className="font-bold text-gray-900">{sourceLabel}</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {uploadData.items_detected} item{uploadData.items_detected !== 1 ? 's' : ''} detected across all files — review matches then click Import
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20}/></button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {selected.length === 0 ? (
            <div className="text-center text-gray-400 py-8">
              <AlertCircle size={32} className="mx-auto mb-2 text-gray-300"/>
              <p className="text-sm">No items could be extracted.</p>
              <p className="text-xs mt-1 text-gray-400">
                Make sure the list is clearly printed and the photo is in focus.
              </p>
            </div>
          ) : selected.map((item, i) => (
            <div key={i} className={`border rounded-xl p-3 transition-colors ${
              item.selected ? 'border-orange-300 bg-orange-50' : 'border-gray-200 bg-gray-50'
            }`}>
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={item.selected}
                  onChange={() => toggle(i)}
                  className="mt-1 cursor-pointer w-4 h-4"
                />
                <div className="flex-1 space-y-2">
                  <div className="flex gap-2 flex-wrap items-center">
                    {item.matched_product_name ? (
                      <span className="badge-ok text-xs">{item.matched_sku_code} — {item.matched_product_name}</span>
                    ) : (
                      <span className="badge-warning text-xs">No SKU matched — select manually</span>
                    )}
                    {item.confidence === 'high' && item.matched_sku_id && (
                      <span className="text-xs text-green-600 font-medium">✅ Auto-matched</span>
                    )}
                  </div>
                  {/* Raw OCR / PDF text for reference */}
                  <p className="text-xs text-gray-400 font-mono bg-white border border-gray-100 rounded px-2 py-1 truncate">
                    {item.raw_text}
                  </p>
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="label text-xs">Product</label>
                      <select
                        className="input text-xs py-1"
                        value={item.sku_id}
                        onChange={e => update(i, 'sku_id', e.target.value)}
                      >
                        <option value="">Select product…</option>
                        {skus.map(s => (
                          <option key={s.id} value={s.id}>
                            {s.sku_code} — {s.product_name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="w-24">
                      <label className="label text-xs">Cases</label>
                      <input
                        type="number" min="1"
                        className="input text-xs py-1 text-center font-bold"
                        value={item.cases}
                        onChange={e => update(i, 'cases', e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="p-4 border-t flex gap-3 items-center">
          <span className="text-xs text-gray-500">
            {readyCount} of {totalSelected} selected items ready to import
          </span>
          <div className="flex gap-2 ml-auto">
            <button
              className="btn-danger flex items-center gap-2"
              onClick={() => onApply(selected.filter(i => i.selected && i.sku_id && i.cases))}
              disabled={readyCount === 0}
            >
              <Send size={14}/> Import {readyCount} item{readyCount !== 1 ? 's' : ''}
            </button>
            <button className="btn-secondary" onClick={onClose}>Cancel</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Dispatch Result modal ──────────────────────────────────────
function ResultModal({ result, onClose }) {
  const hasWarnings = result.warnings?.length > 0
  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-xl ${hasWarnings ? 'bg-yellow-100' : 'bg-green-100'}`}>
              <CheckCircle size={22} className={hasWarnings ? 'text-yellow-600' : 'text-green-600'}/>
            </div>
            <div>
              <h3 className="font-bold text-gray-900">Dispatch Complete</h3>
              <p className="text-sm text-gray-500">Ref: <span className="font-mono font-medium text-blue-700">{result.ref}</span></p>
            </div>
          </div>

          {hasWarnings && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 space-y-1">
              <p className="text-xs font-semibold text-yellow-800 mb-1">⚠️ Stock shortfalls — partial dispatch:</p>
              {result.warnings.map((w,i) => <p key={i} className="text-xs text-yellow-700">• {w}</p>)}
            </div>
          )}

          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="table-th">Product</th>
                  <th className="table-th text-center">Requested</th>
                  <th className="table-th text-center">Dispatched</th>
                  <th className="table-th">Batches used</th>
                </tr>
              </thead>
              <tbody>
                {result.items.map((item, i) => (
                  <tr key={i} className="border-b border-gray-50">
                    <td className="table-td">
                      <div className="font-medium text-gray-900 text-xs">{item.product_name}</div>
                      <div className="font-mono text-xs text-gray-400">{item.sku_code}</div>
                    </td>
                    <td className="table-td text-center">{item.requested}</td>
                    <td className="table-td text-center">
                      <span className={item.fulfilled < item.requested ? 'text-yellow-600 font-bold' : 'text-green-600 font-bold'}>
                        {item.fulfilled}
                      </span>
                    </td>
                    <td className="table-td text-xs text-gray-500">
                      {item.picks.map((p,j) => (
                        <div key={j}>{p.warehouse}: {p.cases} cs{p.expiry_date ? ` (exp ${p.expiry_date})` : ''}</div>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button className="btn-primary w-full" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  )
}

// ── Dispatch History row (simple) ─────────────────────────────
function HistoryRow({ record, onOpen }) {
  return (
    <tr className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer" onClick={() => onOpen(record)}>
      <td className="table-td font-mono text-xs text-blue-700">{record.ref}</td>
      <td className="table-td text-sm text-gray-600">{record.dispatch_date}</td>
      <td className="table-td text-center font-medium">{record.item_count}</td>
      <td className="table-td text-center font-medium">{record.total_cases}</td>
      <td className="table-td text-xs text-gray-400 truncate max-w-xs">{record.note || '—'}</td>
      <td className="table-td text-center text-gray-300"><ChevronRight size={14}/></td>
    </tr>
  )
}

// ── Dispatch Detail Drawer ─────────────────────────────────────
function DispatchDetailDrawer({ record, detail, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="flex-1 bg-black/40" onClick={onClose} />

      {/* Drawer panel */}
      <div className="w-full max-w-xl bg-white shadow-2xl flex flex-col overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
          <div>
            <span className="font-mono font-bold text-blue-700 text-base">{record.ref}</span>
            <p className="text-xs text-gray-400 mt-0.5">{record.dispatch_date}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100">
            <X size={20}/>
          </button>
        </div>

        {/* Body */}
        {!detail ? (
          <div className="flex-1 flex items-center justify-center py-16 text-gray-400 text-sm">Loading…</div>
        ) : (
          <div className="p-6 space-y-4">
            {/* Summary strip */}
            <div className="flex gap-6 bg-gray-50 rounded-xl px-4 py-3 text-sm">
              <span><span className="text-gray-400 text-xs">SKUs</span><br/><strong>{record.item_count}</strong></span>
              <span><span className="text-gray-400 text-xs">Total Cases</span><br/><strong>{record.total_cases}</strong></span>
              {record.note && <span><span className="text-gray-400 text-xs">Note</span><br/><span className="text-gray-700">{record.note}</span></span>}
            </div>

            {/* Items */}
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Items Dispatched</p>
            <div className="rounded-xl border border-gray-100 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="text-left px-4 py-2.5 font-medium text-gray-500 text-xs">SKU</th>
                    <th className="text-left px-4 py-2.5 font-medium text-gray-500 text-xs">Product</th>
                    <th className="text-center px-4 py-2.5 font-medium text-gray-500 text-xs">Requested</th>
                    <th className="text-center px-4 py-2.5 font-medium text-gray-500 text-xs">Dispatched</th>
                    <th className="text-center px-4 py-2.5 font-medium text-gray-500 text-xs">Shortfall</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.items.map((item, i) => (
                    <tr key={i} className="border-t border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-2.5 font-mono text-xs text-blue-700">{item.sku_code}</td>
                      <td className="px-4 py-2.5 text-gray-800 text-sm">{item.product_name}</td>
                      <td className="px-4 py-2.5 text-center">{item.cases_requested}</td>
                      <td className="px-4 py-2.5 text-center text-green-700 font-medium">{item.cases_fulfilled}</td>
                      <td className="px-4 py-2.5 text-center">
                        {item.shortfall > 0
                          ? <span className="text-yellow-600 font-medium">{item.shortfall}</span>
                          : <span className="text-gray-300">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// MAIN DISPATCH PAGE
// ══════════════════════════════════════════════════════════════
export default function Dispatch({ lang }) {
  const t = useT(lang)
  const [skus, setSkus] = useState([])
  const [history, setHistory] = useState([])
  const [items, setItems] = useState([emptyItem()])
  const [dispatchDate, setDispatchDate] = useState(today())
  const [ref, setRef] = useState('')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState(null)

  // History detail drawer
  const [drawerRecord, setDrawerRecord] = useState(null)  // record summary
  const [drawerDetail, setDrawerDetail] = useState(null)  // fetched detail

  const openDrawer = async (record) => {
    setDrawerRecord(record)
    setDrawerDetail(null)
    const r = await dispatchAPI.get(record.id)
    setDrawerDetail(r.data)
  }

  // Upload state (shared between PDF and image paths)
  const [uploadLoading, setUploadLoading] = useState(false)
  const [uploadData, setUploadData] = useState(null)
  const [uploadSourceLabel, setUploadSourceLabel] = useState('')
  const pdfInputRef   = useRef(null)
  const imageInputRef = useRef(null)

  const loadHistory = () => dispatchAPI.list().then(r => setHistory(r.data))

  useEffect(() => {
    skuAPI.list().then(r => setSkus(r.data))
    loadHistory()
  }, [])

  // ── Item helpers ─────────────────────────────────────────
  const addItem    = () => setItems(prev => [...prev, emptyItem()])
  const removeItem = (i) => setItems(prev => prev.filter((_,idx) => idx !== i))
  const updateItem = (i, field, val) => setItems(prev => {
    const u = [...prev]; u[i] = { ...u[i], [field]: val }; return u
  })

  const getSku = (skuId) => skus.find(s => String(s.id) === String(skuId))

  // ── Generic multi-file upload handler ───────────────────
  const handleUpload = async (e, type) => {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    setUploadLoading(true)

    const allItems = []
    const filenames = []
    let totalDetected = 0
    const errors = []

    await Promise.all(files.map(async (file) => {
      try {
        const r = type === 'pdf'
          ? await uploadAPI.parsePDF(file)
          : await uploadAPI.parseImage(file)
        allItems.push(...r.data.items)
        filenames.push(file.name)
        totalDetected += r.data.items_detected
      } catch (err) {
        errors.push(`${file.name}: ${err.response?.data?.detail || err.message}`)
      }
    }))

    setUploadLoading(false)
    e.target.value = ''

    if (errors.length) {
      alert('Some files failed:\n' + errors.join('\n'))
    }
    if (!allItems.length) return

    const label = type === 'pdf' ? '📄 PDF' : '📷 Photo'
    setUploadSourceLabel(
      files.length === 1
        ? `${label} — ${filenames[0]}`
        : `${label} — ${files.length} files`
    )
    setUploadData({
      filename: files.length === 1 ? filenames[0] : `${files.length} files`,
      items_detected: totalDetected,
      items: allItems,
    })
  }

  const applyUploadItems = (parsedItems) => {
    const newItems = parsedItems.map(i => ({ sku_id: i.sku_id || '', cases: i.cases || '' }))
    setItems(prev => {
      const hasEmpty = prev.length === 1 && !prev[0].sku_id
      return hasEmpty ? newItems : [...prev, ...newItems]
    })
    setUploadData(null)
  }

  // ── Submit ───────────────────────────────────────────────
  const handleSubmit = async () => {
    const valid = items.filter(i => i.sku_id && i.cases && parseInt(i.cases) > 0)
    if (!valid.length) return alert('Add at least one item with a product and case count')
    setSubmitting(true)
    try {
      const r = await dispatchAPI.create({
        ref: ref.trim() || null,
        note: note.trim() || null,
        dispatch_date: dispatchDate,
        items: valid.map(i => ({ sku_id: parseInt(i.sku_id), cases: parseInt(i.cases) })),
      })
      setResult(r.data)
      setItems([emptyItem()])
      setRef(''); setNote('')
      loadHistory()
      skuAPI.list().then(r => setSkus(r.data))
    } catch (e) {
      alert('Error: ' + (e.response?.data?.detail || e.message))
    }
    setSubmitting(false)
  }

  return (
    <div className="space-y-6">

      {/* History Detail Drawer */}
      {drawerRecord && (
        <DispatchDetailDrawer
          record={drawerRecord}
          detail={drawerDetail}
          onClose={() => { setDrawerRecord(null); setDrawerDetail(null) }}
        />
      )}

      {/* Modals */}
      {uploadData && (
        <UploadReviewModal
          uploadData={uploadData}
          skus={skus}
          onApply={applyUploadItems}
          onClose={() => setUploadData(null)}
          sourceLabel={uploadSourceLabel}
        />
      )}
      {result && <ResultModal result={result} onClose={() => setResult(null)} />}

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">📤 Dispatch Stock</h2>
          <p className="text-sm text-gray-500 mt-0.5">Record what is leaving the warehouse — stock reduces immediately using FEFO</p>
        </div>
        <div className="flex gap-2">
          {/* Photo upload — multiple allowed */}
          <button
            className="btn-secondary flex items-center gap-2"
            onClick={() => imageInputRef.current?.click()}
            disabled={uploadLoading}
            title="Upload one or more photos of your dispatch/packing list"
          >
            <Camera size={16}/>
            {uploadLoading ? 'Reading…' : 'Upload Photo(s)'}
          </button>
          <input
            ref={imageInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/bmp,image/tiff,.jpg,.jpeg,.png,.webp,.bmp,.tif,.tiff"
            multiple
            className="hidden"
            onChange={e => handleUpload(e, 'image')}
          />

          {/* PDF upload — multiple allowed */}
          <button
            className="btn-secondary flex items-center gap-2"
            onClick={() => pdfInputRef.current?.click()}
            disabled={uploadLoading}
            title="Upload one or more PDF dispatch lists or invoices"
          >
            <FileText size={16}/>
            {uploadLoading ? 'Parsing…' : 'Upload PDF(s)'}
          </button>
          <input
            ref={pdfInputRef}
            type="file"
            accept=".pdf"
            multiple
            className="hidden"
            onChange={e => handleUpload(e, 'pdf')}
          />
        </div>
      </div>

      {/* Upload loading indicator */}
      {uploadLoading && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-center gap-3 text-sm text-blue-800">
          <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin flex-shrink-0"/>
          Reading files and matching products… Multiple files are processed in parallel, this may take a few seconds for photos.
        </div>
      )}

      {/* Form */}
      <div className="card space-y-4">
        {/* Meta row */}
        <div className="flex gap-4 flex-wrap items-end">
          <div>
            <label className="label">Dispatch Date</label>
            <input type="date" className="input w-44" value={dispatchDate} onChange={e => setDispatchDate(e.target.value)}/>
          </div>
          <div className="flex-1 min-w-48">
            <label className="label">
              Reference / Invoice #
              <span className="ml-1 text-gray-400 font-normal text-xs">(optional — auto-generated if blank)</span>
            </label>
            <input className="input font-mono" placeholder="e.g. INV-2025-001" value={ref} onChange={e => setRef(e.target.value)}/>
          </div>
          <div className="flex-1 min-w-48">
            <label className="label">Note <span className="text-gray-400 font-normal text-xs">(optional)</span></label>
            <input className="input" placeholder="e.g. Store A delivery, driver John" value={note} onChange={e => setNote(e.target.value)}/>
          </div>
        </div>

        {/* Items */}
        <div className="space-y-2">
          {items.map((item, i) => {
            const sku = getSku(item.sku_id)
            const totalStock = sku ? (sku.wh1_cases + sku.wh2_cases) : null
            const casesNum = parseInt(item.cases) || 0
            const stockOk = totalStock === null || casesNum <= totalStock
            return (
              <div key={i} className="flex flex-wrap gap-3 items-center bg-gray-50 border border-gray-200 rounded-xl p-3">
                {/* Product select */}
                <div className="flex-1 min-w-[200px]">
                  <select
                    className="input"
                    value={item.sku_id}
                    onChange={e => updateItem(i, 'sku_id', e.target.value)}
                  >
                    <option value="">Select product…</option>
                    {skus.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.sku_code} — {s.product_name}
                      </option>
                    ))}
                  </select>
                  {/* Stock preview */}
                  {sku && (
                    <p className={`text-xs mt-0.5 ${
                      totalStock === 0 ? 'text-red-500'
                      : totalStock <= sku.reorder_point ? 'text-yellow-600'
                      : 'text-gray-400'
                    }`}>
                      In stock: <strong>{sku.wh1_cases}</strong> WH1 + <strong>{sku.wh2_cases}</strong> WH2 = <strong>{totalStock}</strong> cases
                    </p>
                  )}
                </div>

                {/* Cases input */}
                <div className="w-28">
                  <input
                    type="number" min="1"
                    className={`input text-center font-bold ${!stockOk ? 'border-red-400 bg-red-50 text-red-700' : ''}`}
                    placeholder="Cases"
                    value={item.cases}
                    onChange={e => updateItem(i, 'cases', e.target.value)}
                    title={!stockOk ? `Only ${totalStock} cases available` : ''}
                  />
                  {!stockOk && casesNum > 0 && (
                    <p className="text-xs text-red-500 text-center mt-0.5">Only {totalStock} avail</p>
                  )}
                </div>

                <button
                  onClick={() => removeItem(i)}
                  className="p-1.5 text-gray-300 hover:text-red-500 transition-colors flex-shrink-0"
                >
                  <Trash2 size={16}/>
                </button>
              </div>
            )
          })}
        </div>

        <div className="flex gap-3 flex-wrap items-center">
          <button className="btn-secondary flex items-center gap-2" onClick={addItem}>
            <Plus size={16}/> Add Item
          </button>
          <button
            className="btn-danger flex items-center gap-2 ml-auto"
            onClick={handleSubmit}
            disabled={submitting}
          >
            <Send size={16}/> {submitting ? 'Dispatching…' : 'Confirm Dispatch & Reduce Stock'}
          </button>
        </div>
      </div>

      {/* History */}
      <div className="card p-0 overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex items-center gap-2">
          <Clock size={16} className="text-gray-400"/>
          <h3 className="font-semibold text-gray-900">Dispatch History</h3>
          <span className="text-xs text-gray-400 ml-1">click any row for details</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px]">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="table-th">Reference</th>
                <th className="table-th">Date</th>
                <th className="table-th text-center">SKUs</th>
                <th className="table-th text-center">Total Cases</th>
                <th className="table-th">Note</th>
                <th className="table-th text-center"></th>
              </tr>
            </thead>
            <tbody>
              {history.length === 0 ? (
                <tr><td colSpan={6} className="table-td text-center text-gray-400 py-8">No dispatches yet</td></tr>
              ) : history.map(r => <HistoryRow key={r.id} record={r} onOpen={openDrawer}/>)}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
