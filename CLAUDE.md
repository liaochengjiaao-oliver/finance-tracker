# 个人记账软件

基于 Electron 的纯本地个人记账桌面应用（macOS）。

## 技术栈

- **框架**: Electron 35 + electron-vite
- **前端**: React 19 + TypeScript + Ant Design 5 + Recharts
- **数据库**: sql.js（基于 WASM 的 SQLite，非原生模块）
- **状态管理**: Zustand
- **构建**: Vite
- **账单解析**: xlsx（微信 XLSX/CSV）、iconv-lite（支付宝 GBK CSV）
- **导出**: exceljs（Excel 生成）、Electron printToPDF（PDF 生成）

## 常用命令

```bash
npm run dev       # 开发模式，启动带热更新的 Electron 应用
npm run build     # 仅构建前端和主进程产物到 out/
npm run pack      # 构建 + 打包为 .app（输出到 release/）
npm run deploy    # 一键部署：构建 → 打包 → 清除旧应用 → 安装到 /Applications → 签名
```

日常开发流程：修改代码后运行 `npm run deploy`，然后双击桌面快捷方式即可打开最新版本。

## 项目结构

```
src/
├── main/               # Electron 主进程
│   ├── index.ts         # 窗口管理、IPC 处理、托盘、全局快捷键、账单导入解析、数据导出
│   └── database.ts      # sql.js 数据库初始化、表结构、预设分类、迁移、多用户管理
├── preload/
│   ├── index.ts         # contextBridge 暴露 API 到渲染进程
│   └── index.d.ts       # 所有 IPC API 及数据模型的 TypeScript 类型定义
└── renderer/
    └── src/
        ├── main.tsx      # React 入口
        ├── App.tsx       # 根组件：路由 + 主题切换 + 页面状态保持
        ├── store/index.ts  # Zustand store
        ├── styles/global.css  # 全局样式 + 明暗主题
        └── pages/
            ├── Dashboard.tsx        # 概览页
            ├── AddTransaction.tsx   # 记账页
            ├── ImportTransaction.tsx # 账单导入 + 分类映射规则管理
            ├── TransactionList.tsx   # 账单列表：筛选、编辑、批量删除、导出
            ├── Statistics.tsx        # 统计报表：饼图、柱状图、折线图、分类趋势、报告导出
            ├── CategoryManager.tsx   # 分类管理 + 数据备份恢复
            ├── AnnualReport.tsx      # 年度账单 + PDF 导出
            ├── UserSelect.tsx        # 用户选择/创建/删除
            └── MiniAdd.tsx           # 迷你快捷记账窗口
```

## 架构要点

### IPC 通信

渲染进程通过 `window.api.xxx()` → preload `ipcRenderer.invoke()` → 主进程 `ipcMain.handle()` 完成所有数据操作。

Channel 命名规则：`模块:操作`，如 `transactions:create`、`stats:monthly`、`export:excel`。

### 数据库（sql.js）

- 每次写操作后调用 `saveDatabase()` 导出到磁盘
- `queryAll()`、`queryOne()`、`runSql()` 三个辅助函数封装调用
- 新字段通过 `ALTER TABLE ... ADD COLUMN` + try-catch 做迁移

**表结构**：
- **categories** — `id`, `name`, `type`, `sort_order`, `is_default`, `created_at`
- **transactions** — `id`, `type`, `amount`, `currency`, `category_id`(FK), `date`, `note`, `created_at`, `updated_at`
- **category_mappings** — `id`, `keyword`, `category_id`(FK), `created_at`（自定义导入分类映射）
- **import_history** — `id`, `source`, `count`, `date_from`, `date_to`, `created_at`

### 多用户

- 每用户独立数据库，数据隔离：`~/Documents/记账数据/users/<uuid>/finance.db`
- `config.json` 管理用户列表和上次登录 ID
- 启动时自动登录上次用户，无用户时显示选择页

### 账单导入

**支付宝 CSV**：GBK 编码，iconv-lite 解码，跳过不计收支，因公付按补贴规则计算差额

**微信 XLSX/CSV**：动态列检测解析，跳过零钱通/充值/提现/退款

**分类映射**：先查自定义 `category_mappings` 表（关键词匹配），未命中再走硬编码映射

**防重复**：用 date + amount + type + note 查重，标记"可能重复"，显示已有记录详情

### 数据导出

- **CSV**：渲染进程 Blob 下载
- **Excel**：主进程 exceljs 生成，带格式（表头样式、金额颜色、汇总行）
- **月度 Excel 报告**：多 Sheet（收支概览、分类汇总、每日明细、交易记录）
- **PDF 报告**：Electron `BrowserWindow.printToPDF()` + HTML 模板，天然支持中文

### 页面状态保持

所有页面保持挂载（`display: none` 切换），导航不丢失表单/导入状态。切回页面时自动刷新数据。

## 开发注意事项

- sql.js 必须用 `require('sql.js')` 加载，不能用 ES import
- xlsx 在 asar 内必须用 `readFileSync` + `XLSX.read(buffer)` 而非 `XLSX.readFile()`
- Ant Design `"use client"` 警告是正常的，不影响功能
- 桌面快捷方式：`~/Desktop/个人记账.app` → `/Applications/个人记账.app`（符号链接）

## 代码变更后的必做事项

每次修改代码后，必须按顺序完成以下步骤：

1. **构建部署**：运行 `npm run deploy`，确认输出 `✅ 已安装到 /Applications/个人记账.app`
2. **同步文档**：根据本次改动的性质，更新对应文档：
   - `CLAUDE.md` — 架构、表结构、技术要点发生变化时更新
   - `SPEC.md` — 新增/删除/修改了功能模块时更新
   - `使用说明.md` — 用户可感知的功能、操作流程发生变化时更新
3. **功能清单**：如果新增或移除了功能，更新下方的「完整功能清单」

文档更新原则：只改动涉及的部分，不重写未变化的内容。

## 完整功能清单

- [x] 收支录入（含连续记账、多币种 CNY/USD）
- [x] 快捷键迷你记账窗口（Cmd+Shift+N）
- [x] 预设分类 + 自定义增删改
- [x] 账单导入（支付宝 CSV + 微信 XLSX/CSV）
- [x] 自定义分类映射规则（关键词→分类）
- [x] 因公付智能处理
- [x] 防重复导入检测（含时间差判断）
- [x] 导入历史记录
- [x] 账单列表（分页、编辑、批量选择/删除、跨页全选）
- [x] 多维度筛选（日期、类型、分类、金额、关键词）
- [x] 概览仪表盘（月度收支、环比、近期记录）
- [x] 统计图表（饼图、柱状图、折线图，按日/周/月/年）
- [x] 分类趋势对比（选定分类的跨月变化）
- [x] 年度账单（收支汇总、月度趋势、分类排行、统计亮点）
- [x] 数据导出（CSV + Excel + 月度 Excel 报告 + 月度/年度 PDF 报告）
- [x] 数据备份与恢复
- [x] 多用户支持（独立数据库、自动迁移）
- [x] 系统托盘 + 明暗主题（跟随系统）
