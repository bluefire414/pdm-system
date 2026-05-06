import React, { useEffect, useState } from 'react';
import { Table, Button, Modal, Form, Input, message, Popconfirm } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import client from '../api/client';
import type { PartCategory } from '../types';

const PartCategoriesPage: React.FC = () => {
  const [categories, setCategories] = useState<PartCategory[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editing, setEditing] = useState<PartCategory | null>(null);
  const [form] = Form.useForm();

  const fetchCategories = async () => {
    setLoading(true);
    try {
      const res = await client.get('/part-categories');
      setCategories(res.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  const handleSubmit = async (values: any) => {
    try {
      if (editing) {
        await client.put(`/part-categories/${editing.id}`, values);
        message.success('更新成功');
      } else {
        await client.post('/part-categories', values);
        message.success('建立成功');
      }
      setModalVisible(false);
      setEditing(null);
      form.resetFields();
      fetchCategories();
    } catch (error: any) {
      message.error(error.response?.data?.error || '操作失敗');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await client.delete(`/part-categories/${id}`);
      message.success('刪除成功');
      fetchCategories();
    } catch (error: any) {
      message.error(error.response?.data?.error || '刪除失敗');
    }
  };

  const columns = [
    { title: '類別代碼', dataIndex: 'code', key: 'code' },
    { title: '類別名稱', dataIndex: 'name', key: 'name' },
    { title: '說明', dataIndex: 'description', key: 'description' },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: PartCategory) => (
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
        <h2>零部件類別管理</h2>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => {
            setEditing(null);
            form.resetFields();
            setModalVisible(true);
          }}
        >
          新增類別
        </Button>
      </div>
      <Table rowKey="id" columns={columns} dataSource={categories} loading={loading} />

      <Modal
        title={editing ? '編輯類別' : '新增類別'}
        open={modalVisible}
        onOk={() => form.submit()}
        onCancel={() => {
          setModalVisible(false);
          setEditing(null);
        }}
      >
        <Form form={form} onFinish={handleSubmit} layout="vertical">
          <Form.Item name="code" label="類別代碼" rules={[{ required: true, pattern: /^[A-Za-z0-9-]+$/, message: '僅允許英文、數字和連字符' }]}>
            <Input disabled={!!editing} />
          </Form.Item>
          <Form.Item name="name" label="類別名稱" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="description" label="說明">
            <Input.TextArea />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default PartCategoriesPage;
