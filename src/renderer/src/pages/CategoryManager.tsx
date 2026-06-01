import { useEffect, useState } from 'react'
import { Card, Table, Button, Modal, Form, Input, Radio, Popconfirm, message, Space, Tag } from 'antd'
import {
  PlusOutlined, EditOutlined, DeleteOutlined,
  CloudDownloadOutlined, CloudUploadOutlined
} from '@ant-design/icons'

export default function CategoryManager(): JSX.Element {
  const [categories, setCategories] = useState<Category[]>([])
  const [modal, setModal] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [form] = Form.useForm()

  const loadCategories = async (): Promise<void> => {
    const list = await window.api.getCategories()
    setCategories(list)
  }

  useEffect(() => { loadCategories() }, [])

  const handleAdd = (): void => {
    setEditId(null)
    form.resetFields()
    form.setFieldsValue({ type: 'expense' })
    setModal(true)
  }

  const handleEdit = (record: Category): void => {
    setEditId(record.id)
    form.setFieldsValue({ name: record.name, type: record.type })
    setModal(true)
  }

  const handleSubmit = async (values: { name: string; type: string }): Promise<void> => {
    if (editId) {
      await window.api.updateCategory(editId, { name: values.name })
      message.success('已更新')
    } else {
      await window.api.createCategory(values)
      message.success('已添加')
    }
    setModal(false)
    loadCategories()
  }

  const handleDelete = async (id: number): Promise<void> => {
    const result = await window.api.deleteCategory(id)
    if (result.success) {
      message.success('已删除')
      loadCategories()
    } else {
      message.warning(result.message)
    }
  }

  const expenseCategories = categories.filter((c) => c.type === 'expense')
  const incomeCategories = categories.filter((c) => c.type === 'income')

  const columns = [
    {
      title: '名称',
      dataIndex: 'name',
      render: (name: string, record: Category) => (
        <Space>
          {name}
          {record.is_default ? <Tag color="blue">预设</Tag> : null}
        </Space>
      )
    },
    { title: '排序', dataIndex: 'sort_order', width: 80 },
    {
      title: '操作',
      width: 120,
      render: (_: unknown, record: Category) => (
        <Space size="small">
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)} />
          <Popconfirm
            title="确认删除此分类？"
            description="已有记录的分类无法删除"
            onConfirm={() => handleDelete(record.id)}
            okText="删除"
            cancelText="取消"
          >
            <Button type="link" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      )
    }
  ]

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>分类管理</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>添加分类</Button>
      </div>

      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Card title="支出分类" size="small">
          <Table
            dataSource={expenseCategories}
            columns={columns}
            rowKey="id"
            pagination={false}
            size="small"
          />
        </Card>

        <Card title="收入分类" size="small">
          <Table
            dataSource={incomeCategories}
            columns={columns}
            rowKey="id"
            pagination={false}
            size="small"
          />
        </Card>
        <Card title="数据管理" size="small">
          <Space>
            <Button
              icon={<CloudDownloadOutlined />}
              onClick={async () => {
                const result = await window.api.backupExport()
                if (result.success) message.success('备份成功')
              }}
            >
              备份数据
            </Button>
            <Popconfirm
              title="恢复数据将覆盖当前所有数据，确认继续？"
              okText="确认恢复"
              cancelText="取消"
              okButtonProps={{ danger: true }}
              onConfirm={async () => {
                const result = await window.api.backupImport()
                if (result.success) {
                  message.success('恢复成功，数据已更新')
                  loadCategories()
                } else if (result.message) {
                  message.error(result.message)
                }
              }}
            >
              <Button icon={<CloudUploadOutlined />} danger>恢复数据</Button>
            </Popconfirm>
          </Space>
        </Card>
      </Space>

      <Modal
        title={editId ? '编辑分类' : '添加分类'}
        open={modal}
        onCancel={() => setModal(false)}
        footer={null}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          {!editId && (
            <Form.Item name="type" label="类型" rules={[{ required: true }]}>
              <Radio.Group>
                <Radio.Button value="expense">支出</Radio.Button>
                <Radio.Button value="income">收入</Radio.Button>
              </Radio.Group>
            </Form.Item>
          )}
          <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入分类名称' }]}>
            <Input placeholder="分类名称" maxLength={20} />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" block>
              {editId ? '保存修改' : '添加'}
            </Button>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
