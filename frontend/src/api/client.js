import axios from 'axios'

// In production (Vercel), set VITE_API_URL to your Railway backend URL.
// Locally, the Vite proxy forwards /api → http://localhost:8000.
const BASE = import.meta.env.VITE_API_URL
  ? import.meta.env.VITE_API_URL.replace(/\/$/, '')   // strip trailing slash
  : '/api'

const api = axios.create({
  baseURL: BASE,
  headers: { 'Content-Type': 'application/json' },
})

// Restore token from localStorage on page load
const savedToken = localStorage.getItem('wms_token')
if (savedToken) {
  api.defaults.headers.common['Authorization'] = `Bearer ${savedToken}`
}

// Intercept 401s — clear token and redirect to login
api.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401 && !err.config.url?.includes('/auth/')) {
      localStorage.removeItem('wms_token')
      localStorage.removeItem('wms_user')
      delete api.defaults.headers.common['Authorization']
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export const skuAPI = {
  list: (params) => api.get('/skus/', { params }),
  create: (data) => api.post('/skus/', data),
  update: (id, data) => api.put(`/skus/${id}`, data),
  get: (id) => api.get(`/skus/${id}`),
  categories: () => api.get('/skus/categories/list'),
  lookupBarcode: (barcode) => api.get(`/skus/barcode/${barcode}`),
}

export const vendorAPI = {
  list: () => api.get('/vendors/'),
  create: (data) => api.post('/vendors/', data),
  update: (id, data) => api.put(`/vendors/${id}`, data),
}

export const receivingAPI = {
  receive: (data) => api.post('/receiving/', data),
  listBatches: (params) => api.get('/receiving/', { params }),
  history: () => api.get('/receiving/history'),
}

export const orderAPI = {
  list: (params) => api.get('/orders/', { params }),
  create: (data) => api.post('/orders/', data),
  update: (id, data) => api.put(`/orders/${id}`, data),
  get: (id) => api.get(`/orders/${id}`),
  pickList: (id) => api.get(`/orders/${id}/picklist`),
  dispatch: (id, numPallets) => api.post(`/orders/${id}/dispatch`, numPallets != null ? { num_pallets: numPallets } : {}),
  sendToPicking: (id, pickerName) => api.post(`/orders/${id}/send-to-picking`, { picker_name: pickerName || null }),
  startPicking:  (id, pickerName)   => api.post(`/orders/${id}/start-picking`,  { picker_name: pickerName || null }),
  endPicking:    (id, actualPicks)  => api.post(`/orders/${id}/end-picking`, actualPicks ? { actual_picks: actualPicks } : {}),
  pendingApproval: () => api.get('/orders/pending-approval'),
  approve: (id, note) => api.post(`/orders/${id}/approve`, { note }),
  reject: (id, note) => api.post(`/orders/${id}/reject`, { note }),
}

export const inventoryAPI = {
  list: (params) => api.get('/inventory/', { params }),
  summary: () => api.get('/inventory/summary'),
}

export const transferAPI = {
  list: () => api.get('/transfers/'),
  create: (data) => api.post('/transfers/', data),
  suggestions: () => api.get('/transfers/wh2-to-wh1-suggestions'),
}

export const forecastAPI = {
  list: (params) => api.get('/forecasting/', { params }),
  reorderList: () => api.get('/forecasting/reorder-list'),
  history: (skuId) => api.get(`/forecasting/consumption-history/${skuId}`),
  generatePOs: () => api.post('/forecasting/generate-pos'),
}

export const priceListAPI = {
  list:     ()                  => api.get('/price-lists'),
  get:      (id)                => api.get(`/price-lists/${id}`),
  create:   (data)              => api.post('/price-lists', data),
  update:   (id, data)          => api.put(`/price-lists/${id}`, data),
  delete:   (id)                => api.delete(`/price-lists/${id}`),
  setItems: (id, items)         => api.put(`/price-lists/${id}/items`, { items }),
  lookup:   (customerId, skuId) => api.get(`/price-lists/lookup/${customerId}/${skuId}`),
}

export const dashboardAPI = {
  get: () => api.get('/dashboard/'),
}

export const warehouseTaskAPI = {
  list:         (params)          => api.get('/warehouse-tasks/', { params }),
  stats:        ()                => api.get('/warehouse-tasks/stats'),
  myTasks:      ()                => api.get('/warehouse-tasks/my-tasks'),
  create:       (data)            => api.post('/warehouse-tasks/', data),
  start:        (id)              => api.post(`/warehouse-tasks/${id}/start`),
  confirm:      (id, data)        => api.post(`/warehouse-tasks/${id}/confirm`, data || {}),
  cancel:       (id)              => api.post(`/warehouse-tasks/${id}/cancel`),
  assign:       (id, userId)      => api.patch(`/warehouse-tasks/${id}/assign?user_id=${userId}`),
  blockStock:   (data)            => api.post('/warehouse-tasks/block-stock', data),
  releaseStock: (data)            => api.post('/warehouse-tasks/release-stock', data),
  stockSummary: (skuId, warehouse) => api.get(`/warehouse-tasks/stock-summary/${skuId}`, { params: warehouse ? { warehouse } : {} }),
}

export const settingsAPI = {
  // Warehouses
  listWarehouses: () => api.get('/settings/warehouses'),
  createWarehouse: (data) => api.post('/settings/warehouses', data),
  updateWarehouse: (id, data) => api.put(`/settings/warehouses/${id}`, data),
  deleteWarehouse: (id) => api.delete(`/settings/warehouses/${id}`),
  // Vendor delete
  deleteVendor: (id) => api.delete(`/settings/vendors/${id}`),
  // SKU delete
  deleteSKU: (id) => api.delete(`/settings/skus/${id}`),
  // Inventory adjustment
  adjustInventory: (data) => api.post('/settings/inventory/adjust', data),
  listAdjustments: () => api.get('/settings/inventory/adjustments'),
  // Categories
  listCategories: () => api.get('/settings/categories'),
  createCategory: (data) => api.post('/settings/categories', data),
  updateCategory: (id, data) => api.put(`/settings/categories/${id}`, data),
  deleteCategory: (id) => api.delete(`/settings/categories/${id}`),
  // Company Profile
  getCompany:           () => api.get('/settings/company'),
  updateCompany:        (data) => api.put('/settings/company', data),
  syncInvoiceCounter:   () => api.post('/settings/company/sync-invoice-counter'),
}

export const uploadAPI = {
  lookupBarcode: (barcode) => api.get(`/upload/lookup-barcode/${encodeURIComponent(barcode)}`),
  parsePDF: (file) => {
    const form = new FormData()
    form.append('file', file)
    return api.post('/upload/pdf-invoice', form, { headers: { 'Content-Type': 'multipart/form-data' } })
  },
  parseImage: (file) => {
    const form = new FormData()
    form.append('file', file)
    return api.post('/upload/image-dispatch', form, { headers: { 'Content-Type': 'multipart/form-data' } })
  },
  // Product image
  productImage: (skuId, file) => {
    const form = new FormData()
    form.append('file', file)
    return api.post(`/upload/product-image/${skuId}`, form, { headers: { 'Content-Type': 'multipart/form-data' } })
  },
  // Bulk SKU upload
  bulkSKUPreview: (file) => {
    const form = new FormData()
    form.append('file', file)
    return api.post('/upload/bulk-skus/preview', form, { headers: { 'Content-Type': 'multipart/form-data' } })
  },
  bulkSKUConfirm: (items, skipDuplicates = true) =>
    api.post('/upload/bulk-skus/confirm', { items, skip_duplicates: skipDuplicates }),
}

export const customerAPI = {
  list:       (params)   => api.get('/customers/', { params }),
  create:     (data)     => api.post('/customers/', data),
  update:     (id, data) => api.put(`/customers/${id}`, data),
  get:        (id)       => api.get(`/customers/${id}`),
  orders:     (id)       => api.get(`/customers/${id}/orders`),
  delete:     (id)       => api.delete(`/customers/${id}`),
  aging:      ()         => api.get('/customers/aging'),
  toggleHold: (id)       => api.post(`/customers/${id}/toggle-hold`),
}

export const returnsAPI = {
  list:   (params) => api.get('/returns/', { params }),
  create: (data)   => api.post('/returns/', data),
  get:    (id)     => api.get(`/returns/${id}`),
  accept: (id, accepted) => api.post(`/returns/${id}/accept`, { accepted }),
  reject: (id)     => api.post(`/returns/${id}/reject`),
  delete: (id)     => api.delete(`/returns/${id}`),
}

export const invoiceAPI = {
  list:             (params)   => api.get('/invoices/', { params }),
  create:           (data)     => api.post('/invoices/', data),
  get:              (id)       => api.get(`/invoices/${id}`),
  update:           (id, data) => api.put(`/invoices/${id}`, data),
  delete:           (id)       => api.delete(`/invoices/${id}`),
  fromOrder:        (orderId)  => api.post(`/invoices/from-order/${orderId}`),
  send:             (id)       => api.post(`/invoices/${id}/send`),
  markPaid:         (id)       => api.post(`/invoices/${id}/mark-paid`),
  markOverdue:      (id)       => api.post(`/invoices/${id}/mark-overdue`),
  agingSummary:     ()         => api.get('/invoices/aging-summary'),
  markOverdueBatch: ()         => api.post('/invoices/mark-overdue-batch'),
  sendReminders:    ()         => api.post('/invoices/send-reminders'),
  // Payments
  listPayments:     (id)       => api.get(`/invoices/${id}/payments`),
  recordPayment:    (id, data) => api.post(`/invoices/${id}/payments`, data),
  deletePayment:    (id, pid)  => api.delete(`/invoices/${id}/payments/${pid}`),
  // Journal
  journal:          (limit)    => api.get('/invoices/journal', { params: limit ? { limit } : {} }),
  // Statement
  statement: (customerId, params) => api.get(`/invoices/statement/${customerId}`, { params }),
}

export const financialAPI = {
  pl:  (months) => api.get('/reports/financials', { params: { months: months || 6 } }),
}

export const reportAPI = {
  expiryAlerts: (days_ahead = 30) => api.get('/reports/expiry-alerts', { params: { days_ahead } }),
  balanceSheet: () => api.get('/reports/balance-sheet'),
}

export const creditNoteAPI = {
  list:   ()           => api.get('/credit-notes'),
  create: (data)       => api.post('/credit-notes', data),
  get:    (id)         => api.get(`/credit-notes/${id}`),
  apply:  (id, data)   => api.post(`/credit-notes/${id}/apply`, data),
  void:   (id)         => api.post(`/credit-notes/${id}/void`),
  delete: (id)         => api.delete(`/credit-notes/${id}`),
}

export const vendorBillAPI = {
  list:          (params)       => api.get('/vendor-bills', { params }),
  create:        (data)         => api.post('/vendor-bills', data),
  get:           (id)           => api.get(`/vendor-bills/${id}`),
  fromPO:        (poId)         => api.post(`/vendor-bills/from-po/${poId}`),
  updateStatus:  (id, status)   => api.patch(`/vendor-bills/${id}/status`, { status }),
  recordPayment: (id, data)     => api.post(`/vendor-bills/${id}/payments`, data),
  aging:         ()             => api.get('/vendor-bills/aging'),
  delete:        (id)           => api.delete(`/vendor-bills/${id}`),
}

export const quoteAPI = {
  list:         (params)     => api.get('/quotes', { params }),
  create:       (data)       => api.post('/quotes', data),
  get:          (id)         => api.get(`/quotes/${id}`),
  updateStatus: (id, status) => api.patch(`/quotes/${id}/status`, { status }),
  convert:      (id)         => api.post(`/quotes/${id}/convert`),
  delete:       (id)         => api.delete(`/quotes/${id}`),
}

export const auditAPI = {
  list: (params) => api.get('/audit-log', { params }),
}

export const purchaseOrderAPI = {
  list:    (params) => api.get('/purchase-orders', { params }),
  stats:   ()       => api.get('/purchase-orders/stats'),
  get:     (id)     => api.get(`/purchase-orders/${id}`),
  create:  (data)   => api.post('/purchase-orders', data),
  update:  (id, data) => api.put(`/purchase-orders/${id}`, data),
  cancel:  (id)     => api.delete(`/purchase-orders/${id}`),
  send:    (id)     => api.post(`/purchase-orders/${id}/send`),
  receive: (id, items, receivedDate) =>
    api.post(`/purchase-orders/${id}/receive`, items, {
      params: receivedDate ? { received_date: receivedDate } : {},
    }),
  landedCosts: (poId, data) => api.post(`/purchase-orders/${poId}/landed-costs`, data),
  autoReorder: (dry_run = true) => api.post('/purchase-orders/auto-reorder', { dry_run }),
}

// ── Labels ───────────────────────────────────────────────────
const BACKEND = BASE
export const labelAPI = {
  skuUrl:    (skuId)    => `${BACKEND}/labels/sku/${skuId}`,
  skusUrl:   (ids)      => `${BACKEND}/labels/skus?ids=${ids.join(',')}`,
  binUrl:    (binId)    => `${BACKEND}/labels/bin/${binId}`,
  binsUrl:   (ids)      => `${BACKEND}/labels/bins?ids=${ids.join(',')}`,
  allBinsUrl: ()        => `${BACKEND}/labels/bins/all`,
}

// ── Reports ─────────────────────────────────────────────────
const _download = async (url) => {
  const res = await api.get(url, { responseType: 'blob' })
  const blob = new Blob([res.data], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  // Extract filename from Content-Disposition or build one
  const cd = res.headers['content-disposition'] || ''
  const fnMatch = cd.match(/filename="?([^"]+)"?/)
  link.download = fnMatch ? fnMatch[1] : 'report.xlsx'
  link.click()
  URL.revokeObjectURL(link.href)
}

export const reportsAPI = {
  inventorySnapshot:    ()             => api.get('/reports/inventory-snapshot'),
  dispatchHistory:      (from, to)     => api.get('/reports/dispatch-history',  { params: { date_from: from, date_to: to } }),
  receivingHistory:     (from, to)     => api.get('/reports/receiving-history', { params: { date_from: from, date_to: to } }),
  lowStock:             ()             => api.get('/reports/low-stock'),
  expiryReport:         (days = 90)   => api.get('/reports/expiry-report', { params: { within_days: days } }),

  exportInventorySnapshot: ()            => _download('/reports/inventory-snapshot/export'),
  exportDispatchHistory:   (from, to)    => _download(`/reports/dispatch-history/export?date_from=${from || ''}&date_to=${to || ''}`),
  exportReceivingHistory:  (from, to)    => _download(`/reports/receiving-history/export?date_from=${from || ''}&date_to=${to || ''}`),
  exportLowStock:          ()            => _download('/reports/low-stock/export'),
  exportExpiryReport:      (days = 90)  => _download(`/reports/expiry-report/export?within_days=${days}`),
  exportAdjustments:       ()            => _download('/reports/adjustments/export'),
}

// ── Stock Take ───────────────────────────────────────────────
export const stockTakeAPI = {
  getSheet:  (warehouse) => api.get('/stock-take/sheet', { params: warehouse ? { warehouse } : {} }),
  submit:    (data)      => api.post('/stock-take/submit', data),
  history:   ()          => api.get('/stock-take/history'),
  writeOff:  (items)     => api.post('/stock-take/write-off', items),
}

// ── Notifications ────────────────────────────────────────────
export const notificationsAPI = {
  get: () => api.get('/notifications/'),
}

// ── Dispatch Board ───────────────────────────────────────────
export const boardAPI = {
  getBoard:   (date)       => api.get('/board/', { params: date ? { board_date: date } : {} }),
  poll:       (date)       => api.get('/board/poll', { params: date ? { board_date: date } : {} }),
  update:     (id, data)   => api.patch(`/board/${id}`, data),
  summary:    (date)       => api.get('/board/summary', { params: date ? { board_date: date } : {} }),
  dates:      ()           => api.get('/board/dates'),
}

// ── Shared Spreadsheets ──────────────────────────────────────
export const sheetsAPI = {
  // Workbooks
  listWorkbooks:   ()             => api.get('/sheets/workbooks/'),
  createWorkbook:  (name)         => api.post('/sheets/workbooks/', { name }),
  deleteWorkbook:  (id)           => api.delete(`/sheets/workbooks/${id}`),
  renameWorkbook:  (id, name)     => api.patch(`/sheets/workbooks/${id}`, { name }),

  // Workbook fetch + poll
  getWorkbook: (wbId)             => api.get(`/sheets/${wbId}/`),
  poll:        (wbId)             => api.get(`/sheets/${wbId}/poll`),

  // Sheets
  createSheet: (wbId, name)       => api.post(`/sheets/${wbId}/`, { name }),
  deleteSheet: (wbId, shId)       => api.delete(`/sheets/${wbId}/${shId}`),
  renameSheet: (wbId, shId, name) => api.patch(`/sheets/${wbId}/${shId}`, { name }),

  // Columns
  addColumn:    (wbId, shId, name, width = 120)  => api.post(`/sheets/${wbId}/${shId}/columns`, { name, width }),
  deleteColumn: (wbId, shId, colId)              => api.delete(`/sheets/${wbId}/${shId}/columns/${colId}`),
  renameColumn: (wbId, shId, colId, name, width)  => api.patch(`/sheets/${wbId}/${shId}/columns/${colId}`, { ...(name !== undefined ? { name } : {}), ...(width !== undefined ? { width } : {}) }),

  // Rows
  addRows:    (wbId, shId, count = 10)      => api.post(`/sheets/${wbId}/${shId}/rows`, { count }),
  deleteRow:  (wbId, shId, rowId)           => api.delete(`/sheets/${wbId}/${shId}/rows/${rowId}`),
  updateRow:  (wbId, shId, rowId, colour)   => api.patch(`/sheets/${wbId}/${shId}/rows/${rowId}`, { colour }),

  // Cells
  updateCells: (wbId, shId, cells) =>
    api.patch(`/sheets/${wbId}/${shId}/cells`, { cells }),

  // Export
  exportSheet: (wbId, shId) => _download(`/sheets/${wbId}/${shId}/export`),
  exportAll:   (wbId)       => _download(`/sheets/${wbId}/export-all`),
}

// ── Drivers ──────────────────────────────────────────────────
export const driverAPI = {
  list:   (params) => api.get('/drivers/', { params }),
  create: (data)   => api.post('/drivers/', data),
  update: (id, data) => api.put(`/drivers/${id}`, data),
  delete: (id)     => api.delete(`/drivers/${id}`),
}

// ── Delivery Runs ─────────────────────────────────────────────
export const deliveryRunAPI = {
  list:     (params)       => api.get('/delivery-runs/', { params }),
  create:   (data)         => api.post('/delivery-runs/', data),
  update:   (id, data)     => api.put(`/delivery-runs/${id}`, data),
  start:    (id)           => api.post(`/delivery-runs/${id}/start`),
  complete: (id)           => api.post(`/delivery-runs/${id}/complete`),
  delete:   (id)           => api.delete(`/delivery-runs/${id}`),
  addStop:    (id, data)         => api.post(`/delivery-runs/${id}/stops`, data),
  updateStop: (id, stopId, data) => api.put(`/delivery-runs/${id}/stops/${stopId}`, data),
  deleteStop: (id, stopId)       => api.delete(`/delivery-runs/${id}/stops/${stopId}`),
  optimize:   (id)               => api.post(`/delivery-runs/${id}/optimize`),
}

// ── Customer Portal ──────────────────────────────────────────
const portalBaseURL = BASE
const _portalApi = () => {
  const token = localStorage.getItem('portal_token')
  return {
    get:    (url, cfg = {}) => axios.get(portalBaseURL + url, { ...cfg, headers: { Authorization: `Bearer ${token}`, ...(cfg.headers || {}) } }),
    post:   (url, data, cfg = {}) => axios.post(portalBaseURL + url, data, { ...cfg, headers: { Authorization: `Bearer ${token}`, ...(cfg.headers || {}) } }),
  }
}

export const portalAPI = {
  login:    (email, password) => axios.post(`${portalBaseURL}/portal/login`, { email, password }),
  settings: () => axios.get(`${portalBaseURL}/portal/settings`),
  me:       () => _portalApi().get('/portal/me'),
  catalog:  () => _portalApi().get('/portal/catalog'),
  placeOrder: (data) => _portalApi().post('/portal/orders', data),
  orders:   () => _portalApi().get('/portal/orders'),
  invoices: () => _portalApi().get('/portal/invoices'),
  // Admin: set portal access for a customer
  setAccess: (customerId, data) => api.post(`/customers/${customerId}/portal-access`, data),
}

// ── Email ────────────────────────────────────────────────────
export const emailAPI = {
  testSMTP:       ()            => api.post('/email/test'),
  sendInvoice:    (id, data)    => api.post(`/email/invoice/${id}`, data),
  sendPO:         (id, data)    => api.post(`/email/purchase-order/${id}`, data),
}

export const traceabilityAPI = {
  search: (q) => api.get('/traceability/search', { params: { q } }),
  forwardTrace: (batchCode) => api.get(`/traceability/batch/${batchCode}/forward`),
  backwardTrace: (batchCode) => api.get(`/traceability/batch/${batchCode}/backward`),
  batchesForSku: (skuId) => api.get(`/traceability/sku/${skuId}/batches`),
  listRecalls: () => api.get('/traceability/recalls'),
  recall: (batchCode, reason) => api.post(`/traceability/recall/${batchCode}`, { reason }),
  undoRecall: (batchCode) => api.post(`/traceability/recall/${batchCode}/undo`),
}

export const asnAPI = {
  list: () => api.get('/asn/asns'),
  create: (data) => api.post('/asn/asns', data),
  get: (id) => api.get(`/asn/asns/${id}`),
  update: (id, data) => api.put(`/asn/asns/${id}`, data),
  updateStatus: (id, status) => api.patch(`/asn/asns/${id}/status`, { status }),
  delete: (id) => api.delete(`/asn/asns/${id}`),
}

export const kpiAPI = {
  scorecard: (period_days = 30) => api.get('/kpi/scorecard', { params: { period_days } }),
}

// ── Auth / Registration ───────────────────────────────────────
export const authAPI = {
  register: (data) => api.post('/auth/register', data),
}

// ── Superadmin (platform management) ─────────────────────────
export const superAdminAPI = {
  companies:     ()         => api.get('/superadmin/companies'),
  updateCompany: (id, data) => api.patch(`/superadmin/companies/${id}`, data),
  companyUsers:  (id)       => api.get(`/superadmin/companies/${id}/users`),
  approveCompany: (id)      => api.post(`/superadmin/companies/${id}/approve`),
  rejectCompany:  (id)      => api.post(`/superadmin/companies/${id}/reject`),
}

// ── Order Check (AI-powered dispatch verification) ────────────
export const orderCheckAPI = {
  // Scan a single order page immediately on upload (Step 1 live preview)
  scanPage: (data)   => api.post('/order-check/scan-order-page', data, { timeout: 30_000 }),
  // 120-second timeout — parallel Claude Vision calls for box photos + matching
  analyze:  (data)   => api.post('/order-check/analyze', data, { timeout: 120_000 }),
  save:     (data)   => api.post('/order-check/save',    data),
  history:  ()       => api.get('/order-check/history'),
  get:      (id)     => api.get(`/order-check/history/${id}`),
}

export const repackingAPI = {
  // BOM
  listBOM:    ()         => api.get('/repacking/bom'),
  createBOM:  (data)     => api.post('/repacking/bom', data),
  updateBOM:  (id, data) => api.put(`/repacking/bom/${id}`, data),
  deleteBOM:  (id)       => api.delete(`/repacking/bom/${id}`),
  // Runs
  listRuns:    ()         => api.get('/repacking/runs'),
  createRun:   (data)     => api.post('/repacking/runs', data),
  getRun:      (id)       => api.get(`/repacking/runs/${id}`),
  addOutput:   (id, data) => api.post(`/repacking/runs/${id}/output`, data),
  removeOutput:(id, skuId)=> api.delete(`/repacking/runs/${id}/output/${skuId}`),
  addBulk:     (id, data) => api.post(`/repacking/runs/${id}/bulk`, data),
  removeBulk:  (id, skuId)=> api.delete(`/repacking/runs/${id}/bulk/${skuId}`),
  closeRun:    (id, data) => api.post(`/repacking/runs/${id}/close`, data),
  reopenRun:   (id)       => api.post(`/repacking/runs/${id}/reopen`),
  summary:     (params)   => api.get('/repacking/summary', { params }),
  // Individual landed costs (legacy / single-SKU)
  listLandedCosts:  ()         => api.get('/repacking/landed-costs'),
  createLandedCost: (data)     => api.post('/repacking/landed-costs', data),
  updateLandedCost: (id, data) => api.put(`/repacking/landed-costs/${id}`, data),
  deleteLandedCost: (id)       => api.delete(`/repacking/landed-costs/${id}`),
  // Multi-SKU purchase batches
  listPurchases:   ()         => api.get('/repacking/purchases'),
  createPurchase:  (data)     => api.post('/repacking/purchases', data),
  getPurchase:     (id)       => api.get(`/repacking/purchases/${id}`),
  updatePurchase:  (id, data) => api.put(`/repacking/purchases/${id}`, data),
  deletePurchase:  (id)       => api.delete(`/repacking/purchases/${id}`),
  // Run costs
  getRunCosts:     (runId)    => api.get(`/repacking/runs/${runId}/costs`),
  saveRunCosts:    (runId, d) => api.post(`/repacking/runs/${runId}/costs`, d),
  // Cost summary
  costSummary:     (runId)    => api.get(`/repacking/runs/${runId}/cost-summary`),
}

export default api
