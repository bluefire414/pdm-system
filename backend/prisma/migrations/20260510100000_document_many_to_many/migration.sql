-- ============================================================
-- Migration: Document 一對多改多對多關聯
-- 新增 DocumentPart、DocumentProduct junction tables
-- 重要：此 migration 含資料遷移 SQL，步驟順序不可更動
-- ============================================================

-- Step 1: 建立 junction tables
CREATE TABLE "DocumentPart" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "partId" TEXT NOT NULL,
    CONSTRAINT "DocumentPart_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DocumentProduct" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    CONSTRAINT "DocumentProduct_pkey" PRIMARY KEY ("id")
);

-- Step 2: 資料遷移（必須在刪除舊欄位之前執行）
INSERT INTO "DocumentPart" ("id", "documentId", "partId")
SELECT gen_random_uuid()::text, "id", "partId"
FROM "Document"
WHERE "partId" IS NOT NULL;

INSERT INTO "DocumentProduct" ("id", "documentId", "productId")
SELECT gen_random_uuid()::text, "id", "productId"
FROM "Document"
WHERE "productId" IS NOT NULL;

-- Step 3: 建立唯一索引與一般索引
CREATE UNIQUE INDEX "DocumentPart_documentId_partId_key" ON "DocumentPart"("documentId", "partId");
CREATE INDEX "DocumentPart_documentId_idx" ON "DocumentPart"("documentId");
CREATE INDEX "DocumentPart_partId_idx" ON "DocumentPart"("partId");

CREATE UNIQUE INDEX "DocumentProduct_documentId_productId_key" ON "DocumentProduct"("documentId", "productId");
CREATE INDEX "DocumentProduct_documentId_idx" ON "DocumentProduct"("documentId");
CREATE INDEX "DocumentProduct_productId_idx" ON "DocumentProduct"("productId");

-- Step 4: 加入外鍵約束
ALTER TABLE "DocumentPart" ADD CONSTRAINT "DocumentPart_documentId_fkey"
    FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DocumentPart" ADD CONSTRAINT "DocumentPart_partId_fkey"
    FOREIGN KEY ("partId") REFERENCES "Part"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DocumentProduct" ADD CONSTRAINT "DocumentProduct_documentId_fkey"
    FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DocumentProduct" ADD CONSTRAINT "DocumentProduct_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Step 5: 移除 Document 舊索引
DROP INDEX IF EXISTS "Document_partId_idx";
DROP INDEX IF EXISTS "Document_productId_idx";

-- Step 6: 移除 Document 舊外鍵約束
ALTER TABLE "Document" DROP CONSTRAINT IF EXISTS "Document_partId_fkey";
ALTER TABLE "Document" DROP CONSTRAINT IF EXISTS "Document_productId_fkey";

-- Step 7: 移除 Document 舊欄位（資料遷移完成後才可執行）
ALTER TABLE "Document" DROP COLUMN IF EXISTS "partId";
ALTER TABLE "Document" DROP COLUMN IF EXISTS "productId";
