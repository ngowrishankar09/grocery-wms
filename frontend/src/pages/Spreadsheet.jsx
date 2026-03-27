import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { sheetsAPI } from '../api/client'
import {
  Plus, Trash2, Download, RefreshCw, Edit2,
  FileSpreadsheet, MoreHorizontal, Wifi, WifiOff, BookOpen,
  Bold, Italic, Underline, Strikethrough,
  AlignLeft, AlignCenter, AlignRight,
  WrapText, ChevronDown, X, Filter, Merge
} from 'lucide-react'

// ─── Colour palettes ───────────────────────────────────────────────────────────
const THEME_COLOURS = [
  '#000000','#434343','#666666','#999999','#B7B7B7','#CCCCCC','#D9D9D9','#FFFFFF',
  '#FF0000','#FF9900','#FFFF00','#00FF00','#00FFFF','#4A86E8','#0000FF','#9900FF',
  '#FF00FF','#FF6D6D','#FFD966','#93C47D','#76A5AF','#6FA8DC','#8E7CC3','#C27BA0',
  '#EA9999','#F9CB9C','#FFE599','#B6D7A8','#A2C4C9','#9FC5E8','#B4A7D6','#D5A6BD',
  '#E06666','#F6B26B','#FFD966','#6AA84F','#45818E','#3D85C6','#674EA7','#A64D79',
  '#CC0000','#E69138','#F1C232','#38761D','#134F5C','#1155CC','#351C75','#741B47',
  '#990000','#B45F06','#7F6000','#274E13','#0C343D','#1C4587','#20124D','#4C1130',
]

const ROW_HIGHLIGHT_COLOURS = [
  { label:'None',   hex: null       },
  { label:'Red',    hex: '#FFCCCC'  },
  { label:'Orange', hex: '#FFE0B2'  },
  { label:'Yellow', hex: '#FFF9C4'  },
  { label:'Green',  hex: '#C8E6C9'  },
  { label:'Blue',   hex: '#BBDEFB'  },
  { label:'Purple', hex: '#E1BEE7'  },
  { label:'Pink',   hex: '#F8BBD9'  },
  { label:'Gray',   hex: '#E0E0E0'  },
]

const FONT_SIZES = [6,7,8,9,10,11,12,13,14,16,18,20,22,24,26,28,32,36,40,48,56,64,72]

// ─── Border options ────────────────────────────────────────────────────────────
const BORDER_OPTIONS = [
  { value: 'none',   label: 'No Border',     icon: '⬜' },
  { value: 'all',    label: 'All Borders',   icon: '⊞' },
  { value: 'outer',  label: 'Outer Border',  icon: '▣' },
  { value: 'bottom', label: 'Bottom Only',   icon: '⬛' },
  { value: 'top',    label: 'Top Only',      icon: '🔝' },
  { value: 'left',   label: 'Left Only',     icon: '◧' },
  { value: 'right',  label: 'Right Only',    icon: '◨' },
  { value: 'inner',  label: 'Inner Borders', icon: '⊟' },
  { value: 'thick',  label: 'Thick Outer',   icon: '⬛' },
  { value: 'double', label: 'Double',        icon: '⏫' },
]

// ─── Formula evaluator ────────────────────────────────────────────────────────
// Evaluates Excel-like formulas client-side
class FormulaEngine {
  constructor(getCellValue) {
    this.getCellValue = getCellValue  // (colName, rowNum) => string|number
  }

  // Parse cell ref like "A1", "B3", sheet-relative
  parseCellRef(ref) {
    const m = ref.trim().toUpperCase().match(/^([A-Z]+)(\d+)$/)
    if (!m) return null
    return { col: m[1], row: parseInt(m[2]) }
  }

  // Parse range like "A1:C3"
  parseRange(range) {
    const parts = range.split(':')
    if (parts.length !== 2) return null
    const s = this.parseCellRef(parts[0])
    const e = this.parseCellRef(parts[1])
    if (!s || !e) return null
    return { startCol: s.col, startRow: s.row, endCol: e.col, endRow: e.row }
  }

  // Get all values in a range
  getRangeValues(range) {
    const r = this.parseRange(range)
    if (!r) return []
    const vals = []
    const startColNum = this.colLetterToNum(r.startCol)
    const endColNum   = this.colLetterToNum(r.endCol)
    for (let ri = r.startRow; ri <= r.endRow; ri++) {
      for (let ci = startColNum; ci <= endColNum; ci++) {
        const col = this.numToColLetter(ci)
        const v = this.getCellValue(col, ri)
        vals.push(v)
      }
    }
    return vals
  }

  colLetterToNum(col) {
    let n = 0
    for (let i = 0; i < col.length; i++) n = n * 26 + (col.charCodeAt(i) - 64)
    return n
  }

  numToColLetter(n) {
    let s = ''
    while (n > 0) { s = String.fromCharCode(((n - 1) % 26) + 65) + s; n = Math.floor((n - 1) / 26) }
    return s
  }

  toNum(v) {
    if (v === null || v === undefined || v === '') return 0
    const n = parseFloat(String(v).replace(/,/g, ''))
    return isNaN(n) ? 0 : n
  }

  // Main evaluate entry point
  evaluate(formula, depth = 0) {
    if (depth > 20) return '#REF!'
    if (!formula.startsWith('=')) return formula
    const expr = formula.slice(1).trim()
    try {
      return this._eval(expr, depth)
    } catch (e) {
      return '#ERR!'
    }
  }

  _eval(expr, depth) {
    const upper = expr.trim().toUpperCase()

    // ── String literals ──
    if (expr.trim().startsWith('"')) {
      const m = expr.trim().match(/^"((?:[^"\\]|\\.)*)"$/)
      if (m) return m[1].replace(/\\"/g, '"')
    }

    // ── Functions ──
    const fnMatch = expr.trim().match(/^([A-Z_]+)\s*\((.*)\)$/is)
    if (fnMatch) {
      const fn = fnMatch[1].toUpperCase()
      const argsStr = fnMatch[2]
      return this._callFn(fn, argsStr, depth)
    }

    // ── Cell ref ──
    const cellRef = this.parseCellRef(expr.trim())
    if (cellRef) {
      const v = this.getCellValue(cellRef.col, cellRef.row)
      if (v && String(v).startsWith('=')) return this.evaluate(v, depth + 1)
      return v === undefined || v === null ? '' : v
    }

    // ── Arithmetic / comparison using safe eval ──
    return this._safeArith(expr, depth)
  }

  _splitArgs(argsStr) {
    const args = []
    let depth = 0, current = '', inStr = false
    for (let i = 0; i < argsStr.length; i++) {
      const ch = argsStr[i]
      if (ch === '"' && argsStr[i - 1] !== '\\') inStr = !inStr
      if (!inStr && ch === '(') depth++
      if (!inStr && ch === ')') depth--
      if (!inStr && depth === 0 && ch === ',') {
        args.push(current.trim())
        current = ''
      } else {
        current += ch
      }
    }
    if (current.trim()) args.push(current.trim())
    return args
  }

  _evalArg(arg, depth) {
    const trimmed = arg.trim()
    // String literal
    if (trimmed.startsWith('"')) {
      const m = trimmed.match(/^"((?:[^"\\]|\\.)*)"$/)
      return m ? m[1] : trimmed
    }
    // Number
    const n = parseFloat(trimmed)
    if (!isNaN(n) && trimmed !== '') return n
    // Boolean
    if (trimmed.toUpperCase() === 'TRUE') return true
    if (trimmed.toUpperCase() === 'FALSE') return false
    // Range → array of values
    if (trimmed.includes(':')) return this.getRangeValues(trimmed)
    // Cell ref
    const cellRef = this.parseCellRef(trimmed)
    if (cellRef) {
      const v = this.getCellValue(cellRef.col, cellRef.row)
      if (v && String(v).startsWith('=')) return this.evaluate(v, depth + 1)
      return v === undefined || v === null ? '' : v
    }
    // Sub-expression
    return this._eval(trimmed, depth + 1)
  }

  _callFn(fn, argsStr, depth) {
    const rawArgs = this._splitArgs(argsStr)
    const getArg = (i) => this._evalArg(rawArgs[i] || '', depth)
    const getAllNums = () => {
      const all = []
      rawArgs.forEach(a => {
        const v = this._evalArg(a, depth)
        if (Array.isArray(v)) v.forEach(x => { const n = this.toNum(x); if (!isNaN(n)) all.push(n) })
        else { const n = this.toNum(v); if (!isNaN(n)) all.push(n) }
      })
      return all
    }

    switch (fn) {
      case 'SUM': {
        return getAllNums().reduce((a, b) => a + b, 0)
      }
      case 'AVERAGE': case 'AVG': {
        const ns = getAllNums()
        return ns.length ? ns.reduce((a, b) => a + b, 0) / ns.length : 0
      }
      case 'COUNT': {
        const all = []
        rawArgs.forEach(a => {
          const v = this._evalArg(a, depth)
          if (Array.isArray(v)) v.forEach(x => { if (x !== '' && x !== null) all.push(x) })
          else if (v !== '' && v !== null) all.push(v)
        })
        return all.filter(x => !isNaN(parseFloat(x))).length
      }
      case 'COUNTA': {
        const all = []
        rawArgs.forEach(a => {
          const v = this._evalArg(a, depth)
          if (Array.isArray(v)) v.forEach(x => { if (x !== '') all.push(x) })
          else if (v !== '') all.push(v)
        })
        return all.length
      }
      case 'MAX': {
        const ns = getAllNums()
        return ns.length ? Math.max(...ns) : 0
      }
      case 'MIN': {
        const ns = getAllNums()
        return ns.length ? Math.min(...ns) : 0
      }
      case 'ROUND': {
        const num = this.toNum(getArg(0))
        const dp  = rawArgs.length > 1 ? parseInt(getArg(1)) : 0
        return parseFloat(num.toFixed(dp))
      }
      case 'FLOOR': return Math.floor(this.toNum(getArg(0)))
      case 'CEIL': case 'CEILING': return Math.ceil(this.toNum(getArg(0)))
      case 'ABS': return Math.abs(this.toNum(getArg(0)))
      case 'SQRT': return Math.sqrt(this.toNum(getArg(0)))
      case 'POWER': case 'POW': return Math.pow(this.toNum(getArg(0)), this.toNum(getArg(1)))
      case 'MOD': return this.toNum(getArg(0)) % this.toNum(getArg(1))
      case 'LEN': return String(getArg(0) ?? '').length
      case 'UPPER': return String(getArg(0) ?? '').toUpperCase()
      case 'LOWER': return String(getArg(0) ?? '').toLowerCase()
      case 'TRIM': return String(getArg(0) ?? '').trim()
      case 'LEFT': return String(getArg(0) ?? '').slice(0, this.toNum(getArg(1)))
      case 'RIGHT': {
        const s = String(getArg(0) ?? '')
        return s.slice(Math.max(0, s.length - this.toNum(getArg(1))))
      }
      case 'MID': {
        const s = String(getArg(0) ?? '')
        const start = this.toNum(getArg(1)) - 1
        const len   = this.toNum(getArg(2))
        return s.slice(start, start + len)
      }
      case 'CONCAT': case 'CONCATENATE': {
        return rawArgs.map(a => {
          const v = this._evalArg(a, depth)
          return Array.isArray(v) ? v.join('') : String(v ?? '')
        }).join('')
      }
      case 'TEXT': {
        const val = this.toNum(getArg(0))
        const fmt = String(getArg(1) ?? '')
        if (fmt.includes('%')) return (val * (fmt.includes('%') ? 100 : 1)).toFixed(fmt.replace(/[^0]/g, '').length) + '%'
        const dp = (fmt.split('.')[1] || '').length
        return val.toFixed(dp)
      }
      case 'VALUE': return this.toNum(getArg(0))
      case 'IF': {
        const cond = getArg(0)
        const isTrue = cond === true || cond === 'TRUE' || (typeof cond === 'number' && cond !== 0) || (typeof cond === 'string' && cond !== '' && cond !== '0' && cond !== 'FALSE')
        return isTrue ? getArg(1) : getArg(2)
      }
      case 'IFS': {
        for (let i = 0; i < rawArgs.length - 1; i += 2) {
          const cond = this._evalArg(rawArgs[i], depth)
          const isTrue = cond === true || (typeof cond === 'number' && cond !== 0) || cond === 'TRUE'
          if (isTrue) return this._evalArg(rawArgs[i + 1], depth)
        }
        return ''
      }
      case 'AND': {
        return rawArgs.every(a => {
          const v = this._evalArg(a, depth)
          return v === true || v === 'TRUE' || (typeof v === 'number' && v !== 0)
        })
      }
      case 'OR': {
        return rawArgs.some(a => {
          const v = this._evalArg(a, depth)
          return v === true || v === 'TRUE' || (typeof v === 'number' && v !== 0)
        })
      }
      case 'NOT': return !getArg(0)
      case 'ISBLANK': return getArg(0) === '' || getArg(0) === null || getArg(0) === undefined
      case 'ISNUMBER': return !isNaN(parseFloat(getArg(0)))
      case 'ISTEXT': return isNaN(parseFloat(getArg(0))) && getArg(0) !== ''
      case 'ISERROR': {
        const v = String(getArg(0))
        return v.startsWith('#')
      }
      case 'SUMIF': {
        const range   = this._evalArg(rawArgs[0], depth)
        const crit    = getArg(1)
        const sumRange = rawArgs[2] ? this._evalArg(rawArgs[2], depth) : range
        const rangeArr = Array.isArray(range) ? range : [range]
        const sumArr   = Array.isArray(sumRange) ? sumRange : [sumRange]
        let total = 0
        rangeArr.forEach((v, i) => {
          if (this._matchCriteria(v, crit)) total += this.toNum(sumArr[i] ?? 0)
        })
        return total
      }
      case 'COUNTIF': {
        const range = this._evalArg(rawArgs[0], depth)
        const crit  = getArg(1)
        const arr   = Array.isArray(range) ? range : [range]
        return arr.filter(v => this._matchCriteria(v, crit)).length
      }
      case 'VLOOKUP': {
        const lookupVal  = getArg(0)
        const tableRange = rawArgs[1]
        const colIndex   = this.toNum(getArg(2)) // 1-based
        const exactMatch = rawArgs.length > 3 ? getArg(3) : false
        const isExact    = exactMatch === false || exactMatch === 'FALSE' || exactMatch === 0

        const tableArr = this._evalArg(tableRange, depth)
        // tableArr is flat — need to know ncols to restructure
        const tRange = this.parseRange(tableRange)
        if (!tRange) return '#N/A'
        const tNCols = this.colLetterToNum(tRange.endCol) - this.colLetterToNum(tRange.startCol) + 1
        const tNRows = tRange.endRow - tRange.startRow + 1
        const arr    = Array.isArray(tableArr) ? tableArr : [tableArr]

        let resultRow = null
        for (let ri = 0; ri < tNRows; ri++) {
          const firstVal = arr[ri * tNCols]
          const match = isExact
            ? String(firstVal).toLowerCase() === String(lookupVal).toLowerCase()
            : this.toNum(firstVal) <= this.toNum(lookupVal)

          if (isExact && match) { resultRow = ri; break }
          if (!isExact && match) resultRow = ri
        }
        if (resultRow === null) return '#N/A'
        const colIdx = Math.max(1, Math.min(colIndex, tNCols))
        return arr[resultRow * tNCols + (colIdx - 1)] ?? ''
      }
      case 'HLOOKUP': {
        const lookupVal = getArg(0)
        const tableRange = rawArgs[1]
        const rowIndex  = this.toNum(getArg(2))
        const isExact   = !getArg(3)

        const tRange = this.parseRange(tableRange)
        if (!tRange) return '#N/A'
        const tNCols = this.colLetterToNum(tRange.endCol) - this.colLetterToNum(tRange.startCol) + 1
        const arr = this._evalArg(tableRange, depth)
        const flat = Array.isArray(arr) ? arr : [arr]

        let colResult = null
        for (let ci = 0; ci < tNCols; ci++) {
          const v = flat[ci]
          if (isExact && String(v).toLowerCase() === String(lookupVal).toLowerCase()) { colResult = ci; break }
        }
        if (colResult === null) return '#N/A'
        return flat[(rowIndex - 1) * tNCols + colResult] ?? ''
      }
      case 'INDEX': {
        const arr = this._evalArg(rawArgs[0], depth)
        const ri  = this.toNum(getArg(1)) - 1
        const ci  = rawArgs[2] ? this.toNum(getArg(2)) - 1 : 0
        const flat = Array.isArray(arr) ? arr : [arr]
        const tRange = this.parseRange(rawArgs[0])
        if (tRange) {
          const nCols = this.colLetterToNum(tRange.endCol) - this.colLetterToNum(tRange.startCol) + 1
          return flat[ri * nCols + ci] ?? ''
        }
        return flat[ri] ?? ''
      }
      case 'MATCH': {
        const lookupVal = getArg(0)
        const arr       = this._evalArg(rawArgs[1], depth)
        const flat      = Array.isArray(arr) ? arr : [arr]
        const idx = flat.findIndex(v => String(v).toLowerCase() === String(lookupVal).toLowerCase())
        return idx >= 0 ? idx + 1 : '#N/A'
      }
      case 'TODAY': return new Date().toLocaleDateString()
      case 'NOW':   return new Date().toLocaleString()
      case 'YEAR':  return new Date().getFullYear()
      case 'MONTH': return new Date().getMonth() + 1
      case 'DAY':   return new Date().getDate()
      default: return `#NAME?`
    }
  }

  _matchCriteria(value, criteria) {
    const crit = String(criteria)
    if (crit.startsWith('>=')) return this.toNum(value) >= this.toNum(crit.slice(2))
    if (crit.startsWith('<=')) return this.toNum(value) <= this.toNum(crit.slice(2))
    if (crit.startsWith('>'))  return this.toNum(value) >  this.toNum(crit.slice(1))
    if (crit.startsWith('<'))  return this.toNum(value) <  this.toNum(crit.slice(1))
    if (crit.startsWith('<>')) return String(value).toLowerCase() !== crit.slice(2).toLowerCase()
    return String(value).toLowerCase() === crit.toLowerCase()
  }

  _safeArith(expr, depth) {
    // Replace cell refs with their values
    const resolved = expr.replace(/[A-Z]+\d+/gi, (ref) => {
      const cr = this.parseCellRef(ref)
      if (!cr) return ref
      const v = this.getCellValue(cr.col, cr.row)
      if (v && String(v).startsWith('=')) {
        const ev = this.evaluate(v, depth + 1)
        const n = parseFloat(ev)
        return isNaN(n) ? `"${ev}"` : n
      }
      const n = parseFloat(v)
      return isNaN(n) ? `"${v || ''}"` : n
    })

    // Only allow safe arithmetic chars
    if (!/^[\d\s+\-*/().,<>=!&|"'%^]+$/.test(resolved)) return '#ERR!'
    try {
      // eslint-disable-next-line no-new-func
      const result = new Function(`"use strict"; return (${resolved})`)()
      if (result === null || result === undefined) return ''
      if (typeof result === 'boolean') return result ? 'TRUE' : 'FALSE'
      return result
    } catch {
      return '#ERR!'
    }
  }
}

// ─── Colour picker popup ───────────────────────────────────────────────────────
function ColourPopup({ onPick, onClose, includeNone = false }) {
  const ref = useRef(null)
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose() }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [onClose])

  return (
    <div ref={ref} className="absolute z-50 top-full mt-1 bg-white rounded-xl shadow-2xl border border-gray-200 p-3 w-56">
      {includeNone && (
        <button
          onClick={() => { onPick(null); onClose() }}
          className="w-full text-left text-xs text-gray-500 hover:text-gray-900 mb-2 px-1 py-0.5 hover:bg-gray-100 rounded"
        >
          ✕ No colour
        </button>
      )}
      <div className="grid grid-cols-8 gap-1">
        {THEME_COLOURS.map(c => (
          <button
            key={c}
            title={c}
            onClick={() => { onPick(c); onClose() }}
            className="w-5 h-5 rounded-sm border border-gray-200 hover:scale-125 transition-transform flex-shrink-0"
            style={{ backgroundColor: c }}
          />
        ))}
      </div>
      <div className="mt-2 pt-2 border-t border-gray-100">
        <input
          type="color"
          className="w-full h-7 rounded cursor-pointer border-0"
          onChange={e => onPick(e.target.value)}
          title="Custom colour"
        />
      </div>
    </div>
  )
}

// ─── Border picker popup ───────────────────────────────────────────────────────
function BorderPopup({ current, onPick, onClose }) {
  const ref = useRef(null)
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose() }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [onClose])

  return (
    <div ref={ref} className="absolute z-50 top-full left-0 mt-1 bg-white rounded-xl shadow-2xl border border-gray-200 p-2 w-48">
      <div className="text-xs font-semibold text-gray-500 mb-1 px-1">Cell Borders</div>
      {BORDER_OPTIONS.map(opt => (
        <button key={opt.value} onClick={() => { onPick(opt.value); onClose() }}
          className={`w-full text-left flex items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-blue-50 transition-colors ${current === opt.value ? 'bg-blue-100 text-blue-700 font-medium' : 'text-gray-700'}`}>
          <span className="w-5 text-center">{opt.icon}</span>
          {opt.label}
        </button>
      ))}
    </div>
  )
}

// ─── Context menu ──────────────────────────────────────────────────────────────
function ContextMenu({ x, y, items, onClose }) {
  const ref = useRef(null)
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose() }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [onClose])

  return (
    <div
      ref={ref}
      style={{ position: 'fixed', left: x, top: y, zIndex: 9999 }}
      className="bg-white rounded-xl shadow-2xl border border-gray-100 py-1 min-w-[200px]"
    >
      {items.map((item, i) =>
        item === 'divider' ? (
          <div key={i} className="my-1 border-t border-gray-100" />
        ) : (
          <button
            key={i}
            onClick={() => { item.action(); onClose() }}
            className={`w-full text-left px-4 py-2 text-sm flex items-center gap-2 hover:bg-gray-50 transition-colors ${item.danger ? 'text-red-600 hover:bg-red-50' : 'text-gray-700'}`}
          >
            {item.icon && <item.icon size={14} className="flex-shrink-0" />}
            {item.label}
          </button>
        )
      )}
    </div>
  )
}

// ─── Toolbar button ────────────────────────────────────────────────────────────
function TBtn({ active, title, onClick, children, className = '' }) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={`flex items-center justify-center rounded px-1.5 py-1 transition-colors select-none
        ${active
          ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
          : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}
        ${className}`}
    >
      {children}
    </button>
  )
}

function TDiv() {
  return <div className="w-px h-5 bg-gray-200 mx-0.5 flex-shrink-0" />
}

// ─── Inline rename input ───────────────────────────────────────────────────────
function InlineEdit({ value, onSave, onCancel, className = '' }) {
  const [val, setVal] = useState(value)
  const ref = useRef(null)
  useEffect(() => ref.current?.select(), [])
  return (
    <input
      ref={ref}
      value={val}
      onChange={e => setVal(e.target.value)}
      onKeyDown={e => {
        if (e.key === 'Enter')  { onSave(val.trim() || value) }
        if (e.key === 'Escape') { onCancel() }
      }}
      onBlur={() => onSave(val.trim() || value)}
      className={`border border-blue-400 rounded px-1 text-sm outline-none focus:ring-2 focus:ring-blue-300 ${className}`}
    />
  )
}

// ─── Default blank cell fmt ────────────────────────────────────────────────────
const BLANK_FMT = {
  value:'', bold:false, italic:false, underline:false, strike:false,
  font_size:13, font_colour:'', fill_colour:'', align:'left', wrap:false, border:'none'
}

// ─── Build CSS border style from border value ──────────────────────────────────
function buildBorderStyle(border, isActive) {
  if (!border || border === 'none') return {}
  const thin = '1px solid #374151'
  const thick = '2.5px solid #374151'
  const dbl = '3px double #374151'
  switch (border) {
    case 'all':    return { borderTop: thin, borderBottom: thin, borderLeft: thin, borderRight: thin }
    case 'outer':  return { outline: `1px solid #374151`, outlineOffset: '-1px' }
    case 'bottom': return { borderBottom: thick }
    case 'top':    return { borderTop: thick }
    case 'left':   return { borderLeft: thick }
    case 'right':  return { borderRight: thick }
    case 'inner':  return { borderTop: thin, borderLeft: thin }
    case 'thick':  return { outline: `2.5px solid #374151`, outlineOffset: '-1px' }
    case 'double': return { outline: dbl, outlineOffset: '-2px' }
    default: return {}
  }
}

// ─── Formula bar ──────────────────────────────────────────────────────────────
function FormulaBar({ activeRef, rawValue, displayValue, isEditing, onStartEdit, onCommit, onCancel, onChange, colName }) {
  return (
    <div className="flex items-center gap-1 px-2 py-1 border-b border-gray-200 bg-white flex-shrink-0">
      <div className="flex items-center gap-1 min-w-[70px] border border-gray-200 rounded px-2 py-0.5 bg-gray-50 text-xs font-mono text-gray-500">
        {activeRef || ''}
      </div>
      <div className="text-gray-300 text-sm select-none">fx</div>
      <input
        value={isEditing ? rawValue : (rawValue || '')}
        onChange={e => onChange(e.target.value)}
        onFocus={onStartEdit}
        onBlur={onCommit}
        onKeyDown={e => {
          if (e.key === 'Escape') { e.preventDefault(); onCancel() }
          if (e.key === 'Enter') { e.preventDefault(); onCommit() }
        }}
        className="flex-1 border border-gray-200 rounded px-2 py-0.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400"
        placeholder="Enter value or formula (e.g. =SUM(A1:A10))"
        spellCheck={false}
      />
    </div>
  )
}

// ─── Sheet Grid ───────────────────────────────────────────────────────────────
function SheetGrid({ workbookId, sheet, onDataChange }) {
  const [cells,          setCells]          = useState({})
  const [activeCell,     setActiveCell]     = useState(null)   // {rowIdx, colIdx}
  const [anchor,         setAnchor]         = useState(null)
  const [rangeEnd,       setRangeEnd]       = useState(null)
  // Non-contiguous selections: each entry is {anchor, rangeEnd} committed by Ctrl/Cmd+click
  const [extraSelections, setExtraSelections] = useState([])
  const [isEditing,    setIsEditing]    = useState(false)
  const [editVal,      setEditVal]      = useState('')
  const [contextMenu,  setContextMenu]  = useState(null)
  const [colWidths,    setColWidths]    = useState({})
  const [resizing,     setResizing]     = useState(null)
  const [rowCtxColour, setRowCtxColour] = useState(null)
  const [renamingCol,  setRenamingCol]  = useState(null)
  // Merge map: key = "rowId_colId" → {rowspan, colspan} or null
  const [merges,       setMerges]       = useState({})
  // Filter state: colId → { active: bool, values: Set<string> of shown values }
  const [filters,      setFilters]      = useState({})
  const [filterOpen,   setFilterOpen]   = useState(null)  // colId that has filter dropdown open

  // Toolbar state
  const [fmt,            setFmt]            = useState({ ...BLANK_FMT })
  const [showFontColour, setShowFontColour] = useState(false)
  const [showFillColour, setShowFillColour] = useState(false)
  const [showFontSize,   setShowFontSize]   = useState(false)
  const [showBorder,     setShowBorder]     = useState(false)

  const undoStackRef  = useRef([])
  const redoStackRef  = useRef([])
  const pendingRef    = useRef({})
  const saveTimerRef  = useRef(null)
  const gridRef       = useRef(null)
  const mouseDownRef  = useRef(false)
  const editInputRef  = useRef(null)
  // when true the cell was opened by a single keypress (replace mode) → cursor goes to end
  const editReplaceModeRef = useRef(false)

  const numRows = sheet.rows.length
  const numCols = sheet.columns.length
  const selKey  = (rowId, colId) => `${rowId}_${colId}`

  // ── Build column index (name → colIdx, 0-based) ──────────────
  // For formula engine: col letter (A, B, …) maps to column by position
  const colIndexByLetter = useMemo(() => {
    const map = {}
    sheet.columns.forEach((col, idx) => {
      // Map by Excel-style letter (A=0, B=1, …)
      const letter = String.fromCharCode(65 + idx)
      map[letter] = idx
      // Also map uppercase version of the actual column name
      map[col.name.toUpperCase()] = idx
    })
    return map
  }, [sheet.columns])

  const rowIndexByNum = useMemo(() => {
    const map = {}
    sheet.rows.forEach((row, idx) => { map[idx + 1] = idx })
    return map
  }, [sheet.rows])

  // ── Formula engine ───────────────────────────────────────────
  const formulaEngine = useMemo(() => {
    const getCellValue = (colLetter, rowNum) => {
      const ci = colIndexByLetter[colLetter.toUpperCase()]
      const ri = rowIndexByNum[rowNum]
      if (ci === undefined || ri === undefined) return ''
      const col = sheet.columns[ci]
      const row = sheet.rows[ri]
      if (!col || !row) return ''
      const c = cells[`${row.id}_${col.id}`]
      return c?.value || ''
    }
    return new FormulaEngine(getCellValue)
  }, [cells, sheet.columns, sheet.rows, colIndexByLetter, rowIndexByNum])

  // ── Compute display value (evaluate formula if needed) ───────
  const getDisplayValue = useCallback((rawValue) => {
    if (!rawValue || !String(rawValue).startsWith('=')) return rawValue || ''
    return formulaEngine.evaluate(rawValue)
  }, [formulaEngine])

  // ── Compute filtered rows ─────────────────────────────────────
  const visibleRows = useMemo(() => {
    const activeFilters = Object.entries(filters).filter(([, f]) => f.active && f.values.size > 0)
    if (!activeFilters.length) return sheet.rows.map((_, i) => i)  // all row indices

    return sheet.rows.reduce((acc, row, ri) => {
      const passes = activeFilters.every(([colId, f]) => {
        const key = `${row.id}_${colId}`
        const cell = cells[key]
        const raw = cell?.value || ''
        const disp = getDisplayValue(raw)
        return f.values.has(String(disp))
      })
      if (passes) acc.push(ri)
      return acc
    }, [])
  }, [sheet.rows, cells, filters, getDisplayValue])

  // ── Selected set ─────────────────────────────────────────────
  const buildRangeSet = useCallback((anch, end) => {
    if (!anch) return new Set()
    const rMin = Math.min(anch.rowIdx, (end || anch).rowIdx)
    const rMax = Math.max(anch.rowIdx, (end || anch).rowIdx)
    const cMin = Math.min(anch.colIdx, (end || anch).colIdx)
    const cMax = Math.max(anch.colIdx, (end || anch).colIdx)
    const s = new Set()
    for (let ri = rMin; ri <= rMax; ri++) {
      for (let ci = cMin; ci <= cMax; ci++) {
        const r = sheet.rows[ri]; const c = sheet.columns[ci]
        if (r && c) s.add(selKey(r.id, c.id))
      }
    }
    return s
  }, [sheet.rows, sheet.columns])

  // Union of main selection + all extra (Ctrl) selections
  const selected = useMemo(() => {
    const s = buildRangeSet(anchor, rangeEnd)
    extraSelections.forEach(({ anchor: a, rangeEnd: re }) => {
      buildRangeSet(a, re).forEach(k => s.add(k))
    })
    return s
  }, [anchor, rangeEnd, extraSelections, buildRangeSet])

  const getCellFmt = useCallback((rowId, colId) => cells[`${rowId}_${colId}`] || BLANK_FMT, [cells])

  const activeRow = activeCell ? sheet.rows[activeCell.rowIdx]    : null
  const activeCol = activeCell ? sheet.columns[activeCell.colIdx] : null

  // Build cell reference string — shows multi-range when Ctrl selections exist
  const activeRef = useMemo(() => {
    if (!activeCell) return ''
    const toRef = (ri, ci) => `${String.fromCharCode(65 + ci)}${ri + 1}`
    const toRangeStr = (a, re) => {
      if (!a) return ''
      if (a.rowIdx === (re?.rowIdx ?? a.rowIdx) && a.colIdx === (re?.colIdx ?? a.colIdx))
        return toRef(a.rowIdx, a.colIdx)
      return `${toRef(a.rowIdx, a.colIdx)}:${toRef(re.rowIdx, re.colIdx)}`
    }
    if (extraSelections.length === 0) {
      return toRangeStr(anchor, rangeEnd)
    }
    const all = [...extraSelections.map(s => toRangeStr(s.anchor, s.rangeEnd)), toRangeStr(anchor, rangeEnd)]
    return all.filter(Boolean).join(', ')
  }, [activeCell, anchor, rangeEnd, extraSelections])

  const activeRaw = (activeRow && activeCol) ? (getCellFmt(activeRow.id, activeCol.id).value || '') : ''

  // ── Build cell map ───────────────────────────────────────────
  useEffect(() => {
    const map = {}
    sheet.rows.forEach(row => {
      Object.entries(row.cells).forEach(([colId, data]) => {
        map[`${row.id}_${colId}`] = data
      })
    })
    setCells(map)
    pendingRef.current = {}
    undoStackRef.current = []
    redoStackRef.current = []
    setMerges({})
    setFilters({})
  }, [sheet.id])

  // ── Toolbar reflects active cell ─────────────────────────────
  useEffect(() => {
    if (!activeRow || !activeCol) { setFmt({ ...BLANK_FMT }); return }
    setFmt({ ...BLANK_FMT, ...getCellFmt(activeRow.id, activeCol.id) })
  }, [activeCell, cells, activeRow, activeCol, getCellFmt])

  // ── Debounced save ───────────────────────────────────────────
  const scheduleSave = useCallback(() => {
    clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(async () => {
      const pending = { ...pendingRef.current }
      if (!Object.keys(pending).length) return
      pendingRef.current = {}
      const updates = Object.entries(pending).map(([key, data]) => {
        const [rowId, colId] = key.split('_').map(Number)
        return { row_id: rowId, col_id: colId, ...data }
      })
      try {
        await sheetsAPI.updateCells(workbookId, sheet.id, updates)
        onDataChange()
      } catch (err) { console.error('Save failed', err) }
    }, 600)
  }, [workbookId, sheet.id, onDataChange])

  // ── Apply patch to one cell ──────────────────────────────────
  const applyToCell = useCallback((rowId, colId, patch, pushUndo = true) => {
    setCells(prev => {
      if (pushUndo) {
        undoStackRef.current.push(prev)
        if (undoStackRef.current.length > 200) undoStackRef.current.shift()
        redoStackRef.current = []
      }
      const key = `${rowId}_${colId}`
      const cur = prev[key] || { ...BLANK_FMT }
      return { ...prev, [key]: { ...cur, ...patch } }
    })
    const key = `${rowId}_${colId}`
    pendingRef.current[key] = { ...(pendingRef.current[key] || {}), ...patch }
    scheduleSave()
  }, [scheduleSave])

  // ── Apply to selection ───────────────────────────────────────
  const applyFmtToSelection = useCallback((patch) => {
    setFmt(prev => ({ ...prev, ...patch }))
    setCells(prev => {
      undoStackRef.current.push(prev)
      if (undoStackRef.current.length > 200) undoStackRef.current.shift()
      redoStackRef.current = []
      const next = { ...prev }
      selected.forEach(key => {
        const [rowId, colId] = key.split('_').map(Number)
        const cur = next[key] || { ...BLANK_FMT }
        next[key] = { ...cur, ...patch }
        pendingRef.current[key] = { ...(pendingRef.current[key] || {}), ...patch }
      })
      return next
    })
    scheduleSave()
  }, [selected, scheduleSave])

  // ── Undo / Redo ──────────────────────────────────────────────
  const undo = useCallback(() => {
    if (!undoStackRef.current.length) return
    const prev = undoStackRef.current.pop()
    setCells(cur => { redoStackRef.current.push(cur); return prev })
    const updates = Object.entries(prev).map(([key, data]) => {
      const [rowId, colId] = key.split('_').map(Number)
      return { row_id: rowId, col_id: colId, ...data }
    })
    clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(async () => {
      if (updates.length) await sheetsAPI.updateCells(workbookId, sheet.id, updates).catch(() => {})
      onDataChange()
    }, 300)
  }, [workbookId, sheet.id, onDataChange])

  const redo = useCallback(() => {
    if (!redoStackRef.current.length) return
    const next = redoStackRef.current.pop()
    setCells(cur => { undoStackRef.current.push(cur); return next })
    const updates = Object.entries(next).map(([key, data]) => {
      const [rowId, colId] = key.split('_').map(Number)
      return { row_id: rowId, col_id: colId, ...data }
    })
    clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(async () => {
      if (updates.length) await sheetsAPI.updateCells(workbookId, sheet.id, updates).catch(() => {})
      onDataChange()
    }, 300)
  }, [workbookId, sheet.id, onDataChange])

  // ── Navigation ───────────────────────────────────────────────
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v))

  const moveTo = useCallback((rowIdx, colIdx, extendRange = false) => {
    const ri = clamp(rowIdx, 0, numRows - 1)
    const ci = clamp(colIdx, 0, numCols - 1)
    setActiveCell({ rowIdx: ri, colIdx: ci })
    if (extendRange) {
      setRangeEnd({ rowIdx: ri, colIdx: ci })
    } else {
      setAnchor({ rowIdx: ri, colIdx: ci })
      setRangeEnd({ rowIdx: ri, colIdx: ci })
      setExtraSelections([])   // clear non-contiguous selections on normal move
    }
    setIsEditing(false)
  }, [numRows, numCols])

  // ── Commit edit ──────────────────────────────────────────────
  const commitEdit = useCallback(() => {
    if (!isEditing || !activeRow || !activeCol) return
    applyToCell(activeRow.id, activeCol.id, { value: editVal })
    setIsEditing(false)
  }, [isEditing, activeRow, activeCol, editVal, applyToCell])

  // Focus grid when not editing
  useEffect(() => {
    if (!isEditing && gridRef.current) gridRef.current.focus()
  }, [activeCell, isEditing])

  // When edit mode opens in replace mode (single key), position cursor at end
  useEffect(() => {
    if (isEditing && editReplaceModeRef.current && editInputRef.current) {
      const el = editInputRef.current
      // Use requestAnimationFrame to ensure React has committed the value
      requestAnimationFrame(() => {
        const len = el.value.length
        el.setSelectionRange(len, len)
      })
      editReplaceModeRef.current = false
    }
  }, [isEditing, editVal])

  // ── Merge cells ──────────────────────────────────────────────
  const mergeSelection = useCallback(() => {
    if (!anchor || !rangeEnd) return
    const rMin = Math.min(anchor.rowIdx, rangeEnd.rowIdx)
    const rMax = Math.max(anchor.rowIdx, rangeEnd.rowIdx)
    const cMin = Math.min(anchor.colIdx, rangeEnd.colIdx)
    const cMax = Math.max(anchor.colIdx, rangeEnd.colIdx)
    if (rMin === rMax && cMin === cMax) return  // single cell

    const topRow = sheet.rows[rMin]
    const leftCol = sheet.columns[cMin]
    if (!topRow || !leftCol) return

    const topKey = `${topRow.id}_${leftCol.id}`
    const newMerges = { ...merges }

    // Mark top-left as merged
    newMerges[topKey] = { rowspan: rMax - rMin + 1, colspan: cMax - cMin + 1 }

    // Mark all other cells as hidden
    for (let ri = rMin; ri <= rMax; ri++) {
      for (let ci = cMin; ci <= cMax; ci++) {
        if (ri === rMin && ci === cMin) continue
        const r = sheet.rows[ri]; const c = sheet.columns[ci]
        if (r && c) newMerges[`${r.id}_${c.id}`] = 'hidden'
      }
    }
    setMerges(newMerges)
  }, [anchor, rangeEnd, sheet.rows, sheet.columns, merges])

  const unmergeSelection = useCallback(() => {
    if (!activeRow || !activeCol) return
    const key = `${activeRow.id}_${activeCol.id}`
    const merge = merges[key]
    if (!merge || merge === 'hidden') return
    const { rowspan, colspan } = merge
    const newMerges = { ...merges }

    // Find the top-left rowIdx/colIdx
    const rMin = sheet.rows.indexOf(activeRow)
    const cMin = sheet.columns.indexOf(activeCol)
    for (let ri = rMin; ri < rMin + rowspan; ri++) {
      for (let ci = cMin; ci < cMin + colspan; ci++) {
        const r = sheet.rows[ri]; const c = sheet.columns[ci]
        if (r && c) delete newMerges[`${r.id}_${c.id}`]
      }
    }
    setMerges(newMerges)
  }, [activeRow, activeCol, merges, sheet.rows, sheet.columns])

  // ── Filters ──────────────────────────────────────────────────
  const getColumnUniqueValues = useCallback((colId) => {
    const vals = new Set()
    sheet.rows.forEach(row => {
      const key = `${row.id}_${colId}`
      const cell = cells[key]
      const raw = cell?.value || ''
      const disp = String(getDisplayValue(raw))
      vals.add(disp)
    })
    return [...vals].sort()
  }, [sheet.rows, cells, getDisplayValue])

  const toggleFilter = useCallback((colId) => {
    setFilters(prev => {
      const existing = prev[colId]
      if (!existing) {
        // First time: show all values
        const allVals = new Set(getColumnUniqueValues(colId))
        return { ...prev, [colId]: { active: true, values: allVals } }
      }
      return { ...prev, [colId]: { ...existing, active: !existing.active } }
    })
  }, [getColumnUniqueValues])

  const setFilterValues = useCallback((colId, values) => {
    setFilters(prev => ({
      ...prev,
      [colId]: { active: true, values: new Set(values) }
    }))
  }, [])

  const clearFilter = useCallback((colId) => {
    setFilters(prev => {
      const next = { ...prev }
      delete next[colId]
      return next
    })
  }, [])

  const hasActiveFilter = (colId) => filters[colId]?.active && filters[colId]?.values?.size > 0

  // ── Column / row select ──────────────────────────────────────
  const selectColumn = (colIdx) => {
    if (!numRows) return
    setAnchor({ rowIdx: 0, colIdx })
    setRangeEnd({ rowIdx: numRows - 1, colIdx })
    setActiveCell({ rowIdx: 0, colIdx })
    setExtraSelections([])
    setIsEditing(false)
  }

  const selectRow = (rowIdx) => {
    if (!numCols) return
    setAnchor({ rowIdx, colIdx: 0 })
    setRangeEnd({ rowIdx, colIdx: numCols - 1 })
    setActiveCell({ rowIdx, colIdx: 0 })
    setExtraSelections([])
    setIsEditing(false)
  }

  const selectAll = () => {
    setAnchor({ rowIdx: 0, colIdx: 0 })
    setRangeEnd({ rowIdx: numRows - 1, colIdx: numCols - 1 })
    setActiveCell({ rowIdx: 0, colIdx: 0 })
    setExtraSelections([])
    setIsEditing(false)
  }

  const clearSelection = useCallback(() => {
    selected.forEach(key => {
      const [rowId, colId] = key.split('_').map(Number)
      applyToCell(rowId, colId, { value: '' }, false)
    })
    setCells(prev => {
      undoStackRef.current.push(prev); redoStackRef.current = []; return prev
    })
  }, [selected, applyToCell])

  // ── Cell style builder ───────────────────────────────────────
  const cellStyle = useCallback((rowId, colId, rowColour) => {
    const c = getCellFmt(rowId, colId)
    const s = {}
    if (c.fill_colour) s.backgroundColor = c.fill_colour
    else if (rowColour) s.backgroundColor = rowColour
    if (c.font_colour) s.color = c.font_colour
    if (c.font_size && c.font_size !== 13) s.fontSize = c.font_size + 'px'
    if (c.bold)      s.fontWeight = 'bold'
    if (c.italic)    s.fontStyle  = 'italic'
    const deco = [c.underline && 'underline', c.strike && 'line-through'].filter(Boolean).join(' ')
    if (deco) s.textDecoration = deco
    if (c.align && c.align !== 'left') s.textAlign = c.align
    if (c.wrap) { s.whiteSpace = 'pre-wrap'; s.wordBreak = 'break-word' }
    // Apply border styles
    const bStyle = buildBorderStyle(c.border)
    Object.assign(s, bStyle)
    return s
  }, [getCellFmt])

  // ── Column resize ────────────────────────────────────────────
  const startResize = (e, colId, currentWidth) => {
    e.preventDefault(); e.stopPropagation()
    setResizing({ colId, startX: e.clientX, startW: currentWidth })
  }
  useEffect(() => {
    if (!resizing) return
    const onMove = (e) => {
      const delta = e.clientX - resizing.startX
      setColWidths(prev => ({ ...prev, [resizing.colId]: Math.max(40, resizing.startW + delta) }))
    }
    const onUp = async () => {
      const w = colWidths[resizing.colId]
      setResizing(null)
      if (w) await sheetsAPI.renameColumn(workbookId, sheet.id, resizing.colId, undefined, w).catch(() => {})
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
  }, [resizing, colWidths, workbookId, sheet.id])

  // ── Row/col CRUD ─────────────────────────────────────────────
  const addRowBelow = async () => { await sheetsAPI.addRows(workbookId, sheet.id, 1); onDataChange() }
  const deleteRow   = async (rowId) => { await sheetsAPI.deleteRow(workbookId, sheet.id, rowId); onDataChange() }
  const setRowColour = async (rowId, hex) => { await sheetsAPI.updateRow(workbookId, sheet.id, rowId, hex); onDataChange(); setRowCtxColour(null) }
  const addColumn    = async () => { await sheetsAPI.addColumn(workbookId, sheet.id, `Col ${numCols + 1}`); onDataChange() }
  const deleteColumn = async (colId) => { await sheetsAPI.deleteColumn(workbookId, sheet.id, colId); onDataChange() }
  const renameCol    = async (colId, name) => { if (name?.trim()) await sheetsAPI.renameColumn(workbookId, sheet.id, colId, name.trim()); setRenamingCol(null); onDataChange() }

  // ── Main keyboard handler ────────────────────────────────────
  const handleGridKeyDown = (e) => {
    const ctrl = e.ctrlKey || e.metaKey
    const shift = e.shiftKey

    if (ctrl && e.key === 'z') { e.preventDefault(); undo(); return }
    if (ctrl && (e.key === 'y' || (shift && e.key === 'z'))) { e.preventDefault(); redo(); return }
    if (ctrl && e.key === 'a') { e.preventDefault(); selectAll(); return }
    if (ctrl && e.key === 'b') { e.preventDefault(); applyFmtToSelection({ bold: !fmt.bold }); return }
    if (ctrl && e.key === 'i') { e.preventDefault(); applyFmtToSelection({ italic: !fmt.italic }); return }
    if (ctrl && e.key === 'u') { e.preventDefault(); applyFmtToSelection({ underline: !fmt.underline }); return }

    if (!activeCell) return
    const { rowIdx, colIdx } = activeCell

    if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) {
      e.preventDefault()
      const dr = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0
      const dc = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
      if (shift) {
        setRangeEnd({
          rowIdx: clamp((rangeEnd?.rowIdx ?? rowIdx) + dr, 0, numRows - 1),
          colIdx: clamp((rangeEnd?.colIdx ?? colIdx) + dc, 0, numCols - 1),
        })
      } else {
        moveTo(rowIdx + dr, colIdx + dc)
      }
      return
    }

    if (e.key === 'Tab') {
      e.preventDefault(); moveTo(rowIdx, colIdx + (shift ? -1 : 1)); return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      if (shift) moveTo(rowIdx - 1, colIdx); else moveTo(rowIdx + 1, colIdx); return
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault(); clearSelection(); return
    }
    if (e.key === 'F2') {
      e.preventDefault()
      const row = sheet.rows[rowIdx]; const col = sheet.columns[colIdx]
      if (row && col) {
        editReplaceModeRef.current = false   // F2 = edit in place, cursor stays
        setEditVal(getCellFmt(row.id, col.id).value)
        setIsEditing(true)
      }
      return
    }
    if (e.key.length === 1 && !ctrl) {
      e.preventDefault()
      const row = sheet.rows[rowIdx]; const col = sheet.columns[colIdx]
      if (row && col) {
        editReplaceModeRef.current = true    // single key = replace mode, cursor goes to end
        setEditVal(e.key)
        setIsEditing(true)
      }
    }
  }

  const handleEditKeyDown = (e) => {
    const ctrl = e.ctrlKey || e.metaKey

    if (e.key === 'Escape') { e.preventDefault(); setIsEditing(false); setEditVal(''); return }

    // Alt+Enter or Ctrl+Enter = newline inside the cell (stay in edit mode)
    if (e.key === 'Enter' && (e.altKey || ctrl)) {
      e.preventDefault()
      const el = editInputRef.current
      if (el) {
        const start = el.selectionStart
        const end   = el.selectionEnd
        const next  = editVal.slice(0, start) + '\n' + editVal.slice(end)
        setEditVal(next)
        // move cursor after the newline
        requestAnimationFrame(() => el.setSelectionRange(start + 1, start + 1))
      }
      return
    }

    if (e.key === 'Tab') {
      e.preventDefault(); commitEdit()
      moveTo(activeCell.rowIdx, activeCell.colIdx + (e.shiftKey ? -1 : 1)); return
    }

    // Plain Enter (no modifier) = commit and move down
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault(); commitEdit()
      moveTo(activeCell.rowIdx + 1, activeCell.colIdx); return
    }
  }

  const ROW_NUM_W = 48

  // ── Filter dropdown component ────────────────────────────────
  function FilterDropdown({ colId, onClose }) {
    const [localVals, setLocalVals] = useState(() => {
      const current = filters[colId]
      const all = getColumnUniqueValues(colId)
      if (!current) return new Set(all)
      return new Set(current.values)
    })
    const allVals = getColumnUniqueValues(colId)
    const allChecked = allVals.every(v => localVals.has(v))

    const toggle = (v) => {
      setLocalVals(prev => {
        const next = new Set(prev)
        if (next.has(v)) next.delete(v); else next.add(v)
        return next
      })
    }

    return (
      <div className="absolute z-50 top-full left-0 mt-1 bg-white rounded-xl shadow-2xl border border-gray-200 p-2 min-w-[180px] max-h-64 flex flex-col">
        <div className="text-xs font-semibold text-gray-500 mb-1 px-1">Filter</div>
        <div className="flex items-center gap-1 px-1 mb-1">
          <label className="flex items-center gap-1 text-xs cursor-pointer">
            <input type="checkbox" checked={allChecked}
              onChange={() => setLocalVals(allChecked ? new Set() : new Set(allVals))}
              className="w-3 h-3"
            />
            (Select All)
          </label>
        </div>
        <div className="overflow-y-auto flex-1 divide-y divide-gray-50">
          {allVals.map(v => (
            <label key={v} className="flex items-center gap-1.5 px-1 py-1 text-xs cursor-pointer hover:bg-gray-50">
              <input type="checkbox" checked={localVals.has(v)} onChange={() => toggle(v)} className="w-3 h-3" />
              <span className="truncate">{v || '(blank)'}</span>
            </label>
          ))}
        </div>
        <div className="flex gap-1 mt-2 pt-2 border-t border-gray-100">
          <button onClick={() => { setFilterValues(colId, [...localVals]); onClose() }}
            className="flex-1 text-xs py-1 bg-blue-600 text-white rounded hover:bg-blue-700">Apply</button>
          <button onClick={() => { clearFilter(colId); onClose() }}
            className="flex-1 text-xs py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200">Clear</button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden bg-white">

      {/* ── TOOLBAR ── */}
      <div className="flex items-center gap-0.5 px-2 py-1 border-b border-gray-200 bg-gray-50 flex-shrink-0 flex-wrap">

        {/* Undo / Redo */}
        <TBtn title="Undo (Ctrl+Z)" onClick={undo}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 010 11H11"/></svg>
        </TBtn>
        <TBtn title="Redo (Ctrl+Y)" onClick={redo}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 14l5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 000 11H13"/></svg>
        </TBtn>

        <TDiv />

        {/* Font size */}
        <div className="relative flex items-center">
          <button onClick={() => setShowFontSize(v => !v)}
            className="flex items-center gap-0.5 border border-gray-300 rounded px-1.5 py-0.5 text-sm hover:bg-gray-100 h-7 min-w-[48px] justify-between">
            <span>{fmt.font_size || 13}</span>
            <ChevronDown size={10} className="text-gray-400" />
          </button>
          {showFontSize && (
            <div className="absolute z-50 top-full left-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl py-1 max-h-48 overflow-y-auto w-20">
              {FONT_SIZES.map(s => (
                <button key={s} onClick={() => { applyFmtToSelection({ font_size: s }); setShowFontSize(false) }}
                  className={`w-full text-left px-3 py-1 text-sm hover:bg-blue-50 hover:text-blue-700 ${fmt.font_size === s ? 'font-bold text-blue-600' : ''}`}>
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>

        <TDiv />

        <TBtn active={fmt.bold}      title="Bold (Ctrl+B)"      onClick={() => applyFmtToSelection({ bold:      !fmt.bold      })}><Bold          size={15} /></TBtn>
        <TBtn active={fmt.italic}    title="Italic (Ctrl+I)"    onClick={() => applyFmtToSelection({ italic:    !fmt.italic    })}><Italic        size={15} /></TBtn>
        <TBtn active={fmt.underline} title="Underline (Ctrl+U)" onClick={() => applyFmtToSelection({ underline: !fmt.underline })}><Underline     size={15} /></TBtn>
        <TBtn active={fmt.strike}    title="Strikethrough"      onClick={() => applyFmtToSelection({ strike:    !fmt.strike    })}><Strikethrough size={15} /></TBtn>

        <TDiv />

        {/* Font colour */}
        <div className="relative">
          <button title="Font colour" onClick={() => { setShowFontColour(v => !v); setShowFillColour(false); setShowBorder(false) }}
            className="flex flex-col items-center justify-center px-1.5 py-0.5 rounded hover:bg-gray-100 h-7 gap-0">
            <span className="text-sm font-bold leading-none" style={{ color: fmt.font_colour || '#000' }}>A</span>
            <div className="h-1 w-4 rounded-sm mt-0.5" style={{ backgroundColor: fmt.font_colour || '#000' }} />
          </button>
          {showFontColour && (
            <ColourPopup includeNone onPick={c => applyFmtToSelection({ font_colour: c || '' })} onClose={() => setShowFontColour(false)} />
          )}
        </div>

        {/* Fill colour */}
        <div className="relative">
          <button title="Fill colour" onClick={() => { setShowFillColour(v => !v); setShowFontColour(false); setShowBorder(false) }}
            className="flex flex-col items-center justify-center px-1.5 py-0.5 rounded hover:bg-gray-100 h-7 gap-0">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-600">
              <path d="M19 11H5m14 0a2 2 0 010 4H5a2 2 0 010-4m14 0V9a2 2 0 00-2-2H7a2 2 0 00-2 2v2m14 4v2a2 2 0 01-2 2H7a2 2 0 01-2-2v-2"/>
            </svg>
            <div className="h-1 w-4 rounded-sm mt-0.5" style={{ backgroundColor: fmt.fill_colour || 'transparent', border: fmt.fill_colour ? 'none' : '1px solid #ccc' }} />
          </button>
          {showFillColour && (
            <ColourPopup includeNone onPick={c => applyFmtToSelection({ fill_colour: c || '' })} onClose={() => setShowFillColour(false)} />
          )}
        </div>

        <TDiv />

        <TBtn active={!fmt.align || fmt.align === 'left'}  title="Align left"   onClick={() => applyFmtToSelection({ align: 'left'   })}><AlignLeft   size={15} /></TBtn>
        <TBtn active={fmt.align === 'center'}              title="Align center" onClick={() => applyFmtToSelection({ align: 'center' })}><AlignCenter size={15} /></TBtn>
        <TBtn active={fmt.align === 'right'}               title="Align right"  onClick={() => applyFmtToSelection({ align: 'right'  })}><AlignRight  size={15} /></TBtn>

        <TDiv />

        <TBtn active={fmt.wrap} title="Wrap text" onClick={() => applyFmtToSelection({ wrap: !fmt.wrap })}><WrapText size={15} /></TBtn>

        <TDiv />

        {/* Borders */}
        <div className="relative">
          <button title="Borders" onClick={() => { setShowBorder(v => !v); setShowFontColour(false); setShowFillColour(false) }}
            className={`flex items-center gap-0.5 px-1.5 py-1 rounded hover:bg-gray-100 text-gray-600 ${fmt.border && fmt.border !== 'none' ? 'bg-blue-100 text-blue-700' : ''}`}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="1"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="12" y1="3" x2="12" y2="21"/>
            </svg>
            <ChevronDown size={9} className="text-gray-400" />
          </button>
          {showBorder && (
            <BorderPopup current={fmt.border} onPick={b => applyFmtToSelection({ border: b })} onClose={() => setShowBorder(false)} />
          )}
        </div>

        <TDiv />

        {/* Merge cells */}
        <TBtn title="Merge selected cells" onClick={mergeSelection}>
          <Merge size={14} />
        </TBtn>
        {activeCell && merges[activeRow && activeCol ? `${activeRow.id}_${activeCol.id}` : ''] && merges[`${activeRow?.id}_${activeCol?.id}`] !== 'hidden' && (
          <TBtn title="Unmerge cells" onClick={unmergeSelection}>
            <span className="text-xs font-medium px-0.5">Unmerge</span>
          </TBtn>
        )}

        <TDiv />

        <TBtn title="Clear formatting" onClick={() => applyFmtToSelection({ bold:false, italic:false, underline:false, strike:false, font_size:13, font_colour:'', fill_colour:'', align:'left', wrap:false, border:'none' })}>
          <span className="text-xs font-medium px-0.5">Clear fmt</span>
        </TBtn>
        <TBtn title="Clear content (Delete)" onClick={clearSelection}>
          <span className="text-xs font-medium px-0.5">Clear</span>
        </TBtn>

        {selected.size > 1 && (
          <span className="ml-2 text-xs text-gray-400">{selected.size} cells</span>
        )}

        {/* Filter indicator */}
        {Object.values(filters).some(f => f.active) && (
          <span className="ml-1 flex items-center gap-1 text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
            <Filter size={10} /> Filtered
            <button onClick={() => setFilters({})} className="text-blue-400 hover:text-blue-700 ml-1">✕</button>
          </span>
        )}
      </div>

      {/* ── FORMULA BAR ── */}
      <FormulaBar
        activeRef={activeRef}
        rawValue={isEditing ? editVal : activeRaw}
        displayValue={getDisplayValue(activeRaw)}
        isEditing={isEditing}
        onStartEdit={() => {
          if (!activeRow || !activeCol) return
          setEditVal(getCellFmt(activeRow.id, activeCol.id).value || '')
          setIsEditing(true)
        }}
        onCommit={commitEdit}
        onCancel={() => { setIsEditing(false); setEditVal('') }}
        onChange={(v) => {
          setEditVal(v)
          if (!isEditing) setIsEditing(true)
        }}
        colName={activeCol?.name}
      />

      {/* ── GRID ── */}
      <div
        ref={gridRef}
        className="flex-1 overflow-auto outline-none"
        tabIndex={0}
        onKeyDown={isEditing ? undefined : handleGridKeyDown}
        onMouseDown={() => { mouseDownRef.current = true }}
        onMouseUp={() => { mouseDownRef.current = false }}
      >
        {/* Row colour picker */}
        {rowCtxColour && (
          <div className="fixed z-50 bg-white rounded-xl shadow-2xl border border-gray-200 p-2"
            style={{ left: rowCtxColour.x, top: rowCtxColour.y }}>
            <div className="text-xs text-gray-500 font-medium mb-1 px-1">Row highlight</div>
            <div className="flex flex-wrap gap-1 w-44">
              {ROW_HIGHLIGHT_COLOURS.map(c => (
                <button key={c.label} title={c.label} onClick={() => setRowColour(rowCtxColour.rowId, c.hex)}
                  className="w-6 h-6 rounded border border-gray-200 hover:scale-110 transition-transform flex items-center justify-center text-xs text-gray-400"
                  style={c.hex ? { backgroundColor: c.hex } : {}}>
                  {!c.hex && '✕'}
                </button>
              ))}
            </div>
          </div>
        )}

        {contextMenu && (
          <ContextMenu x={contextMenu.x} y={contextMenu.y} onClose={() => setContextMenu(null)}
            items={contextMenu.type === 'row' ? [
              { label: 'Highlight colour', action: () => setRowCtxColour({ rowId: contextMenu.rowId, x: contextMenu.x, y: contextMenu.y }) },
              { label: 'Insert row below', icon: Plus, action: addRowBelow },
              'divider',
              { label: 'Delete row', icon: Trash2, danger: true, action: () => deleteRow(contextMenu.rowId) },
            ] : [
              { label: 'Rename column', icon: Edit2, action: () => setRenamingCol(contextMenu.colId) },
              { label: 'Add column after', icon: Plus, action: addColumn },
              'divider',
              { label: 'Delete column', icon: Trash2, danger: true, action: () => deleteColumn(contextMenu.colId) },
            ]}
          />
        )}

        <table className="border-collapse text-sm" style={{ tableLayout: 'fixed', minWidth: '100%' }}>
          <colgroup>
            <col style={{ width: ROW_NUM_W }} />
            {sheet.columns.map(col => (
              <col key={col.id} style={{ width: (colWidths[col.id] || col.width || 120) + 'px' }} />
            ))}
            <col style={{ width: 36 }} />
          </colgroup>

          <thead>
            <tr>
              <th onClick={selectAll} title="Select all"
                className="sticky top-0 left-0 z-20 bg-gray-100 border-r border-b border-gray-300 cursor-pointer hover:bg-gray-200"
                style={{ width: ROW_NUM_W }} />

              {sheet.columns.map((col, colIdx) => {
                const isColSelected = activeCell && anchor && rangeEnd &&
                  colIdx >= Math.min(anchor.colIdx, rangeEnd.colIdx) &&
                  colIdx <= Math.max(anchor.colIdx, rangeEnd.colIdx) &&
                  Math.min(anchor.rowIdx, rangeEnd.rowIdx) === 0 &&
                  Math.max(anchor.rowIdx, rangeEnd.rowIdx) === numRows - 1
                const colHasFilter = hasActiveFilter(col.id)
                return (
                  <th key={col.id}
                    onClick={e => { if (!e.target.classList.contains('resize-handle') && !e.target.closest('.filter-btn')) selectColumn(colIdx) }}
                    onContextMenu={e => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, type: 'col', colId: col.id }) }}
                    className={`sticky top-0 z-10 border-r border-b border-gray-300 text-center font-semibold text-xs tracking-wide select-none relative group cursor-pointer transition-colors
                      ${isColSelected ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                    style={{ width: (colWidths[col.id] || col.width || 120) + 'px' }}
                  >
                    {renamingCol === col.id ? (
                      <div className="px-1 py-1">
                        <InlineEdit value={col.name} onSave={v => renameCol(col.id, v)} onCancel={() => setRenamingCol(null)} className="w-full text-center" />
                      </div>
                    ) : (
                      <div className="flex items-center justify-center gap-1 px-2 py-1.5">
                        <span className="truncate">{col.name}</span>
                        {/* Filter button */}
                        <div className="relative filter-btn">
                          <button
                            title="Filter"
                            onClick={e => { e.stopPropagation(); setFilterOpen(filterOpen === col.id ? null : col.id) }}
                            className={`flex items-center justify-center w-4 h-4 rounded transition-colors ${colHasFilter ? 'text-blue-600 bg-blue-100' : 'text-gray-300 hover:text-gray-600 opacity-0 group-hover:opacity-100'}`}
                          >
                            <Filter size={10} />
                          </button>
                          {filterOpen === col.id && (
                            <FilterDropdown colId={col.id} onClose={() => setFilterOpen(null)} />
                          )}
                        </div>
                      </div>
                    )}
                    <div onMouseDown={e => startResize(e, col.id, colWidths[col.id] || col.width || 120)}
                      className="resize-handle absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-blue-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </th>
                )
              })}

              <th className="sticky top-0 z-10 bg-gray-100 border-b border-gray-300">
                <button onClick={addColumn} title="Add column"
                  className="w-full h-full flex items-center justify-center text-gray-400 hover:text-blue-500 hover:bg-blue-50 py-1.5">
                  <Plus size={14} />
                </button>
              </th>
            </tr>
          </thead>

          <tbody>
            {visibleRows.map(rowIdx => {
              const row = sheet.rows[rowIdx]
              const isRowSelected = activeCell && anchor && rangeEnd &&
                rowIdx >= Math.min(anchor.rowIdx, rangeEnd.rowIdx) &&
                rowIdx <= Math.max(anchor.rowIdx, rangeEnd.rowIdx) &&
                Math.min(anchor.colIdx, rangeEnd.colIdx) === 0 &&
                Math.max(anchor.colIdx, rangeEnd.colIdx) === numCols - 1

              // Filter indicator for row numbers
              const isFiltered = visibleRows.length < numRows
              return (
                <tr key={row.id}>
                  {/* Row number */}
                  <td
                    onClick={() => selectRow(rowIdx)}
                    onContextMenu={e => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, type: 'row', rowId: row.id }) }}
                    className={`sticky left-0 z-10 border-r border-b border-gray-200 text-center text-xs font-mono select-none cursor-pointer transition-colors
                      ${isRowSelected ? 'bg-blue-100 text-blue-700 font-semibold' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'}`}
                    style={{ width: ROW_NUM_W }}
                  >
                    {rowIdx + 1}
                  </td>

                  {sheet.columns.map((col, colIdx) => {
                    const key     = selKey(row.id, col.id)
                    const mergeInfo = merges[key]

                    // Hidden cells (merged into another cell) — render nothing
                    if (mergeInfo === 'hidden') return null

                    const isActive = activeCell?.rowIdx === rowIdx && activeCell?.colIdx === colIdx
                    const isSel    = selected.has(key) && !isActive
                    const cFmt     = getCellFmt(row.id, col.id)
                    const rawVal   = cFmt.value || ''
                    const displayVal = getDisplayValue(rawVal)
                    const isFormula  = rawVal.startsWith('=')
                    const isError    = isFormula && String(displayVal).startsWith('#')
                    const w        = (colWidths[col.id] || col.width || 120) + 'px'

                    const colspan = mergeInfo?.colspan || 1
                    const rowspan = mergeInfo?.rowspan || 1

                    return (
                      <td
                        key={col.id}
                        colSpan={colspan}
                        rowSpan={rowspan}
                        onMouseDown={e => {
                          if (e.button === 2) return

                          // If editing a formula, clicking another cell appends its cell reference
                          if (isEditing && editVal.startsWith('=')) {
                            e.preventDefault()
                            const refStr = `${String.fromCharCode(65 + colIdx)}${rowIdx + 1}`
                            setEditVal(prev => prev + refStr)
                            editInputRef.current?.focus()
                            return
                          }

                          // If editing a normal value, commit first before moving
                          if (isEditing) commitEdit()

                          const ctrl = e.ctrlKey || e.metaKey

                          if (ctrl && e.shiftKey && anchor) {
                            // Ctrl+Shift+click: extend the LAST extra selection's rangeEnd
                            // (or the main range if no extras yet)
                            if (extraSelections.length > 0) {
                              setExtraSelections(prev => {
                                const next = [...prev]
                                next[next.length - 1] = { ...next[next.length - 1], rangeEnd: { rowIdx, colIdx } }
                                return next
                              })
                            } else {
                              setRangeEnd({ rowIdx, colIdx })
                            }
                            setActiveCell({ rowIdx, colIdx })
                          } else if (ctrl) {
                            // Ctrl+click: commit current range into extraSelections, start a new one
                            if (anchor) {
                              setExtraSelections(prev => [...prev, { anchor, rangeEnd: rangeEnd || anchor }])
                            }
                            setAnchor({ rowIdx, colIdx })
                            setRangeEnd({ rowIdx, colIdx })
                            setActiveCell({ rowIdx, colIdx })
                          } else if (e.shiftKey && anchor) {
                            // Shift+click: extend current main range
                            setRangeEnd({ rowIdx, colIdx })
                            setActiveCell({ rowIdx, colIdx })
                          } else {
                            // Normal click: clear everything, start fresh
                            setActiveCell({ rowIdx, colIdx })
                            setAnchor({ rowIdx, colIdx })
                            setRangeEnd({ rowIdx, colIdx })
                            setExtraSelections([])
                            setIsEditing(false)
                          }
                          gridRef.current?.focus()
                        }}
                        onMouseEnter={e => {
                          if (!mouseDownRef.current) return
                          const ctrl = e.ctrlKey || e.metaKey
                          if (ctrl) {
                            // Ctrl+drag: extend the latest range being drawn
                            if (extraSelections.length > 0) {
                              setExtraSelections(prev => {
                                const next = [...prev]
                                next[next.length - 1] = { ...next[next.length - 1], rangeEnd: { rowIdx, colIdx } }
                                return next
                              })
                            }
                          } else {
                            setRangeEnd({ rowIdx, colIdx })
                          }
                        }}
                        onDoubleClick={() => {
                          setActiveCell({ rowIdx, colIdx })
                          setAnchor({ rowIdx, colIdx })
                          setRangeEnd({ rowIdx, colIdx })
                          editReplaceModeRef.current = false  // edit in place — keep cursor where user clicked
                          setEditVal(cFmt.value || '')
                          setIsEditing(true)
                        }}
                        className={`border-r border-b border-gray-200 p-0 relative
                          ${isActive
                            ? 'outline outline-2 outline-blue-600 outline-offset-[-1px] z-20'
                            : isSel
                              ? 'bg-blue-50 outline outline-1 outline-blue-300 outline-offset-[-1px] z-10'
                              : ''}
                        `}
                        style={{ width: w, minHeight: 28, cursor: 'cell' }}
                      >
                        {isActive && isEditing ? (
                          <textarea
                            ref={editInputRef}
                            autoFocus
                            value={editVal}
                            onChange={e => setEditVal(e.target.value)}
                            onKeyDown={handleEditKeyDown}
                            onBlur={commitEdit}
                            onMouseDown={e => e.stopPropagation()}
                            onClick={e => e.stopPropagation()}
                            rows={1}
                            className="absolute inset-0 w-full h-full px-2 py-1 text-sm outline-none bg-white z-20 resize-none"
                            style={{ ...cellStyle(row.id, col.id, row.colour), minHeight: 28, boxShadow: '0 0 0 2px #2563eb inset' }}
                          />
                        ) : (
                          <div
                            className="px-2 py-1 min-h-[28px] text-sm overflow-hidden"
                            style={{
                              ...cellStyle(row.id, col.id, row.colour),
                              color: isError ? '#dc2626' : undefined,
                            }}
                            title={isFormula ? `Formula: ${rawVal}` : undefined}
                          >
                            {displayVal}
                            {isFormula && !isError && (
                              <span className="absolute top-0 right-0 text-[8px] text-blue-400 leading-none px-0.5">fx</span>
                            )}
                          </div>
                        )}
                      </td>
                    )
                  })}

                  <td className="border-b border-gray-200" style={row.colour ? { backgroundColor: row.colour } : {}} />
                </tr>
              )
            })}

            <tr>
              <td colSpan={numCols + 2} className="border-t border-gray-200 bg-gray-50">
                <button onClick={() => sheetsAPI.addRows(workbookId, sheet.id, 10).then(onDataChange)}
                  className="w-full py-1.5 text-xs text-gray-400 hover:text-blue-500 hover:bg-blue-50 flex items-center justify-center gap-1">
                  <Plus size={12} /> Add 10 rows
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Workbook home ─────────────────────────────────────────────────────────────
function WorkbookHome({ onOpen }) {
  const [workbooks, setWorkbooks] = useState([])
  const [loading,   setLoading]   = useState(true)
  const [creating,  setCreating]  = useState(false)
  const [newName,   setNewName]   = useState('')

  const load = async () => {
    setLoading(true)
    try { const r = await sheetsAPI.listWorkbooks(); setWorkbooks(r.data) } catch {}
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const create = async () => {
    if (!newName.trim()) return
    const r = await sheetsAPI.createWorkbook(newName.trim())
    setNewName(''); setCreating(false)
    onOpen(r.data.id, r.data.name)
  }

  const del = async (id, e) => {
    e.stopPropagation()
    if (!confirm('Delete this workbook and all its sheets?')) return
    await sheetsAPI.deleteWorkbook(id)
    load()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">📊 Shared Spreadsheets</h2>
        <button className="btn-primary flex items-center gap-2" onClick={() => setCreating(true)}>
          <Plus size={16} /> New Workbook
        </button>
      </div>

      {creating && (
        <div className="card flex items-center gap-3">
          <FileSpreadsheet size={20} className="text-blue-500 flex-shrink-0" />
          <input
            autoFocus value={newName} onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') create(); if (e.key === 'Escape') { setCreating(false); setNewName('') } }}
            placeholder="Workbook name…"
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          <button onClick={create} className="btn-primary text-sm px-4 py-2">Create</button>
          <button onClick={() => { setCreating(false); setNewName('') }} className="btn-secondary text-sm px-3 py-2">Cancel</button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <RefreshCw size={22} className="animate-spin text-blue-400" />
        </div>
      ) : workbooks.length === 0 ? (
        <div className="card text-center py-16">
          <BookOpen size={40} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500 font-medium">No workbooks yet</p>
          <p className="text-sm text-gray-400 mt-1">Click "New Workbook" to create your first shared spreadsheet</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {workbooks.map(wb => (
            <div key={wb.id} onClick={() => onOpen(wb.id, wb.name)}
              className="card cursor-pointer hover:shadow-md hover:border-blue-200 border border-transparent transition-all group">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-green-100 rounded-xl">
                    <FileSpreadsheet size={20} className="text-green-600" />
                  </div>
                  <div>
                    <div className="font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">{wb.name}</div>
                    <div className="text-xs text-gray-400 mt-0.5">{wb.sheet_count} sheet{wb.sheet_count !== 1 ? 's' : ''}</div>
                  </div>
                </div>
                <button onClick={e => del(wb.id, e)}
                  className="opacity-0 group-hover:opacity-100 p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all">
                  <Trash2 size={14} />
                </button>
              </div>
              {wb.updated_at && (
                <div className="text-xs text-gray-400 mt-3">Last updated {new Date(wb.updated_at).toLocaleString()}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Workbook view ─────────────────────────────────────────────────────────────
function WorkbookView({ workbookId, workbookName, onBack }) {
  const [data,          setData]          = useState(null)
  const [activeSheet,   setActiveSheet]   = useState(null)
  const [loading,       setLoading]       = useState(true)
  const [live,          setLive]          = useState(true)
  const [renamingWb,    setRenamingWb]    = useState(false)
  const [renamingSheet, setRenamingSheet] = useState(null)
  const [sheetCtx,      setSheetCtx]      = useState(null)
  const lastChangeRef = useRef(null)
  const pollRef       = useRef(null)

  const loadFull = useCallback(async () => {
    try {
      const r = await sheetsAPI.getWorkbook(workbookId)
      setData(r.data)
      lastChangeRef.current = r.data.updated_at
      setActiveSheet(prev => {
        if (prev && r.data.sheets.find(s => s.id === prev)) return prev
        return r.data.sheets[0]?.id || null
      })
    } catch { setLive(false) }
    setLoading(false)
  }, [workbookId])

  const poll = useCallback(async () => {
    try {
      const r = await sheetsAPI.poll(workbookId)
      setLive(true)
      if (r.data.last_updated !== lastChangeRef.current) await loadFull()
    } catch { setLive(false) }
  }, [workbookId, loadFull])

  useEffect(() => {
    loadFull()
    pollRef.current = setInterval(poll, 5000)
    return () => clearInterval(pollRef.current)
  }, [loadFull, poll])

  const addSheet = async () => {
    const name = `Sheet ${(data?.sheets.length || 0) + 1}`
    const r = await sheetsAPI.createSheet(workbookId, name)
    await loadFull()
    setActiveSheet(r.data.id)
  }

  const deleteSheet = async (sheetId) => {
    if (!confirm('Delete this sheet?')) return
    await sheetsAPI.deleteSheet(workbookId, sheetId)
    if (activeSheet === sheetId) {
      const remaining = data.sheets.filter(s => s.id !== sheetId)
      setActiveSheet(remaining[0]?.id || null)
    }
    await loadFull()
  }

  const renameSheet = async (sheetId, name) => {
    if (name) await sheetsAPI.renameSheet(workbookId, sheetId, name)
    setRenamingSheet(null); loadFull()
  }

  const renameWorkbook = async (name) => {
    if (name) await sheetsAPI.renameWorkbook(workbookId, name)
    setRenamingWb(false); loadFull()
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <RefreshCw size={24} className="animate-spin text-blue-400" />
    </div>
  )
  if (!data) return null
  const currentSheet = data.sheets.find(s => s.id === activeSheet)

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 0px)' }}>

      {/* Workbook toolbar */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-white border-b border-gray-200 flex-shrink-0">
        <button onClick={onBack} className="text-sm text-gray-400 hover:text-gray-700 flex items-center gap-1 mr-1">← Back</button>
        <div className="w-px h-4 bg-gray-200" />

        {renamingWb ? (
          <InlineEdit value={data.name} onSave={renameWorkbook} onCancel={() => setRenamingWb(false)} className="font-bold text-base" />
        ) : (
          <button onClick={() => setRenamingWb(true)}
            className="font-bold text-gray-900 hover:text-blue-600 flex items-center gap-1.5 group text-sm">
            <FileSpreadsheet size={15} className="text-green-500" />
            {data.name}
            <Edit2 size={11} className="text-gray-300 group-hover:text-blue-400" />
          </button>
        )}

        <div className="ml-auto flex items-center gap-2">
          {live ? <Wifi size={13} className="text-green-500" title="Live" /> : <WifiOff size={13} className="text-red-400" title="Disconnected" />}
          <button onClick={loadFull} title="Refresh" className="p-1 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded">
            <RefreshCw size={13} />
          </button>
          {currentSheet && (
            <button onClick={() => sheetsAPI.exportSheet(workbookId, currentSheet.id)}
              className="flex items-center gap-1 text-xs px-2.5 py-1 bg-green-50 text-green-700 hover:bg-green-100 rounded-lg font-medium">
              <Download size={13} /> Export sheet
            </button>
          )}
          <button onClick={() => sheetsAPI.exportAll(workbookId)}
            className="flex items-center gap-1 text-xs px-2.5 py-1 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg font-medium">
            <Download size={13} /> Export all
          </button>
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-hidden">
        {currentSheet ? (
          <SheetGrid workbookId={workbookId} sheet={currentSheet} onDataChange={loadFull} />
        ) : (
          <div className="flex items-center justify-center h-full text-gray-400">
            No sheets — click + to add one
          </div>
        )}
      </div>

      {/* Sheet tabs bar */}
      <div className="flex items-center bg-gray-50 border-t border-gray-200 flex-shrink-0 overflow-x-auto">
        {sheetCtx && (
          <ContextMenu x={sheetCtx.x} y={sheetCtx.y} onClose={() => setSheetCtx(null)}
            items={[
              { label: 'Rename', icon: Edit2, action: () => setRenamingSheet(sheetCtx.sheetId) },
              'divider',
              { label: 'Delete sheet', icon: Trash2, danger: true, action: () => deleteSheet(sheetCtx.sheetId) },
            ]}
          />
        )}

        {data.sheets.map(sheet => (
          <div key={sheet.id}
            onClick={() => setActiveSheet(sheet.id)}
            onContextMenu={e => { e.preventDefault(); setSheetCtx({ x: e.clientX, y: e.clientY, sheetId: sheet.id }) }}
            className={`relative flex items-center gap-1 px-4 py-2 text-sm cursor-pointer select-none border-r border-gray-200 whitespace-nowrap flex-shrink-0 transition-colors ${
              activeSheet === sheet.id
                ? 'bg-white text-blue-600 font-semibold border-t-2 border-t-blue-500 -mt-px'
                : 'text-gray-500 hover:bg-gray-100'
            }`}
          >
            {renamingSheet === sheet.id ? (
              <InlineEdit value={sheet.name} onSave={v => renameSheet(sheet.id, v)} onCancel={() => setRenamingSheet(null)} className="w-24" />
            ) : (
              <>
                {sheet.name}
                <MoreHorizontal size={12} className="text-gray-300 hover:text-gray-600 ml-1"
                  onClick={e => { e.stopPropagation(); setSheetCtx({ x: e.clientX, y: e.clientY, sheetId: sheet.id }) }} />
              </>
            )}
          </div>
        ))}

        <button onClick={addSheet} title="Add sheet"
          className="flex items-center gap-1 px-3 py-2 text-sm text-gray-400 hover:text-blue-500 hover:bg-gray-100 transition-colors flex-shrink-0">
          <Plus size={14} />
        </button>
      </div>
    </div>
  )
}

// ─── Page root ─────────────────────────────────────────────────────────────────
export default function Spreadsheet() {
  const [openWb, setOpenWb] = useState(null)

  if (openWb) {
    return <WorkbookView workbookId={openWb.id} workbookName={openWb.name} onBack={() => setOpenWb(null)} />
  }
  return (
    <div className="p-6">
      <WorkbookHome onOpen={(id, name) => setOpenWb({ id, name })} />
    </div>
  )
}
