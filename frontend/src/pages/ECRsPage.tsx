import React, { useEffect, useState } from 'react';
import {
  Table, Button, Modal, Form, Input, Select, message, Tag, Space, Descriptions,
  Divider, Card, Spin, Typography, Steps, Alert, Collapse,
} from 'antd';
import {
  PlusOutlined, CheckOutlined, CloseOutlined, EyeOutlined, SendOutlined,
  SwapOutlined, CheckCircleOutlined, ClockCircleOutlined,
  CloseCircleOutlined, MinusCircleOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';

// ─── 型別 ─────────────────────────────────────────────────────────────────────
type EcrStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'CONVERTED';

interface DocumentInfo {
  documentType: string;
  version: number;
  parts: Array<{ part: { partNumber: string } }>;
  products: Array<{ product: { productCode: string } }>;
}

interface ECRItem {
  id: string;
  ecrNumber: string;
  title: string;
  description: string | null;
  reason: string | null;
  documentId: string;
  requesterId: string;
  status: EcrStatus;
  ecnId: string | null;
  createdAt: string;
  requester: { id: string; name: string } | null;
  document: DocumentInfo;
}

interface ECRDetail extends ECRItem {
  convertedEcn: { id: string; ecnNo: string } | null;
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

interface DocumentOption {
  id: string;
  documentType: string;
  version: number;
  parts: Array<{ part: { partNumber: string } }>;
  products: Array<{ product: { productCode: string } }>;
}

// ─── 常數 ─────────────────────────────────────────────────────────────────────
const STATUS_CONFIG: Record<EcrStatus, { color: string; label: string }> = {
  DRAFT:     { color: 'default',  label: '草稿' },
  SUBMITTED: { color: 'orange',   label: '審核中' },
  APPROVED:  { color: 'green',    label: '已核准' },
  REJECTED:  { color: 'red',      label: '已退回' },
  CONVERTED: { color: 'blue',     label: '已轉為 ECN' },
};

const DOC_TYPE_LABEL: Record<string, string> = {
  PART_DRAWING: '零部件圖紙', PRODUCT_DRAWING: '成品圖紙',
  SPEC: '產品規格書', SOP: '作業標準書', QC: '檢驗規範',
};

const STEP_STATUS_CONFIG = {
  PENDING:   { icon: <ClockCircleOutlined />,  color: '#faad14', label: '待審核' },
  APPROVED:  { icon: <CheckCircleOutlined />,  color: '#52c41a', label: '已核准' },
  REJECTED:  { icon: <CloseCircleOutlined />,  color: '#ff4d4f', label: '已退回' },
  CANCELLED: { icon: <MinusCircleOutlined />,  color: '#bfbfbf', label: '已取消' },
};

function docOwner(doc: DocumentInfo) {
  const part = doc.parts?.[0]?.part;
  const product = doc.products?.[0]?.product;
  return part ? part.partNumber : product ? product.productCode : '-';
}

// ─── 元件 ─────────────────────────────────────────────────────────────────────
const ECRsPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [ecrs, setEcrs] = useState<ECRItem[]>([]);
  const [documents, setDocuments] = useState<DocumentOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  const [createVisible, setCreateVisible] = useState(false);
  const [createForm] = Form.useForm();

  const [detailItem, setDetailItem] = useState<ECRItem | null>(null);
  const [detailData, setDetailData] = useState<ECRDetail | null>(null);

  const [approvalStatus, setApprovalStatus] = useState<ApprovalStatus | null>(null);
  const [approvalLoading, setApprovalLoading] = useState(false);
  const [approvalComment, setApprovalComment] = useState('');
  const [approvalActionLoading, setApprovalActionLoading] = useState(false);

  const [submitLoading, setSubmitLoading] = useState(false);
  const [convertLoading, setConvertLoading] = useState(false);

  // ── 資料載入 ───────────────────────────────────────────────────────────────
  const fetchECRs = async () => {
    setLoading(true);
    try {
      const params = statusFilter !== 'ALL' ? `?status=${statusFilter}` : '';
      const res = await client.get(`/ecrs${params}`);
      setEcrs(res.data);
    } finally {
      setLoading(false);
    }
  };

  const fetchDocuments = async () => {
    const res = await client.get('/documents');
    setDocuments(res.data.data ?? res.data);
  };

  useEffect(() => { fetchECRs(); }, [statusFilter]);
  useEffect(() => { fetchDocuments(); }, []);

  const openDetail = async (ecr: ECRItem) => {
    setDetailItem(ecr);
    setDetailData(null);
    setApprovalStatus(null);
    setApprovalComment('');
    setApprovalLoading(true);

    client.get(`/ecrs/${ecr.id}`)
      .then((r) => setDetailData(r.data))
      .catch(() => {});

    client.get(`/ecrs/${ecr.id}/approval-status`)
      .then((r) => setApprovalStatus(r.data))
      .catch(() => {})
      .finally(() => setApprovalLoading(false));
  };

  // ── 建立 ECR ───────────────────────────────────────────────────────────────
  const handleCreate = async (values: any) => {
    try {
      await client.post('/ecrs', values);
      message.success('ECR 建立成功');
      setCreateVisible(false);
      createForm.resetFields();
      fetchECRs();
    } catch (error: any) {
      message.error(error.response?.data?.error || '建立失敗');
    }
  };

  // ── 提交審核 ───────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!detailItem) return;
    setSubmitLoading(true);
    try {
      await client.put(`/ecrs/${detailItem.id}/submit`);
      message.success('已提交審核');
      fetchECRs();
      setDetailItem(null);
    } catch (error: any) {
      message.error(error.response?.data?.error || '提交失敗');
    } finally {
      setSubmitLoading(false);
    }
  };

  // ── Workflow 核准 ──────────────────────────────────────────────────────────
  const handleApprove = async () => {
    if (!detailItem) return;
    setApprovalActionLoading(true);
    try {
      const res = await client.put(`/ecrs/${detailItem.id}/approve`, { comment: approvalComment });
      if (res.data.isLastStep === false) {
        message.success(res.data.message || '此道審核已通過');
        client.get(`/ecrs/${detailItem.id}/approval-status`).then((r) => setApprovalStatus(r.data)).catch(() => {});
      } else {
        message.success('ECR 審核通過');
        fetchECRs();
        setDetailItem(null);
      }
      setApprovalComment('');
    } catch (error: any) {
      message.error(error.response?.data?.error || '核准失敗');
    } finally {
      setApprovalActionLoading(false);
    }
  };

  // ── Workflow 退回 ──────────────────────────────────────────────────────────
  const handleReject = async () => {
    if (!detailItem) return;
    setApprovalActionLoading(true);
    try {
      await client.put(`/ecrs/${detailItem.id}/reject`, { comment: approvalComment });
      message.success('ECR 已退回');
      fetchECRs();
      setDetailItem(null);
      setApprovalComment('');
    } catch (error: any) {
      message.error(error.response?.data?.error || '退回失敗');
    } finally {
      setApprovalActionLoading(false);
    }
  };

  // ── 轉換為 ECN ─────────────────────────────────────────────────────────────
  const handleConvert = async () => {
    if (!detailItem) return;
    setConvertLoading(true);
    try {
      const res = await client.put(`/ecrs/${detailItem.id}/convert`);
      message.success(`已建立 ECN：${res.data.ecn.ecnNo}`);
      fetchECRs();
      setDetailItem(null);
      navigate('/ecns');
    } catch (error: any) {
      message.error(error.response?.data?.error || '轉換失敗');
    } finally {
      setConvertLoading(false);
    }
  };

  // ── 判斷當前可操作性 ───────────────────────────────────────────────────────
  const currentPendingRecord = approvalStatus?.hasWorkflow
    ? approvalStatus.records.find((r) => r.status === 'PENDING')
    : null;

  const canActOnWorkflow =
    !!currentPendingRecord &&
    detailItem?.status === 'SUBMITTED' &&
    user?.role === currentPendingRecord.step.approverRole;

  const canLegacyApprove =
    !approvalLoading &&
    !approvalStatus?.hasWorkflow &&
    detailItem?.status === 'SUBMITTED' &&
    user?.role === 'ADMIN';

  const canSubmit = detailItem?.status === 'DRAFT' &&
    (detailItem.requesterId === user?.id || user?.role === 'ADMIN');

  const canConvert = detailItem?.status === 'APPROVED' &&
    (detailItem.requesterId === user?.id || user?.role === 'ADMIN');

  // ── Steps 組裝 ─────────────────────────────────────────────────────────────
  const buildStepItems = (records: ApprovalRecord[]) => {
    const sorted = [...records].sort((a, b) => a.order - b.order);
    const firstPendingIdx = sorted.findIndex((r) => r.status === 'PENDING');

    return sorted.map((r, i) => {
      const cfg = STEP_STATUS_CONFIG[r.status];
      let status: 'wait' | 'process' | 'finish' | 'error';
      if (r.status === 'APPROVED') status = 'finish';
      else if (r.status === 'REJECTED') status = 'error';
      else if (r.status === 'CANCELLED') status = 'wait';
      else status = i === firstPendingIdx ? 'process' : 'wait';

      return {
        title: (
          <Space size={4}>
            <span>{r.step.name}</span>
            <Tag color={cfg.color} style={{ fontSize: 11 }}>{cfg.label}</Tag>
          </Space>
        ),
        subTitle: <span style={{ fontSize: 12, color: '#8c8c8c' }}>需要：{r.step.approverRole}</span>,
        description: r.status !== 'PENDING' && r.status !== 'CANCELLED' ? (
          <div style={{ fontSize: 12 }}>
            {r.approver && <div>{r.approver.name}</div>}
            {r.comment && <div style={{ color: '#8c8c8c', fontStyle: 'italic' }}>「{r.comment}」</div>}
            {r.actionAt && <div style={{ color: '#bfbfbf' }}>{new Date(r.actionAt).toLocaleString()}</div>}
          </div>
        ) : r.status === 'CANCELLED' ? (
          <span style={{ fontSize: 12, color: '#bfbfbf', fontStyle: 'italic' }}>已取消</span>
        ) : null,
        status,
      };
    });
  };

  // ── Modal Footer ───────────────────────────────────────────────────────────
  const modalFooter = () => {
    if (canSubmit) {
      return (
        <Space>
          <Button onClick={() => setDetailItem(null)}>關閉</Button>
          <Button type="primary" icon={<SendOutlined />} loading={submitLoading} onClick={handleSubmit}>
            提交審核
          </Button>
        </Space>
      );
    }
    if (canConvert) {
      return (
        <Space>
          <Button onClick={() => setDetailItem(null)}>關閉</Button>
          <Button type="primary" icon={<SwapOutlined />} loading={convertLoading} onClick={handleConvert}>
            轉換為 ECN
          </Button>
        </Space>
      );
    }
    if (canLegacyApprove) {
      return (
        <Space>
          <Button type="primary" icon={<CheckOutlined />} onClick={handleApprove} loading={approvalActionLoading}>核准</Button>
          <Button danger icon={<CloseOutlined />} onClick={handleReject} loading={approvalActionLoading}>退回</Button>
        </Space>
      );
    }
    return <Button onClick={() => setDetailItem(null)}>關閉</Button>;
  };

  // ── 列表欄位 ───────────────────────────────────────────────────────────────
  const columns = [
    { title: 'ECR 編號', dataIndex: 'ecrNumber', key: 'ecrNumber', width: 160 },
    { title: '標題', dataIndex: 'title', key: 'title', ellipsis: true },
    { title: '申請者', render: (_: any, r: ECRItem) => r.requester?.name || r.requesterId, width: 100 },
    {
      title: '關聯文件', width: 200,
      render: (_: any, r: ECRItem) =>
        `${DOC_TYPE_LABEL[r.document?.documentType] || r.document?.documentType || '-'} (${docOwner(r.document)}) R${r.document?.version}`,
    },
    {
      title: '狀態', dataIndex: 'status', width: 110,
      render: (v: EcrStatus) => {
        const cfg = STATUS_CONFIG[v] || { color: 'default', label: v };
        return <Tag color={cfg.color}>{cfg.label}</Tag>;
      },
    },
    {
      title: '建立時間', dataIndex: 'createdAt', width: 110,
      render: (v: string) => new Date(v).toLocaleDateString('zh-TW'),
    },
    {
      title: '操作', width: 80,
      render: (_: any, r: ECRItem) => (
        <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => openDetail(r)}>詳情</Button>
      ),
    },
  ];

  // ── 渲染 ───────────────────────────────────────────────────────────────────
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2>ECR 變更提案管理</h2>
        <Space>
          <Select
            value={statusFilter}
            onChange={setStatusFilter}
            style={{ width: 140 }}
            options={[
              { value: 'ALL', label: '全部狀態' },
              { value: 'DRAFT', label: '草稿' },
              { value: 'SUBMITTED', label: '審核中' },
              { value: 'APPROVED', label: '已核准' },
              { value: 'REJECTED', label: '已退回' },
              { value: 'CONVERTED', label: '已轉為 ECN' },
            ]}
          />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { setCreateVisible(true); createForm.resetFields(); }}>
            新增 ECR
          </Button>
        </Space>
      </div>

      <Table rowKey="id" columns={columns} dataSource={ecrs} loading={loading} />

      {/* ── 建立 Modal ── */}
      <Modal
        title="新增變更提案（ECR）"
        open={createVisible}
        onOk={() => createForm.submit()}
        onCancel={() => setCreateVisible(false)}
        width={580}
        okText="建立"
      >
        <Form form={createForm} onFinish={handleCreate} layout="vertical">
          <Form.Item name="title" label="標題" rules={[{ required: true, message: '請輸入標題' }]}>
            <Input placeholder="簡述變更需求" />
          </Form.Item>
          <Form.Item name="description" label="詳細說明（選填）">
            <Input.TextArea rows={3} placeholder="詳細描述變更內容" />
          </Form.Item>
          <Form.Item name="reason" label="申請原因（選填）">
            <Input.TextArea rows={2} placeholder="說明為何需要此變更" />
          </Form.Item>
          <Form.Item name="documentId" label="關聯文件" rules={[{ required: true, message: '請選擇文件' }]}>
            <Select
              showSearch
              placeholder="搜尋文件..."
              options={documents.map((d) => ({
                value: d.id,
                label: `${DOC_TYPE_LABEL[d.documentType] || d.documentType} - ${d.parts?.[0]?.part?.partNumber || d.products?.[0]?.product?.productCode || '未知'} (R${d.version})`,
              }))}
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* ── 詳情 Modal ── */}
      <Modal
        title={`ECR 詳情 - ${detailItem?.ecrNumber}`}
        open={!!detailItem}
        onCancel={() => setDetailItem(null)}
        width={760}
        footer={modalFooter()}
      >
        {detailItem && (
          <>
            {/* 基本資訊 */}
            <Descriptions bordered column={1} size="small">
              <Descriptions.Item label="ECR 編號">
                <Typography.Text code>{detailItem.ecrNumber}</Typography.Text>
              </Descriptions.Item>
              <Descriptions.Item label="標題">{detailItem.title}</Descriptions.Item>
              {(detailData?.description || detailItem.description) && (
                <Descriptions.Item label="詳細說明">{detailData?.description || detailItem.description}</Descriptions.Item>
              )}
              {(detailData?.reason || detailItem.reason) && (
                <Descriptions.Item label="申請原因">{detailData?.reason || detailItem.reason}</Descriptions.Item>
              )}
              <Descriptions.Item label="狀態">
                <Tag color={STATUS_CONFIG[detailItem.status]?.color}>{STATUS_CONFIG[detailItem.status]?.label}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="申請者">{detailItem.requester?.name || detailItem.requesterId}</Descriptions.Item>
              <Descriptions.Item label="建立時間">{new Date(detailItem.createdAt).toLocaleString()}</Descriptions.Item>
              {detailData?.convertedEcn && (
                <Descriptions.Item label="已轉為 ECN">
                  <Space>
                    <Typography.Text code>{detailData.convertedEcn.ecnNo}</Typography.Text>
                    <Button
                      size="small" type="link"
                      onClick={() => { setDetailItem(null); navigate('/ecns'); }}
                    >
                      前往查看
                    </Button>
                  </Space>
                </Descriptions.Item>
              )}
            </Descriptions>

            <Divider />

            {/* 關聯文件 */}
            <Card title="關聯文件" size="small">
              <p>類型：{DOC_TYPE_LABEL[detailItem.document?.documentType] || detailItem.document?.documentType}</p>
              <p>版本：R{detailItem.document?.version}</p>
              <p>歸屬：{docOwner(detailItem.document)}</p>
            </Card>

            {/* 審核進度（SUBMITTED 以後才顯示） */}
            {(detailItem.status === 'SUBMITTED' || detailItem.status === 'APPROVED' ||
              detailItem.status === 'REJECTED' || detailItem.status === 'CONVERTED') && (
              <>
                <Divider />
                <Collapse
                  defaultActiveKey={['approval']}
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
                            background: '#f0f7ff', border: '1px solid #91caff', borderRadius: 8,
                          }}>
                            <Typography.Text strong style={{ display: 'block', marginBottom: 8 }}>
                              您負責審核：第 {currentPendingRecord!.order} 道「{currentPendingRecord!.step.name}」
                            </Typography.Text>
                            <Input.TextArea
                              placeholder="審核意見（選填）"
                              value={approvalComment}
                              onChange={(e) => setApprovalComment(e.target.value)}
                              rows={3} style={{ marginBottom: 12 }}
                            />
                            <Space>
                              <Button type="primary" icon={<CheckOutlined />} loading={approvalActionLoading} onClick={handleApprove}>
                                核准此道
                              </Button>
                              <Button danger icon={<CloseOutlined />} loading={approvalActionLoading} onClick={handleReject}>
                                退回
                              </Button>
                            </Space>
                          </div>
                        )}
                        {!canActOnWorkflow && currentPendingRecord && detailItem.status === 'SUBMITTED' && (
                          <Alert
                            type="info" showIcon style={{ marginTop: 16 }}
                            message={`目前等待「${currentPendingRecord.step.name}」（${currentPendingRecord.step.approverRole}）審核`}
                          />
                        )}
                      </div>
                    ) : (
                      <Alert
                        type="info" showIcon
                        message={detailItem.status === 'SUBMITTED' && user?.role !== 'ADMIN'
                          ? '等待 ADMIN 審核中'
                          : '使用舊版單道審核，請使用底部按鈕操作'}
                      />
                    ),
                  }]}
                />
              </>
            )}
          </>
        )}
      </Modal>
    </div>
  );
};

export default ECRsPage;
