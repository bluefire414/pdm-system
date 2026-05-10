import React, { useEffect, useState } from 'react';
import {
  Table, Button, Modal, Form, Input, Select, message, Tag,
} from 'antd';
import { PlusOutlined, EditOutlined, LockOutlined, UserDeleteOutlined } from '@ant-design/icons';
import client from '../api/client';
import type { UserItem } from '../types';

const ROLE_LABEL: Record<string, string> = {
  ADMIN: '主管',
  ENGINEER: '工程人員',
  MOLD: '模具人員',
  SALES: '業務人員',
};

const ROLE_COLOR: Record<string, string> = {
  ADMIN: 'red',
  ENGINEER: 'blue',
  MOLD: 'purple',
  SALES: 'green',
};

const UsersPage: React.FC = () => {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingUser, setEditingUser] = useState<UserItem | null>(null);
  const [resetModalVisible, setResetModalVisible] = useState(false);
  const [resettingUser, setResettingUser] = useState<UserItem | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [form] = Form.useForm();

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await client.get('/users');
      setUsers(res.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleSubmit = async (values: any) => {
    try {
      if (editingUser) {
        await client.put(`/users/${editingUser.id}`, values);
        message.success('更新成功');
      } else {
        await client.post('/users', values);
        message.success('建立成功');
      }
      setModalVisible(false);
      setEditingUser(null);
      form.resetFields();
      fetchUsers();
    } catch (error: any) {
      message.error(error.response?.data?.error || '操作失敗');
    }
  };

  const handleToggleActive = async (user: UserItem) => {
    try {
      await client.put(`/users/${user.id}`, { isActive: !user.isActive });
      message.success('狀態更新成功');
      fetchUsers();
    } catch (error: any) {
      message.error(error.response?.data?.error || '更新失敗');
    }
  };

  const handleResetPassword = (user: UserItem) => {
    setResettingUser(user);
    setNewPassword('');
    setResetModalVisible(true);
  };

  const handleConfirmReset = async () => {
    if (!newPassword || newPassword.length < 8) {
      message.error('密碼至少 8 個字元');
      return;
    }
    if (!/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      message.error('密碼需包含大寫、小寫字母及數字');
      return;
    }
    try {
      await client.put(`/users/${resettingUser!.id}`, { password: newPassword });
      message.success('密碼已重置');
      setResetModalVisible(false);
      setResettingUser(null);
      setNewPassword('');
    } catch (error: any) {
      message.error(error.response?.data?.error || '重置失敗');
    }
  };

  const columns = [
    { title: '帳號', dataIndex: 'username', key: 'username' },
    { title: '姓名', dataIndex: 'name', key: 'name' },
    {
      title: '角色',
      dataIndex: 'role',
      render: (v: string) => <Tag color={ROLE_COLOR[v] || 'default'}>{ROLE_LABEL[v] || v}</Tag>,
    },
    {
      title: '狀態',
      dataIndex: 'isActive',
      render: (v: boolean) => <Tag color={v ? 'green' : 'red'}>{v ? '啟用' : '停用'}</Tag>,
    },
    {
      title: '操作',
      render: (_: any, r: UserItem) => (
        <>
          <Button type="link" icon={<EditOutlined />} onClick={() => { setEditingUser(r); form.setFieldsValue(r); setModalVisible(true); }}>編輯</Button>
          <Button type="link" icon={<LockOutlined />} onClick={() => handleResetPassword(r)}>重置密碼</Button>
          <Button type="link" danger={r.isActive} icon={<UserDeleteOutlined />} onClick={() => handleToggleActive(r)}>
            {r.isActive ? '停用' : '啟用'}
          </Button>
        </>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2>用戶管理</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditingUser(null); form.resetFields(); setModalVisible(true); }}>
          新增用戶
        </Button>
      </div>
      <Table rowKey="id" columns={columns} dataSource={users} loading={loading} />

      <Modal
        title={editingUser ? '編輯用戶' : '新增用戶'}
        open={modalVisible}
        onOk={() => form.submit()}
        onCancel={() => { setModalVisible(false); setEditingUser(null); form.resetFields(); }}
      >
        <Form form={form} onFinish={handleSubmit} layout="vertical">
          <Form.Item name="username" label="帳號" rules={[{ required: true }]}>
            <Input disabled={!!editingUser} />
          </Form.Item>
          {!editingUser && (
            <Form.Item name="password" label="密碼" rules={[{ required: true }]}>
              <Input.Password />
            </Form.Item>
          )}
          <Form.Item name="name" label="姓名" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="role" label="角色" rules={[{ required: true }]}>
            <Select options={[
              { value: 'ADMIN', label: '主管' },
              { value: 'ENGINEER', label: '工程人員' },
              { value: 'MOLD', label: '模具人員' },
              { value: 'SALES', label: '業務人員' },
            ]} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={`重置密碼 - ${resettingUser?.name || ''}`}
        open={resetModalVisible}
        onOk={handleConfirmReset}
        onCancel={() => { setResetModalVisible(false); setResettingUser(null); setNewPassword(''); }}
        okText="確認重置"
        cancelText="取消"
      >
        <Input.Password
          placeholder="請輸入新密碼"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
        />
        <div style={{ marginTop: 6, color: '#888', fontSize: 12 }}>
          密碼規則：至少 8 個字元，需包含大寫、小寫字母及數字
        </div>
      </Modal>
    </div>
  );
};

export default UsersPage;
