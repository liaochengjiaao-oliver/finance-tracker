import { useState, useEffect } from 'react'
import { Button, Table, Tag, Select, message, Card, Space, Alert, Checkbox, Tooltip, Input, Collapse, Popconfirm } from 'antd'
import { UploadOutlined, ImportOutlined, HistoryOutlined, PlusOutlined, DeleteOutlined, SettingOutlined } from '@ant-design/icons'

export default function ImportTransaction(): JSX.Element {
  const [items, setItems] = useState<ImportPreviewItem[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [history, setHistory] = useState<ImportHistoryRecord[]>([])
  const [parseInfo, setParseInfo] = useState<{
    source: string; skipped: number; dateRange: [string, string]
  } | null>(null)
  const [mappings, setMappings] = useState<CategoryMapping[]>([])
  const [newKeyword, setNewKeyword] = useState('')
  const [newCategoryId, setNewCategoryId] = useState<number | null>(null)

  const loadHistory = (): void => {
    window.api.listImportHistory().then(setHistory)
  }

  const loadMappings = (): void => {
    window.api.listMappings().then(setMappings)
  }

  useEffect(() => {
    window.api.getCategories().then(setCategories)
    loadHistory()
    loadMappings()
  }, [])

  const handleSelectFile = async (): Promise<void> => {
    const filePath = await window.api.selectImportFile()
    if (!filePath) return

    setLoading(true)
    try {
      const result = await window.api.parseImportFile(filePath)
      const sorted = [...result.items].sort((a, b) => {
        if (a.duplicate !== b.duplicate) return a.duplicate ? -1 : 1
        return 0
      })
      setItems(sorted)
      setParseInfo({
        source: result.source === 'alipay' ? '支付宝' : '微信',
        skipped: result.skipped,
        dateRange: result.dateRange
      })
    } catch (err: unknown) {
      message.error(`解析失败: ${err instanceof Error ? err.message : '未知错误'}`)
    } finally {
      setLoading(false)
    }
  }

  const handleImport = async (): Promise<void> => {
    const selected = items.filter((item) => item.selected && item.category_id)
    if (selected.length === 0) {
      message.warning('没有选中的记录可导入')
      return
    }

    setImporting(true)
    try {
      const count = await window.api.batchCreateTransactions(
        selected.map((item) => ({
          type: item.type,
          amount: item.amount,
          currency: item.currency,
          category_id: item.category_id!,
          date: item.date,
          note: item.note
        }))
      )
      const dates = selected.map(i => i.date).sort()
      await window.api.saveImportHistory({
        source: parseInfo?.source || '未知',
        count,
        dateFrom: dates[0],
        dateTo: dates[dates.length - 1]
      })
      message.success(`成功导入 ${count} 条记录`)
      setItems([])
      setParseInfo(null)
      loadHistory()
    } catch (err: unknown) {
      message.error(`导入失败: ${err instanceof Error ? err.message : '未知错误'}`)
    } finally {
      setImporting(false)
    }
  }

  const toggleSelect = (index: number): void => {
    setItems((prev) => prev.map((item, i) =>
      i === index ? { ...item, selected: !item.selected } : item
    ))
  }

  const toggleSelectAll = (checked: boolean): void => {
    setItems((prev) => prev.map((item) => ({ ...item, selected: checked })))
  }

  const updateCategory = (index: number, categoryId: number): void => {
    const cat = categories.find((c) => c.id === categoryId)
    setItems((prev) => prev.map((item, i) =>
      i === index ? { ...item, category_id: categoryId, categoryMatch: cat?.name || '' } : item
    ))
  }

  const selectedCount = items.filter((i) => i.selected).length
  const allSelected = items.length > 0 && selectedCount === items.length

  const columns = [
    {
      title: (
        <Checkbox
          checked={allSelected}
          indeterminate={selectedCount > 0 && !allSelected}
          onChange={(e) => toggleSelectAll(e.target.checked)}
        />
      ),
      width: 40,
      render: (_: unknown, __: unknown, index: number) => (
        <Checkbox checked={items[index].selected} onChange={() => toggleSelect(index)} />
      )
    },
    { title: '日期', dataIndex: 'date', width: 110 },
    {
      title: '类型',
      dataIndex: 'type',
      width: 70,
      render: (t: string) => (
        <Tag color={t === 'income' ? 'green' : 'red'}>{t === 'income' ? '收入' : '支出'}</Tag>
      )
    },
    {
      title: '金额',
      dataIndex: 'amount',
      width: 100,
      render: (a: number, r: ImportPreviewItem) => {
        const symbol = r.currency === 'USD' ? '$' : '¥'
        return (
          <span style={{ color: r.type === 'income' ? '#52c41a' : '#ff4d4f', fontWeight: 500 }}>
            {symbol}{a.toFixed(2)}
          </span>
        )
      }
    },
    {
      title: '分类',
      dataIndex: 'categoryMatch',
      width: 140,
      render: (_: unknown, record: ImportPreviewItem, index: number) => (
        <Select
          size="small"
          value={record.category_id}
          style={{ width: 120 }}
          onChange={(v) => updateCategory(index, v)}
          options={categories
            .filter((c) => c.type === record.type)
            .map((c) => ({ label: c.name, value: c.id }))}
        />
      )
    },
    {
      title: '备注',
      dataIndex: 'note',
      ellipsis: true
    },
    {
      title: '来源',
      dataIndex: 'source',
      width: 70,
      render: (s: string) => (
        <Tag>{s === 'alipay' ? '支付宝' : '微信'}</Tag>
      )
    },
    {
      title: '状态',
      width: 120,
      render: (_: unknown, record: ImportPreviewItem) => (
        record.duplicate ? (
          <Tooltip title={record.duplicateNote}>
            <Tag color="warning" style={{ cursor: 'pointer' }}>可能重复</Tag>
          </Tooltip>
        ) : null
      )
    }
  ]

  return (
    <div>
      <div className="page-header">
        <h2>导入账单</h2>
      </div>

      <Card size="small" style={{ marginBottom: 16 }}>
        <Space>
          <Button
            type="primary"
            icon={<UploadOutlined />}
            onClick={handleSelectFile}
            loading={loading}
          >
            选择账单文件
          </Button>
          {items.length > 0 && (
            <Button
              type="primary"
              icon={<ImportOutlined />}
              onClick={handleImport}
              loading={importing}
              disabled={selectedCount === 0}
            >
              确认导入 ({selectedCount} 条)
            </Button>
          )}
        </Space>
      </Card>

      <Collapse
        size="small"
        style={{ marginBottom: 16 }}
        items={[{
          key: 'mappings',
          label: <><SettingOutlined /> 分类映射规则</>,
          children: (
            <div>
              <Space style={{ marginBottom: 12 }}>
                <Input
                  size="small"
                  placeholder="关键词（如：星巴克）"
                  value={newKeyword}
                  onChange={(e) => setNewKeyword(e.target.value)}
                  style={{ width: 160 }}
                />
                <Select
                  size="small"
                  placeholder="选择分类"
                  value={newCategoryId}
                  onChange={setNewCategoryId}
                  style={{ width: 140 }}
                  options={categories.map((c) => ({
                    label: `${c.name}（${c.type === 'expense' ? '支出' : '收入'}）`,
                    value: c.id
                  }))}
                />
                <Button
                  size="small"
                  type="primary"
                  icon={<PlusOutlined />}
                  disabled={!newKeyword.trim() || !newCategoryId}
                  onClick={async () => {
                    await window.api.createMapping({ keyword: newKeyword.trim(), category_id: newCategoryId! })
                    setNewKeyword('')
                    setNewCategoryId(null)
                    loadMappings()
                    message.success('规则已添加')
                  }}
                >
                  添加
                </Button>
              </Space>
              {mappings.length > 0 ? (
                <Table
                  dataSource={mappings}
                  rowKey="id"
                  size="small"
                  pagination={false}
                  columns={[
                    { title: '关键词', dataIndex: 'keyword', width: 180 },
                    {
                      title: '映射分类', key: 'category', width: 160,
                      render: (_: unknown, r: CategoryMapping) => (
                        <Tag color={r.category_type === 'expense' ? 'red' : 'green'}>{r.category_name}</Tag>
                      )
                    },
                    {
                      title: '操作', width: 80,
                      render: (_: unknown, r: CategoryMapping) => (
                        <Popconfirm title="删除此规则？" onConfirm={async () => {
                          await window.api.deleteMapping(r.id)
                          loadMappings()
                        }} okText="删除" cancelText="取消">
                          <Button type="link" size="small" danger icon={<DeleteOutlined />} />
                        </Popconfirm>
                      )
                    }
                  ]}
                />
              ) : (
                <div style={{ color: '#999', fontSize: 13 }}>
                  暂无自定义规则。添加关键词映射后，导入账单时会优先使用这些规则匹配分类。
                </div>
              )}
            </div>
          )
        }]}
      />

      {parseInfo && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message={
            `${parseInfo.source}账单 (${parseInfo.dateRange[0]} ~ ${parseInfo.dateRange[1]})` +
            ` | 待导入 ${items.length} 条，已自动过滤 ${parseInfo.skipped} 条（转账/不计收支/退款等）`
          }
        />
      )}

      {items.length > 0 && (
        <Table
          dataSource={items}
          columns={columns}
          rowKey={(_, index) => String(index)}
          size="small"
          pagination={{ pageSize: 50 }}
          rowClassName={(record) => record.duplicate ? 'row-duplicate' : ''}
        />
      )}

      {history.length > 0 && (
        <Card size="small" style={{ marginTop: 24 }} title={<><HistoryOutlined /> 导入记录</>}>
          <Table
            dataSource={history}
            rowKey="id"
            size="small"
            pagination={false}
            columns={[
              {
                title: '导入时间', dataIndex: 'created_at', width: 180,
                render: (t: string) => t.replace('T', ' ').substring(0, 19)
              },
              {
                title: '来源', dataIndex: 'source', width: 80,
                render: (s: string) => <Tag>{s}</Tag>
              },
              { title: '条数', dataIndex: 'count', width: 80 },
              {
                title: '账单日期范围', key: 'range',
                render: (_: unknown, r: ImportHistoryRecord) => `${r.date_from} ~ ${r.date_to}`
              }
            ]}
          />
        </Card>
      )}
    </div>
  )
}
