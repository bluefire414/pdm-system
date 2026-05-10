# 構建階段
FROM node:20-slim AS builder

WORKDIR /app

RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci

COPY . .
RUN sed -i 's/provider = "sqlite"/provider = "postgresql"/g' prisma/schema.prisma
RUN npx prisma generate --schema=prisma/schema.prisma && npm run build

# 生產階段
FROM node:20-slim

WORKDIR /app

ENV NODE_ENV=production

RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/prisma ./prisma

EXPOSE 3001

RUN mkdir -p /app/uploads

CMD ["sh", "-c", "node dist/scripts/migrateDocumentRelations.js && npx prisma db push --accept-data-loss && npm start"]
