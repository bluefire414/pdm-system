import React, { useEffect, useState } from 'react';
import { Table, Button, Modal, Form, Input, Select, message, Popconfirm, Space } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, FileExcelOutlined } from '@ant-design/icons';
import client, { downloadReport } from '../api/client';
import type { Part, PartCategory } from '../types';

const PartsPage: React.FC = () => {
  const [parts, setParts] = useState<Part[]>([]);
  const [categoryList, setCategoryList] = useState<PartCategory[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editing, setEditing] = useState<Part | null>(null);
  const [form] = Form.useForm();

  const fetchData = async () => {
    setLoading(true);
    try {
      const [partsRes, categoryRes] = await Promise.all([
        client.get('/parts'),
        client.get('/part-categories'),
      ]);
      setParts(partsRes.data);
      setCategoryList(categoryRes.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSubmit = async (values: any) => {
    try {
      if (editing) {
        await client.put(`/parts/${editing.id}`, values);
        message.success('更新成功');
      } else {
        await client.post('/parts', values);
        message.success('建立成功');
      }
      setModalVisible(false);
      setEditing(null);
      form.resetFields();
      fetchData();
    } catch (error: any) {
      message.error(error.response?.data?.error || '操作失敗');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await client.delete(`/parts/${id}`);
      message.success('刪除成功');
      fetchData();
    } catch (error: any) {
      message.error(error.response?.data?.error || '刪除失敗');
    }
  };

  const columns = [
    { title: '料號', dataIndex: 'partNumber', key: 'partNumber' },
    { title: '名稱', dataIndex: 'name', key: 'name' },
    { title: '類別', key: 'category', render: (_: any, r: Part) => r.category ? `${r.category.code} - ${r.category.name}` : '-' },
    { title: '說明', dataIndex: 'description', key: 'description' },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: Part) => (
        <span>
          <Button
            type="link"
            icon={<EditOutlined />}
            onClick={() => {
              setEditing(record);
              form.setFieldsValue(record);
              setModalVisible(true);
            }}
          >
            編輯
          </Button>
          <Popconfirm title="確定刪除？" onConfirm={() => handleDelete(record.id)}>
            <Button type="link" danger icon={<DeleteOutlined />}>
              刪除
            </Button>
          </Popconfirm>
        </span>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2>零部件管理</h2>
        <Space>
          <Button icon={<FileExcelOutlined />} onClick={() => downloadReport('parts', '零部件清單.xlsx')}>
            匯出 Excel
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              setEditing(null);
              form.resetFields();
              setModalVisible(true);
            }}
          >
            新增零件
          </Button>
        </Space>
      </div>
      <Table rowKey="id" columns={columns} dataSource={parts} loading={loading} />

      <Modal
        title={editing ? '編輯零件' : '新增零件'}
        open={modalVisible}
        onOk={() => form.submit()}
        onCancel={() => {
          setModalVisible(false);
          setEditing(null);
        }}
      >
        <Form form={form} onFinish={handleSubmit} layout="vertical">
          <Form.Item name="partNumber" label="料號" rules={[{ required: true, pattern: /^[A-Za-z0-9-]+$/, message: '僅允許英文、數字和連字符' }]}>
            <Input disabled={!!editing} />
          </Form.Item>
          <Form.Item name="name" label="名稱" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="categoryId" label="所屬類別" rules={[{ required: true }]}>
            <Select options={categoryList.map((c) => ({ value: c.id, label: `${c.code} - ${c.name}` }))} />
          </Form.Item>
          <Form.Item name="description" label="說明">
            <Input.TextArea />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default PartsPage;
