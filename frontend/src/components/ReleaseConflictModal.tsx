import React, { useEffect, useState } from 'react';
import { Modal, Radio, Tag, Divider, Alert } from 'antd';

const DOCUMENT_TYPE_LABEL: Record<string, string> = {
  PART_DRAWING: '零部件圖紙',
  PRODUCT_DRAWING: '成品圖紙',
  SPEC: '產品規格書',
  SOP: '作業標準書',
  QC: '檢驗規範',
};

export interface ConflictItem {
  documentId: string;
  documentType: string;
  sharedParts: Array<{ id: string; partNumber: string; name: string }>;
  sharedProducts: Array<{ id: string; productCode: string; name: string }>;
}

export interface Reassignment {
  fromDocumentId: string;
  partId?: string;
  productId?: string;
}

interface Props {
  open: boolean;
  conflicts: ConflictItem[];
  onConfirm: (reassignments: Reassignment[]) => void;
  onCancel: () => void;
}

type Choice = 'new' | 'keep';

const makeKey = (fromDocId: string, type: 'part' | 'product', itemId: string) =>
  `${fromDocId}:${type}:${itemId}`;

const ReleaseConflictModal: React.FC<Props> = ({ open, conflicts, onConfirm, onCancel }) => {
  const [selections, setSelections] = useState<Record<string, Choice>>({});

  useEffect(() => {
    if (open) setSelections({});
  }, [open, conflicts]);

  const getChoice = (key: string): Choice => selections[key] ?? 'keep';

  const setChoice = (key: string, val: Choice) =>
    setSelections((prev) => ({ ...prev, [key]: val }));

  const handleConfirm = () => {
    const reassignments: Reassignment[] = Object.entries(selections)
      .filter(([, val]) => val === 'new')
      .map(([key]) => {
        const colonIdx = key.indexOf(':');
        const rest = key.slice(colonIdx + 1);
        const colonIdx2 = rest.indexOf(':');
        const fromDocumentId = key.slice(0, colonIdx);
        const type = rest.slice(0, colonIdx2) as 'part' | 'product';
        const itemId = rest.slice(colonIdx2 + 1);
        return type === 'part'
          ? { fromDocumentId, partId: itemId }
          : { fromDocumentId, productId: itemId };
      });
    onConfirm(reassignments);
  };

  const totalItems = conflicts.reduce(
    (acc, c) => acc + c.sharedParts.length + c.sharedProducts.length,
    0
  );
  const reassignCount = Object.values(selections).filter((v) => v === 'new').length;

  return (
    <Modal
      title="發行前確認：料號引用衝突"
      open={open}
      onOk={handleConfirm}
      onCancel={onCancel}
      okText="確認並發行"
      cancelText="取消"
      width={640}
    >
      <Alert
        type="warning"
        showIcon
        style={{ marginBottom: 16 }}
        message="以下料號目前引用已發行的舊文件，請選擇發行後的歸屬"
        description="若選擇「改引用新文件」，該料號將從舊文件移至新文件。舊文件若失去所有料號，將自動作廢。"
      />

      {conflicts.map((conflict, ci) => (
        <div key={conflict.documentId}>
          {ci > 0 && <Divider />}
          <p style={{ fontWeight: 500, marginBottom: 12 }}>
            衝突文件：{DOCUMENT_TYPE_LABEL[conflict.documentType] ?? conflict.documentType}
          </p>

          {conflict.sharedParts.map((part) => {
            const key = makeKey(conflict.documentId, 'part', part.id);
            return (
              <div
                key={key}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '6px 0',
                  borderBottom: '1px solid #f0f0f0',
                }}
              >
                <span>
                  <Tag color="blue">{part.partNumber}</Tag>
                  {part.name}
                </span>
                <Radio.Group
                  value={getChoice(key)}
                  onChange={(e) => setChoice(key, e.target.value)}
                  size="small"
                >
                  <Radio value="new">改引用新文件</Radio>
                  <Radio value="keep">繼續引用舊文件</Radio>
                </Radio.Group>
              </div>
            );
          })}

          {conflict.sharedProducts.map((product) => {
            const key = makeKey(conflict.documentId, 'product', product.id);
            return (
              <div
                key={key}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '6px 0',
                  borderBottom: '1px solid #f0f0f0',
                }}
              >
                <span>
                  <Tag color="green">{product.productCode}</Tag>
                  {product.name}
                </span>
                <Radio.Group
                  value={getChoice(key)}
                  onChange={(e) => setChoice(key, e.target.value)}
                  size="small"
                >
                  <Radio value="new">改引用新文件</Radio>
                  <Radio value="keep">繼續引用舊文件</Radio>
                </Radio.Group>
              </div>
            );
          })}
        </div>
      ))}

      {reassignCount > 0 && (
        <Alert
          type="info"
          showIcon
          style={{ marginTop: 16 }}
          message={`已選擇將 ${reassignCount} / ${totalItems} 個料號改引用新文件`}
        />
      )}
    </Modal>
  );
};

export default ReleaseConflictModal;
