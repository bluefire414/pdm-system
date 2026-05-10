import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticateToken, requireRole } from '../middleware/auth';
import { asyncHandler } from '../lib/asyncHandler';

const router = Router();

const MAX_KEYWORD_LENGTH = 100;

function sanitizeKeyword(keyword: unknown): string | undefined {
  if (!keyword) return undefined;
  const str = String(keyword).trim();
  if (str.length === 0) return undefined;
  return str.length > MAX_KEYWORD_LENGTH ? str.substring(0, MAX_KEYWORD_LENGTH) : str;
}

function validateIdParam(id: string): boolean {
  return typeof id === 'string' && id.length > 0;
}

router.get('/', authenticateToken, asyncHandler(async (req, res) => {
  const { categoryId } = req.query;
  const keyword = sanitizeKeyword(req.query.keyword);
  const where: any = {};

  if (categoryId) where.categoryId = String(categoryId);
  if (keyword) {
    where.OR = [
      { partNumber: { contains: keyword } },
      { name: { contains: keyword } },
      { description: { contains: keyword } },
    ];
  }

  const parts = await prisma.part.findMany({
    where,
    include: { category: { select: { code: true, name: true } } },
    orderBy: { partNumber: 'asc' },
  });
  res.json(parts);
}));

router.get('/:id', authenticateToken, asyncHandler(async (req, res) => {
  const part = await prisma.part.findUnique({
    where: { id: req.params.id },
    include: {
      category: true,
      documentParts: {
        include: { document: { include: { files: true } } },
        orderBy: { document: { createdAt: 'desc' } },
      },
    },
  });
  if (!part) {
    res.status(404).json({ error: '零件不存在' });
    return;
  }
  res.json(part);
}));

router.post('/', authenticateToken, asyncHandler(async (req, res) => {
  try {
    const schema = z.object({
      partNumber: z.string().min(1).max(100),
      name: z.string().min(1).max(200),
      description: z.string().optional(),
      categoryId: z.string().uuid(),
    });
    const data = schema.parse(req.body);

    const part = await prisma.part.create({ data });
    res.status(201).json(part);
  } catch (error: any) {
    if (error.code === 'P2002') {
      res.status(400).json({ error: '料號已存在' });
      return;
    }
    const isDev = process.env.NODE_ENV === 'development';
    res.status(400).json({ error: '建立零件失敗', ...(isDev ? { details: error.message } : {}) });
  }
}));

router.put('/:id', authenticateToken, asyncHandler(async (req, res) => {
  if (!validateIdParam(req.params.id)) {
    res.status(400).json({ error: '無效的 ID 參數' });
    return;
  }
  try {
    const schema = z.object({
      name: z.string().min(1).max(200).optional(),
      description: z.string().optional(),
      categoryId: z.string().uuid().optional(),
    });
    const data = schema.parse(req.body);

    const part = await prisma.part.update({
      where: { id: req.params.id },
      data,
    });
    res.json(part);
  } catch (error: any) {
    const isDev = process.env.NODE_ENV === 'development';
    res.status(400).json({ error: '更新零件失敗', ...(isDev ? { details: error.message } : {}) });
  }
}));

router.delete('/:id', authenticateToken, requireRole('ADMIN', 'ENGINEER'), asyncHandler(async (req, res) => {
  if (!validateIdParam(req.params.id)) {
    res.status(400).json({ error: '無效的 ID 參數' });
    return;
  }
  try {
    await prisma.part.delete({ where: { id: req.params.id } });
    res.json({ message: '零件已刪除' });
  } catch (error: any) {
    const isDev = process.env.NODE_ENV === 'development';
    res.status(400).json({ error: '刪除零件失敗', ...(isDev ? { details: error.message } : {}) });
  }
}));

export default router;
