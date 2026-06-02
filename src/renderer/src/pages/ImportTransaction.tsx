import { useState, useEffect } from 'react'
import { Button, Table, Tag, Select, message, Card, Space, Alert, Checkbox, Tooltip, Input, Collapse, Popconfirm } from 'antd'
import { UploadOutlined, ImportOutlined, HistoryOutlined, PlusOutlined, DeleteOutlined, SettingOutlined } from '@ant-design/icons'
import { useLocale } from '../i18n'

export default function ImportTransaction(): JSX.Element {
  const { t, tc } = useLocale()
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
        source: result.source,
        skipped: result.skipped,
        dateRange: result.dateRange
      })
    } catch (err: unknown) {
      message.error(t('import.parseFailed', err instanceof Error ? err.message : 'Unknown error'))
    } finally {
      setLoading(false)
    }
  }

  const handleImport = async (): Promise<void> => {
    const selected = items.filter((item) => item.selected && item.category_id)
    if (selected.length === 0) {
      message.warning(t('import.noRecords'))
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
        source: parseInfo?.source || 'Unknown',
        count,
        dateFrom: dates[0],
        dateTo: dates[dates.length - 1]
      })
      message.success(t('import.success', count))
      setItems([])
      setParseInfo(null)
      loadHistory()
    } catch (err: unknown) {
      message.error(t('import.importFailed', err instanceof Error ? err.message : 'Unknown error'))
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
    { title: t('common.date'), dataIndex: 'date', width: 110 },
    {
      title: t('common.type'),
      dataIndex: 'type',
      width: 90,
      render: (tp: string) => (
        <Tag color={tp === 'income' ? 'green' : 'red'}>{tp === 'income' ? t('common.income') : t('common.expense')}</Tag>
      )
    },
    {
      title: t('common.amount'),
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
      title: t('common.category'),
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
            .map((c) => ({ label: tc(c.name), value: c.id }))}
        />
      )
    },
    {
      title: t('common.note'),
      dataIndex: 'note',
      ellipsis: true
    },
    {
      title: t('import.source'),
      dataIndex: 'source',
      width: 70,
      render: (s: string) => (
        <Tag>{s === 'alipay' ? t('import.alipay') : t('import.wechat')}</Tag>
      )
    },
    {
      title: t('import.status'),
      width: 120,
      render: (_: unknown, record: ImportPreviewItem) => (
        record.duplicate ? (
          <Tooltip title={t('import.existingRecord', record.duplicateNote || '')}>
            <Tag color="warning" style={{ cursor: 'pointer' }}>{t('import.maybeDuplicate')}</Tag>
          </Tooltip>
        ) : null
      )
    }
  ]

  return (
    <div>
      <div className="page-header">
        <h2>{t('import.title')}</h2>
      </div>

      <Card size="small" style={{ marginBottom: 16 }}>
        <Space>
          <Button
            type="primary"
            icon={<UploadOutlined />}
            onClick={handleSelectFile}
            loading={loading}
          >
            {t('import.selectFile')}
          </Button>
          {items.length > 0 && (
            <Button
              type="primary"
              icon={<ImportOutlined />}
              onClick={handleImport}
              loading={importing}
              disabled={selectedCount === 0}
            >
              {t('import.confirmImport', selectedCount)}
            </Button>
          )}
        </Space>
      </Card>

      <Collapse
        size="small"
        style={{ marginBottom: 16 }}
        items={[{
          key: 'mappings',
          label: <><SettingOutlined /> {t('import.mappingRules')}</>,
          children: (
            <div>
              <Space style={{ marginBottom: 12 }}>
                <Input
                  size="small"
                  placeholder={t('import.keyword')}
                  value={newKeyword}
                  onChange={(e) => setNewKeyword(e.target.value)}
                  style={{ width: 160 }}
                />
                <Select
                  size="small"
                  placeholder={t('common.selectCategory')}
                  value={newCategoryId}
                  onChange={setNewCategoryId}
                  style={{ width: 140 }}
                  options={categories.map((c) => ({
                    label: `${tc(c.name)}（${c.type === 'expense' ? t('common.expense') : t('common.income')}）`,
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
                    message.success(t('import.ruleAdded'))
                  }}
                >
                  {t('common.add')}
                </Button>
              </Space>
              {mappings.length > 0 ? (
                <Table
                  dataSource={mappings}
                  rowKey="id"
                  size="small"
                  pagination={false}
                  columns={[
                    { title: t('import.keyword'), dataIndex: 'keyword', width: 180 },
                    {
                      title: t('import.mappedCategory'), key: 'category', width: 160,
                      render: (_: unknown, r: CategoryMapping) => (
                        <Tag color={r.category_type === 'expense' ? 'red' : 'green'}>{tc(r.category_name)}</Tag>
                      )
                    },
                    {
                      title: t('common.operation'), width: 80,
                      render: (_: unknown, r: CategoryMapping) => (
                        <Popconfirm title={t('import.deleteRule')} onConfirm={async () => {
                          await window.api.deleteMapping(r.id)
                          loadMappings()
                        }} okText={t('common.delete')} cancelText={t('common.cancel')}>
                          <Button type="link" size="small" danger icon={<DeleteOutlined />} />
                        </Popconfirm>
                      )
                    }
                  ]}
                />
              ) : (
                <div style={{ color: '#999', fontSize: 13 }}>
                  {t('import.noRules')}
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
          message={t('import.parseInfo', parseInfo.source === 'alipay' ? t('import.alipay') : t('import.wechat'), parseInfo.dateRange[0], parseInfo.dateRange[1], items.length, parseInfo.skipped)}
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
        <Card size="small" style={{ marginTop: 24 }} title={<><HistoryOutlined /> {t('import.history')}</>}>
          <Table
            dataSource={history}
            rowKey="id"
            size="small"
            pagination={false}
            columns={[
              {
                title: t('import.importTime'), dataIndex: 'created_at', width: 180,
                render: (tp: string) => tp.replace('T', ' ').substring(0, 19)
              },
              {
                title: t('import.source'), dataIndex: 'source', width: 80,
                render: (s: string) => <Tag>{s === 'alipay' ? t('import.alipay') : s === 'wechat' ? t('import.wechat') : s}</Tag>
              },
              { title: t('import.count'), dataIndex: 'count', width: 80 },
              {
                title: t('import.dateRange'), key: 'range',
                render: (_: unknown, r: ImportHistoryRecord) => `${r.date_from} ~ ${r.date_to}`
              }
            ]}
          />
        </Card>
      )}
    </div>
  )
}
