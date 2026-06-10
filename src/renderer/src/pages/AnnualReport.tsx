import { useEffect, useState, useRef } from 'react'
import { Card, Col, Row, DatePicker, Empty, Radio, Button, Space, message } from 'antd'
import {
  ArrowUpOutlined, ArrowDownOutlined,
  CalendarOutlined, FileTextOutlined,
  RiseOutlined, FallOutlined, ExportOutlined
} from '@ant-design/icons'
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid
} from 'recharts'
import dayjs from 'dayjs'
import { useAppStore } from '../store'
import { useLocale } from '../i18n'

const COLORS = [
  '#1677ff', '#52c41a', '#faad14', '#ff4d4f', '#722ed1',
  '#13c2c2', '#eb2f96', '#fa8c16', '#2f54eb', '#a0d911'
]

const MONTH_LABELS_ZH = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月']
const MONTH_LABELS_EN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

export default function AnnualReport(): JSX.Element {
  const { t, tc, locale } = useLocale()
  const [year, setYear] = useState(dayjs())
  const [stats, setStats] = useState<AnnualStats | null>(null)
  const [categoryView, setCategoryView] = useState<'expense' | 'income'>('expense')
  const currentPage = useAppStore((s) => s.currentPage)
  const prevPage = useRef(currentPage)

  const MONTH_LABELS = locale === 'en' ? MONTH_LABELS_EN : MONTH_LABELS_ZH

  const loadStats = async (): Promise<void> => {
    const result = await window.api.getAnnualStats(year.year())
    setStats(result)
  }

  useEffect(() => { loadStats() }, [year])

  useEffect(() => {
    if (currentPage === 'annual' && prevPage.current !== 'annual') {
      loadStats()
    }
    prevPage.current = currentPage
  }, [currentPage])

  const balance = stats ? stats.current.income - stats.current.expense : 0

  const calcChange = (current: number, previous: number): { value: string; isUp: boolean } | null => {
    if (previous === 0) return null
    const pct = ((current - previous) / previous * 100).toFixed(1)
    return { value: `${Math.abs(Number(pct))}%`, isUp: current > previous }
  }

  const incomeChange = stats ? calcChange(stats.current.income, stats.previous.income) : null
  const expenseChange = stats ? calcChange(stats.current.expense, stats.previous.expense) : null

  const monthlyData = MONTH_LABELS.map((label, i) => {
    const monthKey = `${year.year()}-${String(i + 1).padStart(2, '0')}`
    const found = stats?.monthly.find((m) => m.month === monthKey)
    return {
      month: label,
      income: found ? found.income : 0,
      expense: found ? found.expense : 0
    }
  })

  const categoryData = stats?.byCategory
    .filter((c) => c.type === categoryView)
    .map((c) => ({ name: tc(c.name), value: c.total })) ?? []
  const totalCategoryAmount = categoryData.reduce((sum, c) => sum + c.value, 0)

  const expenseMonths = monthlyData.filter((m) => m.expense > 0)
  const avgExpense = expenseMonths.length > 0
    ? expenseMonths.reduce((s, m) => s + m.expense, 0) / expenseMonths.length
    : 0
  const maxExpenseMonth = expenseMonths.length > 0
    ? expenseMonths.reduce((max, m) => m.expense > max.expense ? m : max)
    : null
  const minExpenseMonth = expenseMonths.length > 0
    ? expenseMonths.reduce((min, m) => m.expense < min.expense ? m : min)
    : null

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>{t('annual.title')}</h2>
        <Space>
          <Button size="small" icon={<ExportOutlined />} onClick={async () => {
            const result = await window.api.exportAnnualPdf(year.year())
            if (result.success) message.success(t('annual.pdfSuccess'))
          }}>{t('annual.exportPdf')}</Button>
          <DatePicker
            picker="year"
            value={year}
            onChange={(v) => v && setYear(v)}
            allowClear={false}
          />
        </Space>
      </div>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={8}>
          <Card>
            <div className="stat-card">
              <div className="label">{t('annual.yearIncome')}</div>
              <div className="value income">¥{(stats?.current.income ?? 0).toFixed(2)}</div>
              {incomeChange && (
                <div className={`change ${incomeChange.isUp ? 'up' : 'down'}`}>
                  {incomeChange.isUp ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
                  {' '}{t('annual.vsLastYear')} {incomeChange.value}
                </div>
              )}
            </div>
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <div className="stat-card">
              <div className="label">{t('annual.yearExpense')}</div>
              <div className="value expense">¥{(stats?.current.expense ?? 0).toFixed(2)}</div>
              {expenseChange && (
                <div className={`change ${expenseChange.isUp ? 'up' : 'down'}`}>
                  {expenseChange.isUp ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
                  {' '}{t('annual.vsLastYear')} {expenseChange.value}
                </div>
              )}
            </div>
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <div className="stat-card">
              <div className="label">{t('annual.yearBalance')}</div>
              <div className="value balance">¥{balance.toFixed(2)}</div>
            </div>
          </Card>
        </Col>
      </Row>

      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}>
          <Card size="small">
            <div className="annual-highlight">
              <CalendarOutlined className="annual-highlight-icon" />
              <div className="annual-highlight-value">{stats?.totalDays ?? 0}</div>
              <div className="annual-highlight-label">{t('annual.recordDays')}</div>
            </div>
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <div className="annual-highlight">
              <FileTextOutlined className="annual-highlight-icon" />
              <div className="annual-highlight-value">{stats?.totalCount ?? 0}</div>
              <div className="annual-highlight-label">{t('annual.recordCount')}</div>
            </div>
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <div className="annual-highlight">
              <RiseOutlined className="annual-highlight-icon" style={{ color: '#ff4d4f' }} />
              <div className="annual-highlight-value">
                {maxExpenseMonth ? `${maxExpenseMonth.month}` : '-'}
              </div>
              <div className="annual-highlight-label">
                {t('annual.highestMonth')} {maxExpenseMonth ? `¥${maxExpenseMonth.expense.toFixed(0)}` : ''}
              </div>
            </div>
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <div className="annual-highlight">
              <FallOutlined className="annual-highlight-icon" style={{ color: '#52c41a' }} />
              <div className="annual-highlight-value">
                {minExpenseMonth ? `${minExpenseMonth.month}` : '-'}
              </div>
              <div className="annual-highlight-label">
                {t('annual.lowestMonth')} {minExpenseMonth ? `¥${minExpenseMonth.expense.toFixed(0)}` : ''}
              </div>
            </div>
          </Card>
        </Col>
      </Row>

      <Card
        title={t('annual.monthlyTrend')}
        size="small"
        extra={<span style={{ fontSize: 13, color: '#8c8c8c' }}>{t('annual.avgExpense')} ¥{avgExpense.toFixed(0)}</span>}
        style={{ marginBottom: 24 }}
      >
        {monthlyData.some((m) => m.income > 0 || m.expense > 0) ? (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis tickFormatter={(v) => `¥${v}`} />
              <Tooltip formatter={(v: number) => `¥${v.toFixed(2)}`} />
              <Legend />
              <Bar dataKey="income" name={t('common.income')} fill="#52c41a" radius={[4, 4, 0, 0]} />
              <Bar dataKey="expense" name={t('common.expense')} fill="#ff4d4f" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <Empty description={t('common.noData')} style={{ height: 300, display: 'flex', flexDirection: 'column', justifyContent: 'center' }} />
        )}
      </Card>

      <Row gutter={16}>
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
    </div>
  )
}
