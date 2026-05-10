import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticateToken, requireRole } from '../middleware/auth';
import { asyncHandler } from '../lib/asyncHandler';
import { sanitizeKeyword, validateIdParam } from '../lib/validators';

const router = Router();

router.get('/', authenticateToken, asyncHandler(async (req, res) => {
  const keyword = sanitizeKeyword(req.query.keyword);
  const { seriesId } = req.query;
  const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1);
  const pageSize = Math.min(200, Math.max(1, parseInt(String(req.query.pageSize ?? '50'), 10) || 50));

  const where: any = {};
  if (seriesId) where.seriesId = String(seriesId);
  if (keyword) {
    where.OR = [
      { productCode: { contains: keyword } },
      { name: { contains: keyword } },
    ];
  }

  const [total, products] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      include: { series: { select: { code: true, name: true } } },
      orderBy: { productCode: 'asc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  res.json({ data: products, total, page, pageSize });
}));

router.get('/:id', authenticateToken, asyncHandler(async (req, res) => {
  const product = await prisma.product.findUnique({
    where: { id: req.params.id },
    include: {
      boms: {
        include: {
          part: {
            include: {
              category: { select: { code: true, name: true } },
            },
          },
        },
      },
      documentProducts: {
        include: { document: { include: { files: true } } },
        orderBy: { document: { createdAt: 'desc' } },
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
      seriesId: z.string().uuid(),
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
      seriesId: z.string().uuid().optional(),
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

router.delete('/:id', authenticateToken, requireRole('ADMIN', 'ENGINEER'), asyncHandler(async (req, res) => {
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
          category: { select: { code: true, name: true } },
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
            category: { select: { code: true, name: true } },
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

router.delete('/:id/boms/:partId', authenticateToken, requireRole('ADMIN', 'ENGINEER'), asyncHandler(async (req, res) => {
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
