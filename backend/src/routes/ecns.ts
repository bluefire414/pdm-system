import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { DocumentStatuses } from '../lib/constants';
import { asyncHandler } from '../lib/asyncHandler';
import { validateIdParam } from '../lib/validators';
import { writeAuditLog, getClientIp } from '../middleware/auditLog';
import {
  sendEmail,
  buildEcnCreatedEmail,
  buildEcnApprovedEmail,
  buildEcnRejectedEmail,
} from '../services/emailService';
import {
  initWorkflow,
  getCurrentStep,
  approveRecord,
  rejectRecord,
  getApprovalStatus,
} from '../services/workflowService';

const router = Router();

// ─── 共用：ECN 核准終態（版本 +1、快照、通知） ────────────────────────────────
async function finalizeApproval(ecnId: string, reviewerId: string) {
  return prisma.$transaction(async (tx) => {
    const ecn = await tx.eCN.update({
      where: { id: ecnId },
      data: { status: 'APPROVED', reviewedById: reviewerId },
      include: { document: true },
    });

    if (ecn.document) {
      const currentFiles = await tx.documentFile.findMany({
        where: { documentId: ecn.document.id },
        select: {
          id: true, fileName: true, originalName: true,
          fileType: true, fileSize: true, filePath: true,
        },
      });
      await tx.documentVersion.create({
        data: {
          documentId: ecn.document.id,
          version: ecn.document.version,
          status: ecn.document.status,
          ecnId: ecn.id,
          filesSnapshot: JSON.stringify(currentFiles),
          createdBy: reviewerId,
        },
      });
      await tx.document.update({
        where: { id: ecn.document.id },
        data: { status: DocumentStatuses.DRAFT, version: ecn.document.version + 1 },
      });
    }

    await tx.notification.create({
      data: {
        userId: ecn.document.createdById,
        title: 'ECN 已核准',
        message: `ECN ${ecn.ecnNo} 已核准，文件已產生新版本`,
      },
    });
    return ecn;
  });
}

// ─── 共用：ECN 退回終態（狀態更新、通知） ────────────────────────────────────
async function finalizeRejection(ecnId: string, reviewerId: string) {
  return prisma.$transaction(async (tx) => {
    const ecn = await tx.eCN.update({
      where: { id: ecnId },
      data: { status: 'REJECTED', reviewedById: reviewerId },
      include: { document: true },
    });
    await tx.notification.create({
      data: {
        userId: ecn.document.createdById,
        title: 'ECN 已退回',
        message: `ECN ${ecn.ecnNo} 已被退回`,
      },
    });
    return ecn;
  });
}

// ─── GET / ────────────────────────────────────────────────────────────────────
router.get('/', authenticateToken, asyncHandler(async (_req, res) => {
  const ecns = await prisma.eCN.findMany({
    include: {
      document: {
        include: {
          parts: { include: { part: { select: { partNumber: true, name: true } } } },
          products: { include: { product: { select: { productCode: true, name: true } } } },
        },
      },
      reviewedBy: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  const now = new Date();
  res.json(ecns.map((ecn) => ({
    ...ecn,
    isOverdue: ecn.dueDate != null && ecn.dueDate < now && ecn.status === 'PENDING',
  })));
}));

// ─── GET /:id ─────────────────────────────────────────────────────────────────
router.get('/:id', authenticateToken, asyncHandler(async (req, res) => {
  const ecn = await prisma.eCN.findUnique({
    where: { id: req.params.id },
    include: {
      document: {
        include: {
          parts: { include: { part: { select: { partNumber: true, name: true } } } },
          products: { include: { product: { select: { productCode: true, name: true } } } },
          files: true,
        },
      },
      reviewedBy: { select: { name: true } },
    },
  });
  if (!ecn) { res.status(404).json({ error: 'ECN 不存在' }); return; }
  res.json(ecn);
}));

// ─── POST / ───────────────────────────────────────────────────────────────────
router.post('/', authenticateToken, asyncHandler(async (req: AuthRequest, res) => {
  try {
    const schema = z.object({
      ecnNo: z.string().min(1).max(50),
      title: z.string().min(1).max(200),
      description: z.string().min(1),
      documentId: z.string().uuid(),
      dueDate: z.string().datetime({ offset: true }).optional().nullable(),
    });
    const data = schema.parse(req.body);

    const ecn = await prisma.eCN.create({
      data: {
        ecnNo: data.ecnNo,
        title: data.title,
        description: data.description,
        documentId: data.documentId,
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        status: 'PENDING',
      },
      include: {
        document: {
          include: {
            parts: { include: { part: { select: { partNumber: true, name: true } } } },
            products: { include: { product: { select: { productCode: true, name: true } } } },
          },
        },
      },
    });

    // 嘗試初始化 workflow（若無 active template 則靜默跳過）
    await initWorkflow('ECN', ecn.id);

    // 站內通知 + Email 給 ADMIN
    const admins = await prisma.user.findMany({ where: { role: 'ADMIN', isActive: true } });
    for (const admin of admins) {
      await prisma.notification.create({
        data: { userId: admin.id, title: '新的 ECN 待審核', message: `ECN ${data.ecnNo}: ${data.title}` },
      });
      if (admin.email) {
        sendEmail(
          admin.email,
          `[ECN] 新變更申請待審核：${data.ecnNo}`,
          buildEcnCreatedEmail(data.ecnNo, data.title, data.description),
        );
      }
    }

    writeAuditLog({
      userId: req.user!.id, action: 'CREATE', entity: 'ECN', entityId: ecn.id,
      detail: { ecnNo: data.ecnNo, title: data.title, documentId: data.documentId },
      ip: getClientIp(req),
    });
    res.status(201).json(ecn);
  } catch (error: any) {
    if (error.code === 'P2002') { res.status(400).json({ error: 'ECN 編號已存在' }); return; }
    const isDev = process.env.NODE_ENV === 'development';
    res.status(400).json({ error: '建立 ECN 失敗', ...(isDev ? { details: error.message } : {}) });
  }
}));

// ─── GET /:id/impact-analysis ─────────────────────────────────────────────────
router.get('/:id/impact-analysis', authenticateToken, asyncHandler(async (req, res) => {
  if (!validateIdParam(req.params.id)) { res.status(400).json({ error: '無效的 ID 參數' }); return; }

  const ecn = await prisma.eCN.findUnique({
    where: { id: req.params.id },
    include: { document: { select: { id: true, documentType: true, version: true, status: true, remark: true } } },
  });
  if (!ecn) { res.status(404).json({ error: 'ECN 不存在' }); return; }

  const doc = ecn.document;
  const documentParts = await prisma.documentPart.findMany({
    where: { documentId: doc.id },
    include: {
      part: {
        select: {
          id: true, partNumber: true, name: true,
          productBOMs: { include: { product: { select: { id: true, productCode: true, name: true } } } },
        },
      },
    },
  });
  const documentProducts = await prisma.documentProduct.findMany({
    where: { documentId: doc.id },
    include: { product: { select: { id: true, productCode: true, name: true } } },
  });

  const affectedParts = await Promise.all(
    documentParts.map(async (dp) => {
      const relatedDocs = await prisma.documentPart.findMany({
        where: { partId: dp.part.id, documentId: { not: doc.id }, document: { status: 'RELEASED' } },
        include: { document: { select: { id: true, documentType: true, version: true, status: true } } },
      });
      return {
        partId: dp.part.id, partNumber: dp.part.partNumber, partName: dp.part.name,
        relatedDocuments: relatedDocs.map((rd) => ({
          id: rd.document.id, documentType: rd.document.documentType,
          version: rd.document.version, status: rd.document.status,
        })),
        appearsInBOMs: dp.part.productBOMs.map((bom) => ({
          productId: bom.product.id, productCode: bom.product.productCode, productName: bom.product.name,
        })),
      };
    })
  );

  const affectedProducts = documentProducts.map((dp) => ({
    productId: dp.product.id, productCode: dp.product.productCode, productName: dp.product.name,
  }));
  const totalRelatedDocs = affectedParts.reduce((sum, p) => sum + p.relatedDocuments.length, 0);

  res.json({
    targetDocument: {
      id: doc.id, documentType: doc.documentType,
      version: doc.version, status: doc.status, remark: doc.remark,
    },
    affectedParts, affectedProducts,
    summary: { totalParts: affectedParts.length, totalProducts: affectedProducts.length, totalRelatedDocs },
  });
}));

// ─── GET /:id/approval-status ─────────────────────────────────────────────────
router.get('/:id/approval-status', authenticateToken, asyncHandler(async (req, res) => {
  if (!validateIdParam(req.params.id)) { res.status(400).json({ error: '無效的 ID 參數' }); return; }
  const ecn = await prisma.eCN.findUnique({ where: { id: req.params.id }, select: { id: true } });
  if (!ecn) { res.status(404).json({ error: 'ECN 不存在' }); return; }
  const status = await getApprovalStatus('ECN', req.params.id);
  res.json(status);
}));

// ─── PUT /:id/approve ─────────────────────────────────────────────────────────
router.put('/:id/approve', authenticateToken, asyncHandler(async (req: AuthRequest, res) => {
  if (!validateIdParam(req.params.id)) { res.status(400).json({ error: '無效的 ID 參數' }); return; }
  try {
    const { comment } = req.body as { comment?: string };
    const currentStep = await getCurrentStep('ECN', req.params.id);

    let ecn: any;

    if (!currentStep) {
      // ── 舊版單道 ADMIN 審核路徑 ──
      if (req.user!.role !== 'ADMIN') {
        res.status(403).json({ error: '僅 ADMIN 可執行此操作' }); return;
      }
      ecn = await finalizeApproval(req.params.id, req.user!.id);
    } else {
      // ── 多道 Workflow 路徑 ──
      if (req.user!.role !== currentStep.step.approverRole) {
        res.status(403).json({
          error: `此道審核（${currentStep.step.name}）需要 ${currentStep.step.approverRole} 角色才能操作`,
        });
        return;
      }

      const { isLastStep } = await approveRecord(currentStep.record.id, req.user!.id, comment);

      if (!isLastStep) {
        const nextStep = await getCurrentStep('ECN', req.params.id);
        writeAuditLog({
          userId: req.user!.id, action: 'WORKFLOW_APPROVE', entity: 'ECN',
          entityId: req.params.id,
          detail: { stepName: currentStep.step.name, stepOrder: currentStep.step.order },
          ip: getClientIp(req),
        });
        res.json({
          message: `第 ${currentStep.step.order} 道審核（${currentStep.step.name}）已通過，等待下一道審核`,
          isLastStep: false,
          nextStepName: nextStep?.step.name ?? null,
        });
        return;
      }

      // 最後一道：執行終態
      ecn = await finalizeApproval(req.params.id, req.user!.id);
    }

    const creator = await prisma.user.findUnique({
      where: { id: ecn.document.createdById }, select: { email: true },
    });
    if (creator?.email) {
      sendEmail(creator.email, `[ECN] 您的變更申請已核准：${ecn.ecnNo}`, buildEcnApprovedEmail(ecn.ecnNo, ecn.title));
    }

    writeAuditLog({
      userId: req.user!.id, action: 'STATUS_CHANGE', entity: 'ECN', entityId: req.params.id,
      detail: { from: 'PENDING', to: 'APPROVED', ecnNo: ecn.ecnNo },
      ip: getClientIp(req),
    });
    res.json(ecn);
  } catch (error: any) {
    const isDev = process.env.NODE_ENV === 'development';
    const status = error.message?.includes('需要') ? 403 : 400;
    res.status(status).json({ error: error.message || '核准 ECN 失敗', ...(isDev ? { details: error.message } : {}) });
  }
}));

// ─── PUT /:id/reject ──────────────────────────────────────────────────────────
router.put('/:id/reject', authenticateToken, asyncHandler(async (req: AuthRequest, res) => {
  if (!validateIdParam(req.params.id)) { res.status(400).json({ error: '無效的 ID 參數' }); return; }
  try {
    const { comment } = req.body as { comment?: string };
    const currentStep = await getCurrentStep('ECN', req.params.id);

    let ecn: any;

    if (!currentStep) {
      // ── 舊版單道 ADMIN 退回路徑 ──
      if (req.user!.role !== 'ADMIN') {
        res.status(403).json({ error: '僅 ADMIN 可執行此操作' }); return;
      }
    } else {
      // ── 多道 Workflow 路徑：角色驗證由 rejectRecord 處理 ──
      if (req.user!.role !== currentStep.step.approverRole) {
        res.status(403).json({
          error: `此道審核（${currentStep.step.name}）需要 ${currentStep.step.approverRole} 角色才能操作`,
        });
        return;
      }
      await rejectRecord(currentStep.record.id, req.user!.id, comment);
    }

    ecn = await finalizeRejection(req.params.id, req.user!.id);

    const creator = await prisma.user.findUnique({
      where: { id: ecn.document.createdById }, select: { email: true },
    });
    if (creator?.email) {
      sendEmail(creator.email, `[ECN] 您的變更申請已退回：${ecn.ecnNo}`, buildEcnRejectedEmail(ecn.ecnNo, ecn.title));
    }

    writeAuditLog({
      userId: req.user!.id, action: 'STATUS_CHANGE', entity: 'ECN', entityId: req.params.id,
      detail: { from: 'PENDING', to: 'REJECTED', ecnNo: ecn.ecnNo },
      ip: getClientIp(req),
    });
    res.json(ecn);
  } catch (error: any) {
    const isDev = process.env.NODE_ENV === 'development';
    const status = error.message?.includes('需要') ? 403 : 400;
    res.status(status).json({ error: error.message || '退回 ECN 失敗', ...(isDev ? { details: error.message } : {}) });
  }
}));

export default router;
