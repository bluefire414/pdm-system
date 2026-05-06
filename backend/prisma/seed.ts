import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const hashedPassword = await bcrypt.hash('admin123', 10);

  // 建立預設管理員
  const admin = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      password: hashedPassword,
      name: '系統管理員',
      role: 'ADMIN',
    },
  });

  // 建立測試使用者
  await prisma.user.upsert({
    where: { username: 'engineer1' },
    update: {},
    create: {
      username: 'engineer1',
      password: await bcrypt.hash('engineer123', 10),
      name: '工程人員-張三',
      role: 'ENGINEER',
    },
  });

  await prisma.user.upsert({
    where: { username: 'mold1' },
    update: {},
    create: {
      username: 'mold1',
      password: await bcrypt.hash('mold123', 10),
      name: '模具人員-李四',
      role: 'MOLD',
    },
  });

  await prisma.user.upsert({
    where: { username: 'sales1' },
    update: {},
    create: {
      username: 'sales1',
      password: await bcrypt.hash('sales123', 10),
      name: '業務人員-王五',
      role: 'SALES',
    },
  });

  // 建立測試系列
  const series1 = await prisma.productSeries.upsert({
    where: { code: 'SW' },
    update: {},
    create: {
      code: 'SW',
      name: '按鈕開關系列',
      description: '各類按鈕開關產品',
    },
  });

  const series2 = await prisma.productSeries.upsert({
    where: { code: 'TG' },
    update: {},
    create: {
      code: 'TG',
      name: '撥動開關系列',
      description: '各類撥動開關產品',
    },
  });

  // 建立測試零件
  await prisma.part.upsert({
    where: { partNumber: 'SW-101-A' },
    update: {},
    create: {
      partNumber: 'SW-101-A',
      name: '按鈕開關本體',
      description: '標準型按鈕開關本體',
      seriesId: series1.id,
    },
  });

  await prisma.part.upsert({
    where: { partNumber: 'SW-102-B' },
    update: {},
    create: {
      partNumber: 'SW-102-B',
      name: '防水按鈕帽',
      description: 'IP67 防水等級按鈕帽',
      seriesId: series1.id,
    },
  });

  console.log('Seed data 建立完成');
  console.log('預設帳號：');
  console.log('  admin / admin123');
  console.log('  engineer1 / engineer123');
  console.log('  mold1 / mold123');
  console.log('  sales1 / sales123');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
