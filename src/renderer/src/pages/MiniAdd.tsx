import { useEffect, useState } from 'react'
import { Form, InputNumber, Select, Input, Button, Radio, message } from 'antd'
import dayjs from 'dayjs'
import { useLocale } from '../i18n'

export default function MiniAdd(): JSX.Element {
  const { t, tc } = useLocale()
  const [form] = Form.useForm()
  const [categories, setCategories] = useState<Category[]>([])
  const [type, setType] = useState<'expense' | 'income'>('expense')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    window.api.getCategories().then(setCategories)
  }, [])

  const filteredCategories = categories.filter((c) => c.type === type)

  const handleSubmit = async (values: {
    amount: number; category_id: number; note?: string
  }): Promise<void> => {
    setLoading(true)
    try {
      await window.api.createTransaction({
        type,
        amount: values.amount,
        category_id: values.category_id,
        date: dayjs().format('YYYY-MM-DD'),
        note: values.note || ''
      })
      message.success(t('add.success'))
      setTimeout(() => window.api.closeMiniWindow(), 500)
    } finally {
      setLoading(false)
    }
  }

  const handleCancel = (): void => {
    window.api.closeMiniWindow()
  }

  return (
    <div style={{ padding: 24 }}>
      <div
        style={{
          fontSize: 16,
          fontWeight: 600,
          marginBottom: 20,
          textAlign: 'center',
          WebkitAppRegion: 'drag' as unknown as string,
          paddingTop: 4
        }}
      >
        {t('mini.title')}
      </div>
      <Form form={form} layout="vertical" onFinish={handleSubmit} size="middle">
        <Form.Item label={t('common.type')}>
          <Radio.Group
            value={type}
            onChange={(e) => {
              setType(e.target.value)
              form.setFieldValue('category_id', undefined)
            }}
            style={{ width: '100%' }}
          >
            <Radio.Button value="expense" style={{ width: '50%', textAlign: 'center' }}>{t('common.expense')}</Radio.Button>
            <Radio.Button value="income" style={{ width: '50%', textAlign: 'center' }}>{t('common.income')}</Radio.Button>
          </Radio.Group>
        </Form.Item>

        <Form.Item
          name="amount"
          label={t('common.amount')}
          rules={[{ required: true, message: t('common.enterAmount') }]}
        >
          <InputNumber
            prefix="¥"
            min={0.01}
            step={0.01}
            precision={2}
            style={{ width: '100%' }}
            size="large"
            placeholder="0.00"
            autoFocus
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

        <Form.Item name="note" label={t('common.note')}>
          <Input placeholder={t('common.optional')} maxLength={200} />
        </Form.Item>

        <Form.Item style={{ marginBottom: 0 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button onClick={handleCancel} style={{ flex: 1 }}>{t('common.cancel')}</Button>
            <Button type="primary" htmlType="submit" loading={loading} style={{ flex: 1 }}>{t('common.save')}</Button>
          </div>
        </Form.Item>
      </Form>
    </div>
  )
}
