# 个人记账软件 - 产品规格说明书

## 1. 产品概述

一款面向个人用户的桌面记账应用，用于记录日常收支、管理分类、查看统计报表。支持从微信/支付宝账单批量导入，支持多用户、数据备份、多格式导出。数据纯本地存储，注重隐私和使用效率。

## 2. 技术栈

| 层级 | 技术选型 | 说明 |
|------|---------|------|
| 框架 | Electron 35+ | 桌面应用容器 |
| 前端 | React 19 + TypeScript | UI 开发 |
| 构建 | Vite (electron-vite) | 快速构建与热更新 |
| UI 组件 | Ant Design 5 | 表格/表单/日期选择器 |
| 图表 | Recharts | 饼图/折线图/柱状图 |
| 数据库 | sql.js | 基于 WASM 的 SQLite，纯 JS 实现 |
| 状态管理 | Zustand | 轻量级状态管理 |
| 账单解析 | xlsx + iconv-lite | 微信 XLSX/CSV + 支付宝 GBK CSV |
| Excel 导出 | exceljs | 带样式的 xlsx 生成 |
| PDF 导出 | Electron printToPDF | HTML 模板转 PDF，天然支持中文 |

## 3. 功能模块

### 3.1 记账录入

- **必填字段**：金额、类型（收入/支出）、分类、日期
- **可选字段**：备注、币种（默认 CNY，可选 USD）
- **交互**：
  - 日期默认当天，金额支持小数点后两位
  - 提交后停留在录入状态，方便连续记账
  - 页面切换后表单内容保留

### 3.2 快捷记账

- 全局快捷键 `Cmd+Shift+N` 唤出迷你窗口
- 仅核心字段：金额、类型、分类、备注
- 提交后自动关闭

### 3.3 账单导入

**支持格式**：
- 支付宝 CSV（GBK 编码）
- 微信 XLSX / CSV（UTF-8）

**解析规则**：
- 动态列检测，自适应不同版本的账单格式
- 过滤转账/充值/提现/理财/退款等非收支交易
- 分类自动匹配：先查自定义映射规则（`category_mappings` 表），未命中再走内置映射
- 防重复检测：date + amount + type + note 查重，付款时间差超过 15 分钟视为不同记录
- 可能重复的记录排在最前面，悬停标签可查看已有记录详情

**因公付特殊处理**（阿里实习场景）：
- 全额公司付 → 跳过
- 部分公司付 → 按补贴规则计算个人差额

**自定义分类映射**：
- 用户可添加关键词→分类映射规则（如「星巴克」→「餐饮」）
- 导入时优先匹配自定义规则，减少归「其他」的情况

**导入历史**：
- 记录每次导入的时间、来源、条数、日期范围

### 3.4 收支分类管理

**预设分类**：
- 支出：餐饮、交通、购物、娱乐、居住、通讯、医疗、教育、人情、其他
- 收入：工资、奖金、投资收益、兼职、红包、其他

**操作**：新增、编辑名称、删除（有记录的分类不可删除）

### 3.5 账单列表

- 按时间倒序展示，显示日期、类型、分类、金额（含币种符号）、备注
- 支持编辑和删除
- 批量选择：勾选多条记录，支持跨页全选，可批量删除
- 列表顶部显示当前筛选条件下的收支汇总

### 3.6 搜索与筛选

- 日期范围：快捷选项（今天/本周/本月/本年）+ 自定义区间
- 类型：全部 / 仅收入 / 仅支出
- 分类：多选
- 金额范围：最小 ~ 最大
- 关键词：搜索备注内容

### 3.7 统计报表

**概览面板**：本月总收入、总支出、结余，与上月对比百分比

**分类统计**：饼图（占比）+ 柱状图（排名），可切换收入/支出

**趋势分析**：折线图按日/周/月/年展示收支趋势

**分类趋势**：选择单个分类查看近 6 个月或当年各月的金额变化

### 3.8 年度账单

- 年度总收入、总支出、结余，与上年对比
- 记账天数、笔数统计
- 支出最高月和最低月
- 月度收支趋势柱状图
- 分类占比和排名

### 3.9 数据导出

| 导出类型 | 入口 | 内容 |
|---------|------|------|
| CSV | 账单列表 | 当前筛选结果的交易明细 |
| Excel | 账单列表 | 带格式的交易明细（表头样式、金额颜色、汇总行） |
| 月度 Excel 报告 | 统计报表 | 多 Sheet：收支概览、分类汇总、每日明细、交易记录 |
| 月度 PDF 报告 | 统计报表 | 收支概览、分类占比表、每日收支表 |
| 年度 PDF 报告 | 年度账单 | 年度概览、月度收支表、分类汇总 |

### 3.10 数据备份与恢复

- 备份：导出当前用户的数据库文件到指定位置
- 恢复：从备份文件恢复，替换当前数据库后重新加载
- 入口在分类管理页底部

### 3.11 多用户

- 支持多用户切换，无密码认证
- 每用户独立数据库文件，数据完全隔离
- 启动时自动登录上次使用的用户
- 旧版单数据库自动迁移为「默认用户」

## 4. 数据模型

### transactions 表（收支记录）
```sql
CREATE TABLE transactions (
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
);
```

### categories 表（分类）
```sql
CREATE TABLE categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('income', 'expense')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
```

### category_mappings 表（自定义分类映射）
```sql
CREATE TABLE category_mappings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  keyword TEXT NOT NULL,
  category_id INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (category_id) REFERENCES categories(id)
);
```

### import_history 表（导入历史）
```sql
CREATE TABLE import_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,
  count INTEGER NOT NULL,
  date_from TEXT NOT NULL,
  date_to TEXT NOT NULL,
  created_at TEXT NOT NULL
);
```

## 5. 页面结构

```
┌──────────────────────────────────────────────┐
│  侧边栏            │       主内容区            │
│                    │                          │
│  概览              │   （根据左侧选择切换）      │
│  记账              │   所有页面保持挂载状态       │
│  导入              │   切换时不丢失表单内容       │
│  账单列表           │                          │
│  统计报表           │                          │
│  年度账单           │                          │
│  分类管理           │                          │
│                    │                          │
│  [当前用户] 切换     │                          │
└──────────────────────────────────────────────┘
```

## 6. 非功能需求

- **数据安全**：数据存储在 `~/Documents/记账数据/users/<uuid>/`，支持手动备份恢复
- **窗口**：主窗口默认 1200x800，最小 900x600
- **系统托盘**：关闭窗口时最小化到托盘
- **主题**：跟随系统明暗模式
- **多币种**：支持 CNY 和 USD，按原始币种存储和显示
- **页面状态**：所有页面保持挂载，切换不丢失状态
