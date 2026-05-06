import React, { useState } from 'react';
import { Input, Table, Tabs, Card, Tag, Button, Space, Empty, message } from 'antd';
import { SearchOutlined, EyeOutlined, ToolOutlined, BuildOutlined, FileOutlined } from '@ant-design/icons';
import client from '../api/client';

interface PartResult {
  id: string;
  partNumber: string;
  name: string;
  description: string | null;
  series: { code: string; name: string };
}

interface ProductResult {
  id: string;
  productCode: string;
  name: string;
  description: string | null;
}

interface DocumentResult {
  id: string;
  documentType: string;
  status: string;
  version: number;
  remark: string | null;
  part: { partNumber: string; name: string } | null;
  product: { productCode: string; name: string } | null;
  files: { id: string; fileType: string; originalName: string }[];
  createdBy: { name: string };
}

const DOCUMENT_TYPE_LABEL: Record<string, string> = {
  PART_DRAWING: '零部件圖紙',
  PRODUCT_DRAWING: '成品圖紙',
  SPEC: '產品規格書',
  SOP: '作業標準書',
  QC: '檢驗規範',
};

const STATUS_COLOR: Record<string, string> = {
  DRAFT: 'default',
  PENDING: 'orange',
  RELEASED: 'green',
  OBSOLETE: 'red',
};

const SearchPage: React.FC = () => {
  const [keyword, setKeyword] = useState('');
  const [loading, setLoading] = useState(false);
  const [parts, setParts] = useState<PartResult[]>([]);
  const [products, setProducts] = useState<ProductResult[]>([]);
  const [documents, setDocuments] = useState<DocumentResult[]>([]);
  const [searched, setSearched] = useState(false);

  const handleSearch = async () => {
    if (!keyword.trim()) return;
    setLoading(true);
    setSearched(true);
    try {
      const res = await client.get('/search', { params: { keyword: keyword.trim() } });
      setParts(res.data.parts || []);
      setProducts(res.data.products || []);
      setDocuments(res.data.documents || []);
    } catch (error: any) {
      message.error(error.response?.data?.error || '搜尋失敗');
    } finally {
      setLoading(false);
    }
  };

  const partColumns = [
    { title: '料號', dataIndex: 'partNumber', key: 'partNumber' },
    { title: '名稱', dataIndex: 'name', key: 'name' },
    { title: '系列', render: (_: any, r: PartResult) => `${r.series.code} - ${r.series.name}` },
    { title: '說明', dataIndex: 'description', key: 'description' },
    {
      title: '操作',
      render: () => (
        <Button type="link" onClick={() => window.open(`/parts`, '_self')}>
          查看
        </Button>
      ),
    },
  ];

  const productColumns = [
    { title: '成品編碼', dataIndex: 'productCode', key: 'productCode' },
    { title: '名稱', dataIndex: 'name', key: 'name' },
    { title: '說明', dataIndex: 'description', key: 'description' },
    {
      title: '操作',
      render: () => (
        <Button type="link" onClick={() => window.open(`/products`, '_self')}>
          查看
        </Button>
      ),
    },
  ];

  const documentColumns = [
    {
      title: '所屬',
      render: (_: any, r: DocumentResult) =>
        r.part ? `${r.part.partNumber}` :
        r.product ? `${r.product.productCode}` : '-',
    },
    { title: '類型', render: (_: any, r: DocumentResult) => DOCUMENT_TYPE_LABEL[r.documentType] || r.documentType },
    { title: '版本', render: (_: any, r: DocumentResult) => `R${r.version}` },
    {
      title: '狀態',
      render: (_: any, r: DocumentResult) => <Tag color={STATUS_COLOR[r.status] || 'default'}>{r.status}</Tag>,
    },
    { title: '檔案數', render: (_: any, r: DocumentResult) => r.files.length },
    {
      title: '操作',
      render: (_: any, r: DocumentResult) => (
        <Space>
          {r.files.map((f) =>
            (f.fileType === 'PDF' || f.fileType === 'THUMB') ? (
              <Button
                key={f.id}
                type="link"
                size="small"
                icon={<EyeOutlined />}
                onClick={() => window.open(`/api/documents/files/${f.id}/preview`, '_blank')}
              >
                {f.fileType === 'THUMB' ? '縮圖' : 'PDF'}
              </Button>
            ) : null
          )}
        </Space>
      ),
    },
  ];

  const tabs = [
    {
      key: 'parts',
      label: `零部件 (${parts.length})`,
      icon: <ToolOutlined />,
      children: parts.length > 0 ? (
        <Table rowKey="id" columns={partColumns} dataSource={parts} size="small" pagination={false} />
      ) : <Empty description="無結果" />,
    },
    {
      key: 'products',
      label: `成品 (${products.length})`,
      icon: <BuildOutlined />,
      children: products.length > 0 ? (
        <Table rowKey="id" columns={productColumns} dataSource={products} size="small" pagination={false} />
      ) : <Empty description="無結果" />,
    },
    {
      key: 'documents',
      label: `文件 (${documents.length})`,
      icon: <FileOutlined />,
      children: documents.length > 0 ? (
        <Table rowKey="id" columns={documentColumns} dataSource={documents} size="small" pagination={false} />
      ) : <Empty description="無結果" />,
    },
  ];

  const total = parts.length + products.length + documents.length;

  return (
    <div>
      <h2>搜尋</h2>
      <Card style={{ marginBottom: 16 }}>
        <Space.Compact style={{ width: '100%' }}>
          <Input
            placeholder="輸入料號、名稱、系列或關鍵字..."
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onPressEnter={handleSearch}
            size="large"
            prefix={<SearchOutlined />}
          />
          <Button type="primary" size="large" icon={<SearchOutlined />} onClick={handleSearch} loading={loading}>
            搜尋
          </Button>
        </Space.Compact>
      </Card>

      {searched && (
        <div>
          <p style={{ color: '#666' }}>
            找到 <strong>{total}</strong> 筆結果（零部件 {parts.length} / 成品 {products.length} / 文件 {documents.length}）
          </p>
          <Tabs items={tabs} />
        </div>
      )}
    </div>
  );
};

export default SearchPage;
