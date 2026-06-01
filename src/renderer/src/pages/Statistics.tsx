import { useEffect, useState } from 'react'
import { Card, Col, Row, DatePicker, Radio, Empty, Select, Space, Dropdown, Button, message } from 'antd'
import { ExportOutlined } from '@ant-design/icons'
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  BarChart, Bar
} from 'recharts'
import dayjs from 'dayjs'

const COLORS = [
  '#1677ff', '#52c41a', '#faad14', '#ff4d4f', '#722ed1',
  '#13c2c2', '#eb2f96', '#fa8c16', '#2f54eb', '#a0d911'
]

export default function Statistics(): JSX.Element {
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
    .map((c) => ({ name: c.name, value: c.total })) ?? []

  const totalCategoryAmount = categoryData.reduce((sum, c) => sum + c.value, 0)

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>统计报表</h2>
        <Space>
          <Dropdown menu={{ items: [
            { key: 'excel', label: '导出月度 Excel 报告', onClick: async () => {
              const result = await window.api.exportMonthlyReport(month.year(), month.month() + 1)
              if (result.success) message.success('月度 Excel 报告已导出')
            }},
            { key: 'pdf', label: '导出月度 PDF 报告', onClick: async () => {
              const result = await window.api.exportMonthlyPdf(month.year(), month.month() + 1)
              if (result.success) message.success('月度 PDF 报告已导出')
            }}
          ]}}>
            <Button size="small" icon={<ExportOutlined />}>导出报告</Button>
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
            title="分类占比"
            size="small"
            extra={
              <Radio.Group size="small" value={categoryView} onChange={(e) => setCategoryView(e.target.value)}>
                <Radio.Button value="expense">支出</Radio.Button>
                <Radio.Button value="income">收入</Radio.Button>
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
                  <Tooltip formatter={(v: number) => `¥${v.toFixed(2)}`} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <Empty description="暂无数据" style={{ height: 300, display: 'flex', flexDirection: 'column', justifyContent: 'center' }} />
            )}
          </Card>
        </Col>
        <Col span={12}>
          <Card title="分类排名" size="small">
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
              <Empty description="暂无数据" style={{ height: 300, display: 'flex', flexDirection: 'column', justifyContent: 'center' }} />
            )}
          </Card>
        </Col>
      </Row>

      <Card
        title="收支趋势"
        size="small"
        extra={
          <Radio.Group size="small" value={granularity} onChange={(e) => setGranularity(e.target.value)}>
            <Radio.Button value="daily">按日</Radio.Button>
            <Radio.Button value="weekly">按周</Radio.Button>
            <Radio.Button value="monthly">按月</Radio.Button>
            <Radio.Button value="yearly">按年</Radio.Button>
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
              <Line type="monotone" dataKey="income" name="收入" stroke="#52c41a" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="expense" name="支出" stroke="#ff4d4f" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <Empty description="暂无数据" style={{ height: 300, display: 'flex', flexDirection: 'column', justifyContent: 'center' }} />
        )}
      </Card>
      <Card
        title="分类趋势"
        size="small"
        style={{ marginTop: 16 }}
        extra={
          <Space>
            <Select
              size="small"
              placeholder="选择分类"
              style={{ width: 140 }}
              value={trendCategoryId}
              onChange={setTrendCategoryId}
              options={categories.map((c) => ({ label: `${c.name}（${c.type === 'expense' ? '支出' : '收入'}）`, value: c.id }))}
              showSearch
              optionFilterProp="label"
            />
            <Radio.Group size="small" value={trendRange} onChange={(e) => setTrendRange(e.target.value)}>
              <Radio.Button value="6m">近6月</Radio.Button>
              <Radio.Button value="1y">今年</Radio.Button>
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
              <Bar dataKey="amount" name="金额" fill="#1677ff" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <Empty description={trendCategoryId ? '暂无数据' : '请选择一个分类'} style={{ height: 300, display: 'flex', flexDirection: 'column', justifyContent: 'center' }} />
        )}
      </Card>
    </div>
  )
}
