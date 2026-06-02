import { useEffect, useState } from 'react'
import { Form, InputNumber, Select, DatePicker, Input, Button, Radio, message, Card, Space } from 'antd'
import dayjs from 'dayjs'
import { useLocale } from '../i18n'

export default function AddTransaction(): JSX.Element {
  const { t, tc } = useLocale()
  const [form] = Form.useForm()
  const [categories, setCategories] = useState<Category[]>([])
  const [type, setType] = useState<'expense' | 'income'>('expense')
  const [currency, setCurrency] = useState<'CNY' | 'USD'>('CNY')
  const [loading, setLoading] = useState(false)

  const loadCategories = async (): Promise<void> => {
    const list = await window.api.getCategories()
    setCategories(list)
  }

  useEffect(() => { loadCategories() }, [])

  const filteredCategories = categories.filter((c) => c.type === type)

  const handleTypeChange = (newType: 'expense' | 'income'): void => {
    setType(newType)
    form.setFieldValue('category_id', undefined)
  }

  const handleSubmit = async (values: {
    amount: number; category_id: number; date: dayjs.Dayjs; note?: string
  }): Promise<void> => {
    setLoading(true)
    try {
      await window.api.createTransaction({
        type,
        amount: values.amount,
        currency,
        category_id: values.category_id,
        date: values.date.format('YYYY-MM-DD'),
        note: values.note || ''
      })
      message.success(t('add.success'))
      form.resetFields()
      form.setFieldValue('date', dayjs())
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <div className="page-header"><h2>{t('add.title')}</h2></div>
      <Card style={{ maxWidth: 500 }}>
        <Form
          form={form}
          layout="vertical"
          initialValues={{ date: dayjs() }}
          onFinish={handleSubmit}
        >
          <Form.Item label={t('common.type')}>
            <Space>
              <Radio.Group value={type} onChange={(e) => handleTypeChange(e.target.value)}>
                <Radio.Button value="expense" style={{ width: 80, textAlign: 'center' }}>{t('common.expense')}</Radio.Button>
                <Radio.Button value="income" style={{ width: 80, textAlign: 'center' }}>{t('common.income')}</Radio.Button>
              </Radio.Group>
              <Select value={currency} onChange={setCurrency} style={{ width: 90 }}>
                <Select.Option value="CNY">¥ CNY</Select.Option>
                <Select.Option value="USD">$ USD</Select.Option>
              </Select>
            </Space>
          </Form.Item>

          <Form.Item
            name="amount"
            label={t('common.amount')}
            rules={[{ required: true, message: t('common.enterAmount') }]}
          >
            <InputNumber
              prefix={currency === 'USD' ? '$' : '¥'}
              min={0.01}
              step={0.01}
              precision={2}
              style={{ width: '100%' }}
              size="large"
              placeholder="0.00"
            />
          </Form.Item>

          <Form.Item
            name="category_id"
            label={t('common.category')}
            rules={[{ required: true, message: t('add.selectCategory') }]}
          >
            <Select placeholder={t('common.selectCategory')}>
              {filteredCategories.map((c) => (
                <Select.Option key={c.id} value={c.id}>{tc(c.name)}</Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            name="date"
            label={t('common.date')}
            rules={[{ required: true, message: t('common.selectDate') }]}
          >
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item name="note" label={t('common.note')}>
            <Input.TextArea rows={2} placeholder={t('common.optional')} maxLength={200} showCount />
          </Form.Item>

          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loading} block size="large">
              {t('common.save')}
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  )
}
