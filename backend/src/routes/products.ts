import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticateToken } from '../middleware/auth';
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
  const keyword = sanitizeKeyword(req.query.keyword);
  const where: any = {};
  if (keyword) {
    where.OR = [
      { productCode: { contains: keyword } },
      { name: { contains: keyword } },
    ];
  }

  const products = await prisma.product.findMany({
    where,
    orderBy: { productCode: 'asc' },
  });
  res.json(products);
}));

router.get('/:id', authenticateToken, asyncHandler(async (req, res) => {
  const product = await prisma.product.findUnique({
    where: { id: req.params.id },
    include: {
      boms: {
        include: {
          part: {
            include: {
              series: { select: { code: true, name: true } },
            },
          },
        },
      },
      documents: {
        include: { files: true },
        orderBy: { createdAt: 'desc' },
      },
    },
  });
  if (!product) {
    res.status(404).json({ error: '成品不存在' });
    return;
  }
  res.json(product);
}));

router.post('/', authenticateToken, asyncHandler(async (req, res) => {
  try {
    const schema = z.object({
      productCode: z.string().min(1).max(100),
      name: z.string().min(1).max(200),
      description: z.string().optional(),
    });
    const data = schema.parse(req.body);

    const product = await prisma.product.create({ data });
    res.status(201).json(product);
  } catch (error: any) {
    if (error.code === 'P2002') {
      res.status(400).json({ error: '成品編碼已存在' });
      return;
    }
    const isDev = process.env.NODE_ENV === 'development';
    res.status(400).json({ error: '建立成品失敗', ...(isDev ? { details: error.message } : {}) });
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
    });
    const data = schema.parse(req.body);

    const product = await prisma.product.update({
      where: { id: req.params.id },
      data,
    });
    res.json(product);
  } catch (error: any) {
    const isDev = process.env.NODE_ENV === 'development';
    res.status(400).json({ error: '更新成品失敗', ...(isDev ? { details: error.message } : {}) });
  }
}));

router.delete('/:id', authenticateToken, asyncHandler(async (req, res) => {
  if (!validateIdParam(req.params.id)) {
    res.status(400).json({ error: '無效的 ID 參數' });
    return;
  }
  try {
    await prisma.product.delete({ where: { id: req.params.id } });
    res.json({ message: '成品已刪除' });
  } catch (error: any) {
    const isDev = process.env.NODE_ENV === 'development';
    res.status(400).json({ error: '刪除成品失敗', ...(isDev ? { details: error.message } : {}) });
  }
}));

// BOM 管理
router.get('/:id/boms', authenticateToken, asyncHandler(async (req, res) => {
  const boms = await prisma.productBOM.findMany({
    where: { productId: req.params.id },
    include: {
      part: {
        include: {
          series: { select: { code: true, name: true } },
        },
      },
    },
  });
  res.json(boms);
}));

router.post('/:id/boms', authenticateToken, asyncHandler(async (req, res) => {
  if (!validateIdParam(req.params.id)) {
    res.status(400).json({ error: '無效的 ID 參數' });
    return;
  }
  try {
    const schema = z.object({
      partId: z.string().uuid(),
      quantity: z.number().int().min(1).default(1),
    });
    const data = schema.parse(req.body);

    const bom = await prisma.productBOM.create({
      data: {
        productId: req.params.id,
        partId: data.partId,
        quantity: data.quantity,
      },
      include: {
        part: {
          include: {
            series: { select: { code: true, name: true } },
          },
        },
      },
    });
    res.status(201).json(bom);
  } catch (error: any) {
    if (error.code === 'P2002') {
      res.status(400).json({ error: '此零件已在 BOM 中' });
      return;
    }
    const isDev = process.env.NODE_ENV === 'development';
    res.status(400).json({ error: '新增 BOM 失敗', ...(isDev ? { details: error.message } : {}) });
  }
}));

router.delete('/:id/boms/:partId', authenticateToken, asyncHandler(async (req, res) => {
  if (!validateIdParam(req.params.id) || !validateIdParam(req.params.partId)) {
    res.status(400).json({ error: '無效的 ID 參數' });
    return;
  }
  try {
    await prisma.productBOM.deleteMany({
      where: {
        productId: req.params.id,
        partId: req.params.partId,
      },
    });
    res.json({ message: 'BOM 項目已移除' });
  } catch (error: any) {
    const isDev = process.env.NODE_ENV === 'development';
    res.status(400).json({ error: '移除 BOM 失敗', ...(isDev ? { details: error.message } : {}) });
  }
}));

export default router;
