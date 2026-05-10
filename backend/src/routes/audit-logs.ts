import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { authenticateToken, requireRole } from '../middleware/auth';
import { asyncHandler } from '../lib/asyncHandler';

const router = Router();

router.get('/', authenticateToken, requireRole('ADMIN'), asyncHandler(async (req, res) => {
  const { entity, userId, action, dateFrom, dateTo } = req.query;
  const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1);
  const pageSize = Math.min(200, Math.max(1, parseInt(String(req.query.pageSize ?? '50'), 10) || 50));

  const where: any = {};

  if (entity) where.entity = String(entity);
  if (userId) where.userId = String(userId);
  if (action) where.action = String(action);

  if (dateFrom || dateTo) {
    where.createdAt = {};
    if (dateFrom) where.createdAt.gte = new Date(String(dateFrom));
    if (dateTo) {
      const to = new Date(String(dateTo));
      to.setHours(23, 59, 59, 999);
      where.createdAt.lte = to;
    }
  }

  const [total, logs] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      include: {
        user: { select: { id: true, username: true, name: true, role: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  const data = logs.map((log) => ({
    ...log,
    detail: log.detail ? JSON.parse(log.detail) : null,
  }));

  res.json({ data, total, page, pageSize });
}));

export default router;
