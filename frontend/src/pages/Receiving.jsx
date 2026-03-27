import { useEffect, useState, useRef } from 'react'
import { receivingAPI, skuAPI, uploadAPI } from '../api/client'
import { useT } from '../i18n/translations'
import { Plus, Trash2, CheckCircle, Camera, FileText, X, AlertCircle, Search } from 'lucide-react'
import BarcodeScanner from '../components/BarcodeScanner'

const today = () => new Date().toISOString().split('T')[0]

const emptyItem = () => ({ sku_id: '', cases: '', warehouse: 'WH2', hasExpiry: true, expiry: '', ref: '', productName: '' })

// ── Quick New SKU modal ───────────────────────────────────────
function QuickSKUModal({ barcode, onSave, onClose }) {
  const [skus, setSkus] = useState([])
  const [categories, setCategories] = useState([])
  const [form, setForm] = useState({
    sku_code: barcode || '',
    product_name: '',
    name_es: '',
    category: 'Spices',
    case_size: 24,
    unit_label: 'units',
    avg_shelf_life_days: 365,
    reorder_point: 10,
    reorder_qty: 50,
    lead_time_days: 7,
    vendor_id: '',
  })

  useEffect(() => {
    skuAPI.categories().then(r => setCategories(r.data))
  }, [])

  const handleSave = async () => {
    if (!form.sku_code || !form.product_name) return alert('SKU code and product name required')
    try {
      const r = await skuAPI.create({ ...form, vendor_id: form.vendor_id ? parseInt(form.vendor_id) : null })
      onSave(r.data)
    } catch (e) {
      alert('Error: ' + (e.response?.data?.detail || e.message))
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="font-bold text-gray-900">New Product — Barcode: <span className="font-mono text-blue-600">{barcode}</span></h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>
        <div className="p-4 grid grid-cols-2 gap-3">
          <div>
            <label className="label">SKU Code *</label>
            <input className="input" value={form.sku_code} onChange={e => setForm({ ...form, sku_code: e.target.value })} />
          </div>
          <div>
            <label className="label">Product Name *</label>
            <input className="input" value={form.product_name} onChange={e => setForm({ ...form, product_name: e.target.value })} />
          </div>
          <div>
            <label className="label">Nombre (Español)</label>
            <input className="input" value={form.name_es} onChange={e => setForm({ ...form, name_es: e.target.value })} />
          </div>
          <div>
            <label className="label">Category</label>
            <select className="input" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
              {categories.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Case Size (units)</label>
            <input type="number" className="input" value={form.case_size} onChange={e => setForm({ ...form, case_size: parseInt(e.target.value) })} />
          </div>
          <div>
            <label className="label">Shelf Life (days, 0=none)</label>
            <input type="number" className="input" value={form.avg_shelf_life_days} onChange={e => setForm({ ...form, avg_shelf_life_days: parseInt(e.target.value) })} />
          </div>
        </div>
        <div className="p-4 flex gap-3 border-t">
          <button className="btn-primary flex-1" onClick={handleSave}>Save & Add to Receiving</button>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

// ── PDF Review modal ──────────────────────────────────────────
function PDFReviewModal({ pdfData, skus, onApply, onClose }) {
  const [selected, setSelected] = useState(
    pdfData.items.map(item => ({
      ...item,
      selected: !!(item.matched_sku_id && item.cases),
      sku_id: item.matched_sku_id ? String(item.matched_sku_id) : '',
      cases: item.cases ? String(item.cases) : '',
      expiry: item.expiry_date || '',
      hasExpiry: !!item.expiry_date,
      warehouse: 'WH2',
    }))
  )

  const toggle = (i) => {
    const u = [...selected]; u[i].selected = !u[i].selected; setSelected(u)
  }
  const update = (i, field, val) => {
    const u = [...selected]; u[i][field] = val; setSelected(u)
  }

  const handleApply = () => {
    const items = selected.filter(i => i.selected && i.sku_id && i.cases)
    if (!items.length) return alert('Select at least one item')
    onApply(items)
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b">
          <div>
            <h3 className="font-bold text-gray-900">📄 PDF Parsed: {pdfData.filename}</h3>
            <p className="text-xs text-gray-500 mt-0.5">{pdfData.items_detected} items detected — review and select items to import</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {selected.map((item, i) => (
            <div key={i} className={`border rounded-lg p-3 transition-colors ${item.selected ? 'border-blue-300 bg-blue-50' : 'border-gray-200 bg-gray-50'}`}>
              <div className="flex items-start gap-3">
                <input type="checkbox" checked={item.selected} onChange={() => toggle(i)} className="mt-1 cursor-pointer" />
                <div className="flex-1 space-y-2">
                  <div className="flex gap-2 items-center flex-wrap">
                    {item.matched_product_name ? (
                      <span className="badge-ok text-sm">{item.matched_sku_code} — {item.matched_product_name}</span>
                    ) : (
                      <span className="badge-warning text-sm">No match found</span>
                    )}
                    {item.confidence === 'high' && <span className="badge-ok">✅ Auto-matched</span>}
                  </div>
                  <p className="text-xs text-gray-400 font-mono truncate">{item.raw_text}</p>
                  <div className="flex gap-2 flex-wrap">
                    <div>
                      <label className="label text-xs">Product</label>
                      <select className="input text-xs py-1" value={item.sku_id} onChange={e => update(i, 'sku_id', e.target.value)}>
                        <option value="">Select product...</option>
                        {skus.map(s => <option key={s.id} value={s.id}>{s.sku_code} — {s.product_name}</option>)}
                      </select>
                    </div>
                    <div className="w-24">
                      <label className="label text-xs">Cases</label>
                      <input type="number" className="input text-xs py-1" value={item.cases} onChange={e => update(i, 'cases', e.target.value)} />
                    </div>
                    <div className="w-36">
                      <label className="label text-xs">Expiry</label>
                      <input type="date" className="input text-xs py-1" value={item.expiry} onChange={e => update(i, 'expiry', e.target.value)} />
                    </div>
                    <div className="w-28">
                      <label className="label text-xs">Warehouse</label>
                      <select className="input text-xs py-1" value={item.warehouse} onChange={e => update(i, 'warehouse', e.target.value)}>
                        <option value="WH2">WH2</option>
                        <option value="WH1">WH1</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}

          {selected.length === 0 && (
            <div className="text-center text-gray-400 py-8">
              <AlertCircle size={32} className="mx-auto mb-2 text-gray-300" />
              <p>No items could be automatically detected from this PDF.</p>
              <p className="text-xs mt-1">The PDF may be scanned/image-based or have an unusual format.</p>
            </div>
          )}
        </div>

        <div className="p-4 border-t flex gap-3">
          <button className="btn-primary flex-1" onClick={handleApply}>
            Import {selected.filter(i => i.selected).length} Items to Receiving Form
          </button>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

// ── Main Receiving Page ───────────────────────────────────────
export default function Receiving({ lang }) {
  const t = useT(lang)
  const [skus, setSkus] = useState([])
  const [history, setHistory] = useState([])
  const [receivingDate, setReceivingDate] = useState(today())
  const [items, setItems] = useState([emptyItem()])
  const [success, setSuccess] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  // Scanner state
  const [showScanner, setShowScanner] = useState(false)
  const [scanTargetIdx, setScanTargetIdx] = useState(null)
  const [scanFeedback, setScanFeedback] = useState(null)

  // New SKU modal
  const [newSkuBarcode, setNewSkuBarcode] = useState(null)

  // PDF state
  const [pdfLoading, setPdfLoading] = useState(false)
  const [pdfData, setPdfData] = useState(null)
  const fileInputRef = useRef(null)

  useEffect(() => {
    skuAPI.list().then(r => setSkus(r.data))
    receivingAPI.history().then(r => setHistory(r.data))
  }, [])

  // ── Barcode scan handler ───────────────────────────────────
  const handleScan = async (barcode) => {
    setScanFeedback({ type: 'loading', msg: `Looking up: ${barcode}...` })
    try {
      const r = await uploadAPI.lookupBarcode(barcode)
      const data = r.data

      if (data.found) {
        setScanFeedback({ type: 'success', msg: `✅ Found: ${data.product_name}` })
        if (scanTargetIdx !== null) {
          updateItem(scanTargetIdx, 'sku_id', String(data.sku_id))
          updateItem(scanTargetIdx, 'productName', data.product_name)
        } else {
          // Add new row
          setItems(prev => {
            const last = prev[prev.length - 1]
            if (!last.sku_id) {
              const updated = [...prev]
              updated[updated.length - 1] = { ...updated[updated.length - 1], sku_id: String(data.sku_id), productName: data.product_name }
              return updated
            }
            return [...prev, { ...emptyItem(), sku_id: String(data.sku_id), productName: data.product_name }]
          })
        }
        setShowScanner(false)
      } else {
        setScanFeedback({ type: 'error', msg: `❓ Unknown barcode: ${barcode}` })
        setShowScanner(false)
        setNewSkuBarcode(barcode)
      }
    } catch (e) {
      setScanFeedback({ type: 'error', msg: 'Lookup failed' })
    }
  }

  const openScanner = (idx = null) => {
    setScanTargetIdx(idx)
    setScanFeedback(null)
    setShowScanner(true)
  }

  // ── PDF upload handler ─────────────────────────────────────
  const handlePDFUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setPdfLoading(true)
    try {
      const r = await uploadAPI.parsePDF(file)
      setPdfData(r.data)
    } catch (err) {
      alert('PDF parsing failed: ' + (err.response?.data?.detail || err.message))
    }
    setPdfLoading(false)
    e.target.value = ''
  }

  const applyPDFItems = (pdfItems) => {
    const newItems = pdfItems.map(i => ({
      ...emptyItem(),
      sku_id: i.sku_id || '',
      cases: i.cases || '',
      expiry: i.expiry || '',
      hasExpiry: !!i.expiry,
      warehouse: i.warehouse || 'WH2',
    }))
    setItems(prev => {
      const hasEmpty = prev.length === 1 && !prev[0].sku_id
      return hasEmpty ? newItems : [...prev, ...newItems]
    })
    setPdfData(null)
  }

  // ── Form helpers ──────────────────────────────────────────
  const addItem = () => setItems([...items, emptyItem()])
  const removeItem = (i) => setItems(items.filter((_, idx) => idx !== i))
  const updateItem = (i, field, val) => {
    setItems(prev => { const u = [...prev]; u[i] = { ...u[i], [field]: val }; return u })
  }

  const handleSubmit = async () => {
    const validItems = items.filter(i => i.sku_id && i.cases)
    if (!validItems.length) return alert('Add at least one item with a product and case count')
    setSubmitting(true)
    try {
      await receivingAPI.receive({
        received_date: receivingDate,
        items: validItems.map(i => ({
          sku_id: parseInt(i.sku_id),
          cases_received: parseInt(i.cases),
          warehouse: i.warehouse,
          has_expiry: i.hasExpiry,
          expiry_date: i.hasExpiry && i.expiry ? i.expiry : null,
          supplier_ref: i.ref || null,
        }))
      })
      setSuccess(`✅ ${validItems.length} item(s) received successfully!`)
      setItems([emptyItem()])
      receivingAPI.history().then(r => setHistory(r.data))
      skuAPI.list().then(r => setSkus(r.data))
    } catch (e) {
      alert('Error: ' + (e.response?.data?.detail || e.message))
    }
    setSubmitting(false)
  }

  const getProductName = (skuId) => {
    const sku = skus.find(s => String(s.id) === String(skuId))
    return sku ? sku.product_name : ''
  }

  return (
    <div className="space-y-6">
      {/* Scanner modal */}
      {showScanner && (
        <BarcodeScanner
          onScan={handleScan}
          onClose={() => setShowScanner(false)}
        />
      )}

      {/* New SKU modal */}
      {newSkuBarcode && (
        <QuickSKUModal
          barcode={newSkuBarcode}
          onSave={(data) => {
            skuAPI.list().then(r => setSkus(r.data))
            setNewSkuBarcode(null)
            setScanFeedback({ type: 'success', msg: `✅ New product created: ${data.product_name}` })
          }}
          onClose={() => setNewSkuBarcode(null)}
        />
      )}

      {/* PDF review modal */}
      {pdfData && (
        <PDFReviewModal
          pdfData={pdfData}
          skus={skus}
          onApply={applyPDFItems}
          onClose={() => setPdfData(null)}
        />
      )}

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <h2 className="text-2xl font-bold text-gray-900">{t('receiveShipment')}</h2>
        {/* Input method buttons */}
        <div className="flex gap-2 flex-wrap">
          <button
            className="btn-secondary flex items-center gap-2"
            onClick={() => openScanner(null)}
          >
            <Camera size={16} /> Scan Barcode
          </button>
          <button
            className="btn-secondary flex items-center gap-2 relative"
            onClick={() => fileInputRef.current?.click()}
            disabled={pdfLoading}
          >
            <FileText size={16} />
            {pdfLoading ? 'Parsing PDF...' : 'Upload Invoice PDF'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf"
            className="hidden"
            onChange={handlePDFUpload}
          />
        </div>
      </div>

      {/* Scan feedback */}
      {scanFeedback && (
        <div className={`rounded-xl p-3 flex items-center gap-3 text-sm ${
          scanFeedback.type === 'success' ? 'bg-green-50 border border-green-200 text-green-800' :
          scanFeedback.type === 'error' ? 'bg-yellow-50 border border-yellow-200 text-yellow-800' :
          'bg-blue-50 border border-blue-200 text-blue-800'
        }`}>
          {scanFeedback.msg}
          <button onClick={() => setScanFeedback(null)} className="ml-auto opacity-60 hover:opacity-100"><X size={14} /></button>
        </div>
      )}

      {/* Success banner */}
      {success && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3">
          <CheckCircle className="text-green-500 flex-shrink-0" size={20} />
          <span className="text-green-800">{success}</span>
          <button onClick={() => setSuccess(null)} className="ml-auto text-green-600 hover:text-green-800 text-sm">Dismiss</button>
        </div>
      )}

      {/* Form */}
      <div className="card space-y-4">
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-end">
          <div>
            <label className="label">{t('receivingDate')}</label>
            <input type="date" className="input w-48" value={receivingDate} onChange={e => setReceivingDate(e.target.value)} />
          </div>
          <p className="text-sm text-gray-400 sm:pb-2">
            💡 Tip: Click <strong>Scan Barcode</strong> to use your camera, or <strong>Upload Invoice PDF</strong> to auto-fill from a supplier document.
          </p>
        </div>

        {/* Items */}
        <div className="space-y-3">
          {items.map((item, i) => (
            <div key={i} className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
              <div className="flex flex-wrap gap-3 items-start">
                {/* Scan button per row */}
                <button
                  title="Scan barcode for this row"
                  onClick={() => openScanner(i)}
                  className="mt-6 p-2 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-600 border border-blue-200 flex-shrink-0"
                >
                  <Camera size={18} />
                </button>

                <div className="flex-1">
                  <label className="label">{t('product')}</label>
                  <select
                    className="input"
                    value={item.sku_id}
                    onChange={e => updateItem(i, 'sku_id', e.target.value)}
                  >
                    <option value="">Select product...</option>
                    {skus.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.sku_code} — {s.product_name}
                      </option>
                    ))}
                  </select>
                  {item.sku_id && (() => {
                    const sku = skus.find(s => String(s.id) === String(item.sku_id))
                    return sku?.pallet_size
                      ? <p className="text-xs text-blue-500 mt-1">📦 Pallet = {sku.pallet_size} cases</p>
                      : null
                  })()}
                </div>

                {/* Pallet input (only shown when selected SKU has pallet_size) */}
                {(() => {
                  const sku = skus.find(s => String(s.id) === String(item.sku_id))
                  if (!sku?.pallet_size) return null
                  const palletSize = sku.pallet_size
                  const pallets = item.cases !== '' && !isNaN(parseInt(item.cases))
                    ? (parseInt(item.cases) / palletSize).toFixed(2).replace(/\.00$/, '')
                    : ''
                  return (
                    <div className="w-28">
                      <label className="label">Pallets</label>
                      <input
                        type="number" min="0" step="0.5" className="input bg-blue-50 border-blue-200"
                        placeholder="0"
                        value={pallets}
                        onChange={e => {
                          const p = parseFloat(e.target.value)
                          if (!isNaN(p)) updateItem(i, 'cases', String(Math.round(p * palletSize)))
                          else updateItem(i, 'cases', '')
                        }}
                        title={`1 pallet = ${palletSize} cases`}
                      />
                      <p className="text-xs text-gray-400 mt-0.5 text-center">→ cases ↓</p>
                    </div>
                  )
                })()}

                <div className="w-28">
                  <label className="label">{t('caseCount')}</label>
                  <input
                    type="number" min="1" className="input"
                    placeholder="0" value={item.cases}
                    onChange={e => updateItem(i, 'cases', e.target.value)}
                  />
                </div>

                <div className="w-36">
                  <label className="label">{t('warehouse')}</label>
                  <select className="input" value={item.warehouse} onChange={e => updateItem(i, 'warehouse', e.target.value)}>
                    <option value="WH2">WH2 (Backup)</option>
                    <option value="WH1">WH1 (Main)</option>
                  </select>
                </div>

                <button onClick={() => removeItem(i)} className="mt-6 text-red-400 hover:text-red-600 p-1">
                  <Trash2 size={18} />
                </button>
              </div>

              <div className="flex gap-4 items-center flex-wrap">
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer whitespace-nowrap">
                  <input
                    type="checkbox" checked={item.hasExpiry}
                    onChange={e => updateItem(i, 'hasExpiry', e.target.checked)}
                  />
                  {t('hasExpiry')}
                </label>
                {item.hasExpiry && (
                  <div className="flex-1 min-w-36">
                    <input
                      type="date" className="input"
                      value={item.expiry}
                      onChange={e => updateItem(i, 'expiry', e.target.value)}
                    />
                  </div>
                )}
                <div className="flex-1 min-w-48">
                  <input
                    className="input"
                    placeholder="Supplier ref / Invoice # (optional)"
                    value={item.ref}
                    onChange={e => updateItem(i, 'ref', e.target.value)}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex gap-3 flex-wrap">
          <button className="btn-secondary flex items-center gap-2" onClick={addItem}>
            <Plus size={16} /> {t('addItem')}
          </button>
          <button className="btn-primary" onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Submitting...' : t('submitReceiving')}
          </button>
        </div>
      </div>

      {/* History */}
      <div className="card p-0 overflow-hidden">
        <div className="p-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">Receiving History</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px]">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="table-th">Batch Code</th>
                <th className="table-th">{t('product')}</th>
                <th className="table-th text-center">{t('cases')}</th>
                <th className="table-th">{t('warehouse')}</th>
                <th className="table-th">Received</th>
                <th className="table-th">Expiry</th>
                <th className="table-th text-center">Remaining</th>
              </tr>
            </thead>
            <tbody>
              {history.length === 0 ? (
                <tr><td colSpan={7} className="table-td text-center text-gray-400 py-8">{t('noData')}</td></tr>
              ) : history.map((b, i) => (
                <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="table-td font-mono text-xs text-gray-500">{b.batch_code}</td>
                  <td className="table-td">
                    <div className="font-medium">{b.product_name}</div>
                    <div className="text-xs text-gray-400">{b.sku_code}</div>
                  </td>
                  <td className="table-td text-center">{b.cases_received}</td>
                  <td className="table-td">
                    <span className={`badge-${b.warehouse === 'WH1' ? 'blue' : 'neutral'}`}>{b.warehouse}</span>
                  </td>
                  <td className="table-td text-gray-500 text-sm">{b.received_date}</td>
                  <td className="table-td text-sm">{b.expiry_date || <span className="badge-neutral">No expiry</span>}</td>
                  <td className="table-td text-center font-medium">{b.cases_remaining}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
