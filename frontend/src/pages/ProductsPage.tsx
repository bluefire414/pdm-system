import React, { useEffect, useState } from 'react';
import { Table, Button, Modal, Form, Input, message, Popconfirm, Tabs, Select, Space } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, LinkOutlined, FileExcelOutlined } from '@ant-design/icons';
import client, { downloadReport } from '../api/client';
import { useAuth } from '../context/AuthContext';
import type { Product, Part, Series } from '../types';

interface BOMItem {
  id: string;
  partId: string;
  quantity: number;
  part: Part;
}

const ProductsPage: React.FC = () => {
  const { user } = useAuth();
  const canDelete = user?.role === 'ADMIN' || user?.role === 'ENGINEER';
  const [products, setProducts] = useState<Product[]>([]);
  const [parts, setParts] = useState<Part[]>([]);
  const [seriesList, setSeriesList] = useState<Series[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [bomModalVisible, setBomModalVisible] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [boms, setBoms] = useState<BOMItem[]>([]);
  const [form] = Form.useForm();
  const [bomForm] = Form.useForm();

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const [productsRes, partsRes, seriesRes] = await Promise.all([
        client.get('/products'),
        client.get('/parts'),
        client.get('/series'),
      ]);
      setProducts(productsRes.data);
      setParts(partsRes.data);
      setSeriesList(seriesRes.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  const handleSubmit = async (values: any) => {
    try {
      if (editing) {
        await client.put(`/products/${editing.id}`, values);
        message.success('更新成功');
      } else {
        await client.post('/products', values);
        message.success('建立成功');
      }
      setModalVisible(false);
      setEditing(null);
      form.resetFields();
      fetchProducts();
    } catch (error: any) {
      message.error(error.response?.data?.error || '操作失敗');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await client.delete(`/products/${id}`);
      message.success('刪除成功');
      fetchProducts();
    } catch (error: any) {
      message.error(error.response?.data?.error || '刪除失敗');
    }
  };

  const openBOM = async (product: Product) => {
    setSelectedProduct(product);
    const res = await client.get(`/products/${product.id}/boms`);
    setBoms(res.data);
    setBomModalVisible(true);
  };

  const addBOM = async (values: any) => {
    try {
      await client.post(`/products/${selectedProduct!.id}/boms`, values);
      message.success('已新增至 BOM');
      bomForm.resetFields();
      const res = await client.get(`/products/${selectedProduct!.id}/boms`);
      setBoms(res.data);
    } catch (error: any) {
      message.error(error.response?.data?.error || '新增失敗');
    }
  };

  const removeBOM = async (partId: string) => {
    try {
      await client.delete(`/products/${selectedProduct!.id}/boms/${partId}`);
      message.success('已移除');
      const res = await client.get(`/products/${selectedProduct!.id}/boms`);
      setBoms(res.data);
    } catch (error: any) {
      message.error(error.response?.data?.error || '移除失敗');
    }
  };

  const columns = [
    { title: '成品編碼', dataIndex: 'productCode', key: 'productCode' },
    { title: '名稱', dataIndex: 'name', key: 'name' },
    { title: '所屬系列', key: 'series', render: (_: any, r: Product) => r.series ? `${r.series.code} - ${r.series.name}` : '-' },
    { title: '說明', dataIndex: 'description', key: 'description' },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: Product) => (
        <span>
          <Button type="link" icon={<LinkOutlined />} onClick={() => openBOM(record)}>
            BOM
          </Button>
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
          {canDelete && (
            <Popconfirm title="確定刪除？" onConfirm={() => handleDelete(record.id)}>
              <Button type="link" danger icon={<DeleteOutlined />}>
                刪除
              </Button>
            </Popconfirm>
          )}
        </span>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2>成品管理</h2>
        <Space>
          <Button icon={<FileExcelOutlined />} onClick={() => downloadReport('products', '成品清單.xlsx')}>
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
            新增成品
          </Button>
        </Space>
      </div>
      <Table rowKey="id" columns={columns} dataSource={products} loading={loading} />

      <Modal
        title={editing ? '編輯成品' : '新增成品'}
        open={modalVisible}
        onOk={() => form.submit()}
        onCancel={() => {
          setModalVisible(false);
          setEditing(null);
        }}
      >
        <Form form={form} onFinish={handleSubmit} layout="vertical">
          <Form.Item name="productCode" label="成品編碼" rules={[{ required: true }]}>
            <Input disabled={!!editing} />
          </Form.Item>
          <Form.Item name="name" label="名稱" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="seriesId" label="所屬系列" rules={[{ required: true }]}>
            <Select options={seriesList.map((s) => ({ value: s.id, label: `${s.code} - ${s.name}` }))} />
          </Form.Item>
          <Form.Item name="description" label="說明">
            <Input.TextArea />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={`${selectedProduct?.productCode} - BOM 管理`}
        open={bomModalVisible}
        onCancel={() => setBomModalVisible(false)}
        footer={null}
        width={700}
      >
        <Tabs
          items={[
            {
              key: 'list',
              label: 'BOM 清單',
              children: (
                <Table
                  rowKey="id"
                  dataSource={boms}
                  columns={[
                    { title: '料號', render: (_: any, r: BOMItem) => r.part.partNumber },
                    { title: '名稱', render: (_: any, r: BOMItem) => r.part.name },
                    { title: '數量', dataIndex: 'quantity' },
                    ...(canDelete ? [{
                      title: '操作',
                      render: (_: any, r: BOMItem) => (
                        <Popconfirm title="移除？" onConfirm={() => removeBOM(r.partId)}>
                          <Button type="link" danger>移除</Button>
                        </Popconfirm>
                      ),
                    }] : []),
                  ]}
                />
              ),
            },
            ...(canDelete ? [{
              key: 'add',
              label: '新增零件',
              children: (
                <Form form={bomForm} onFinish={addBOM} layout="vertical">
                  <Form.Item name="partId" label="選擇零件" rules={[{ required: true }]}>
                    <Select
                      showSearch
                      options={parts
                        .filter((p) => !boms.find((b) => b.partId === p.id))
                        .map((p) => ({
                          value: p.id,
                          label: `${p.partNumber} - ${p.name}`,
                        }))}
                    />
                  </Form.Item>
                  <Form.Item name="quantity" label="數量" rules={[{ required: true }]} initialValue={1}>
                    <Input type="number" min={1} />
                  </Form.Item>
                  <Button type="primary" htmlType="submit">
                    新增
                  </Button>
                </Form>
              ),
            }] : []),
          ]}
        />
      </Modal>
    </div>
  );
};

export default ProductsPage;
