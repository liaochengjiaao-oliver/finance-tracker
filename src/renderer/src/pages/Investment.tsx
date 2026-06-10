import { useEffect, useState, useRef } from 'react'
import { Card, Col, Row, Table, Button, Form, InputNumber, DatePicker, Input, Select, message, Popconfirm, Tag, Space, Empty } from 'antd'
import { DeleteOutlined, ExportOutlined, ArrowUpOutlined, ArrowDownOutlined } from '@ant-design/icons'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  ComposedChart, Bar
} from 'recharts'
import dayjs from 'dayjs'
import { useAppStore } from '../store'
import { useLocale } from '../i18n'

const MONTH_LABELS_ZH = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月']
const MONTH_LABELS_EN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function AnnualInvestmentSection({ t, locale, year, onYearChange, stats, onExportPdf }: {
  t: (key: string, ...args: unknown[]) => string
  locale: string
  year: dayjs.Dayjs
  onYearChange: (v: dayjs.Dayjs) => void
  stats: InvestmentAnnualStats | null
  onExportPdf: () => void
}): JSX.Element {
  const monthLabels = locale === 'en' ? MONTH_LABELS_EN : MONTH_LABELS_ZH
  const principalChange = stats ? stats.principalAtYearEnd - stats.principalAtYearStart : 0
  const xirrDisplay = stats?.xirrRate != null ? (stats.xirrRate * 100).toFixed(2) : '--'

  const calcYoy = (): { value: string; isUp: boolean } | null => {
    if (!stats || stats.prevYearProfit === 0) return null
    const pct = ((stats.yearProfit - stats.prevYearProfit) / stats.prevYearProfit * 100).toFixed(1)
    return { value: `${Math.abs(Number(pct))}%`, isUp: stats.yearProfit > stats.prevYearProfit }
  }
  const yoy = calcYoy()

  const monthlyData = monthLabels.map((label, i) => {
    const monthKey = `${year.year()}-${String(i + 1).padStart(2, '0')}`
    const found = stats?.monthly.find((m) => m.month === monthKey)
    return {
      month: label,
      deposit: found?.deposit ?? 0,
      withdraw: found?.withdraw ?? 0,
      profit: found?.profit ?? 0
    }
  })

  return (
    <Card
      title={t('invest.annualSummary')}
      size="small"
      style={{ marginBottom: 24 }}
      extra={
        <Space>
          <Button size="small" icon={<ExportOutlined />} onClick={onExportPdf}>{t('invest.exportPdf')}</Button>
          <DatePicker picker="year" value={year} onChange={(v) => v && onYearChange(v)} allowClear={false} />
        </Space>
      }
    >
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}>
          <Card size="small">
            <div className="stat-card">
              <div className="label">{t('invest.yearProfit')}</div>
              <div className="value income">¥{(stats?.yearProfit ?? 0).toFixed(2)}</div>
              {yoy && (
                <div className={`change ${yoy.isUp ? 'up' : 'down'}`}>
                  {yoy.isUp ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
                  {' '}{t('invest.vsLastYear')} {yoy.value}
                </div>
              )}
            </div>
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <div className="stat-card">
              <div className="label">{t('invest.principalChange')}</div>
              <div className="value" style={{ color: '#1677ff' }}>{principalChange >= 0 ? '+' : ''}¥{principalChange.toFixed(2)}</div>
            </div>
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <div className="stat-card">
              <div className="label">{t('invest.yearXirr')}</div>
              <div className="value" style={{ color: '#faad14' }}>{xirrDisplay}%</div>
            </div>
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <div className="stat-card">
              <div className="label">{t('invest.currentPrincipal')}</div>
              <div className="value" style={{ color: '#722ed1' }}>¥{(stats?.principalAtYearEnd ?? 0).toFixed(2)}</div>
            </div>
          </Card>
        </Col>
      </Row>

      {monthlyData.some((m) => m.deposit > 0 || m.withdraw > 0 || m.profit > 0) ? (
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={monthlyData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" />
            <YAxis tickFormatter={(v: number) => `¥${v}`} />
            <Tooltip formatter={(v: number) => `¥${v.toFixed(2)}`} />
            <Legend />
            <Bar dataKey="deposit" name={t('invest.deposit')} fill="#1677ff" radius={[4, 4, 0, 0]} />
            <Bar dataKey="withdraw" name={t('invest.withdraw')} fill="#ff4d4f" radius={[4, 4, 0, 0]} />
            <Bar dataKey="profit" name={t('invest.profit')} fill="#52c41a" radius={[4, 4, 0, 0]} />
          </ComposedChart>
        </ResponsiveContainer>
      ) : (
        <Empty description={t('common.noData')} style={{ height: 200, display: 'flex', flexDirection: 'column', justifyContent: 'center' }} />
      )}
    </Card>
  )
}

export default function Investment(): JSX.Element {
  const { t, locale } = useLocale()
  const [summary, setSummary] = useState<InvestmentSummary | null>(null)
  const [records, setRecords] = useState<InvestmentRecord[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [annualYear, setAnnualYear] = useState(dayjs())
  const [annualStats, setAnnualStats] = useState<InvestmentAnnualStats | null>(null)
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

  const loadAnnual = async (): Promise<void> => {
    const data = await window.api.getInvestmentAnnual(annualYear.year())
    setAnnualStats(data)
  }

  useEffect(() => { loadData() }, [page])
  useEffect(() => { loadAnnual() }, [annualYear])

  useEffect(() => {
    if (currentPage === 'investment' && prevPage.current !== 'investment') {
      loadData()
      loadAnnual()
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

  const xirrDisplay = summary?.xirrRate != null
    ? (summary.xirrRate * 100).toFixed(2)
    : '--'

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
              <div className="label">{t('invest.annualizedRate')}</div>
              <div className="value" style={{ color: '#faad14' }}>{xirrDisplay}%</div>
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
            </LineChart>
          </ResponsiveContainer>
        </Card>
      )}

      {summary && summary.monthly.length > 0 && (
        <Card title={t('invest.profitTrend')} size="small" style={{ marginBottom: 24 }}>
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={summary.monthly}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip formatter={(value: number) => `¥${value.toFixed(2)}`} />
              <Legend />
              <Bar dataKey="profit" name={t('invest.monthProfit')} fill="#52c41a" radius={[4, 4, 0, 0]} />
              <Line type="monotone" dataKey="cumulativeProfit" name={t('invest.cumulativeProfit')} stroke="#faad14" strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </Card>
      )}

      <AnnualInvestmentSection
        t={t}
        locale={locale}
        year={annualYear}
        onYearChange={setAnnualYear}
        stats={annualStats}
        onExportPdf={async () => {
          const result = await window.api.exportInvestmentAnnualPdf(annualYear.year())
          if (result.success) message.success(t('invest.pdfSuccess'))
        }}
      />

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
