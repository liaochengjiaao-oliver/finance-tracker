import { ElectronAPI } from '@electron-toolkit/preload'

interface UserProfile {
  id: string
  name: string
  createdAt: string
}

interface Api {
  listUsers: () => Promise<UserProfile[]>
  getCurrentUser: () => Promise<UserProfile | null>
  createUser: (name: string) => Promise<UserProfile>
  switchUser: (id: string) => Promise<void>
  deleteUser: (id: string) => Promise<{ success: boolean; message?: string }>
  updateUser: (id: string, data: { name?: string }) => Promise<void>
  onUserSwitched: (callback: () => void) => () => void
  getCategories: (type?: string) => Promise<Category[]>
  createCategory: (data: { name: string; type: string }) => Promise<number>
  updateCategory: (id: number, data: { name?: string; sort_order?: number }) => Promise<void>
  deleteCategory: (id: number) => Promise<{ success: boolean; message?: string }>
  createTransaction: (data: {
    type: string; amount: number; category_id: number; date: string; note: string; currency?: string
  }) => Promise<number>
  updateTransaction: (id: number, data: {
    type?: string; amount?: number; category_id?: number; date?: string; note?: string; currency?: string
  }) => Promise<void>
  deleteTransaction: (id: number) => Promise<void>
  batchDeleteTransactions: (ids: number[]) => Promise<number>
  listTransactionIds: (filters: {
    startDate?: string; endDate?: string; type?: string;
    categoryIds?: number[]; keyword?: string; minAmount?: number; maxAmount?: number
  }) => Promise<number[]>
  getTransactions: (filters: {
    startDate?: string; endDate?: string; type?: string;
    categoryIds?: number[]; keyword?: string; minAmount?: number; maxAmount?: number;
    limit?: number; offset?: number
  }) => Promise<TransactionListResult>
  getMonthlyStats: (year: number, month: number) => Promise<MonthlyStats>
  getAnnualStats: (year: number) => Promise<AnnualStats>
  getCategoryTrend: (categoryId: number, startDate: string, endDate: string) =>
    Promise<{ period: string; amount: number }[]>
  getTrend: (startDate: string, endDate: string, granularity: string) => Promise<TrendItem[]>
  exportTransactions: (filters: {
    startDate?: string; endDate?: string; type?: string; categoryIds?: number[]
  }) => Promise<ExportRow[]>
  getTheme: () => Promise<'dark' | 'light'>
  onThemeChanged: (callback: (theme: 'dark' | 'light') => void) => () => void
  closeMiniWindow: () => Promise<void>
  backupExport: () => Promise<{ success: boolean; path?: string }>
  backupImport: () => Promise<{ success: boolean; message?: string }>
  selectImportFile: () => Promise<string | null>
  parseImportFile: (filePath: string) => Promise<ImportParseResult>
  batchCreateTransactions: (items: BatchTransactionItem[]) => Promise<number>
  saveImportHistory: (record: {
    source: string; count: number; dateFrom: string; dateTo: string
  }) => Promise<void>
  listImportHistory: () => Promise<ImportHistoryRecord[]>
  listMappings: () => Promise<CategoryMapping[]>
  createMapping: (data: { keyword: string; category_id: number }) => Promise<void>
  deleteMapping: (id: number) => Promise<void>
  exportExcel: (filters: {
    startDate?: string; endDate?: string; type?: string; categoryIds?: number[]
  }) => Promise<{ success: boolean; path?: string }>
  exportMonthlyReport: (year: number, month: number) => Promise<{ success: boolean; path?: string }>
  exportMonthlyPdf: (year: number, month: number) => Promise<{ success: boolean; path?: string }>
  exportAnnualPdf: (year: number) => Promise<{ success: boolean; path?: string }>
}

interface Category {
  id: number
  name: string
  type: 'income' | 'expense'
  sort_order: number
  is_default: number
  created_at: string
}

interface Transaction {
  id: number
  type: 'income' | 'expense'
  amount: number
  currency: string
  category_id: number
  category_name: string
  date: string
  note: string
  created_at: string
  updated_at: string
}

interface TransactionListResult {
  data: Transaction[]
  total: number
  totalIncome: number
  totalExpense: number
}

interface MonthlyStats {
  current: { income: number; expense: number }
  previous: { income: number; expense: number }
  byCategory: { name: string; type: string; total: number }[]
  daily: { date: string; income: number; expense: number }[]
}

interface TrendItem {
  period: string
  income: number
  expense: number
}

interface ExportRow {
  date: string
  type: string
  category: string
  amount: number
  note: string
}

interface AnnualStats {
  current: { income: number; expense: number }
  previous: { income: number; expense: number }
  byCategory: { name: string; type: string; total: number }[]
  monthly: { month: string; income: number; expense: number }[]
  totalDays: number
  totalCount: number
}

interface ImportPreviewItem {
  date: string
  type: 'income' | 'expense'
  amount: number
  currency: string
  categoryMatch: string
  category_id?: number
  note: string
  source: 'alipay' | 'wechat'
  original: string
  selected: boolean
  duplicate: boolean
  duplicateNote?: string
}

interface ImportParseResult {
  source: 'alipay' | 'wechat'
  items: ImportPreviewItem[]
  skipped: number
  dateRange: [string, string]
}

interface ImportHistoryRecord {
  id: number
  source: string
  count: number
  date_from: string
  date_to: string
  created_at: string
}

interface CategoryMapping {
  id: number
  keyword: string
  category_id: number
  category_name: string
  category_type: string
}

interface BatchTransactionItem {
  type: string
  amount: number
  currency: string
  category_id: number
  date: string
  note: string
}

declare global {
  interface Window {
    api: Api
  }
}
