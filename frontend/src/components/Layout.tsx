import React, { useEffect, useState } from 'react';
import { Layout as AntLayout, Menu, Button, Badge, Avatar, Dropdown, Space, Modal, Form, Input, message } from 'antd';
import {
  DashboardOutlined,
  ToolOutlined,
  BuildOutlined,
  FileOutlined,
  SearchOutlined,
  SwapOutlined,
  BellOutlined,
  LogoutOutlined,
  UserOutlined,
  KeyOutlined,
  AuditOutlined,
  BranchesOutlined,
  FormOutlined,
} from '@ant-design/icons';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import client from '../api/client';

const { Header, Sider, Content } = AntLayout;

const Layout: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const [changePwdVisible, setChangePwdVisible] = useState(false);
  const [changePwdForm] = Form.useForm();

  useEffect(() => {
    const fetchUnread = async () => {
      try {
        const res = await client.get('/notifications/unread-count');
        setUnreadCount(res.data.count || 0);
      } catch {
        setUnreadCount(0);
      }
    };
    fetchUnread();
    const interval = setInterval(fetchUnread, 30000);
    return () => clearInterval(interval);
  }, []);

  const menuItems = [
    { key: '/', icon: <DashboardOutlined />, label: '儀表板' },
    { key: '/parts', icon: <ToolOutlined />, label: '零部件管理' },
    { key: '/products', icon: <BuildOutlined />, label: '成品管理' },
    { key: '/documents', icon: <FileOutlined />, label: '文件中心' },
    { key: '/search', icon: <SearchOutlined />, label: '搜尋' },
    { key: '/ecrs', icon: <FormOutlined />, label: 'ECR 變更申請' },
    { key: '/ecns', icon: <SwapOutlined />, label: 'ECN 變更' },
    ...(user?.role === 'ADMIN' ? [
      { key: '/users', icon: <UserOutlined />, label: '用戶管理' },
      { key: '/admin/audit-logs', icon: <AuditOutlined />, label: '稽核日誌' },
      { key: '/admin/workflow-templates', icon: <BranchesOutlined />, label: '審核流程' },
    ] : []),
  ];

  const handleChangePassword = async (values: any) => {
    try {
      await client.put('/users/me/password', {
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      });
      message.success('密碼已更新');
      setChangePwdVisible(false);
      changePwdForm.resetFields();
    } catch (error: any) {
      message.error(error.response?.data?.error || '修改失敗');
    }
  };

  const userMenuItems = [
    { key: 'change-pwd', icon: <KeyOutlined />, label: '修改密碼', onClick: () => setChangePwdVisible(true) },
    { key: 'logout', icon: <LogoutOutlined />, label: '登出', onClick: logout },
  ];

  return (
    <AntLayout style={{ minHeight: '100vh' }}>
      <Sider theme="light" width={200}>
        <div style={{ height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: 18 }}>
          PDM 系統
        </div>
        <Menu
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
        />
      </Sider>
      <AntLayout>
        <Header style={{ background: '#fff', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 16, fontWeight: 500 }}>
            {menuItems.find((i) => i.key === location.pathname)?.label || 'PDM'}
          </span>
          <Space>
            <Badge count={unreadCount} size="small">
              <Button type="text" icon={<BellOutlined />} onClick={() => navigate('/notifications')} />
            </Badge>
            <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
              <Space style={{ cursor: 'pointer' }}>
                <Avatar icon={<UserOutlined />} size="small" />
                <span>{user?.name} ({user?.role})</span>
              </Space>
            </Dropdown>
          </Space>
        </Header>
        <Content style={{ margin: 24, padding: 24, background: '#fff', borderRadius: 8, minHeight: 280 }}>
          <Outlet />
        </Content>
      </AntLayout>
      <Modal
        title="修改密碼"
        open={changePwdVisible}
        onOk={() => changePwdForm.submit()}
        onCancel={() => { setChangePwdVisible(false); changePwdForm.resetFields(); }}
        okText="確認修改"
        cancelText="取消"
      >
        <Form form={changePwdForm} onFinish={handleChangePassword} layout="vertical">
          <Form.Item name="currentPassword" label="目前密碼" rules={[{ required: true, message: '請輸入目前密碼' }]}>
            <Input.Password />
          </Form.Item>
          <Form.Item
            name="newPassword"
            label="新密碼"
            rules={[
              { required: true, message: '請輸入新密碼' },
              { min: 8, message: '密碼至少 8 個字元' },
              {
                pattern: /^(?=.*[A-Z])(?=.*[a-z])(?=.*[0-9]).+$/,
                message: '密碼需包含大寫、小寫字母及數字',
              },
            ]}
          >
            <Input.Password />
          </Form.Item>
          <Form.Item
            name="confirmPassword"
            label="確認新密碼"
            dependencies={['newPassword']}
            rules={[
              { required: true, message: '請再次輸入新密碼' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('newPassword') === value) return Promise.resolve();
                  return Promise.reject(new Error('兩次輸入的密碼不一致'));
                },
              }),
            ]}
          >
            <Input.Password />
          </Form.Item>
        </Form>
      </Modal>
    </AntLayout>
  );
};

export default Layout;
