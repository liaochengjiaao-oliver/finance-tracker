import { app } from 'electron'
import { join } from 'path'
import { mkdirSync, readFileSync, writeFileSync, existsSync, renameSync, rmSync } from 'fs'
import { randomUUID } from 'crypto'

let db: any
let dbPath: string
let currentUserId: string | null = null

export interface UserProfile {
  id: string
  name: string
  createdAt: string
}

interface UserConfig {
  users: UserProfile[]
  lastUserId: string | null
}

function getBaseDir(): string {
  return join(app.getPath('documents'), '记账数据')
}

function getConfigPath(): string {
  return join(getBaseDir(), 'config.json')
}

function getUserDbPath(userId: string): string {
  return join(getBaseDir(), 'users', userId, 'finance.db')
}

function readConfig(): UserConfig {
  const configPath = getConfigPath()
  if (existsSync(configPath)) {
    return JSON.parse(readFileSync(configPath, 'utf-8'))
  }
  return { users: [], lastUserId: null }
}

function writeConfig(config: UserConfig): void {
  const configPath = getConfigPath()
  mkdirSync(getBaseDir(), { recursive: true })
  writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')
}

export function initUserConfig(): UserConfig {
  const baseDir = getBaseDir()
  mkdirSync(baseDir, { recursive: true })

  const configPath = getConfigPath()
  const oldDbPath = join(baseDir, 'finance.db')

  if (existsSync(configPath)) {
    return readConfig()
  }

  // Migration: existing finance.db → create default user
  if (existsSync(oldDbPath)) {
    const userId = randomUUID()
    const userDir = join(baseDir, 'users', userId)
    mkdirSync(userDir, { recursive: true })
    renameSync(oldDbPath, join(userDir, 'finance.db'))

    const config: UserConfig = {
      users: [{ id: userId, name: '默认用户', createdAt: new Date().toISOString() }],
      lastUserId: userId
    }
    writeConfig(config)
    return config
  }

  // Fresh install
  const config: UserConfig = { users: [], lastUserId: null }
  writeConfig(config)
  return config
}

export async function initDatabase(userId: string): Promise<void> {
  const userDbDir = join(getBaseDir(), 'users', userId)
  mkdirSync(userDbDir, { recursive: true })
  dbPath = getUserDbPath(userId)
  currentUserId = userId

  const initSqlJs = require('sql.js')
  const SQL = await initSqlJs()

  if (existsSync(dbPath)) {
    const buffer = readFileSync(dbPath)
    db = new SQL.Database(buffer)
  } else {
    db = new SQL.Database()
  }

  db.run('PRAGMA foreign_keys = ON')
  createTables()
  seedDefaultCategories()
  saveDatabase()

  // Update lastUserId
  const config = readConfig()
  config.lastUserId = userId
  writeConfig(config)
}

export async function switchUser(userId: string): Promise<void> {
  if (db) {
    try { db.close() } catch (_) { /* ignore */ }
    db = null
  }
  await initDatabase(userId)
}

export function getDatabase(): any {
  return db
}

export function saveDatabase(): void {
  if (!db || !dbPath) return
  const data = db.export()
  writeFileSync(dbPath, Buffer.from(data))
}

export function getDbPath(): string {
  return dbPath
}

export function getCurrentUserId(): string | null {
  return currentUserId
}

export function listUsers(): UserProfile[] {
  return readConfig().users
}

export function createUser(name: string): UserProfile {
  const config = readConfig()
  const user: UserProfile = {
    id: randomUUID(),
    name,
    createdAt: new Date().toISOString()
  }
  config.users.push(user)
  writeConfig(config)
  return user
}

export function deleteUser(userId: string): { success: boolean; message?: string } {
  const config = readConfig()
  if (config.users.length <= 1) {
    return { success: false, message: '至少保留一个用户' }
  }
  if (userId === currentUserId) {
    return { success: false, message: '不能删除当前登录的用户' }
  }

  config.users = config.users.filter((u) => u.id !== userId)
  if (config.lastUserId === userId) {
    config.lastUserId = config.users[0]?.id || null
  }
  writeConfig(config)

  // Remove user data directory
  const userDir = join(getBaseDir(), 'users', userId)
  if (existsSync(userDir)) {
    rmSync(userDir, { recursive: true, force: true })
  }

  return { success: true }
}

export function updateUser(userId: string, data: { name?: string }): void {
  const config = readConfig()
  const user = config.users.find((u) => u.id === userId)
  if (!user) return
  if (data.name !== undefined) user.name = data.name
  writeConfig(config)
}

export function getCurrentUser(): UserProfile | null {
  if (!currentUserId) return null
  const config = readConfig()
  return config.users.find((u) => u.id === currentUserId) || null
}

function createTables(): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('income', 'expense')),
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    )
  `)
  db.run(`
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL CHECK(type IN ('income', 'expense')),
      amount REAL NOT NULL CHECK(amount > 0),
      currency TEXT NOT NULL DEFAULT 'CNY',
      category_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      note TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (category_id) REFERENCES categories(id)
    )
  `)
  // Migration: add currency column to existing databases
  try {
    db.run("ALTER TABLE transactions ADD COLUMN currency TEXT NOT NULL DEFAULT 'CNY'")
  } catch (_) {
    // Column already exists
  }
  db.run('CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date)')
  db.run('CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type)')
  db.run('CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category_id)')
  db.run(`
    CREATE TABLE IF NOT EXISTS category_mappings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      keyword TEXT NOT NULL,
      category_id INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (category_id) REFERENCES categories(id)
    )
  `)
  db.run(`
    CREATE TABLE IF NOT EXISTS import_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,
      count INTEGER NOT NULL,
      date_from TEXT NOT NULL,
      date_to TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `)
}

function seedDefaultCategories(): void {
  const result = db.exec('SELECT COUNT(*) as count FROM categories')
  const count = result[0]?.values[0]?.[0] as number
  if (count > 0) return

  const now = new Date().toISOString()
  const expenseCategories = ['餐饮', '交通', '购物', '娱乐', '居住', '通讯', '医疗', '教育', '人情', '其他']
  const incomeCategories = ['工资', '奖金', '投资收益', '兼职', '红包', '其他']

  const stmt = db.prepare(
    'INSERT INTO categories (name, type, sort_order, is_default, created_at) VALUES (?, ?, ?, 1, ?)'
  )

  expenseCategories.forEach((name, i) => { stmt.run([name, 'expense', i, now]) })
  incomeCategories.forEach((name, i) => { stmt.run([name, 'income', i, now]) })
  stmt.free()
}
