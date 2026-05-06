import React, { useEffect, useState } from 'react';
import { Card, Row, Col, Statistic, Spin } from 'antd';
import {
  FileOutlined, BuildOutlined, ToolOutlined, AppstoreOutlined,
  CheckCircleOutlined, SwapOutlined, BellOutlined,
} from '@ant-design/icons';
import client from '../api/client';

interface StatsData {
  seriesCount: number;
  partsCount: number;
  productsCount: number;
  documentsCount: number;
  releasedDocumentsCount: number;
  pendingEcnsCount: number;
  unreadNotificationsCount: number;
}

const Dashboard: React.FC = () => {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchStats = async () => {
      setLoading(true);
      try {
        const res = await client.get('/stats');
        setStats(res.data);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, []);

  if (loading || !stats) {
    return <Spin size="large" style={{ display: 'block', marginTop: 100 }} />;
  }

  return (
    <div>
      <h2>儀表板</h2>
      <Row gutter={16}>
        <Col span={6}>
          <Card>
            <Statistic title="產品系列" value={stats.seriesCount} prefix={<AppstoreOutlined />} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic title="零部件" value={stats.partsCount} prefix={<ToolOutlined />} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic title="成品" value={stats.productsCount} prefix={<BuildOutlined />} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic title="文件總數" value={stats.documentsCount} prefix={<FileOutlined />} />
          </Card>
        </Col>
      </Row>
      <Row gutter={16} style={{ marginTop: 16 }}>
        <Col span={8}>
          <Card>
            <Statistic
              title="已發行文件"
              value={stats.releasedDocumentsCount}
              valueStyle={{ color: '#3f8600' }}
              prefix={<CheckCircleOutlined />}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic
              title="待審核 ECN"
              value={stats.pendingEcnsCount}
              valueStyle={{ color: stats.pendingEcnsCount > 0 ? '#cf1322' : '#3f8600' }}
              prefix={<SwapOutlined />}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic
              title="未讀通知"
              value={stats.unreadNotificationsCount}
              valueStyle={{ color: stats.unreadNotificationsCount > 0 ? '#cf1322' : '#3f8600' }}
              prefix={<BellOutlined />}
            />
          </Card>
        </Col>
      </Row>
      <div style={{ marginTop: 24 }}>
        <Card title="系統公告">
          <p>PDM 系統已上線，請開始使用。</p>
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;
