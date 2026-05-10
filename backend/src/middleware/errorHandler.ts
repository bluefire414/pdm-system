import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';

const isDev = process.env.NODE_ENV === 'development';

export function errorHandler(err: any, req: Request, res: Response, next: NextFunction): void {
  // Zod 驗證錯誤 → 422
  if (err instanceof ZodError) {
    res.status(422).json({
      error: '輸入資料驗證失敗',
      ...(isDev ? { details: err.errors } : {}),
    });
    return;
  }

  // Prisma 已知錯誤
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      res.status(409).json({ error: '資料已存在（唯一值衝突）' });
      return;
    }
    if (err.code === 'P2025') {
      res.status(404).json({ error: '查無此資料' });
      return;
    }
    if (err.code === 'P2003') {
      res.status(400).json({ error: '關聯資料不存在' });
      return;
    }
    res.status(400).json({
      error: '資料庫操作失敗',
      ...(isDev ? { code: err.code, details: err.message } : {}),
    });
    return;
  }

  // 其他未預期錯誤 → 500
  console.error('[UnhandledError]', err);
  res.status(500).json({
    error: '伺服器內部錯誤',
    ...(isDev ? { details: err.message } : {}),
  });
}
