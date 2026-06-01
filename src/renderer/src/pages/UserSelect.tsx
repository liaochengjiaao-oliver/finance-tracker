import { useEffect, useState } from 'react'
import { Button, Card, Input, Modal, message, Popconfirm, Empty } from 'antd'
import { PlusOutlined, DeleteOutlined, EditOutlined, UserOutlined } from '@ant-design/icons'

interface UserProfile {
  id: string
  name: string
  createdAt: string
}

interface Props {
  onLogin: () => void
}

export default function UserSelect({ onLogin }: Props): JSX.Element {
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
      message.warning('请输入用户名')
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
    message.success('已删除')
    loadUsers()
  }

  const handleRename = async (): Promise<void> => {
    const name = renameName.trim()
    if (!name || !renameTarget) {
      message.warning('请输入用户名')
      return
    }
    await window.api.updateUser(renameTarget.id, { name })
    setRenameModalOpen(false)
    setRenameTarget(null)
    setRenameName('')
    message.success('已修改')
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
          <h1>选择用户</h1>
          <p>选择一个用户开始记账，或创建新用户</p>
        </div>

        {users.length === 0 ? (
          <div className="user-select-empty">
            <Empty description="还没有用户，创建一个开始吧" />
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
                      title="确定删除该用户？"
                      description="该用户的所有记账数据将被永久删除"
                      onConfirm={(e) => {
                        e?.stopPropagation()
                        handleDeleteUser(user.id)
                      }}
                      onCancel={(e) => e?.stopPropagation()}
                      okText="删除"
                      cancelText="取消"
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
            新建用户
          </Button>
        </div>
      </div>

      <Modal
        title="新建用户"
        open={createModalOpen}
        onOk={handleCreateUser}
        onCancel={() => { setCreateModalOpen(false); setNewName('') }}
        okText="创建并登录"
        cancelText="取消"
      >
        <Input
          placeholder="输入用户名"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onPressEnter={handleCreateUser}
          maxLength={20}
          autoFocus
          style={{ marginTop: 16 }}
        />
      </Modal>

      <Modal
        title="修改用户名"
        open={renameModalOpen}
        onOk={handleRename}
        onCancel={() => { setRenameModalOpen(false); setRenameTarget(null); setRenameName('') }}
        okText="保存"
        cancelText="取消"
      >
        <Input
          placeholder="输入新用户名"
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
