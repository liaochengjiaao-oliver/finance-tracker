import { useEffect, useState } from 'react'
import { Card, Table, Button, Modal, Form, Input, Radio, Popconfirm, message, Space, Tag } from 'antd'
import {
  PlusOutlined, EditOutlined, DeleteOutlined,
  CloudDownloadOutlined, CloudUploadOutlined
} from '@ant-design/icons'
import { useLocale } from '../i18n'

export default function CategoryManager(): JSX.Element {
  const { t, tc } = useLocale()
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
      message.success(t('category.updated'))
    } else {
      await window.api.createCategory(values)
      message.success(t('category.added'))
    }
    setModal(false)
    loadCategories()
  }

  const handleDelete = async (id: number): Promise<void> => {
    const result = await window.api.deleteCategory(id)
    if (result.success) {
      message.success(t('category.deleted'))
      loadCategories()
    } else {
      message.warning(result.message)
    }
  }

  const expenseCategories = categories.filter((c) => c.type === 'expense')
  const incomeCategories = categories.filter((c) => c.type === 'income')

  const columns = [
    {
      title: t('common.name'),
      dataIndex: 'name',
      render: (name: string, record: Category) => (
        <Space>
          {tc(name)}
          {record.is_default ? <Tag color="blue">{t('category.preset')}</Tag> : null}
        </Space>
      )
    },
    { title: t('common.sort'), dataIndex: 'sort_order', width: 80 },
    {
      title: t('common.operation'),
      width: 120,
      render: (_: unknown, record: Category) => (
        <Space size="small">
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)} />
          <Popconfirm
            title={t('category.confirmDeleteCategory')}
            description={t('category.deleteHint')}
            onConfirm={() => handleDelete(record.id)}
            okText={t('common.delete')}
            cancelText={t('common.cancel')}
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
        <h2>{t('category.title')}</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>{t('category.addCategory')}</Button>
      </div>

      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Card title={t('category.expenseCategory')} size="small">
          <Table
            dataSource={expenseCategories}
            columns={columns}
            rowKey="id"
            pagination={false}
            size="small"
          />
        </Card>

        <Card title={t('category.incomeCategory')} size="small">
          <Table
            dataSource={incomeCategories}
            columns={columns}
            rowKey="id"
            pagination={false}
            size="small"
          />
        </Card>
        <Card title={t('category.dataManage')} size="small">
          <Space>
            <Button
              icon={<CloudDownloadOutlined />}
              onClick={async () => {
                const result = await window.api.backupExport()
                if (result.success) message.success(t('category.backupSuccess'))
              }}
            >
              {t('category.backup')}
            </Button>
            <Popconfirm
              title={t('category.restoreConfirm')}
              okText={t('category.confirmRestore')}
              cancelText={t('common.cancel')}
              okButtonProps={{ danger: true }}
              onConfirm={async () => {
                const result = await window.api.backupImport()
                if (result.success) {
                  message.success(t('category.restoreSuccess'))
                  loadCategories()
                } else if (result.message) {
                  message.error(result.message)
                }
              }}
            >
              <Button icon={<CloudUploadOutlined />} danger>{t('category.restore')}</Button>
            </Popconfirm>
          </Space>
        </Card>
      </Space>

      <Modal
        title={editId ? t('category.editCategory') : t('category.addCategory')}
        open={modal}
        onCancel={() => setModal(false)}
        footer={null}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          {!editId && (
            <Form.Item name="type" label={t('common.type')} rules={[{ required: true }]}>
              <Radio.Group>
                <Radio.Button value="expense">{t('common.expense')}</Radio.Button>
                <Radio.Button value="income">{t('common.income')}</Radio.Button>
              </Radio.Group>
            </Form.Item>
          )}
          <Form.Item name="name" label={t('common.name')} rules={[{ required: true, message: t('category.enterName') }]}>
            <Input placeholder={t('category.categoryName')} maxLength={20} />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" block>
              {editId ? t('category.saveEdit') : t('common.add')}
            </Button>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
