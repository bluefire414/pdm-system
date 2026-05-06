import React, { useEffect, useState } from 'react';
import {
  Table, Button, Modal, Form, Input, Select, message, Tag, Space, Descriptions, Divider, Card,
} from 'antd';
import { PlusOutlined, CheckOutlined, CloseOutlined, EyeOutlined, FileExcelOutlined } from '@ant-design/icons';
import client, { downloadReport } from '../api/client';
import { useAuth } from '../context/AuthContext';

interface ECNItem {
  id: string;
  ecnNo: string;
  title: string;
  description: string;
  status: string;
  createdAt: string;
  reviewedBy: { name: string } | null;
  document: {
    id: string;
    documentType: string;
    version: number;
    part: { partNumber: string; name: string } | null;
    product: { productCode: string; name: string } | null;
  };
}

interface DocumentOption {
  id: string;
  documentType: string;
  version: number;
  part: { partNumber: string } | null;
  product: { productCode: string } | null;
}

const STATUS_MAP: Record<string, { color: string; label: string }> = {
  PENDING: { color: 'orange', label: '待審核' },
  APPROVED: { color: 'green', label: '已核准' },
  REJECTED: { color: 'red', label: '已退回' },
};

const DOC_TYPE_LABEL: Record<string, string> = {
  PART_DRAWING: '零部件圖紙',
  PRODUCT_DRAWING: '成品圖紙',
  SPEC: '產品規格書',
  SOP: '作業標準書',
  QC: '檢驗規範',
};

const ECNsPage: React.FC = () => {
  const { user } = useAuth();
  const [ecns, setEcns] = useState<ECNItem[]>([]);
  const [documents, setDocuments] = useState<DocumentOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [detailModal, setDetailModal] = useState<ECNItem | null>(null);
  const [form] = Form.useForm();

  const fetchECNs = async () => {
    setLoading(true);
    try {
      const res = await client.get('/ecns');
      setEcns(res.data);
    } finally {
      setLoading(false);
    }
  };

  const fetchDocuments = async () => {
    const res = await client.get('/documents');
    setDocuments(res.data);
  };

  useEffect(() => {
    fetchECNs();
    fetchDocuments();
  }, []);

  const handleCreate = async (values: any) => {
    try {
      await client.post('/ecns', values);
      message.success('ECN 建立成功');
      setModalVisible(false);
      form.resetFields();
      fetchECNs();
    } catch (error: any) {
      message.error(error.response?.data?.error || '建立失敗');
    }
  };

  const handleApprove = async (id: string) => {
    try {
      await client.put(`/ecns/${id}/approve`);
      message.success('已核准');
      fetchECNs();
      if (detailModal?.id === id) setDetailModal(null);
    } catch (error: any) {
      message.error(error.response?.data?.error || '核准失敗');
    }
  };

  const handleReject = async (id: string) => {
    try {
      await client.put(`/ecns/${id}/reject`);
      message.success('已退回');
      fetchECNs();
      if (detailModal?.id === id) setDetailModal(null);
    } catch (error: any) {
      message.error(error.response?.data?.error || '退回失敗');
    }
  };

  const columns = [
    { title: 'ECN 編號', dataIndex: 'ecnNo', key: 'ecnNo' },
    { title: '標題', dataIndex: 'title', key: 'title' },
    {
      title: '狀態',
      dataIndex: 'status',
      render: (v: string) => {
        const s = STATUS_MAP[v] || { color: 'default', label: v };
        return <Tag color={s.color}>{s.label}</Tag>;
      },
    },
    {
      title: '關聯文件',
      render: (_: any, r: ECNItem) => {
        const doc = r.document;
        const label = doc.part ? `${doc.part.partNumber}` : doc.product ? `${doc.product.productCode}` : '-';
        return `${DOC_TYPE_LABEL[doc.documentType] || doc.documentType} (${label}) R${doc.version}`;
      },
    },
    { title: '審核人', render: (_: any, r: ECNItem) => r.reviewedBy?.name || '-' },
    {
      title: '操作',
      render: (_: any, r: ECNItem) => (
        <Space>
          <Button type="link" icon={<EyeOutlined />} onClick={() => setDetailModal(r)}>詳情</Button>
          {r.status === 'PENDING' && user?.role === 'ADMIN' && (
            <>
              <Button type="link" icon={<CheckOutlined />} onClick={() => handleApprove(r.id)}>核准</Button>
              <Button type="link" danger icon={<CloseOutlined />} onClick={() => handleReject(r.id)}>退回</Button>
            </>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2>ECN 工程變更管理</h2>
        <Space>
          <Button icon={<FileExcelOutlined />} onClick={() => downloadReport('ecns', 'ECN清單.xlsx')}>
            匯出 Excel
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { setModalVisible(true); form.resetFields(); }}>
            提出 ECN
          </Button>
        </Space>
      </div>
      <Table rowKey="id" columns={columns} dataSource={ecns} loading={loading} />

      {/* 建立 ECN */}
      <Modal title="提出 ECN" open={modalVisible} onOk={() => form.submit()} onCancel={() => setModalVisible(false)} width={600}>
        <Form form={form} onFinish={handleCreate} layout="vertical">
          <Form.Item name="ecnNo" label="ECN 編號" rules={[{ required: true }]}>
            <Input placeholder="例如：ECN-2024-001" />
          </Form.Item>
          <Form.Item name="title" label="變更標題" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="description" label="變更內容說明" rules={[{ required: true }]}>
            <Input.TextArea rows={4} />
          </Form.Item>
          <Form.Item name="documentId" label="選擇要變更的文件" rules={[{ required: true }]}>
            <Select
              showSearch
              placeholder="搜尋文件..."
              options={documents.map((d) => ({
                value: d.id,
                label: `${DOC_TYPE_LABEL[d.documentType] || d.documentType} - ${d.part?.partNumber || d.product?.productCode || '未知'} (R${d.version})`,
              }))}
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* 詳情 */}
      <Modal
        title={`ECN 詳情 - ${detailModal?.ecnNo}`}
        open={!!detailModal}
        onCancel={() => setDetailModal(null)}
        footer={
          detailModal?.status === 'PENDING' && user?.role === 'ADMIN' ? (
            <Space>
              <Button type="primary" icon={<CheckOutlined />} onClick={() => handleApprove(detailModal.id)}>核准</Button>
              <Button danger icon={<CloseOutlined />} onClick={() => handleReject(detailModal.id)}>退回</Button>
            </Space>
          ) : null
        }
      >
        {detailModal && (
          <>
            <Descriptions bordered column={1}>
              <Descriptions.Item label="標題">{detailModal.title}</Descriptions.Item>
              <Descriptions.Item label="說明">{detailModal.description}</Descriptions.Item>
              <Descriptions.Item label="狀態">
                <Tag color={STATUS_MAP[detailModal.status]?.color}>{STATUS_MAP[detailModal.status]?.label}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="提出時間">{new Date(detailModal.createdAt).toLocaleString()}</Descriptions.Item>
              <Descriptions.Item label="審核人">{detailModal.reviewedBy?.name || '尚未審核'}</Descriptions.Item>
            </Descriptions>
            <Divider />
            <Card title="關聯文件資訊" size="small">
              <p>類型：{DOC_TYPE_LABEL[detailModal.document.documentType] || detailModal.document.documentType}</p>
              <p>版本：R{detailModal.document.version}</p>
              <p>
                歸屬：
                {detailModal.document.part
                  ? `${detailModal.document.part.partNumber} - ${detailModal.document.part.name}`
                  : detailModal.document.product
                  ? `${detailModal.document.product.productCode} - ${detailModal.document.product.name}`
                  : '-'}
              </p>
            </Card>
          </>
        )}
      </Modal>
    </div>
  );
};

export default ECNsPage;
