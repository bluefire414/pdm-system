import React, { useEffect, useState } from 'react';
import {
  Table, Button, Modal, Form, Select, Input, message, Popconfirm, Tag, Upload,
  Descriptions, Empty, Card, Space, Divider, Row, Col, Input as AntInput, Breadcrumb,
} from 'antd';
import {
  PlusOutlined, EyeOutlined, DownloadOutlined, SendOutlined, CheckOutlined,
  StopOutlined, UploadOutlined, FileExcelOutlined, FileOutlined, ArrowLeftOutlined,
  EditOutlined, DeleteOutlined, LinkOutlined, InboxOutlined,
} from '@ant-design/icons';
import type { UploadFile } from 'antd/es/upload/interface';
import client, { downloadReport } from '../api/client';
import { useAuth } from '../context/AuthContext';
import type { DocumentCategory } from '../types';

const { Search } = AntInput;

interface DocumentItem {
  id: string;
  documentType: string;
  status: string;
  version: number;
  remark: string | null;
  createdAt: string;
  categoryId: string | null;
  category: { id: string; name: string } | null;
  createdBy: { name: string };
  part: { partNumber: string; name: string } | null;
  product: { productCode: string; name: string } | null;
  files: DocumentFile[];
}

interface DocumentFile {
  id: string;
  fileType: string;
  fileName: string;
  originalName: string;
  fileSize: number;
  mimeType: string;
}

interface PartOption { id: string; partNumber: string; name: string; }
interface ProductOption { id: string; productCode: string; name: string; }

const DOCUMENT_TYPES = [
  { value: 'PART_DRAWING', label: '零部件圖紙' },
  { value: 'PRODUCT_DRAWING', label: '成品圖紙' },
  { value: 'SPEC', label: '產品規格書' },
  { value: 'SOP', label: '作業標準書' },
  { value: 'QC', label: '檢驗規範' },
];

const STATUS_MAP: Record<string, { color: string; label: string }> = {
  DRAFT: { color: 'default', label: '草稿' },
  PENDING: { color: 'orange', label: '審核中' },
  RELEASED: { color: 'green', label: '已發行' },
  OBSOLETE: { color: 'red', label: '已作廢' },
};

const FILE_TYPE_LABEL: Record<string, string> = {
  DWG: 'DWG', PDF: 'PDF', THREE_D: '3D', THUMB: '縮圖', WORD: 'Word',
};

const DocumentsPage: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';

  // 分類層
  const [docCategories, setDocCategories] = useState<DocumentCategory[]>([]);
  const [catLoading, setCatLoading] = useState(false);
  const [catSearch, setCatSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<DocumentCategory | null>(null);

  // 分類 CRUD modal
  const [catModalVisible, setCatModalVisible] = useState(false);
  const [editingCat, setEditingCat] = useState<DocumentCategory | null>(null);
  const [catForm] = Form.useForm();

  // 文件層
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [parts, setParts] = useState<PartOption[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [docSearch, setDocSearch] = useState('');

  // 文件操作 modals
  const [modalVisible, setModalVisible] = useState(false);
  const [detailModal, setDetailModal] = useState<DocumentItem | null>(null);
  const [uploadModal, setUploadModal] = useState<DocumentItem | null>(null);
  const [form] = Form.useForm();
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [uploadType, setUploadType] = useState<string>('PDF');

  // 未關聯檔案
  const [viewingUnlinked, setViewingUnlinked] = useState(false);
  const [unlinkedDocs, setUnlinkedDocs] = useState<DocumentItem[]>([]);
  const [unlinkedLoading, setUnlinkedLoading] = useState(false);
  const [unlinkedCount, setUnlinkedCount] = useState(0);

  // 快速上傳 modal（未關聯上傳）
  const [bulkUploadVisible, setBulkUploadVisible] = useState(false);
  const [bulkFileList, setBulkFileList] = useState<UploadFile[]>([]);
  const [bulkDocType, setBulkDocType] = useState<string>('');

  // 建立關聯 modal
  const [linkingDoc, setLinkingDoc] = useState<DocumentItem | null>(null);
  const [linkTarget, setLinkTarget] = useState<'part' | 'product'>('part');
  const [linkForm] = Form.useForm();

  const fetchCategories = async () => {
    setCatLoading(true);
    try {
      const res = await client.get('/document-categories');
      setDocCategories(res.data);
    } finally {
      setCatLoading(false);
    }
  };

  const fetchUnlinkedCount = async () => {
    try {
      const res = await client.get('/documents', { params: { unlinked: true } });
      setUnlinkedCount(res.data.length);
    } catch {}
  };

  const fetchUnlinkedDocs = async () => {
    setUnlinkedLoading(true);
    try {
      const res = await client.get('/documents', { params: { unlinked: true } });
      setUnlinkedDocs(res.data);
      setUnlinkedCount(res.data.length);
    } finally {
      setUnlinkedLoading(false);
    }
  };

  const fetchDocuments = async (categoryId: string, keyword?: string) => {
    setLoading(true);
    try {
      const res = await client.get('/documents', {
        params: { categoryId, ...(keyword ? { keyword } : {}) },
      });
      setDocuments(res.data);
    } finally {
      setLoading(false);
    }
  };

  const fetchOptions = async () => {
    const [pRes, prodRes] = await Promise.all([
      client.get('/parts'),
      client.get('/products'),
    ]);
    setParts(pRes.data);
    setProducts(prodRes.data);
  };

  useEffect(() => {
    fetchCategories();
    fetchOptions();
    fetchUnlinkedCount();
  }, []);

  const handleSelectCategory = (cat: DocumentCategory) => {
    setSelectedCategory(cat);
    setDocSearch('');
    fetchDocuments(cat.id);
  };

  const handleBack = () => {
    setSelectedCategory(null);
    setDocuments([]);
    setDocSearch('');
    fetchCategories();
    fetchUnlinkedCount();
  };

  const handleViewUnlinked = () => {
    setViewingUnlinked(true);
    fetchUnlinkedDocs();
  };

  const handleBackFromUnlinked = () => {
    setViewingUnlinked(false);
    setUnlinkedDocs([]);
    fetchUnlinkedCount();
  };

  // --- 分類 CRUD ---
  const handleCatSubmit = async (values: any) => {
    try {
      if (editingCat) {
        await client.put(`/document-categories/${editingCat.id}`, values);
        message.success('分類已更新');
      } else {
        await client.post('/document-categories', values);
        message.success('分類已建立');
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
      await client.delete(`/document-categories/${id}`);
      message.success('分類已刪除');
      fetchCategories();
    } catch (error: any) {
      message.error(error.response?.data?.error || '刪除失敗');
    }
  };

  // --- 文件 CRUD ---
  const handleCreate = async (values: any) => {
    try {
      await client.post('/documents', { ...values, categoryId: selectedCategory!.id });
      message.success('文件建立成功');
      setModalVisible(false);
      form.resetFields();
      fetchDocuments(selectedCategory!.id, docSearch || undefined);
    } catch (error: any) {
      message.error(error.response?.data?.error || '建立失敗');
    }
  };

  const handleStatusChange = async (id: string, status: string) => {
    try {
      await client.put(`/documents/${id}/status`, { status });
      message.success('狀態更新成功');
      if (viewingUnlinked) {
        fetchUnlinkedDocs();
      } else {
        fetchDocuments(selectedCategory!.id, docSearch || undefined);
      }
      if (detailModal?.id === id) {
        const res = await client.get(`/documents/${id}`);
        setDetailModal(res.data);
      }
    } catch (error: any) {
      message.error(error.response?.data?.error || '更新失敗');
    }
  };

  const handleUpload = async () => {
    if (!uploadModal || fileList.length === 0) return;
    const formData = new FormData();
    fileList.forEach((f) => { if (f.originFileObj) formData.append('files', f.originFileObj); });
    formData.append('fileType', uploadType);
    try {
      await client.post(`/documents/${uploadModal.id}/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      message.success('上傳成功');
      setUploadModal(null);
      setFileList([]);
      if (selectedCategory) fetchDocuments(selectedCategory.id, docSearch || undefined);
    } catch (error: any) {
      message.error(error.response?.data?.error || '上傳失敗');
    }
  };

  // 快速上傳（未關聯）
  const handleBulkUpload = async () => {
    if (!bulkDocType) {
      message.warning('請先選擇文件類型');
      return;
    }
    if (bulkFileList.length === 0) {
      message.warning('請選擇要上傳的檔案');
      return;
    }
    const formData = new FormData();
    bulkFileList.forEach((f) => { if (f.originFileObj) formData.append('files', f.originFileObj); });
    formData.append('documentType', bulkDocType);
    try {
      const res = await client.post('/documents/unlinked-upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const { results } = res.data;
      const successCount = results.filter((r: any) => r.status === 'success').length;
      const errorCount = results.length - successCount;
      if (successCount > 0) message.success(`成功上傳 ${successCount} 個檔案${errorCount > 0 ? `，${errorCount} 個失敗` : ''}`);
      else message.error('所有檔案上傳失敗');
      setBulkUploadVisible(false);
      setBulkFileList([]);
      setBulkDocType('');
      fetchUnlinkedDocs();
    } catch (error: any) {
      message.error(error.response?.data?.error || '上傳失敗');
    }
  };

  // 建立關聯
  const handleLink = async (values: any) => {
    if (!linkingDoc) return;
    try {
      await client.put(`/documents/${linkingDoc.id}/link`, {
        partId: linkTarget === 'part' ? values.targetId : undefined,
        productId: linkTarget === 'product' ? values.targetId : undefined,
      });
      message.success('關聯已建立');
      setLinkingDoc(null);
      linkForm.resetFields();
      fetchUnlinkedDocs();
    } catch (error: any) {
      message.error(error.response?.data?.error || '建立關聯失敗');
    }
  };

  const handleDocSearch = (value: string) => {
    setDocSearch(value);
    fetchDocuments(selectedCategory!.id, value || undefined);
  };

  const canPreview = (file: DocumentFile) => file.fileType === 'PDF' || file.fileType === 'THUMB';
  const canDownload = () => user?.role !== 'SALES';

  const filteredCategories = docCategories.filter((c) => {
    if (!catSearch) return true;
    const kw = catSearch.toLowerCase();
    return c.code.toLowerCase().includes(kw) || c.name.toLowerCase().includes(kw);
  });

  // 一般文件列表欄位
  const docColumns = [
    {
      title: '所屬',
      render: (_: any, r: DocumentItem) =>
        r.part ? `${r.part.partNumber} - ${r.part.name}` :
        r.product ? `${r.product.productCode} - ${r.product.name}` : '-',
    },
    { title: '類型', dataIndex: 'documentType', render: (v: string) => DOCUMENT_TYPES.find((d) => d.value === v)?.label || v },
    { title: '版本', dataIndex: 'version', render: (v: number) => `R${v}` },
    {
      title: '狀態',
      dataIndex: 'status',
      render: (v: string) => {
        const s = STATUS_MAP[v] || { color: 'default', label: v };
        return <Tag color={s.color}>{s.label}</Tag>;
      },
    },
    { title: '檔案數', render: (_: any, r: DocumentItem) => r.files.length },
    { title: '建立者', render: (_: any, r: DocumentItem) => r.createdBy.name },
    {
      title: '操作',
      render: (_: any, r: DocumentItem) => (
        <Space>
          <Button type="link" onClick={() => setDetailModal(r)}>詳情</Button>
          {r.status === 'DRAFT' && (
            <Button type="link" icon={<UploadOutlined />} onClick={() => { setUploadModal(r); setFileList([]); }}>上傳</Button>
          )}
          {r.status === 'DRAFT' && (r.part || r.product) && (
            <Button type="link" icon={<SendOutlined />} onClick={() => handleStatusChange(r.id, 'PENDING')}>送審</Button>
          )}
          {r.status === 'PENDING' && user?.role === 'ADMIN' && (
            <Button type="link" icon={<CheckOutlined />} onClick={() => handleStatusChange(r.id, 'RELEASED')}>發行</Button>
          )}
          {r.status === 'RELEASED' && user?.role === 'ADMIN' && (
            <Popconfirm title="確定作廢？" onConfirm={() => handleStatusChange(r.id, 'OBSOLETE')}>
              <Button type="link" danger icon={<StopOutlined />}>作廢</Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  // 未關聯文件列表欄位
  const unlinkedColumns = [
    {
      title: '原始檔名',
      render: (_: any, r: DocumentItem) => r.files[0]?.originalName || '-',
    },
    {
      title: '格式',
      render: (_: any, r: DocumentItem) => {
        const ft = r.files[0]?.fileType;
        return ft ? <Tag>{FILE_TYPE_LABEL[ft] || ft}</Tag> : '-';
      },
    },
    {
      title: '文件類型',
      dataIndex: 'documentType',
      render: (v: string) => DOCUMENT_TYPES.find((d) => d.value === v)?.label || v,
    },
    {
      title: '大小',
      render: (_: any, r: DocumentItem) => {
        const size = r.files[0]?.fileSize;
        return size != null ? `${(size / 1024).toFixed(1)} KB` : '-';
      },
    },
    {
      title: '上傳時間',
      dataIndex: 'createdAt',
      render: (v: string) => new Date(v).toLocaleString(),
    },
    {
      title: '操作',
      render: (_: any, r: DocumentItem) => (
        <Space>
          <Button type="link" onClick={() => setDetailModal(r)}>詳情</Button>
          <Button
            type="link"
            icon={<LinkOutlined />}
            onClick={() => { setLinkingDoc(r); setLinkTarget('part'); linkForm.resetFields(); }}
          >
            建立關聯
          </Button>
        </Space>
      ),
    },
  ];

  // ===== 未關聯檔案頁 =====
  if (viewingUnlinked) {
    return (
      <div>
        <Breadcrumb
          style={{ marginBottom: 16 }}
          items={[
            { title: <a onClick={handleBackFromUnlinked}>文件中心</a> },
            { title: '未關聯檔案' },
          ]}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <Space>
            <Button icon={<ArrowLeftOutlined />} onClick={handleBackFromUnlinked}>返回</Button>
            <h2 style={{ margin: 0 }}>未關聯檔案</h2>
          </Space>
          <Button
            type="primary"
            icon={<UploadOutlined />}
            onClick={() => { setBulkUploadVisible(true); setBulkFileList([]); setBulkDocType(''); }}
          >
            快速上傳
          </Button>
        </div>

        <Table rowKey="id" columns={unlinkedColumns} dataSource={unlinkedDocs} loading={unlinkedLoading} />

        {/* 快速上傳 modal */}
        <Modal
          title="快速上傳檔案（未關聯）"
          open={bulkUploadVisible}
          onOk={handleBulkUpload}
          onCancel={() => { setBulkUploadVisible(false); setBulkFileList([]); setBulkDocType(''); }}
          okText="開始上傳"
        >
          <Form layout="vertical">
            <Form.Item label="文件類型" required>
              <Select
                placeholder="請選擇文件類型"
                value={bulkDocType || undefined}
                onChange={setBulkDocType}
                options={DOCUMENT_TYPES}
              />
            </Form.Item>
            <Form.Item label="選擇檔案">
              <Upload
                fileList={bulkFileList}
                onChange={({ fileList: fl }) => setBulkFileList(fl)}
                beforeUpload={() => false}
                multiple
              >
                <Button icon={<UploadOutlined />}>選擇檔案（可多選）</Button>
              </Upload>
              <div style={{ marginTop: 8, color: '#888', fontSize: 12 }}>
                格式自動判斷：.dwg → DWG、.pdf → PDF、.sldprt/.step/.stp/.iges → 3D、.jpg/.png → 縮圖、.doc/.docx → Word、其他保留原副檔名
              </div>
            </Form.Item>
          </Form>
        </Modal>

        {/* 建立關聯 modal */}
        <Modal
          title={`建立關聯 — ${linkingDoc?.files[0]?.originalName || ''}`}
          open={!!linkingDoc}
          onOk={() => linkForm.submit()}
          onCancel={() => { setLinkingDoc(null); linkForm.resetFields(); }}
          okText="確認關聯"
        >
          <Form form={linkForm} onFinish={handleLink} layout="vertical">
            <Form.Item label="關聯類型">
              <Select
                value={linkTarget}
                onChange={(v) => { setLinkTarget(v); linkForm.setFieldValue('targetId', undefined); }}
              >
                <Select.Option value="part">零件</Select.Option>
                <Select.Option value="product">成品</Select.Option>
              </Select>
            </Form.Item>
            <Form.Item
              name="targetId"
              label={linkTarget === 'part' ? '選擇零件' : '選擇成品'}
              rules={[{ required: true, message: '請選擇' }]}
            >
              {linkTarget === 'part' ? (
                <Select
                  showSearch
                  placeholder="輸入料號或名稱搜尋"
                  filterOption={(input, option) =>
                    String(option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                  }
                  options={parts.map((p) => ({ value: p.id, label: `${p.partNumber} - ${p.name}` }))}
                />
              ) : (
                <Select
                  showSearch
                  placeholder="輸入成品編號或名稱搜尋"
                  filterOption={(input, option) =>
                    String(option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                  }
                  options={products.map((p) => ({ value: p.id, label: `${p.productCode} - ${p.name}` }))}
                />
              )}
            </Form.Item>
          </Form>
        </Modal>

        {/* 文件詳情（共用） */}
        {renderDetailModal()}
      </div>
    );
  }

  // ===== 分類卡片首頁 =====
  if (!selectedCategory) {
    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ margin: 0 }}>文件中心</h2>
          <Space>
            <Search
              placeholder="搜尋分類..."
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
                新增分類
              </Button>
            )}
          </Space>
        </div>

        <Row gutter={[16, 16]} style={{ minHeight: 200 }}>
          {/* 未關聯檔案特殊卡片 */}
          <Col xs={24} sm={12} md={8} lg={6}>
            <Card
              hoverable
              onClick={handleViewUnlinked}
              style={{ cursor: 'pointer', borderStyle: 'dashed' }}
            >
              <Card.Meta
                avatar={<InboxOutlined style={{ fontSize: 28, color: '#8c8c8c' }} />}
                title="未關聯檔案"
                description={
                  <Space direction="vertical" size={2}>
                    <Tag color="default">UNLINKED</Tag>
                    <span style={{ color: '#888' }}>{unlinkedCount} 個待關聯</span>
                    <span style={{ color: '#aaa', fontSize: 12 }}>先上傳，後建立零件 / 成品關聯</span>
                  </Space>
                }
              />
            </Card>
          </Col>

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
                    title="確定刪除此分類？"
                    onConfirm={(e) => { e?.stopPropagation(); handleCatDelete(cat.id); }}
                    onCancel={(e) => e?.stopPropagation()}
                  >
                    <DeleteOutlined style={{ color: '#ff4d4f' }} onClick={(e) => e.stopPropagation()} />
                  </Popconfirm>,
                ] : undefined}
              >
                <Card.Meta
                  avatar={<FileOutlined style={{ fontSize: 28, color: '#fa8c16' }} />}
                  title={cat.name}
                  description={
                    <Space direction="vertical" size={2}>
                      <Tag color="orange">{cat.code}</Tag>
                      <span style={{ color: '#888' }}>{cat._count?.documents ?? 0} 份文件</span>
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
                {catSearch ? '查無符合分類' : '尚無文件分類，請新增'}
              </div>
            </Col>
          )}
        </Row>

        <Modal
          title={editingCat ? '編輯分類' : '新增分類'}
          open={catModalVisible}
          onOk={() => catForm.submit()}
          onCancel={() => { setCatModalVisible(false); setEditingCat(null); }}
        >
          <Form form={catForm} onFinish={handleCatSubmit} layout="vertical">
            <Form.Item name="code" label="分類代碼" rules={[{ required: true, pattern: /^[A-Za-z0-9-]+$/, message: '僅允許英文、數字和連字符' }]}>
              <Input disabled={!!editingCat} />
            </Form.Item>
            <Form.Item name="name" label="分類名稱" rules={[{ required: true }]}>
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

  // ===== 文件列表頁（鑽取後）=====
  return (
    <div>
      <Breadcrumb
        style={{ marginBottom: 16 }}
        items={[
          { title: <a onClick={handleBack}>文件中心</a> },
          { title: selectedCategory.name },
        ]}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={handleBack}>返回</Button>
          <h2 style={{ margin: 0 }}>{selectedCategory.name} <Tag color="orange">{selectedCategory.code}</Tag></h2>
        </Space>
        <Space>
          <Search
            placeholder="搜尋關鍵字..."
            allowClear
            style={{ width: 220 }}
            onSearch={handleDocSearch}
            onChange={(e) => { if (!e.target.value) handleDocSearch(''); }}
          />
          <Button icon={<FileExcelOutlined />} onClick={() => downloadReport('documents', '文件清單.xlsx')}>
            匯出 Excel
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => { setModalVisible(true); form.resetFields(); }}
          >
            新增文件
          </Button>
        </Space>
      </div>

      <Table rowKey="id" columns={docColumns} dataSource={documents} loading={loading} />

      {/* 新增文件 */}
      <Modal title="新增文件" open={modalVisible} onOk={() => form.submit()} onCancel={() => setModalVisible(false)}>
        <Form form={form} onFinish={handleCreate} layout="vertical">
          <Form.Item name="documentType" label="文件類型" rules={[{ required: true }]}>
            <Select options={DOCUMENT_TYPES} />
          </Form.Item>
          <Form.Item label="歸屬">
            <Space>
              <Form.Item name="partId" noStyle>
                <Select placeholder="選擇零件" allowClear style={{ width: 200 }} options={parts.map((p) => ({ value: p.id, label: `${p.partNumber} - ${p.name}` }))} />
              </Form.Item>
              <span>或</span>
              <Form.Item name="productId" noStyle>
                <Select placeholder="選擇成品" allowClear style={{ width: 200 }} options={products.map((p) => ({ value: p.id, label: `${p.productCode} - ${p.name}` }))} />
              </Form.Item>
            </Space>
          </Form.Item>
          <Form.Item name="remark" label="備註">
            <Input.TextArea />
          </Form.Item>
        </Form>
      </Modal>

      {/* 上傳檔案 */}
      <Modal
        title={`上傳檔案 - ${uploadModal?.documentType ? DOCUMENT_TYPES.find((d) => d.value === uploadModal.documentType)?.label : ''}`}
        open={!!uploadModal}
        onOk={handleUpload}
        onCancel={() => { setUploadModal(null); setFileList([]); }}
      >
        <Form.Item label="檔案格式">
          <Select value={uploadType} onChange={setUploadType} options={[
            { value: 'DWG', label: 'DWG (AutoCAD)' },
            { value: 'PDF', label: 'PDF' },
            { value: 'THREE_D', label: '3D 模型 (SolidWorks)' },
            { value: 'THUMB', label: '縮圖 (JPG/PNG)' },
            { value: 'WORD', label: 'Word 原稿' },
          ]} />
        </Form.Item>
        <Upload fileList={fileList} onChange={({ fileList: fl }) => setFileList(fl)} beforeUpload={() => false} multiple>
          <Button icon={<UploadOutlined />}>選擇檔案</Button>
        </Upload>
      </Modal>

      {renderDetailModal()}
    </div>
  );

  // 文件詳情 modal（共用於分類檢視和未關聯檢視）
  function renderDetailModal() {
    return (
      <Modal
        title="文件詳情"
        open={!!detailModal}
        onCancel={() => setDetailModal(null)}
        footer={null}
        width={700}
      >
        {detailModal && (
          <>
            <Descriptions bordered column={2}>
              <Descriptions.Item label="類型">{DOCUMENT_TYPES.find((d) => d.value === detailModal.documentType)?.label}</Descriptions.Item>
              <Descriptions.Item label="版本">R{detailModal.version}</Descriptions.Item>
              <Descriptions.Item label="狀態">
                <Tag color={STATUS_MAP[detailModal.status]?.color}>{STATUS_MAP[detailModal.status]?.label}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="建立者">{detailModal.createdBy.name}</Descriptions.Item>
              <Descriptions.Item label="所屬" span={2}>
                {detailModal.part ? `${detailModal.part.partNumber} - ${detailModal.part.name}` :
                 detailModal.product ? `${detailModal.product.productCode} - ${detailModal.product.name}` :
                 <Tag color="default">未關聯</Tag>}
              </Descriptions.Item>
              <Descriptions.Item label="建立時間" span={2}>{new Date(detailModal.createdAt).toLocaleString()}</Descriptions.Item>
            </Descriptions>
            <Divider />
            <h4>檔案清單</h4>
            {detailModal.files.length === 0 ? <Empty description="尚無檔案" /> : (
              <Space direction="vertical" style={{ width: '100%' }}>
                {detailModal.files.map((f) => (
                  <Card key={f.id} size="small">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <Tag>{FILE_TYPE_LABEL[f.fileType] || f.fileType}</Tag>
                        <span>{f.originalName}</span>
                        <span style={{ color: '#999', marginLeft: 8 }}>({(f.fileSize / 1024).toFixed(1)} KB)</span>
                      </div>
                      <Space>
                        {canPreview(f) && (
                          <Button type="link" icon={<EyeOutlined />} onClick={() => window.open(`/api/documents/files/${f.id}/preview`, '_blank')}>預覽</Button>
                        )}
                        {canDownload() && (
                          <Button type="link" icon={<DownloadOutlined />} onClick={() => window.open(`/api/documents/files/${f.id}/download`, '_blank')}>下載</Button>
                        )}
                      </Space>
                    </div>
                  </Card>
                ))}
              </Space>
            )}
            <Divider />
            <Space>
              {detailModal.status === 'DRAFT' && !viewingUnlinked && (
                <Button icon={<UploadOutlined />} onClick={() => { setDetailModal(null); setUploadModal(detailModal); setFileList([]); }}>上傳檔案</Button>
              )}
              {detailModal.status === 'DRAFT' && (detailModal.part || detailModal.product) && (
                <Button icon={<SendOutlined />} onClick={() => handleStatusChange(detailModal.id, 'PENDING')}>送審</Button>
              )}
              {detailModal.status === 'PENDING' && user?.role === 'ADMIN' && (
                <Button type="primary" icon={<CheckOutlined />} onClick={() => handleStatusChange(detailModal.id, 'RELEASED')}>發行</Button>
              )}
              {detailModal.status === 'RELEASED' && user?.role === 'ADMIN' && (
                <Popconfirm title="確定作廢？" onConfirm={() => handleStatusChange(detailModal.id, 'OBSOLETE')}>
                  <Button danger icon={<StopOutlined />}>作廢</Button>
                </Popconfirm>
              )}
              {viewingUnlinked && !detailModal.part && !detailModal.product && (
                <Button
                  icon={<LinkOutlined />}
                  onClick={() => { setDetailModal(null); setLinkingDoc(detailModal); setLinkTarget('part'); linkForm.resetFields(); }}
                >
                  建立關聯
                </Button>
              )}
            </Space>
          </>
        )}
      </Modal>
    );
  }
};

export default DocumentsPage;
