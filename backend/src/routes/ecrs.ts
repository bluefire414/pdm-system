import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../lib/asyncHandler';
import { validateIdParam } from '../lib/validators';
import { writeAuditLog, getClientIp } from '../middleware/auditLog';
import {
  initWorkflow,
  getCurrentStep,
  approveRecord,
  rejectRecord,
  getApprovalStatus,
} from '../services/workflowService';

const router = Router();

// ─── 工具函式 ──────────────────────────────────────────────────────────────────

async function generateEcrNumber(): Promise<string> {
  const now = new Date();
  const prefix = `ECR-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const latest = await prisma.eCR.findFirst({
    where: { ecrNumber: { startsWith: prefix } },
    orderBy: { ecrNumber: 'desc' },
  });
  const seq = latest ? parseInt(latest.ecrNumber.split('-')[2], 10) + 1 : 1;
  return `${prefix}-${String(seq).padStart(3, '0')}`;
}

async function generateEcnNumber(): Promise<string> {
  const now = new Date();
  const prefix = `ECN-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const latest = await prisma.eCN.findFirst({
    where: { ecnNo: { startsWith: prefix } },
    orderBy: { ecnNo: 'desc' },
  });
  const seq = latest ? parseInt(latest.ecnNo.split('-')[2], 10) + 1 : 1;
  return `${prefix}-${String(seq).padStart(3, '0')}`;
}

/** 批量查詢 requester 名稱並附加到 ECR 清單 */
async function attachRequesters<T extends { requesterId: string }>(items: T[]) {
  const ids = [...new Set(items.map((i) => i.requesterId))];
  const users = ids.length > 0
    ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
    : [];
  const map = new Map(users.map((u) => [u.id, u]));
  return items.map((item) => ({ ...item, requester: map.get(item.requesterId) ?? null }));
}

/** ECR 審核通過終態：status → APPROVED，通知申請者 */
async function finalizeEcrApproval(ecrId: string) {
  return prisma.$transaction(async (tx) => {
    const ecr = await tx.eCR.update({
      where: { id: ecrId },
      data: { status: 'APPROVED' },
    });
    await tx.notification.create({
      data: {
        userId: ecr.requesterId,
        title: 'ECR 審核通過',
        message: `ECR ${ecr.ecrNumber} 審核已通過，您可執行「轉換為 ECN」`,
      },
    });
    return ecr;
  });
}

/** ECR 退回終態：status → REJECTED，通知申請者 */
async function finalizeEcrRejection(ecrId: string) {
  return prisma.$transaction(async (tx) => {
    const ecr = await tx.eCR.update({
      where: { id: ecrId },
      data: { status: 'REJECTED' },
    });
    await tx.notification.create({
      data: {
        userId: ecr.requesterId,
        title: 'ECR 審核退回',
        message: `ECR ${ecr.ecrNumber} 審核已退回，請確認後重新提交`,
      },
    });
    return ecr;
  });
}

// ─── GET / ────────────────────────────────────────────────────────────────────
router.get('/', authenticateToken, asyncHandler(async (req, res) => {
  const { status, ecnId } = req.query as { status?: string; ecnId?: string };

  const where: Record<string, any> = {};
  if (status && status !== 'ALL') where.status = status;
  if (ecnId) where.ecnId = ecnId;

  const ecrs = await prisma.eCR.findMany({
    where,
    include: {
      document: {
        select: {
          documentType: true, version: true,
          parts: { include: { part: { select: { partNumber: true } } } },
          products: { include: { product: { select: { productCode: true } } } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  const result = await attachRequesters(ecrs);
  res.json(result);
}));

// ─── GET /:id ─────────────────────────────────────────────────────────────────
router.get('/:id', authenticateToken, asyncHandler(async (req, res) => {
  if (!validateIdParam(req.params.id)) { res.status(400).json({ error: '無效的 ID 參數' }); return; }

  const ecr = await prisma.eCR.findUnique({
    where: { id: req.params.id },
    include: {
      document: {
        select: {
          documentType: true, version: true,
          parts: { include: { part: { select: { partNumber: true, name: true } } } },
          products: { include: { product: { select: { productCode: true, name: true } } } },
        },
      },
    },
  });
  if (!ecr) { res.status(404).json({ error: 'ECR 不存在' }); return; }

  const [requesterArr, convertedEcn] = await Promise.all([
    prisma.user.findMany({ where: { id: ecr.requesterId }, select: { id: true, name: true } }),
    ecr.ecnId ? prisma.eCN.findUnique({ where: { id: ecr.ecnId }, select: { id: true, ecnNo: true } }) : null,
  ]);

  res.json({
    ...ecr,
    requester: requesterArr[0] ?? null,
    convertedEcn,
  });
}));

// ─── GET /:id/approval-status ─────────────────────────────────────────────────
router.get('/:id/approval-status', authenticateToken, asyncHandler(async (req, res) => {
  if (!validateIdParam(req.params.id)) { res.status(400).json({ error: '無效的 ID 參數' }); return; }
  const ecr = await prisma.eCR.findUnique({ where: { id: req.params.id }, select: { id: true } });
  if (!ecr) { res.status(404).json({ error: 'ECR 不存在' }); return; }
  res.json(await getApprovalStatus('ECR', req.params.id));
}));

// ─── POST / ───────────────────────────────────────────────────────────────────
router.post('/', authenticateToken, asyncHandler(async (req: AuthRequest, res) => {
  try {
    const schema = z.object({
      title: z.string().min(1).max(200),
      description: z.string().max(2000).optional().nullable(),
      reason: z.string().max(2000).optional().nullable(),
      documentId: z.string().uuid(),
    });
    const data = schema.parse(req.body);

    // 確認文件存在
    const doc = await prisma.document.findUnique({ where: { id: data.documentId }, select: { id: true } });
    if (!doc) { res.status(400).json({ error: '關聯文件不存在' }); return; }

    const ecrNumber = await generateEcrNumber();
    const ecr = await prisma.eCR.create({
      data: {
        ecrNumber,
        title: data.title,
        description: data.description ?? null,
        reason: data.reason ?? null,
        documentId: data.documentId,
        requesterId: req.user!.id,
        status: 'DRAFT',
      },
    });

    writeAuditLog({
      userId: req.user!.id, action: 'CREATE', entity: 'ECR', entityId: ecr.id,
      detail: { ecrNumber, title: data.title, documentId: data.documentId },
      ip: getClientIp(req),
    });

    res.status(201).json(ecr);
  } catch (error: any) {
    if (error instanceof z.ZodError) { res.status(400).json({ error: '資料格式錯誤', details: error.errors }); return; }
    if (error.code === 'P2002') { res.status(400).json({ error: 'ECR 編號衝突，請重試' }); return; }
    const isDev = process.env.NODE_ENV === 'development';
    res.status(400).json({ error: '建立 ECR 失敗', ...(isDev ? { details: error.message } : {}) });
  }
}));

// ─── PUT /:id/submit ──────────────────────────────────────────────────────────
router.put('/:id/submit', authenticateToken, asyncHandler(async (req: AuthRequest, res) => {
  if (!validateIdParam(req.params.id)) { res.status(400).json({ error: '無效的 ID 參數' }); return; }
  try {
    const ecr = await prisma.eCR.findUnique({ where: { id: req.params.id } });
    if (!ecr) { res.status(404).json({ error: 'ECR 不存在' }); return; }
    if (ecr.requesterId !== req.user!.id && req.user!.role !== 'ADMIN') {
      res.status(403).json({ error: '只有申請者或 ADMIN 可提交審核' }); return;
    }
    if (ecr.status !== 'DRAFT') {
      res.status(400).json({ error: `ECR 目前狀態為 ${ecr.status}，無法提交` }); return;
    }

    const updated = await prisma.eCR.update({
      where: { id: ecr.id },
      data: { status: 'SUBMITTED' },
    });

    // 初始化審核流程（若無 active 範本則跳過）
    await initWorkflow('ECR', ecr.id);

    // 通知所有 ADMIN
    const admins = await prisma.user.findMany({ where: { role: 'ADMIN', isActive: true } });
    if (admins.length > 0) {
      await prisma.notification.createMany({
        data: admins.map((admin) => ({
          userId: admin.id,
          title: '新的 ECR 待審核',
          message: `ECR ${ecr.ecrNumber}: ${ecr.title}`,
        })),
      });
    }

    writeAuditLog({
      userId: req.user!.id, action: 'STATUS_CHANGE', entity: 'ECR', entityId: ecr.id,
      detail: { from: 'DRAFT', to: 'SUBMITTED', ecrNumber: ecr.ecrNumber },
      ip: getClientIp(req),
    });

    res.json(updated);
  } catch (error: any) {
    const isDev = process.env.NODE_ENV === 'development';
    res.status(400).json({ error: '提交失敗', ...(isDev ? { details: error.message } : {}) });
  }
}));

// ─── PUT /:id/approve ─────────────────────────────────────────────────────────
router.put('/:id/approve', authenticateToken, asyncHandler(async (req: AuthRequest, res) => {
  if (!validateIdParam(req.params.id)) { res.status(400).json({ error: '無效的 ID 參數' }); return; }
  try {
    const ecr = await prisma.eCR.findUnique({ where: { id: req.params.id } });
    if (!ecr) { res.status(404).json({ error: 'ECR 不存在' }); return; }
    if (ecr.status !== 'SUBMITTED') {
      res.status(400).json({ error: `ECR 目前狀態為 ${ecr.status}，無法審核` }); return;
    }

    const { comment } = req.body as { comment?: string };
    const currentStep = await getCurrentStep('ECR', req.params.id);

    if (!currentStep) {
      // 舊版單道：限 ADMIN
      if (req.user!.role !== 'ADMIN') { res.status(403).json({ error: '僅 ADMIN 可執行此操作' }); return; }
      const updated = await finalizeEcrApproval(req.params.id);
      writeAuditLog({
        userId: req.user!.id, action: 'STATUS_CHANGE', entity: 'ECR', entityId: req.params.id,
        detail: { from: 'SUBMITTED', to: 'APPROVED', ecrNumber: ecr.ecrNumber },
        ip: getClientIp(req),
      });
      return res.json(updated);
    }

    if (req.user!.role !== currentStep.step.approverRole) {
      res.status(403).json({ error: `此道審核（${currentStep.step.name}）需要 ${currentStep.step.approverRole} 角色` });
      return;
    }

    const { isLastStep } = await approveRecord(currentStep.record.id, req.user!.id, comment);

    if (!isLastStep) {
      const nextStep = await getCurrentStep('ECR', req.params.id);
      writeAuditLog({
        userId: req.user!.id, action: 'WORKFLOW_APPROVE', entity: 'ECR', entityId: req.params.id,
        detail: { stepName: currentStep.step.name, stepOrder: currentStep.step.order },
        ip: getClientIp(req),
      });
      return res.json({
        message: `第 ${currentStep.step.order} 道審核（${currentStep.step.name}）已通過`,
        isLastStep: false,
        nextStepName: nextStep?.step.name ?? null,
      });
    }

    const updated = await finalizeEcrApproval(req.params.id);
    writeAuditLog({
      userId: req.user!.id, action: 'STATUS_CHANGE', entity: 'ECR', entityId: req.params.id,
      detail: { from: 'SUBMITTED', to: 'APPROVED', ecrNumber: ecr.ecrNumber },
      ip: getClientIp(req),
    });
    res.json(updated);
  } catch (error: any) {
    const isDev = process.env.NODE_ENV === 'development';
    const status = error.message?.includes('需要') ? 403 : 400;
    res.status(status).json({ error: error.message || '審核失敗', ...(isDev ? { details: error.message } : {}) });
  }
}));

// ─── PUT /:id/reject ──────────────────────────────────────────────────────────
router.put('/:id/reject', authenticateToken, asyncHandler(async (req: AuthRequest, res) => {
  if (!validateIdParam(req.params.id)) { res.status(400).json({ error: '無效的 ID 參數' }); return; }
  try {
    const ecr = await prisma.eCR.findUnique({ where: { id: req.params.id } });
    if (!ecr) { res.status(404).json({ error: 'ECR 不存在' }); return; }
    if (ecr.status !== 'SUBMITTED') {
      res.status(400).json({ error: `ECR 目前狀態為 ${ecr.status}，無法退回` }); return;
    }

    const { comment } = req.body as { comment?: string };
    const currentStep = await getCurrentStep('ECR', req.params.id);

    if (!currentStep) {
      if (req.user!.role !== 'ADMIN') { res.status(403).json({ error: '僅 ADMIN 可執行此操作' }); return; }
    } else {
      if (req.user!.role !== currentStep.step.approverRole) {
        res.status(403).json({ error: `此道審核（${currentStep.step.name}）需要 ${currentStep.step.approverRole} 角色` });
        return;
      }
      await rejectRecord(currentStep.record.id, req.user!.id, comment);
    }

    const updated = await finalizeEcrRejection(req.params.id);
    writeAuditLog({
      userId: req.user!.id, action: 'STATUS_CHANGE', entity: 'ECR', entityId: req.params.id,
      detail: { from: 'SUBMITTED', to: 'REJECTED', ecrNumber: ecr.ecrNumber },
      ip: getClientIp(req),
    });
    res.json(updated);
  } catch (error: any) {
    const isDev = process.env.NODE_ENV === 'development';
    const status = error.message?.includes('需要') ? 403 : 400;
    res.status(status).json({ error: error.message || '退回失敗', ...(isDev ? { details: error.message } : {}) });
  }
}));

// ─── PUT /:id/convert ─────────────────────────────────────────────────────────
router.put('/:id/convert', authenticateToken, asyncHandler(async (req: AuthRequest, res) => {
  if (!validateIdParam(req.params.id)) { res.status(400).json({ error: '無效的 ID 參數' }); return; }
  try {
    const ecr = await prisma.eCR.findUnique({ where: { id: req.params.id } });
    if (!ecr) { res.status(404).json({ error: 'ECR 不存在' }); return; }
    if (ecr.status !== 'APPROVED') {
      res.status(400).json({ error: `ECR 尚未審核通過（目前：${ecr.status}），無法轉換` }); return;
    }
    if (ecr.requesterId !== req.user!.id && req.user!.role !== 'ADMIN') {
      res.status(403).json({ error: '只有申請者或 ADMIN 可執行轉換' }); return;
    }

    const ecnNo = await generateEcnNumber();

    const { ecn, updatedEcr } = await prisma.$transaction(async (tx) => {
      const newEcn = await tx.eCN.create({
        data: {
          ecnNo,
          title: ecr.title,
          description: ecr.description || ecr.reason || ecr.title,
          documentId: ecr.documentId,
          status: 'PENDING',
        },
      });
      const updated = await tx.eCR.update({
        where: { id: ecr.id },
        data: { status: 'CONVERTED', ecnId: newEcn.id },
      });
      // 通知申請者轉換成功
      await tx.notification.create({
        data: {
          userId: ecr.requesterId,
          title: 'ECR 已轉換為 ECN',
          message: `ECR ${ecr.ecrNumber} 已成功轉換為 ECN ${ecnNo}`,
        },
      });
      return { ecn: newEcn, updatedEcr: updated };
    });

    // 初始化 ECN workflow（若有 ECN active 範本）
    await initWorkflow('ECN', ecn.id);

    // 通知 ADMIN 有新 ECN 待審核
    const admins = await prisma.user.findMany({ where: { role: 'ADMIN', isActive: true } });
    if (admins.length > 0) {
      await prisma.notification.createMany({
        data: admins.map((admin) => ({
          userId: admin.id,
          title: '新的 ECN 待審核',
          message: `ECN ${ecnNo}: ${ecr.title}（由 ECR ${ecr.ecrNumber} 轉換）`,
        })),
      });
    }

    writeAuditLog({
      userId: req.user!.id, action: 'STATUS_CHANGE', entity: 'ECR', entityId: req.params.id,
      detail: { from: 'APPROVED', to: 'CONVERTED', ecrNumber: ecr.ecrNumber, ecnNo },
      ip: getClientIp(req),
    });

    res.json({ ecn, ecrNumber: ecr.ecrNumber });
  } catch (error: any) {
    const isDev = process.env.NODE_ENV === 'development';
    res.status(400).json({ error: error.message || '轉換失敗', ...(isDev ? { details: error.message } : {}) });
  }
}));

export default router;
