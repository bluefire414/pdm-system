import { Request } from 'express';
import { prisma } from '../lib/prisma';

export interface AuditLogParams {
  userId: string;
  action: string;
  entity: string;
  entityId: string;
  detail?: Record<string, any>;
  ip?: string;
}

export function writeAuditLog(params: AuditLogParams): void {
  prisma.auditLog.create({
    data: {
      userId: params.userId,
      action: params.action,
      entity: params.entity,
      entityId: params.entityId,
      detail: params.detail ? JSON.stringify(params.detail) : null,
      ip: params.ip ?? null,
    },
  }).catch((err) => {
    console.error('[AuditLog] 寫入失敗:', err);
  });
}

export function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return (Array.isArray(forwarded) ? forwarded[0] : forwarded).split(',')[0].trim();
  }
  return req.ip ?? '';
}
