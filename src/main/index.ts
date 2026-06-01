import {
  app, BrowserWindow, ipcMain, shell, globalShortcut,
  Tray, Menu, nativeTheme, nativeImage, dialog
} from 'electron'
import { join } from 'path'
import { readFileSync } from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import {
  initUserConfig, initDatabase, getDatabase, saveDatabase, switchUser,
  listUsers, createUser, deleteUser, updateUser, getCurrentUser, getCurrentUserId, getDbPath
} from './database'
import * as iconv from 'iconv-lite'
import * as XLSX from 'xlsx'

let mainWindow: BrowserWindow | null = null
let miniWindow: BrowserWindow | null = null
let tray: Tray | null = null
let isQuitting = false

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow!.show()
  })

  mainWindow.on('close', (e) => {
    if (process.platform === 'darwin' && tray && !isQuitting) {
      e.preventDefault()
      mainWindow!.hide()
    }
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  loadURL(mainWindow)
}

function loadURL(win: BrowserWindow, hash?: string): void {
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    const url = hash
      ? `${process.env['ELECTRON_RENDERER_URL']}#${hash}`
      : process.env['ELECTRON_RENDERER_URL']
    win.loadURL(url)
  } else {
    const filePath = join(__dirname, '../renderer/index.html')
    if (hash) {
      win.loadFile(filePath, { hash })
    } else {
      win.loadFile(filePath)
    }
  }
}

// --- Mini Quick-Add Window ---
function createMiniWindow(): void {
  if (miniWindow && !miniWindow.isDestroyed()) {
    miniWindow.show()
    miniWindow.focus()
    return
  }

  miniWindow = new BrowserWindow({
    width: 420,
    height: 460,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    frame: false,
    show: false,
    titleBarStyle: 'default',
    vibrancy: 'under-window',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  miniWindow.on('ready-to-show', () => {
    miniWindow!.show()
    miniWindow!.focus()
  })

  miniWindow.on('blur', () => {
    if (miniWindow && !miniWindow.isDestroyed()) {
      miniWindow.hide()
    }
  })

  loadURL(miniWindow, 'mini')
}

// --- System Tray ---
function createTray(): void {
  const icon = nativeImage.createEmpty()
  tray = new Tray(icon)

  // macOS: use template title as icon fallback
  if (process.platform === 'darwin') {
    tray.setTitle('¥')
  }

  updateTrayMenu()

  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.focus()
      } else {
        mainWindow.show()
      }
    }
  })
}

function updateTrayMenu(): void {
  if (!tray) return

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '快速记账',
      accelerator: 'CmdOrCtrl+Shift+N',
      click: () => createMiniWindow()
    },
    {
      label: '显示主窗口',
      click: () => {
        if (mainWindow) {
          mainWindow.show()
          mainWindow.focus()
        }
      }
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        if (mainWindow) mainWindow.destroy()
        app.quit()
      }
    }
  ])

  tray.setContextMenu(contextMenu)
  tray.setToolTip('个人记账')
}

// --- Database helpers ---
function queryAll(sql: string, params: unknown[] = []): Record<string, unknown>[] {
  const db = getDatabase()
  const stmt = db.prepare(sql)
  if (params.length > 0) stmt.bind(params)
  const results: Record<string, unknown>[] = []
  while (stmt.step()) {
    results.push(stmt.getAsObject() as Record<string, unknown>)
  }
  stmt.free()
  return results
}

function queryOne(sql: string, params: unknown[] = []): Record<string, unknown> | undefined {
  const rows = queryAll(sql, params)
  return rows[0]
}

function runSql(sql: string, params: unknown[] = []): void {
  const db = getDatabase()
  db.run(sql, params)
  saveDatabase()
}

function getLastInsertId(): number {
  const db = getDatabase()
  const result = db.exec('SELECT last_insert_rowid() as id')
  return result[0]?.values[0]?.[0] as number
}

// --- App lifecycle ---
app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.personal-finance')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  const config = initUserConfig()
  registerIpcHandlers()

  // Auto-login last user if available
  if (config.lastUserId && config.users.some((u) => u.id === config.lastUserId)) {
    await initDatabase(config.lastUserId)
  }

  createWindow()
  createTray()

  globalShortcut.register('CmdOrCtrl+Shift+N', () => {
    if (getCurrentUserId()) {
      createMiniWindow()
    }
  })

  app.on('activate', () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      createWindow()
    } else {
      mainWindow.show()
    }
  })
})

app.on('before-quit', () => {
  isQuitting = true
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

function registerIpcHandlers(): void {
  // --- Users ---
  ipcMain.handle('users:list', () => {
    return listUsers()
  })

  ipcMain.handle('users:current', () => {
    return getCurrentUser()
  })

  ipcMain.handle('users:create', async (_event, name: string) => {
    const user = createUser(name)
    await initDatabase(user.id)
    // Reload all windows to reflect new user
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send('user:switched')
    })
    return user
  })

  ipcMain.handle('users:switch', async (_event, userId: string) => {
    // Close mini window
    if (miniWindow && !miniWindow.isDestroyed()) {
      miniWindow.destroy()
      miniWindow = null
    }
    await switchUser(userId)
    // Notify all windows
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send('user:switched')
    })
  })

  ipcMain.handle('users:delete', (_event, userId: string) => {
    return deleteUser(userId)
  })

  ipcMain.handle('users:update', (_event, userId: string, data: { name?: string }) => {
    updateUser(userId, data)
  })

  // --- Theme ---
  ipcMain.handle('theme:get', () => {
    return nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
  })

  nativeTheme.on('updated', () => {
    const theme = nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send('theme:changed', theme)
    })
  })

  // --- Mini window ---
  ipcMain.handle('mini:close', () => {
    if (miniWindow && !miniWindow.isDestroyed()) {
      miniWindow.hide()
    }
  })

  // --- Categories ---
  ipcMain.handle('categories:list', (_event, type?: string) => {
    if (type) {
      return queryAll('SELECT * FROM categories WHERE type = ? ORDER BY sort_order, id', [type])
    }
    return queryAll('SELECT * FROM categories ORDER BY type, sort_order, id')
  })

  ipcMain.handle('categories:create', (_event, data: { name: string; type: string }) => {
    const row = queryOne(
      'SELECT COALESCE(MAX(sort_order), 0) as max_order FROM categories WHERE type = ?',
      [data.type]
    )
    const maxOrder = (row?.max_order as number) || 0
    runSql(
      'INSERT INTO categories (name, type, sort_order, is_default, created_at) VALUES (?, ?, ?, 0, ?)',
      [data.name, data.type, maxOrder + 1, new Date().toISOString()]
    )
    return getLastInsertId()
  })

  ipcMain.handle('categories:update', (_event, id: number, data: { name?: string; sort_order?: number }) => {
    const sets: string[] = []
    const values: unknown[] = []
    if (data.name !== undefined) { sets.push('name = ?'); values.push(data.name) }
    if (data.sort_order !== undefined) { sets.push('sort_order = ?'); values.push(data.sort_order) }
    values.push(id)
    runSql(`UPDATE categories SET ${sets.join(', ')} WHERE id = ?`, values)
  })

  ipcMain.handle('categories:delete', (_event, id: number) => {
    const row = queryOne('SELECT COUNT(*) as count FROM transactions WHERE category_id = ?', [id])
    if ((row?.count as number) > 0) {
      return { success: false, message: '该分类下有记录，请先迁移后再删除' }
    }
    runSql('DELETE FROM categories WHERE id = ?', [id])
    return { success: true }
  })

  // --- Transactions ---
  ipcMain.handle('transactions:create', (_event, data: {
    type: string; amount: number; category_id: number; date: string; note: string; currency?: string
  }) => {
    const now = new Date().toISOString()
    runSql(
      'INSERT INTO transactions (type, amount, currency, category_id, date, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [data.type, data.amount, data.currency || 'CNY', data.category_id, data.date, data.note, now, now]
    )
    return getLastInsertId()
  })

  ipcMain.handle('transactions:update', (_event, id: number, data: {
    type?: string; amount?: number; category_id?: number; date?: string; note?: string; currency?: string
  }) => {
    const sets: string[] = ['updated_at = ?']
    const values: unknown[] = [new Date().toISOString()]
    if (data.type !== undefined) { sets.push('type = ?'); values.push(data.type) }
    if (data.amount !== undefined) { sets.push('amount = ?'); values.push(data.amount) }
    if (data.currency !== undefined) { sets.push('currency = ?'); values.push(data.currency) }
    if (data.category_id !== undefined) { sets.push('category_id = ?'); values.push(data.category_id) }
    if (data.date !== undefined) { sets.push('date = ?'); values.push(data.date) }
    if (data.note !== undefined) { sets.push('note = ?'); values.push(data.note) }
    values.push(id)
    runSql(`UPDATE transactions SET ${sets.join(', ')} WHERE id = ?`, values)
  })

  ipcMain.handle('transactions:delete', (_event, id: number) => {
    runSql('DELETE FROM transactions WHERE id = ?', [id])
  })

  ipcMain.handle('transactions:list-ids', (_event, filters: {
    startDate?: string; endDate?: string; type?: string;
    categoryIds?: number[]; keyword?: string; minAmount?: number; maxAmount?: number
  }) => {
    let where = 'WHERE 1=1'
    const params: unknown[] = []
    if (filters.startDate) { where += ' AND t.date >= ?'; params.push(filters.startDate) }
    if (filters.endDate) { where += ' AND t.date <= ?'; params.push(filters.endDate) }
    if (filters.type) { where += ' AND t.type = ?'; params.push(filters.type) }
    if (filters.categoryIds && filters.categoryIds.length > 0) {
      where += ` AND t.category_id IN (${filters.categoryIds.map(() => '?').join(',')})`
      params.push(...filters.categoryIds)
    }
    if (filters.keyword) { where += ' AND t.note LIKE ?'; params.push(`%${filters.keyword}%`) }
    if (filters.minAmount != null) { where += ' AND t.amount >= ?'; params.push(filters.minAmount) }
    if (filters.maxAmount != null) { where += ' AND t.amount <= ?'; params.push(filters.maxAmount) }
    const rows = queryAll(`SELECT t.id FROM transactions t ${where}`, params) as { id: number }[]
    return rows.map(r => r.id)
  })

  ipcMain.handle('transactions:batch-delete', (_event, ids: number[]) => {
    if (ids.length === 0) return 0
    const placeholders = ids.map(() => '?').join(',')
    runSql(`DELETE FROM transactions WHERE id IN (${placeholders})`, ids)
    return ids.length
  })

  ipcMain.handle('transactions:list', (_event, filters: {
    startDate?: string; endDate?: string; type?: string;
    categoryIds?: number[]; keyword?: string; minAmount?: number; maxAmount?: number;
    limit?: number; offset?: number
  }) => {
    let where = 'WHERE 1=1'
    const params: unknown[] = []

    if (filters.startDate) { where += ' AND t.date >= ?'; params.push(filters.startDate) }
    if (filters.endDate) { where += ' AND t.date <= ?'; params.push(filters.endDate) }
    if (filters.type) { where += ' AND t.type = ?'; params.push(filters.type) }
    if (filters.categoryIds && filters.categoryIds.length > 0) {
      where += ` AND t.category_id IN (${filters.categoryIds.map(() => '?').join(',')})`
      params.push(...filters.categoryIds)
    }
    if (filters.keyword) { where += ' AND t.note LIKE ?'; params.push(`%${filters.keyword}%`) }
    if (filters.minAmount !== undefined) { where += ' AND t.amount >= ?'; params.push(filters.minAmount) }
    if (filters.maxAmount !== undefined) { where += ' AND t.amount <= ?'; params.push(filters.maxAmount) }

    const countRow = queryOne(`SELECT COUNT(*) as total FROM transactions t ${where}`, params)
    const summaryRow = queryOne(
      `SELECT
        COALESCE(SUM(CASE WHEN t.type = 'income' THEN t.amount ELSE 0 END), 0) as totalIncome,
        COALESCE(SUM(CASE WHEN t.type = 'expense' THEN t.amount ELSE 0 END), 0) as totalExpense
      FROM transactions t ${where}`,
      params
    )

    const limit = filters.limit || 50
    const offset = filters.offset || 0

    const rows = queryAll(
      `SELECT t.*, c.name as category_name
       FROM transactions t
       LEFT JOIN categories c ON t.category_id = c.id
       ${where}
       ORDER BY t.date DESC, t.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    )

    return {
      data: rows,
      total: (countRow?.total as number) || 0,
      totalIncome: (summaryRow?.totalIncome as number) || 0,
      totalExpense: (summaryRow?.totalExpense as number) || 0
    }
  })

  // --- Statistics ---
  ipcMain.handle('stats:monthly', (_event, year: number, month: number) => {
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`
    const nextMonth = month === 12 ? 1 : month + 1
    const nextYear = month === 12 ? year + 1 : year
    const endDate = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`

    const summary = queryOne(
      `SELECT
        COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) as income,
        COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) as expense
      FROM transactions WHERE date >= ? AND date < ?`,
      [startDate, endDate]
    )

    const prevMonth = month === 1 ? 12 : month - 1
    const prevYear = month === 1 ? year - 1 : year
    const prevStartDate = `${prevYear}-${String(prevMonth).padStart(2, '0')}-01`

    const prevSummary = queryOne(
      `SELECT
        COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) as income,
        COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) as expense
      FROM transactions WHERE date >= ? AND date < ?`,
      [prevStartDate, startDate]
    )

    const byCategory = queryAll(
      `SELECT c.name, t.type, SUM(t.amount) as total
       FROM transactions t
       LEFT JOIN categories c ON t.category_id = c.id
       WHERE t.date >= ? AND t.date < ?
       GROUP BY t.category_id, t.type
       ORDER BY total DESC`,
      [startDate, endDate]
    )

    const daily = queryAll(
      `SELECT date,
        SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) as income,
        SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) as expense
       FROM transactions
       WHERE date >= ? AND date < ?
       GROUP BY date ORDER BY date`,
      [startDate, endDate]
    )

    return {
      current: { income: (summary?.income as number) || 0, expense: (summary?.expense as number) || 0 },
      previous: { income: (prevSummary?.income as number) || 0, expense: (prevSummary?.expense as number) || 0 },
      byCategory,
      daily
    }
  })

  ipcMain.handle('stats:trend', (_event, startDate: string, endDate: string, granularity: string) => {
    let groupExpr: string
    if (granularity === 'daily') groupExpr = 'date'
    else if (granularity === 'weekly') groupExpr = "strftime('%Y-W%W', date)"
    else if (granularity === 'yearly') groupExpr = "strftime('%Y', date)"
    else groupExpr = "strftime('%Y-%m', date)"

    return queryAll(
      `SELECT ${groupExpr} as period,
        SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) as income,
        SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) as expense
       FROM transactions
       WHERE date >= ? AND date <= ?
       GROUP BY period ORDER BY period`,
      [startDate, endDate]
    )
  })

  ipcMain.handle('stats:category-trend', (_event, categoryId: number, startDate: string, endDate: string) => {
    return queryAll(
      `SELECT strftime('%Y-%m', date) as period, SUM(amount) as amount
       FROM transactions
       WHERE category_id = ? AND date >= ? AND date <= ?
       GROUP BY period ORDER BY period`,
      [categoryId, startDate, endDate]
    )
  })

  ipcMain.handle('stats:annual', (_event, year: number) => {
    const startDate = `${year}-01-01`
    const endDate = `${year + 1}-01-01`
    const prevStartDate = `${year - 1}-01-01`

    const summary = queryOne(
      `SELECT
        COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) as income,
        COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) as expense,
        COUNT(*) as totalCount,
        COUNT(DISTINCT date) as totalDays
      FROM transactions WHERE date >= ? AND date < ?`,
      [startDate, endDate]
    )

    const prevSummary = queryOne(
      `SELECT
        COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) as income,
        COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) as expense
      FROM transactions WHERE date >= ? AND date < ?`,
      [prevStartDate, startDate]
    )

    const byCategory = queryAll(
      `SELECT c.name, t.type, SUM(t.amount) as total
       FROM transactions t
       LEFT JOIN categories c ON t.category_id = c.id
       WHERE t.date >= ? AND t.date < ?
       GROUP BY t.category_id, t.type
       ORDER BY total DESC`,
      [startDate, endDate]
    )

    const monthly = queryAll(
      `SELECT strftime('%Y-%m', date) as month,
        SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) as income,
        SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) as expense
       FROM transactions
       WHERE date >= ? AND date < ?
       GROUP BY month ORDER BY month`,
      [startDate, endDate]
    )

    return {
      current: { income: (summary?.income as number) || 0, expense: (summary?.expense as number) || 0 },
      previous: { income: (prevSummary?.income as number) || 0, expense: (prevSummary?.expense as number) || 0 },
      byCategory,
      monthly,
      totalDays: (summary?.totalDays as number) || 0,
      totalCount: (summary?.totalCount as number) || 0
    }
  })

  ipcMain.handle('transactions:export', (_event, filters: {
    startDate?: string; endDate?: string; type?: string; categoryIds?: number[]
  }) => {
    let where = 'WHERE 1=1'
    const params: unknown[] = []
    if (filters.startDate) { where += ' AND t.date >= ?'; params.push(filters.startDate) }
    if (filters.endDate) { where += ' AND t.date <= ?'; params.push(filters.endDate) }
    if (filters.type) { where += ' AND t.type = ?'; params.push(filters.type) }
    if (filters.categoryIds && filters.categoryIds.length > 0) {
      where += ` AND t.category_id IN (${filters.categoryIds.map(() => '?').join(',')})`
      params.push(...filters.categoryIds)
    }

    return queryAll(
      `SELECT t.date, t.type, c.name as category, t.amount, t.note
       FROM transactions t
       LEFT JOIN categories c ON t.category_id = c.id
       ${where}
       ORDER BY t.date DESC, t.created_at DESC`,
      params
    )
  })

  // --- Export enhanced ---
  ipcMain.handle('export:excel', async (_event, filters: {
    startDate?: string; endDate?: string; type?: string; categoryIds?: number[]
  }) => {
    const rows = queryAll(
      (() => {
        let where = 'WHERE 1=1'
        const params: unknown[] = []
        if (filters.startDate) { where += ' AND t.date >= ?'; params.push(filters.startDate) }
        if (filters.endDate) { where += ' AND t.date <= ?'; params.push(filters.endDate) }
        if (filters.type) { where += ' AND t.type = ?'; params.push(filters.type) }
        if (filters.categoryIds && filters.categoryIds.length > 0) {
          where += ` AND t.category_id IN (${filters.categoryIds.map(() => '?').join(',')})`
          params.push(...filters.categoryIds)
        }
        return { sql: `SELECT t.date, t.type, c.name as category, t.amount, t.currency, t.note FROM transactions t LEFT JOIN categories c ON t.category_id = c.id ${where} ORDER BY t.date DESC, t.created_at DESC`, params }
      })().sql,
      (() => {
        const params: unknown[] = []
        if (filters.startDate) params.push(filters.startDate)
        if (filters.endDate) params.push(filters.endDate)
        if (filters.type) params.push(filters.type)
        if (filters.categoryIds && filters.categoryIds.length > 0) params.push(...filters.categoryIds)
        return params
      })()
    )

    const result = await dialog.showSaveDialog({
      title: '导出 Excel',
      defaultPath: `账单_${new Date().toISOString().substring(0, 10).replace(/-/g, '')}.xlsx`,
      filters: [{ name: 'Excel 文件', extensions: ['xlsx'] }]
    })
    if (result.canceled || !result.filePath) return { success: false }

    const ExcelJS = require('exceljs')
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('账单明细')

    const headers = ['日期', '类型', '分类', '金额', '币种', '备注']
    const headerRow = sheet.addRow(headers)
    headerRow.eachCell((cell: any) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } }
      cell.alignment = { horizontal: 'center' }
    })

    let totalIncome = 0, totalExpense = 0
    for (const r of rows) {
      const row = sheet.addRow([
        r.date,
        r.type === 'income' ? '收入' : '支出',
        r.category,
        r.amount,
        r.currency || 'CNY',
        r.note || ''
      ])
      const amountCell = row.getCell(4)
      amountCell.numFmt = '#,##0.00'
      amountCell.alignment = { horizontal: 'right' }
      if (r.type === 'income') {
        amountCell.font = { color: { argb: 'FF00B050' } }
        totalIncome += r.amount as number
      } else {
        amountCell.font = { color: { argb: 'FFFF0000' } }
        totalExpense += r.amount as number
      }
    }

    sheet.addRow([])
    const summaryRow = sheet.addRow(['汇总', '', '', '', '', ''])
    summaryRow.getCell(1).font = { bold: true }
    const incomeRow = sheet.addRow(['', '总收入', '', totalIncome, '', ''])
    incomeRow.getCell(4).numFmt = '#,##0.00'
    incomeRow.getCell(4).font = { bold: true, color: { argb: 'FF00B050' } }
    const expenseRow = sheet.addRow(['', '总支出', '', totalExpense, '', ''])
    expenseRow.getCell(4).numFmt = '#,##0.00'
    expenseRow.getCell(4).font = { bold: true, color: { argb: 'FFFF0000' } }
    const balanceRow = sheet.addRow(['', '结余', '', totalIncome - totalExpense, '', ''])
    balanceRow.getCell(4).numFmt = '#,##0.00'
    balanceRow.getCell(4).font = { bold: true }

    sheet.columns = [
      { width: 14 }, { width: 8 }, { width: 12 }, { width: 14 }, { width: 8 }, { width: 40 }
    ]

    await workbook.xlsx.writeFile(result.filePath)
    return { success: true, path: result.filePath }
  })

  ipcMain.handle('export:monthly-report', async (_event, year: number, month: number) => {
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`
    const nextMonth = month === 12 ? 1 : month + 1
    const nextYear = month === 12 ? year + 1 : year
    const endDate = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`

    const summary = queryOne(
      `SELECT
        COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) as income,
        COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) as expense
      FROM transactions WHERE date >= ? AND date < ?`,
      [startDate, endDate]
    )

    const prevMonth = month === 1 ? 12 : month - 1
    const prevYear = month === 1 ? year - 1 : year
    const prevStartDate = `${prevYear}-${String(prevMonth).padStart(2, '0')}-01`
    const prevSummary = queryOne(
      `SELECT
        COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) as income,
        COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) as expense
      FROM transactions WHERE date >= ? AND date < ?`,
      [prevStartDate, startDate]
    )

    const byCategory = queryAll(
      `SELECT c.name, t.type, SUM(t.amount) as total
       FROM transactions t LEFT JOIN categories c ON t.category_id = c.id
       WHERE t.date >= ? AND t.date < ?
       GROUP BY t.category_id, t.type ORDER BY total DESC`,
      [startDate, endDate]
    )

    const daily = queryAll(
      `SELECT date,
        SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) as income,
        SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) as expense
       FROM transactions WHERE date >= ? AND date < ?
       GROUP BY date ORDER BY date`,
      [startDate, endDate]
    )

    const transactions = queryAll(
      `SELECT t.date, t.type, c.name as category, t.amount, t.currency, t.note
       FROM transactions t LEFT JOIN categories c ON t.category_id = c.id
       WHERE t.date >= ? AND t.date < ?
       ORDER BY t.date, t.created_at`,
      [startDate, endDate]
    )

    const result = await dialog.showSaveDialog({
      title: '导出月度报告',
      defaultPath: `月度报告_${year}年${String(month).padStart(2, '0')}月.xlsx`,
      filters: [{ name: 'Excel 文件', extensions: ['xlsx'] }]
    })
    if (result.canceled || !result.filePath) return { success: false }

    const ExcelJS = require('exceljs')
    const workbook = new ExcelJS.Workbook()

    const styleHeader = (row: any): void => {
      row.eachCell((cell: any) => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } }
        cell.alignment = { horizontal: 'center' }
      })
    }

    // Sheet 1: Overview
    const s1 = workbook.addWorksheet('收支概览')
    s1.addRow([`${year}年${month}月 收支报告`]).getCell(1).font = { bold: true, size: 16 }
    s1.addRow([])
    const income = (summary?.income as number) || 0
    const expense = (summary?.expense as number) || 0
    const prevIncome = (prevSummary?.income as number) || 0
    const prevExpense = (prevSummary?.expense as number) || 0

    styleHeader(s1.addRow(['项目', '本月', '上月', '环比变化']))
    const addOverviewRow = (label: string, cur: number, prev: number): void => {
      const change = prev > 0 ? `${((cur - prev) / prev * 100).toFixed(1)}%` : '-'
      const row = s1.addRow([label, cur, prev, change])
      row.getCell(2).numFmt = '#,##0.00'
      row.getCell(3).numFmt = '#,##0.00'
    }
    addOverviewRow('收入', income, prevIncome)
    addOverviewRow('支出', expense, prevExpense)
    const balRow = s1.addRow(['结余', income - expense, prevIncome - prevExpense, ''])
    balRow.getCell(2).numFmt = '#,##0.00'
    balRow.getCell(3).numFmt = '#,##0.00'
    balRow.eachCell((c: any) => { c.font = { bold: true } })
    s1.columns = [{ width: 12 }, { width: 16 }, { width: 16 }, { width: 14 }]

    // Sheet 2: Category breakdown
    const s2 = workbook.addWorksheet('分类汇总')
    s2.addRow([`${year}年${month}月 分类汇总`]).getCell(1).font = { bold: true, size: 14 }
    s2.addRow([])
    const expenseCats = byCategory.filter((c: any) => c.type === 'expense')
    const incomeCats = byCategory.filter((c: any) => c.type === 'income')

    if (expenseCats.length > 0) {
      s2.addRow(['支出分类']).getCell(1).font = { bold: true, size: 12 }
      styleHeader(s2.addRow(['分类', '金额', '占比']))
      const totalExp = expenseCats.reduce((s: number, c: any) => s + (c.total as number), 0)
      for (const c of expenseCats) {
        const row = s2.addRow([c.name, c.total, `${(c.total as number / totalExp * 100).toFixed(1)}%`])
        row.getCell(2).numFmt = '#,##0.00'
      }
      s2.addRow([])
    }

    if (incomeCats.length > 0) {
      s2.addRow(['收入分类']).getCell(1).font = { bold: true, size: 12 }
      styleHeader(s2.addRow(['分类', '金额', '占比']))
      const totalInc = incomeCats.reduce((s: number, c: any) => s + (c.total as number), 0)
      for (const c of incomeCats) {
        const row = s2.addRow([c.name, c.total, `${(c.total as number / totalInc * 100).toFixed(1)}%`])
        row.getCell(2).numFmt = '#,##0.00'
      }
    }
    s2.columns = [{ width: 14 }, { width: 16 }, { width: 12 }]

    // Sheet 3: Daily
    const s3 = workbook.addWorksheet('每日明细')
    styleHeader(s3.addRow(['日期', '收入', '支出', '结余']))
    for (const d of daily) {
      const row = s3.addRow([d.date, d.income, d.expense, (d.income as number) - (d.expense as number)])
      row.getCell(2).numFmt = '#,##0.00'
      row.getCell(3).numFmt = '#,##0.00'
      row.getCell(4).numFmt = '#,##0.00'
    }
    s3.columns = [{ width: 14 }, { width: 14 }, { width: 14 }, { width: 14 }]

    // Sheet 4: Transactions
    const s4 = workbook.addWorksheet('交易记录')
    styleHeader(s4.addRow(['日期', '类型', '分类', '金额', '币种', '备注']))
    for (const t of transactions) {
      const row = s4.addRow([t.date, t.type === 'income' ? '收入' : '支出', t.category, t.amount, t.currency || 'CNY', t.note || ''])
      row.getCell(4).numFmt = '#,##0.00'
      if (t.type === 'income') row.getCell(4).font = { color: { argb: 'FF00B050' } }
      else row.getCell(4).font = { color: { argb: 'FFFF0000' } }
    }
    s4.columns = [{ width: 14 }, { width: 8 }, { width: 12 }, { width: 14 }, { width: 8 }, { width: 40 }]

    await workbook.xlsx.writeFile(result.filePath)
    return { success: true, path: result.filePath }
  })

  ipcMain.handle('export:monthly-pdf', async (_event, year: number, month: number) => {
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`
    const nextMonth = month === 12 ? 1 : month + 1
    const nextYear = month === 12 ? year + 1 : year
    const endDate = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`

    const summary = queryOne(
      `SELECT
        COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) as income,
        COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) as expense
      FROM transactions WHERE date >= ? AND date < ?`,
      [startDate, endDate]
    )

    const byCategory = queryAll(
      `SELECT c.name, t.type, SUM(t.amount) as total
       FROM transactions t LEFT JOIN categories c ON t.category_id = c.id
       WHERE t.date >= ? AND t.date < ?
       GROUP BY t.category_id, t.type ORDER BY total DESC`,
      [startDate, endDate]
    )

    const daily = queryAll(
      `SELECT date,
        SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) as income,
        SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) as expense
       FROM transactions WHERE date >= ? AND date < ?
       GROUP BY date ORDER BY date`,
      [startDate, endDate]
    )

    const saveResult = await dialog.showSaveDialog({
      title: '导出月度 PDF 报告',
      defaultPath: `月度报告_${year}年${String(month).padStart(2, '0')}月.pdf`,
      filters: [{ name: 'PDF 文件', extensions: ['pdf'] }]
    })
    if (saveResult.canceled || !saveResult.filePath) return { success: false }

    const income = (summary?.income as number) || 0
    const expense = (summary?.expense as number) || 0
    const expenseCats = byCategory.filter((c: any) => c.type === 'expense')
    const incomeCats = byCategory.filter((c: any) => c.type === 'income')
    const totalExp = expenseCats.reduce((s: number, c: any) => s + (c.total as number), 0)
    const totalInc = incomeCats.reduce((s: number, c: any) => s + (c.total as number), 0)

    const catRows = (cats: any[], total: number) => cats.map((c: any) =>
      `<tr><td>${c.name}</td><td style="text-align:right">¥${(c.total as number).toFixed(2)}</td><td style="text-align:right">${(c.total as number / total * 100).toFixed(1)}%</td></tr>`
    ).join('')

    const dailyRows = daily.map((d: any) =>
      `<tr><td>${d.date}</td><td style="text-align:right;color:#00B050">¥${(d.income as number).toFixed(2)}</td><td style="text-align:right;color:#FF0000">¥${(d.expense as number).toFixed(2)}</td></tr>`
    ).join('')

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
      body { font-family: -apple-system, "PingFang SC", "Hiragino Sans GB", sans-serif; padding: 40px; color: #333; }
      h1 { text-align: center; font-size: 22px; margin-bottom: 30px; }
      h2 { font-size: 16px; border-bottom: 2px solid #4472C4; padding-bottom: 6px; margin-top: 30px; }
      table { width: 100%; border-collapse: collapse; margin: 12px 0; }
      th { background: #4472C4; color: white; padding: 8px 12px; text-align: left; }
      td { padding: 6px 12px; border-bottom: 1px solid #eee; }
      .summary-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; margin: 20px 0; }
      .summary-box { background: #f5f5f5; border-radius: 8px; padding: 16px; text-align: center; }
      .summary-box .label { font-size: 13px; color: #888; }
      .summary-box .value { font-size: 24px; font-weight: bold; margin-top: 4px; }
      .income { color: #00B050; } .expense { color: #FF0000; }
    </style></head><body>
      <h1>${year}年${month}月 收支报告</h1>
      <div class="summary-grid">
        <div class="summary-box"><div class="label">总收入</div><div class="value income">¥${income.toFixed(2)}</div></div>
        <div class="summary-box"><div class="label">总支出</div><div class="value expense">¥${expense.toFixed(2)}</div></div>
        <div class="summary-box"><div class="label">结余</div><div class="value">¥${(income - expense).toFixed(2)}</div></div>
      </div>
      ${expenseCats.length > 0 ? `<h2>支出分类</h2><table><tr><th>分类</th><th style="text-align:right">金额</th><th style="text-align:right">占比</th></tr>${catRows(expenseCats, totalExp)}</table>` : ''}
      ${incomeCats.length > 0 ? `<h2>收入分类</h2><table><tr><th>分类</th><th style="text-align:right">金额</th><th style="text-align:right">占比</th></tr>${catRows(incomeCats, totalInc)}</table>` : ''}
      ${daily.length > 0 ? `<h2>每日收支</h2><table><tr><th>日期</th><th style="text-align:right">收入</th><th style="text-align:right">支出</th></tr>${dailyRows}</table>` : ''}
    </body></html>`

    const pdfWindow = new BrowserWindow({ show: false, width: 800, height: 600 })
    await pdfWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
    const pdfBuffer = await pdfWindow.webContents.printToPDF({ printBackground: true })
    pdfWindow.destroy()

    const { writeFileSync } = require('fs')
    writeFileSync(saveResult.filePath, pdfBuffer)
    return { success: true, path: saveResult.filePath }
  })

  ipcMain.handle('export:annual-pdf', async (_event, year: number) => {
    const startDate = `${year}-01-01`
    const endDate = `${year + 1}-01-01`

    const summary = queryOne(
      `SELECT
        COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) as income,
        COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) as expense,
        COUNT(*) as totalCount,
        COUNT(DISTINCT date) as totalDays
      FROM transactions WHERE date >= ? AND date < ?`,
      [startDate, endDate]
    )

    const byCategory = queryAll(
      `SELECT c.name, t.type, SUM(t.amount) as total
       FROM transactions t LEFT JOIN categories c ON t.category_id = c.id
       WHERE t.date >= ? AND t.date < ?
       GROUP BY t.category_id, t.type ORDER BY total DESC`,
      [startDate, endDate]
    )

    const monthly = queryAll(
      `SELECT strftime('%Y-%m', date) as month,
        SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) as income,
        SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) as expense
       FROM transactions WHERE date >= ? AND date < ?
       GROUP BY month ORDER BY month`,
      [startDate, endDate]
    )

    const saveResult = await dialog.showSaveDialog({
      title: '导出年度 PDF 报告',
      defaultPath: `年度报告_${year}年.pdf`,
      filters: [{ name: 'PDF 文件', extensions: ['pdf'] }]
    })
    if (saveResult.canceled || !saveResult.filePath) return { success: false }

    const income = (summary?.income as number) || 0
    const expense = (summary?.expense as number) || 0
    const totalDays = (summary?.totalDays as number) || 0
    const totalCount = (summary?.totalCount as number) || 0
    const expenseCats = byCategory.filter((c: any) => c.type === 'expense')
    const incomeCats = byCategory.filter((c: any) => c.type === 'income')
    const totalExp = expenseCats.reduce((s: number, c: any) => s + (c.total as number), 0)
    const totalInc = incomeCats.reduce((s: number, c: any) => s + (c.total as number), 0)

    const catRows = (cats: any[], total: number) => cats.map((c: any) =>
      `<tr><td>${c.name}</td><td style="text-align:right">¥${(c.total as number).toFixed(2)}</td><td style="text-align:right">${(c.total as number / total * 100).toFixed(1)}%</td></tr>`
    ).join('')

    const monthLabels = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月']
    const monthlyData = monthLabels.map((label, i) => {
      const key = `${year}-${String(i + 1).padStart(2, '0')}`
      const found = monthly.find((m: any) => m.month === key)
      return { label, income: (found?.income as number) || 0, expense: (found?.expense as number) || 0 }
    })
    const monthlyRows = monthlyData.map(m =>
      `<tr><td>${m.label}</td><td style="text-align:right;color:#00B050">¥${m.income.toFixed(2)}</td><td style="text-align:right;color:#FF0000">¥${m.expense.toFixed(2)}</td><td style="text-align:right">¥${(m.income - m.expense).toFixed(2)}</td></tr>`
    ).join('')

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
      body { font-family: -apple-system, "PingFang SC", "Hiragino Sans GB", sans-serif; padding: 40px; color: #333; }
      h1 { text-align: center; font-size: 22px; margin-bottom: 30px; }
      h2 { font-size: 16px; border-bottom: 2px solid #4472C4; padding-bottom: 6px; margin-top: 30px; }
      table { width: 100%; border-collapse: collapse; margin: 12px 0; }
      th { background: #4472C4; color: white; padding: 8px 12px; text-align: left; }
      td { padding: 6px 12px; border-bottom: 1px solid #eee; }
      .summary-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; margin: 20px 0; }
      .summary-box { background: #f5f5f5; border-radius: 8px; padding: 16px; text-align: center; }
      .summary-box .label { font-size: 13px; color: #888; }
      .summary-box .value { font-size: 24px; font-weight: bold; margin-top: 4px; }
      .highlights { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 20px 0; }
      .highlight-box { background: #f0f5ff; border-radius: 8px; padding: 12px; text-align: center; }
      .highlight-box .hl-value { font-size: 20px; font-weight: bold; color: #4472C4; }
      .highlight-box .hl-label { font-size: 12px; color: #888; margin-top: 4px; }
      .income { color: #00B050; } .expense { color: #FF0000; }
    </style></head><body>
      <h1>${year}年 年度收支报告</h1>
      <div class="summary-grid">
        <div class="summary-box"><div class="label">年度总收入</div><div class="value income">¥${income.toFixed(2)}</div></div>
        <div class="summary-box"><div class="label">年度总支出</div><div class="value expense">¥${expense.toFixed(2)}</div></div>
        <div class="summary-box"><div class="label">年度结余</div><div class="value">¥${(income - expense).toFixed(2)}</div></div>
      </div>
      <div class="highlights">
        <div class="highlight-box"><div class="hl-value">${totalDays}</div><div class="hl-label">记账天数</div></div>
        <div class="highlight-box"><div class="hl-value">${totalCount}</div><div class="hl-label">记账笔数</div></div>
      </div>
      <h2>月度收支</h2>
      <table><tr><th>月份</th><th style="text-align:right">收入</th><th style="text-align:right">支出</th><th style="text-align:right">结余</th></tr>${monthlyRows}</table>
      ${expenseCats.length > 0 ? `<h2>支出分类</h2><table><tr><th>分类</th><th style="text-align:right">金额</th><th style="text-align:right">占比</th></tr>${catRows(expenseCats, totalExp)}</table>` : ''}
      ${incomeCats.length > 0 ? `<h2>收入分类</h2><table><tr><th>分类</th><th style="text-align:right">金额</th><th style="text-align:right">占比</th></tr>${catRows(incomeCats, totalInc)}</table>` : ''}
    </body></html>`

    const pdfWindow = new BrowserWindow({ show: false, width: 800, height: 600 })
    await pdfWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
    const pdfBuffer = await pdfWindow.webContents.printToPDF({ printBackground: true })
    pdfWindow.destroy()

    const { writeFileSync } = require('fs')
    writeFileSync(saveResult.filePath, pdfBuffer)
    return { success: true, path: saveResult.filePath }
  })

  // --- Import ---
  ipcMain.handle('import:select-file', async () => {
    const result = await dialog.showOpenDialog({
      title: '选择账单文件',
      filters: [
        { name: '账单文件', extensions: ['csv', 'xlsx', 'xls'] }
      ],
      properties: ['openFile']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle('import:parse', (_event, filePath: string) => {
    const categories = queryAll('SELECT * FROM categories')
    const ext = filePath.toLowerCase().split('.').pop()

    let result: ImportParseResult
    if (ext === 'csv') {
      const buffer = readFileSync(filePath)
      const isWechatCSV = buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF
        ? buffer.toString('utf8').includes('微信')
        : false
      if (isWechatCSV) {
        result = parseWechatCSV(filePath, categories)
      } else {
        result = parseAlipayCSV(filePath, categories)
      }
    } else if (ext === 'xlsx' || ext === 'xls') {
      result = parseWechatXLSX(filePath, categories)
    } else {
      throw new Error('不支持的文件格式，请选择 .csv 或 .xlsx 文件')
    }

    // Check duplicates
    for (const item of result.items) {
      const existing = queryOne(
        `SELECT t.id, t.note, c.name as category_name
         FROM transactions t LEFT JOIN categories c ON t.category_id = c.id
         WHERE t.date = ? AND t.amount = ? AND t.type = ? AND t.note = ?`,
        [item.date, item.amount, item.type, item.note]
      ) as { id: number; note: string; category_name: string } | undefined
      if (existing) {
        item.duplicate = true
        item.duplicateNote = `已有记录：[${existing.category_name || '未分类'}] ${existing.note || ''}`
      }
    }

    return result
  })

  ipcMain.handle('transactions:batch-create', (_event, items: {
    type: string; amount: number; category_id: number; date: string; note: string; currency?: string
  }[]) => {
    const db = getDatabase()
    const now = new Date().toISOString()
    const stmt = db.prepare(
      'INSERT INTO transactions (type, amount, currency, category_id, date, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    )
    let count = 0
    for (const item of items) {
      stmt.run([item.type, item.amount, item.currency || 'CNY', item.category_id, item.date, item.note, now, now])
      count++
    }
    stmt.free()
    saveDatabase()
    return count
  })

  ipcMain.handle('import:save-history', (_event, record: {
    source: string; count: number; dateFrom: string; dateTo: string
  }) => {
    runSql(
      'INSERT INTO import_history (source, count, date_from, date_to, created_at) VALUES (?, ?, ?, ?, ?)',
      [record.source, record.count, record.dateFrom, record.dateTo, new Date().toISOString()]
    )
  })

  ipcMain.handle('import:list-history', () => {
    return queryAll('SELECT * FROM import_history ORDER BY created_at DESC LIMIT 50')
  })

  ipcMain.handle('mappings:list', () => {
    return queryAll(
      `SELECT m.id, m.keyword, m.category_id, c.name as category_name, c.type as category_type
       FROM category_mappings m
       LEFT JOIN categories c ON m.category_id = c.id
       ORDER BY m.id DESC`
    )
  })

  ipcMain.handle('mappings:create', (_event, data: { keyword: string; category_id: number }) => {
    runSql(
      'INSERT INTO category_mappings (keyword, category_id, created_at) VALUES (?, ?, ?)',
      [data.keyword, data.category_id, new Date().toISOString()]
    )
  })

  ipcMain.handle('mappings:delete', (_event, id: number) => {
    runSql('DELETE FROM category_mappings WHERE id = ?', [id])
  })

  ipcMain.handle('backup:export', async () => {
    saveDatabase()
    const result = await dialog.showSaveDialog({
      title: '备份数据',
      defaultPath: `记账备份_${new Date().toISOString().substring(0, 10)}.db`,
      filters: [{ name: '数据库文件', extensions: ['db'] }]
    })
    if (result.canceled || !result.filePath) return { success: false }
    const { copyFileSync } = require('fs')
    copyFileSync(getDbPath(), result.filePath)
    return { success: true, path: result.filePath }
  })

  ipcMain.handle('backup:import', async () => {
    const result = await dialog.showOpenDialog({
      title: '恢复数据',
      filters: [{ name: '数据库文件', extensions: ['db'] }],
      properties: ['openFile']
    })
    if (result.canceled || result.filePaths.length === 0) return { success: false }
    const filePath = result.filePaths[0]
    const { copyFileSync } = require('fs')
    try {
      const initSqlJs = require('sql.js')
      const SQL = await initSqlJs()
      const buffer = readFileSync(filePath)
      const testDb = new SQL.Database(buffer)
      testDb.exec('SELECT COUNT(*) FROM transactions')
      testDb.close()
    } catch (_) {
      return { success: false, message: '文件格式无效，请选择正确的备份文件' }
    }
    copyFileSync(filePath, getDbPath())
    const userId = getCurrentUserId()
    if (userId) await switchUser(userId)
    return { success: true }
  })
}

// --- Import helpers ---

// 2026 Chinese holiday calendar
const HOLIDAYS_2026 = new Set([
  '2026-01-01',
  '2026-01-28', '2026-01-29', '2026-01-30', '2026-01-31',
  '2026-02-01', '2026-02-02', '2026-02-03', '2026-02-04',
  '2026-04-04', '2026-04-05', '2026-04-06',
  '2026-05-01', '2026-05-02', '2026-05-03', '2026-05-04', '2026-05-05',
  '2026-05-31', '2026-06-01', '2026-06-02',
  '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04',
  '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08'
])

const WORKDAYS_2026 = new Set([
  '2026-01-26', '2026-02-08',
  '2026-04-27', '2026-05-10',
  '2026-09-28', '2026-10-11'
])

function isHolidayOrWeekend(dateStr: string): boolean {
  if (HOLIDAYS_2026.has(dateStr)) return true
  if (WORKDAYS_2026.has(dateStr)) return false
  const day = new Date(dateStr).getDay()
  return day === 0 || day === 6
}

function getSubsidyCap(dateStr: string, hour: number, minute: number): number {
  const isHoliday = isHolidayOrWeekend(dateStr)
  const timeInMinutes = hour * 60 + minute

  if (timeInMinutes >= 12 * 60 && timeInMinutes < 13 * 60 + 30) {
    return isHoliday ? 20 : 0
  }
  if (timeInMinutes >= 18 * 60 && timeInMinutes < 21 * 60) {
    return 20
  }
  if (timeInMinutes >= 21 * 60) {
    return 10
  }
  return 0
}

interface ImportPreviewItem {
  date: string
  type: 'income' | 'expense'
  amount: number
  currency: string
  categoryMatch: string
  category_id: number | undefined
  note: string
  source: 'alipay' | 'wechat'
  original: string
  selected: boolean
  duplicate: boolean
}

interface ImportParseResult {
  source: 'alipay' | 'wechat'
  items: ImportPreviewItem[]
  skipped: number
  dateRange: [string, string]
}

function matchCategory(
  label: string,
  type: 'income' | 'expense',
  categories: Record<string, unknown>[],
  merchant?: string,
  note?: string
): { name: string; id: number | undefined } {
  // Check custom mappings first
  const mappings = queryAll(
    'SELECT m.keyword, m.category_id, c.name as category_name, c.type as category_type FROM category_mappings m LEFT JOIN categories c ON m.category_id = c.id'
  )
  const searchText = [label, merchant, note].filter(Boolean).join(' ')
  for (const m of mappings) {
    if (searchText.includes(m.keyword as string) && m.category_type === type) {
      return { name: m.category_name as string, id: m.category_id as number }
    }
  }

  const categoryMap: Record<string, string> = {
    '餐饮美食': '餐饮',
    '交通出行': '交通',
    '酒店旅游': '娱乐',
    '文化休闲': '购物',
    '转账红包': '红包'
  }

  let targetName = categoryMap[label] || '其他'

  if (label === '商户消费' && merchant) {
    if (merchant.includes('美团')) targetName = '餐饮'
    else if (merchant.includes('货拉拉') || merchant.includes('滴滴') || merchant.includes('打车'))
      targetName = '交通'
    else targetName = '其他'
  }

  const match = categories.find(
    (c) => c.name === targetName && c.type === type
  ) as { id: number; name: string } | undefined

  if (match) return { name: match.name, id: match.id }

  const fallback = categories.find(
    (c) => c.name === '其他' && c.type === type
  ) as { id: number; name: string } | undefined
  return { name: targetName, id: fallback?.id }
}

function parseAlipayCSV(filePath: string, categories: Record<string, unknown>[]): ImportParseResult {
  const buffer = readFileSync(filePath)
  const content = iconv.decode(buffer, 'gbk')
  const lines = content.split(/\r?\n/)

  let headerIndex = -1
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('交易时间,')) {
      headerIndex = i
      break
    }
  }
  if (headerIndex === -1) throw new Error('无法识别支付宝账单格式')

  const items: ImportPreviewItem[] = []
  let skipped = 0
  const dates: string[] = []

  for (let i = headerIndex + 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line || line.startsWith('-')) continue

    const cols = line.split(',').map((s) => s.trim())
    if (cols.length < 11) continue

    const [timeStr, category, counterpart, , description, direction, amountStr, payMethod, status] = cols

    if (status !== '交易成功' && status !== '转入成功') {
      skipped++
      continue
    }

    const amount = parseFloat(amountStr)
    if (isNaN(amount) || amount <= 0) { skipped++; continue }

    const dateStr = timeStr.substring(0, 10)
    const timeShortAlipay = timeStr.substring(11, 16)
    const hour = parseInt(timeStr.substring(11, 13))
    const minute = parseInt(timeStr.substring(14, 16))

    if (direction === '支出') {
      const matched = matchCategory(category, 'expense', categories, counterpart)
      dates.push(dateStr)
      items.push({
        date: dateStr,
        type: 'expense',
        amount,
        categoryMatch: matched.name,
        category_id: matched.id,
        note: `${timeShortAlipay} ${counterpart} ${description}`.substring(0, 100),
        source: 'alipay',
        original: `${timeStr} ${counterpart} ¥${amount}`,
        currency: 'CNY',
        selected: true,
        duplicate: false
      })
    } else if (direction === '收入') {
      const matched = matchCategory(category, 'income', categories, counterpart)
      dates.push(dateStr)
      items.push({
        date: dateStr,
        type: 'income',
        amount,
        categoryMatch: matched.name,
        category_id: matched.id,
        note: `${timeShortAlipay} ${counterpart} ${description}`.substring(0, 100),
        source: 'alipay',
        original: `${timeStr} ${counterpart} ¥${amount}`,
        currency: 'CNY',
        selected: true,
        duplicate: false
      })
    } else if (direction === '不计收支') {
      if (!payMethod.includes('因公付')) {
        skipped++
        continue
      }
      // 因公付 logic
      const onlyCompanyPaid = payMethod === '因公付(阿里集团已付款)'
      if (onlyCompanyPaid) {
        skipped++
        continue
      }
      // Co-payment: has personal bank card + 因公付
      const subsidyCap = getSubsidyCap(dateStr, hour, minute)
      const personalExpense = amount - subsidyCap
      if (personalExpense <= 0) {
        skipped++
        continue
      }
      const matched = matchCategory('餐饮美食', 'expense', categories)
      dates.push(dateStr)
      items.push({
        date: dateStr,
        type: 'expense',
        amount: Math.round(personalExpense * 100) / 100,
        categoryMatch: matched.name,
        category_id: matched.id,
        note: `${timeShortAlipay} ${counterpart} ${description} (因公付补贴${subsidyCap}元)`.substring(0, 100),
        source: 'alipay',
        original: `${timeStr} ${counterpart} 总¥${amount} 个人¥${personalExpense.toFixed(2)}`,
        currency: 'CNY',
        selected: true,
        duplicate: false
      })
    } else {
      skipped++
    }
  }

  dates.sort()
  return {
    source: 'alipay',
    items,
    skipped,
    dateRange: [dates[0] || '', dates[dates.length - 1] || '']
  }
}

function parseWechatXLSX(filePath: string, categories: Record<string, unknown>[]): ImportParseResult {
  const fileBuffer = readFileSync(filePath)
  const workbook = XLSX.read(fileBuffer, { type: 'buffer' })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false, defval: '' })

  let headerIndex = -1
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    if (row && row.some(cell => cell && cell.toString().includes('交易时间'))) {
      headerIndex = i
      break
    }
  }
  if (headerIndex === -1) throw new Error('无法识别微信账单格式')

  const headerRow = rows[headerIndex].map(h => (h || '').toString().trim())
  const col = (name: string): number => headerRow.findIndex(h => h.includes(name))
  const iTime = col('交易时间')
  const iTxType = col('交易类型')
  const iCounterpart = col('交易对方')
  const iProduct = col('商品')
  const iDirection = col('收/支')
  const iAmount = col('金额')
  const iStatus = col('当前状态')

  if (iTime === -1 || iDirection === -1 || iAmount === -1) {
    throw new Error(`无法识别微信账单列：缺少必要列（交易时间/收支/金额）。检测到的表头：${headerRow.join(', ')}`)
  }

  const items: ImportPreviewItem[] = []
  let skipped = 0
  const dates: string[] = []

  for (let i = headerIndex + 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row || row.length < 5) continue

    const timeStr = (row[iTime] || '').toString().trim()
    const txType = iTxType >= 0 ? (row[iTxType] || '').toString().trim() : ''
    const counterpart = iCounterpart >= 0 ? (row[iCounterpart] || '').toString().trim() : ''
    const product = iProduct >= 0 ? (row[iProduct] || '').toString().trim() : ''
    const direction = (row[iDirection] || '').toString().trim()
    const amountRaw = (row[iAmount] || '').toString().trim()
    const status = iStatus >= 0 ? (row[iStatus] || '').toString().trim() : ''

    if (!timeStr || !direction) continue
    if (status.includes('已全额退款')) { skipped++; continue }
    if (direction === '/' || direction === '／') { skipped++; continue }

    const amountStr = amountRaw.replace(/[¥￥,，\s]/g, '')
    const amount = parseFloat(amountStr)
    if (isNaN(amount) || amount <= 0) { skipped++; continue }

    const dateStr = timeStr.substring(0, 10)
    const timeShort = timeStr.length >= 16 ? timeStr.substring(11, 16) : ''
    dates.push(dateStr)

    if (direction === '支出') {
      let categoryLabel = '商户消费'
      if (txType.includes('转账')) categoryLabel = '转账红包'
      const matched = matchCategory(categoryLabel, 'expense', categories, counterpart)
      items.push({
        date: dateStr,
        type: 'expense',
        amount,
        categoryMatch: matched.name,
        category_id: matched.id,
        note: `${timeShort} ${counterpart} ${product}`.trim().substring(0, 100),
        source: 'wechat',
        original: `${timeStr} ${counterpart} ¥${amount}`,
        currency: 'CNY',
        selected: true,
        duplicate: false
      })
    } else if (direction === '收入') {
      const matched = matchCategory('转账红包', 'income', categories)
      items.push({
        date: dateStr,
        type: 'income',
        amount,
        categoryMatch: matched.name,
        category_id: matched.id,
        note: `${timeShort} ${counterpart} ${product}`.trim().substring(0, 100),
        source: 'wechat',
        original: `${timeStr} ${counterpart} ¥${amount}`,
        currency: 'CNY',
        selected: true,
        duplicate: false
      })
    } else {
      skipped++
    }
  }

  dates.sort()
  return {
    source: 'wechat',
    items,
    skipped,
    dateRange: [dates[0] || '', dates[dates.length - 1] || '']
  }
}

function parseWechatCSV(filePath: string, categories: Record<string, unknown>[]): ImportParseResult {
  const buffer = readFileSync(filePath)
  const content = buffer.toString('utf8').replace(/^﻿/, '')
  const lines = content.split(/\r?\n/)

  let headerIndex = -1
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('交易时间') && lines[i].includes('收/支')) {
      headerIndex = i
      break
    }
  }
  if (headerIndex === -1) throw new Error('无法识别微信账单格式')

  const headerCols = lines[headerIndex].split(',').map(h => h.trim())
  const col = (name: string): number => headerCols.findIndex(h => h.includes(name))
  const iTime = col('交易时间')
  const iTxType = col('交易类型')
  const iCounterpart = col('交易对方')
  const iProduct = col('商品')
  const iDirection = col('收/支')
  const iAmount = col('金额')
  const iStatus = col('当前状态')

  if (iTime === -1 || iDirection === -1 || iAmount === -1) {
    throw new Error(`无法识别微信账单列：${headerCols.join(', ')}`)
  }

  const items: ImportPreviewItem[] = []
  let skipped = 0
  const dates: string[] = []

  for (let i = headerIndex + 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line || line.startsWith('-')) continue

    const cols = line.split(',').map(s => s.trim())
    if (cols.length < 5) continue

    const timeStr = cols[iTime] || ''
    const txType = iTxType >= 0 ? (cols[iTxType] || '') : ''
    const counterpart = iCounterpart >= 0 ? (cols[iCounterpart] || '') : ''
    const product = iProduct >= 0 ? (cols[iProduct] || '') : ''
    const direction = (cols[iDirection] || '').trim()
    const amountRaw = (cols[iAmount] || '').trim()
    const status = iStatus >= 0 ? (cols[iStatus] || '') : ''

    if (!timeStr || !direction) continue
    if (status.includes('已全额退款')) { skipped++; continue }
    if (direction === '/' || direction === '／') { skipped++; continue }

    const amountStr = amountRaw.replace(/[¥￥,，\s]/g, '')
    const amount = parseFloat(amountStr)
    if (isNaN(amount) || amount <= 0) { skipped++; continue }

    const dateStr = timeStr.substring(0, 10)
    const timeShort = timeStr.length >= 16 ? timeStr.substring(11, 16) : ''
    dates.push(dateStr)

    if (direction === '支出') {
      let categoryLabel = '商户消费'
      if (txType.includes('转账')) categoryLabel = '转账红包'
      const matched = matchCategory(categoryLabel, 'expense', categories, counterpart)
      items.push({
        date: dateStr,
        type: 'expense',
        amount,
        categoryMatch: matched.name,
        category_id: matched.id,
        note: `${timeShort} ${counterpart} ${product}`.trim().substring(0, 100),
        source: 'wechat',
        original: `${timeStr} ${counterpart} ¥${amount}`,
        currency: 'CNY',
        selected: true,
        duplicate: false
      })
    } else if (direction === '收入') {
      const matched = matchCategory('转账红包', 'income', categories)
      items.push({
        date: dateStr,
        type: 'income',
        amount,
        categoryMatch: matched.name,
        category_id: matched.id,
        note: `${timeShort} ${counterpart} ${product}`.trim().substring(0, 100),
        source: 'wechat',
        original: `${timeStr} ${counterpart} ¥${amount}`,
        currency: 'CNY',
        selected: true,
        duplicate: false
      })
    } else {
      skipped++
    }
  }

  dates.sort()
  return {
    source: 'wechat',
    items,
    skipped,
    dateRange: [dates[0] || '', dates[dates.length - 1] || '']
  }
}
