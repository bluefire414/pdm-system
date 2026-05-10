import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import cron from 'node-cron';
import { errorHandler } from './middleware/errorHandler';
import { prisma } from './lib/prisma';
import { sendEcnDueSoonEmail } from './services/emailService';

import authRoutes from './routes/auth';
import userRoutes from './routes/users';
import seriesRoutes from './routes/series';
import partCategoryRoutes from './routes/part-categories';
import partRoutes from './routes/parts';
import productRoutes from './routes/products';
import documentRoutes from './routes/documents';
import searchRoutes from './routes/search';
import ecnRoutes from './routes/ecns';
import notificationRoutes from './routes/notifications';
import statsRoutes from './routes/stats';
import reportRoutes from './routes/reports';
import documentCategoryRoutes from './routes/document-categories';
import auditLogRoutes from './routes/audit-logs';
import workflowTemplateRoutes from './routes/workflow-templates';
import ecrRoutes from './routes/ecrs';

// 啟動時驗證必要環境變數
if (!process.env.JWT_SECRET) {
  console.error('Fatal: JWT_SECRET is not set. Please configure it in .env');
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:5173'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
}));
app.use(helmet());
app.use(express.json());

// API 路由
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/series', seriesRoutes);
app.use('/api/part-categories', partCategoryRoutes);
app.use('/api/parts', partRoutes);
app.use('/api/products', productRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/ecns', ecnRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/document-categories', documentCategoryRoutes);
app.use('/api/admin/audit-logs', auditLogRoutes);
app.use('/api/admin/workflow-templates', workflowTemplateRoutes);
app.use('/api/ecrs', ecrRoutes);

// 健康檢查
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 靜態檔案服務（上傳的檔案）
app.use('/uploads', express.static(path.resolve(process.env.UPLOAD_DIR || './uploads')));

// 統一錯誤處理
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`PDM 伺服器執行於 http://localhost:${PORT}`);
});

// 每天早上 9 點檢查 3 天後到期的 PENDING ECN 並寄送提醒給 ADMIN
cron.schedule('0 9 * * *', async () => {
  try {
    const now = new Date();
    const targetDate = new Date(now);
    targetDate.setDate(targetDate.getDate() + 3);
    // 取目標日的起點與終點
    const dayStart = new Date(targetDate);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(targetDate);
    dayEnd.setHours(23, 59, 59, 999);

    const dueSoonEcns = await prisma.eCN.findMany({
      where: {
        status: 'PENDING',
        dueDate: { gte: dayStart, lte: dayEnd },
      },
    });

    if (dueSoonEcns.length === 0) return;

    const admins = await prisma.user.findMany({
      where: { role: 'ADMIN', isActive: true, email: { not: null } },
      select: { email: true },
    });
    const adminEmails = admins.map((a) => a.email).filter(Boolean) as string[];

    for (const ecn of dueSoonEcns) {
      sendEcnDueSoonEmail(adminEmails, {
        ecnId: ecn.id,
        ecnNumber: ecn.ecnNo,
        title: ecn.title,
        dueDate: ecn.dueDate!,
      });
    }
    console.log(`[Cron] 發送 ${dueSoonEcns.length} 份 ECN 逾期提醒`);
  } catch (err) {
    console.error('[Cron] ECN 逾期提醒執行失敗', err);
  }
}, { timezone: 'Asia/Taipei' });
