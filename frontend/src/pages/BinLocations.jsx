import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import {
  MapPin, Plus, Search, Package, RefreshCw, ChevronDown, ChevronRight,
  Edit2, Trash2, Check, X, Layers, ArrowRight, Zap, Grid3X3, Printer, Tag
} from 'lucide-react'
import { labelAPI } from '../api/client'

const API = axios.create({ baseURL: 'http://localhost:8000' })

// ── Bin badge ──────────────────────────────────────────────────
function BinBadge({ code, className = '' }) {
  if (!code) return <span className={`text-gray-300 text-xs ${className}`}>—</span>
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded font-mono text-xs font-semibold ${className}`}>
      <MapPin size={10} />
      {code}
    </span>
  )
}

// ── Create / Edit bin modal ────────────────────────────────────
function BinModal({ bin, onClose, onSaved }) {
  const isEdit = !!bin?.id
  const [form, setForm] = useState({
    zone:        bin?.zone        || '',
    aisle:       bin?.aisle       || '',
    shelf:       bin?.shelf       || '',
    position:    bin?.position    || '',
    description: bin?.description || '',
  })
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  // Auto-generate code preview
  const codePreview = [form.zone, form.aisle, form.shelf, form.position]
    .filter(Boolean).join('-').toUpperCase() || '—'

  const save = async () => {
    if (!form.zone || !form.aisle || !form.shelf || !form.position) {
      setError('Zone, aisle, shelf and position are required'); return
    }
    setSaving(true); setError('')
    try {
      const payload = { ...form, code: codePreview }
      if (isEdit) {
        await API.put(`/bin-locations/${bin.id}`, payload)
      } else {
        await API.post('/bin-locations', payload)
      }
      onSaved()
    } catch (e) {
      setError(e.response?.data?.detail || 'Save failed')
    }
    setSaving(false)
  }

  const field = (label, key, placeholder) => (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <input
        value={form[key]}
        onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
        placeholder={placeholder}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 uppercase"
      />
    </div>
  )

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="p-5 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-bold text-gray-900">{isEdit ? 'Edit Bin' : 'Create Bin'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-3">
          {/* Code preview */}
          <div className="flex items-center gap-2 p-3 bg-indigo-50 rounded-xl">
            <MapPin size={16} className="text-indigo-500" />
            <span className="text-sm text-indigo-700 font-medium">Bin code preview:</span>
            <BinBadge code={codePreview !== '—' ? codePreview : null} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            {field('Zone', 'zone', 'e.g. A, DRY, FREEZE')}
            {field('Aisle', 'aisle', 'e.g. 01')}
            {field('Shelf', 'shelf', 'e.g. A, B, C')}
            {field('Position', 'position', 'e.g. 01')}
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Description (optional)</label>
            <input
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="e.g. Bottom left freezer"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>
        <div className="p-5 border-t border-gray-100 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
          <button onClick={save} disabled={saving}
            className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center gap-2">
            {saving && <RefreshCw size={13} className="animate-spin" />}
            {isEdit ? 'Save Changes' : 'Create Bin'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Bulk generate modal ────────────────────────────────────────
function BulkModal({ onClose, onSaved }) {
  const [zone,      setZone]      = useState('')
  const [aisles,    setAisles]    = useState('01 02 03')
  const [shelves,   setShelves]   = useState('A B C')
  const [positions, setPositions] = useState('')
  const [saving,    setSaving]    = useState(false)
  const [result,    setResult]    = useState(null)
  const [error,     setError]     = useState('')

  const parsedPositions = positions.trim() ? positions.trim().split(/\s+/) : []

  const preview = () => {
    const a = aisles.trim().split(/\s+/).filter(Boolean)
    const s = shelves.trim().split(/\s+/).filter(Boolean)
    const p = parsedPositions.filter(Boolean)
    return a.length * s.length * (p.length || 1)
  }

  const run = async () => {
    if (!zone.trim()) { setError('Zone is required'); return }
    setSaving(true); setError('')
    try {
      const r = await API.post('/bin-locations/bulk-create', {
        zone:      zone.trim().toUpperCase(),
        aisles:    aisles.trim().split(/\s+/).filter(Boolean),
        shelves:   shelves.trim().split(/\s+/).filter(Boolean),
        positions: parsedPositions,
      })
      setResult(r.data)
      onSaved()
    } catch (e) {
      const detail = e.response?.data?.detail
      setError(typeof detail === 'string' ? detail : (detail ? JSON.stringify(detail) : `Failed (${e.message})`))
    }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="p-5 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Grid3X3 size={18} className="text-indigo-500" />
            <h2 className="font-bold text-gray-900">Bulk Generate Bins</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-3 text-sm">
          <p className="text-gray-500 text-xs">Creates bins for every combination of aisle × shelf (× position if provided) in a zone.</p>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Zone</label>
            <input value={zone} onChange={e => setZone(e.target.value)} placeholder="e.g. A, DRY, FREEZE"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 uppercase focus:outline-none focus:ring-2 focus:ring-indigo-400" />
          </div>
          {[
            { label: 'Aisles (space-separated)', val: aisles,    set: setAisles,    ph: 'e.g. 01 02 03' },
            { label: 'Shelves (space-separated)', val: shelves,   set: setShelves,   ph: 'e.g. A B C D' },
            { label: 'Positions (optional, space-separated)', val: positions, set: setPositions, ph: 'e.g. 01 02 03 04 05 — leave blank to omit' },
          ].map(({ label, val, set, ph }) => (
            <div key={label}>
              <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
              <input value={val} onChange={e => set(e.target.value)} placeholder={ph}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 font-mono focus:outline-none focus:ring-2 focus:ring-indigo-400" />
            </div>
          ))}
          <div className="p-3 bg-indigo-50 rounded-lg text-indigo-700 text-xs">
            Will create <strong>{preview()}</strong> bins (skipping existing ones)
          </div>
          {result && (
            <div className="p-3 bg-green-50 rounded-lg text-green-700 text-xs">
              ✅ Created {result.created} bins, skipped {result.skipped} already existing.
              {result.codes?.length > 0 && <div className="mt-1 font-mono">{result.codes.slice(0,8).join(' ')} {result.codes.length > 8 ? '…' : ''}</div>}
            </div>
          )}
          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>
        <div className="p-5 border-t border-gray-100 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Close</button>
          <button onClick={run} disabled={saving}
            className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center gap-2">
            {saving ? <RefreshCw size={13} className="animate-spin" /> : <Zap size={13} />}
            Generate
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Zone group ─────────────────────────────────────────────────
function ZoneGroup({ zone, bins, onEdit, onDeactivate }) {
  const [open, setOpen] = useState(true)

  const totalBins  = bins.length
  const usedBins   = bins.filter(b => b.sku_count > 0).length
  const totalCases = bins.reduce((s, b) => s + b.total_cases, 0)

  return (
    <div className="card">
      <button onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-indigo-100 flex items-center justify-center">
            <span className="text-sm font-bold text-indigo-700">{zone || '?'}</span>
          </div>
          <div className="text-left">
            <div className="font-semibold text-gray-900">Zone {zone || 'Unzoned'}</div>
            <div className="text-xs text-gray-500">{totalBins} bins · {usedBins} in use · {totalCases} cases</div>
          </div>
        </div>
        {open ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronRight size={16} className="text-gray-400" />}
      </button>

      {open && (
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {bins.map(bin => (
            <div key={bin.id}
              className={`rounded-xl border p-3 ${bin.sku_count > 0 ? 'border-indigo-200 bg-indigo-50' : 'border-gray-200 bg-gray-50'}`}>
              <div className="flex items-center justify-between mb-2">
                <BinBadge code={bin.code} />
                <div className="flex gap-1">
                  <button onClick={() => window.open(labelAPI.binUrl(bin.id), '_blank')}
                    className="p-1 text-gray-400 hover:text-purple-600 rounded" title="Print bin label">
                    <Tag size={12} />
                  </button>
                  <button onClick={() => onEdit(bin)}
                    className="p-1 text-gray-400 hover:text-indigo-600 rounded">
                    <Edit2 size={12} />
                  </button>
                  <button onClick={() => onDeactivate(bin)}
                    className="p-1 text-gray-400 hover:text-red-500 rounded">
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
              {bin.description && (
                <p className="text-xs text-gray-500 mb-2">{bin.description}</p>
              )}
              {bin.items.length === 0 ? (
                <p className="text-xs text-gray-400 italic">Empty</p>
              ) : (
                <div className="space-y-1">
                  {bin.items.map(item => (
                    <div key={item.inventory_id}
                      className="flex items-center justify-between text-xs bg-white rounded-lg px-2 py-1 border border-indigo-100">
                      <div className="min-w-0">
                        <span className="font-mono text-indigo-600 font-medium">{item.sku_code}</span>
                        <span className="text-gray-500 ml-1 truncate block">{item.product_name}</span>
                      </div>
                      <span className="flex-shrink-0 ml-2 font-semibold text-gray-700">{item.cases_on_hand}c</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────
export default function BinLocations() {
  const [bins,       setBins]       = useState([])
  const [loading,    setLoading]    = useState(true)
  const [search,     setSearch]     = useState('')
  const [modal,      setModal]      = useState(null)   // null | 'create' | 'bulk' | {bin}
  const [editBin,    setEditBin]    = useState(null)

  const load = useCallback(async () => {
    if (!bins.length) setLoading(true)
    try {
      const r = await API.get('/bin-locations?active_only=true')
      setBins(r.data)
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const deactivate = async (bin) => {
    if (!confirm(`Deactivate bin ${bin.code}? Any stock assigned to it will be unassigned.`)) return
    try {
      await API.delete(`/bin-locations/${bin.id}`)
      load()
    } catch (e) {
      alert(e.response?.data?.detail || 'Failed to deactivate bin')
    }
  }

  const filtered = bins.filter(b =>
    !search ||
    b.code.toLowerCase().includes(search.toLowerCase()) ||
    b.zone.toLowerCase().includes(search.toLowerCase()) ||
    b.items.some(i => i.sku_code.toLowerCase().includes(search.toLowerCase()) ||
                      i.product_name.toLowerCase().includes(search.toLowerCase()))
  )

  // Group by zone
  const zones = [...new Set(filtered.map(b => b.zone || ''))].sort()
  const byZone = (z) => filtered.filter(b => (b.zone || '') === z)

  const totalBins  = bins.length
  const usedBins   = bins.filter(b => b.sku_count > 0).length
  const totalCases = bins.reduce((s, b) => s + b.total_cases, 0)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <MapPin size={22} className="text-indigo-500" />
            Bin Locations
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {totalBins} bins · {usedBins} in use · {totalCases} total cases stored
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => window.open(labelAPI.allBinsUrl(), '_blank')}
            className="flex items-center gap-2 px-3 py-2 text-sm border border-purple-300 text-purple-700 rounded-xl hover:bg-purple-50">
            <Printer size={15} />
            Print All Labels
          </button>
          <button onClick={() => setModal('bulk')}
            className="flex items-center gap-2 px-3 py-2 text-sm border border-indigo-300 text-indigo-700 rounded-xl hover:bg-indigo-50">
            <Grid3X3 size={15} />
            Bulk Generate
          </button>
          <button onClick={() => { setEditBin(null); setModal('create') }}
            className="flex items-center gap-2 btn-primary text-sm">
            <Plus size={15} />
            Add Bin
          </button>
          <button onClick={load} className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg">
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Bins',  value: totalBins,  colour: 'text-indigo-600',  bg: 'bg-indigo-50'  },
          { label: 'In Use',      value: usedBins,   colour: 'text-green-600',   bg: 'bg-green-50'   },
          { label: 'Empty',       value: totalBins - usedBins, colour: 'text-gray-500', bg: 'bg-gray-50' },
        ].map(s => (
          <div key={s.label} className={`${s.bg} rounded-xl p-4 text-center`}>
            <div className={`text-2xl font-bold ${s.colour}`}>{s.value}</div>
            <div className="text-xs text-gray-500 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search bins, zones, SKU codes…"
          className="w-full pl-9 pr-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
        />
      </div>

      {/* Empty state */}
      {!loading && bins.length === 0 && (
        <div className="text-center py-16">
          <MapPin size={40} className="mx-auto text-gray-300 mb-3" />
          <p className="font-semibold text-gray-500">No bins set up yet</p>
          <p className="text-sm text-gray-400 mt-1 mb-4">Use Bulk Generate to create a full warehouse layout, or add bins one by one.</p>
          <button onClick={() => setModal('bulk')}
            className="btn-primary text-sm px-5">
            <Grid3X3 size={14} className="inline mr-1.5" />
            Bulk Generate Bins
          </button>
        </div>
      )}

      {/* Zone groups */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <RefreshCw size={22} className="animate-spin text-indigo-400" />
        </div>
      ) : (
        <div className="space-y-4">
          {zones.map(zone => (
            <ZoneGroup
              key={zone}
              zone={zone}
              bins={byZone(zone)}
              onEdit={bin => { setEditBin(bin); setModal('edit') }}
              onDeactivate={deactivate}
            />
          ))}
        </div>
      )}

      {/* Modals */}
      {(modal === 'create' || modal === 'edit') && (
        <BinModal
          bin={modal === 'edit' ? editBin : null}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); load() }}
        />
      )}
      {modal === 'bulk' && (
        <BulkModal
          onClose={() => setModal(null)}
          onSaved={load}
        />
      )}
    </div>
  )
}
