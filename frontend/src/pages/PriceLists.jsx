import { useEffect, useState } from 'react'
import { priceListAPI, skuAPI } from '../api/client'
import { Tags, Plus, Pencil, Trash2, X, Search, ChevronDown, ChevronRight, DollarSign } from 'lucide-react'

// ── Price List Form Modal ──────────────────────────────────────
function PriceListModal({ list, onSave, onClose }) {
  const [name, setName]   = useState(list?.name || '')
  const [desc, setDesc]   = useState(list?.description || '')
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      if (list) {
        await priceListAPI.update(list.id, { name, description: desc })
      } else {
        await priceListAPI.create({ name, description: desc })
      }
      onSave()
    } catch {}
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h3 className="font-bold text-gray-900">{list ? 'Edit Price List' : 'New Price List'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="label">Name *</label>
            <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Wholesale, Retail, Premium" required />
          </div>
          <div>
            <label className="label">Description</label>
            <textarea className="input resize-none" rows={2} value={desc} onChange={e => setDesc(e.target.value)} placeholder="Optional description" />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={saving} className="btn-primary flex-1">{saving ? 'Saving…' : 'Save'}</button>
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Price Items Editor ─────────────────────────────────────────
function PriceItemsPanel({ list, skus, onSaved }) {
  const [items, setItems] = useState(
    (list.items || []).map(i => ({ sku_id: i.sku_id, unit_price: i.unit_price }))
  )
  const [search, setSearch]     = useState('')
  const [saving, setSaving]     = useState(false)
  const [saved,  setSaved]      = useState(false)

  // Index existing items for fast lookup
  const itemMap = Object.fromEntries(items.map(i => [i.sku_id, i.unit_price]))

  const setPrice = (sku_id, value) => {
    const price = parseFloat(value)
    if (isNaN(price) || price < 0) {
      setItems(prev => prev.filter(i => i.sku_id !== sku_id))
    } else {
      setItems(prev => {
        const existing = prev.find(i => i.sku_id === sku_id)
        if (existing) return prev.map(i => i.sku_id === sku_id ? { ...i, unit_price: price } : i)
        return [...prev, { sku_id, unit_price: price }]
      })
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await priceListAPI.setItems(list.id, items.filter(i => i.unit_price > 0))
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      onSaved()
    } catch {}
    setSaving(false)
  }

  const filtered = skus.filter(s =>
    !search ||
    s.product_name.toLowerCase().includes(search.toLowerCase()) ||
    s.sku_code.toLowerCase().includes(search.toLowerCase())
  )

  const withPrices    = items.length
  const totalRevenue  = items.reduce((s, i) => s + i.unit_price, 0)

  return (
    <div className="mt-4 border-t pt-4 space-y-3">
      {/* Summary bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4 text-sm text-gray-600">
          <span className="font-medium text-blue-700">{withPrices} SKUs with custom prices</span>
          <span className="text-gray-400">|</span>
          <span>{skus.length - withPrices} using default</span>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="btn-primary text-sm px-4 py-1.5"
        >
          {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save Prices'}
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          className="input pl-8 text-sm py-1.5"
          placeholder="Search SKUs…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* SKU price grid */}
      <div className="max-h-80 overflow-y-auto border rounded-xl">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 sticky top-0">
            <tr>
              <th className="table-th">Product</th>
              <th className="table-th text-center">Default Cost</th>
              <th className="table-th text-center w-36">Custom Price / case</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(sku => {
              const custom = itemMap[sku.id]
              return (
                <tr key={sku.id} className={`border-b hover:bg-gray-50 ${custom != null ? 'bg-blue-50/30' : ''}`}>
                  <td className="table-td">
                    <div className="font-medium text-gray-800">{sku.product_name}</div>
                    <div className="text-xs text-gray-400">{sku.sku_code} · {sku.category}</div>
                  </td>
                  <td className="table-td text-center text-gray-500">
                    {sku.cost_price != null ? `$${sku.cost_price.toFixed(2)}` : '—'}
                  </td>
                  <td className="table-td">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className={`w-full border rounded-lg px-2 py-1 text-sm text-right focus:outline-none focus:ring-1 focus:ring-blue-500 ${
                        custom != null ? 'border-blue-300 bg-white font-medium' : 'border-gray-200 bg-gray-50'
                      }`}
                      placeholder="default"
                      value={custom != null ? custom : ''}
                      onChange={e => setPrice(sku.id, e.target.value)}
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────
export default function PriceLists() {
  const [lists,    setLists]    = useState([])
  const [skus,     setSkus]     = useState([])
  const [loading,  setLoading]  = useState(true)
  const [modal,    setModal]    = useState(null)   // null | 'new' | list object
  const [expanded, setExpanded] = useState(null)   // id of expanded list

  const load = async () => {
    const [plRes, skuRes] = await Promise.all([
      priceListAPI.list(),
      skuAPI.list({ active_only: true, limit: 500 }),
    ])
    setLists(plRes.data)
    setSkus(skuRes.data?.items || skuRes.data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const handleDelete = async (id) => {
    if (!confirm('Delete this price list? Customers assigned to it will revert to default pricing.')) return
    await priceListAPI.delete(id)
    load()
  }

  const openExpanded = async (id) => {
    if (expanded === id) { setExpanded(null); return }
    setExpanded(id)
    // Refresh this list to get full items
    const r = await priceListAPI.get(id)
    setLists(prev => prev.map(l => l.id === id ? r.data : l))
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Tags size={24} className="text-blue-600" /> Customer Price Lists
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">Set custom per-case prices for different customer tiers</p>
        </div>
        <button onClick={() => setModal('new')} className="btn-primary flex items-center gap-2">
          <Plus size={16} /> New Price List
        </button>
      </div>

      {/* Summary chips */}
      <div className="flex gap-3">
        <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-2 text-sm">
          <span className="font-bold text-blue-700">{lists.length}</span>
          <span className="text-blue-600 ml-1">Price Lists</span>
        </div>
        <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 text-sm">
          <span className="font-bold text-gray-700">{skus.length}</span>
          <span className="text-gray-600 ml-1">SKUs</span>
        </div>
      </div>

      {/* Lists */}
      {loading ? (
        <div className="card text-center text-gray-400 py-12">Loading…</div>
      ) : lists.length === 0 ? (
        <div className="card text-center py-16">
          <Tags size={48} className="mx-auto mb-3 text-gray-200" />
          <p className="text-gray-500 font-medium">No price lists yet</p>
          <p className="text-sm text-gray-400 mt-1">Create a price list and assign it to customers</p>
          <button onClick={() => setModal('new')} className="btn-primary mt-4">Create First Price List</button>
        </div>
      ) : (
        <div className="space-y-3">
          {lists.map(list => (
            <div key={list.id} className="card p-0 overflow-hidden">
              {/* Header row */}
              <div className="flex items-center gap-4 px-5 py-4">
                <button
                  onClick={() => openExpanded(list.id)}
                  className="flex items-center gap-2 text-gray-500 hover:text-gray-700"
                >
                  {expanded === list.id ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </button>
                <div className="flex-1 cursor-pointer" onClick={() => openExpanded(list.id)}>
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-blue-100 flex items-center justify-center">
                      <DollarSign size={16} className="text-blue-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">{list.name}</p>
                      {list.description && <p className="text-xs text-gray-500">{list.description}</p>}
                    </div>
                  </div>
                </div>
                <span className="text-sm text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
                  {list.item_count} custom price{list.item_count !== 1 ? 's' : ''}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setModal(list)}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50"
                    title="Edit"
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    onClick={() => handleDelete(list.id)}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50"
                    title="Delete"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>

              {/* Expanded price editor */}
              {expanded === list.id && (
                <div className="px-5 pb-5">
                  <PriceItemsPanel
                    list={list}
                    skus={skus}
                    onSaved={() => {
                      // Refresh item count
                      priceListAPI.get(list.id).then(r =>
                        setLists(prev => prev.map(l => l.id === list.id ? r.data : l))
                      )
                    }}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {modal && (
        <PriceListModal
          list={modal === 'new' ? null : modal}
          onSave={() => { setModal(null); load() }}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  )
}
