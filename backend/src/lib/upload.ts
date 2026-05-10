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

// 各副檔名對應的 magic bytes（前 N 個 bytes 必須符合）
const MAGIC_BYTES: Record<string, number[]> = {
  '.pdf':   [0x25, 0x50, 0x44, 0x46],        // %PDF
  '.jpg':   [0xFF, 0xD8, 0xFF],               // JPEG SOI
  '.jpeg':  [0xFF, 0xD8, 0xFF],
  '.png':   [0x89, 0x50, 0x4E, 0x47],        // PNG
  '.gif':   [0x47, 0x49, 0x46, 0x38],        // GIF8
  '.doc':   [0xD0, 0xCF, 0x11, 0xE0],        // OLE2 Compound Document
  '.docx':  [0x50, 0x4B, 0x03, 0x04],        // ZIP (OOXML)
  '.dwg':   [0x41, 0x43],                    // AC（AutoCAD DWG）
};

// 副檔名白名單（不在此清單內的一律拒絕）
const ALLOWED_EXTENSIONS = new Set([
  '.pdf', '.dwg',
  '.sldprt', '.sldasm', '.step', '.stp', '.iges', '.igs',
  '.jpg', '.jpeg', '.png', '.gif',
  '.doc', '.docx',
]);

/**
 * 驗證上傳檔案的副檔名與實際內容（magic bytes）是否合法。
 * 若驗證失敗，會刪除已上傳的暫存檔並拋出錯誤。
 */
export function validateUploadedFile(file: Express.Multer.File): void {
  const ext = path.extname(file.originalname).toLowerCase();

  if (!ALLOWED_EXTENSIONS.has(ext)) {
    if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
    throw new Error(`不允許的檔案類型：${ext || '（無副檔名）'}`);
  }

  const expectedMagic = MAGIC_BYTES[ext];
  if (!expectedMagic) return; // 無 magic bytes 定義的類型（如 STEP、SolidWorks）跳過

  const buf = Buffer.alloc(expectedMagic.length);
  const fd = fs.openSync(file.path, 'r');
  try {
    fs.readSync(fd, buf, 0, expectedMagic.length, 0);
  } finally {
    fs.closeSync(fd);
  }

  const match = expectedMagic.every((byte, i) => buf[i] === byte);
  if (!match) {
    if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
    throw new Error(`檔案內容與副檔名 ${ext} 不符，請確認檔案格式正確`);
  }
}
