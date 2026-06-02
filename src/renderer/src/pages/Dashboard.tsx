import { useEffect, useState, useRef } from 'react'
import { Card, Col, Row, Table, Tag } from 'antd'
import { ArrowUpOutlined, ArrowDownOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { useAppStore } from '../store'
import { useLocale } from '../i18n'

export default function Dashboard(): JSX.Element {
  const { t, tc } = useLocale()
  const [stats, setStats] = useState<MonthlyStats | null>(null)
  const [recentList, setRecentList] = useState<Transaction[]>([])
  const currentPage = useAppStore((s) => s.currentPage)
  const prevPage = useRef(currentPage)

  const loadData = async (): Promise<void> => {
    const now = dayjs()
    const [monthlyStats, recent] = await Promise.all([
      window.api.getMonthlyStats(now.year(), now.month() + 1),
      window.api.getTransactions({ limit: 10 })
    ])
    setStats(monthlyStats)
    setRecentList(recent.data)
  }

  useEffect(() => { loadData() }, [])

  useEffect(() => {
    if (currentPage === 'dashboard' && prevPage.current !== 'dashboard') {
      loadData()
    }
    prevPage.current = currentPage
  }, [currentPage])

  const calcChange = (current: number, previous: number): { value: string; isUp: boolean } | null => {
    if (previous === 0) return null
    const pct = ((current - previous) / previous * 100).toFixed(1)
    return { value: `${Math.abs(Number(pct))}%`, isUp: current > previous }
  }

  const balance = stats ? stats.current.income - stats.current.expense : 0
  const incomeChange = stats ? calcChange(stats.current.income, stats.previous.income) : null
  const expenseChange = stats ? calcChange(stats.current.expense, stats.previous.expense) : null

  const columns = [
    {
      title: t('common.date'),
      dataIndex: 'date',
      width: 110,
      render: (d: string) => dayjs(d).format('MM-DD')
    },
    {
      title: t('common.type'),
      dataIndex: 'type',
      width: 90,
      render: (tp: string) => (
        <Tag color={tp === 'income' ? 'green' : 'red'}>{tp === 'income' ? t('common.income') : t('common.expense')}</Tag>
      )
    },
    { title: t('common.category'), dataIndex: 'category_name', width: 100, render: (n: string) => tc(n) },
    {
      title: t('common.amount'),
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
    { title: t('common.note'), dataIndex: 'note', ellipsis: true }
  ]

  return (
    <div>
      <div className="page-header"><h2>{t('dashboard.title')}</h2></div>
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={8}>
          <Card>
            <div className="stat-card">
              <div className="label">{t('dashboard.monthIncome')}</div>
              <div className="value income">¥{(stats?.current.income ?? 0).toFixed(2)}</div>
              {incomeChange && (
                <div className={`change ${incomeChange.isUp ? 'up' : 'down'}`}>
                  {incomeChange.isUp ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
                  {' '}{t('dashboard.vsLastMonth')} {incomeChange.value}
                </div>
              )}
            </div>
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <div className="stat-card">
              <div className="label">{t('dashboard.monthExpense')}</div>
              <div className="value expense">¥{(stats?.current.expense ?? 0).toFixed(2)}</div>
              {expenseChange && (
                <div className={`change ${expenseChange.isUp ? 'up' : 'down'}`}>
                  {expenseChange.isUp ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
                  {' '}{t('dashboard.vsLastMonth')} {expenseChange.value}
                </div>
              )}
            </div>
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <div className="stat-card">
              <div className="label">{t('dashboard.monthBalance')}</div>
              <div className="value balance">¥{balance.toFixed(2)}</div>
            </div>
          </Card>
        </Col>
      </Row>

      <Card title={t('dashboard.recentRecords')} size="small">
        <Table
          dataSource={recentList}
          columns={columns}
          rowKey="id"
          pagination={false}
          size="small"
        />
      </Card>
    </div>
  )
}
