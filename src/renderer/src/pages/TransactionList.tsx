import { useEffect, useState, useCallback, useRef } from 'react'
import { useAppStore } from '../store'
import {
  Table, Tag, Button, Space, DatePicker, Select, Input, InputNumber,
  Popconfirm, message, Modal, Form, Radio, Card
} from 'antd'
import { DeleteOutlined, EditOutlined, SearchOutlined, ExportOutlined } from '@ant-design/icons'
import type { TableRowSelection } from 'antd/es/table/interface'
import dayjs from 'dayjs'

const { RangePicker } = DatePicker

interface Filters {
  dateRange: [dayjs.Dayjs, dayjs.Dayjs] | null
  type: string | undefined
  categoryIds: number[]
  keyword: string
  minAmount: number | undefined
  maxAmount: number | undefined
}

export default function TransactionList(): JSX.Element {
  const [data, setData] = useState<Transaction[]>([])
  const [total, setTotal] = useState(0)
  const [totalIncome, setTotalIncome] = useState(0)
  const [totalExpense, setTotalExpense] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(false)
  const [editModal, setEditModal] = useState(false)
  const [editRecord, setEditRecord] = useState<Transaction | null>(null)
  const [editForm] = Form.useForm()
  const [editType, setEditType] = useState<'expense' | 'income'>('expense')

  const [selectedRowKeys, setSelectedRowKeys] = useState<number[]>([])

  const [filters, setFilters] = useState<Filters>({
    dateRange: null,
    type: undefined,
    categoryIds: [],
    keyword: '',
    minAmount: undefined,
    maxAmount: undefined
  })

  const loadCategories = async (): Promise<void> => {
    const list = await window.api.getCategories()
    setCategories(list)
  }

  const loadData = useCallback(async (): Promise<void> => {
    setLoading(true)
    try {
      const result = await window.api.getTransactions({
        startDate: filters.dateRange?.[0]?.format('YYYY-MM-DD'),
        endDate: filters.dateRange?.[1]?.format('YYYY-MM-DD'),
        type: filters.type,
        categoryIds: filters.categoryIds.length > 0 ? filters.categoryIds : undefined,
        keyword: filters.keyword || undefined,
        minAmount: filters.minAmount,
        maxAmount: filters.maxAmount,
        limit: pageSize,
        offset: (page - 1) * pageSize
      })
      setData(result.data)
      setTotal(result.total)
      setTotalIncome(result.totalIncome)
      setTotalExpense(result.totalExpense)
    } finally {
      setLoading(false)
    }
  }, [filters, page, pageSize])

  const currentPage = useAppStore((s) => s.currentPage)
  const prevPage = useRef(currentPage)

  useEffect(() => { loadCategories() }, [])
  useEffect(() => { loadData() }, [loadData])

  useEffect(() => {
    if (currentPage === 'list' && prevPage.current !== 'list') {
      loadData()
    }
    prevPage.current = currentPage
  }, [currentPage, loadData])

  const handleDelete = async (id: number): Promise<void> => {
    await window.api.deleteTransaction(id)
    message.success('已删除')
    loadData()
  }

  const openEdit = (record: Transaction): void => {
    setEditRecord(record)
    setEditType(record.type)
    editForm.setFieldsValue({
      amount: record.amount,
      category_id: record.category_id,
      date: dayjs(record.date),
      note: record.note
    })
    setEditModal(true)
  }

  const handleEdit = async (values: {
    amount: number; category_id: number; date: dayjs.Dayjs; note?: string
  }): Promise<void> => {
    if (!editRecord) return
    await window.api.updateTransaction(editRecord.id, {
      type: editType,
      amount: values.amount,
      category_id: values.category_id,
      date: values.date.format('YYYY-MM-DD'),
      note: values.note || ''
    })
    message.success('已更新')
    setEditModal(false)
    loadData()
  }

  const handleBatchDelete = async (): Promise<void> => {
    const count = await window.api.batchDeleteTransactions(selectedRowKeys)
    message.success(`已删除 ${count} 条记录`)
    setSelectedRowKeys([])
    loadData()
  }

  const handleSelectAll = async (): Promise<void> => {
    const ids = await window.api.listTransactionIds({
      startDate: filters.dateRange?.[0]?.format('YYYY-MM-DD'),
      endDate: filters.dateRange?.[1]?.format('YYYY-MM-DD'),
      type: filters.type,
      categoryIds: filters.categoryIds.length > 0 ? filters.categoryIds : undefined,
      keyword: filters.keyword || undefined,
      minAmount: filters.minAmount,
      maxAmount: filters.maxAmount
    })
    setSelectedRowKeys(ids)
  }

  const rowSelection: TableRowSelection<Transaction> = {
    selectedRowKeys,
    onChange: (keys) => setSelectedRowKeys(keys as number[])
  }

  const handleExport = async (): Promise<void> => {
    const rows = await window.api.exportTransactions({
      startDate: filters.dateRange?.[0]?.format('YYYY-MM-DD'),
      endDate: filters.dateRange?.[1]?.format('YYYY-MM-DD'),
      type: filters.type,
      categoryIds: filters.categoryIds.length > 0 ? filters.categoryIds : undefined
    })

    const header = '日期,类型,分类,金额,备注'
    const csvRows = rows.map((r) =>
      `${r.date},${r.type === 'income' ? '收入' : '支出'},${r.category},${r.amount},"${(r.note || '').replace(/"/g, '""')}"`
    )
    const csv = '﻿' + [header, ...csvRows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `账单_${dayjs().format('YYYYMMDD')}.csv`
    a.click()
    URL.revokeObjectURL(url)
    message.success('导出成功')
  }

  const filteredCategories = categories.filter(
    (c) => !filters.type || c.type === filters.type
  )

  const editFilteredCategories = categories.filter((c) => c.type === editType)

  const columns = [
    { title: '日期', dataIndex: 'date', width: 110 },
    {
      title: '类型',
      dataIndex: 'type',
      width: 70,
      render: (t: string) => (
        <Tag color={t === 'income' ? 'green' : 'red'}>{t === 'income' ? '收入' : '支出'}</Tag>
      )
    },
    { title: '分类', dataIndex: 'category_name', width: 100 },
    {
      title: '金额',
      dataIndex: 'amount',
      width: 120,
      render: (a: number, r: Transaction) => {
        const symbol = r.currency === 'USD' ? '$' : '¥'
        return (
          <span style={{ color: r.type === 'income' ? '#52c41a' : '#ff4d4f', fontWeight: 500 }}>
            {r.type === 'income' ? '+' : '-'}{symbol}{a.toFixed(2)}
          </span>
        )
      }
    },
    { title: '备注', dataIndex: 'note', ellipsis: true },
    {
      title: '操作',
      width: 100,
      render: (_: unknown, record: Transaction) => (
        <Space size="small">
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEdit(record)} />
          <Popconfirm title="确认删除？" onConfirm={() => handleDelete(record.id)} okText="删除" cancelText="取消">
            <Button type="link" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      )
    }
  ]

  const quickDateRange = (preset: string): void => {
    const now = dayjs()
    let range: [dayjs.Dayjs, dayjs.Dayjs]
    switch (preset) {
      case 'today': range = [now, now]; break
      case 'week': range = [now.startOf('week'), now]; break
      case 'month': range = [now.startOf('month'), now]; break
      case 'year': range = [now.startOf('year'), now]; break
      default: return
    }
    setFilters({ ...filters, dateRange: range })
    setPage(1)
  }

  return (
    <div>
      <div className="page-header">
        <h2>账单列表</h2>
      </div>

      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap>
          <Space.Compact>
            <Button size="small" onClick={() => quickDateRange('today')}>今天</Button>
            <Button size="small" onClick={() => quickDateRange('week')}>本周</Button>
            <Button size="small" onClick={() => quickDateRange('month')}>本月</Button>
            <Button size="small" onClick={() => quickDateRange('year')}>本年</Button>
          </Space.Compact>
          <RangePicker
            size="small"
            value={filters.dateRange}
            onChange={(v) => { setFilters({ ...filters, dateRange: v as [dayjs.Dayjs, dayjs.Dayjs] | null }); setPage(1) }}
          />
          <Select
            size="small"
            placeholder="类型"
            allowClear
            style={{ width: 90 }}
            value={filters.type}
            onChange={(v) => { setFilters({ ...filters, type: v, categoryIds: [] }); setPage(1) }}
            options={[
              { label: '收入', value: 'income' },
              { label: '支出', value: 'expense' }
            ]}
          />
          <Select
            size="small"
            mode="multiple"
            placeholder="分类"
            allowClear
            style={{ minWidth: 120 }}
            value={filters.categoryIds}
            onChange={(v) => { setFilters({ ...filters, categoryIds: v }); setPage(1) }}
            options={filteredCategories.map((c) => ({ label: c.name, value: c.id }))}
          />
          <InputNumber size="small" placeholder="最小金额" style={{ width: 100 }}
            value={filters.minAmount}
            onChange={(v) => { setFilters({ ...filters, minAmount: v ?? undefined }); setPage(1) }}
          />
          <InputNumber size="small" placeholder="最大金额" style={{ width: 100 }}
            value={filters.maxAmount}
            onChange={(v) => { setFilters({ ...filters, maxAmount: v ?? undefined }); setPage(1) }}
          />
          <Input
            size="small"
            placeholder="搜索备注"
            prefix={<SearchOutlined />}
            style={{ width: 140 }}
            value={filters.keyword}
            onChange={(e) => { setFilters({ ...filters, keyword: e.target.value }); setPage(1) }}
            allowClear
          />
          <Button size="small" icon={<ExportOutlined />} onClick={handleExport}>导出CSV</Button>
          <Button size="small" icon={<ExportOutlined />} onClick={async () => {
            const result = await window.api.exportExcel({
              startDate: filters.dateRange?.[0]?.format('YYYY-MM-DD'),
              endDate: filters.dateRange?.[1]?.format('YYYY-MM-DD'),
              type: filters.type,
              categoryIds: filters.categoryIds.length > 0 ? filters.categoryIds : undefined
            })
            if (result.success) message.success('Excel 导出成功')
          }}>导出Excel</Button>
          {selectedRowKeys.length > 0 ? (
            <>
              <Button size="small" onClick={() => setSelectedRowKeys([])}>取消选择</Button>
              <Popconfirm
                title={`确认删除选中的 ${selectedRowKeys.length} 条记录？`}
                onConfirm={handleBatchDelete}
                okText="删除"
                cancelText="取消"
                okButtonProps={{ danger: true }}
              >
                <Button size="small" danger icon={<DeleteOutlined />}>
                  删除选中 ({selectedRowKeys.length})
                </Button>
              </Popconfirm>
            </>
          ) : (
            <Button size="small" onClick={handleSelectAll}>全选所有 ({total})</Button>
          )}
        </Space>
      </Card>

      <div className="summary-bar">
        <div className="summary-item">
          收入：<span style={{ color: '#52c41a' }}>¥{totalIncome.toFixed(2)}</span>
        </div>
        <div className="summary-item">
          支出：<span style={{ color: '#ff4d4f' }}>¥{totalExpense.toFixed(2)}</span>
        </div>
        <div className="summary-item">
          结余：<span style={{ color: '#1677ff' }}>¥{(totalIncome - totalExpense).toFixed(2)}</span>
        </div>
        <div className="summary-item">共 {total} 条记录</div>
      </div>

      <Table
        dataSource={data}
        columns={columns}
        rowKey="id"
        loading={loading}
        size="small"
        rowSelection={rowSelection}
        pagination={{
          current: page,
          pageSize,
          total,
          showSizeChanger: true,
          showTotal: (t) => `共 ${t} 条`,
          onChange: (p, ps) => { setPage(p); setPageSize(ps) }
        }}
      />

      <Modal
        title="编辑记录"
        open={editModal}
        onCancel={() => setEditModal(false)}
        footer={null}
        destroyOnClose
      >
        <Form form={editForm} layout="vertical" onFinish={handleEdit}>
          <Form.Item label="类型">
            <Radio.Group value={editType} onChange={(e) => {
              setEditType(e.target.value)
              editForm.setFieldValue('category_id', undefined)
            }}>
              <Radio.Button value="expense">支出</Radio.Button>
              <Radio.Button value="income">收入</Radio.Button>
            </Radio.Group>
          </Form.Item>
          <Form.Item name="amount" label="金额" rules={[{ required: true, message: '请输入金额' }]}>
            <InputNumber prefix="¥" min={0.01} step={0.01} precision={2} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="category_id" label="分类" rules={[{ required: true, message: '请选择分类' }]}>
            <Select>
              {editFilteredCategories.map((c) => (
                <Select.Option key={c.id} value={c.id}>{c.name}</Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="date" label="日期" rules={[{ required: true }]}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="note" label="备注">
            <Input.TextArea rows={2} maxLength={200} showCount />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" block>保存修改</Button>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
