import { useEffect, useState, useRef } from 'react'
import { Card, Col, Row, Table, Button, Form, InputNumber, DatePicker, Input, Select, message, Popconfirm, Tag } from 'antd'
import { DeleteOutlined } from '@ant-design/icons'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts'
import dayjs from 'dayjs'
import { useAppStore } from '../store'
import { useLocale } from '../i18n'

export default function Investment(): JSX.Element {
  const { t } = useLocale()
  const [summary, setSummary] = useState<InvestmentSummary | null>(null)
  const [records, setRecords] = useState<InvestmentRecord[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [form] = Form.useForm()
  const currentPage = useAppStore((s) => s.currentPage)
  const prevPage = useRef(currentPage)
  const pageSize = 15

  const typeLabels: Record<string, string> = {
    deposit: t('invest.deposit'),
    withdraw: t('invest.withdraw'),
    profit: t('invest.profit')
  }

  const typeColors: Record<string, string> = {
    deposit: 'blue',
    withdraw: 'orange',
    profit: 'green'
  }

  const loadData = async (): Promise<void> => {
    const [summaryData, listData] = await Promise.all([
      window.api.getInvestmentSummary(),
      window.api.listInvestments({ limit: pageSize, offset: (page - 1) * pageSize })
    ])
    setSummary(summaryData)
    setRecords(listData.data)
    setTotal(listData.total)
  }

  useEffect(() => { loadData() }, [page])

  useEffect(() => {
    if (currentPage === 'investment' && prevPage.current !== 'investment') {
      loadData()
    }
    prevPage.current = currentPage
  }, [currentPage])

  const handleSubmit = async (values: { type: string; amount: number; date: dayjs.Dayjs; note?: string }): Promise<void> => {
    await window.api.createInvestment({
      type: values.type,
      amount: values.amount,
      date: values.date.format('YYYY-MM-DD'),
      note: values.note || ''
    })
    message.success(t('invest.success'))
    form.resetFields(['amount', 'note'])
    setPage(1)
    loadData()
  }

  const handleDelete = async (id: number): Promise<void> => {
    await window.api.deleteInvestment(id)
    message.success(t('invest.deleted'))
    loadData()
  }

  const returnRate = summary && summary.totalDeposit > 0
    ? ((summary.totalProfit / summary.totalDeposit) * 100).toFixed(2)
    : '0.00'

  const columns = [
    {
      title: t('common.date'),
      dataIndex: 'date',
      width: 120,
      render: (d: string) => dayjs(d).format('YYYY-MM-DD')
    },
    {
      title: t('common.type'),
      dataIndex: 'type',
      width: 100,
      render: (tp: string) => <Tag color={typeColors[tp]}>{typeLabels[tp]}</Tag>
    },
    {
      title: t('common.amount'),
      dataIndex: 'amount',
      width: 140,
      render: (a: number, r: InvestmentRecord) => {
        const color = r.type === 'profit' ? '#52c41a' : r.type === 'withdraw' ? '#ff4d4f' : '#1677ff'
        const prefix = r.type === 'profit' ? '+' : r.type === 'withdraw' ? '-' : '+'
        return <span style={{ color, fontWeight: 500 }}>{prefix}¥{a.toFixed(2)}</span>
      }
    },
    { title: t('common.note'), dataIndex: 'note', ellipsis: true },
    {
      title: t('common.operation'),
      width: 60,
      render: (_: unknown, r: InvestmentRecord) => (
        <Popconfirm title={t('invest.confirmDelete')} onConfirm={() => handleDelete(r.id)} okText={t('common.delete')} cancelText={t('common.cancel')}>
          <Button type="text" size="small" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      )
    }
  ]

  return (
    <div>
      <div className="page-header"><h2>{t('invest.title')}</h2></div>

      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}>
          <Card>
            <div className="stat-card">
              <div className="label">{t('invest.currentPrincipal')}</div>
              <div className="value" style={{ color: '#1677ff' }}>¥{(summary?.currentPrincipal ?? 0).toFixed(2)}</div>
            </div>
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <div className="stat-card">
              <div className="label">{t('invest.totalProfit')}</div>
              <div className="value income">¥{(summary?.totalProfit ?? 0).toFixed(2)}</div>
            </div>
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <div className="stat-card">
              <div className="label">{t('invest.totalAssets')}</div>
              <div className="value" style={{ color: '#722ed1' }}>¥{(summary?.totalAssets ?? 0).toFixed(2)}</div>
            </div>
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <div className="stat-card">
              <div className="label">{t('invest.returnRate')}</div>
              <div className="value" style={{ color: '#faad14' }}>{returnRate}%</div>
            </div>
          </Card>
        </Col>
      </Row>

      <Card title={t('invest.recordOp')} size="small" style={{ marginBottom: 24 }}>
        <Form form={form} layout="inline" onFinish={handleSubmit}
          initialValues={{ type: 'deposit', date: dayjs() }}>
          <Form.Item name="type" rules={[{ required: true }]}>
            <Select style={{ width: 120 }}>
              <Select.Option value="deposit">{t('invest.deposit')}</Select.Option>
              <Select.Option value="withdraw">{t('invest.withdraw')}</Select.Option>
              <Select.Option value="profit">{t('invest.profit')}</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="amount" rules={[{ required: true, message: t('common.enterAmount') }]}>
            <InputNumber min={0.01} step={100} placeholder={t('common.amount')} style={{ width: 150 }} prefix="¥" />
          </Form.Item>
          <Form.Item name="date" rules={[{ required: true, message: t('common.selectDate') }]}>
            <DatePicker />
          </Form.Item>
          <Form.Item name="note">
            <Input placeholder={`${t('common.note')}(${t('common.optional')})`} style={{ width: 200 }} />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit">{t('common.submit')}</Button>
          </Form.Item>
        </Form>
      </Card>

      {summary && summary.monthly.length > 0 && (
        <Card title={t('invest.principalTrend')} size="small" style={{ marginBottom: 24 }}>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={summary.monthly}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip formatter={(value: number) => `¥${value.toFixed(2)}`} />
              <Legend />
              <Line type="monotone" dataKey="principal" name={t('invest.principal')} stroke="#1677ff" strokeWidth={2} />
              <Line type="monotone" dataKey="profit" name={t('invest.monthProfit')} stroke="#52c41a" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      )}

      <Card title={t('invest.records')} size="small">
        <Table
          dataSource={records}
          columns={columns}
          rowKey="id"
          size="small"
          pagination={{
            current: page,
            pageSize,
            total,
            onChange: setPage,
            showTotal: (t_) => t('common.total', t_)
          }}
        />
      </Card>
    </div>
  )
}
