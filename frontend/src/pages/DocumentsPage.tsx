import React, { useEffect, useState } from 'react';
import {
  Table, Button, Modal, Form, Select, Input, message, Popconfirm, Tag, Upload,
  Descriptions, Empty, Card, Space, Divider,
} from 'antd';
import { PlusOutlined, EyeOutlined, DownloadOutlined, SendOutlined, CheckOutlined, StopOutlined, UploadOutlined, FileExcelOutlined } from '@ant-design/icons';
import type { UploadFile } from 'antd/es/upload/interface';
import client, { downloadReport } from '../api/client';
import { useAuth } from '../context/AuthContext';

interface DocumentItem {
  id: string;
  documentType: string;
  status: string;
  version: number;
  remark: string | null;
  createdAt: string;
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

interface PartOption {
  id: string;
  partNumber: string;
  name: string;
}

interface ProductOption {
  id: string;
  productCode: string;
  name: string;
}

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
  DWG: 'DWG',
  PDF: 'PDF',
  THREE_D: '3D',
  THUMB: '縮圖',
  WORD: 'Word',
};

const DocumentsPage: React.FC = () => {
  const { user } = useAuth();
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [parts, setParts] = useState<PartOption[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [detailModal, setDetailModal] = useState<DocumentItem | null>(null);
  const [uploadModal, setUploadModal] = useState<DocumentItem | null>(null);
  const [form] = Form.useForm();
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [uploadType, setUploadType] = useState<string>('PDF');

  const fetchDocuments = async () => {
    setLoading(true);
    try {
      const res = await client.get('/documents');
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
    fetchDocuments();
    fetchOptions();
  }, []);

  const handleCreate = async (values: any) => {
    try {
      await client.post('/documents', values);
      message.success('文件建立成功');
      setModalVisible(false);
      form.resetFields();
      fetchDocuments();
    } catch (error: any) {
      message.error(error.response?.data?.error || '建立失敗');
    }
  };

  const handleStatusChange = async (id: string, status: string) => {
    try {
      await client.put(`/documents/${id}/status`, { status });
      message.success('狀態更新成功');
      fetchDocuments();
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
    fileList.forEach((f) => {
      if (f.originFileObj) formData.append('files', f.originFileObj);
    });
    formData.append('fileType', uploadType);
    try {
      await client.post(`/documents/${uploadModal.id}/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      message.success('上傳成功');
      setUploadModal(null);
      setFileList([]);
      fetchDocuments();
    } catch (error: any) {
      message.error(error.response?.data?.error || '上傳失敗');
    }
  };

  const canPreview = (file: DocumentFile) => {
    if (file.fileType === 'PDF') return true;
    if (file.fileType === 'THUMB') return true;
    return false;
  };

  const canDownload = () => {
    if (user?.role === 'SALES') return false;
    return true;
  };

  const columns = [
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
            <>
              <Button type="link" icon={<UploadOutlined />} onClick={() => { setUploadModal(r); setFileList([]); }}>上傳</Button>
              <Button type="link" icon={<SendOutlined />} onClick={() => handleStatusChange(r.id, 'PENDING')}>送審</Button>
            </>
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

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2>文件中心</h2>
        <Space>
          <Button icon={<FileExcelOutlined />} onClick={() => downloadReport('documents', '文件清單.xlsx')}>
            匯出 Excel
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { setModalVisible(true); form.resetFields(); }}>
            新增文件
          </Button>
        </Space>
      </div>
      <Table rowKey="id" columns={columns} dataSource={documents} loading={loading} />

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

      {/* 文件詳情 */}
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
              <Descriptions.Item label="所屬">
                {detailModal.part ? `${detailModal.part.partNumber} - ${detailModal.part.name}` :
                 detailModal.product ? `${detailModal.product.productCode} - ${detailModal.product.name}` : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="建立時間">{new Date(detailModal.createdAt).toLocaleString()}</Descriptions.Item>
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
                          <Button
                            type="link"
                            icon={<EyeOutlined />}
                            onClick={() => window.open(`/api/documents/files/${f.id}/preview`, '_blank')}
                          >
                            預覽
                          </Button>
                        )}
                        {canDownload() && (
                          <Button
                            type="link"
                            icon={<DownloadOutlined />}
                            onClick={() => window.open(`/api/documents/files/${f.id}/download`, '_blank')}
                          >
                            下載
                          </Button>
                        )}
                      </Space>
                    </div>
                  </Card>
                ))}
              </Space>
            )}
            <Divider />
            <Space>
              {detailModal.status === 'DRAFT' && (
                <>
                  <Button icon={<UploadOutlined />} onClick={() => { setDetailModal(null); setUploadModal(detailModal); setFileList([]); }}>上傳檔案</Button>
                  <Button icon={<SendOutlined />} onClick={() => handleStatusChange(detailModal.id, 'PENDING')}>送審</Button>
                </>
              )}
              {detailModal.status === 'PENDING' && user?.role === 'ADMIN' && (
                <Button type="primary" icon={<CheckOutlined />} onClick={() => handleStatusChange(detailModal.id, 'RELEASED')}>發行</Button>
              )}
              {detailModal.status === 'RELEASED' && user?.role === 'ADMIN' && (
                <Popconfirm title="確定作廢？" onConfirm={() => handleStatusChange(detailModal.id, 'OBSOLETE')}>
                  <Button danger icon={<StopOutlined />}>作廢</Button>
                </Popconfirm>
              )}
            </Space>
          </>
        )}
      </Modal>
    </div>
  );
};

export default DocumentsPage;
