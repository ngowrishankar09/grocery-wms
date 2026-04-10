import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  CheckCircle, Circle, ArrowRight, Building2, Package, Users,
  Warehouse, Tag, Rocket, ChevronRight, X
} from 'lucide-react'
import { settingsAPI, skuAPI, customerAPI } from '../api/client'

const STEPS = [
  { id: 1, label: 'Company',    icon: Building2  },
  { id: 2, label: 'Warehouse',  icon: Warehouse  },
  { id: 3, label: 'Categories', icon: Tag        },
  { id: 4, label: 'Products',   icon: Package    },
  { id: 5, label: 'Customers',  icon: Users      },
  { id: 6, label: 'Done',       icon: Rocket     },
]

const BLANK_SKU = { product_name: '', sku_code: '', category: '', case_size: 1, cost_price: '' }
const BLANK_CUST = { name: '', email: '', phone: '' }

export default function OnboardingWizard() {
  const navigate = useNavigate()
  const [step, setStep]           = useState(1)
  const [completed, setCompleted] = useState(new Set())
  const [saving, setSaving]       = useState(false)

  // Step 1 — Company
  const [company, setCompany] = useState({ name: '', address: '', phone: '', email: '', tax_number: '', logo_text: '🏪' })

  // Step 3 — Categories
  const [categories, setCategories] = useState(['Produce', 'Dairy', 'Frozen', 'Dry Goods'])
  const [newCat, setNewCat] = useState('')

  // Step 4 — SKUs
  const [skus, setSkus] = useState([{ ...BLANK_SKU }])

  // Step 5 — Customers
  const [customers, setCustomers] = useState([{ ...BLANK_CUST }])

  // Summary for step 6
  const [summary, setSummary] = useState({})

  const markDone = (s) => setCompleted(prev => new Set([...prev, s]))

  const next = () => {
    markDone(step)
    setStep(s => Math.min(s + 1, 6))
  }
  const skip = () => {
    setStep(s => Math.min(s + 1, 6))
  }

  // ── Step handlers ──────────────────────────────────────────

  const saveCompany = async () => {
    setSaving(true)
    try {
      await settingsAPI.updateProfile({ ...company, logo_text: company.logo_text || '🏪' })
      next()
    } catch { next() }
    setSaving(false)
  }

  const saveCategories = async () => {
    setSaving(true)
    try {
      for (const cat of categories) {
        try { await settingsAPI.createCategory?.({ name: cat }) } catch {}
      }
    } catch {}
    setSaving(false)
    next()
  }

  const saveSkus = async () => {
    setSaving(true)
    let saved = 0
    for (const sku of skus) {
      if (!sku.product_name || !sku.sku_code || !sku.category) continue
      try {
        await skuAPI.create({
          ...sku,
          case_size: parseInt(sku.case_size) || 1,
          cost_price: parseFloat(sku.cost_price) || null,
          avg_shelf_life_days: 0,
        })
        saved++
      } catch {}
    }
    setSummary(s => ({ ...s, skus_saved: saved }))
    setSaving(false)
    next()
  }

  const saveCustomers = async () => {
    setSaving(true)
    let saved = 0
    for (const c of customers) {
      if (!c.name) continue
      try { await customerAPI.create(c); saved++ } catch {}
    }
    setSummary(s => ({ ...s, customers_saved: saved }))
    setSaving(false)
    next()
  }

  const addSku = () => { if (skus.length < 10) setSkus(s => [...s, { ...BLANK_SKU }]) }
  const removeSku = (i) => setSkus(s => s.filter((_, idx) => idx !== i))
  const setSku = (i, k, v) => setSkus(s => { const n = [...s]; n[i] = { ...n[i], [k]: v }; return n })

  const addCust = () => { if (customers.length < 5) setCustomers(s => [...s, { ...BLANK_CUST }]) }
  const removeCust = (i) => setCustomers(s => s.filter((_, idx) => idx !== i))
  const setCust = (i, k, v) => setCustomers(s => { const n = [...s]; n[i] = { ...n[i], [k]: v }; return n })

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-8 py-6">
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <Rocket className="w-6 h-6" /> Setup Wizard
          </h1>
          <p className="text-blue-200 text-sm mt-1">Get your warehouse management system ready in minutes</p>

          {/* Progress bar */}
          <div className="mt-5">
            <div className="flex justify-between mb-2">
              {STEPS.map(s => {
                const done = completed.has(s.id)
                const active = step === s.id
                return (
                  <div key={s.id} className="flex flex-col items-center gap-1">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-all
                      ${done ? 'bg-green-400' : active ? 'bg-white' : 'bg-blue-400 bg-opacity-40'}`}>
                      {done
                        ? <CheckCircle className="w-5 h-5 text-white" />
                        : <s.icon className={`w-4 h-4 ${active ? 'text-blue-600' : 'text-blue-200'}`} />
                      }
                    </div>
                    <span className={`text-xs ${active ? 'text-white font-medium' : 'text-blue-200'}`}>{s.label}</span>
                  </div>
                )
              })}
            </div>
            <div className="h-1.5 bg-blue-400 bg-opacity-30 rounded-full overflow-hidden">
              <div className="h-full bg-white rounded-full transition-all duration-500"
                style={{ width: `${((step - 1) / (STEPS.length - 1)) * 100}%` }} />
            </div>
          </div>
        </div>

        {/* Step Content */}
        <div className="p-8">
          {/* Step 1 — Company Profile */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-bold text-gray-900">Company Profile</h2>
                <p className="text-sm text-gray-500">This will appear on your invoices and documents.</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[
                  ['Company Name *', 'name', 'text'],
                  ['Tax Number / ABN / VAT', 'tax_number', 'text'],
                  ['Phone', 'phone', 'text'],
                  ['Email', 'email', 'email'],
                ].map(([label, key, type]) => (
                  <div key={key}>
                    <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
                    <input type={type} value={company[key]} onChange={e => setCompany(c => ({ ...c, [key]: e.target.value }))}
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                ))}
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Address</label>
                  <textarea value={company.address} onChange={e => setCompany(c => ({ ...c, address: e.target.value }))}
                    rows={2} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none" />
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <button onClick={skip} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">Skip for now</button>
                <button onClick={saveCompany} disabled={saving || !company.name}
                  className="flex-1 bg-blue-600 text-white py-2 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2">
                  {saving ? 'Saving...' : <><span>Save & Continue</span><ArrowRight className="w-4 h-4" /></>}
                </button>
              </div>
            </div>
          )}

          {/* Step 2 — Warehouse */}
          {step === 2 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-bold text-gray-900">Warehouse Setup</h2>
                <p className="text-sm text-gray-500">Your system comes pre-configured with two warehouses.</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { code: 'WH1', name: 'Main Warehouse', desc: 'Primary operations, picking, and dispatch', active: true },
                  { code: 'WH2', name: 'Backup Warehouse', desc: 'Overflow, receiving, and cold storage', active: true },
                ].map(wh => (
                  <div key={wh.code} className="border-2 border-green-300 bg-green-50 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <CheckCircle className="w-4 h-4 text-green-600" />
                      <span className="font-semibold text-green-800">{wh.code}</span>
                    </div>
                    <p className="font-medium text-gray-800 text-sm">{wh.name}</p>
                    <p className="text-xs text-gray-500 mt-1">{wh.desc}</p>
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-400 bg-gray-50 rounded-lg p-3">
                💡 You can rename warehouses and add more in <strong>Settings → Warehouses</strong> after setup.
              </p>
              <button onClick={next} className="w-full bg-blue-600 text-white py-2 rounded-lg font-medium hover:bg-blue-700 flex items-center justify-center gap-2">
                <span>Continue</span><ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Step 3 — Categories */}
          {step === 3 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-bold text-gray-900">Product Categories</h2>
                <p className="text-sm text-gray-500">Organise your products into categories for easier management.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {categories.map((cat, i) => (
                  <span key={i} className="flex items-center gap-1.5 bg-blue-100 text-blue-800 px-3 py-1.5 rounded-full text-sm">
                    {cat}
                    <button onClick={() => setCategories(c => c.filter((_, idx) => idx !== i))} className="hover:text-red-500">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input value={newCat} onChange={e => setNewCat(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && newCat.trim()) { setCategories(c => [...c, newCat.trim()]); setNewCat('') } }}
                  placeholder="Add category (press Enter)..."
                  className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <button onClick={() => { if (newCat.trim()) { setCategories(c => [...c, newCat.trim()]); setNewCat('') } }}
                  className="bg-blue-100 text-blue-700 px-3 py-2 rounded-lg text-sm font-medium hover:bg-blue-200">Add</button>
              </div>
              <div className="flex gap-2 pt-2">
                <button onClick={skip} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">Skip</button>
                <button onClick={saveCategories} disabled={saving}
                  className="flex-1 bg-blue-600 text-white py-2 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2">
                  {saving ? 'Saving...' : <><span>Save Categories</span><ArrowRight className="w-4 h-4" /></>}
                </button>
              </div>
            </div>
          )}

          {/* Step 4 — SKUs */}
          {step === 4 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-bold text-gray-900">Add Your First Products</h2>
                <p className="text-sm text-gray-500">Add up to 10 products now — you can always add more later in SKUs.</p>
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {skus.map((sku, i) => (
                  <div key={i} className="grid grid-cols-5 gap-2 items-center">
                    <input value={sku.product_name} onChange={e => setSku(i, 'product_name', e.target.value)}
                      placeholder="Product name *" className="col-span-2 border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" />
                    <input value={sku.sku_code} onChange={e => setSku(i, 'sku_code', e.target.value)}
                      placeholder="Code *" className="border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" />
                    <input value={sku.category} onChange={e => setSku(i, 'category', e.target.value)}
                      placeholder="Category *" list="cats" className="border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" />
                    <datalist id="cats">{categories.map(c => <option key={c}>{c}</option>)}</datalist>
                    <button onClick={() => removeSku(i)} className="text-red-400 hover:text-red-600 flex justify-center">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
              <button onClick={addSku} className="text-sm text-blue-600 hover:underline">+ Add another product</button>
              <div className="flex gap-2 pt-2">
                <button onClick={skip} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">Skip</button>
                <button onClick={saveSkus} disabled={saving}
                  className="flex-1 bg-blue-600 text-white py-2 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2">
                  {saving ? 'Saving...' : <><span>Save Products</span><ArrowRight className="w-4 h-4" /></>}
                </button>
              </div>
            </div>
          )}

          {/* Step 5 — Customers */}
          {step === 5 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-bold text-gray-900">Add Your First Customers</h2>
                <p className="text-sm text-gray-500">Add up to 5 customers now — more can be added in the Customers page.</p>
              </div>
              <div className="space-y-2">
                {customers.map((c, i) => (
                  <div key={i} className="grid grid-cols-4 gap-2 items-center">
                    <input value={c.name} onChange={e => setCust(i, 'name', e.target.value)}
                      placeholder="Name *" className="border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" />
                    <input value={c.email} onChange={e => setCust(i, 'email', e.target.value)}
                      placeholder="Email" className="border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" />
                    <input value={c.phone} onChange={e => setCust(i, 'phone', e.target.value)}
                      placeholder="Phone" className="border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" />
                    <button onClick={() => removeCust(i)} className="text-red-400 hover:text-red-600 flex justify-center">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
              <button onClick={addCust} className="text-sm text-blue-600 hover:underline">+ Add another customer</button>
              <div className="flex gap-2 pt-2">
                <button onClick={skip} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">Skip</button>
                <button onClick={saveCustomers} disabled={saving}
                  className="flex-1 bg-blue-600 text-white py-2 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2">
                  {saving ? 'Saving...' : <><span>Save Customers</span><ArrowRight className="w-4 h-4" /></>}
                </button>
              </div>
            </div>
          )}

          {/* Step 6 — Done */}
          {step === 6 && (
            <div className="text-center space-y-5">
              <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle className="w-12 h-12 text-green-500" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900">You're all set! 🎉</h2>
                <p className="text-gray-500 mt-2">Your warehouse management system is ready to go.</p>
              </div>
              <div className="grid grid-cols-2 gap-3 text-left">
                {[
                  { label: 'Company profile', done: completed.has(1) },
                  { label: 'Warehouses', done: completed.has(2) },
                  { label: 'Categories', done: completed.has(3) },
                  { label: 'Products', done: completed.has(4) },
                  { label: 'Customers', done: completed.has(5) },
                ].map(({ label, done }) => (
                  <div key={label} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
                    {done
                      ? <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                      : <Circle className="w-4 h-4 text-gray-300 flex-shrink-0" />}
                    <span className={`text-sm ${done ? 'text-gray-800' : 'text-gray-400'}`}>{label}</span>
                  </div>
                ))}
              </div>
              <div className="space-y-2">
                <button onClick={() => navigate('/dashboard')}
                  className="w-full bg-blue-600 text-white py-3 rounded-xl font-semibold hover:bg-blue-700 flex items-center justify-center gap-2">
                  <Rocket className="w-5 h-5" /> Go to Dashboard
                </button>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: 'Add SKUs', path: '/skus' },
                    { label: 'New Order', path: '/orders' },
                    { label: 'Settings', path: '/settings' },
                  ].map(({ label, path }) => (
                    <button key={label} onClick={() => navigate(path)}
                      className="text-sm border border-gray-200 py-2 rounded-lg text-gray-600 hover:bg-gray-50">
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
