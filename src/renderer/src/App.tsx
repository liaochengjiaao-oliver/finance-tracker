import { useEffect, useState, useCallback, useMemo, useContext } from 'react'
import {
  PieChartOutlined,
  PlusCircleOutlined,
  UnorderedListOutlined,
  BarChartOutlined,
  AppstoreOutlined,
  ImportOutlined,
  CalendarOutlined,
  FundOutlined,
  SwapOutlined,
  UserOutlined,
  GlobalOutlined
} from '@ant-design/icons'
import { Menu, ConfigProvider, theme as antTheme } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import enUS from 'antd/locale/en_US'
import { useAppStore } from './store'
import { LocaleContext, createT, createTc, type Locale } from './i18n'
import Dashboard from './pages/Dashboard'
import AddTransaction from './pages/AddTransaction'
import TransactionList from './pages/TransactionList'
import Statistics from './pages/Statistics'
import CategoryManager from './pages/CategoryManager'
import ImportTransaction from './pages/ImportTransaction'
import AnnualReport from './pages/AnnualReport'
import Investment from './pages/Investment'
import UserSelect from './pages/UserSelect'
import MiniAdd from './pages/MiniAdd'

const pageComponents: { key: string; component: JSX.Element }[] = [
  { key: 'dashboard', component: <Dashboard /> },
  { key: 'add', component: <AddTransaction /> },
  { key: 'import', component: <ImportTransaction /> },
  { key: 'list', component: <TransactionList /> },
  { key: 'stats', component: <Statistics /> },
  { key: 'annual', component: <AnnualReport /> },
  { key: 'investment', component: <Investment /> },
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
  const { t, locale, changeLocale } = useContext(LocaleContext)

  const menuItems = useMemo(() => [
    { key: 'dashboard', icon: <PieChartOutlined />, label: t('nav.dashboard') },
    { key: 'add', icon: <PlusCircleOutlined />, label: t('nav.add') },
    { key: 'import', icon: <ImportOutlined />, label: t('nav.import') },
    { key: 'list', icon: <UnorderedListOutlined />, label: t('nav.list') },
    { key: 'stats', icon: <BarChartOutlined />, label: t('nav.stats') },
    { key: 'annual', icon: <CalendarOutlined />, label: t('nav.annual') },
    { key: 'investment', icon: <FundOutlined />, label: t('nav.investment') },
    { key: 'categories', icon: <AppstoreOutlined />, label: t('nav.categories') }
  ], [t])

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
            onClick={({ key }) => setPage(key as any)}
          />
        </div>
        <div className="sidebar-user">
          <div className="sidebar-user-info">
            <div className="sidebar-user-avatar" style={{ background: avatarColor }}>
              <UserOutlined />
            </div>
            <span className="sidebar-user-name">{user.name}</span>
          </div>
          <button
            className="sidebar-lang-btn"
            onClick={() => changeLocale(locale === 'zh' ? 'en' : 'zh')}
            title={locale === 'zh' ? 'Switch to English' : '切换为中文'}
          >
            <GlobalOutlined />
            <span className="sidebar-lang-label">{locale === 'zh' ? 'EN' : '中'}</span>
          </button>
          <button className="sidebar-switch-btn" onClick={onSwitchUser} title={t('nav.switchUser')}>
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
  const [locale, setLocale] = useState<Locale>('zh')

  useEffect(() => {
    window.api.getLocale().then((l) => setLocale((l === 'en' ? 'en' : 'zh') as Locale))
  }, [])

  const t = useMemo(() => createT(locale), [locale])
  const tc = useMemo(() => createTc(locale), [locale])

  const changeLocale = useCallback(async (l: Locale) => {
    setLocale(l)
    await window.api.setLocale(l)
  }, [])

  const localeContextValue = useMemo(() => ({ locale, t, tc, changeLocale }), [locale, t, tc, changeLocale])

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

  const antLocale = locale === 'en' ? enUS : zhCN

  // Loading state
  if (!isMini && currentUser === undefined) {
    return (
      <ConfigProvider
        locale={antLocale}
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
    <LocaleContext.Provider value={localeContextValue}>
      <ConfigProvider
        locale={antLocale}
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
    </LocaleContext.Provider>
  )
}
