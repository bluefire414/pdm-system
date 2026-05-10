import { prisma } from '../lib/prisma';

export interface CurrentStepResult {
  record: {
    id: string;
    entityType: string;
    entityId: string;
    stepId: string;
    order: number;
    status: string;
  };
  step: {
    id: string;
    name: string;
    approverRole: string;
    isRequired: boolean;
    order: number;
  };
}

/**
 * 為 entityId 建立 ApprovalRecord 序列。
 * 若找不到對應 entityType 的 active WorkflowTemplate，不做任何事（退回舊行為）。
 */
export async function initWorkflow(entityType: string, entityId: string): Promise<void> {
  const template = await prisma.workflowTemplate.findFirst({
    where: { entityType, isActive: true },
    include: { steps: { orderBy: { order: 'asc' } } },
  });
  if (!template || template.steps.length === 0) return;

  await prisma.approvalRecord.createMany({
    data: template.steps.map((step) => ({
      entityType,
      entityId,
      stepId: step.id,
      order: step.order,
      status: 'PENDING',
    })),
  });
}

/**
 * 取得目前最低 order 且 PENDING 的 ApprovalRecord。
 * 若無（代表無 workflow 或已全部審完），回傳 null。
 */
export async function getCurrentStep(
  entityType: string,
  entityId: string,
): Promise<CurrentStepResult | null> {
  const record = await prisma.approvalRecord.findFirst({
    where: { entityType, entityId, status: 'PENDING' },
    orderBy: { order: 'asc' },
    include: { step: true },
  });
  if (!record) return null;
  return {
    record: {
      id: record.id,
      entityType: record.entityType,
      entityId: record.entityId,
      stepId: record.stepId,
      order: record.order,
      status: record.status,
    },
    step: {
      id: record.step.id,
      name: record.step.name,
      approverRole: record.step.approverRole,
      isRequired: record.step.isRequired,
      order: record.step.order,
    },
  };
}

/**
 * 核准指定 ApprovalRecord。
 * 驗證 approverId 的角色是否符合該 step 的 approverRole。
 * 回傳 isLastStep：若為最後一道，呼叫方應執行 ECN 終態邏輯。
 */
export async function approveRecord(
  recordId: string,
  approverId: string,
  comment?: string,
): Promise<{ isLastStep: boolean; entityId: string }> {
  const record = await prisma.approvalRecord.findUnique({
    where: { id: recordId },
    include: { step: true },
  });
  if (!record) throw new Error('找不到審核記錄');
  if (record.status !== 'PENDING') throw new Error('此記錄已非待審核狀態');

  const approver = await prisma.user.findUnique({ where: { id: approverId } });
  if (!approver) throw new Error('找不到審核者');
  if (approver.role !== record.step.approverRole) {
    throw new Error(`此道審核（${record.step.name}）需要 ${record.step.approverRole} 角色才能操作`);
  }

  await prisma.approvalRecord.update({
    where: { id: recordId },
    data: {
      status: 'APPROVED',
      approverId,
      comment: comment || null,
      actionAt: new Date(),
    },
  });

  const nextPending = await prisma.approvalRecord.findFirst({
    where: {
      entityType: record.entityType,
      entityId: record.entityId,
      status: 'PENDING',
      order: { gt: record.order },
    },
  });

  return { isLastStep: !nextPending, entityId: record.entityId };
}

/**
 * 退回指定 ApprovalRecord，並將後續所有 PENDING 記錄設為 CANCELLED。
 */
export async function rejectRecord(
  recordId: string,
  approverId: string,
  comment?: string,
): Promise<{ entityId: string }> {
  const record = await prisma.approvalRecord.findUnique({
    where: { id: recordId },
    include: { step: true },
  });
  if (!record) throw new Error('找不到審核記錄');
  if (record.status !== 'PENDING') throw new Error('此記錄已非待審核狀態');

  const approver = await prisma.user.findUnique({ where: { id: approverId } });
  if (!approver) throw new Error('找不到審核者');
  if (approver.role !== record.step.approverRole) {
    throw new Error(`此道審核（${record.step.name}）需要 ${record.step.approverRole} 角色才能操作`);
  }

  await prisma.$transaction([
    prisma.approvalRecord.update({
      where: { id: recordId },
      data: {
        status: 'REJECTED',
        approverId,
        comment: comment || null,
        actionAt: new Date(),
      },
    }),
    prisma.approvalRecord.updateMany({
      where: {
        entityType: record.entityType,
        entityId: record.entityId,
        status: 'PENDING',
        order: { gt: record.order },
      },
      data: { status: 'CANCELLED' },
    }),
  ]);

  return { entityId: record.entityId };
}

/**
 * 取得某 entity 所有 ApprovalRecord（含 step 資訊），依 order 排序。
 * 同時批量查詢審核者姓名。
 */
export async function getApprovalStatus(entityType: string, entityId: string) {
  const records = await prisma.approvalRecord.findMany({
    where: { entityType, entityId },
    orderBy: { order: 'asc' },
    include: { step: true },
  });

  if (records.length === 0) {
    return { hasWorkflow: false, records: [] };
  }

  // 批量查詢審核者
  const approverIds = [...new Set(records.map((r) => r.approverId).filter(Boolean) as string[])];
  const approvers = approverIds.length > 0
    ? await prisma.user.findMany({
        where: { id: { in: approverIds } },
        select: { id: true, name: true },
      })
    : [];
  const approverMap = new Map(approvers.map((u) => [u.id, u]));

  return {
    hasWorkflow: true,
    records: records.map((r) => ({
      id: r.id,
      order: r.order,
      status: r.status,
      approverId: r.approverId,
      comment: r.comment,
      actionAt: r.actionAt,
      createdAt: r.createdAt,
      step: {
        id: r.step.id,
        name: r.step.name,
        approverRole: r.step.approverRole,
        isRequired: r.step.isRequired,
      },
      approver: r.approverId ? (approverMap.get(r.approverId) ?? null) : null,
    })),
  };
}
