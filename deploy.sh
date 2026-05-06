#!/bin/bash
set -e

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_DIR"

echo ">>> 拉取最新代碼..."
git pull origin master

echo ">>> 構建前端..."
cd frontend
npm ci
npm run build
cd ..

echo ">>> 載入環境變數..."
source .env 2>/dev/null || true

if [ -z "$JWT_SECRET" ]; then
  echo "錯誤: JWT_SECRET 未設置，請先複製 .env.example 為 .env 並填入真實值"
  exit 1
fi

echo ">>> 啟動/更新 Docker 服務..."
docker compose -f docker-compose.prod.yml up -d --build

echo ">>> 檢查服務狀態..."
sleep 3
curl -sf http://127.0.0.1:3001/api/health || {
  echo "警告: 後端健康檢查失敗，請查看日誌: docker logs pdm-backend"
  exit 1
}

echo ">>> 部署完成"
echo "若更新了 Nginx 配置，請手動執行: sudo nginx -t && sudo systemctl reload nginx"
