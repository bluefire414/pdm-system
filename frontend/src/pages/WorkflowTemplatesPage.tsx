import React, { useEffect, useState } from 'react';
import {
  Table, Button, Modal, Form, Input, Select, Switch, message, Tag, Space,
  Typography, Tooltip, Popconfirm,
} from 'antd';
import { PlusOutlined, EditOutlined, CheckCircleOutlined, StopOutlined } from '@ant-design/icons';
import client from '../api/client';

interface WorkflowStep {
  id?: string;
  name: string;
  approverRole: string;
  isRequired: boolean;
}

interface WorkflowTemplate {
  id: string;
  name: string;
  entityType: string;
  isActive: boolean;
  stepCount: number;
  isInUse: boolean;
  steps: (WorkflowStep & { id: string; order: number })[];
  createdAt: string;
}

const ROLE_OPTIONS = [
  { value: 'ADMIN', label: 'ADMIN（管理員）' },
  { value: 'ENGINEER', label: 'ENGINEER（工程師）' },
  { value: 'MOLD', label: 'MOLD（模具）' },
  { value: 'SALES', label: 'SALES（業務）' },
];

const ENTITY_OPTIONS = [{ value: 'ECN', label: 'ECN 工程變更' }];

const WorkflowTemplatesPage: React.FC = () => {
  const [templates, setTemplates] = useState<WorkflowTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<WorkflowTemplate | null>(null);
  const [form] = Form.useForm();

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const res = await client.get('/admin/workflow-templates');
      setTemplates(res.data);
    } catch {
      message.error('載入失敗');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchTemplates(); }, []);

  const openCreate = () => {
    setEditingTemplate(null);
    form.resetFields();
    form.setFieldsValue({ steps: [{ name: '', approverRole: 'ADMIN', isRequired: true }] });
    setModalVisible(true);
  };

  const openEdit = (tpl: WorkflowTemplate) => {
    setEditingTemplate(tpl);
    form.setFieldsValue({
      name: tpl.name,
      entityType: tpl.entityType,
      steps: tpl.steps.map((s) => ({
        name: s.name,
        approverRole: s.approverRole,
        isRequired: s.isRequired,
      })),
    });
    setModalVisible(true);
  };

  const handleSubmit = async (values: any) => {
    try {
      if (editingTemplate) {
        await client.put(`/admin/workflow-templates/${editingTemplate.id}`, values);
        message.success('已更新');
      } else {
        await client.post('/admin/workflow-templates', values);
        message.success('已建立，同類型舊範本已停用');
      }
      setModalVisible(false);
      fetchTemplates();
    } catch (error: any) {
      const msg = error.response?.data?.error || '操作失敗';
      message.error(msg);
    }
  };

  const toggleActive = async (tpl: WorkflowTemplate) => {
    try {
      await client.put(`/admin/workflow-templates/${tpl.id}`, { isActive: !tpl.isActive });
      message.success(tpl.isActive ? '已停用' : '已啟用（同類型舊範本已停用）');
      fetchTemplates();
    } catch (error: any) {
      message.error(error.response?.data?.error || '操作失敗');
    }
  };

  const columns = [
    { title: '範本名稱', dataIndex: 'name', key: 'name' },
    {
      title: '適用類型',
      dataIndex: 'entityType',
      render: (v: string) => <Tag color="blue">{v}</Tag>,
    },
    {
      title: '狀態',
      dataIndex: 'isActive',
      render: (v: boolean) => v
        ? <Tag color="green" icon={<CheckCircleOutlined />}>啟用中</Tag>
        : <Tag color="default" icon={<StopOutlined />}>停用</Tag>,
    },
    { title: '節點數', dataIndex: 'stepCount', render: (v: number) => `${v} 道` },
    {
      title: '使用中',
      dataIndex: 'isInUse',
      render: (v: boolean) => v
        ? <Tooltip title="已有進行中的審核記錄，節點不可修改"><Tag color="orange">使用中</Tag></Tooltip>
        : <Tag color="default">未使用</Tag>,
    },
    { title: '建立時間', dataIndex: 'createdAt', render: (v: string) => new Date(v).toLocaleDateString('zh-TW') },
    {
      title: '操作',
      render: (_: any, r: WorkflowTemplate) => (
        <Space>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEdit(r)}>編輯</Button>
          <Popconfirm
            title={r.isActive ? '確定停用此範本？' : '啟用此範本將停用同類型的其他範本，確定？'}
            onConfirm={() => toggleActive(r)}
          >
            <Button type="link" size="small" danger={r.isActive}>
              {r.isActive ? '停用' : '啟用'}
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2>審核流程範本管理</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新增範本</Button>
      </div>

      <Typography.Paragraph type="secondary">
        每個類型（ECN）只能有一個啟用中的範本。啟用新範本時，同類型舊範本自動停用。
        使用中的範本（已有進行中審核記錄）無法修改節點，請建立新範本取代。
      </Typography.Paragraph>

      <Table rowKey="id" columns={columns} dataSource={templates} loading={loading} pagination={false} />

      <Modal
        title={editingTemplate ? `編輯範本：${editingTemplate.name}` : '新增流程範本'}
        open={modalVisible}
        onOk={() => form.submit()}
        onCancel={() => setModalVisible(false)}
        width={640}
        okText={editingTemplate ? '儲存' : '建立'}
      >
        {editingTemplate?.isInUse && (
          <Typography.Text type="warning" style={{ display: 'block', marginBottom: 12 }}>
            ⚠ 此範本使用中，節點修改將被拒絕。若需修改請建立新範本。
          </Typography.Text>
        )}
        <Form form={form} onFinish={handleSubmit} layout="vertical">
          <Form.Item name="name" label="範本名稱" rules={[{ required: true, message: '請輸入名稱' }]}>
            <Input placeholder="例如：標準 ECN 三道審核流程" />
          </Form.Item>
          {!editingTemplate && (
            <Form.Item name="entityType" label="適用類型" rules={[{ required: true }]} initialValue="ECN">
              <Select options={ENTITY_OPTIONS} />
            </Form.Item>
          )}

          <Form.Item label="審核節點（依序執行）">
            <Form.List name="steps" rules={[{
              validator: async (_, steps) => {
                if (!steps || steps.length < 1) throw new Error('至少需要 1 道節點');
              },
            }]}>
              {(fields, { add, remove }, { errors }) => (
                <>
                  {fields.map((field, index) => (
                    <div
                      key={field.key}
                      style={{
                        display: 'flex', gap: 8, alignItems: 'flex-start',
                        padding: '8px 12px', background: '#fafafa',
                        border: '1px solid #f0f0f0', borderRadius: 6, marginBottom: 8,
                      }}
                    >
                      <div style={{ width: 24, paddingTop: 6, color: '#8c8c8c', fontWeight: 'bold', flexShrink: 0 }}>
                        {index + 1}
                      </div>
                      <Form.Item
                        {...field}
                        name={[field.name, 'name']}
                        style={{ flex: 2, margin: 0 }}
                        rules={[{ required: true, message: '請輸入節點名稱' }]}
                      >
                        <Input placeholder="節點名稱（例如：品保審核）" />
                      </Form.Item>
                      <Form.Item
                        {...field}
                        name={[field.name, 'approverRole']}
                        style={{ flex: 1, margin: 0 }}
                        rules={[{ required: true, message: '請選擇角色' }]}
                      >
                        <Select placeholder="審核角色" options={ROLE_OPTIONS} />
                      </Form.Item>
                      <Form.Item
                        {...field}
                        name={[field.name, 'isRequired']}
                        valuePropName="checked"
                        initialValue={true}
                        style={{ margin: 0, paddingTop: 4 }}
                      >
                        <Switch checkedChildren="必要" unCheckedChildren="選填" defaultChecked />
                      </Form.Item>
                      {fields.length > 1 && (
                        <Button
                          danger
                          size="small"
                          style={{ flexShrink: 0, marginTop: 4 }}
                          onClick={() => remove(field.name)}
                        >
                          刪除
                        </Button>
                      )}
                    </div>
                  ))}
                  <Button
                    type="dashed"
                    onClick={() => add({ name: '', approverRole: 'ADMIN', isRequired: true })}
                    block
                    icon={<PlusOutlined />}
                    style={{ marginTop: 4 }}
                  >
                    新增節點
                  </Button>
                  <Form.ErrorList errors={errors} />
                </>
              )}
            </Form.List>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default WorkflowTemplatesPage;
