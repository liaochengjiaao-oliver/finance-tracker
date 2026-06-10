import { contextBridge, ipcRenderer } from 'electron'

const api = {
  // Users
  listUsers: () => ipcRenderer.invoke('users:list'),
  getCurrentUser: () => ipcRenderer.invoke('users:current'),
  createUser: (name: string) => ipcRenderer.invoke('users:create', name),
  switchUser: (id: string) => ipcRenderer.invoke('users:switch', id),
  deleteUser: (id: string) => ipcRenderer.invoke('users:delete', id),
  updateUser: (id: string, data: { name?: string }) => ipcRenderer.invoke('users:update', id, data),
  onUserSwitched: (callback: () => void) => {
    const handler = (): void => callback()
    ipcRenderer.on('user:switched', handler)
    return () => ipcRenderer.removeListener('user:switched', handler)
  },

  // Categories
  getCategories: (type?: string) => ipcRenderer.invoke('categories:list', type),
  createCategory: (data: { name: string; type: string }) => ipcRenderer.invoke('categories:create', data),
  updateCategory: (id: number, data: { name?: string; sort_order?: number }) =>
    ipcRenderer.invoke('categories:update', id, data),
  deleteCategory: (id: number) => ipcRenderer.invoke('categories:delete', id),

  // Transactions
  createTransaction: (data: {
    type: string; amount: number; category_id: number; date: string; note: string
  }) => ipcRenderer.invoke('transactions:create', data),
  updateTransaction: (id: number, data: {
    type?: string; amount?: number; category_id?: number; date?: string; note?: string
  }) => ipcRenderer.invoke('transactions:update', id, data),
  deleteTransaction: (id: number) => ipcRenderer.invoke('transactions:delete', id),
  batchDeleteTransactions: (ids: number[]) => ipcRenderer.invoke('transactions:batch-delete', ids),
  listTransactionIds: (filters: {
    startDate?: string; endDate?: string; type?: string;
    categoryIds?: number[]; keyword?: string; minAmount?: number; maxAmount?: number
  }) => ipcRenderer.invoke('transactions:list-ids', filters),
  getTransactions: (filters: {
    startDate?: string; endDate?: string; type?: string;
    categoryIds?: number[]; keyword?: string; minAmount?: number; maxAmount?: number;
    limit?: number; offset?: number
  }) => ipcRenderer.invoke('transactions:list', filters),

  // Stats
  getMonthlyStats: (year: number, month: number) => ipcRenderer.invoke('stats:monthly', year, month),
  getTrend: (startDate: string, endDate: string, granularity: string) =>
    ipcRenderer.invoke('stats:trend', startDate, endDate, granularity),

  // Annual
  getAnnualStats: (year: number) => ipcRenderer.invoke('stats:annual', year),
  getCategoryTrend: (categoryId: number, startDate: string, endDate: string) =>
    ipcRenderer.invoke('stats:category-trend', categoryId, startDate, endDate),

  // Export
  exportTransactions: (filters: {
    startDate?: string; endDate?: string; type?: string; categoryIds?: number[]
  }) => ipcRenderer.invoke('transactions:export', filters),

  // Locale
  getLocale: () => ipcRenderer.invoke('locale:get'),
  setLocale: (locale: string) => ipcRenderer.invoke('locale:set', locale),

  // Theme
  getTheme: () => ipcRenderer.invoke('theme:get'),
  onThemeChanged: (callback: (theme: 'dark' | 'light') => void) => {
    const handler = (_event: Electron.IpcRendererEvent, theme: 'dark' | 'light'): void => callback(theme)
    ipcRenderer.on('theme:changed', handler)
    return () => ipcRenderer.removeListener('theme:changed', handler)
  },

  // Mini window
  closeMiniWindow: () => ipcRenderer.invoke('mini:close'),

  // Import
  selectImportFile: () => ipcRenderer.invoke('import:select-file'),
  parseImportFile: (filePath: string) => ipcRenderer.invoke('import:parse', filePath),
  batchCreateTransactions: (items: {
    type: string; amount: number; currency: string; category_id: number; date: string; note: string
  }[]) => ipcRenderer.invoke('transactions:batch-create', items),
  backupExport: () => ipcRenderer.invoke('backup:export'),
  backupImport: () => ipcRenderer.invoke('backup:import'),
  saveImportHistory: (record: {
    source: string; count: number; dateFrom: string; dateTo: string
  }) => ipcRenderer.invoke('import:save-history', record),
  listImportHistory: () => ipcRenderer.invoke('import:list-history'),

  // Category mappings
  listMappings: () => ipcRenderer.invoke('mappings:list'),
  createMapping: (data: { keyword: string; category_id: number }) =>
    ipcRenderer.invoke('mappings:create', data),
  deleteMapping: (id: number) => ipcRenderer.invoke('mappings:delete', id),

  // Investment
  createInvestment: (data: { type: string; amount: number; date: string; note: string }) =>
    ipcRenderer.invoke('investment:create', data),
  listInvestments: (filters: { limit?: number; offset?: number }) =>
    ipcRenderer.invoke('investment:list', filters),
  deleteInvestment: (id: number) => ipcRenderer.invoke('investment:delete', id),
  getInvestmentSummary: () => ipcRenderer.invoke('investment:summary'),
  getInvestmentAnnual: (year: number) => ipcRenderer.invoke('investment:annual', year),

  // Export enhanced
  exportExcel: (filters: {
    startDate?: string; endDate?: string; type?: string; categoryIds?: number[]
  }) => ipcRenderer.invoke('export:excel', filters),
  exportMonthlyReport: (year: number, month: number) =>
    ipcRenderer.invoke('export:monthly-report', year, month),
  exportMonthlyPdf: (year: number, month: number) =>
    ipcRenderer.invoke('export:monthly-pdf', year, month),
  exportAnnualPdf: (year: number) => ipcRenderer.invoke('export:annual-pdf', year),
  exportInvestmentAnnualPdf: (year: number) => ipcRenderer.invoke('export:investment-annual-pdf', year)
}

contextBridge.exposeInMainWorld('api', api)
