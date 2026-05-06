import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { canAccessDocument } from '../lib/permissions';
import { Role } from '../lib/constants';
import { asyncHandler } from '../lib/asyncHandler';

const router = Router();

const MAX_KEYWORD_LENGTH = 100;

router.get('/', authenticateToken, asyncHandler(async (req: AuthRequest, res) => {
  const { keyword, type } = req.query;
  const userRole = req.user!.role as Role;

  if (!keyword || String(keyword).trim().length === 0) {
    res.json({ parts: [], products: [], documents: [] });
    return;
  }

  let searchTerm = String(keyword).trim();
  if (searchTerm.length > MAX_KEYWORD_LENGTH) {
    searchTerm = searchTerm.substring(0, MAX_KEYWORD_LENGTH);
  }

  // 搜尋零件
  const parts = await prisma.part.findMany({
    where: {
      OR: [
        { partNumber: { contains: searchTerm } },
        { name: { contains: searchTerm } },
        { description: { contains: searchTerm } },
      ],
    },
    include: { series: { select: { code: true, name: true } } },
    take: 20,
  });

  // 搜尋成品
  const products = await prisma.product.findMany({
    where: {
      OR: [
        { productCode: { contains: searchTerm } },
        { name: { contains: searchTerm } },
        { description: { contains: searchTerm } },
      ],
    },
    take: 20,
  });

  // 搜尋文件
  const docWhere: any = {
    OR: [
      { remark: { contains: searchTerm } },
      {
        part: {
          OR: [
            { partNumber: { contains: searchTerm } },
            { name: { contains: searchTerm } },
          ],
        },
      },
      {
        product: {
          OR: [
            { productCode: { contains: searchTerm } },
            { name: { contains: searchTerm } },
          ],
        },
      },
    ],
  };

  if (type) {
    docWhere.documentType = String(type);
  }

  const documents = await prisma.document.findMany({
    where: docWhere,
    include: {
      part: { select: { partNumber: true, name: true } },
      product: { select: { productCode: true, name: true } },
      files: true,
      createdBy: { select: { name: true } },
    },
    take: 50,
    orderBy: { createdAt: 'desc' },
  });

  // 過濾權限
  const filteredDocs = documents.filter((doc) =>
    canAccessDocument(userRole, doc.documentType)
  );

  res.json({ parts, products, documents: filteredDocs });
}));

export default router;
