import { z } from 'zod';

const MAX_KEYWORD_LENGTH = 100;

export function sanitizeKeyword(keyword: unknown): string | undefined {
  if (!keyword) return undefined;
  const str = String(keyword).trim();
  if (str.length === 0) return undefined;
  return str.length > MAX_KEYWORD_LENGTH ? str.substring(0, MAX_KEYWORD_LENGTH) : str;
}

export function validateIdParam(id: string): boolean {
  return typeof id === 'string' && id.length > 0;
}

export const passwordSchema = z.string()
  .min(8, '密碼至少 8 字元')
  .regex(/[A-Z]/, '密碼需包含至少一個大寫字母')
  .regex(/[a-z]/, '密碼需包含至少一個小寫字母')
  .regex(/[0-9]/, '密碼需包含至少一個數字');

export const uuidSchema = z.string().uuid('無效的 ID 格式');

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});
