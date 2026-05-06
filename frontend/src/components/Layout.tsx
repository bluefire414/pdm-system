import React, { useEffect, useState } from 'react';
import { Layout as AntLayout, Menu, Button, Badge, Avatar, Dropdown, Space } from 'antd';
import {
  DashboardOutlined,
  AppstoreOutlined,
  ToolOutlined,
  BuildOutlined,
  FileOutlined,
  SearchOutlined,
  SwapOutlined,
  CloudUploadOutlined,
  BellOutlined,
  LogoutOutlined,
  UserOutlined,
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
    { key: '/series', icon: <AppstoreOutlined />, label: '產品系列' },
    { key: '/parts', icon: <ToolOutlined />, label: '零部件管理' },
    { key: '/products', icon: <BuildOutlined />, label: '成品管理' },
    { key: '/documents', icon: <FileOutlined />, label: '文件中心' },
    { key: '/batch-upload', icon: <CloudUploadOutlined />, label: '批量上傳' },
    { key: '/search', icon: <SearchOutlined />, label: '搜尋' },
    { key: '/ecns', icon: <SwapOutlined />, label: 'ECN 變更' },
    ...(user?.role === 'ADMIN' ? [{ key: '/users', icon: <UserOutlined />, label: '用戶管理' }] : []),
  ];

  const userMenuItems = [
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
    </AntLayout>
  );
};

export default Layout;
