import { useEffect, useState } from 'react'
import { Card, Col, Row, DatePicker, Radio, Empty, Select, Space, Dropdown, Button, message } from 'antd'
import { ExportOutlined } from '@ant-design/icons'
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  BarChart, Bar
} from 'recharts'
import dayjs from 'dayjs'
import { useLocale } from '../i18n'

const COLORS = [
  '#1677ff', '#52c41a', '#faad14', '#ff4d4f', '#722ed1',
  '#13c2c2', '#eb2f96', '#fa8c16', '#2f54eb', '#a0d911'
]

export default function Statistics(): JSX.Element {
  const { t, tc } = useLocale()
  const [month, setMonth] = useState(dayjs())
  const [stats, setStats] = useState<MonthlyStats | null>(null)
  const [trendData, setTrendData] = useState<TrendItem[]>([])
  const [granularity, setGranularity] = useState('daily')
  const [categoryView, setCategoryView] = useState<'expense' | 'income'>('expense')
  const [categories, setCategories] = useState<Category[]>([])
  const [trendCategoryId, setTrendCategoryId] = useState<number | undefined>(undefined)
  const [trendRange, setTrendRange] = useState<'6m' | '1y'>('6m')
  const [categoryTrendData, setCategoryTrendData] = useState<{ period: string; amount: number }[]>([])

  useEffect(() => {
    window.api.getCategories().then(setCategories)
  }, [])

  const loadCategoryTrend = async (): Promise<void> => {
    if (!trendCategoryId) { setCategoryTrendData([]); return }
    const now = dayjs()
    const startDate = trendRange === '6m'
      ? now.subtract(5, 'month').startOf('month').format('YYYY-MM-DD')
      : now.startOf('year').format('YYYY-MM-DD')
    const endDate = now.endOf('month').format('YYYY-MM-DD')
    const result = await window.api.getCategoryTrend(trendCategoryId, startDate, endDate)
    setCategoryTrendData(result)
  }

  useEffect(() => { loadCategoryTrend() }, [trendCategoryId, trendRange])

  const loadStats = async (): Promise<void> => {
    const result = await window.api.getMonthlyStats(month.year(), month.month() + 1)
    setStats(result)
  }

  const loadTrend = async (): Promise<void> => {
    let startDate: string, endDate: string
    if (granularity === 'daily') {
      startDate = month.startOf('month').format('YYYY-MM-DD')
      endDate = month.endOf('month').format('YYYY-MM-DD')
    } else if (granularity === 'monthly') {
      startDate = month.startOf('year').format('YYYY-MM-DD')
      endDate = month.endOf('year').format('YYYY-MM-DD')
    } else if (granularity === 'weekly') {
      startDate = month.startOf('month').format('YYYY-MM-DD')
      endDate = month.endOf('month').format('YYYY-MM-DD')
    } else {
      startDate = dayjs().subtract(5, 'year').startOf('year').format('YYYY-MM-DD')
      endDate = dayjs().format('YYYY-MM-DD')
    }
    const result = await window.api.getTrend(startDate, endDate, granularity)
    setTrendData(result)
  }

  useEffect(() => { loadStats() }, [month])
  useEffect(() => { loadTrend() }, [month, granularity])

  const categoryData = stats?.byCategory
    .filter((c) => c.type === categoryView)
    .map((c) => ({ name: tc(c.name), value: c.total })) ?? []

  const totalCategoryAmount = categoryData.reduce((sum, c) => sum + c.value, 0)

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>{t('stats.title')}</h2>
        <Space>
          <Dropdown menu={{ items: [
            { key: 'excel', label: t('stats.exportExcel'), onClick: async () => {
              const result = await window.api.exportMonthlyReport(month.year(), month.month() + 1)
              if (result.success) message.success(t('stats.excelSuccess'))
            }},
            { key: 'pdf', label: t('stats.exportPdf'), onClick: async () => {
              const result = await window.api.exportMonthlyPdf(month.year(), month.month() + 1)
              if (result.success) message.success(t('stats.pdfSuccess'))
            }}
          ]}}>
            <Button size="small" icon={<ExportOutlined />}>{t('stats.exportReport')}</Button>
          </Dropdown>
          <DatePicker
            picker="month"
            value={month}
            onChange={(v) => v && setMonth(v)}
            allowClear={false}
          />
        </Space>
      </div>

      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={12}>
          <Card
            title={t('stats.categoryRatio')}
            size="small"
            extra={
              <Radio.Group size="small" value={categoryView} onChange={(e) => setCategoryView(e.target.value)}>
                <Radio.Button value="expense">{t('common.expense')}</Radio.Button>
                <Radio.Button value="income">{t('common.income')}</Radio.Button>
              </Radio.Group>
            }
          >
            {categoryData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={categoryData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    dataKey="value"
                    label={({ name, value }) => `${name} ${(value / totalCategoryAmount * 100).toFixed(1)}%`}
                  >
                    {categoryData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => [`¥${v.toFixed(2)} (${(v / totalCategoryAmount * 100).toFixed(1)}%)`]} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <Empty description={t('common.noData')} style={{ height: 300, display: 'flex', flexDirection: 'column', justifyContent: 'center' }} />
            )}
          </Card>
        </Col>
        <Col span={12}>
          <Card title={t('stats.categoryRank')} size="small">
            {categoryData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={categoryData} layout="vertical" margin={{ left: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" tickFormatter={(v) => `¥${v}`} />
                  <YAxis type="category" dataKey="name" width={60} />
                  <Tooltip formatter={(v: number) => `¥${v.toFixed(2)}`} />
                  <Bar dataKey="value" fill={categoryView === 'expense' ? '#ff4d4f' : '#52c41a'} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <Empty description={t('common.noData')} style={{ height: 300, display: 'flex', flexDirection: 'column', justifyContent: 'center' }} />
            )}
          </Card>
        </Col>
      </Row>

      <Card
        title={t('stats.trend')}
        size="small"
        extra={
          <Radio.Group size="small" value={granularity} onChange={(e) => setGranularity(e.target.value)}>
            <Radio.Button value="daily">{t('stats.daily')}</Radio.Button>
            <Radio.Button value="weekly">{t('stats.weekly')}</Radio.Button>
            <Radio.Button value="monthly">{t('stats.monthly')}</Radio.Button>
            <Radio.Button value="yearly">{t('stats.yearly')}</Radio.Button>
          </Radio.Group>
        }
      >
        {trendData.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="period" />
              <YAxis tickFormatter={(v) => `¥${v}`} />
              <Tooltip formatter={(v: number) => `¥${v.toFixed(2)}`} />
              <Legend />
              <Line type="monotone" dataKey="income" name={t('common.income')} stroke="#52c41a" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="expense" name={t('common.expense')} stroke="#ff4d4f" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <Empty description={t('common.noData')} style={{ height: 300, display: 'flex', flexDirection: 'column', justifyContent: 'center' }} />
        )}
      </Card>
      <Card
        title={t('stats.categoryTrend')}
        size="small"
        style={{ marginTop: 16 }}
        extra={
          <Space>
            <Select
              size="small"
              placeholder={t('stats.selectCategory')}
              style={{ width: 140 }}
              value={trendCategoryId}
              onChange={setTrendCategoryId}
              options={categories.map((c) => ({ label: `${tc(c.name)}（${c.type === 'expense' ? t('common.expense') : t('common.income')}）`, value: c.id }))}
              showSearch
              optionFilterProp="label"
            />
            <Radio.Group size="small" value={trendRange} onChange={(e) => setTrendRange(e.target.value)}>
              <Radio.Button value="6m">{t('stats.last6m')}</Radio.Button>
              <Radio.Button value="1y">{t('stats.thisYear')}</Radio.Button>
            </Radio.Group>
          </Space>
        }
      >
        {categoryTrendData.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={categoryTrendData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="period" />
              <YAxis tickFormatter={(v) => `¥${v}`} />
              <Tooltip formatter={(v: number) => `¥${v.toFixed(2)}`} />
              <Bar dataKey="amount" name={t('common.amount')} fill="#1677ff" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <Empty description={trendCategoryId ? t('common.noData') : t('stats.selectCategoryHint')} style={{ height: 300, display: 'flex', flexDirection: 'column', justifyContent: 'center' }} />
        )}
      </Card>
    </div>
  )
}
