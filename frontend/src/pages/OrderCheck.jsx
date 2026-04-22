import { useState, useRef, useCallback, useMemo } from 'react'
import { orderCheckAPI } from '../api/client'
import {
  Camera, CheckCircle2, XCircle, AlertTriangle, Package,
  ChevronRight, ChevronLeft, Loader2, Save, RotateCcw,
  ClipboardList, Eye, History, Plus, Trash2,
} from 'lucide-react'

// ── Image helpers ─────────────────────────────────────────────

/** Resize + compress image to max 1024px, returns {base64, mime} */
async function compressImage(file, maxPx = 1024, quality = 0.82) {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height))
      const w = Math.round(img.width  * scale)
      const h = Math.round(img.height * scale)
      const canvas = document.createElement('canvas')
      canvas.width  = w
      canvas.height = h
      canvas.getContext('2d').drawImage(img, 0, 0, w, h)
      const dataUrl = canvas.toDataURL('image/jpeg', quality)
      const base64  = dataUrl.split(',')[1]
      resolve({ base64, mime: 'image/jpeg' })
    }
    img.src = URL.createObjectURL(file)
  })
}

// ── Result badges ─────────────────────────────────────────────

const Badge = ({ type, count }) => {
  const styles = {
    matched: 'bg-green-100 text-green-800 border-green-200',
    missing: 'bg-red-100  text-red-800  border-red-200',
    extra:   'bg-orange-100 text-orange-800 border-orange-200',
    manual:  'bg-gray-100 text-gray-700 border-gray-200',
  }
  const labels = { matched: '✅ Correct', missing: '❌ Missing', extra: '⚠️ Wrong item', manual: '⬜ Manual' }
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded border ${styles[type]}`}>
      {labels[type]} {count}
    </span>
  )
}

// ── Photo capture card ────────────────────────────────────────

function PhotoCapture({ label, hint, photos, onAdd, onRemove, maxPhotos = 4 }) {
  const inputRef = useRef()
  const handleFiles = async (e) => {
    const files = Array.from(e.target.files)
    for (const f of files) {
      if (photos.length >= maxPhotos) break
      const { base64, mime } = await compressImage(f)
      onAdd({ base64, mime, preview: URL.createObjectURL(f) })
    }
    e.target.value = ''
  }
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-semibold text-gray-800">{label}</p>
          {hint && <p className="text-xs text-gray-400">{hint}</p>}
        </div>
        {photos.length < maxPhotos && (
          <button
            onClick={() => inputRef.current?.click()}
            className="flex items-center gap-1.5 btn-primary text-sm py-1.5 px-3"
          >
            <Camera size={15} /> {photos.length === 0 ? 'Take Photo' : 'Add Another'}
          </button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        className="hidden"
        onChange={handleFiles}
      />
      {photos.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {photos.map((p, i) => (
            <div key={i} className="relative rounded-lg overflow-hidden border border-gray-200 aspect-video">
              <img src={p.preview} alt="" className="w-full h-full object-cover" />
              <button
                onClick={() => onRemove(i)}
                className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-0.5"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── History view ──────────────────────────────────────────────

function HistoryView({ onBack }) {
  const [records, setRecords]   = useState(null)
  const [selected, setSelected] = useState(null)
  const [detail, setDetail]     = useState(null)

  useState(() => {
    orderCheckAPI.history().then(r => setRecords(r.data)).catch(() => setRecords([]))
  }, [])

  const openDetail = async (id) => {
    setSelected(id)
    const r = await orderCheckAPI.get(id)
    setDetail(r.data)
  }

  if (detail) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <button onClick={() => setDetail(null)} className="btn-secondary py-1.5 px-3 text-sm">
            <ChevronLeft size={14} className="inline" /> Back
          </button>
          <div>
            <p className="font-bold">{detail.order_ref || 'Order Check'}</p>
            <p className="text-xs text-gray-400">
              {detail.checker_name} · {new Date(detail.created_at).toLocaleString()}
            </p>
          </div>
        </div>
        <ResultsView
          matched={detail.matched}
          missing={detail.missing}
          extra={detail.extra}
          manualItems={detail.manual_items}
          notes={detail.notes}
          readOnly
        />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="btn-secondary py-1.5 px-3 text-sm">
          <ChevronLeft size={14} className="inline" /> Back
        </button>
        <h3 className="font-bold text-gray-900">Check History</h3>
      </div>
      {records === null ? (
        <div className="text-center py-12 text-gray-400"><Loader2 size={24} className="animate-spin mx-auto" /></div>
      ) : records.length === 0 ? (
        <div className="card text-center text-gray-400 py-12">No checks yet</div>
      ) : (
        <div className="space-y-2">
          {records.map(r => (
            <div
              key={r.id}
              onClick={() => openDetail(r.id)}
              className="card flex items-center justify-between cursor-pointer hover:bg-gray-50 py-3"
            >
              <div>
                <p className="font-medium">{r.order_ref || `Check #${r.id}`}</p>
                <p className="text-xs text-gray-400">
                  {r.checker_name} · {new Date(r.created_at).toLocaleString()}
                </p>
                <div className="flex gap-1.5 mt-1">
                  <Badge type="matched" count={r.matched_count} />
                  {r.missing_count > 0 && <Badge type="missing" count={r.missing_count} />}
                  {r.extra_count   > 0 && <Badge type="extra"   count={r.extra_count}   />}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {r.has_issues
                  ? <AlertTriangle size={18} className="text-orange-500" />
                  : <CheckCircle2  size={18} className="text-green-500"  />
                }
                <ChevronRight size={16} className="text-gray-300" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Results view (shared by check flow + history detail) ──────

function ResultsView({ matched, missing, extra, manualItems, setManualItems, notes, setNotes, readOnly }) {
  const Section = ({ title, items, color, icon, emptyMsg, renderItem }) => (
    <div>
      <div className={`flex items-center gap-2 px-4 py-2 rounded-t-lg font-semibold text-sm ${color}`}>
        {icon} {title} ({items.length})
      </div>
      <div className="border border-t-0 rounded-b-lg divide-y">
        {items.length === 0
          ? <p className="px-4 py-3 text-sm text-gray-400">{emptyMsg}</p>
          : items.map((item, i) => (
            <div key={i} className="px-4 py-2.5 text-sm">
              {renderItem(item, i)}
            </div>
          ))
        }
      </div>
    </div>
  )

  return (
    <div className="space-y-4">
      {/* Correct picks */}
      <Section
        title="✅ Correct Picks"
        items={matched}
        color="bg-green-50 text-green-800"
        icon={<CheckCircle2 size={15} />}
        emptyMsg="No items matched"
        renderItem={(item) => (
          <div>
            <span className="font-medium">{item.order_name || item.name}</span>
            {item.floor_name && item.floor_name !== item.order_name && (
              <span className="text-gray-400 text-xs ml-2">→ {item.floor_name}</span>
            )}
            {item.qty && <span className="text-xs text-gray-500 ml-2">× {item.qty}</span>}
          </div>
        )}
      />

      {/* Missing items */}
      <Section
        title="❌ Missing — Not Found on Floor"
        items={missing}
        color="bg-red-50 text-red-800"
        icon={<XCircle size={15} />}
        emptyMsg="Nothing missing — all order items found ✓"
        renderItem={(item) => (
          <div>
            <span className="font-medium text-red-700">{item.name || item.order_name}</span>
            {item.code && <span className="text-xs text-gray-400 ml-2">({item.code})</span>}
            {item.qty  && <span className="text-xs text-gray-500 ml-2">× {item.qty}</span>}
            <p className="text-xs text-red-400 mt-0.5">Short pick or not in photos</p>
          </div>
        )}
      />

      {/* WRONG items — not in order */}
      <Section
        title="⚠️ Wrong Item — NOT in Order"
        items={extra}
        color="bg-orange-50 text-orange-900"
        icon={<AlertTriangle size={15} />}
        emptyMsg="No extra items — nothing wrong picked ✓"
        renderItem={(item) => (
          <div>
            <span className="font-medium text-orange-800">{item.name || item.floor_name}</span>
            {item.brand && <span className="text-xs text-gray-400 ml-2">({item.brand})</span>}
            <p className="text-xs text-orange-500 font-medium mt-0.5">
              This item is NOT on the order — wrong pick or wrong order mixed in
            </p>
          </div>
        )}
      />

      {/* Manual items — no box */}
      {!readOnly && (
        <div>
          <div className="flex items-center gap-2 px-4 py-2 rounded-t-lg font-semibold text-sm bg-gray-100 text-gray-700">
            <Package size={15} /> Items Without Boxes — Confirm Manually ({manualItems.length})
          </div>
          <div className="border border-t-0 rounded-b-lg p-3 space-y-2">
            <p className="text-xs text-gray-400">Tap ✓ to confirm each loose item you can see on the floor.</p>
            {manualItems.map((item, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={item.confirmed}
                  onChange={() => {
                    const updated = [...manualItems]
                    updated[i] = { ...item, confirmed: !item.confirmed }
                    setManualItems(updated)
                  }}
                  className="w-4 h-4 accent-green-600"
                />
                <input
                  value={item.name}
                  onChange={(e) => {
                    const updated = [...manualItems]
                    updated[i].name = e.target.value
                    setManualItems(updated)
                  }}
                  className="input text-sm py-1 flex-1"
                  placeholder="Item name / code"
                />
                <button onClick={() => setManualItems(manualItems.filter((_, j) => j !== i))}>
                  <Trash2 size={14} className="text-red-400" />
                </button>
              </div>
            ))}
            <button
              onClick={() => setManualItems([...manualItems, { name: '', confirmed: false }])}
              className="text-sm text-blue-600 flex items-center gap-1 mt-1"
            >
              <Plus size={13} /> Add item without box
            </button>
          </div>
        </div>
      )}

      {readOnly && manualItems?.length > 0 && (
        <Section
          title="⬜ Manually Confirmed (no box)"
          items={manualItems.filter(i => i.confirmed)}
          color="bg-gray-50 text-gray-700"
          icon={<Package size={15} />}
          emptyMsg="None confirmed"
          renderItem={(item) => <span className="text-gray-700">{item.name}</span>}
        />
      )}

      {/* Notes */}
      {!readOnly ? (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
          <textarea
            className="input w-full text-sm"
            rows={2}
            placeholder="e.g. 2 cases KBAS5 short — customer notified, backorder raised"
            value={notes}
            onChange={e => setNotes(e.target.value)}
          />
        </div>
      ) : notes ? (
        <div className="card bg-yellow-50 border border-yellow-200 text-sm text-yellow-800">
          <strong>Notes:</strong> {notes}
        </div>
      ) : null}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────

export default function OrderCheck() {
  const [view, setView]             = useState('main')  // main | check | history
  const [step, setStep]             = useState(1)       // 1=order photo, 2=box photos, 3=results, 4=done

  // Photos + live scan results
  // orderPhotos entries: { base64, mime, preview, id }
  const [orderPhotos,      setOrderPhotos]      = useState([])
  // orderScanResults: { [photoId]: { status: 'scanning'|'done'|'error', items, error } }
  const [orderScanResults, setOrderScanResults] = useState({})
  const [boxPhotos,        setBoxPhotos]        = useState([])
  const orderInputRef = useRef()

  // Analysis results
  const [analyzing, setAnalyzing]   = useState(false)
  const [analyzeError, setAnalyzeError] = useState(null)
  const [results, setResults]       = useState(null)

  // Post-analysis state
  const [manualItems, setManualItems] = useState([])
  const [notes, setNotes]             = useState('')
  const [orderRef, setOrderRef]       = useState('')
  const [saving, setSaving]           = useState(false)
  const [savedId, setSavedId]         = useState(null)

  const reset = () => {
    setStep(1); setOrderPhotos([]); setOrderScanResults({}); setBoxPhotos([])
    setResults(null); setAnalyzeError(null)
    setManualItems([]); setNotes(''); setOrderRef(''); setSavedId(null)
  }

  // ── Per-page live scanning ────────────────────────────────

  /** Add an order page photo and immediately scan it. */
  const handleAddOrderPhoto = useCallback(async (file) => {
    const { base64, mime } = await compressImage(file)
    const preview = URL.createObjectURL(file)
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const photo = { base64, mime, preview, id }

    setOrderPhotos(prev => [...prev, photo])
    setOrderScanResults(prev => ({ ...prev, [id]: { status: 'scanning', items: [], error: null } }))

    // Kick off background scan — page_num is approximate (used only for prompt context)
    setOrderPhotos(prev => {
      const pageNum = prev.length  // prev already includes the new photo
      orderCheckAPI.scanPage({ photo: base64, mime, page_num: pageNum })
        .then(resp => {
          setOrderScanResults(p => ({ ...p, [id]: { status: 'done', items: resp.data.items, error: null } }))
        })
        .catch(err => {
          const msg = err?.response?.data?.detail || err.message || 'Scan failed'
          setOrderScanResults(p => ({ ...p, [id]: { status: 'error', items: [], error: msg } }))
        })
      return prev  // no state change, just side-effect
    })
  }, [])

  const handleOrderPhotoFiles = useCallback(async (e) => {
    const files = Array.from(e.target.files)
    for (const f of files) {
      if (orderPhotos.length >= 6) break
      await handleAddOrderPhoto(f)
    }
    e.target.value = ''
  }, [orderPhotos.length, handleAddOrderPhoto])

  const handleRemoveOrderPhoto = useCallback((i) => {
    setOrderPhotos(prev => {
      const id = prev[i]?.id
      if (id) setOrderScanResults(p => { const n = { ...p }; delete n[id]; return n })
      return prev.filter((_, j) => j !== i)
    })
  }, [])

  /** Consolidated deduplicated items from all completed scans. */
  const allOrderItems = useMemo(() => {
    const flat = orderPhotos.flatMap(p => orderScanResults[p.id]?.items || [])
    const merged = {}
    for (const item of flat) {
      const key = `${(item.name || '').toLowerCase().trim().slice(0, 40)}|${(item.code || '').toLowerCase().trim()}`
      if (merged[key]) merged[key] = { ...merged[key], qty: (merged[key].qty || 1) + (item.qty || 1) }
      else merged[key] = { ...item }
    }
    return Object.values(merged)
  }, [orderPhotos, orderScanResults])

  const allScansComplete =
    orderPhotos.length > 0 &&
    orderPhotos.every(p => {
      const s = orderScanResults[p.id]
      return s && (s.status === 'done' || s.status === 'error')
    })

  const analyze = async () => {
    setAnalyzing(true)
    setAnalyzeError(null)
    try {
      const resp = await orderCheckAPI.analyze({
        order_photos:           orderPhotos.map(p => p.base64),
        order_photos_mime:      orderPhotos.map(p => p.mime),
        order_items_prefetched: allOrderItems,   // skip re-scanning — already done in Step 1
        box_photos:             boxPhotos.map(p => p.base64),
        box_photos_mime:        boxPhotos.map(p => p.mime),
      })
      setResults(resp.data)
      setStep(3)
    } catch (err) {
      const msg = err?.response?.data?.detail || err.message || 'Analysis failed'
      setAnalyzeError(msg)
    } finally {
      setAnalyzing(false)
    }
  }

  const save = async () => {
    setSaving(true)
    try {
      const resp = await orderCheckAPI.save({
        order_ref:    orderRef || null,
        order_photos: orderPhotos.map(p => p.base64),
        box_photos:   boxPhotos.map(p => p.base64),
        matched:      results.matched,
        missing:      results.missing,
        extra:        results.extra,
        manual_items: manualItems,
        notes:        notes || null,
      })
      setSavedId(resp.data.id)
      setStep(4)
    } catch (err) {
      alert('Save failed: ' + (err?.response?.data?.detail || err.message))
    } finally {
      setSaving(false)
    }
  }

  if (view === 'history') return <HistoryView onBack={() => setView('main')} />

  // ── Step 4: Done ──────────────────────────────────────────
  if (step === 4) {
    const hasIssues = results.missing.length > 0 || results.extra.length > 0
    return (
      <div className="space-y-6">
        <div className={`card text-center py-8 ${hasIssues ? 'bg-orange-50 border border-orange-200' : 'bg-green-50 border border-green-200'}`}>
          {hasIssues
            ? <AlertTriangle size={40} className="mx-auto text-orange-500 mb-3" />
            : <CheckCircle2  size={40} className="mx-auto text-green-500 mb-3"  />
          }
          <h3 className="text-xl font-bold text-gray-900 mb-1">
            {hasIssues ? 'Issues Found — Record Saved' : 'All Good — Record Saved ✓'}
          </h3>
          <p className="text-sm text-gray-500 mb-4">Check #{savedId}</p>
          <div className="flex justify-center gap-2 flex-wrap">
            <Badge type="matched" count={results.matched.length} />
            {results.missing.length > 0 && <Badge type="missing" count={results.missing.length} />}
            {results.extra.length   > 0 && <Badge type="extra"   count={results.extra.length}   />}
          </div>
        </div>
        <div className="flex gap-3">
          <button onClick={reset} className="btn-primary flex-1 flex items-center justify-center gap-2">
            <Plus size={15} /> New Check
          </button>
          <button onClick={() => setView('history')} className="btn-secondary flex-1 flex items-center justify-center gap-2">
            <History size={15} /> View History
          </button>
        </div>
      </div>
    )
  }

  // ── Steps 1–3 ────────────────────────────────────────────
  return (
    <div className="space-y-4 max-w-2xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Order Check</h2>
          <p className="text-sm text-gray-500">AI-powered dispatch verification</p>
        </div>
        <button onClick={() => setView('history')} className="btn-secondary text-sm flex items-center gap-1.5">
          <History size={14} /> History
        </button>
      </div>

      {/* Progress */}
      <div className="flex gap-1">
        {['Order Paper', 'Box Photos', 'Results'].map((label, i) => (
          <div key={i} className="flex-1">
            <div className={`h-1.5 rounded-full ${step > i + 1 ? 'bg-green-500' : step === i + 1 ? 'bg-blue-500' : 'bg-gray-200'}`} />
            <p className={`text-xs mt-1 text-center ${step === i + 1 ? 'text-blue-600 font-medium' : 'text-gray-400'}`}>
              {i + 1}. {label}
            </p>
          </div>
        ))}
      </div>

      {/* ── STEP 1: Order paper photos — live scanning ── */}
      {step === 1 && (
        <div className="card space-y-5">
          <div>
            <h3 className="font-bold text-gray-900 text-lg mb-1">📋 Step 1 — Snap the Order Paper</h3>
            <p className="text-sm text-gray-500">
              Take one photo per page of the sales order / pick slip — AI reads the items
              instantly as you upload. Multi-page orders supported (up to 6 pages).
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Order Reference <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              className="input w-full"
              placeholder="e.g. Metro Supermarket — Apr 22"
              value={orderRef}
              onChange={e => setOrderRef(e.target.value)}
            />
          </div>

          {/* Hidden file input */}
          <input
            ref={orderInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            className="hidden"
            onChange={handleOrderPhotoFiles}
          />

          {/* Per-page photo + live scan results */}
          <div className="space-y-3">
            {orderPhotos.map((p, i) => {
              const scan = orderScanResults[p.id] || { status: 'scanning', items: [], error: null }
              return (
                <div key={p.id} className="rounded-xl border border-gray-200 overflow-hidden bg-white shadow-sm">
                  {/* Photo header */}
                  <div className="flex items-center gap-3 p-3">
                    <div className="relative flex-shrink-0 w-20 h-14 rounded-lg overflow-hidden border border-gray-200">
                      <img src={p.preview} alt="" className="w-full h-full object-cover" />
                      <button
                        onClick={() => handleRemoveOrderPhoto(i)}
                        className="absolute top-0.5 right-0.5 bg-red-500 text-white rounded-full p-0.5"
                      >
                        <Trash2 size={10} />
                      </button>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800">Page {i + 1}</p>
                      {scan.status === 'scanning' && (
                        <p className="text-xs text-blue-500 flex items-center gap-1 mt-0.5">
                          <Loader2 size={11} className="animate-spin" />
                          Reading items from paper…
                        </p>
                      )}
                      {scan.status === 'done' && (
                        <p className="text-xs text-green-600 font-semibold mt-0.5">
                          ✅ {scan.items.length} item{scan.items.length !== 1 ? 's' : ''} found
                        </p>
                      )}
                      {scan.status === 'error' && (
                        <p className="text-xs text-red-500 mt-0.5">
                          ⚠️ {scan.error} — remove and re-take this page
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Extracted item list */}
                  {scan.status === 'done' && scan.items.length > 0 && (
                    <div className="border-t border-gray-100 bg-gray-50 divide-y divide-gray-100">
                      {scan.items.map((item, j) => (
                        <div key={j} className="flex items-center justify-between px-3 py-1.5">
                          <span className="text-sm text-gray-800 font-medium truncate">{item.name}</span>
                          <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                            {item.code && (
                              <span className="text-xs text-gray-400 font-mono">{item.code}</span>
                            )}
                            <span className="text-xs bg-gray-200 text-gray-700 rounded px-1.5 py-0.5 font-semibold">
                              ×{item.qty || 1}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}

            {/* Add page button */}
            {orderPhotos.length < 6 && (
              <button
                onClick={() => orderInputRef.current?.click()}
                className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-gray-300 rounded-xl py-3 text-sm text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors"
              >
                <Camera size={16} />
                {orderPhotos.length === 0 ? 'Take Order Paper Photo' : `Add Page ${orderPhotos.length + 1}`}
              </button>
            )}
          </div>

          {/* Total summary — shown once all scans done */}
          {allScansComplete && allOrderItems.length > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
              <p className="text-sm font-bold text-blue-800">
                📋 {allOrderItems.length} items across {orderPhotos.length} page{orderPhotos.length !== 1 ? 's' : ''}
              </p>
              <p className="text-xs text-blue-600 mt-0.5">
                Check the lists above — if any items are missing, remove that page and re-take it.
                When correct, tap Next to photograph the boxes.
              </p>
            </div>
          )}

          <button
            disabled={!allScansComplete}
            onClick={() => setStep(2)}
            className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-40"
          >
            Next: Snap Boxes <ChevronRight size={16} />
          </button>
        </div>
      )}

      {/* ── STEP 2: Box photos ── */}
      {step === 2 && (
        <div className="card space-y-5">
          <div>
            <h3 className="font-bold text-gray-900 text-lg mb-1">📦 Step 2 — Snap the Boxes on Floor</h3>
            <p className="text-sm text-gray-500">
              Take 1–8 photos of all boxes laid out on the floor. Most boxes facing towards you is ideal.
              For large orders, use multiple photos to cover all boxes. Items without boxes — you'll confirm manually in the next step.
            </p>
          </div>

          <PhotoCapture
            label="Boxes on Floor"
            hint="Capture all boxes — up to 8 photos"
            photos={boxPhotos}
            onAdd={(p) => setBoxPhotos(prev => [...prev, p])}
            onRemove={(i) => setBoxPhotos(prev => prev.filter((_, j) => j !== i))}
            maxPhotos={8}
          />

          {analyzeError && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
              <strong>Error:</strong> {analyzeError}
            </div>
          )}

          <div className="flex gap-2">
            <button onClick={() => setStep(1)} className="btn-secondary flex items-center gap-1.5">
              <ChevronLeft size={15} /> Back
            </button>
            <button
              disabled={boxPhotos.length === 0 || analyzing}
              onClick={analyze}
              className="btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-40"
            >
              {analyzing ? (
                <><Loader2 size={16} className="animate-spin" /> Analysing with AI…</>
              ) : (
                <><Eye size={16} /> Analyse & Check</>
              )}
            </button>
          </div>

          {analyzing && (
            <div className="text-center text-xs text-gray-400 animate-pulse">
              Reading {orderPhotos.length > 1 ? `${orderPhotos.length} order pages` : 'order paper'}…
              scanning {boxPhotos.length} box photo{boxPhotos.length > 1 ? 's' : ''}… matching items…<br />
              This takes about {10 + (orderPhotos.length + boxPhotos.length) * 5}–{15 + (orderPhotos.length + boxPhotos.length) * 7} seconds.
            </div>
          )}
        </div>
      )}

      {/* ── STEP 3: Results ── */}
      {step === 3 && results && (
        <div className="space-y-4">
          <div className="card bg-gray-50">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-gray-900">📊 Check Results</h3>
              <button onClick={() => setStep(2)} className="text-xs text-blue-600 flex items-center gap-1">
                <RotateCcw size={12} /> Re-scan
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge type="matched" count={results.matched.length} />
              <Badge type="missing" count={results.missing.length} />
              <Badge type="extra"   count={results.extra.length}   />
            </div>
            {results.extra.length > 0 && (
              <div className="mt-3 bg-orange-100 border border-orange-300 rounded p-2 text-xs text-orange-800 font-medium">
                ⚠️ {results.extra.length} item{results.extra.length > 1 ? 's' : ''} on the floor
                {results.extra.length > 1 ? ' are' : ' is'} NOT in this order.
                Remove before dispatch.
              </div>
            )}
            {results.missing.length > 0 && (
              <div className="mt-2 bg-red-100 border border-red-300 rounded p-2 text-xs text-red-800 font-medium">
                ❌ {results.missing.length} item{results.missing.length > 1 ? 's' : ''} from the order
                {results.missing.length > 1 ? ' were' : ' was'} not found in photos.
                Check if they have no box or are missing.
              </div>
            )}
          </div>

          <ResultsView
            matched={results.matched}
            missing={results.missing}
            extra={results.extra}
            manualItems={manualItems}
            setManualItems={setManualItems}
            notes={notes}
            setNotes={setNotes}
          />

          <button
            onClick={save}
            disabled={saving}
            className="btn-primary w-full flex items-center justify-center gap-2"
          >
            {saving
              ? <><Loader2 size={15} className="animate-spin" /> Saving…</>
              : <><Save size={15} /> Save Check Record</>
            }
          </button>
          <p className="text-xs text-center text-gray-400">
            Saves order paper photo + box photos + full results as an audit record
          </p>
        </div>
      )}
    </div>
  )
}
