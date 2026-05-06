import React, { useState } from 'react';
import {
  Button, Upload, Select, message, Table, Card, Space, Tag, Alert, Divider,
} from 'antd';
import { UploadOutlined, CloudUploadOutlined } from '@ant-design/icons';
import type { UploadFile } from 'antd/es/upload/interface';
import client from '../api/client';

interface UploadResult {
  originalName: string;
  status: string;
  matchedTo?: string;
  reason?: string;
}

const DOCUMENT_TYPES = [
  { value: 'PART_DRAWING', label: '零部件圖紙' },
  { value: 'PRODUCT_DRAWING', label: '成品圖紙' },
  { value: 'SPEC', label: '產品規格書' },
  { value: 'SOP', label: '作業標準書' },
  { value: 'QC', label: '檢驗規範' },
];

const FILE_TYPES = [
  { value: 'DWG', label: 'DWG (AutoCAD)' },
  { value: 'PDF', label: 'PDF' },
  { value: 'THREE_D', label: '3D 模型 (SolidWorks)' },
  { value: 'THUMB', label: '縮圖 (JPG/PNG)' },
  { value: 'WORD', label: 'Word 原稿' },
];

const BatchUploadPage: React.FC = () => {
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [documentType, setDocumentType] = useState<string>('');
  const [fileType, setFileType] = useState<string>('PDF');
  const [uploading, setUploading] = useState(false);
  const [results, setResults] = useState<UploadResult[]>([]);

  const handleUpload = async () => {
    if (!documentType) {
      message.error('請選擇文件類型');
      return;
    }
    if (fileList.length === 0) {
      message.error('請選擇檔案');
      return;
    }

    const formData = new FormData();
    fileList.forEach((f) => {
      if (f.originFileObj) formData.append('files', f.originFileObj);
    });
    formData.append('fileType', fileType);
    formData.append('documentType', documentType);

    setUploading(true);
    try {
      const res = await client.post('/batch-upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setResults(res.data.results);
      const successCount = res.data.results.filter((r: UploadResult) => r.status === 'success').length;
      const skipCount = res.data.results.filter((r: UploadResult) => r.status === 'skipped').length;
      message.success(`上傳完成：${successCount} 成功，${skipCount} 跳過`);
      if (successCount > 0) {
        setFileList([]);
      }
    } catch (error: any) {
      message.error(error.response?.data?.error || '上傳失敗');
    } finally {
      setUploading(false);
    }
  };

  const resultColumns = [
    { title: '檔名', dataIndex: 'originalName', key: 'originalName' },
    {
      title: '狀態',
      dataIndex: 'status',
      render: (v: string) =>
        v === 'success' ? <Tag color="green">成功</Tag> : <Tag color="orange">跳過</Tag>,
    },
    { title: '匹配到', dataIndex: 'matchedTo', key: 'matchedTo' },
    { title: '原因', dataIndex: 'reason', key: 'reason' },
  ];

  return (
    <div>
      <h2>批量上傳</h2>
      <Card>
        <Space direction="vertical" style={{ width: '100%' }}>
          <Alert
            message="使用說明"
            description="系統會根據檔名自動匹配料號或成品編碼。請確保檔名包含正確的料號（例如：SW-101-A.pdf）。如果找不到對應的料號，該檔案會被跳過。"
            type="info"
            showIcon
          />
          <div style={{ display: 'flex', gap: 16 }}>
            <div>
              <label style={{ display: 'block', marginBottom: 4 }}>文件類型</label>
              <Select
                style={{ width: 200 }}
                placeholder="選擇文件類型"
                value={documentType || undefined}
                onChange={setDocumentType}
                options={DOCUMENT_TYPES}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 4 }}>檔案格式</label>
              <Select
                style={{ width: 200 }}
                value={fileType}
                onChange={setFileType}
                options={FILE_TYPES}
              />
            </div>
          </div>
          <Upload
            multiple
            fileList={fileList}
            onChange={({ fileList: fl }) => setFileList(fl)}
            beforeUpload={() => false}
          >
            <Button icon={<UploadOutlined />}>選擇檔案（可多選）</Button>
          </Upload>
          <Button
            type="primary"
            icon={<CloudUploadOutlined />}
            onClick={handleUpload}
            loading={uploading}
            disabled={fileList.length === 0 || !documentType}
          >
            開始批量上傳
          </Button>
        </Space>
      </Card>

      {results.length > 0 && (
        <>
          <Divider />
          <Card title="上傳結果">
            <Table
              rowKey="originalName"
              columns={resultColumns}
              dataSource={results}
              size="small"
              pagination={false}
            />
          </Card>
        </>
      )}
    </div>
  );
};

export default BatchUploadPage;
