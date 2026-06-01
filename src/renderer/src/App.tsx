import { useEffect, useState, useCallback } from 'react'
import {
  PieChartOutlined,
  PlusCircleOutlined,
  UnorderedListOutlined,
  BarChartOutlined,
  AppstoreOutlined,
  ImportOutlined,
  CalendarOutlined,
  SwapOutlined,
  UserOutlined
} from '@ant-design/icons'
import { Menu, ConfigProvider, theme as antTheme } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { useAppStore } from './store'
import Dashboard from './pages/Dashboard'
import AddTransaction from './pages/AddTransaction'
import TransactionList from './pages/TransactionList'
import Statistics from './pages/Statistics'
import CategoryManager from './pages/CategoryManager'
import ImportTransaction from './pages/ImportTransaction'
import AnnualReport from './pages/AnnualReport'
import UserSelect from './pages/UserSelect'
import MiniAdd from './pages/MiniAdd'

const menuItems = [
  { key: 'dashboard', icon: <PieChartOutlined />, label: '概览' },
  { key: 'add', icon: <PlusCircleOutlined />, label: '记账' },
  { key: 'import', icon: <ImportOutlined />, label: '导入' },
  { key: 'list', icon: <UnorderedListOutlined />, label: '账单列表' },
  { key: 'stats', icon: <BarChartOutlined />, label: '统计报表' },
  { key: 'annual', icon: <CalendarOutlined />, label: '年度账单' },
  { key: 'categories', icon: <AppstoreOutlined />, label: '分类管理' }
]

const pageComponents: { key: string; component: JSX.Element }[] = [
  { key: 'dashboard', component: <Dashboard /> },
  { key: 'add', component: <AddTransaction /> },
  { key: 'import', component: <ImportTransaction /> },
  { key: 'list', component: <TransactionList /> },
  { key: 'stats', component: <Statistics /> },
  { key: 'annual', component: <AnnualReport /> },
  { key: 'categories', component: <CategoryManager /> }
]

function useTheme(): 'dark' | 'light' {
  const [mode, setMode] = useState<'dark' | 'light'>('light')

  useEffect(() => {
    window.api.getTheme().then(setMode)
    const cleanup = window.api.onThemeChanged(setMode)
    return cleanup
  }, [])

  return mode
}

interface UserInfo {
  id: string
  name: string
}

function MainApp({ user, onSwitchUser }: { user: UserInfo; onSwitchUser: () => void }): JSX.Element {
  const { currentPage, setPage } = useAppStore()

  const colors = ['#1677ff', '#52c41a', '#722ed1', '#fa8c16', '#eb2f96', '#13c2c2']
  const colorIndex = user.name.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0)
  const avatarColor = colors[colorIndex % colors.length]

  return (
    <div className="app-layout">
      <div className="sidebar">
        <div className="sidebar-menu">
          <Menu
            mode="inline"
            selectedKeys={[currentPage]}
            items={menuItems}
            onClick={({ key }) => setPage(key as keyof typeof pages)}
          />
        </div>
        <div className="sidebar-user">
          <div className="sidebar-user-info">
            <div className="sidebar-user-avatar" style={{ background: avatarColor }}>
              <UserOutlined />
            </div>
            <span className="sidebar-user-name">{user.name}</span>
          </div>
          <button className="sidebar-switch-btn" onClick={onSwitchUser} title="切换用户">
            <SwapOutlined />
          </button>
        </div>
      </div>
      <div className="main-content">
        {pageComponents.map(({ key, component }) => (
          <div key={key} style={{ display: currentPage === key ? 'block' : 'none' }}>
            {component}
          </div>
        ))}
      </div>
    </div>
  )
}

export default function App(): JSX.Element {
  const themeMode = useTheme()
  const isMini = window.location.hash === '#mini'
  const [currentUser, setCurrentUser] = useState<UserInfo | null | undefined>(undefined)
  const { setPage } = useAppStore()

  const checkUser = useCallback(async () => {
    const user = await window.api.getCurrentUser()
    setCurrentUser(user)
  }, [])

  useEffect(() => {
    if (!isMini) {
      checkUser()
    }
  }, [isMini, checkUser])

  useEffect(() => {
    const cleanup = window.api.onUserSwitched(() => {
      checkUser()
      setPage('dashboard')
    })
    return cleanup
  }, [checkUser, setPage])

  const handleLogin = (): void => {
    checkUser()
    setPage('dashboard')
  }

  const handleSwitchUser = (): void => {
    setCurrentUser(null)
  }

  // Loading state
  if (!isMini && currentUser === undefined) {
    return (
      <ConfigProvider
        locale={zhCN}
        theme={{
          algorithm: themeMode === 'dark' ? antTheme.darkAlgorithm : antTheme.defaultAlgorithm,
          token: { colorPrimary: '#1677ff', borderRadius: 8 }
        }}
      >
        <div className={`theme-${themeMode}`} />
      </ConfigProvider>
    )
  }

  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm: themeMode === 'dark' ? antTheme.darkAlgorithm : antTheme.defaultAlgorithm,
        token: {
          colorPrimary: '#1677ff',
          borderRadius: 8
        }
      }}
    >
      <div className={`theme-${themeMode}`}>
        {isMini ? (
          <MiniAdd />
        ) : currentUser ? (
          <MainApp key={currentUser.id} user={currentUser} onSwitchUser={handleSwitchUser} />
        ) : (
          <UserSelect onLogin={handleLogin} />
        )}
      </div>
    </ConfigProvider>
  )
}
