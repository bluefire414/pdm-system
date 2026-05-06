import { Router } from 'express';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticateToken, requireRole } from '../middleware/auth';
import { asyncHandler } from '../lib/asyncHandler';

const router = Router();

function validateIdParam(id: string): boolean {
  return typeof id === 'string' && id.length > 0;
}

const createUserSchema = z.object({
  username: z.string().min(3).max(50),
  password: z.string().min(6),
  name: z.string().min(1).max(100),
  role: z.enum(['ADMIN', 'ENGINEER', 'MOLD', 'SALES']),
});

const updateUserSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  role: z.enum(['ADMIN', 'ENGINEER', 'MOLD', 'SALES']).optional(),
  isActive: z.boolean().optional(),
  password: z.string().min(6).optional(),
});

// 取得所有使用者 (僅 ADMIN)
router.get('/', authenticateToken, requireRole('ADMIN'), asyncHandler(async (req, res) => {
  const users = await prisma.user.findMany({
    select: { id: true, username: true, name: true, role: true, isActive: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  });
  res.json(users);
}));

// 建立使用者 (僅 ADMIN)
router.post('/', authenticateToken, requireRole('ADMIN'), asyncHandler(async (req, res) => {
  try {
    const data = createUserSchema.parse(req.body);
    const hashedPassword = await bcrypt.hash(data.password, 10);

    const user = await prisma.user.create({
      data: {
        username: data.username,
        password: hashedPassword,
        name: data.name,
        role: data.role,
      },
      select: { id: true, username: true, name: true, role: true, isActive: true },
    });

    res.status(201).json(user);
  } catch (error: any) {
    if (error.code === 'P2002') {
      res.status(400).json({ error: '使用者名稱已存在' });
      return;
    }
    const isDev = process.env.NODE_ENV === 'development';
    res.status(400).json({ error: '建立使用者失敗', ...(isDev ? { details: error.message } : {}) });
  }
}));

// 更新使用者 (僅 ADMIN)
router.put('/:id', authenticateToken, requireRole('ADMIN'), asyncHandler(async (req, res) => {
  if (!validateIdParam(req.params.id)) {
    res.status(400).json({ error: '無效的 ID 參數' });
    return;
  }
  try {
    const data = updateUserSchema.parse(req.body);
    const updateData: any = { ...data };

    if (data.password) {
      updateData.password = await bcrypt.hash(data.password, 10);
    }

    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: updateData,
      select: { id: true, username: true, name: true, role: true, isActive: true },
    });

    res.json(user);
  } catch (error: any) {
    const isDev = process.env.NODE_ENV === 'development';
    res.status(400).json({ error: '更新使用者失敗', ...(isDev ? { details: error.message } : {}) });
  }
}));

// 刪除使用者 (僅 ADMIN)
router.delete('/:id', authenticateToken, requireRole('ADMIN'), asyncHandler(async (req, res) => {
  if (!validateIdParam(req.params.id)) {
    res.status(400).json({ error: '無效的 ID 參數' });
    return;
  }
  try {
    await prisma.user.delete({ where: { id: req.params.id } });
    res.json({ message: '使用者已刪除' });
  } catch (error: any) {
    const isDev = process.env.NODE_ENV === 'development';
    res.status(400).json({ error: '刪除使用者失敗', ...(isDev ? { details: error.message } : {}) });
  }
}));

export default router;
