# PDM 產品資料管理系統 — Claude 操作規範

## 項目概述
- 前端：React + Vite + Ant Design，運行於 localhost:5173
- 後端：Node.js + Express + Prisma ORM
- 本地開發資料庫：SQLite（`backend/prisma/schema.prisma`）
- 生產環境資料庫：PostgreSQL（阿里云 ECS，域名 pdm.salecomlab.com）
- 部署方式：Docker Compose + Nginx 反向代理

---

## 鐵律：Prisma Schema 單一源頭

**絕對禁止維護兩個 schema 檔案。**

- 專案只允許存在 `backend/prisma/schema.prisma` 一個 schema 檔案
- `schema.prisma` 中的 `datasource db` provider 必須保持為 `"sqlite"`
- **禁止**創建 `schema.postgresql.prisma` 或任何其他 schema 複本
- 生產環境的 provider 切換由 `backend/Dockerfile` 自動處理，無需人工干涉

Dockerfile 中的關鍵步驟：
```dockerfile
RUN sed -i 's/provider = "sqlite"/provider = "postgresql"/g' prisma/schema.prisma
RUN npx prisma generate --schema=prisma/schema.prisma && npm run build
```

---

## 修改 Prisma Schema 時的強制檢查清單

每當你修改 `backend/prisma/schema.prisma`，必須依序確認：

1. **單一源頭**：沒有創建或遺留 `schema.postgresql.prisma`
2. **Dockerfile**：`sed` 替換 provider 的步驟仍然存在且正確
3. **docker-compose**：`docker-compose.prod.yml` 沒有掛載任何 schema 檔案覆蓋 `/app/prisma/schema.prisma`
4. **migration_lock**：`backend/prisma/migrations/migration_lock.toml` 中的 `provider = "postgresql"`
5. **後端路由**：檢查 `backend/src/routes/` 下所有檔案，確保沒有引用已刪除的模型或欄位
6. **前端類型**：檢查 `frontend/src/types/index.ts` 是否需要同步更新
7. **seed 腳本**：檢查 `backend/prisma/seed.ts` 是否引用變更的模型

---

## 生產部署架構

- `docker-compose.prod.yml` 啟動 `pdm-db`（PostgreSQL）與 `pdm-backend`
- 後端綁定 `127.0.0.1:3001`，由宿主機 Nginx 反向代理 `/api/` 與 `/uploads/`
- 前端靜態檔案由宿主機 Nginx 直接服務（`frontend/dist`）
- 環境變數 `JWT_SECRET` 必須在 `.env` 中設定，否則 `deploy.sh` 會終止並報錯

---

## 資料庫 Seed 初始化（關鍵提醒）

**生產環境部署後，資料庫預設是空的，必須手動執行 seed：**

```bash
docker exec pdm-backend sh -c "cd /app && npx tsx prisma/seed.ts"
```

Seed 建立的預設帳號：
- `admin` / `admin123`（ADMIN 角色）
- `engineer1` / `pass123`（ENGINEER 角色）
- `viewer1` / `pass123`（ENGINEER 角色）⚠️ 注意：系統實際無 VIEWER 角色，此帳號為 ENGINEER

**若跳過 seed，登入功能完全無法使用。**

---

## 常見陷阱與提醒

- **PartCategory 模型**：舊版曾遺留 `schema.postgresql.prisma` 缺少此模型，若發現遺留檔案立即刪除並統一到 `schema.prisma`
- **API 前綴**：所有後端路由必須以 `/api` 開頭（Nginx 已配置反向代理到 `:3001`）
- **Docker build cache**：修改 schema 後若部署異常，使用 `docker compose build --no-cache` 強制重建
- **雙遠端倉庫**：commit 後必須同時推送到 GitHub（origin）和 Gitee（gitee）

---

## 專案目錄結構

```
pdm-system/
├── backend/
│   ├── prisma/
│   │   ├── migrations/          # Prisma migration 歷史
│   │   ├── schema.prisma        # 唯一 schema 源頭（保持 sqlite provider）
│   │   └── seed.ts              # 初始化資料
│   ├── src/
│   │   ├── index.ts             # Express 入口，掛載所有路由
│   │   ├── lib/
│   │   │   ├── asyncHandler.ts  # 統一 async 錯誤捕捉
│   │   │   ├── constants.ts     # 角色、文件類型、狀態常數
│   │   │   ├── permissions.ts   # 角色×文件×檔案的權限矩陣
│   │   │   ├── prisma.ts        # Prisma client 單例
│   │   │   └── upload.ts        # multer 上傳設定
│   │   ├── middleware/
│   │   │   └── auth.ts          # JWT 驗證、requireRole 守衛
│   │   └── routes/
│   │       ├── auth.ts
│   │       ├── batch-upload.ts
│   │       ├── documents.ts
│   │       ├── ecns.ts
│   │       ├── notifications.ts
│   │       ├── part-categories.ts
│   │       ├── parts.ts
│   │       ├── products.ts
│   │       ├── reports.ts
│   │       ├── search.ts
│   │       ├── series.ts
│   │       ├── stats.ts
│   │       └── users.ts
│   ├── Dockerfile
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── api/
│   │   │   └── client.ts        # axios 實例，自動帶 JWT header
│   │   ├── components/
│   │   │   └── Layout.tsx       # 側邊欄、Header（通知徽章）、使用者選單
│   │   ├── context/
│   │   │   └── AuthContext.tsx  # 全局登入狀態、JWT localStorage 管理
│   │   ├── pages/
│   │   │   ├── BatchUploadPage.tsx
│   │   │   ├── Dashboard.tsx
│   │   │   ├── DocumentsPage.tsx
│   │   │   ├── ECNsPage.tsx
│   │   │   ├── Login.tsx
│   │   │   ├── NotificationsPage.tsx
│   │   │   ├── PartCategoriesPage.tsx
│   │   │   ├── PartsPage.tsx
│   │   │   ├── ProductsPage.tsx
│   │   │   ├── SearchPage.tsx
│   │   │   ├── SeriesPage.tsx
│   │   │   └── UsersPage.tsx
│   │   ├── types/
│   │   │   └── index.ts         # 前端 TypeScript 型別定義
│   │   ├── App.tsx              # React Router 路由配置
│   │   └── main.tsx
│   └── package.json
├── docker-compose.yml           # 本地 Docker 測試（SQLite + Nginx）
├── docker-compose.prod.yml      # 生產（PostgreSQL，後端綁 127.0.0.1）
└── deploy.sh                    # 生產部署腳本
```

---

## 資料庫 Schema 摘要

### 所有 Model 一覽

| Model | 說明 | 關鍵欄位 |
|---|---|---|
| `User` | 系統使用者 | `username`(唯一)、`role`(ADMIN/ENGINEER/MOLD/SALES)、`isActive` |
| `PartCategory` | 零部件類別 | `code`(唯一)、`name` |
| `ProductSeries` | 成品系列 | `code`(唯一)、`name` |
| `Part` | 零部件料號 | `partNumber`(唯一)、`categoryId`(FK→PartCategory) |
| `Product` | 成品 | `productCode`(唯一)、`seriesId`(FK→ProductSeries) |
| `ProductBOM` | BOM 清單 | `productId`+`partId`(複合唯一)、`quantity` |
| `Document` | 文件 | `documentType`、`status`、`version`、可掛 Part 或 Product |
| `DocumentFile` | 文件附檔 | `fileType`、`filePath`、`fileSize`、`mimeType` |
| `ECN` | 工程變更通知 | `ecnNo`(唯一)、`status`(PENDING/APPROVED/REJECTED)、`documentId` |
| `Notification` | 站內通知 | `userId`、`isRead` |

### Model 關聯關係

```
ProductSeries ──< Product ──< ProductBOM >── Part >── PartCategory
                    │                          │
                    └──< Document ──< DocumentFile
                                   └──< ECN
User ──< Document（createdBy）
User ──< ECN（reviewedBy）
User ──< Notification
```

### 常數定義（`backend/src/lib/constants.ts`）

- **角色**：`ADMIN`、`ENGINEER`、`MOLD`、`SALES`
- **文件類型**：`PART_DRAWING`、`PRODUCT_DRAWING`、`SPEC`、`SOP`、`QC`
- **檔案類型**：`DWG`、`PDF`、`THREE_D`、`THUMB`、`WORD`
- **文件狀態**：`DRAFT` → `PENDING` → `RELEASED` / `OBSOLETE`

---

## API 路由清單

所有路由均需 `Authorization: Bearer <token>`，除 `POST /api/auth/login`。

| 路由檔案 | 路徑前綴 | 主要端點 | 角色限制 |
|---|---|---|---|
| `auth.ts` | `/api/auth` | `POST /login`、`GET /me` | 公開（login）/ 已登入（me） |
| `users.ts` | `/api/users` | `GET /`、`POST /`、`PUT /:id`、`DELETE /:id` | 僅 ADMIN |
| `parts.ts` | `/api/parts` | `GET /`、`GET /:id`、`POST /`、`PUT /:id`、`DELETE /:id` | 已登入（無角色限制） |
| `part-categories.ts` | `/api/part-categories` | `GET /`、`POST /`、`PUT /:id`、`DELETE /:id` | 已登入（無角色限制） |
| `products.ts` | `/api/products` | `GET /`、`GET /:id`、`POST /`、`PUT /:id`、`DELETE /:id`、`POST /:id/bom`、`DELETE /:id/bom/:partId` | 已登入（無角色限制） |
| `series.ts` | `/api/series` | `GET /`、`POST /`、`PUT /:id`、`DELETE /:id` | 已登入（無角色限制） |
| `documents.ts` | `/api/documents` | `GET /`、`GET /:id`、`POST /`、`PUT /:id/status`、`DELETE /:id`、檔案上傳下載 | 已登入；下載受權限矩陣控管 |
| `ecns.ts` | `/api/ecns` | `GET /`、`GET /:id`、`POST /`、`PUT /:id/approve`、`PUT /:id/reject` | 審核操作僅 ADMIN |
| `notifications.ts` | `/api/notifications` | `GET /`、`PUT /:id/read`、`PUT /read-all` | 已登入（只取自己的通知） |
| `search.ts` | `/api/search` | `GET /` | 已登入 |
| `stats.ts` | `/api/stats` | `GET /` | 已登入 |
| `reports.ts` | `/api/reports` | `GET /bom`（BOM 報表下載） | 已登入 |
| `batch-upload.ts` | `/api/batch-upload` | `POST /` | 已登入 |

---

## 角色權限細則

### API 操作層級

| 功能 | ADMIN | ENGINEER | MOLD | SALES |
|---|---|---|---|---|
| 使用者管理（CRUD） | ✅ | ❌ | ❌ | ❌ |
| 零部件 CRUD | ✅ | ✅ | ✅ | ✅ |
| 成品 / BOM CRUD | ✅ | ✅ | ✅ | ✅ |
| 文件建立 | ✅ | ✅ | ✅ | ✅ |
| ECN 建立 | ✅ | ✅ | ✅ | ✅ |
| ECN 核准 / 退回 | ✅ | ❌ | ❌ | ❌ |

### 文件檔案存取矩陣（`backend/src/lib/permissions.ts`）

| 角色 | PART_DRAWING | PRODUCT_DRAWING | SPEC | SOP | QC |
|---|---|---|---|---|---|
| ADMIN | 全部可檢視+下載 | 全部可檢視+下載 | WORD+PDF | WORD+PDF | WORD+PDF |
| ENGINEER | 全部可檢視+下載 | 全部可檢視+下載 | WORD+PDF | WORD+PDF | WORD+PDF |
| MOLD | 全部可檢視+下載 | 全部可檢視+下載 | ❌ | ❌ | ❌ |
| SALES | ❌ | PDF+THUMB（僅檢視，不可下載） | PDF（僅檢視） | ❌ | ❌ |

---

## 常用開發指令

### 前端（`frontend/`）

```bash
npm run dev       # 啟動開發伺服器 → http://localhost:5173
npm run build     # 編譯 TypeScript + Vite 打包 → dist/
npm run preview   # 預覽 dist/ 的靜態輸出
```

### 後端（`backend/`）

```bash
npm run dev       # tsx watch 熱重載 → http://localhost:3001
npm run build     # tsc 編譯到 dist/
npm run start     # 直接執行 dist/index.js（生產模式）

# Prisma
npm run db:migrate   # prisma migrate dev（本地 SQLite，建立 migration）
npm run db:generate  # prisma generate（重新產生 client）
npm run db:seed      # tsx prisma/seed.ts（植入初始資料）
npm run db:studio    # 開啟 Prisma Studio GUI
```

### Docker 本地測試

```bash
# 本地完整測試（SQLite + Nginx，含前端靜態）
docker compose up --build

# 清除並重建
docker compose down -v
docker compose up --build
```

### Docker 生產部署

```bash
# 完整重建並啟動（PostgreSQL）
docker compose -f docker-compose.prod.yml up --build -d

# 強制不用 cache 重建（修改 schema 或新增套件後必須）
docker compose -f docker-compose.prod.yml build --no-cache
docker compose -f docker-compose.prod.yml up -d

# 執行 migration（進容器）
docker exec pdm-backend npx prisma migrate deploy

# 執行 seed（新環境初始化）
docker exec pdm-backend sh -c "cd /app && npx tsx prisma/seed.ts"

# 查看後端 log
docker logs pdm-backend -f
```

---

## 核心業務流程

### 1. 零部件管理（Parts）
- 維護零部件料號（partNumber），必須歸屬某一**零部件類別**（PartCategory）
- 每個零部件可掛多份文件（圖紙、規格書等）

### 2. 成品管理（Products）
- 維護成品料號（productCode），必須歸屬某一**成品系列**（ProductSeries）
- 每個成品可掛多個 BOM 項目（ProductBOM），指定所需零部件與用量

### 3. 文件管理（Documents）
- 文件可掛在**零部件**或**成品**上
- 文件狀態流程：`DRAFT` → `PENDING` → `RELEASED`（或 `OBSOLETE`）
- 每份文件可上傳多個附檔（DocumentFile），依角色決定可檢視/下載的檔案類型

### 4. 工程變更通知（ECN）
- 工程師建立 ECN，關聯到某份文件，狀態初始為 `PENDING`
- 建立時自動通知所有 ADMIN（站內通知）
- ADMIN 核准後：文件版本 +1、狀態回到 `DRAFT`，並通知申請人
- ADMIN 退回後：通知申請人

### 5. 批量上傳（Batch Upload）
- 支援 Excel 格式批量匯入零部件或成品資料

### 6. 全文搜尋（Search）
- 跨 Part / Product / Document 的關鍵字搜尋

### 7. 儀表板 & 統計（Dashboard / Stats）
- 顯示系統概覽：文件數量、待審 ECN、最新活動等

### 8. 通知中心（Notifications）
- 站內通知，支援標記已讀、全部已讀

---

## 已知技術債與重構目標

### 高優先

1. **角色定義不一致**（`backend/src/middleware/auth.ts` + `backend/src/lib/constants.ts`）
   - `constants.ts` 定義 4 個角色：ADMIN、ENGINEER、MOLD、SALES
   - `seed.ts` 的 `viewer1` 帳號註解寫 VIEWER 角色，但實際建立的是 ENGINEER（與本文件舊版說明衝突）
   - **解決方向**：統一 seed 帳號說明，或評估是否需新增 VIEWER 角色

2. **`parts.ts` / `products.ts` 刪除無角色限制**（`backend/src/routes/parts.ts:108`、`products.ts`）
   - 任何已登入用戶（包括 SALES）均可刪除零部件與成品
   - **解決方向**：DELETE 操作應限制為 ADMIN 或 ENGINEER

3. **`backend/src/index.ts` 開發模式的 JWT_SECRET fallback**（第 25 行）
   - 若 `NODE_ENV=development` 且未設 `JWT_SECRET`，使用預設值繼續運行
   - 若開發者忘記設定且誤上生產環境，存在安全風險
   - **解決方向**：統一強制要求設定，移除 fallback

### 中優先

4. **`frontend/src/pages/NotificationsPage.tsx:38,48`**
   - `console.error(error)` 直接暴露錯誤物件，生產環境應改用結構化日誌或靜默處理

5. **單一 Layout 元件**（`frontend/src/components/Layout.tsx`）
   - 整個應用只有一個 Layout，側邊欄導覽邏輯與 UI 混雜，隨功能增加將難以維護
   - **解決方向**：將導覽項目抽成設定陣列，由 Layout 動態渲染

6. **`documents.ts` 缺少 SALES 角色的建立/更新限制**
   - 權限矩陣限制 SALES 的下載，但建立文件的 POST 無角色守衛

### 低優先

7. **`backend/src/routes/` 各路由的 Zod schema 重複定義**
   - 多個路由各自定義相似的 UUID 驗證、字串長度限制
   - **解決方向**：抽出共用 Zod schema 到 `lib/schemas.ts`

8. **前端僅有一個 `components/Layout.tsx`**
   - 缺少任何可複用的 UI 元件（表格、表單、Modal 等），全部邏輯散落在各 Page 中

---

## 修改時的生產環境影響評估

本專案部署於阿里雲 ECS，使用 Docker Compose + Nginx。
每次修改前，Claude 必須主動評估並告知以下影響：

1. **新增環境變數**
   - 需同步更新 ECS 上的 `.env`
   - 更新後需重啟容器：`docker compose -f docker-compose.prod.yml up -d`

2. **新增 npm 套件**
   - 必須重新建置映像：`docker compose -f docker-compose.prod.yml build --no-cache`
   - 不可只用 `docker compose restart`（套件不會生效）

3. **Schema 變更**
   - 本地開發：`npx prisma migrate dev`（SQLite）
   - 生產部署：進入容器後執行 `npx prisma migrate deploy`（PostgreSQL）
   - **禁止**在生產環境執行 `migrate dev`

4. **新增檔案上傳功能**
   - 必須確認 `docker-compose.prod.yml` 有對應的 volume 掛載
   - 未掛載 volume 的路徑，容器重建後檔案將永久遺失

5. **Nginx 設定變更**
   - 需同步修改宿主機的 Nginx 設定檔
   - 修改後執行：`nginx -t && systemctl reload nginx`

6. **資料庫初始化（新環境）**
   - 部署後資料庫預設為空，必須手動執行 seed：
   - `docker exec pdm-backend sh -c "cd /app && npx tsx prisma/seed.ts"`
