import React, { useEffect, useState } from 'react';
import {
  Table, Button, Modal, Form, Input, message, Popconfirm, Tabs, Select, Space,
  Card, Row, Col, Input as AntInput, Tag, Breadcrumb,
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, LinkOutlined, FileExcelOutlined,
  ArrowLeftOutlined, AppstoreOutlined,
} from '@ant-design/icons';
import client, { downloadReport } from '../api/client';
import { useAuth } from '../context/AuthContext';
import type { Product, Part, Series } from '../types';

const { Search } = AntInput;

interface BOMItem {
  id: string;
  partId: string;
  quantity: number;
  part: Part;
}

const ProductsPage: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const canDelete = user?.role === 'ADMIN' || user?.role === 'ENGINEER';

  // 系列層
  const [seriesList, setSeriesList] = useState<Series[]>([]);
  const [seriesLoading, setSeriesLoading] = useState(false);
  const [seriesSearch, setSeriesSearch] = useState('');
  const [selectedSeries, setSelectedSeries] = useState<Series | null>(null);

  // 系列 CRUD modal
  const [seriesModalVisible, setSeriesModalVisible] = useState(false);
  const [editingSeries, setEditingSeries] = useState<Series | null>(null);
  const [seriesForm] = Form.useForm();

  // 成品層
  const [products, setProducts] = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [productPage, setProductPage] = useState(1);
  const [productPageSize, setProductPageSize] = useState(50);
  const [productTotal, setProductTotal] = useState(0);
  const [allParts, setAllParts] = useState<Part[]>([]);

  // 成品 CRUD modal
  const [productModalVisible, setProductModalVisible] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [productForm] = Form.useForm();

  // BOM modal
  const [bomModalVisible, setBomModalVisible] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [boms, setBoms] = useState<BOMItem[]>([]);
  const [bomForm] = Form.useForm();

  const fetchSeries = async () => {
    setSeriesLoading(true);
    try {
      const res = await client.get('/series');
      setSeriesList(res.data);
    } finally {
      setSeriesLoading(false);
    }
  };

  const fetchProducts = async (seriesId: string, keyword?: string, page = 1, pageSize = 50) => {
    setProductsLoading(true);
    try {
      const res = await client.get('/products', {
        params: { seriesId, page, pageSize, ...(keyword ? { keyword } : {}) },
      });
      setProducts(res.data.data);
      setProductTotal(res.data.total);
      setProductPage(res.data.page);
    } finally {
      setProductsLoading(false);
    }
  };

  useEffect(() => {
    fetchSeries();
    client.get('/parts', { params: { pageSize: 200 } }).then((r) => setAllParts(r.data.data));
  }, []);

  const handleSelectSeries = (s: Series) => {
    setSelectedSeries(s);
    setProductSearch('');
    fetchProducts(s.id);
  };

  const handleBack = () => {
    setSelectedSeries(null);
    setProducts([]);
    setProductSearch('');
    fetchSeries();
  };

  // --- 系列 CRUD ---
  const handleSeriesSubmit = async (values: any) => {
    try {
      if (editingSeries) {
        await client.put(`/series/${editingSeries.id}`, values);
        message.success('系列已更新');
      } else {
        await client.post('/series', values);
        message.success('系列已建立');
      }
      setSeriesModalVisible(false);
      setEditingSeries(null);
      seriesForm.resetFields();
      fetchSeries();
    } catch (error: any) {
      message.error(error.response?.data?.error || '操作失敗');
    }
  };

  const handleSeriesDelete = async (id: string) => {
    try {
      await client.delete(`/series/${id}`);
      message.success('系列已刪除');
      fetchSeries();
    } catch (error: any) {
      message.error(error.response?.data?.error || '刪除失敗');
    }
  };

  // --- 成品 CRUD ---
  const handleProductSubmit = async (values: any) => {
    try {
      if (editingProduct) {
        await client.put(`/products/${editingProduct.id}`, values);
        message.success('更新成功');
      } else {
        await client.post('/products', { ...values, seriesId: selectedSeries!.id });
        message.success('建立成功');
      }
      setProductModalVisible(false);
      setEditingProduct(null);
      productForm.resetFields();
      fetchProducts(selectedSeries!.id, productSearch || undefined);
    } catch (error: any) {
      message.error(error.response?.data?.error || '操作失敗');
    }
  };

  const handleProductDelete = async (id: string) => {
    try {
      await client.delete(`/products/${id}`);
      message.success('刪除成功');
      fetchProducts(selectedSeries!.id, productSearch || undefined);
    } catch (error: any) {
      message.error(error.response?.data?.error || '刪除失敗');
    }
  };

  const handleProductSearch = (value: string) => {
    setProductSearch(value);
    setProductPage(1);
    fetchProducts(selectedSeries!.id, value || undefined, 1, productPageSize);
  };

  // --- BOM ---
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

  const filteredSeries = seriesList.filter((s) => {
    if (!seriesSearch) return true;
    const kw = seriesSearch.toLowerCase();
    return s.code.toLowerCase().includes(kw) || s.name.toLowerCase().includes(kw);
  });

  const productColumns = [
    { title: '成品編碼', dataIndex: 'productCode', key: 'productCode' },
    { title: '名稱', dataIndex: 'name', key: 'name' },
    { title: '說明', dataIndex: 'description', key: 'description' },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: Product) => (
        <Space>
          <Button type="link" icon={<LinkOutlined />} onClick={() => openBOM(record)}>BOM</Button>
          <Button
            type="link"
            icon={<EditOutlined />}
            onClick={() => {
              setEditingProduct(record);
              productForm.setFieldsValue(record);
              setProductModalVisible(true);
            }}
          >
            編輯
          </Button>
          {canDelete && (
            <Popconfirm title="確定刪除？" onConfirm={() => handleProductDelete(record.id)}>
              <Button type="link" danger icon={<DeleteOutlined />}>刪除</Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  // ===== 系列卡片首頁 =====
  if (!selectedSeries) {
    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ margin: 0 }}>成品管理</h2>
          <Space>
            <Search
              placeholder="搜尋系列..."
              allowClear
              style={{ width: 220 }}
              value={seriesSearch}
              onChange={(e) => setSeriesSearch(e.target.value)}
            />
            {isAdmin && (
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => { setEditingSeries(null); seriesForm.resetFields(); setSeriesModalVisible(true); }}
              >
                新增系列
              </Button>
            )}
          </Space>
        </div>

        <Row gutter={[16, 16]} style={{ minHeight: 200 }}>
          {filteredSeries.map((s) => (
            <Col key={s.id} xs={24} sm={12} md={8} lg={6}>
              <Card
                hoverable
                onClick={() => handleSelectSeries(s)}
                style={{ cursor: 'pointer' }}
                actions={isAdmin ? [
                  <EditOutlined
                    key="edit"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingSeries(s);
                      seriesForm.setFieldsValue(s);
                      setSeriesModalVisible(true);
                    }}
                  />,
                  <Popconfirm
                    key="delete"
                    title="確定刪除此系列？"
                    onConfirm={(e) => { e?.stopPropagation(); handleSeriesDelete(s.id); }}
                    onCancel={(e) => e?.stopPropagation()}
                  >
                    <DeleteOutlined style={{ color: '#ff4d4f' }} onClick={(e) => e.stopPropagation()} />
                  </Popconfirm>,
                ] : undefined}
              >
                <Card.Meta
                  avatar={<AppstoreOutlined style={{ fontSize: 28, color: '#52c41a' }} />}
                  title={s.name}
                  description={
                    <Space direction="vertical" size={2}>
                      <Tag color="green">{s.code}</Tag>
                      <span style={{ color: '#888' }}>{s._count?.products ?? 0} 個成品</span>
                      {s.description && <span style={{ color: '#aaa', fontSize: 12 }}>{s.description}</span>}
                    </Space>
                  }
                />
              </Card>
            </Col>
          ))}
          {filteredSeries.length === 0 && !seriesLoading && (
            <Col span={24}>
              <div style={{ textAlign: 'center', padding: 48, color: '#aaa' }}>
                {seriesSearch ? '查無符合系列' : '尚無成品系列，請新增'}
              </div>
            </Col>
          )}
        </Row>

        <Modal
          title={editingSeries ? '編輯系列' : '新增系列'}
          open={seriesModalVisible}
          onOk={() => seriesForm.submit()}
          onCancel={() => { setSeriesModalVisible(false); setEditingSeries(null); }}
        >
          <Form form={seriesForm} onFinish={handleSeriesSubmit} layout="vertical">
            <Form.Item name="code" label="系列代碼" rules={[{ required: true, pattern: /^[A-Za-z0-9-]+$/, message: '僅允許英文、數字和連字符' }]}>
              <Input disabled={!!editingSeries} />
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
  }

  // ===== 成品列表頁（鑽取後）=====
  return (
    <div>
      <Breadcrumb
        style={{ marginBottom: 16 }}
        items={[
          { title: <a onClick={handleBack}>成品管理</a> },
          { title: selectedSeries.name },
        ]}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={handleBack}>返回</Button>
          <h2 style={{ margin: 0 }}>{selectedSeries.name} <Tag color="green">{selectedSeries.code}</Tag></h2>
        </Space>
        <Space>
          <Search
            placeholder="搜尋成品編碼或名稱..."
            allowClear
            style={{ width: 220 }}
            onSearch={handleProductSearch}
            onChange={(e) => { if (!e.target.value) handleProductSearch(''); }}
          />
          <Button icon={<FileExcelOutlined />} onClick={() => downloadReport('products', '成品清單.xlsx')}>
            匯出 Excel
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => { setEditingProduct(null); productForm.resetFields(); setProductModalVisible(true); }}
          >
            新增成品
          </Button>
        </Space>
      </div>

      <Table
        rowKey="id"
        columns={productColumns}
        dataSource={products}
        loading={productsLoading}
        pagination={{
          current: productPage,
          pageSize: productPageSize,
          total: productTotal,
          showSizeChanger: true,
          showTotal: (t) => `共 ${t} 筆`,
          onChange: (p, ps) => {
            setProductPage(p);
            setProductPageSize(ps);
            fetchProducts(selectedSeries!.id, productSearch || undefined, p, ps);
          },
        }}
      />

      {/* 成品 CRUD Modal */}
      <Modal
        title={editingProduct ? '編輯成品' : '新增成品'}
        open={productModalVisible}
        onOk={() => productForm.submit()}
        onCancel={() => { setProductModalVisible(false); setEditingProduct(null); }}
      >
        <Form form={productForm} onFinish={handleProductSubmit} layout="vertical">
          <Form.Item name="productCode" label="成品編碼" rules={[{ required: true }]}>
            <Input disabled={!!editingProduct} />
          </Form.Item>
          <Form.Item name="name" label="名稱" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="description" label="說明">
            <Input.TextArea />
          </Form.Item>
        </Form>
      </Modal>

      {/* BOM Modal */}
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
                      options={allParts
                        .filter((p) => !boms.find((b) => b.partId === p.id))
                        .map((p) => ({ value: p.id, label: `${p.partNumber} - ${p.name}` }))}
                    />
                  </Form.Item>
                  <Form.Item name="quantity" label="數量" rules={[{ required: true }]} initialValue={1}>
                    <Input type="number" min={1} />
                  </Form.Item>
                  <Button type="primary" htmlType="submit">新增</Button>
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
