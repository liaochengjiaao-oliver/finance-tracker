import { useEffect, useState } from 'react'
import { Form, InputNumber, Select, Input, Button, Radio, message } from 'antd'
import dayjs from 'dayjs'

export default function MiniAdd(): JSX.Element {
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
      message.success('记账成功')
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
        快速记账
      </div>
      <Form form={form} layout="vertical" onFinish={handleSubmit} size="middle">
        <Form.Item label="类型">
          <Radio.Group
            value={type}
            onChange={(e) => {
              setType(e.target.value)
              form.setFieldValue('category_id', undefined)
            }}
            style={{ width: '100%' }}
          >
            <Radio.Button value="expense" style={{ width: '50%', textAlign: 'center' }}>支出</Radio.Button>
            <Radio.Button value="income" style={{ width: '50%', textAlign: 'center' }}>收入</Radio.Button>
          </Radio.Group>
        </Form.Item>

        <Form.Item
          name="amount"
          label="金额"
          rules={[{ required: true, message: '请输入金额' }]}
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
          label="分类"
          rules={[{ required: true, message: '请选择分类' }]}
        >
          <Select placeholder="选择分类">
            {filteredCategories.map((c) => (
              <Select.Option key={c.id} value={c.id}>{c.name}</Select.Option>
            ))}
          </Select>
        </Form.Item>

        <Form.Item name="note" label="备注">
          <Input placeholder="可选" maxLength={200} />
        </Form.Item>

        <Form.Item style={{ marginBottom: 0 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button onClick={handleCancel} style={{ flex: 1 }}>取消</Button>
            <Button type="primary" htmlType="submit" loading={loading} style={{ flex: 1 }}>保存</Button>
          </div>
        </Form.Item>
      </Form>
    </div>
  )
}
