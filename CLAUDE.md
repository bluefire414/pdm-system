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
- `viewer1` / `pass123`（VIEWER 角色）

**若跳過 seed，登入功能完全無法使用。**

---

## 常見陷阱與提醒

- **PartCategory 模型**：舊版曾遺留 `schema.postgresql.prisma` 缺少此模型，若發現遺留檔案立即刪除並統一到 `schema.prisma`
- **API 前綴**：所有後端路由必須以 `/api` 開頭（Nginx 已配置反向代理到 `:3001`）
- **Docker build cache**：修改 schema 後若部署異常，使用 `docker compose build --no-cache` 強制重建
- **雙遠端倉庫**：commit 後必須同時推送到 GitHub（origin）和 Gitee（gitee）
