import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { DocumentStatuses, FileTypes } from '../lib/constants';
import path from 'path';
import fs from 'fs';
import { upload, resolveUploadPath, UPLOAD_DIR } from '../lib/upload';
import { asyncHandler } from '../lib/asyncHandler';

const router = Router();

router.post('/', authenticateToken, upload.array('files', 50), asyncHandler(async (req: AuthRequest, res) => {
  try {
    const schema = z.object({
      fileType: z.enum(['DWG', 'PDF', 'THREE_D', 'THUMB', 'WORD']),
      documentType: z.enum(['PART_DRAWING', 'PRODUCT_DRAWING', 'SPEC', 'SOP', 'QC']),
    });
    const { fileType, documentType } = schema.parse(req.body);

    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      res.status(400).json({ error: '未上傳檔案' });
      return;
    }

    // 取得所有料號和成品編碼用於匹配
    const [parts, products] = await Promise.all([
      prisma.part.findMany({ select: { id: true, partNumber: true, name: true } }),
      prisma.product.findMany({ select: { id: true, productCode: true, name: true } }),
    ]);

    const results: any[] = [];

    for (const file of files) {
      const originalName = file.originalname;
      // 移除副檔名
      const nameWithoutExt = path.basename(originalName, path.extname(originalName));

      // 嘗試匹配料號（找最長匹配）
      let matchedPart: { id: string; partNumber: string; name: string } | null = null;
      let matchedProduct: { id: string; productCode: string; name: string } | null = null;
      let bestMatchLength = 0;

      for (const part of parts) {
        if (nameWithoutExt.includes(part.partNumber) && part.partNumber.length > bestMatchLength) {
          matchedPart = part;
          bestMatchLength = part.partNumber.length;
        }
      }

      for (const prod of products) {
        if (nameWithoutExt.includes(prod.productCode) && prod.productCode.length > bestMatchLength) {
          matchedProduct = prod;
          matchedPart = null;
          bestMatchLength = prod.productCode.length;
        }
      }

      if (!matchedPart && !matchedProduct) {
        results.push({
          originalName,
          status: 'skipped',
          reason: '無法從檔名匹配到料號或成品編碼',
        });
        fs.unlinkSync(file.path);
        continue;
      }

      // 查找或創建文件記錄
      let document = await prisma.document.findFirst({
        where: {
          documentType,
          ...(matchedPart ? { partId: matchedPart.id } : { productId: matchedProduct!.id }),
          status: { not: DocumentStatuses.OBSOLETE },
        },
        orderBy: { version: 'desc' },
      });

      if (!document) {
        document = await prisma.document.create({
          data: {
            documentType,
            ...(matchedPart ? { partId: matchedPart.id } : { productId: matchedProduct!.id }),
            createdById: req.user!.id,
            status: DocumentStatuses.DRAFT,
            version: 1,
          },
        });
      }

      const ownerCode = matchedPart?.partNumber || matchedProduct?.productCode || 'unknown';
      const docTypeCode = documentType.replace('_', '');
      const versionStr = `R${document.version}`;
      const ext = path.extname(originalName);
      const fileName = `${ownerCode}_${docTypeCode}_${versionStr}_${fileType}${ext}`;
      const newPath = path.join(UPLOAD_DIR, fileName);

      const safeSource = resolveUploadPath(file.path);
      const safeDest = resolveUploadPath(newPath);
      fs.renameSync(safeSource, safeDest);

      const docFile = await prisma.documentFile.create({
        data: {
          documentId: document.id,
          fileType,
          fileName,
          originalName,
          filePath: safeDest,
          fileSize: file.size,
          mimeType: file.mimetype,
        },
      });

      results.push({
        originalName,
        status: 'success',
        fileId: docFile.id,
        documentId: document.id,
        matchedTo: matchedPart ? `${matchedPart.partNumber} - ${matchedPart.name}` : `${matchedProduct!.productCode} - ${matchedProduct!.name}`,
      });
    }

    res.json({ total: files.length, results });
  } catch (error: any) {
    const isDev = process.env.NODE_ENV === 'development';
    res.status(400).json({ error: '批量上傳失敗', ...(isDev ? { details: error.message } : {}) });
  }
}));

export default router;
