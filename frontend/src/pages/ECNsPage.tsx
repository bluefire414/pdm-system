import React, { useEffect, useState } from 'react';
import {
  Table, Button, Modal, Form, Input, Select, message, Tag, Space, Descriptions, Divider, Card, Badge,
  Collapse, Statistic, Row, Col, Alert, Spin, Typography, Steps, Tooltip,
} from 'antd';
import {
  PlusOutlined, CheckOutlined, CloseOutlined, EyeOutlined, FileExcelOutlined,
  WarningOutlined, ApartmentOutlined, InfoCircleOutlined, CheckCircleOutlined,
  ClockCircleOutlined, CloseCircleOutlined, MinusCircleOutlined,
} from '@ant-design/icons';
import { DatePicker } from 'antd';
import dayjs from 'dayjs';
import client, { downloadReport } from '../api/client';
import { useAuth } from '../context/AuthContext';

// ─── 型別定義 ─────────────────────────────────────────────────────────────────
interface ECNItem {
  id: string;
  ecnNo: string;
  title: string;
  description: string;
  status: string;
  dueDate: string | null;
  isOverdue: boolean;
  createdAt: string;
  reviewedBy: { name: string } | null;
  document: {
    id: string;
    documentType: string;
    version: number;
    parts: Array<{ part: { partNumber: string; name: string } }>;
    products: Array<{ product: { productCode: string; name: string } }>;
  };
}

interface DocumentOption {
  id: string;
  documentType: string;
  version: number;
  parts: Array<{ part: { partNumber: string } }>;
  products: Array<{ product: { productCode: string } }>;
}

interface ApprovalRecord {
  id: string;
  order: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  approverId: string | null;
  comment: string | null;
  actionAt: string | null;
  createdAt: string;
  step: { id: string; name: string; approverRole: string; isRequired: boolean };
  approver: { id: string; name: string } | null;
}

interface ApprovalStatus {
  hasWorkflow: boolean;
  records: ApprovalRecord[];
}

interface SourceECR {
  id: string;
  ecrNumber: string;
  title: string;
  status: string;
}

interface ImpactAnalysis {
  targetDocument: { id: string; documentType: string; version: number; status: string; remark: string | null };
  affectedParts: Array<{
    partId: string; partNumber: string; partName: string;
    relatedDocuments: Array<{ id: string; documentType: string; version: number; status: string }>;
    appearsInBOMs: Array<{ productId: string; productCode: string; productName: string }>;
  }>;
  affectedProducts: Array<{ productId: string; productCode: string; productName: string }>;
  summary: { totalParts: number; totalProducts: number; totalRelatedDocs: number };
}

// ─── 常數 ─────────────────────────────────────────────────────────────────────
const STATUS_MAP: Record<string, { color: string; label: string }> = {
  PENDING: { color: 'orange', label: '待審核' },
  APPROVED: { color: 'green', label: '已核准' },
  REJECTED: { color: 'red', label: '已退回' },
};

const DOC_TYPE_LABEL: Record<string, string> = {
  PART_DRAWING: '零部件圖紙', PRODUCT_DRAWING: '成品圖紙',
  SPEC: '產品規格書', SOP: '作業標準書', QC: '檢驗規範',
};

const STEP_STATUS_MAP: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
  PENDING: { icon: <ClockCircleOutlined />, color: '#faad14', label: '待審核' },
  APPROVED: { icon: <CheckCircleOutlined />, color: '#52c41a', label: '已核准' },
  REJECTED: { icon: <CloseCircleOutlined />, color: '#ff4d4f', label: '已退回' },
  CANCELLED: { icon: <MinusCircleOutlined />, color: '#bfbfbf', label: '已取消' },
};

function docLabel(doc: ECNItem['document']) {
  const part = doc.parts?.[0]?.part;
  const product = doc.products?.[0]?.product;
  const owner = part ? part.partNumber : product ? product.productCode : '-';
  return `${DOC_TYPE_LABEL[doc.documentType] || doc.documentType} (${owner}) R${doc.version}`;
}

// ─── 元件 ─────────────────────────────────────────────────────────────────────
const ECNsPage: React.FC = () => {
  const { user } = useAuth();
  const [ecns, setEcns] = useState<ECNItem[]>([]);
  const [documents, setDocuments] = useState<DocumentOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [detailModal, setDetailModal] = useState<ECNItem | null>(null);
  const [impactAnalysis, setImpactAnalysis] = useState<ImpactAnalysis | null>(null);
  const [impactLoading, setImpactLoading] = useState(false);
  const [impactViewed, setImpactViewed] = useState(false);
  const [approvalStatus, setApprovalStatus] = useState<ApprovalStatus | null>(null);
  const [approvalLoading, setApprovalLoading] = useState(false);
  const [approvalComment, setApprovalComment] = useState('');
  const [approvalActionLoading, setApprovalActionLoading] = useState(false);
  const [sourceEcr, setSourceEcr] = useState<SourceECR | null>(null);
  const [form] = Form.useForm();

  // ── 資料載入 ──────────────────────────────────────────────────────────────
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
    setDocuments(res.data.data ?? res.data);
  };

  useEffect(() => { fetchECNs(); fetchDocuments(); }, []);

  const fetchApprovalStatus = async (ecnId: string) => {
    setApprovalLoading(true);
    try {
      const res = await client.get(`/ecns/${ecnId}/approval-status`);
      setApprovalStatus(res.data);
    } catch { /* silent */ }
    finally { setApprovalLoading(false); }
  };

  const openDetail = async (ecn: ECNItem) => {
    setDetailModal(ecn);
    setImpactAnalysis(null);
    setImpactViewed(false);
    setApprovalStatus(null);
    setApprovalComment('');
    setSourceEcr(null);

    setImpactLoading(true);
    setApprovalLoading(true);

    client.get(`/ecns/${ecn.id}/impact-analysis`)
      .then((r) => setImpactAnalysis(r.data))
      .catch(() => {})
      .finally(() => setImpactLoading(false));

    client.get(`/ecns/${ecn.id}/approval-status`)
      .then((r) => setApprovalStatus(r.data))
      .catch(() => {})
      .finally(() => setApprovalLoading(false));

    client.get(`/ecrs?ecnId=${ecn.id}`)
      .then((r) => { if (r.data?.length > 0) setSourceEcr(r.data[0]); })
      .catch(() => {});
  };

  // ── 建立 ECN ──────────────────────────────────────────────────────────────
  const handleCreate = async (values: any) => {
    try {
      const payload = { ...values, dueDate: values.dueDate ? values.dueDate.toISOString() : null };
      await client.post('/ecns', payload);
      message.success('ECN 建立成功');
      setModalVisible(false);
      form.resetFields();
      fetchECNs();
    } catch (error: any) {
      message.error(error.response?.data?.error || '建立失敗');
    }
  };

  // ── 舊版 ADMIN 單道審核（無 workflow 時） ────────────────────────────────
  const handleLegacyApprove = async (id: string) => {
    try {
      await client.put(`/ecns/${id}/approve`);
      message.success('已核准');
      fetchECNs();
      setDetailModal(null);
    } catch (error: any) {
      message.error(error.response?.data?.error || '核准失敗');
    }
  };

  const handleLegacyReject = async (id: string) => {
    try {
      await client.put(`/ecns/${id}/reject`);
      message.success('已退回');
      fetchECNs();
      setDetailModal(null);
    } catch (error: any) {
      message.error(error.response?.data?.error || '退回失敗');
    }
  };

  // ── Workflow 審核 ────────────────────────────────────────────────────────
  const handleWorkflowApprove = async () => {
    if (!detailModal) return;
    setApprovalActionLoading(true);
    try {
      const res = await client.put(`/ecns/${detailModal.id}/approve`, { comment: approvalComment });
      if (res.data.isLastStep === false) {
        message.success(res.data.message || '此道審核已通過');
        fetchApprovalStatus(detailModal.id);
        // 更新 detailModal 的 ECN 資料不需要 refetch，只更新審核狀態
      } else {
        message.success('ECN 已核准');
        fetchECNs();
        setDetailModal(null);
      }
      setApprovalComment('');
    } catch (error: any) {
      message.error(error.response?.data?.error || '核准失敗');
    } finally {
      setApprovalActionLoading(false);
    }
  };

  const handleWorkflowReject = async () => {
    if (!detailModal) return;
    setApprovalActionLoading(true);
    try {
      await client.put(`/ecns/${detailModal.id}/reject`, { comment: approvalComment });
      message.success('已退回');
      fetchECNs();
      setDetailModal(null);
      setApprovalComment('');
    } catch (error: any) {
      message.error(error.response?.data?.error || '退回失敗');
    } finally {
      setApprovalActionLoading(false);
    }
  };

  // ── 判斷當前使用者是否可操作 workflow ────────────────────────────────────
  const currentPendingRecord = approvalStatus?.hasWorkflow
    ? approvalStatus.records.find((r) => r.status === 'PENDING')
    : null;
  const canActOnWorkflow =
    !!currentPendingRecord &&
    detailModal?.status === 'PENDING' &&
    user?.role === currentPendingRecord.step.approverRole;

  // 舊版模式：無 workflow 且 ADMIN 且 ECN 為 PENDING
  const canLegacyReview =
    !approvalLoading &&
    !approvalStatus?.hasWorkflow &&
    detailModal?.status === 'PENDING' &&
    user?.role === 'ADMIN';

  // ── 列表欄位 ──────────────────────────────────────────────────────────────
  const columns = [
    {
      title: 'ECN 編號', dataIndex: 'ecnNo', key: 'ecnNo',
      render: (v: string, r: ECNItem) => r.isOverdue
        ? <Space><WarningOutlined style={{ color: '#ff4d4f' }} /><span>{v}</span></Space>
        : v,
    },
    { title: '標題', dataIndex: 'title', key: 'title' },
    {
      title: '狀態', dataIndex: 'status',
      render: (v: string) => {
        const s = STATUS_MAP[v] || { color: 'default', label: v };
        return <Tag color={s.color}>{s.label}</Tag>;
      },
    },
    {
      title: '截止日期', dataIndex: 'dueDate', key: 'dueDate', width: 150,
      render: (v: string | null, r: ECNItem) => {
        if (!v) return '-';
        const label = dayjs(v).format('YYYY-MM-DD');
        return r.isOverdue
          ? <Badge dot color="red"><Tag color="red" style={{ marginLeft: 4 }}>{label} 已逾期</Tag></Badge>
          : label;
      },
    },
    { title: '關聯文件', render: (_: any, r: ECNItem) => docLabel(r.document) },
    { title: '審核人', render: (_: any, r: ECNItem) => r.reviewedBy?.name || '-' },
    {
      title: '操作',
      render: (_: any, r: ECNItem) => (
        <Space>
          <Button type="link" icon={<EyeOutlined />} onClick={() => openDetail(r)}>詳情</Button>
        </Space>
      ),
    },
  ];

  // ── Steps 資料組裝 ────────────────────────────────────────────────────────
  const buildStepItems = (records: ApprovalRecord[]) => {
    const sorted = [...records].sort((a, b) => a.order - b.order);
    const firstPendingIndex = sorted.findIndex((r) => r.status === 'PENDING');

    return sorted.map((r, i) => {
      let status: 'wait' | 'process' | 'finish' | 'error';
      if (r.status === 'APPROVED') status = 'finish';
      else if (r.status === 'REJECTED') status = 'error';
      else if (r.status === 'CANCELLED') status = 'wait';
      else status = i === firstPendingIndex ? 'process' : 'wait';

      const sm = STEP_STATUS_MAP[r.status];
      return {
        title: (
          <Space size={4}>
            <span>{r.step.name}</span>
            <Tag color={sm.color} style={{ fontSize: 11 }}>{sm.label}</Tag>
          </Space>
        ),
        subTitle: <span style={{ fontSize: 12, color: '#8c8c8c' }}>需要：{r.step.approverRole}</span>,
        description: r.status !== 'PENDING' && r.status !== 'CANCELLED' ? (
          <div style={{ fontSize: 12 }}>
            {r.approver && <div style={{ color: '#595959' }}>審核人：{r.approver.name}</div>}
            {r.comment && <div style={{ color: '#8c8c8c', fontStyle: 'italic' }}>「{r.comment}」</div>}
            {r.actionAt && <div style={{ color: '#bfbfbf' }}>{new Date(r.actionAt).toLocaleString()}</div>}
          </div>
        ) : r.status === 'CANCELLED' ? (
          <span style={{ fontSize: 12, color: '#bfbfbf', fontStyle: 'italic' }}>已因退回取消</span>
        ) : null,
        status,
      };
    });
  };

  // ── 渲染 ──────────────────────────────────────────────────────────────────
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

      <Table
        rowKey="id" columns={columns} dataSource={ecns} loading={loading}
        rowClassName={(r: ECNItem) => r.isOverdue ? 'ant-table-row-overdue' : ''}
      />

      {/* ── 建立 ECN Modal ── */}
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
            <Select showSearch placeholder="搜尋文件..." options={documents.map((d) => ({
              value: d.id,
              label: `${DOC_TYPE_LABEL[d.documentType] || d.documentType} - ${d.parts?.[0]?.part?.partNumber || d.products?.[0]?.product?.productCode || '未知'} (R${d.version})`,
            }))} />
          </Form.Item>
          <Form.Item name="dueDate" label="截止日期（選填）">
            <DatePicker style={{ width: '100%' }} placeholder="選擇截止日期" disabledDate={(d) => d.isBefore(dayjs(), 'day')} />
          </Form.Item>
        </Form>
      </Modal>

      {/* ── 詳情 Modal ── */}
      <Modal
        title={`ECN 詳情 - ${detailModal?.ecnNo}`}
        open={!!detailModal}
        onCancel={() => setDetailModal(null)}
        width={800}
        footer={
          canLegacyReview ? (
            <Space>
              {!impactViewed && (
                <Typography.Text type="warning" style={{ marginRight: 8 }}>
                  <InfoCircleOutlined /> 建議先查看影響範圍分析再審核
                </Typography.Text>
              )}
              <Button type="primary" icon={<CheckOutlined />} onClick={() => handleLegacyApprove(detailModal!.id)}>核准</Button>
              <Button danger icon={<CloseOutlined />} onClick={() => handleLegacyReject(detailModal!.id)}>退回</Button>
            </Space>
          ) : null
        }
      >
        {detailModal && (
          <>
            {/* 基本資訊 */}
            <Descriptions bordered column={1} size="small">
              <Descriptions.Item label="標題">{detailModal.title}</Descriptions.Item>
              <Descriptions.Item label="說明">{detailModal.description}</Descriptions.Item>
              <Descriptions.Item label="狀態">
                <Tag color={STATUS_MAP[detailModal.status]?.color}>{STATUS_MAP[detailModal.status]?.label}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="截止日期">
                {detailModal.dueDate
                  ? <Space><span>{dayjs(detailModal.dueDate).format('YYYY-MM-DD')}</span>{detailModal.isOverdue && <Tag color="red">已逾期</Tag>}</Space>
                  : '未設定'}
              </Descriptions.Item>
              <Descriptions.Item label="提出時間">{new Date(detailModal.createdAt).toLocaleString()}</Descriptions.Item>
              <Descriptions.Item label="最終審核人">{detailModal.reviewedBy?.name || '尚未審核'}</Descriptions.Item>
              {sourceEcr && (
                <Descriptions.Item label="來源 ECR">
                  <Space>
                    <Tag color="purple">{sourceEcr.ecrNumber}</Tag>
                    <span>{sourceEcr.title}</span>
                  </Space>
                </Descriptions.Item>
              )}
            </Descriptions>

            <Divider />

            {/* 關聯文件 */}
            <Card title="關聯文件資訊" size="small">
              <p>類型：{DOC_TYPE_LABEL[detailModal.document.documentType] || detailModal.document.documentType}</p>
              <p>版本：R{detailModal.document.version}</p>
              <p>歸屬：
                {detailModal.document.parts?.[0]?.part
                  ? `${detailModal.document.parts[0].part.partNumber} - ${detailModal.document.parts[0].part.name}`
                  : detailModal.document.products?.[0]?.product
                    ? detailModal.document.products[0].product.productCode
                    : '-'}
              </p>
            </Card>

            <Divider />

            {/* 審核進度 */}
            <Collapse
              defaultActiveKey={detailModal.status === 'PENDING' ? ['approval'] : []}
              items={[{
                key: 'approval',
                label: (
                  <Space>
                    <CheckCircleOutlined />
                    <span>審核進度</span>
                    {approvalLoading && <Spin size="small" />}
                    {approvalStatus?.hasWorkflow && (() => {
                      const total = approvalStatus.records.length;
                      const done = approvalStatus.records.filter((r) => r.status === 'APPROVED').length;
                      const rejected = approvalStatus.records.some((r) => r.status === 'REJECTED');
                      return rejected
                        ? <Tag color="red">已退回</Tag>
                        : done === total
                          ? <Tag color="green">全部通過</Tag>
                          : <Tag color="blue">{done}/{total} 道</Tag>;
                    })()}
                    {!approvalLoading && !approvalStatus?.hasWorkflow && detailModal.status === 'PENDING' && (
                      <Tag color="default">舊版單道審核</Tag>
                    )}
                  </Space>
                ),
                children: approvalLoading ? (
                  <div style={{ textAlign: 'center', padding: 24 }}><Spin /></div>
                ) : approvalStatus?.hasWorkflow ? (
                  <div>
                    <Steps
                      items={buildStepItems(approvalStatus.records)}
                      size="small"
                      style={{ marginBottom: canActOnWorkflow ? 20 : 0 }}
                    />
                    {/* 當前使用者可操作的節點 */}
                    {canActOnWorkflow && (
                      <div style={{
                        marginTop: 16, padding: '16px 20px',
                        background: '#f0f7ff', border: '1px solid #91caff',
                        borderRadius: 8,
                      }}>
                        <Typography.Text strong style={{ display: 'block', marginBottom: 8 }}>
                          您負責審核：第 {currentPendingRecord!.order} 道「{currentPendingRecord!.step.name}」
                        </Typography.Text>
                        <Input.TextArea
                          placeholder="審核意見（選填）"
                          value={approvalComment}
                          onChange={(e) => setApprovalComment(e.target.value)}
                          rows={3}
                          style={{ marginBottom: 12 }}
                        />
                        <Space>
                          <Button
                            type="primary"
                            icon={<CheckOutlined />}
                            loading={approvalActionLoading}
                            onClick={handleWorkflowApprove}
                          >
                            核准此道
                          </Button>
                          <Button
                            danger
                            icon={<CloseOutlined />}
                            loading={approvalActionLoading}
                            onClick={handleWorkflowReject}
                          >
                            退回
                          </Button>
                        </Space>
                      </div>
                    )}
                    {/* 非當前使用者角色：提示誰能審 */}
                    {!canActOnWorkflow && currentPendingRecord && detailModal.status === 'PENDING' && (
                      <Tooltip title={`需要 ${currentPendingRecord.step.approverRole} 角色才能審核此道`}>
                        <Alert
                          type="info"
                          showIcon
                          message={`目前等待「${currentPendingRecord.step.name}」（${currentPendingRecord.step.approverRole}）審核`}
                          style={{ marginTop: 16 }}
                        />
                      </Tooltip>
                    )}
                  </div>
                ) : (
                  <div style={{ padding: '8px 0' }}>
                    {detailModal.status === 'PENDING' && user?.role === 'ADMIN' ? (
                      <Alert type="info" showIcon message="此 ECN 使用舊版單道審核，請使用底部按鈕進行操作。" />
                    ) : detailModal.status === 'PENDING' ? (
                      <Alert type="info" showIcon message="此 ECN 使用舊版單道審核，等待 ADMIN 審核中。" />
                    ) : (
                      <Alert
                        type={detailModal.status === 'APPROVED' ? 'success' : 'error'}
                        showIcon
                        message={`此 ECN 已${detailModal.status === 'APPROVED' ? '核准' : '退回'}（舊版單道審核）`}
                      />
                    )}
                  </div>
                ),
              }]}
            />

            <Divider />

            {/* 影響範圍分析 */}
            <Collapse
              onChange={(keys) => { if (keys.length > 0) setImpactViewed(true); }}
              items={[{
                key: 'impact',
                label: (
                  <Space>
                    <ApartmentOutlined />
                    <span>變更影響範圍分析</span>
                    {canLegacyReview && !impactViewed && <Tag color="orange">建議查看</Tag>}
                    {impactAnalysis && (
                      <Space size={4}>
                        <Tag color="blue">{impactAnalysis.summary.totalParts} 個料號</Tag>
                        <Tag color="purple">{impactAnalysis.summary.totalProducts} 個成品</Tag>
                        <Tag color="cyan">{impactAnalysis.summary.totalRelatedDocs} 份相關文件</Tag>
                      </Space>
                    )}
                  </Space>
                ),
                children: impactLoading ? (
                  <div style={{ textAlign: 'center', padding: 24 }}><Spin /></div>
                ) : impactAnalysis ? (
                  <div>
                    <Row gutter={16} style={{ marginBottom: 16 }}>
                      <Col span={8}><Statistic title="受影響料號" value={impactAnalysis.summary.totalParts} suffix="個" /></Col>
                      <Col span={8}><Statistic title="受影響成品" value={impactAnalysis.summary.totalProducts} suffix="個" /></Col>
                      <Col span={8}><Statistic title="其他 RELEASED 文件" value={impactAnalysis.summary.totalRelatedDocs} suffix="份" /></Col>
                    </Row>
                    {impactAnalysis.summary.totalRelatedDocs > 0 && (
                      <Alert type="warning" showIcon
                        message={`此變更影響 ${impactAnalysis.summary.totalRelatedDocs} 份已發佈文件，核准後請確認下游文件是否需同步更新`}
                        style={{ marginBottom: 12 }}
                      />
                    )}
                    {impactAnalysis.affectedParts.length > 0 && (
                      <>
                        <Typography.Text strong>關聯料號</Typography.Text>
                        <Collapse size="small" style={{ marginTop: 8, marginBottom: 12 }} items={
                          impactAnalysis.affectedParts.map((p) => ({
                            key: p.partId,
                            label: (
                              <Space>
                                <span>{p.partNumber} - {p.partName}</span>
                                {p.relatedDocuments.length > 0 && <Tag color="orange">{p.relatedDocuments.length} 份 RELEASED 文件</Tag>}
                                {p.appearsInBOMs.length > 0 && <Tag color="geekblue">出現在 {p.appearsInBOMs.length} 個 BOM</Tag>}
                              </Space>
                            ),
                            children: (
                              <div>
                                {p.relatedDocuments.length > 0 && (
                                  <>
                                    <Typography.Text type="secondary">其他 RELEASED 關聯文件：</Typography.Text>
                                    <ul style={{ margin: '4px 0 8px 0', paddingLeft: 20 }}>
                                      {p.relatedDocuments.map((d) => (
                                        <li key={d.id}>{DOC_TYPE_LABEL[d.documentType] || d.documentType} R{d.version}<Tag color="green" style={{ marginLeft: 6 }}>{d.status}</Tag></li>
                                      ))}
                                    </ul>
                                  </>
                                )}
                                {p.appearsInBOMs.length > 0 && (
                                  <>
                                    <Typography.Text type="secondary">出現在以下成品 BOM：</Typography.Text>
                                    <ul style={{ margin: '4px 0 0 0', paddingLeft: 20 }}>
                                      {p.appearsInBOMs.map((b) => <li key={b.productId}>{b.productCode} - {b.productName}</li>)}
                                    </ul>
                                  </>
                                )}
                                {p.relatedDocuments.length === 0 && p.appearsInBOMs.length === 0 && (
                                  <Typography.Text type="secondary">無其他下游關聯</Typography.Text>
                                )}
                              </div>
                            ),
                          }))
                        } />
                      </>
                    )}
                    {impactAnalysis.affectedProducts.length > 0 && (
                      <>
                        <Typography.Text strong>直接關聯成品</Typography.Text>
                        <ul style={{ margin: '8px 0 0 0', paddingLeft: 20 }}>
                          {impactAnalysis.affectedProducts.map((p) => <li key={p.productId}>{p.productCode} - {p.productName}</li>)}
                        </ul>
                      </>
                    )}
                    {impactAnalysis.affectedParts.length === 0 && impactAnalysis.affectedProducts.length === 0 && (
                      <Typography.Text type="secondary">此文件目前無關聯料號或成品</Typography.Text>
                    )}
                  </div>
                ) : (
                  <Typography.Text type="secondary">載入失敗</Typography.Text>
                ),
              }]}
            />
          </>
        )}
      </Modal>

      <style>{`
        .ant-table-row-overdue td { background-color: #fff2f0 !important; }
      `}</style>
    </div>
  );
};

export default ECNsPage;
