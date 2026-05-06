import { Router } from 'express';
import * as XLSX from 'xlsx';
import { prisma } from '../lib/prisma';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../lib/asyncHandler';

const router = Router();

const DOCUMENT_TYPE_LABEL: Record<string, string> = {
  PART_DRAWING: '零部件圖紙',
  PRODUCT_DRAWING: '成品圖紙',
  SPEC: '產品規格書',
  SOP: '作業標準書',
  QC: '檢驗規範',
};

const STATUS_LABEL: Record<string, string> = {
  DRAFT: '草稿',
  PENDING: '審核中',
  RELEASED: '已發行',
  OBSOLETE: '已作廢',
};

router.get('/documents', authenticateToken, asyncHandler(async (req: AuthRequest, res) => {
  const docs = await prisma.document.findMany({
    include: {
      part: { select: { partNumber: true, name: true } },
      product: { select: { productCode: true, name: true } },
      createdBy: { select: { name: true } },
      files: { select: { fileType: true, originalName: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  const data = docs.map((d) => ({
    '所屬料號/編碼': d.part?.partNumber || d.product?.productCode || '-',
    '名稱': d.part?.name || d.product?.name || '-',
    '文件類型': DOCUMENT_TYPE_LABEL[d.documentType] || d.documentType,
    '版本': `R${d.version}`,
    '狀態': STATUS_LABEL[d.status] || d.status,
    '檔案格式': d.files.map((f) => f.fileType).join(', '),
    '建立者': d.createdBy.name,
    '建立時間': d.createdAt.toISOString().split('T')[0],
    '備註': d.remark || '',
  }));

  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '文件清單');

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="documents.xlsx"');
  res.send(buf);
}));

router.get('/parts', authenticateToken, asyncHandler(async (req: AuthRequest, res) => {
  const parts = await prisma.part.findMany({
    include: { category: { select: { code: true, name: true } } },
    orderBy: { partNumber: 'asc' },
  });

  const data = parts.map((p) => ({
    '料號': p.partNumber,
    '名稱': p.name,
    '類別': `${p.category.code} - ${p.category.name}`,
    '說明': p.description || '',
  }));

  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '零部件清單');

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="parts.xlsx"');
  res.send(buf);
}));

router.get('/products', authenticateToken, asyncHandler(async (req: AuthRequest, res) => {
  const products = await prisma.product.findMany({
    include: {
      boms: { include: { part: { select: { partNumber: true, name: true } } } },
    },
    orderBy: { productCode: 'asc' },
  });

  const data = products.map((p) => ({
    '成品編碼': p.productCode,
    '名稱': p.name,
    '說明': p.description || '',
    'BOM 零件': p.boms.map((b) => `${b.part.partNumber}(${b.quantity})`).join(', '),
  }));

  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '成品清單');

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="products.xlsx"');
  res.send(buf);
}));

router.get('/ecns', authenticateToken, asyncHandler(async (req: AuthRequest, res) => {
  const ecns = await prisma.eCN.findMany({
    include: {
      document: {
        include: {
          part: { select: { partNumber: true } },
          product: { select: { productCode: true } },
        },
      },
      reviewedBy: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  const data = ecns.map((e) => ({
    'ECN 編號': e.ecnNo,
    '標題': e.title,
    '說明': e.description,
    '狀態': e.status === 'PENDING' ? '待審核' : e.status === 'APPROVED' ? '已核准' : '已退回',
    '關聯文件': `${DOCUMENT_TYPE_LABEL[e.document.documentType] || e.document.documentType} - ${e.document.part?.partNumber || e.document.product?.productCode || '-'}`,
    '審核人': e.reviewedBy?.name || '-',
    '建立時間': e.createdAt.toISOString().split('T')[0],
  }));

  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'ECN 清單');

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="ecns.xlsx"');
  res.send(buf);
}));

export default router;
