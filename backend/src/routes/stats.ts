import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../lib/asyncHandler';

const router = Router();

router.get('/', authenticateToken, asyncHandler(async (req: AuthRequest, res) => {
  const userId = req.user!.id;

  const [
    seriesCount,
    partsCount,
    productsCount,
    documentsCount,
    releasedDocumentsCount,
    pendingEcnsCount,
    unreadNotificationsCount,
  ] = await Promise.all([
    prisma.productSeries.count(),
    prisma.part.count(),
    prisma.product.count(),
    prisma.document.count(),
    prisma.document.count({ where: { status: 'RELEASED' } }),
    prisma.eCN.count({ where: { status: 'PENDING' } }),
    prisma.notification.count({ where: { userId, isRead: false } }),
  ]);

  res.json({
    seriesCount,
    partsCount,
    productsCount,
    documentsCount,
    releasedDocumentsCount,
    pendingEcnsCount,
    unreadNotificationsCount,
  });
}));

export default router;
