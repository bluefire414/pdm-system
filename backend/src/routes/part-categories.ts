import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../lib/asyncHandler';
import { validateIdParam } from '../lib/validators';
import { writeAuditLog, getClientIp } from '../middleware/auditLog';

const router = Router();

router.get('/', authenticateToken, asyncHandler(async (req, res) => {
  const categories = await prisma.partCategory.findMany({
    orderBy: { code: 'asc' },
    include: { _count: { select: { parts: true } } },
  });
  res.json(categories);
}));

router.post('/', authenticateToken, asyncHandler(async (req, res) => {
  try {
    const schema = z.object({
      code: z.string().min(1).max(50),
      name: z.string().min(1).max(100),
      description: z.string().optional(),
    });
    const data = schema.parse(req.body);

    const category = await prisma.partCategory.create({ data });
    res.status(201).json(category);
  } catch (error: any) {
    if (error.code === 'P2002') {
      res.status(400).json({ error: '類別代碼已存在' });
      return;
    }
    const isDev = process.env.NODE_ENV === 'development';
    res.status(400).json({ error: '建立類別失敗', ...(isDev ? { details: error.message } : {}) });
  }
}));

router.put('/:id', authenticateToken, asyncHandler(async (req, res) => {
  if (!validateIdParam(req.params.id)) {
    res.status(400).json({ error: '無效的 ID 參數' });
    return;
  }
  try {
    const schema = z.object({
      name: z.string().min(1).max(100).optional(),
      description: z.string().optional(),
    });
    const data = schema.parse(req.body);

    const category = await prisma.partCategory.update({
      where: { id: req.params.id },
      data,
    });
    res.json(category);
  } catch (error: any) {
    const isDev = process.env.NODE_ENV === 'development';
    res.status(400).json({ error: '更新類別失敗', ...(isDev ? { details: error.message } : {}) });
  }
}));

router.delete('/:id', authenticateToken, asyncHandler(async (req: AuthRequest, res) => {
  if (!validateIdParam(req.params.id)) {
    res.status(400).json({ error: '無效的 ID 參數' });
    return;
  }
  try {
    await prisma.partCategory.delete({ where: { id: req.params.id } });
    writeAuditLog({
      userId: req.user!.id,
      action: 'DELETE',
      entity: 'PartCategory',
      entityId: req.params.id,
      ip: getClientIp(req),
    });
    res.json({ message: '類別已刪除' });
  } catch (error: any) {
    const isDev = process.env.NODE_ENV === 'development';
    res.status(400).json({ error: '刪除類別失敗', ...(isDev ? { details: error.message } : {}) });
  }
}));

export default router;
