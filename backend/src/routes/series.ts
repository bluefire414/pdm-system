import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticateToken } from '../middleware/auth';
import { asyncHandler } from '../lib/asyncHandler';

const router = Router();

function validateIdParam(id: string): boolean {
  return typeof id === 'string' && id.length > 0;
}

router.get('/', authenticateToken, asyncHandler(async (req, res) => {
  const series = await prisma.productSeries.findMany({
    orderBy: { code: 'asc' },
    include: { _count: { select: { products: true } } },
  });
  res.json(series);
}));

router.post('/', authenticateToken, asyncHandler(async (req, res) => {
  try {
    const schema = z.object({
      code: z.string().min(1).max(50),
      name: z.string().min(1).max(100),
      description: z.string().optional(),
    });
    const data = schema.parse(req.body);

    const series = await prisma.productSeries.create({ data });
    res.status(201).json(series);
  } catch (error: any) {
    if (error.code === 'P2002') {
      res.status(400).json({ error: '系列代碼已存在' });
      return;
    }
    const isDev = process.env.NODE_ENV === 'development';
    res.status(400).json({ error: '建立系列失敗', ...(isDev ? { details: error.message } : {}) });
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

    const series = await prisma.productSeries.update({
      where: { id: req.params.id },
      data,
    });
    res.json(series);
  } catch (error: any) {
    const isDev = process.env.NODE_ENV === 'development';
    res.status(400).json({ error: '更新系列失敗', ...(isDev ? { details: error.message } : {}) });
  }
}));

router.delete('/:id', authenticateToken, asyncHandler(async (req, res) => {
  if (!validateIdParam(req.params.id)) {
    res.status(400).json({ error: '無效的 ID 參數' });
    return;
  }
  try {
    await prisma.productSeries.delete({ where: { id: req.params.id } });
    res.json({ message: '系列已刪除' });
  } catch (error: any) {
    const isDev = process.env.NODE_ENV === 'development';
    res.status(400).json({ error: '刪除系列失敗', ...(isDev ? { details: error.message } : {}) });
  }
}));

export default router;
