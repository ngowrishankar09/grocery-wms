import { useEffect, useState, useRef } from 'react'
import { skuAPI, vendorAPI, settingsAPI, uploadAPI, labelAPI, inventoryAPI } from '../api/client'
import { useT } from '../i18n/translations'
import { Plus, Search, Edit2, Trash2, AlertTriangle, Check, X, SlidersHorizontal, Info, Upload, FileSpreadsheet, FileText, Image, Printer, Tag, MapPin } from 'lucide-react'
import axios from 'axios'

const API = axios.create({ baseURL: 'http://localhost:8000' })

// ── Reusable confirm dialog ─────────────────────────────────────
function ConfirmDialog({ message, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-red-100 rounded-xl">
            <AlertTriangle className="text-red-600" size={22} />
          </div>
          <h3 className="font-bold text-gray-900">Confirm Delete</h3>
        </div>
        <p className="text-sm text-gray-600">{message}</p>
        <div className="flex gap-3">
          <button className="btn-danger flex-1" onClick={onConfirm}>Yes, Delete</button>
          <button className="btn-secondary flex-1" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

// ── Stock adjustment modal ──────────────────────────────────────
const REASONS = [
  'Physical count correction',
  'Damaged goods',
  'Theft / shrinkage',
  'Returned to vendor',
  'Expired stock removed',
  'System error correction',
  'Other',
]

function AdjustModal({ row, onClose, onSaved }) {
  const [newQty, setNewQty] = useState(String(row.current))
  const [reason, setReason] = useState(REASONS[0])
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const delta = newQty !== '' && !isNaN(parseInt(newQty)) ? parseInt(newQty) - row.current : null

  const handleSave = async () => {
    if (newQty === '' || isNaN(parseInt(newQty))) return alert('Enter a valid quantity')
    setSaving(true)
    try {
      await settingsAPI.adjustInventory({
        sku_id: row.sku_id,
        warehouse: row.warehouse,
        new_qty: parseInt(newQty),
        reason,
        notes: notes || null,
      })
      onSaved()
    } catch (e) {
      alert(e.response?.data?.detail || e.message)
    }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="font-bold text-gray-900">Adjust Stock</h4>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        <div className="bg-gray-50 rounded-xl p-3">
          <div className="font-medium text-gray-800">{row.product_name}</div>
          <div className="text-sm text-gray-500">{row.sku_code} · {row.warehouse}</div>
          <div className="text-sm mt-1">Current: <strong>{row.current} cases</strong></div>
        </div>

        <div>
          <label className="label">New Quantity (cases) *</label>
          <input
            type="number" min="0" className="input text-lg font-bold"
            value={newQty} onChange={e => setNewQty(e.target.value)}
            autoFocus
          />
          {delta !== null && (
            <p className={`text-sm mt-1 font-medium ${delta > 0 ? 'text-green-600' : delta < 0 ? 'text-red-600' : 'text-gray-500'}`}>
              Change: {delta > 0 ? '+' : ''}{delta} cases
            </p>
          )}
        </div>

        <div>
          <label className="label">Reason *</label>
          <select className="input" value={reason} onChange={e => setReason(e.target.value)}>
            {REASONS.map(r => <option key={r}>{r}</option>)}
          </select>
        </div>

        <div>
          <label className="label">Notes (optional)</label>
          <input className="input" placeholder="Additional details..." value={notes} onChange={e => setNotes(e.target.value)} />
        </div>

        <div className="flex gap-3">
          <button className="btn-primary flex-1" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : <><Check size={14} className="inline mr-1" />Save Adjustment</>}
          </button>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

// ── Tooltip helper ──────────────────────────────────────────────
function Tooltip({ text }) {
  const [show, setShow] = useState(false)
  return (
    <span className="relative inline-block ml-1 align-middle">
      <Info
        size={13}
        className="text-gray-400 hover:text-blue-500 cursor-help"
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
      />
      {show && (
        <span className="absolute z-50 left-5 top-0 w-56 bg-gray-800 text-white text-xs rounded-lg px-3 py-2 shadow-xl leading-relaxed">
          {text}
        </span>
      )}
    </span>
  )
}

// ── Section heading inside form ─────────────────────────────────
function FormSection({ title, children }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="h-px flex-1 bg-gray-100" />
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-2">{title}</span>
        <div className="h-px flex-1 bg-gray-100" />
      </div>
      {children}
    </div>
  )
}

const UNIT_SUGGESTIONS = [
  'units', 'pcs', 'cans', 'bottles', 'bags', 'boxes', 'pouches', 'jars',
  '100g packs', '200g packs', '400g packs', '500g packs', '800g packs',
  '1kg bags', '2kg bags', '5kg bags', '10kg bags',
  '100ml bottles', '250ml bottles', '500ml bottles', '1L bottles',
  '2lb bags', '4lb bags', '5lb bags', '10lb bags', '20lb bags',
  '10oz bags', '12oz bags', '16oz bags',
  '1600g jars', '850g packs',
]

const BLANK_FORM = {
  sku_code: '', barcode: '', product_name: '', name_es: '', category: 'Spices',
  case_size: 24, pallet_size: '', unit_label: 'units', avg_shelf_life_days: 0,
  reorder_point: 10, reorder_qty: 50, max_stock: 200, lead_time_days: 7, vendor_id: '',
  cost_price: '', selling_price: '',
  show_goods_date_on_picking: false,
  require_expiry_entry: false,
  initial_wh1: '', initial_wh2: '',
  bin_location_id: '',
}

// ── Bulk Upload Modal ───────────────────────────────────────────
function BulkUploadModal({ categories, onClose, onImported }) {
  const fileRef = useRef(null)
  const [stage, setStage] = useState('pick')    // 'pick' | 'preview' | 'done'
  const [loading, setLoading] = useState(false)
  const [parseResult, setParseResult] = useState(null)
  const [rows, setRows] = useState([])           // editable preview rows
  const [skipDuplicates, setSkipDuplicates] = useState(true)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')

  const handleBackdrop = (e) => { if (e.target === e.currentTarget) onClose() }

  const handleFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setLoading(true)
    setError('')
    try {
      const res = await uploadAPI.bulkSKUPreview(file)
      const data = res.data
      setParseResult(data)
      setRows(data.items.map(r => ({ ...r, _selected: r.status === 'new' })))
      setStage('preview')
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Upload failed')
    }
    setLoading(false)
    // reset so same file can be re-uploaded
    e.target.value = ''
  }

  const updateRow = (idx, key, val) => {
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, [key]: val } : r))
  }

  const handleConfirm = async () => {
    const toCreate = rows.filter(r => r._selected && r.status !== 'duplicate' || (r._selected && !skipDuplicates))
    if (toCreate.length === 0) return alert('No new SKUs selected to import.')
    setLoading(true)
    try {
      const res = await uploadAPI.bulkSKUConfirm(
        toCreate.map(r => ({
          sku_code: r.sku_code,
          product_name: r.product_name,
          category: r.category,
          case_size: parseInt(r.case_size) || 1,
          unit_label: r.unit_label || 'units',
          wh1_stock: parseInt(r.wh1_stock) || 0,
          wh2_stock: parseInt(r.wh2_stock) || 0,
        })),
        skipDuplicates
      )
      setResult(res.data)
      setStage('done')
      onImported()
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Import failed')
    }
    setLoading(false)
  }

  const newCount = rows.filter(r => r._selected && r.status === 'new').length
  const dupCount = rows.filter(r => r.status === 'duplicate').length

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4"
      onClick={handleBackdrop}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl flex flex-col max-h-[92vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-50 rounded-xl"><Upload size={18} className="text-blue-600" /></div>
            <div>
              <h3 className="font-bold text-gray-900 text-lg">Bulk Upload SKUs</h3>
              <p className="text-xs text-gray-400 mt-0.5">Import from Excel, PDF or photo</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">

          {/* ── STAGE: pick ── */}
          {stage === 'pick' && (
            <div className="space-y-6">
              {/* File format guide */}
              <div className="bg-blue-50 rounded-xl p-4 text-sm text-blue-800 space-y-2">
                <p className="font-semibold">Accepted file formats:</p>
                <div className="grid grid-cols-3 gap-3 mt-2">
                  <div className="bg-white rounded-lg p-3 border border-blue-100 flex items-start gap-2">
                    <FileSpreadsheet size={16} className="text-green-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="font-semibold text-gray-800">.xlsx / .xls</p>
                      <p className="text-xs text-gray-500 mt-1">Excel with column headers: Item Code, Name, Category, Stock</p>
                    </div>
                  </div>
                  <div className="bg-white rounded-lg p-3 border border-blue-100 flex items-start gap-2">
                    <FileText size={16} className="text-red-500 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="font-semibold text-gray-800">.pdf</p>
                      <p className="text-xs text-gray-500 mt-1">PDF with a table listing item code, name, category</p>
                    </div>
                  </div>
                  <div className="bg-white rounded-lg p-3 border border-blue-100 flex items-start gap-2">
                    <Image size={16} className="text-purple-500 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="font-semibold text-gray-800">Photo</p>
                      <p className="text-xs text-gray-500 mt-1">JPG/PNG photo of a printed product list (uses OCR)</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Column name hint */}
              <div>
                <p className="text-sm font-semibold text-gray-700 mb-2">Accepted column names in your file:</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {[
                    ['SKU Code', 'Item Code, SKU, Code, Barcode, ID'],
                    ['Product Name', 'Name, Description, Product, Item Name'],
                    ['Category', 'Category, Group, Type, Department'],
                    ['Stock', 'Stock, Cases, Qty, WH1, WH2'],
                  ].map(([col, aliases]) => (
                    <div key={col} className="bg-gray-50 rounded-lg p-2.5">
                      <span className="font-mono font-semibold text-blue-700">{col}</span>
                      <span className="text-gray-400"> → also accepts: </span>
                      <span className="text-gray-600">{aliases}</span>
                    </div>
                  ))}
                </div>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-700 text-sm">
                  {error}
                </div>
              )}

              {/* Upload button */}
              <div
                className="border-2 border-dashed border-blue-300 rounded-xl p-8 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors"
                onClick={() => fileRef.current?.click()}
              >
                <Upload size={32} className="mx-auto text-blue-400 mb-3" />
                <p className="font-semibold text-gray-700">Click to choose your file</p>
                <p className="text-sm text-gray-400 mt-1">Excel (.xlsx), PDF, JPG, PNG supported</p>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx,.xls,.xlsm,.pdf,.jpg,.jpeg,.png,.webp,.tiff,.tif"
                  className="hidden"
                  onChange={handleFile}
                />
              </div>

              {loading && (
                <div className="text-center text-gray-500 text-sm animate-pulse">
                  Parsing file… please wait
                </div>
              )}
            </div>
          )}

          {/* ── STAGE: preview ── */}
          {stage === 'preview' && parseResult && (
            <div className="space-y-4">
              {/* Summary bar */}
              <div className="flex items-center gap-4 bg-gray-50 rounded-xl px-4 py-3 text-sm">
                <div><span className="font-bold text-green-600">{parseResult.new_count}</span> <span className="text-gray-500">new</span></div>
                <div className="text-gray-300">|</div>
                <div><span className="font-bold text-orange-500">{parseResult.duplicate_count}</span> <span className="text-gray-500">duplicates (already exist)</span></div>
                <div className="text-gray-300">|</div>
                <div className="text-gray-500">from <span className="font-medium text-gray-700">{parseResult.filename}</span></div>
                <div className="ml-auto flex items-center gap-2">
                  <input type="checkbox" id="skip-dup" checked={skipDuplicates} onChange={e => setSkipDuplicates(e.target.checked)} />
                  <label htmlFor="skip-dup" className="text-gray-600 cursor-pointer">Skip duplicates</label>
                </div>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-700 text-sm">
                  {error}
                </div>
              )}

              {rows.length === 0 ? (
                <div className="text-center py-8 text-gray-400">No rows could be extracted from this file. Try a different format.</div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-gray-200">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold text-gray-600 w-8">
                          <input type="checkbox"
                            checked={rows.every(r => r._selected)}
                            onChange={e => setRows(prev => prev.map(r => ({ ...r, _selected: e.target.checked })))}
                          />
                        </th>
                        <th className="px-3 py-2 text-left font-semibold text-gray-600">SKU Code</th>
                        <th className="px-3 py-2 text-left font-semibold text-gray-600">Product Name</th>
                        <th className="px-3 py-2 text-left font-semibold text-gray-600">Category</th>
                        <th className="px-3 py-2 text-center font-semibold text-gray-600">Case Size</th>
                        <th className="px-3 py-2 text-left font-semibold text-gray-600">Unit Label</th>
                        <th className="px-3 py-2 text-center font-semibold text-gray-600">WH1</th>
                        <th className="px-3 py-2 text-center font-semibold text-gray-600">WH2</th>
                        <th className="px-3 py-2 text-center font-semibold text-gray-600">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row, idx) => (
                        <tr key={idx} className={`border-b ${row.status === 'duplicate' ? 'bg-orange-50' : 'hover:bg-gray-50'}`}>
                          <td className="px-3 py-1.5">
                            <input type="checkbox" checked={row._selected}
                              onChange={e => updateRow(idx, '_selected', e.target.checked)} />
                          </td>
                          <td className="px-3 py-1.5 font-mono text-xs text-blue-700 whitespace-nowrap">{row.sku_code}</td>
                          <td className="px-3 py-1.5">
                            <input
                              className="input text-xs py-1 px-2 w-full min-w-[180px]"
                              value={row.product_name}
                              onChange={e => updateRow(idx, 'product_name', e.target.value)}
                            />
                          </td>
                          <td className="px-3 py-1.5">
                            <select
                              className="input text-xs py-1 px-2 w-full min-w-[120px]"
                              value={row.category}
                              onChange={e => updateRow(idx, 'category', e.target.value)}
                            >
                              {categories.map(c => <option key={c}>{c}</option>)}
                              {!categories.includes(row.category) && row.category && (
                                <option>{row.category}</option>
                              )}
                            </select>
                          </td>
                          <td className="px-3 py-1.5 text-center">
                            <input
                              type="number" min="1"
                              className="input text-xs py-1 px-2 text-center w-16"
                              value={row.case_size}
                              onChange={e => updateRow(idx, 'case_size', e.target.value)}
                            />
                          </td>
                          <td className="px-3 py-1.5">
                            <input
                              className="input text-xs py-1 px-2 w-full min-w-[100px]"
                              value={row.unit_label}
                              onChange={e => updateRow(idx, 'unit_label', e.target.value)}
                            />
                          </td>
                          <td className="px-3 py-1.5 text-center">
                            <input
                              type="number" min="0"
                              className="input text-xs py-1 px-2 text-center w-16"
                              value={row.wh1_stock}
                              onChange={e => updateRow(idx, 'wh1_stock', e.target.value)}
                            />
                          </td>
                          <td className="px-3 py-1.5 text-center">
                            <input
                              type="number" min="0"
                              className="input text-xs py-1 px-2 text-center w-16"
                              value={row.wh2_stock}
                              onChange={e => updateRow(idx, 'wh2_stock', e.target.value)}
                            />
                          </td>
                          <td className="px-3 py-1.5 text-center">
                            {row.status === 'duplicate'
                              ? <span className="badge-warning text-xs">Duplicate</span>
                              : <span className="badge-ok text-xs">New</span>
                            }
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── STAGE: done ── */}
          {stage === 'done' && result && (
            <div className="space-y-4 py-4">
              <div className="flex flex-col items-center gap-3 text-center">
                <div className="p-4 bg-green-100 rounded-full">
                  <Check size={32} className="text-green-600" />
                </div>
                <h4 className="text-xl font-bold text-gray-900">Import Complete</h4>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-green-50 rounded-xl p-4 text-center">
                  <div className="text-3xl font-bold text-green-600">{result.created}</div>
                  <div className="text-sm text-green-700 mt-1">SKUs Created</div>
                </div>
                <div className="bg-orange-50 rounded-xl p-4 text-center">
                  <div className="text-3xl font-bold text-orange-500">{result.skipped}</div>
                  <div className="text-sm text-orange-700 mt-1">Skipped</div>
                </div>
                <div className="bg-red-50 rounded-xl p-4 text-center">
                  <div className="text-3xl font-bold text-red-500">{result.errors?.length || 0}</div>
                  <div className="text-sm text-red-700 mt-1">Errors</div>
                </div>
              </div>
              {result.errors?.length > 0 && (
                <div className="bg-red-50 rounded-xl p-3 text-xs text-red-700 space-y-1">
                  {result.errors.map((e, i) => <div key={i}><strong>{e.sku_code}:</strong> {e.error}</div>)}
                </div>
              )}
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 py-4 border-t border-gray-100 flex-shrink-0 bg-gray-50 rounded-b-2xl">
          {stage === 'pick' && (
            <>
              <button className="btn-secondary px-6" onClick={onClose}>Cancel</button>
              <div className="flex-1" />
              <p className="text-xs text-gray-400 self-center">Duplicates are detected by SKU Code</p>
            </>
          )}
          {stage === 'preview' && (
            <>
              <button className="btn-secondary" onClick={() => { setStage('pick'); setParseResult(null); setRows([]); setError('') }}>
                ← Back
              </button>
              <button
                className="btn-primary flex items-center gap-2 flex-1"
                onClick={handleConfirm}
                disabled={loading || newCount === 0}
              >
                <Check size={15} />
                {loading ? 'Importing…' : `Import ${newCount} SKU${newCount !== 1 ? 's' : ''}`}
              </button>
              <button className="btn-secondary px-5" onClick={onClose}>Cancel</button>
            </>
          )}
          {stage === 'done' && (
            <>
              <button
                className="btn-secondary"
                onClick={() => { setStage('pick'); setParseResult(null); setRows([]); setResult(null) }}
              >
                Upload Another
              </button>
              <button className="btn-primary flex-1" onClick={onClose}>Done</button>
            </>
          )}
        </div>

      </div>
    </div>
  )
}

const BACKEND = 'http://localhost:8000'

// ── SKU Form Modal ──────────────────────────────────────────────
function SKUFormModal({ form, editId, categories, vendors, bins, saving, onSet, onSubmit, onClose, onImageFileReady }) {
  const casePreview = form.case_size && form.unit_label
    ? `1 case = ${form.case_size} ${form.unit_label}`
    : null

  const imgRef = useRef(null)
  const [imgPreview, setImgPreview] = useState(
    form.image_url ? (form.image_url.startsWith('/static') ? BACKEND + form.image_url : form.image_url) : null
  )
  const [uploading, setUploading] = useState(false)
  const [binSearch, setBinSearch] = useState('')
  const [showBinDrop, setShowBinDrop] = useState(false)

  const handleImageFile = async (file) => {
    if (!file) return
    // Show local preview immediately
    const reader = new FileReader()
    reader.onload = e => setImgPreview(e.target.result)
    reader.readAsDataURL(file)
    if (editId) {
      // Edit mode: upload straight away
      setUploading(true)
      try {
        const r = await uploadAPI.productImage(editId, file)
        onSet('image_url', r.data.image_url)
      } catch {}
      setUploading(false)
    } else {
      // Create mode: hand the file to the parent for upload after SKU is saved
      onImageFileReady && onImageFileReady(file)
    }
  }

  const filteredBins = binSearch.trim()
    ? (bins || []).filter(b => b.code.toUpperCase().includes(binSearch.trim().toUpperCase()))
    : (bins || [])

  const selectedBin = (bins || []).find(b => b.id === form.bin_location_id)

  // Close on backdrop click
  const handleBackdrop = (e) => {
    if (e.target === e.currentTarget) onClose()
  }

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4"
      onClick={handleBackdrop}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[92vh]">

        {/* ── Fixed header ── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <h3 className="font-bold text-gray-900 text-lg">
              {editId ? 'Edit SKU' : 'New SKU'}
            </h3>
            {editId && (
              <p className="text-xs text-gray-400 mt-0.5 font-mono">{form.sku_code}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* ── Scrollable body ── */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

          {/* Identity */}
          <FormSection title="Product Identity">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">SKU Code *</label>
                <input
                  className="input font-mono uppercase"
                  placeholder="e.g. GAJS1"
                  value={form.sku_code}
                  onChange={e => onSet('sku_code', e.target.value)}
                  disabled={!!editId}
                />
                {!editId && <p className="text-xs text-gray-400 mt-1">Cannot be changed after creation</p>}
              </div>
              <div>
                <label className="label">Category *</label>
                <select className="input" value={form.category} onChange={e => onSet('category', e.target.value)}>
                  {categories.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Product Name (English) *</label>
                <input
                  className="input"
                  placeholder="e.g. GAZAB AJWAIN SEEDS 20x100G"
                  value={form.product_name}
                  onChange={e => onSet('product_name', e.target.value)}
                />
              </div>
              <div>
                <label className="label">Nombre (Español)</label>
                <input
                  className="input"
                  placeholder="optional"
                  value={form.name_es}
                  onChange={e => onSet('name_es', e.target.value)}
                />
              </div>
              <div className="col-span-2">
                <label className="label">Barcode (UPC / EAN-13)</label>
                <input
                  className="input font-mono"
                  placeholder="e.g. 012345678901 — scan or type"
                  value={form.barcode || ''}
                  onChange={e => onSet('barcode', e.target.value || null)}
                />
                <p className="text-xs text-gray-400 mt-1">Used for camera barcode scanning. Leave blank if unknown.</p>
              </div>
            </div>
          </FormSection>

          {/* Packaging */}
          <FormSection title="Packaging">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="label">How many units are in one case?</label>
                <div className="flex gap-2 items-center flex-wrap">
                  <span className="text-sm text-gray-500 whitespace-nowrap">1 case =</span>
                  <input
                    type="number" min="1"
                    className="input w-24 text-center font-bold"
                    value={form.case_size}
                    onChange={e => onSet('case_size', e.target.value)}
                  />
                  <input
                    list="unit-suggestions"
                    className="input w-44"
                    placeholder="e.g. 2lb bags, 100g packs…"
                    value={form.unit_label}
                    onChange={e => onSet('unit_label', e.target.value)}
                  />
                  <datalist id="unit-suggestions">
                    {UNIT_SUGGESTIONS.map(u => <option key={u} value={u} />)}
                  </datalist>
                  {casePreview && (
                    <span className="text-sm text-blue-600 font-medium bg-blue-50 px-3 py-1.5 rounded-lg whitespace-nowrap">
                      → {casePreview}
                    </span>
                  )}
                </div>
              </div>
              <div>
                <label className="label">
                  Pallet Size
                  <span className="ml-1 text-gray-400 font-normal text-xs">— cases per pallet</span>
                </label>
                <input
                  type="number" className="input" placeholder="blank if not palletised"
                  value={form.pallet_size} onChange={e => onSet('pallet_size', e.target.value)}
                />
              </div>
              <div>
                <label className="label">
                  Shelf Life (days)
                  <Tooltip text="Average days before this product expires. Set to 0 for non-perishable items." />
                </label>
                <input
                  type="number" min="0" className="input" placeholder="e.g. 365"
                  value={form.avg_shelf_life_days} onChange={e => onSet('avg_shelf_life_days', e.target.value)}
                />
                {parseInt(form.avg_shelf_life_days) === 0 && (
                  <p className="text-xs text-gray-400 mt-1">0 = non-perishable (no expiry tracking)</p>
                )}
              </div>

              {/* Show goods date on picking toggle */}
              <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-3">
                <input
                  type="checkbox"
                  id="show_goods_date"
                  className="mt-0.5 w-4 h-4 accent-amber-500 flex-shrink-0"
                  checked={!!form.show_goods_date_on_picking}
                  onChange={e => onSet('show_goods_date_on_picking', e.target.checked)}
                />
                <label htmlFor="show_goods_date" className="text-sm cursor-pointer">
                  <span className="font-semibold text-amber-800">Show goods date during picking</span>
                  <p className="text-xs text-amber-600 mt-0.5">
                    Display expiry / best-before dates on the picker's mobile screen so they can pick FEFO (First Expired First Out).
                  </p>
                </label>
              </div>

              {/* Require expiry date entry during picking */}
              <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-3">
                <input
                  type="checkbox"
                  id="require_expiry_entry"
                  className="mt-0.5 w-4 h-4 accent-red-500 flex-shrink-0"
                  checked={!!form.require_expiry_entry}
                  onChange={e => onSet('require_expiry_entry', e.target.checked)}
                />
                <label htmlFor="require_expiry_entry" className="text-sm cursor-pointer">
                  <span className="font-semibold text-red-800">Require expiry date entry during picking</span>
                  <p className="text-xs text-red-600 mt-0.5">
                    Picker must enter the best-before / expiry date for this product. The date will print on the customer invoice.
                  </p>
                </label>
              </div>
            </div>
          </FormSection>

          {/* Supplier */}
          <FormSection title="Supplier &amp; Costing">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Vendor / Supplier</label>
                <select className="input" value={form.vendor_id} onChange={e => onSet('vendor_id', e.target.value)}>
                  <option value="">No vendor assigned</option>
                  {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              </div>
              <div>
                <label className="label">
                  Lead Time (days)
                  <Tooltip text="Days from placing a purchase order to stock arriving. Used by forecasting to calculate when to reorder." />
                </label>
                <input
                  type="number" min="0" className="input" placeholder="e.g. 14"
                  value={form.lead_time_days} onChange={e => onSet('lead_time_days', e.target.value)}
                />
              </div>
              <div>
                <label className="label">
                  Cost Price (per case)
                  <Tooltip text="Default purchase cost per case. Auto-filled on Purchase Orders and used for QuickBooks invoice sync." />
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                  <input
                    type="number" min="0" step="0.01" className="input pl-7" placeholder="e.g. 12.50"
                    value={form.cost_price} onChange={e => onSet('cost_price', e.target.value)}
                  />
                </div>
                <p className="text-xs text-gray-400 mt-1">Leave blank if pricing varies per order</p>
              </div>
              <div>
                <label className="label">
                  Selling Price (per case)
                  <Tooltip text="Default customer-facing price shown in the Customer Portal when no price list is assigned." />
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                  <input
                    type="number" min="0" step="0.01" className="input pl-7" placeholder="e.g. 18.00"
                    value={form.selling_price ?? ''} onChange={e => onSet('selling_price', e.target.value)}
                  />
                </div>
                <p className="text-xs text-gray-400 mt-1">Shown in portal; overridden by price lists</p>
              </div>
            </div>
          </FormSection>

          {/* Stock Thresholds */}
          <FormSection title="Stock Thresholds">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="label">
                  Reorder Point
                  <Tooltip text="When stock drops to this level, SKU shows as Low Stock and appears on the reorder list." />
                </label>
                <div className="relative">
                  <input type="number" min="0" className="input pr-14"
                    value={form.reorder_point} onChange={e => onSet('reorder_point', e.target.value)} />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">cases</span>
                </div>
              </div>
              <div>
                <label className="label">
                  Reorder Qty
                  <Tooltip text="Suggested quantity to order when restocking." />
                </label>
                <div className="relative">
                  <input type="number" min="0" className="input pr-14"
                    value={form.reorder_qty} onChange={e => onSet('reorder_qty', e.target.value)} />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">cases</span>
                </div>
              </div>
              <div>
                <label className="label">
                  Max Stock
                  <Tooltip text="Maximum cases to hold. Helps avoid over-ordering." />
                </label>
                <div className="relative">
                  <input type="number" min="0" className="input pr-14"
                    value={form.max_stock} onChange={e => onSet('max_stock', e.target.value)} />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">cases</span>
                </div>
              </div>
            </div>
          </FormSection>

          {/* Product Image */}
          <FormSection title="Product Image">
            <div className="flex items-start gap-4">
              <div
                className="w-24 h-24 rounded-xl border-2 border-dashed border-gray-200 flex items-center justify-center bg-gray-50 flex-shrink-0 overflow-hidden cursor-pointer hover:border-blue-400 transition-colors relative"
                onClick={() => imgRef.current?.click()}
                title="Click to upload image"
              >
                {imgPreview ? (
                  <img src={imgPreview} alt="product" className="w-full h-full object-cover" />
                ) : (
                  <Image size={28} className="text-gray-300" />
                )}
                {uploading && (
                  <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
                    <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-600 mb-2">Upload a product photo (JPG, PNG, WEBP).</p>
                <button
                  type="button"
                  onClick={() => imgRef.current?.click()}
                  className="btn-secondary flex items-center gap-2 text-sm"
                  disabled={uploading}
                >
                  <Upload size={14} /> {imgPreview ? 'Change Image' : 'Upload Image'}
                </button>
                {!editId && imgPreview && (
                  <p className="text-xs text-blue-600 mt-1">Image will be uploaded when you save the SKU.</p>
                )}
                <input
                  ref={imgRef} type="file" accept="image/*" className="hidden"
                  onChange={e => handleImageFile(e.target.files?.[0])}
                />
              </div>
            </div>
          </FormSection>

          {/* Opening Stock — add mode only */}
          {!editId && (
            <FormSection title="Opening Stock (optional)">
              <p className="text-xs text-gray-500 -mt-1">
                If this product already has stock on the shelf, enter the current quantity. You can always adjust later.
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">WH1 — Main Warehouse</label>
                  <div className="relative">
                    <input type="number" min="0" className="input pr-14" placeholder="0"
                      value={form.initial_wh1} onChange={e => onSet('initial_wh1', e.target.value)} />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">cases</span>
                  </div>
                </div>
                <div>
                  <label className="label">WH2 — Overflow / Receiving</label>
                  <div className="relative">
                    <input type="number" min="0" className="input pr-14" placeholder="0"
                      value={form.initial_wh2} onChange={e => onSet('initial_wh2', e.target.value)} />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">cases</span>
                  </div>
                </div>
                <div className="col-span-2">
                  <label className="label">
                    <MapPin size={12} className="inline mr-1 text-indigo-500" />
                    Bin Location <span className="font-normal text-gray-400">(optional — assigned to WH1)</span>
                  </label>
                  <div className="relative">
                    <input
                      value={selectedBin ? selectedBin.code : binSearch}
                      onChange={e => {
                        setBinSearch(e.target.value)
                        onSet('bin_location_id', '')
                        setShowBinDrop(true)
                      }}
                      onFocus={() => setShowBinDrop(true)}
                      placeholder="Type to search bins…"
                      className="input font-mono"
                    />
                    {selectedBin && (
                      <button type="button"
                        onClick={() => { onSet('bin_location_id', ''); setBinSearch(''); setShowBinDrop(false) }}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-red-400">
                        <X size={14} />
                      </button>
                    )}
                    {showBinDrop && !selectedBin && filteredBins.length > 0 && (
                      <div className="absolute z-30 top-full mt-1 left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-xl max-h-44 overflow-y-auto">
                        {filteredBins.slice(0, 50).map(b => (
                          <button key={b.id} type="button"
                            onMouseDown={() => { onSet('bin_location_id', b.id); setBinSearch(''); setShowBinDrop(false) }}
                            className="w-full text-left px-3 py-2 text-xs font-mono hover:bg-indigo-50 text-gray-700 flex items-center justify-between">
                            <span>{b.code}</span>
                            <span className="text-gray-400">{b.sku_count} SKUs</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {!bins?.length && <p className="text-xs text-gray-400 mt-1">No bins set up yet — create them in Bin Locations first.</p>}
                </div>
              </div>
            </FormSection>
          )}

        </div>

        {/* ── Fixed footer ── */}
        <div className="flex gap-3 px-6 py-4 border-t border-gray-100 flex-shrink-0 bg-gray-50 rounded-b-2xl">
          <button
            className="btn-primary flex items-center gap-2 flex-1"
            onClick={onSubmit}
            disabled={saving}
          >
            <Check size={15} />
            {saving ? 'Saving…' : (editId ? 'Save Changes' : 'Create SKU')}
          </button>
          <button className="btn-secondary px-6" onClick={onClose}>
            Cancel
          </button>
        </div>

      </div>
    </div>
  )
}

// ── Main SKU Master page ────────────────────────────────────────
export default function SKUs({ lang }) {
  const t = useT(lang)
  const [skus, setSkus] = useState([])
  const [vendors, setVendors] = useState([])
  const [categories, setCategories] = useState([])
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [confirm, setConfirm] = useState(null)
  const [adjustRow, setAdjustRow] = useState(null)
  const [toast, setToast] = useState(null)
  const [saving, setSaving] = useState(false)
  const [showBulkUpload, setShowBulkUpload] = useState(false)
  const [selectedIds, setSelectedIds] = useState(new Set())

  const [form, setForm] = useState({ ...BLANK_FORM })
  const [bins, setBins] = useState([])
  const pendingImgFileRef = useRef(null)

  const toggleSelect = (id) => setSelectedIds(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })
  const toggleAll = (ids) => setSelectedIds(prev => prev.size === ids.length ? new Set() : new Set(ids))

  const printSelectedLabels = () => {
    if (selectedIds.size === 0) return
    window.open(labelAPI.skusUrl([...selectedIds]), '_blank')
  }
  const printSingleLabel = (skuId) => window.open(labelAPI.skuUrl(skuId), '_blank')

  const load = () => {
    if (!skus.length) setLoading(true)
    const params = {}
    if (search) params.search = search
    if (category) params.category = category
    skuAPI.list(params).then(r => { setSkus(r.data); setLoading(false) })
  }

  useEffect(() => {
    vendorAPI.list().then(r => setVendors(r.data))
    skuAPI.categories().then(r => setCategories(r.data))
    API.get('/bin-locations?active_only=true').then(r => setBins(r.data)).catch(() => {})
  }, [])

  useEffect(() => { load() }, [search, category])

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 3000) }

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }))

  const closeForm = () => { setShowForm(false); setEditId(null); setForm({ ...BLANK_FORM }); pendingImgFileRef.current = null }

  const handleSubmit = async () => {
    if (!form.sku_code.trim()) return alert('SKU Code is required')
    if (!form.product_name.trim()) return alert('Product Name is required')

    setSaving(true)
    const data = {
      sku_code: form.sku_code.trim().toUpperCase(),
      barcode: form.barcode?.trim() || null,
      product_name: form.product_name.trim(),
      name_es: form.name_es?.trim() || null,
      category: form.category,
      case_size: parseInt(form.case_size) || 1,
      pallet_size: form.pallet_size !== '' && form.pallet_size !== null ? parseInt(form.pallet_size) : null,
      unit_label: form.unit_label || 'units',
      avg_shelf_life_days: parseInt(form.avg_shelf_life_days) || 0,
      reorder_point: parseInt(form.reorder_point) || 0,
      reorder_qty: parseInt(form.reorder_qty) || 0,
      max_stock: parseInt(form.max_stock) || 0,
      lead_time_days: parseInt(form.lead_time_days) || 7,
      vendor_id: form.vendor_id ? parseInt(form.vendor_id) : null,
      cost_price:    form.cost_price    !== '' && form.cost_price    !== null ? parseFloat(form.cost_price)    : null,
      selling_price: form.selling_price !== '' && form.selling_price !== null ? parseFloat(form.selling_price) : null,
      show_goods_date_on_picking: !!form.show_goods_date_on_picking,
      require_expiry_entry: !!form.require_expiry_entry,
    }

    try {
      if (editId) {
        await skuAPI.update(editId, data)
        showToast('✅ SKU updated')
      } else {
        const res = await skuAPI.create(data)
        const newSkuId = res.data.id
        const wh1 = parseInt(form.initial_wh1) || 0
        const wh2 = parseInt(form.initial_wh2) || 0
        if (wh1 > 0) await settingsAPI.adjustInventory({ sku_id: newSkuId, warehouse: 'WH1', new_qty: wh1, reason: 'Initial stock entry' })
        if (wh2 > 0) await settingsAPI.adjustInventory({ sku_id: newSkuId, warehouse: 'WH2', new_qty: wh2, reason: 'Initial stock entry' })
        // Upload pending product image
        if (pendingImgFileRef.current) {
          try { await uploadAPI.productImage(newSkuId, pendingImgFileRef.current) } catch {}
          pendingImgFileRef.current = null
        }
        // Assign bin location to WH1 inventory
        if (form.bin_location_id && wh1 > 0) {
          try {
            const invRes = await inventoryAPI.list({ search: data.sku_code })
            const inv = invRes.data.find(i => i.sku_id === newSkuId && i.warehouse === 'WH1')
            if (inv) await API.post('/bin-locations/assign', { inventory_id: inv.id, bin_location_id: form.bin_location_id })
          } catch {}
        }
        showToast('✅ SKU created' + (wh1 + wh2 > 0 ? ` with ${wh1 + wh2} cases opening stock` : ''))
      }
      closeForm()
      load()
    } catch (e) {
      alert('Error: ' + (e.response?.data?.detail || e.message))
    }
    setSaving(false)
  }

  const startEdit = (sku) => {
    setForm({ ...BLANK_FORM, ...sku, vendor_id: sku.vendor_id || '', pallet_size: sku.pallet_size ?? '', cost_price: sku.cost_price ?? '', selling_price: sku.selling_price ?? '', show_goods_date_on_picking: sku.show_goods_date_on_picking ?? false, require_expiry_entry: sku.require_expiry_entry ?? false })
    setEditId(sku.id)
    setShowForm(true)
  }

  const handleDelete = (sku) => {
    if (sku.total_cases > 0) {
      alert(`Cannot delete "${sku.product_name}" — it still has ${sku.total_cases} cases in stock. Zero out the stock first.`)
      return
    }
    setConfirm({
      message: `Permanently delete "${sku.product_name}" (${sku.sku_code})? This cannot be undone.`,
      onConfirm: async () => {
        try {
          await settingsAPI.deleteSKU(sku.id)
          setConfirm(null)
          showToast(`🗑 ${sku.product_name} deleted`)
          load()
        } catch (e) {
          alert(e.response?.data?.detail || e.message)
          setConfirm(null)
        }
      },
      onCancel: () => setConfirm(null)
    })
  }

  const stockBadge = (total, reorder) => {
    if (total === 0) return <span className="badge-danger">Stockout</span>
    if (total <= reorder) return <span className="badge-warning">Low</span>
    return <span className="badge-ok">OK</span>
  }

  return (
    <div className="space-y-6">

      {/* Modals */}
      {confirm && <ConfirmDialog {...confirm} />}
      {adjustRow && (
        <AdjustModal
          row={adjustRow}
          onClose={() => setAdjustRow(null)}
          onSaved={() => { setAdjustRow(null); load(); showToast('✅ Stock adjusted') }}
        />
      )}
      {showForm && (
        <SKUFormModal
          form={form}
          editId={editId}
          categories={categories}
          vendors={vendors}
          bins={bins}
          saving={saving}
          onSet={set}
          onSubmit={handleSubmit}
          onClose={closeForm}
          onImageFileReady={(f) => { pendingImgFileRef.current = f }}
        />
      )}
      {showBulkUpload && (
        <BulkUploadModal
          categories={categories}
          onClose={() => setShowBulkUpload(false)}
          onImported={() => { load(); showToast('✅ SKUs imported successfully') }}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 bg-gray-900 text-white text-sm px-4 py-3 rounded-xl shadow-lg">
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <h2 className="text-2xl font-bold text-gray-900">{t('skuMaster')}</h2>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            className="btn-secondary flex items-center gap-2"
            onClick={() => setShowBulkUpload(true)}
          >
            <Upload size={15} /> Upload Bulk SKUs
          </button>
          {selectedIds.size > 0 && (
            <button
              className="btn-secondary flex items-center gap-2 border-blue-300 text-blue-700 hover:bg-blue-50"
              onClick={printSelectedLabels}
            >
              <Printer size={15} /> Print {selectedIds.size} Label{selectedIds.size !== 1 ? 's' : ''}
            </button>
          )}
          <button
            className="btn-primary flex items-center gap-2"
            onClick={() => { setForm({ ...BLANK_FORM }); setEditId(null); setShowForm(true) }}
          >
            <Plus size={16} /> Add SKU
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="card py-3">
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input className="input pl-9" placeholder={t('search')} value={search}
              onChange={e => setSearch(e.target.value)} />
          </div>
          <select className="input w-44" value={category} onChange={e => setCategory(e.target.value)}>
            <option value="">All Categories</option>
            {categories.map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px]">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="table-th w-8 text-center">
                  <input
                    type="checkbox"
                    checked={skus.length > 0 && selectedIds.size === skus.length}
                    onChange={() => toggleAll(skus.map(s => s.id))}
                    title="Select all"
                  />
                </th>
                <th className="table-th">SKU / Product</th>
                <th className="table-th">Category</th>
                <th className="table-th text-center">
                  <span>Case</span>
                  <span className="block text-xs font-normal text-gray-400 leading-none">contents</span>
                </th>
                <th className="table-th text-center">
                  <span>Pallet</span>
                  <span className="block text-xs font-normal text-gray-400 leading-none">cases</span>
                </th>
                <th className="table-th text-center">
                  <span>WH1</span>
                  <span className="block text-xs font-normal text-gray-400 leading-none">cases</span>
                </th>
                <th className="table-th text-center">
                  <span>WH2</span>
                  <span className="block text-xs font-normal text-gray-400 leading-none">cases</span>
                </th>
                <th className="table-th text-center">Total</th>
                <th className="table-th text-center">Reorder At</th>
                <th className="table-th">{t('status')}</th>
                <th className="table-th">Vendor</th>
                <th className="table-th text-right">
                  <span>Cost</span>
                  <span className="block text-xs font-normal text-gray-400 leading-none">per case</span>
                </th>
                <th className="table-th text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={12} className="table-td text-center py-8 text-gray-400">{t('loading')}</td></tr>
              ) : skus.length === 0 ? (
                <tr><td colSpan={12} className="table-td text-center py-8 text-gray-400">{t('noData')}</td></tr>
              ) : skus.map(sku => (
                <tr key={sku.id} className={`border-b hover:bg-gray-50 ${selectedIds.has(sku.id) ? 'bg-blue-50' : ''}`}>
                  <td className="table-td text-center">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(sku.id)}
                      onChange={() => toggleSelect(sku.id)}
                    />
                  </td>
                  <td className="table-td">
                    <div className="flex items-center gap-2">
                      {sku.image_url ? (
                        <img src={BACKEND + sku.image_url} alt="" className="w-9 h-9 rounded-lg object-cover flex-shrink-0 border border-gray-100" />
                      ) : (
                        <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                          <Image size={14} className="text-gray-300" />
                        </div>
                      )}
                      <div>
                        <div className="font-mono text-xs text-blue-700 font-medium">{sku.sku_code}</div>
                        <div className="font-medium text-gray-900">{sku.product_name}</div>
                        {lang === 'es' && sku.name_es && <div className="text-xs text-gray-400">{sku.name_es}</div>}
                      </div>
                    </div>
                  </td>
                  <td className="table-td"><span className="badge-neutral">{sku.category}</span></td>
                  <td className="table-td text-center text-gray-600 text-sm">{sku.case_size} {sku.unit_label}</td>
                  <td className="table-td text-center text-gray-500">
                    {sku.pallet_size ? sku.pallet_size : <span className="text-gray-300">—</span>}
                  </td>

                  {/* WH1 with adjust button */}
                  <td className="table-td text-center">
                    <div className="flex items-center justify-center gap-1">
                      <span className={`font-medium ${sku.wh1_cases === 0 ? 'text-red-400' : 'text-gray-900'}`}>
                        {sku.wh1_cases}
                      </span>
                      <button
                        onClick={() => setAdjustRow({ sku_id: sku.sku_id ?? sku.id, sku_code: sku.sku_code, product_name: sku.product_name, warehouse: 'WH1', current: sku.wh1_cases })}
                        className="p-1 text-gray-300 hover:text-orange-500 hover:bg-orange-50 rounded transition-colors"
                        title="Adjust WH1 stock"
                      >
                        <SlidersHorizontal size={12} />
                      </button>
                    </div>
                  </td>

                  {/* WH2 with adjust button */}
                  <td className="table-td text-center">
                    <div className="flex items-center justify-center gap-1">
                      <span className="font-medium text-blue-700">{sku.wh2_cases}</span>
                      <button
                        onClick={() => setAdjustRow({ sku_id: sku.sku_id ?? sku.id, sku_code: sku.sku_code, product_name: sku.product_name, warehouse: 'WH2', current: sku.wh2_cases })}
                        className="p-1 text-gray-300 hover:text-orange-500 hover:bg-orange-50 rounded transition-colors"
                        title="Adjust WH2 stock"
                      >
                        <SlidersHorizontal size={12} />
                      </button>
                    </div>
                  </td>

                  <td className="table-td text-center font-bold">{sku.total_cases}</td>
                  <td className="table-td text-center text-gray-500">{sku.reorder_point}</td>
                  <td className="table-td">{stockBadge(sku.total_cases, sku.reorder_point)}</td>
                  <td className="table-td text-gray-500 text-xs">{sku.vendor_name || '—'}</td>
                  <td className="table-td text-right text-gray-700 font-mono text-xs">
                    {sku.cost_price != null ? `$${sku.cost_price.toFixed(2)}` : '—'}
                  </td>

                  {/* Print + Edit + Delete */}
                  <td className="table-td">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => printSingleLabel(sku.id)}
                        className="p-1.5 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                        title="Print barcode label"
                      >
                        <Tag size={14} />
                      </button>
                      <button
                        onClick={() => startEdit(sku)}
                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="Edit SKU details"
                      >
                        <Edit2 size={15} />
                      </button>
                      <button
                        onClick={() => handleDelete(sku)}
                        className={`p-1.5 rounded-lg transition-colors ${
                          sku.total_cases > 0
                            ? 'text-gray-200 cursor-not-allowed'
                            : 'text-gray-400 hover:text-red-600 hover:bg-red-50'
                        }`}
                        title={sku.total_cases > 0 ? `Can't delete — ${sku.total_cases} cases in stock` : 'Delete SKU'}
                        disabled={sku.total_cases > 0}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-3 bg-gray-50 border-t text-sm text-gray-500">
          {skus.length} SKUs
        </div>
      </div>
    </div>
  )
}
