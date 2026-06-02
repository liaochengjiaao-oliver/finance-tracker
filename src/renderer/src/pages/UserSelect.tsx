import { useEffect, useState } from 'react'
import { Button, Card, Input, Modal, message, Popconfirm, Empty } from 'antd'
import { PlusOutlined, DeleteOutlined, EditOutlined, UserOutlined } from '@ant-design/icons'
import { useLocale } from '../i18n'

interface UserProfile {
  id: string
  name: string
  createdAt: string
}

interface Props {
  onLogin: () => void
}

export default function UserSelect({ onLogin }: Props): JSX.Element {
  const { t } = useLocale()
  const [users, setUsers] = useState<UserProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [switching, setSwitching] = useState(false)
  const [renameModalOpen, setRenameModalOpen] = useState(false)
  const [renameTarget, setRenameTarget] = useState<UserProfile | null>(null)
  const [renameName, setRenameName] = useState('')

  const loadUsers = async (): Promise<void> => {
    const list = await window.api.listUsers()
    setUsers(list)
    setLoading(false)
  }

  useEffect(() => {
    loadUsers()
  }, [])

  const handleSelectUser = async (userId: string): Promise<void> => {
    setSwitching(true)
    try {
      await window.api.switchUser(userId)
      onLogin()
    } finally {
      setSwitching(false)
    }
  }

  const handleCreateUser = async (): Promise<void> => {
    const name = newName.trim()
    if (!name) {
      message.warning(t('user.usernameRequired'))
      return
    }
    await window.api.createUser(name)
    setCreateModalOpen(false)
    setNewName('')
    onLogin()
  }

  const handleDeleteUser = async (userId: string): Promise<void> => {
    const result = await window.api.deleteUser(userId)
    if (!result.success) {
      message.error(result.message)
      return
    }
    message.success(t('category.deleted'))
    loadUsers()
  }

  const handleRename = async (): Promise<void> => {
    const name = renameName.trim()
    if (!name || !renameTarget) {
      message.warning(t('user.usernameRequired'))
      return
    }
    await window.api.updateUser(renameTarget.id, { name })
    setRenameModalOpen(false)
    setRenameTarget(null)
    setRenameName('')
    message.success(t('user.renamed'))
    loadUsers()
  }

  const openRenameModal = (user: UserProfile, e: React.MouseEvent): void => {
    e.stopPropagation()
    setRenameTarget(user)
    setRenameName(user.name)
    setRenameModalOpen(true)
  }

  const colors = ['#1677ff', '#52c41a', '#722ed1', '#fa8c16', '#eb2f96', '#13c2c2']
  const getColor = (index: number): string => colors[index % colors.length]

  if (loading) return <div />

  return (
    <div className="user-select-page">
      <div className="user-select-container">
        <div className="user-select-title">
          <h1>{t('user.selectTitle')}</h1>
          <p>{t('user.selectHint')}</p>
        </div>

        {users.length === 0 ? (
          <div className="user-select-empty">
            <Empty description={t('user.noUsers')} />
          </div>
        ) : (
          <div className="user-select-grid">
            {users.map((user, index) => (
              <Card
                key={user.id}
                className="user-card"
                hoverable
                onClick={() => !switching && handleSelectUser(user.id)}
              >
                <div className="user-card-content">
                  <div className="user-avatar" style={{ background: getColor(index) }}>
                    <UserOutlined />
                  </div>
                  <div className="user-name">{user.name}</div>
                </div>
                <div className="user-card-actions">
                  <Button
                    className="user-action-btn"
                    type="text"
                    size="small"
                    icon={<EditOutlined />}
                    onClick={(e) => openRenameModal(user, e)}
                  />
                  {users.length > 1 && (
                    <Popconfirm
                      title={t('user.confirmDelete')}
                      description={t('user.deleteHint')}
                      onConfirm={(e) => {
                        e?.stopPropagation()
                        handleDeleteUser(user.id)
                      }}
                      onCancel={(e) => e?.stopPropagation()}
                      okText={t('common.delete')}
                      cancelText={t('common.cancel')}
                      okButtonProps={{ danger: true }}
                    >
                      <Button
                        className="user-action-btn"
                        type="text"
                        danger
                        size="small"
                        icon={<DeleteOutlined />}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </Popconfirm>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}

        <div className="user-select-actions">
          <Button
            type="dashed"
            icon={<PlusOutlined />}
            size="large"
            onClick={() => setCreateModalOpen(true)}
          >
            {t('user.createUser')}
          </Button>
        </div>
      </div>

      <Modal
        title={t('user.createUser')}
        open={createModalOpen}
        onOk={handleCreateUser}
        onCancel={() => { setCreateModalOpen(false); setNewName('') }}
        okText={t('user.createAndLogin')}
        cancelText={t('common.cancel')}
      >
        <Input
          placeholder={t('user.enterUsername')}
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onPressEnter={handleCreateUser}
          maxLength={20}
          autoFocus
          style={{ marginTop: 16 }}
        />
      </Modal>

      <Modal
        title={t('user.renameUser')}
        open={renameModalOpen}
        onOk={handleRename}
        onCancel={() => { setRenameModalOpen(false); setRenameTarget(null); setRenameName('') }}
        okText={t('common.save')}
        cancelText={t('common.cancel')}
      >
        <Input
          placeholder={t('user.enterNewUsername')}
          value={renameName}
          onChange={(e) => setRenameName(e.target.value)}
          onPressEnter={handleRename}
          maxLength={20}
          autoFocus
          style={{ marginTop: 16 }}
        />
      </Modal>
    </div>
  )
}
