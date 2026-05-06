import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { getPermission, canAccessDocument } from '../lib/permissions';
import {
  DocumentStatuses,
  DocumentTypes,
  FileTypes,
  Roles,
  Role,
  DocumentType,
  DocumentStatus,
} from '../lib/constants';
import path from 'path';
import fs from 'fs';
import { upload, resolveUploadPath, UPLOAD_DIR } from '../lib/upload';
import { asyncHandler } from '../lib/asyncHandler';

const router = Router();

// 取得文件列表
router.get('/', authenticateToken, asyncHandler(async (req: AuthRequest, res) => {
  const { type, partId, productId, status, keyword } = req.query;
  const userRole = req.user!.role as Role;

  const where: any = {};
  if (type) where.documentType = String(type) as DocumentType;
  if (partId) where.partId = String(partId);
  if (productId) where.productId = String(productId);
  if (status) where.status = String(status) as DocumentStatus;
  if (keyword) {
    where.OR = [
      { remark: { contains: String(keyword) } },
      {
        part: {
          OR: [
            { partNumber: { contains: String(keyword) } },
            { name: { contains: String(keyword) } },
          ],
        },
      },
      {
        product: {
          OR: [
            { productCode: { contains: String(keyword) } },
            { name: { contains: String(keyword) } },
          ],
        },
      },
    ];
  }

  const documents = await prisma.document.findMany({
    where,
    include: {
      part: { select: { partNumber: true, name: true } },
      product: { select: { productCode: true, name: true } },
      files: true,
      createdBy: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  // 過濾掉使用者無權存取的文件類型
  const filtered = documents.filter((doc) =>
    canAccessDocument(userRole, doc.documentType)
  );

  res.json(filtered);
}));

// 取得單一文件
router.get('/:id', authenticateToken, asyncHandler(async (req: AuthRequest, res) => {
  const userRole = req.user!.role as Role;

  const doc = await prisma.document.findUnique({
    where: { id: req.params.id },
    include: {
      part: { include: { category: true } },
      product: true,
      files: true,
      createdBy: { select: { name: true } },
      ecns: { include: { reviewedBy: { select: { name: true } } } },
    },
  });

  if (!doc) {
    res.status(404).json({ error: '文件不存在' });
    return;
  }

  if (!canAccessDocument(userRole, doc.documentType)) {
    res.status(403).json({ error: '無權存取此文件類型' });
    return;
  }

  // 過濾檔案權限
  doc.files = doc.files.filter((file) => {
    const perm = getPermission(userRole, doc.documentType, file.fileType);
    return perm.canView;
  });

  res.json(doc);
}));

// 建立文件（草稿）
router.post('/', authenticateToken, asyncHandler(async (req: AuthRequest, res) => {
  try {
    const schema = z.object({
      documentType: z.enum(['PART_DRAWING', 'PRODUCT_DRAWING', 'SPEC', 'SOP', 'QC']),
      partId: z.string().uuid().optional(),
      productId: z.string().uuid().optional(),
      remark: z.string().optional(),
    });
    const data = schema.parse(req.body);

    if (!data.partId && !data.productId) {
      res.status(400).json({ error: '必須指定 partId 或 productId' });
      return;
    }

    const doc = await prisma.document.create({
      data: {
        ...data,
        createdById: req.user!.id,
        status: DocumentStatuses.DRAFT,
        version: 1,
      },
      include: { files: true },
    });

    res.status(201).json(doc);
  } catch (error: any) {
    const isDev = process.env.NODE_ENV === 'development';
    res.status(400).json({ error: '建立文件失敗', ...(isDev ? { details: error.message } : {}) });
  }
}));

// 上傳檔案到文件
router.post('/:id/upload', authenticateToken, upload.array('files', 10), asyncHandler(async (req: AuthRequest, res) => {
  try {
    const doc = await prisma.document.findUnique({
      where: { id: req.params.id },
      include: { part: true, product: true },
    });

    if (!doc) {
      res.status(404).json({ error: '文件不存在' });
      return;
    }

    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      res.status(400).json({ error: '未上傳檔案' });
      return;
    }

    const fileTypeSchema = z.enum(['DWG', 'PDF', 'THREE_D', 'THUMB', 'WORD']);
    const fileType = fileTypeSchema.parse(req.body.fileType);

    const ownerCode = doc.part?.partNumber || doc.product?.productCode || 'unknown';
    const docTypeCode = doc.documentType.replace('_', '');
    const versionStr = `R${doc.version}`;

    const createdFiles: any[] = [];
    for (const file of files) {
      const ext = path.extname(file.originalname);
      const fileName = `${ownerCode}_${docTypeCode}_${versionStr}_${fileType}${ext}`;
      const newPath = path.join(UPLOAD_DIR, fileName);

      const safeSource = resolveUploadPath(file.path);
      const safeDest = resolveUploadPath(newPath);
      fs.renameSync(safeSource, safeDest);

      const docFile = await prisma.documentFile.create({
        data: {
          documentId: doc.id,
          fileType,
          fileName,
          originalName: file.originalname,
          filePath: safeDest,
          fileSize: file.size,
          mimeType: file.mimetype,
        },
      });
      createdFiles.push(docFile);
    }

    res.json(createdFiles);
  } catch (error: any) {
    const isDev = process.env.NODE_ENV === 'development';
    res.status(400).json({ error: '上傳檔案失敗', ...(isDev ? { details: error.message } : {}) });
  }
}));

// 更新文件狀態（送審/發行/作廢）
router.put('/:id/status', authenticateToken, asyncHandler(async (req: AuthRequest, res) => {
  try {
    const schema = z.object({
      status: z.enum([DocumentStatuses.PENDING, DocumentStatuses.RELEASED, DocumentStatuses.OBSOLETE]),
    });
    const { status } = schema.parse(req.body);

    const doc = await prisma.document.findUnique({ where: { id: req.params.id } });
    if (!doc) {
      res.status(404).json({ error: '文件不存在' });
      return;
    }

    // 發行時將舊版文件作廢
    if (status === DocumentStatuses.RELEASED && doc.status !== DocumentStatuses.RELEASED) {
      await prisma.document.updateMany({
        where: {
          partId: doc.partId,
          productId: doc.productId,
          documentType: doc.documentType,
          id: { not: req.params.id },
          status: DocumentStatuses.RELEASED,
        },
        data: { status: DocumentStatuses.OBSOLETE },
      });
    }

    await prisma.document.update({
      where: { id: req.params.id },
      data: { status },
    });

    res.json({ message: '狀態已更新' });
  } catch (error: any) {
    const isDev = process.env.NODE_ENV === 'development';
    res.status(400).json({ error: '更新狀態失敗', ...(isDev ? { details: error.message } : {}) });
  }
}));

// 檔案預覽/下載
router.get('/files/:fileId/:action', authenticateToken, asyncHandler(async (req: AuthRequest, res) => {
  const userRole = req.user!.role as Role;
  const { fileId, action } = req.params;

  const file = await prisma.documentFile.findUnique({
    where: { id: fileId },
    include: { document: true },
  });

  if (!file) {
    res.status(404).json({ error: '檔案不存在' });
    return;
  }

  const perm = getPermission(userRole, file.document.documentType, file.fileType);

  if (!perm.canView) {
    res.status(403).json({ error: '無權預覽此檔案' });
    return;
  }

  if (action === 'download' && !perm.canDownload) {
    res.status(403).json({ error: '無權下載此檔案' });
    return;
  }

  // 檢查文件狀態
  if (file.document.status === DocumentStatuses.DRAFT && file.document.createdById !== req.user!.id) {
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (user?.role !== Roles.ADMIN) {
      res.status(403).json({ error: '草稿僅建立者與主管可存取' });
      return;
    }
  }

  const safePath = resolveUploadPath(file.filePath);
  if (!fs.existsSync(safePath)) {
    res.status(404).json({ error: '檔案實體不存在' });
    return;
  }

  if (action === 'preview') {
    res.sendFile(safePath);
  } else {
    res.download(safePath, file.originalName);
  }
}));

export default router;
