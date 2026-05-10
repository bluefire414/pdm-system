import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../lib/asyncHandler';
import { validateIdParam } from '../lib/validators';

const router = Router();

router.get('/', authenticateToken, asyncHandler(async (req: AuthRequest, res) => {
  const notifications = await prisma.notification.findMany({
    where: { userId: req.user!.id },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  res.json(notifications);
}));

router.get('/unread-count', authenticateToken, asyncHandler(async (req: AuthRequest, res) => {
  const count = await prisma.notification.count({
    where: { userId: req.user!.id, isRead: false },
  });
  res.json({ count });
}));

router.put('/:id/read', authenticateToken, asyncHandler(async (req: AuthRequest, res) => {
  if (!validateIdParam(req.params.id)) {
    res.status(400).json({ error: '無效的 ID 參數' });
    return;
  }
  try {
    await prisma.notification.updateMany({
      where: { id: req.params.id, userId: req.user!.id },
      data: { isRead: true },
    });
    res.json({ message: '已標記為已讀' });
  } catch (error: any) {
    const isDev = process.env.NODE_ENV === 'development';
    res.status(400).json({ error: '標記失敗', ...(isDev ? { details: error.message } : {}) });
  }
}));

router.put('/read-all', authenticateToken, asyncHandler(async (req: AuthRequest, res) => {
  try {
    await prisma.notification.updateMany({
      where: { userId: req.user!.id, isRead: false },
      data: { isRead: true },
    });
    res.json({ message: '全部標記為已讀' });
  } catch (error: any) {
    const isDev = process.env.NODE_ENV === 'development';
    res.status(400).json({ error: '標記失敗', ...(isDev ? { details: error.message } : {}) });
  }
}));

export default router;
