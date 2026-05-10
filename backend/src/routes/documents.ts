import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { getPermission, canAccessDocument } from '../lib/permissions';
import {
  DocumentStatuses,
  Roles,
  Role,
  DocumentType,
  DocumentStatus,
} from '../lib/constants';
import path from 'path';
import fs from 'fs';
import { upload, resolveUploadPath, UPLOAD_DIR, validateUploadedFile } from '../lib/upload';
import { asyncHandler } from '../lib/asyncHandler';
import { writeAuditLog, getClientIp } from '../middleware/auditLog';

const router = Router();

function inferFileType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  const mapping: Record<string, string> = {
    '.dwg': 'DWG',
    '.pdf': 'PDF',
    '.sldprt': 'THREE_D',
    '.sldasm': 'THREE_D',
    '.step': 'THREE_D',
    '.stp': 'THREE_D',
    '.iges': 'THREE_D',
    '.igs': 'THREE_D',
    '.jpg': 'THUMB',
    '.jpeg': 'THUMB',
    '.png': 'THUMB',
    '.gif': 'THUMB',
    '.doc': 'WORD',
    '.docx': 'WORD',
  };
  return mapping[ext] ?? (ext ? ext.replace('.', '').toUpperCase() : 'OTHER');
}

// ── 取得文件列表 ────────────────────────────────────────────
router.get('/', authenticateToken, asyncHandler(async (req: AuthRequest, res) => {
  const { type, partId, productId, status, keyword, categoryId, unlinked, version } = req.query;
  const userRole = req.user!.role as Role;
  const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1);
  const pageSize = Math.min(200, Math.max(1, parseInt(String(req.query.pageSize ?? '50'), 10) || 50));

  const where: any = {};
  if (type) where.documentType = String(type) as DocumentType;
  if (status) where.status = String(status) as DocumentStatus;
  if (categoryId) where.categoryId = String(categoryId);
  if (version) { const v = Number(version); if (!isNaN(v) && v > 0) where.version = v; }

  if (unlinked === 'true') {
    where.parts = { none: {} };
    where.products = { none: {} };
  } else {
    if (partId) where.parts = { some: { partId: String(partId) } };
    if (productId) where.products = { some: { productId: String(productId) } };
  }

  if (keyword) {
    const kw = String(keyword);
    where.OR = [
      { remark: { contains: kw } },
      { parts: { some: { part: { OR: [{ partNumber: { contains: kw } }, { name: { contains: kw } }] } } } },
      { products: { some: { product: { OR: [{ productCode: { contains: kw } }, { name: { contains: kw } }] } } } },
    ];
  }

  // 角色可見的文件類型過濾加入 where，避免撈出後再過濾（效能優化）
  const accessibleTypes = ['PART_DRAWING', 'PRODUCT_DRAWING', 'SPEC', 'SOP', 'QC'].filter(
    (t) => canAccessDocument(userRole, t as DocumentType)
  );
  if (!where.documentType) {
    where.documentType = { in: accessibleTypes };
  }

  const [total, documents] = await Promise.all([
    prisma.document.count({ where }),
    prisma.document.findMany({
      where,
      include: {
        parts: { include: { part: { select: { id: true, partNumber: true, name: true } } } },
        products: { include: { product: { select: { id: true, productCode: true, name: true } } } },
        category: { select: { id: true, name: true } },
        files: true,
        createdBy: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  res.json({ data: documents, total, page, pageSize });
}));

// ── 查詢發行前衝突文件（前端確認彈窗用） ──────────────────────
router.get('/:id/release-conflicts', authenticateToken, asyncHandler(async (req: AuthRequest, res) => {
  const doc = await prisma.document.findUnique({
    where: { id: req.params.id },
    include: {
      parts: { select: { partId: true } },
      products: { select: { productId: true } },
    },
  });

  if (!doc) {
    res.status(404).json({ error: '文件不存在' });
    return;
  }

  const partIds = doc.parts.map((p) => p.partId);
  const productIds = doc.products.map((p) => p.productId);

  if (partIds.length === 0 && productIds.length === 0) {
    res.json([]);
    return;
  }

  const orClause: any[] = [];
  if (partIds.length > 0) orClause.push({ parts: { some: { partId: { in: partIds } } } });
  if (productIds.length > 0) orClause.push({ products: { some: { productId: { in: productIds } } } });

  const conflicts = await prisma.document.findMany({
    where: {
      id: { not: req.params.id },
      documentType: doc.documentType,
      status: DocumentStatuses.RELEASED,
      OR: orClause,
    },
    include: {
      parts: { include: { part: { select: { id: true, partNumber: true, name: true } } } },
      products: { include: { product: { select: { id: true, productCode: true, name: true } } } },
    },
  });

  const result = conflicts.map((cd) => ({
    documentId: cd.id,
    documentType: cd.documentType,
    sharedParts: cd.parts
      .filter((p) => partIds.includes(p.partId))
      .map((p) => ({ id: p.partId, partNumber: p.part.partNumber, name: p.part.name })),
    sharedProducts: cd.products
      .filter((p) => productIds.includes(p.productId))
      .map((p) => ({ id: p.productId, productCode: p.product.productCode, name: p.product.name })),
  }));

  res.json(result);
}));

// ── 查詢文件版次歷史列表 ────────────────────────────────────────
router.get('/:id/history', authenticateToken, asyncHandler(async (req: AuthRequest, res) => {
  const doc = await prisma.document.findUnique({ where: { id: req.params.id } });
  if (!doc) {
    res.status(404).json({ error: '文件不存在' });
    return;
  }

  const versions = await prisma.documentVersion.findMany({
    where: { documentId: req.params.id },
    select: {
      id: true,
      version: true,
      status: true,
      snapshotAt: true,
      ecnId: true,
      createdBy: true,
    },
    orderBy: { version: 'asc' },
  });

  res.json(versions);
}));

// ── 比對兩個版次的附檔差異 ─────────────────────────────────────
router.get('/:id/history/diff', authenticateToken, asyncHandler(async (req: AuthRequest, res) => {
  const v1Num = parseInt(String(req.query.v1), 10);
  const v2Num = parseInt(String(req.query.v2), 10);

  if (isNaN(v1Num) || isNaN(v2Num) || v1Num === v2Num) {
    res.status(400).json({ error: '需提供不同的 v1 與 v2 版次號' });
    return;
  }

  const [snap1, snap2] = await Promise.all([
    prisma.documentVersion.findFirst({ where: { documentId: req.params.id, version: v1Num } }),
    prisma.documentVersion.findFirst({ where: { documentId: req.params.id, version: v2Num } }),
  ]);

  if (!snap1) { res.status(404).json({ error: `版次 ${v1Num} 不存在` }); return; }
  if (!snap2) { res.status(404).json({ error: `版次 ${v2Num} 不存在` }); return; }

  const files1: Array<{ id: string; fileName: string; fileType: string; fileSize?: number; originalName?: string }> = JSON.parse(snap1.filesSnapshot);
  const files2: Array<{ id: string; fileName: string; fileType: string; fileSize?: number; originalName?: string }> = JSON.parse(snap2.filesSnapshot);

  const key = (f: { fileName: string; fileType: string }) => `${f.fileType}::${f.fileName}`;
  const map1 = new Map(files1.map((f) => [key(f), f]));
  const map2 = new Map(files2.map((f) => [key(f), f]));

  const added = files2.filter((f) => !map1.has(key(f)));
  const removed = files1.filter((f) => !map2.has(key(f)));
  const unchanged = files2.filter((f) => map1.has(key(f)));

  res.json({ v1: v1Num, v2: v2Num, added, removed, unchanged });
}));

// ── 查詢指定版次快照詳情 ────────────────────────────────────────
router.get('/:id/history/:version', authenticateToken, asyncHandler(async (req: AuthRequest, res) => {
  const versionNum = parseInt(req.params.version, 10);
  if (isNaN(versionNum)) {
    res.status(400).json({ error: '無效的版次號' });
    return;
  }

  const snapshot = await prisma.documentVersion.findFirst({
    where: { documentId: req.params.id, version: versionNum },
  });

  if (!snapshot) {
    res.status(404).json({ error: '版次快照不存在' });
    return;
  }

  res.json({
    ...snapshot,
    filesSnapshot: JSON.parse(snapshot.filesSnapshot),
  });
}));

// ── 取得單一文件 ────────────────────────────────────────────
router.get('/:id', authenticateToken, asyncHandler(async (req: AuthRequest, res) => {
  const userRole = req.user!.role as Role;

  const doc = await prisma.document.findUnique({
    where: { id: req.params.id },
    include: {
      parts: { include: { part: { include: { category: true } } } },
      products: { include: { product: true } },
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

  doc.files = doc.files.filter((file) => {
    const perm = getPermission(userRole, doc.documentType, file.fileType);
    return perm.canView;
  });

  res.json(doc);
}));

// ── 建立文件（草稿）────────────────────────────────────────
router.post('/', authenticateToken, asyncHandler(async (req: AuthRequest, res) => {
  try {
    const schema = z.object({
      documentType: z.enum(['PART_DRAWING', 'PRODUCT_DRAWING', 'SPEC', 'SOP', 'QC']),
      partIds: z.array(z.string().uuid()).optional(),
      productIds: z.array(z.string().uuid()).optional(),
      categoryId: z.string().uuid().optional(),
      remark: z.string().optional(),
    });
    const data = schema.parse(req.body);

    const doc = await prisma.document.create({
      data: {
        documentType: data.documentType,
        categoryId: data.categoryId,
        remark: data.remark,
        createdById: req.user!.id,
        status: DocumentStatuses.DRAFT,
        version: 1,
        ...(data.partIds?.length
          ? { parts: { create: data.partIds.map((partId) => ({ partId })) } }
          : {}),
        ...(data.productIds?.length
          ? { products: { create: data.productIds.map((productId) => ({ productId })) } }
          : {}),
      },
      include: {
        files: true,
        parts: { include: { part: { select: { id: true, partNumber: true, name: true } } } },
        products: { include: { product: { select: { id: true, productCode: true, name: true } } } },
      },
    });

    res.status(201).json(doc);
  } catch (error: any) {
    const isDev = process.env.NODE_ENV === 'development';
    res.status(400).json({ error: '建立文件失敗', ...(isDev ? { details: error.message } : {}) });
  }
}));

// ── 直接上傳未關聯檔案（先傳後關聯）────────────────────────
router.post('/unlinked-upload', authenticateToken, upload.array('files', 50), asyncHandler(async (req: AuthRequest, res) => {
  try {
    const documentType = z
      .enum(['PART_DRAWING', 'PRODUCT_DRAWING', 'SPEC', 'SOP', 'QC'])
      .parse(req.body.documentType);

    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      res.status(400).json({ error: '未上傳檔案' });
      return;
    }

    const results: any[] = [];
    for (const file of files) {
      try {
        validateUploadedFile(file); // 驗證副檔名白名單與 magic bytes
        const fileType = inferFileType(file.originalname);
        const safeSource = resolveUploadPath(file.path);

        const doc = await prisma.document.create({
          data: {
            documentType,
            createdById: req.user!.id,
            status: DocumentStatuses.DRAFT,
            version: 1,
          },
        });

        const docFile = await prisma.documentFile.create({
          data: {
            documentId: doc.id,
            fileType,
            fileName: path.basename(file.path),
            originalName: file.originalname,
            filePath: safeSource,
            fileSize: file.size,
            mimeType: file.mimetype,
          },
        });

        results.push({
          originalName: file.originalname,
          fileType,
          documentId: doc.id,
          fileId: docFile.id,
          status: 'success',
        });
      } catch (err: any) {
        if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
        results.push({ originalName: file.originalname, status: 'error', reason: err.message });
      }
    }

    res.json({ total: files.length, results });
  } catch (error: any) {
    const isDev = process.env.NODE_ENV === 'development';
    res.status(400).json({ error: '上傳失敗', ...(isDev ? { details: error.message } : {}) });
  }
}));

// ── 上傳檔案到已有文件 ───────────────────────────────────────
router.post('/:id/upload', authenticateToken, upload.array('files', 10), asyncHandler(async (req: AuthRequest, res) => {
  try {
    const doc = await prisma.document.findUnique({
      where: { id: req.params.id },
      include: {
        parts: { include: { part: { select: { partNumber: true } } }, take: 1 },
        products: { include: { product: { select: { productCode: true } } }, take: 1 },
      },
    });

    if (!doc) {
      res.status(404).json({ error: '文件不存在' });
      return;
    }

    if (doc.status === DocumentStatuses.RELEASED || doc.status === DocumentStatuses.PENDING) {
      res.status(400).json({ error: '已發行或審核中的文件不可修改附檔，請先提交 ECN' });
      return;
    }

    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      res.status(400).json({ error: '未上傳檔案' });
      return;
    }

    const fileTypeSchema = z.enum(['DWG', 'PDF', 'THREE_D', 'THUMB', 'WORD']);
    const fileType = fileTypeSchema.parse(req.body.fileType);

    // 命名前綴：優先用第一個關聯料號，無關聯時用 docId 前 8 碼
    const ownerCode =
      doc.parts[0]?.part.partNumber ||
      doc.products[0]?.product.productCode ||
      doc.id.substring(0, 8);
    const docTypeCode = doc.documentType.replace('_', '');
    const versionStr = `R${doc.version}`;

    const createdFiles: any[] = [];
    for (const file of files) {
      validateUploadedFile(file); // 驗證副檔名白名單與 magic bytes
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
      writeAuditLog({
        userId: req.user!.id,
        action: 'CREATE',
        entity: 'DocumentFile',
        entityId: docFile.id,
        detail: { documentId: doc.id, fileType, fileName, originalName: file.originalname },
        ip: getClientIp(req),
      });
    }

    res.json(createdFiles);
  } catch (error: any) {
    const isDev = process.env.NODE_ENV === 'development';
    res.status(400).json({ error: '上傳檔案失敗', ...(isDev ? { details: error.message } : {}) });
  }
}));

// 合法的狀態轉換路徑（單向，不可逆）
const VALID_STATUS_TRANSITIONS: Record<string, string[]> = {
  DRAFT:    [DocumentStatuses.PENDING, DocumentStatuses.OBSOLETE],
  PENDING:  [DocumentStatuses.RELEASED, DocumentStatuses.OBSOLETE],
  RELEASED: [DocumentStatuses.OBSOLETE],
  OBSOLETE: [], // 終態，不可再轉換
};

// ── 更新文件狀態（送審/發行/作廢）──────────────────────────
router.put('/:id/status', authenticateToken, asyncHandler(async (req: AuthRequest, res) => {
  try {
    const schema = z.object({
      status: z.enum([DocumentStatuses.PENDING, DocumentStatuses.RELEASED, DocumentStatuses.OBSOLETE]),
      reassignments: z
        .array(
          z.object({
            fromDocumentId: z.string().uuid(),
            partId: z.string().uuid().optional(),
            productId: z.string().uuid().optional(),
          })
        )
        .optional(),
    });

    const { status, reassignments } = schema.parse(req.body);

    const doc = await prisma.document.findUnique({ where: { id: req.params.id } });
    if (!doc) {
      res.status(404).json({ error: '文件不存在' });
      return;
    }

    // 狀態機驗證：確認轉換合法
    const allowedNext = VALID_STATUS_TRANSITIONS[doc.status] ?? [];
    if (!allowedNext.includes(status)) {
      res.status(400).json({
        error: `不合法的狀態轉換：${doc.status} → ${status}`,
        allowedTransitions: allowedNext,
      });
      return;
    }

    await prisma.$transaction(async (tx) => {
      if (status === DocumentStatuses.RELEASED && reassignments?.length) {
        const affectedSourceIds = new Set<string>();

        for (const r of reassignments) {
          affectedSourceIds.add(r.fromDocumentId);

          if (r.partId) {
            await tx.documentPart.deleteMany({
              where: { documentId: r.fromDocumentId, partId: r.partId },
            });
            await tx.documentPart.upsert({
              where: { documentId_partId: { documentId: req.params.id, partId: r.partId } },
              create: { documentId: req.params.id, partId: r.partId },
              update: {},
            });
          }

          if (r.productId) {
            await tx.documentProduct.deleteMany({
              where: { documentId: r.fromDocumentId, productId: r.productId },
            });
            await tx.documentProduct.upsert({
              where: { documentId_productId: { documentId: req.params.id, productId: r.productId } },
              create: { documentId: req.params.id, productId: r.productId },
              update: {},
            });
          }
        }

        // 若來源文件已無任何關聯，自動設為作廢
        for (const sourceId of affectedSourceIds) {
          const [pCount, prodCount] = await Promise.all([
            tx.documentPart.count({ where: { documentId: sourceId } }),
            tx.documentProduct.count({ where: { documentId: sourceId } }),
          ]);
          if (pCount === 0 && prodCount === 0) {
            await tx.document.update({
              where: { id: sourceId },
              data: { status: DocumentStatuses.OBSOLETE },
            });
          }
        }
      }

      await tx.document.update({
        where: { id: req.params.id },
        data: { status },
      });
    });

    writeAuditLog({
      userId: req.user!.id,
      action: 'STATUS_CHANGE',
      entity: 'Document',
      entityId: req.params.id,
      detail: { from: doc.status, to: status },
      ip: getClientIp(req),
    });

    res.json({ message: '狀態已更新' });
  } catch (error: any) {
    const isDev = process.env.NODE_ENV === 'development';
    res.status(400).json({ error: '更新狀態失敗', ...(isDev ? { details: error.message } : {}) });
  }
}));

// ── 新增關聯（additive，不影響現有關聯）────────────────────
router.put('/:id/link', authenticateToken, asyncHandler(async (req: AuthRequest, res) => {
  try {
    const schema = z
      .object({
        partIds: z.array(z.string().uuid()).optional(),
        productIds: z.array(z.string().uuid()).optional(),
      })
      .refine(
        (d) => (d.partIds?.length ?? 0) + (d.productIds?.length ?? 0) > 0,
        { message: '必須指定至少一個 partId 或 productId' }
      );

    const data = schema.parse(req.body);

    const doc = await prisma.document.findUnique({ where: { id: req.params.id } });
    if (!doc) {
      res.status(404).json({ error: '文件不存在' });
      return;
    }

    await prisma.$transaction(async (tx) => {
      for (const partId of data.partIds ?? []) {
        await tx.documentPart.upsert({
          where: { documentId_partId: { documentId: req.params.id, partId } },
          create: { documentId: req.params.id, partId },
          update: {},
        });
      }
      for (const productId of data.productIds ?? []) {
        await tx.documentProduct.upsert({
          where: { documentId_productId: { documentId: req.params.id, productId } },
          create: { documentId: req.params.id, productId },
          update: {},
        });
      }
    });

    res.json({ message: '關聯已建立' });
  } catch (error: any) {
    const isDev = process.env.NODE_ENV === 'development';
    res.status(400).json({ error: '建立關聯失敗', ...(isDev ? { details: error.message } : {}) });
  }
}));

// ── 檔案預覽/下載 ────────────────────────────────────────
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

  if (file.document.status === DocumentStatuses.DRAFT && file.document.createdById !== req.user!.id) {
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (user?.role !== Roles.ADMIN && user?.role !== Roles.DOC_CONTROL) {
      res.status(403).json({ error: '草稿僅建立者、主管與文管人員可存取' });
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

// ── 刪除單一附檔（DB + 磁碟） ──────────────────────────────
router.delete('/files/:fileId', authenticateToken, asyncHandler(async (req: AuthRequest, res) => {
  const file = await prisma.documentFile.findUnique({
    where: { id: req.params.fileId },
    include: { document: true },
  });

  if (!file) {
    res.status(404).json({ error: '檔案不存在' });
    return;
  }

  if (file.document.status === DocumentStatuses.RELEASED || file.document.status === DocumentStatuses.PENDING) {
    res.status(400).json({ error: '已發行或審核中的文件不可修改附檔，請先提交 ECN' });
    return;
  }

  // 僅文件建立者、ADMIN 或 DOC_CONTROL 可刪除
  if (file.document.createdById !== req.user!.id && req.user!.role !== Roles.ADMIN && req.user!.role !== Roles.DOC_CONTROL) {
    res.status(403).json({ error: '無權刪除此檔案' });
    return;
  }

  // 先刪 DB 記錄，再刪磁碟（避免 DB 失敗時留下孤立紀錄）
  await prisma.documentFile.delete({ where: { id: req.params.fileId } });

  try {
    const safePath = resolveUploadPath(file.filePath);
    if (fs.existsSync(safePath)) fs.unlinkSync(safePath);
  } catch {
    // 磁碟刪除失敗不影響 API 成功回應，僅 console 記錄
    console.warn(`[DocumentFile] 磁碟檔案刪除失敗：${file.filePath}`);
  }

  writeAuditLog({
    userId: req.user!.id,
    action: 'DELETE',
    entity: 'DocumentFile',
    entityId: req.params.fileId,
    detail: { documentId: file.documentId, fileName: file.fileName, fileType: file.fileType },
    ip: getClientIp(req),
  });

  res.json({ message: '附檔已刪除' });
}));

// ── 刪除整份文件（先清磁碟再刪 DB） ──────────────────────────
router.delete('/:id', authenticateToken, asyncHandler(async (req: AuthRequest, res) => {
  const doc = await prisma.document.findUnique({
    where: { id: req.params.id },
    include: { files: true },
  });

  if (!doc) {
    res.status(404).json({ error: '文件不存在' });
    return;
  }

  // 僅文件建立者、ADMIN 或 DOC_CONTROL 可刪除，且狀態必須是 DRAFT 或 OBSOLETE
  if (doc.createdById !== req.user!.id && req.user!.role !== Roles.ADMIN && req.user!.role !== Roles.DOC_CONTROL) {
    res.status(403).json({ error: '無權刪除此文件' });
    return;
  }

  if (doc.status === DocumentStatuses.RELEASED || doc.status === DocumentStatuses.PENDING) {
    res.status(400).json({ error: '審核中或已發行的文件不可刪除，請先作廢' });
    return;
  }

  // 先刪磁碟實體檔
  for (const file of doc.files) {
    try {
      const safePath = resolveUploadPath(file.filePath);
      if (fs.existsSync(safePath)) fs.unlinkSync(safePath);
    } catch {
      console.warn(`[Document] 磁碟檔案刪除失敗：${file.filePath}`);
    }
  }

  // 再刪 DB（cascade 會自動刪除 DocumentFile 記錄）
  await prisma.document.delete({ where: { id: req.params.id } });

  writeAuditLog({
    userId: req.user!.id,
    action: 'DELETE',
    entity: 'Document',
    entityId: req.params.id,
    detail: { documentType: doc.documentType, status: doc.status, version: doc.version, deletedFiles: doc.files.length },
    ip: getClientIp(req),
  });

  res.json({ message: '文件已刪除', deletedFiles: doc.files.length });
}));

export default router;
