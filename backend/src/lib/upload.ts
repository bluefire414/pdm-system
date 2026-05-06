import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

export const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

export const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}_${file.originalname}`;
    cb(null, uniqueName);
  },
});

export const upload = multer({ storage, limits: { fileSize: 100 * 1024 * 1024 } }); // 100MB

/**
 * 驗證文件路徑不超出 UPLOAD_DIR 目錄（防止目錄遍歷攻擊）
 */
export function resolveUploadPath(filePath: string): string {
  const resolved = path.resolve(filePath);
  const uploadDirResolved = path.resolve(UPLOAD_DIR);
  if (!resolved.startsWith(uploadDirResolved)) {
    throw new Error('非法檔案路徑');
  }
  return resolved;
}
