import React, { useEffect, useState } from 'react';
import { Table, Button, Modal, Form, Input, message, Popconfirm } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import client from '../api/client';
import type { Series } from '../types';

const SeriesPage: React.FC = () => {
  const [series, setSeries] = useState<Series[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editing, setEditing] = useState<Series | null>(null);
  const [form] = Form.useForm();

  const fetchSeries = async () => {
    setLoading(true);
    try {
      const res = await client.get('/series');
      setSeries(res.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSeries();
  }, []);

  const handleSubmit = async (values: any) => {
    try {
      if (editing) {
        await client.put(`/series/${editing.id}`, values);
        message.success('更新成功');
      } else {
        await client.post('/series', values);
        message.success('建立成功');
      }
      setModalVisible(false);
      setEditing(null);
      form.resetFields();
      fetchSeries();
    } catch (error: any) {
      message.error(error.response?.data?.error || '操作失敗');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await client.delete(`/series/${id}`);
      message.success('刪除成功');
      fetchSeries();
    } catch (error: any) {
      message.error(error.response?.data?.error || '刪除失敗');
    }
  };

  const columns = [
    { title: '系列代碼', dataIndex: 'code', key: 'code' },
    { title: '系列名稱', dataIndex: 'name', key: 'name' },
    { title: '說明', dataIndex: 'description', key: 'description' },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: Series) => (
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
        <h2>產品系列管理</h2>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => {
            setEditing(null);
            form.resetFields();
            setModalVisible(true);
          }}
        >
          新增系列
        </Button>
      </div>
      <Table rowKey="id" columns={columns} dataSource={series} loading={loading} />

      <Modal
        title={editing ? '編輯系列' : '新增系列'}
        open={modalVisible}
        onOk={() => form.submit()}
        onCancel={() => {
          setModalVisible(false);
          setEditing(null);
        }}
      >
        <Form form={form} onFinish={handleSubmit} layout="vertical">
          <Form.Item name="code" label="系列代碼" rules={[{ required: true, pattern: /^[A-Za-z0-9-]+$/, message: '僅允許英文、數字和連字符' }]}>
            <Input disabled={!!editing} />
          </Form.Item>
          <Form.Item name="name" label="系列名稱" rules={[{ required: true }]}>
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

export default SeriesPage;
