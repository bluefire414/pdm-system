import React, { useEffect, useState } from 'react';
import {
  Table, Button, Modal, Form, Input, message, Popconfirm, Space,
  Card, Row, Col, Input as AntInput, Tag, Breadcrumb,
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, FileExcelOutlined,
  ArrowLeftOutlined, FolderOutlined,
} from '@ant-design/icons';
import client, { downloadReport } from '../api/client';
import { useAuth } from '../context/AuthContext';
import type { Part, PartCategory } from '../types';

const { Search } = AntInput;

const PartsPage: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const canDelete = user?.role === 'ADMIN' || user?.role === 'ENGINEER';

  // 類別層
  const [categories, setCategories] = useState<PartCategory[]>([]);
  const [catLoading, setCatLoading] = useState(false);
  const [catSearch, setCatSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<PartCategory | null>(null);

  // 類別 CRUD modal
  const [catModalVisible, setCatModalVisible] = useState(false);
  const [editingCat, setEditingCat] = useState<PartCategory | null>(null);
  const [catForm] = Form.useForm();

  // 零件層
  const [parts, setParts] = useState<Part[]>([]);
  const [partsLoading, setPartsLoading] = useState(false);
  const [partSearch, setPartSearch] = useState('');

  // 零件 CRUD modal
  const [partModalVisible, setPartModalVisible] = useState(false);
  const [editingPart, setEditingPart] = useState<Part | null>(null);
  const [partForm] = Form.useForm();

  const fetchCategories = async () => {
    setCatLoading(true);
    try {
      const res = await client.get('/part-categories');
      setCategories(res.data);
    } finally {
      setCatLoading(false);
    }
  };

  const fetchParts = async (categoryId: string, keyword?: string) => {
    setPartsLoading(true);
    try {
      const res = await client.get('/parts', {
        params: { categoryId, ...(keyword ? { keyword } : {}) },
      });
      setParts(res.data);
    } finally {
      setPartsLoading(false);
    }
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  const handleSelectCategory = (cat: PartCategory) => {
    setSelectedCategory(cat);
    setPartSearch('');
    fetchParts(cat.id);
  };

  const handleBack = () => {
    setSelectedCategory(null);
    setParts([]);
    setPartSearch('');
    fetchCategories();
  };

  // --- 類別 CRUD ---
  const handleCatSubmit = async (values: any) => {
    try {
      if (editingCat) {
        await client.put(`/part-categories/${editingCat.id}`, values);
        message.success('類別已更新');
      } else {
        await client.post('/part-categories', values);
        message.success('類別已建立');
      }
      setCatModalVisible(false);
      setEditingCat(null);
      catForm.resetFields();
      fetchCategories();
    } catch (error: any) {
      message.error(error.response?.data?.error || '操作失敗');
    }
  };

  const handleCatDelete = async (id: string) => {
    try {
      await client.delete(`/part-categories/${id}`);
      message.success('類別已刪除');
      fetchCategories();
    } catch (error: any) {
      message.error(error.response?.data?.error || '刪除失敗');
    }
  };

  // --- 零件 CRUD ---
  const handlePartSubmit = async (values: any) => {
    try {
      if (editingPart) {
        await client.put(`/parts/${editingPart.id}`, values);
        message.success('更新成功');
      } else {
        await client.post('/parts', { ...values, categoryId: selectedCategory!.id });
        message.success('建立成功');
      }
      setPartModalVisible(false);
      setEditingPart(null);
      partForm.resetFields();
      fetchParts(selectedCategory!.id, partSearch || undefined);
    } catch (error: any) {
      message.error(error.response?.data?.error || '操作失敗');
    }
  };

  const handlePartDelete = async (id: string) => {
    try {
      await client.delete(`/parts/${id}`);
      message.success('刪除成功');
      fetchParts(selectedCategory!.id, partSearch || undefined);
    } catch (error: any) {
      message.error(error.response?.data?.error || '刪除失敗');
    }
  };

  const handlePartSearch = (value: string) => {
    setPartSearch(value);
    fetchParts(selectedCategory!.id, value || undefined);
  };

  const filteredCategories = categories.filter((c) => {
    if (!catSearch) return true;
    const kw = catSearch.toLowerCase();
    return c.code.toLowerCase().includes(kw) || c.name.toLowerCase().includes(kw);
  });

  const partColumns = [
    { title: '料號', dataIndex: 'partNumber', key: 'partNumber' },
    { title: '名稱', dataIndex: 'name', key: 'name' },
    { title: '說明', dataIndex: 'description', key: 'description' },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: Part) => (
        <Space>
          <Button
            type="link"
            icon={<EditOutlined />}
            onClick={() => {
              setEditingPart(record);
              partForm.setFieldsValue(record);
              setPartModalVisible(true);
            }}
          >
            編輯
          </Button>
          {canDelete && (
            <Popconfirm title="確定刪除？" onConfirm={() => handlePartDelete(record.id)}>
              <Button type="link" danger icon={<DeleteOutlined />}>刪除</Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  // ===== 類別卡片首頁 =====
  if (!selectedCategory) {
    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ margin: 0 }}>零部件管理</h2>
          <Space>
            <Search
              placeholder="搜尋類別..."
              allowClear
              style={{ width: 220 }}
              value={catSearch}
              onChange={(e) => setCatSearch(e.target.value)}
            />
            {isAdmin && (
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => { setEditingCat(null); catForm.resetFields(); setCatModalVisible(true); }}
              >
                新增類別
              </Button>
            )}
          </Space>
        </div>

        <Row gutter={[16, 16]} style={{ minHeight: 200 }}>
          {filteredCategories.map((cat) => (
            <Col key={cat.id} xs={24} sm={12} md={8} lg={6}>
              <Card
                hoverable
                onClick={() => handleSelectCategory(cat)}
                style={{ cursor: 'pointer' }}
                actions={isAdmin ? [
                  <EditOutlined
                    key="edit"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingCat(cat);
                      catForm.setFieldsValue(cat);
                      setCatModalVisible(true);
                    }}
                  />,
                  <Popconfirm
                    key="delete"
                    title="確定刪除此類別？"
                    onConfirm={(e) => { e?.stopPropagation(); handleCatDelete(cat.id); }}
                    onCancel={(e) => e?.stopPropagation()}
                  >
                    <DeleteOutlined style={{ color: '#ff4d4f' }} onClick={(e) => e.stopPropagation()} />
                  </Popconfirm>,
                ] : undefined}
              >
                <Card.Meta
                  avatar={<FolderOutlined style={{ fontSize: 28, color: '#1677ff' }} />}
                  title={cat.name}
                  description={
                    <Space direction="vertical" size={2}>
                      <Tag color="blue">{cat.code}</Tag>
                      <span style={{ color: '#888' }}>{cat._count?.parts ?? 0} 個零件</span>
                      {cat.description && <span style={{ color: '#aaa', fontSize: 12 }}>{cat.description}</span>}
                    </Space>
                  }
                />
              </Card>
            </Col>
          ))}
          {filteredCategories.length === 0 && !catLoading && (
            <Col span={24}>
              <div style={{ textAlign: 'center', padding: 48, color: '#aaa' }}>
                {catSearch ? '查無符合類別' : '尚無零部件類別，請新增'}
              </div>
            </Col>
          )}
        </Row>

        {/* 類別 CRUD Modal */}
        <Modal
          title={editingCat ? '編輯類別' : '新增類別'}
          open={catModalVisible}
          onOk={() => catForm.submit()}
          onCancel={() => { setCatModalVisible(false); setEditingCat(null); }}
        >
          <Form form={catForm} onFinish={handleCatSubmit} layout="vertical">
            <Form.Item name="code" label="類別代碼" rules={[{ required: true, pattern: /^[A-Za-z0-9-]+$/, message: '僅允許英文、數字和連字符' }]}>
              <Input disabled={!!editingCat} />
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
  }

  // ===== 零件列表頁（鑽取後）=====
  return (
    <div>
      <Breadcrumb
        style={{ marginBottom: 16 }}
        items={[
          { title: <a onClick={handleBack}>零部件管理</a> },
          { title: selectedCategory.name },
        ]}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={handleBack}>返回</Button>
          <h2 style={{ margin: 0 }}>{selectedCategory.name} <Tag color="blue">{selectedCategory.code}</Tag></h2>
        </Space>
        <Space>
          <Search
            placeholder="搜尋料號或名稱..."
            allowClear
            style={{ width: 220 }}
            onSearch={handlePartSearch}
            onChange={(e) => { if (!e.target.value) handlePartSearch(''); }}
          />
          <Button icon={<FileExcelOutlined />} onClick={() => downloadReport('parts', '零部件清單.xlsx')}>
            匯出 Excel
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => { setEditingPart(null); partForm.resetFields(); setPartModalVisible(true); }}
          >
            新增零件
          </Button>
        </Space>
      </div>

      <Table rowKey="id" columns={partColumns} dataSource={parts} loading={partsLoading} />

      <Modal
        title={editingPart ? '編輯零件' : '新增零件'}
        open={partModalVisible}
        onOk={() => partForm.submit()}
        onCancel={() => { setPartModalVisible(false); setEditingPart(null); }}
      >
        <Form form={partForm} onFinish={handlePartSubmit} layout="vertical">
          <Form.Item name="partNumber" label="料號" rules={[{ required: true, pattern: /^[A-Za-z0-9-]+$/, message: '僅允許英文、數字和連字符' }]}>
            <Input disabled={!!editingPart} />
          </Form.Item>
          <Form.Item name="name" label="名稱" rules={[{ required: true }]}>
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

export default PartsPage;
