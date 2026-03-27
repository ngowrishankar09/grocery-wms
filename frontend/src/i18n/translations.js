export const translations = {
  en: {
    // Navigation
    dashboard: 'Dashboard',
    skuMaster: 'SKU Master',
    receiving: 'Receiving',
    orders: 'Orders & Dispatch',
    inventory: 'Inventory',
    transfers: 'Transfers',
    forecasting: 'Forecasting',
    vendors: 'Vendors',

    // Dashboard
    totalSKUs: 'Total SKUs',
    stockouts: 'Stockouts',
    lowStock: 'Low Stock',
    expiringCritical: 'Expiring <30 Days',
    expiringWarning: 'Expiring 31-60 Days',
    pendingOrders: 'Pending Orders',
    todayDispatched: "Today's Dispatched",
    receivedThisMonth: 'Received This Month',
    dispatchedThisMonth: 'Dispatched This Month',
    expiringSoon: 'Expiring Soon',
    wh2OnlyItems: 'Items Only in WH2 (Need Transfer)',

    // Common
    product: 'Product',
    sku: 'SKU',
    category: 'Category',
    cases: 'Cases',
    warehouse: 'Warehouse',
    expiryDate: 'Expiry Date',
    daysLeft: 'Days Left',
    status: 'Status',
    actions: 'Actions',
    save: 'Save',
    cancel: 'Cancel',
    add: 'Add',
    edit: 'Edit',
    search: 'Search...',
    all: 'All',
    noData: 'No data available',
    loading: 'Loading...',

    // Stock status
    ok: 'OK',
    low: 'Low Stock',
    stockout: 'Stockout',
    critical: 'Critical',
    warning: 'Warning',
    noExpiry: 'No Expiry',
    expired: 'Expired',

    // Warehouse
    wh1: 'Warehouse 1 (Main)',
    wh2: 'Warehouse 2 (Backup)',

    // Receiving
    receiveShipment: 'Receive Shipment',
    receivingDate: 'Receiving Date',
    supplier: 'Supplier',
    caseCount: 'Case Count',
    hasExpiry: 'Has Expiry Date',
    noExpiryDate: 'No Expiry Date',
    addItem: 'Add Item',
    submitReceiving: 'Submit Receiving',

    // Orders
    newOrder: 'New Order',
    storeName: 'Store Name',
    orderDate: 'Order Date',
    orderStatus: 'Order Status',
    viewPickList: 'View Pick List',
    dispatch: 'Dispatch',
    pickList: 'Pick List',
    requested: 'Requested',
    available: 'Available',
    fulfilled: 'Fulfilled',
    pickFrom: 'Pick From',
    confirmDispatch: 'Confirm Dispatch',

    // Forecasting
    avgMonthly: 'Avg Monthly',
    daysOfStock: 'Days of Stock',
    reorderBy: 'Reorder By',
    suggestedQty: 'Suggested Qty',
    reorderList: 'Reorder List',
    projection: 'Projection',

    // Transfers
    newTransfer: 'New Transfer',
    from: 'From',
    to: 'To',
    transferDate: 'Transfer Date',
    casesToMove: 'Cases to Move',
    suggestions: 'Transfer Suggestions',
  },

  es: {
    // Navigation
    dashboard: 'Panel Principal',
    skuMaster: 'Catálogo de Productos',
    receiving: 'Recepción',
    orders: 'Pedidos y Despacho',
    inventory: 'Inventario',
    transfers: 'Transferencias',
    forecasting: 'Pronóstico',
    vendors: 'Proveedores',

    // Dashboard
    totalSKUs: 'Total de Productos',
    stockouts: 'Sin Stock',
    lowStock: 'Stock Bajo',
    expiringCritical: 'Vencen en <30 Días',
    expiringWarning: 'Vencen en 31-60 Días',
    pendingOrders: 'Pedidos Pendientes',
    todayDispatched: 'Despachado Hoy',
    receivedThisMonth: 'Recibido Este Mes',
    dispatchedThisMonth: 'Despachado Este Mes',
    expiringSoon: 'Próximos a Vencer',
    wh2OnlyItems: 'Solo en Almacén 2 (Transferir)',

    // Common
    product: 'Producto',
    sku: 'Código',
    category: 'Categoría',
    cases: 'Cajas',
    warehouse: 'Almacén',
    expiryDate: 'Fecha Vencimiento',
    daysLeft: 'Días Restantes',
    status: 'Estado',
    actions: 'Acciones',
    save: 'Guardar',
    cancel: 'Cancelar',
    add: 'Agregar',
    edit: 'Editar',
    search: 'Buscar...',
    all: 'Todos',
    noData: 'Sin datos disponibles',
    loading: 'Cargando...',

    // Stock status
    ok: 'OK',
    low: 'Stock Bajo',
    stockout: 'Sin Stock',
    critical: 'Crítico',
    warning: 'Advertencia',
    noExpiry: 'Sin Vencimiento',
    expired: 'Vencido',

    // Warehouse
    wh1: 'Almacén 1 (Principal)',
    wh2: 'Almacén 2 (Respaldo)',

    // Receiving
    receiveShipment: 'Recibir Mercancía',
    receivingDate: 'Fecha de Recepción',
    supplier: 'Proveedor',
    caseCount: 'Cantidad de Cajas',
    hasExpiry: 'Tiene Fecha de Vencimiento',
    noExpiryDate: 'Sin Fecha de Vencimiento',
    addItem: 'Agregar Producto',
    submitReceiving: 'Confirmar Recepción',

    // Orders
    newOrder: 'Nuevo Pedido',
    storeName: 'Nombre de Tienda',
    orderDate: 'Fecha del Pedido',
    orderStatus: 'Estado del Pedido',
    viewPickList: 'Ver Lista de Recolección',
    dispatch: 'Despachar',
    pickList: 'Lista de Recolección',
    requested: 'Solicitado',
    available: 'Disponible',
    fulfilled: 'Cumplido',
    pickFrom: 'Recoger De',
    confirmDispatch: 'Confirmar Despacho',

    // Forecasting
    avgMonthly: 'Promedio Mensual',
    daysOfStock: 'Días de Stock',
    reorderBy: 'Pedir Antes De',
    suggestedQty: 'Cantidad Sugerida',
    reorderList: 'Lista de Pedidos',
    projection: 'Proyección',

    // Transfers
    newTransfer: 'Nueva Transferencia',
    from: 'Desde',
    to: 'Hacia',
    transferDate: 'Fecha de Transferencia',
    casesToMove: 'Cajas a Mover',
    suggestions: 'Sugerencias de Transferencia',
  }
}

export const useT = (lang) => (key) => translations[lang]?.[key] || translations['en'][key] || key
