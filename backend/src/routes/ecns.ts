import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticateToken, AuthRequest, requireRole } from '../middleware/auth';
import { DocumentStatuses } from '../lib/constants';
import { asyncHandler } from '../lib/asyncHandler';

const router = Router();

function validateIdParam(id: string): boolean {
  return typeof id === 'string' && id.length > 0;
}

router.get('/', authenticateToken, asyncHandler(async (req, res) => {
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
  res.json(ecns);
}));

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
  if (!ecn) {
    res.status(404).json({ error: 'ECN 不存在' });
    return;
  }
  res.json(ecn);
}));

router.post('/', authenticateToken, asyncHandler(async (req: AuthRequest, res) => {
  try {
    const schema = z.object({
      ecnNo: z.string().min(1).max(50),
      title: z.string().min(1).max(200),
      description: z.string().min(1),
      documentId: z.string().uuid(),
    });
    const data = schema.parse(req.body);

    const ecn = await prisma.eCN.create({
      data: {
        ...data,
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

    // 建立通知給主管
    const admins = await prisma.user.findMany({ where: { role: 'ADMIN', isActive: true } });
    for (const admin of admins) {
      await prisma.notification.create({
        data: {
          userId: admin.id,
          title: '新的 ECN 待審核',
          message: `ECN ${data.ecnNo}: ${data.title}`,
        },
      });
    }

    res.status(201).json(ecn);
  } catch (error: any) {
    if (error.code === 'P2002') {
      res.status(400).json({ error: 'ECN 編號已存在' });
      return;
    }
    const isDev = process.env.NODE_ENV === 'development';
    res.status(400).json({ error: '建立 ECN 失敗', ...(isDev ? { details: error.message } : {}) });
  }
}));

router.put('/:id/approve', authenticateToken, requireRole('ADMIN'), asyncHandler(async (req: AuthRequest, res) => {
  if (!validateIdParam(req.params.id)) {
    res.status(400).json({ error: '無效的 ID 參數' });
    return;
  }
  try {
    const ecn = await prisma.eCN.update({
      where: { id: req.params.id },
      data: {
        status: 'APPROVED',
        reviewedById: req.user!.id,
      },
      include: { document: true },
    });

    // 核准後，被變更的文件產生新版本（Draft）
    if (ecn.document) {
      await prisma.document.update({
        where: { id: ecn.document.id },
        data: {
          status: DocumentStatuses.DRAFT,
          version: ecn.document.version + 1,
        },
      });
    }

    // 通知申請人
    await prisma.notification.create({
      data: {
        userId: ecn.document.createdById,
        title: 'ECN 已核准',
        message: `ECN ${ecn.ecnNo} 已核准，文件已產生新版本`,
      },
    });

    res.json(ecn);
  } catch (error: any) {
    const isDev = process.env.NODE_ENV === 'development';
    res.status(400).json({ error: '核准 ECN 失敗', ...(isDev ? { details: error.message } : {}) });
  }
}));

router.put('/:id/reject', authenticateToken, requireRole('ADMIN'), asyncHandler(async (req: AuthRequest, res) => {
  if (!validateIdParam(req.params.id)) {
    res.status(400).json({ error: '無效的 ID 參數' });
    return;
  }
  try {
    const ecn = await prisma.eCN.update({
      where: { id: req.params.id },
      data: {
        status: 'REJECTED',
        reviewedById: req.user!.id,
      },
      include: { document: true },
    });

    // 通知申請人
    await prisma.notification.create({
      data: {
        userId: ecn.document.createdById,
        title: 'ECN 已退回',
        message: `ECN ${ecn.ecnNo} 已被退回`,
      },
    });

    res.json(ecn);
  } catch (error: any) {
    const isDev = process.env.NODE_ENV === 'development';
    res.status(400).json({ error: '退回 ECN 失敗', ...(isDev ? { details: error.message } : {}) });
  }
}));

export default router;
