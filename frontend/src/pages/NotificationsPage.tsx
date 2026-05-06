import React, { useEffect, useState } from 'react';
import { List, Button, Badge, Card, Empty, Typography, Tag, message } from 'antd';
import { CheckOutlined, BellOutlined } from '@ant-design/icons';
import client from '../api/client';

interface NotificationItem {
  id: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

const NotificationsPage: React.FC = () => {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchNotifications = async () => {
    setLoading(true);
    try {
      const res = await client.get('/notifications');
      setNotifications(res.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
  }, []);

  const markRead = async (id: string) => {
    try {
      await client.put(`/notifications/${id}/read`);
      fetchNotifications();
    } catch (error) {
      message.error('標記失敗');
      console.error(error);
    }
  };

  const markAllRead = async () => {
    try {
      await client.put('/notifications/read-all');
      fetchNotifications();
    } catch (error) {
      message.error('標記失敗');
      console.error(error);
    }
  };

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16, alignItems: 'center' }}>
        <h2>
          <BellOutlined /> 通知中心
          {unreadCount > 0 && <Badge count={unreadCount} style={{ marginLeft: 8 }} />}
        </h2>
        {unreadCount > 0 && (
          <Button type="primary" icon={<CheckOutlined />} onClick={markAllRead}>
            全部標記為已讀
          </Button>
        )}
      </div>

      {notifications.length === 0 ? (
        <Empty description="尚無通知" />
      ) : (
        <Card>
          <List
            loading={loading}
            itemLayout="horizontal"
            dataSource={notifications}
            renderItem={(item) => (
              <List.Item
                style={{
                  background: item.isRead ? 'transparent' : '#f0f7ff',
                  padding: '12px 16px',
                  borderRadius: 4,
                  marginBottom: 8,
                }}
                actions={[
                  !item.isRead && (
                    <Button key="read" type="link" size="small" onClick={() => markRead(item.id)}>
                      標記已讀
                    </Button>
                  ),
                ]}
              >
                <List.Item.Meta
                  title={
                    <span>
                      {!item.isRead && <Tag color="blue" style={{ marginRight: 8 }}>新</Tag>}
                      <Typography.Text strong={!item.isRead}>{item.title}</Typography.Text>
                    </span>
                  }
                  description={
                    <div>
                      <div>{item.message}</div>
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        {new Date(item.createdAt).toLocaleString()}
                      </Typography.Text>
                    </div>
                  }
                />
              </List.Item>
            )}
          />
        </Card>
      )}
    </div>
  );
};

export default NotificationsPage;
