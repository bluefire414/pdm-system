-- ============================================================
-- Migration: 新增資料庫索引（效能優化）
-- 僅新增 INDEX，無任何欄位或資料表結構變更，安全可回滾
-- ============================================================

-- User: 依角色查詢加速
CREATE INDEX IF NOT EXISTS "User_role_idx" ON "User"("role");

-- Part: 依類別查詢加速
CREATE INDEX IF NOT EXISTS "Part_categoryId_idx" ON "Part"("categoryId");

-- Product: 依系列查詢加速
CREATE INDEX IF NOT EXISTS "Product_seriesId_idx" ON "Product"("seriesId");

-- Document: 依文件類型查詢加速
CREATE INDEX IF NOT EXISTS "Document_documentType_idx" ON "Document"("documentType");

-- ECN: 依狀態與文件 ID 查詢加速
CREATE INDEX IF NOT EXISTS "ECN_status_idx" ON "ECN"("status");
CREATE INDEX IF NOT EXISTS "ECN_documentId_idx" ON "ECN"("documentId");
