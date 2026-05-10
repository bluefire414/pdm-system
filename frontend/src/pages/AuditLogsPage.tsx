import React, { useEffect, useState, useCallback } from 'react';
import {
  Table,
  Select,
  DatePicker,
  Space,
  Tag,
  Typography,
  Row,
  Col,
  Button,
  Tooltip,
} from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import client from '../api/client';
import { AuditLogItem } from '../types';

const { RangePicker } = DatePicker;
const { Text } = Typography;

const ACTION_COLORS: Record<string, string> = {
  CREATE: 'green',
  UPDATE: 'blue',
  DELETE: 'red',
  STATUS_CHANGE: 'orange',
};

const ENTITY_OPTIONS = [
  { label: '全部', value: '' },
  { label: 'Document', value: 'Document' },
  { label: 'DocumentFile', value: 'DocumentFile' },
  { label: 'ECN', value: 'ECN' },
  { label: 'Part', value: 'Part' },
  { label: 'Product', value: 'Product' },
  { label: 'ProductBOM', value: 'ProductBOM' },
  { label: 'PartCategory', value: 'PartCategory' },
  { label: 'ProductSeries', value: 'ProductSeries' },
  { label: 'DocumentCategory', value: 'DocumentCategory' },
  { label: 'User', value: 'User' },
];

const ACTION_OPTIONS = [
  { label: '全部', value: '' },
  { label: 'CREATE', value: 'CREATE' },
  { label: 'UPDATE', value: 'UPDATE' },
  { label: 'DELETE', value: 'DELETE' },
  { label: 'STATUS_CHANGE', value: 'STATUS_CHANGE' },
];

interface FilterState {
  entity: string;
  action: string;
  userId: string;
  dateFrom: string;
  dateTo: string;
}

const AuditLogsPage: React.FC = () => {
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<{ id: string; name: string; username: string }[]>([]);
  const [filters, setFilters] = useState<FilterState>({
    entity: '',
    action: '',
    userId: '',
    dateFrom: '',
    dateTo: '',
  });

  const fetchUsers = useCallback(async () => {
    try {
      const res = await client.get('/users');
      setUsers(res.data);
    } catch {
      // non-critical
    }
  }, []);

  const fetchLogs = useCallback(async (p = page, ps = pageSize) => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { page: p, pageSize: ps };
      if (filters.entity) params.entity = filters.entity;
      if (filters.action) params.action = filters.action;
      if (filters.userId) params.userId = filters.userId;
      if (filters.dateFrom) params.dateFrom = filters.dateFrom;
      if (filters.dateTo) params.dateTo = filters.dateTo;

      const res = await client.get('/admin/audit-logs', { params });
      setLogs(res.data.data);
      setTotal(res.data.total);
    } catch {
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [filters, page, pageSize]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  useEffect(() => {
    fetchLogs(1, pageSize);
    setPage(1);
  }, [filters, pageSize]); // eslint-disable-line react-hooks/exhaustive-deps

  const columns: ColumnsType<AuditLogItem> = [
    {
      title: '時間',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 170,
      render: (v: string) => dayjs(v).format('YYYY-MM-DD HH:mm:ss'),
    },
    {
      title: '操作者',
      key: 'user',
      width: 130,
      render: (_, r) => r.user ? `${r.user.name} (${r.user.username})` : r.userId,
    },
    {
      title: '角色',
      key: 'role',
      width: 100,
      render: (_, r) => r.user?.role ?? '-',
    },
    {
      title: '動作',
      dataIndex: 'action',
      key: 'action',
      width: 120,
      render: (v: string) => <Tag color={ACTION_COLORS[v] ?? 'default'}>{v}</Tag>,
    },
    {
      title: '對象類型',
      dataIndex: 'entity',
      key: 'entity',
      width: 160,
    },
    {
      title: '對象 ID',
      dataIndex: 'entityId',
      key: 'entityId',
      width: 200,
      render: (v: string) => (
        <Tooltip title={v}>
          <Text code style={{ fontSize: 12 }}>{v.length > 20 ? `${v.slice(0, 18)}…` : v}</Text>
        </Tooltip>
      ),
    },
    {
      title: '變更詳情',
      dataIndex: 'detail',
      key: 'detail',
      render: (v: Record<string, any> | null) => {
        if (!v) return '-';
        return (
          <Tooltip title={<pre style={{ margin: 0, fontSize: 11 }}>{JSON.stringify(v, null, 2)}</pre>}>
            <Text style={{ cursor: 'pointer', fontSize: 12 }}>{JSON.stringify(v).slice(0, 60)}{JSON.stringify(v).length > 60 ? '…' : ''}</Text>
          </Tooltip>
        );
      },
    },
    {
      title: 'IP',
      dataIndex: 'ip',
      key: 'ip',
      width: 130,
      render: (v: string | null) => v || '-',
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography.Title level={4} style={{ margin: 0 }}>操作稽核日誌</Typography.Title>
        <Button icon={<ReloadOutlined />} onClick={() => fetchLogs(page, pageSize)}>重新整理</Button>
      </div>

      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col>
          <Space>
            <span>對象類型：</span>
            <Select
              style={{ width: 160 }}
              options={ENTITY_OPTIONS}
              value={filters.entity}
              onChange={(v) => setFilters((f) => ({ ...f, entity: v }))}
            />
          </Space>
        </Col>
        <Col>
          <Space>
            <span>動作：</span>
            <Select
              style={{ width: 140 }}
              options={ACTION_OPTIONS}
              value={filters.action}
              onChange={(v) => setFilters((f) => ({ ...f, action: v }))}
            />
          </Space>
        </Col>
        <Col>
          <Space>
            <span>操作者：</span>
            <Select
              style={{ width: 180 }}
              showSearch
              allowClear
              placeholder="全部使用者"
              value={filters.userId || undefined}
              onChange={(v) => setFilters((f) => ({ ...f, userId: v ?? '' }))}
              options={users.map((u) => ({ label: `${u.name} (${u.username})`, value: u.id }))}
              filterOption={(input, option) =>
                (option?.label as string)?.toLowerCase().includes(input.toLowerCase())
              }
            />
          </Space>
        </Col>
        <Col>
          <Space>
            <span>日期範圍：</span>
            <RangePicker
              onChange={(dates) => {
                setFilters((f) => ({
                  ...f,
                  dateFrom: dates?.[0]?.format('YYYY-MM-DD') ?? '',
                  dateTo: dates?.[1]?.format('YYYY-MM-DD') ?? '',
                }));
              }}
            />
          </Space>
        </Col>
      </Row>

      <Table<AuditLogItem>
        columns={columns}
        dataSource={logs}
        rowKey="id"
        loading={loading}
        pagination={{
          current: page,
          pageSize,
          total,
          showSizeChanger: true,
          pageSizeOptions: ['20', '50', '100'],
          showTotal: (t) => `共 ${t} 筆`,
          onChange: (p, ps) => {
            setPage(p);
            setPageSize(ps);
            fetchLogs(p, ps);
          },
        }}
        scroll={{ x: 1100 }}
        size="small"
      />
    </div>
  );
};

export default AuditLogsPage;
