import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticateToken, requireRole } from '../middleware/auth';
import { asyncHandler } from '../lib/asyncHandler';

const router = Router();

function validateIdParam(id: string): boolean {
  return typeof id === 'string' && id.length > 0;
}

router.get('/', authenticateToken, asyncHandler(async (req, res) => {
  const categories = await prisma.documentCategory.findMany({
    orderBy: { code: 'asc' },
    include: { _count: { select: { documents: true } } },
  });
  res.json(categories);
}));

router.post('/', authenticateToken, requireRole('ADMIN'), asyncHandler(async (req, res) => {
  try {
    const schema = z.object({
      code: z.string().min(1).max(50),
      name: z.string().min(1).max(100),
      description: z.string().optional(),
    });
    const data = schema.parse(req.body);

    const category = await prisma.documentCategory.create({ data });
    res.status(201).json(category);
  } catch (error: any) {
    if (error.code === 'P2002') {
      res.status(400).json({ error: '分類代碼已存在' });
      return;
    }
    const isDev = process.env.NODE_ENV === 'development';
    res.status(400).json({ error: '建立分類失敗', ...(isDev ? { details: error.message } : {}) });
  }
}));

router.put('/:id', authenticateToken, requireRole('ADMIN'), asyncHandler(async (req, res) => {
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

    const category = await prisma.documentCategory.update({
      where: { id: req.params.id },
      data,
    });
    res.json(category);
  } catch (error: any) {
    const isDev = process.env.NODE_ENV === 'development';
    res.status(400).json({ error: '更新分類失敗', ...(isDev ? { details: error.message } : {}) });
  }
}));

router.delete('/:id', authenticateToken, requireRole('ADMIN'), asyncHandler(async (req, res) => {
  if (!validateIdParam(req.params.id)) {
    res.status(400).json({ error: '無效的 ID 參數' });
    return;
  }
  try {
    await prisma.documentCategory.delete({ where: { id: req.params.id } });
    res.json({ message: '分類已刪除' });
  } catch (error: any) {
    if (error.code === 'P2003') {
      res.status(400).json({ error: '此分類下仍有文件，無法刪除' });
      return;
    }
    const isDev = process.env.NODE_ENV === 'development';
    res.status(400).json({ error: '刪除分類失敗', ...(isDev ? { details: error.message } : {}) });
  }
}));

export default router;
