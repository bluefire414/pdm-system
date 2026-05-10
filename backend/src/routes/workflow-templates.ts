import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticateToken, requireRole } from '../middleware/auth';
import { asyncHandler } from '../lib/asyncHandler';
import { validateIdParam } from '../lib/validators';

const router = Router();

const stepSchema = z.object({
  name: z.string().min(1).max(100),
  approverRole: z.enum(['ADMIN', 'ENGINEER', 'MOLD', 'SALES']),
  isRequired: z.boolean().default(true),
});

const templateBodySchema = z.object({
  name: z.string().min(1).max(200),
  entityType: z.enum(['ECN']),
  steps: z.array(stepSchema).min(1).max(20),
});

// 列出所有流程範本（含節點數與使用中標記）
router.get('/', authenticateToken, requireRole('ADMIN'), asyncHandler(async (_req, res) => {
  const templates = await prisma.workflowTemplate.findMany({
    include: {
      steps: { orderBy: { order: 'asc' } },
    },
    orderBy: { createdAt: 'desc' },
  });

  // 統計各範本的 ApprovalRecord 引用數
  const templateIds = templates.map((t) => t.id);
  const stepIds = templates.flatMap((t) => t.steps.map((s) => s.id));
  const usageCounts = stepIds.length > 0
    ? await prisma.approvalRecord.groupBy({
        by: ['stepId'],
        where: { stepId: { in: stepIds } },
        _count: { id: true },
      })
    : [];
  const usedStepIds = new Set(usageCounts.map((u) => u.stepId));

  const result = templates.map((t) => ({
    ...t,
    stepCount: t.steps.length,
    isInUse: t.steps.some((s) => usedStepIds.has(s.id)),
  }));

  res.json(result);
}));

// 取得單一範本詳情
router.get('/:id', authenticateToken, requireRole('ADMIN'), asyncHandler(async (req, res) => {
  if (!validateIdParam(req.params.id)) {
    res.status(400).json({ error: '無效的 ID 參數' });
    return;
  }
  const template = await prisma.workflowTemplate.findUnique({
    where: { id: req.params.id },
    include: { steps: { orderBy: { order: 'asc' } } },
  });
  if (!template) {
    res.status(404).json({ error: '找不到流程範本' });
    return;
  }
  res.json(template);
}));

// 建立新範本（同時停用同 entityType 的其他 active 範本）
router.post('/', authenticateToken, requireRole('ADMIN'), asyncHandler(async (req, res) => {
  try {
    const data = templateBodySchema.parse(req.body);

    const template = await prisma.$transaction(async (tx) => {
      // 若新範本直接設為 active，停用同類型舊範本
      await tx.workflowTemplate.updateMany({
        where: { entityType: data.entityType, isActive: true },
        data: { isActive: false },
      });

      return tx.workflowTemplate.create({
        data: {
          name: data.name,
          entityType: data.entityType,
          isActive: true,
          steps: {
            create: data.steps.map((step, idx) => ({
              order: idx + 1,
              name: step.name,
              approverRole: step.approverRole,
              isRequired: step.isRequired,
            })),
          },
        },
        include: { steps: { orderBy: { order: 'asc' } } },
      });
    });

    res.status(201).json(template);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: '資料格式錯誤', details: error.errors });
      return;
    }
    const isDev = process.env.NODE_ENV === 'development';
    res.status(400).json({ error: '建立失敗', ...(isDev ? { details: error.message } : {}) });
  }
}));

// 更新範本
router.put('/:id', authenticateToken, requireRole('ADMIN'), asyncHandler(async (req, res) => {
  if (!validateIdParam(req.params.id)) {
    res.status(400).json({ error: '無效的 ID 參數' });
    return;
  }
  try {
    const updateSchema = z.object({
      name: z.string().min(1).max(200).optional(),
      isActive: z.boolean().optional(),
      steps: z.array(stepSchema).min(1).max(20).optional(),
    });
    const data = updateSchema.parse(req.body);

    const existing = await prisma.workflowTemplate.findUnique({
      where: { id: req.params.id },
      include: { steps: true },
    });
    if (!existing) {
      res.status(404).json({ error: '找不到流程範本' });
      return;
    }

    // 若要修改節點，確認範本未在使用中
    if (data.steps) {
      const stepIds = existing.steps.map((s) => s.id);
      const inUseCount = stepIds.length > 0
        ? await prisma.approvalRecord.count({ where: { stepId: { in: stepIds } } })
        : 0;
      if (inUseCount > 0) {
        res.status(409).json({
          error: '此範本已有進行中的審核記錄，無法修改節點。請建立新範本取代之。',
          inUseCount,
        });
        return;
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      // 啟用此範本時，停用同類型其他範本
      if (data.isActive === true) {
        await tx.workflowTemplate.updateMany({
          where: { entityType: existing.entityType, isActive: true, id: { not: req.params.id } },
          data: { isActive: false },
        });
      }

      if (data.steps) {
        // 刪除舊節點再重建
        await tx.workflowStep.deleteMany({ where: { templateId: req.params.id } });
        return tx.workflowTemplate.update({
          where: { id: req.params.id },
          data: {
            ...(data.name ? { name: data.name } : {}),
            ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
            steps: {
              create: data.steps.map((step, idx) => ({
                order: idx + 1,
                name: step.name,
                approverRole: step.approverRole,
                isRequired: step.isRequired,
              })),
            },
          },
          include: { steps: { orderBy: { order: 'asc' } } },
        });
      }

      return tx.workflowTemplate.update({
        where: { id: req.params.id },
        data: {
          ...(data.name ? { name: data.name } : {}),
          ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
        },
        include: { steps: { orderBy: { order: 'asc' } } },
      });
    });

    res.json(updated);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: '資料格式錯誤', details: error.errors });
      return;
    }
    const isDev = process.env.NODE_ENV === 'development';
    res.status(400).json({ error: '更新失敗', ...(isDev ? { details: error.message } : {}) });
  }
}));

export default router;
