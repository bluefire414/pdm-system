import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  // 1. 用戶
  const admin = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      password: await bcrypt.hash('admin123', 10),
      name: '系統管理員',
      role: 'ADMIN',
    },
  });

  await prisma.user.upsert({
    where: { username: 'engineer1' },
    update: {},
    create: {
      username: 'engineer1',
      password: await bcrypt.hash('pass123', 10),
      name: '工程師一號',
      role: 'ENGINEER',
    },
  });

  await prisma.user.upsert({
    where: { username: 'viewer1' },
    update: {},
    create: {
      username: 'viewer1',
      password: await bcrypt.hash('pass123', 10),
      name: '檢視員一號',
      role: 'VIEWER',
    },
  });

  // 2. 產品系列
  const seriesA = await prisma.productSeries.upsert({
    where: { code: 'SL-A' },
    update: {},
    create: {
      code: 'SL-A',
      name: 'A系列-消費電子',
      description: '消費電子產品系列',
    },
  });

  const seriesB = await prisma.productSeries.upsert({
    where: { code: 'SL-B' },
    update: {},
    create: {
      code: 'SL-B',
      name: 'B系列-工業設備',
      description: '工業設備產品系列',
    },
  });

  const seriesC = await prisma.productSeries.upsert({
    where: { code: 'SL-C' },
    update: {},
    create: {
      code: 'SL-C',
      name: 'C系列-醫療器材',
      description: '醫療器材產品系列',
    },
  });

  // 3. 成品
  await prisma.product.upsert({
    where: { productCode: 'PRD-001' },
    update: {},
    create: {
      productCode: 'PRD-001',
      name: '智能手環',
      description: '智能手環產品',
      seriesId: seriesA.id,
    },
  });

  await prisma.product.upsert({
    where: { productCode: 'PRD-002' },
    update: {},
    create: {
      productCode: 'PRD-002',
      name: '工業感測器',
      description: '工業感測器產品',
      seriesId: seriesB.id,
    },
  });

  await prisma.product.upsert({
    where: { productCode: 'PRD-003' },
    update: {},
    create: {
      productCode: 'PRD-003',
      name: '血壓計',
      description: '血壓計產品',
      seriesId: seriesC.id,
    },
  });

  // 4. 零部件類別
  const catMech = await prisma.partCategory.upsert({
    where: { code: 'CAT-MECH' },
    update: {},
    create: {
      code: 'CAT-MECH',
      name: '機構件',
      description: '機械結構相關零件',
    },
  });

  const catElec = await prisma.partCategory.upsert({
    where: { code: 'CAT-ELEC' },
    update: {},
    create: {
      code: 'CAT-ELEC',
      name: '電子件',
      description: '電子元器件',
    },
  });

  const catPcb = await prisma.partCategory.upsert({
    where: { code: 'CAT-PCB' },
    update: {},
    create: {
      code: 'CAT-PCB',
      name: '電路板',
      description: '印刷電路板相關',
    },
  });

  // 5. 零部件
  await prisma.part.upsert({
    where: { partNumber: 'PRT-M001' },
    update: {},
    create: {
      partNumber: 'PRT-M001',
      name: '外殼組件',
      description: '產品外殼機構件',
      categoryId: catMech.id,
    },
  });

  await prisma.part.upsert({
    where: { partNumber: 'PRT-E001' },
    update: {},
    create: {
      partNumber: 'PRT-E001',
      name: '主控MCU',
      description: '主控制微處理器',
      categoryId: catElec.id,
    },
  });

  await prisma.part.upsert({
    where: { partNumber: 'PRT-P001' },
    update: {},
    create: {
      partNumber: 'PRT-P001',
      name: '主板PCB',
      description: '主印刷電路板',
      categoryId: catPcb.id,
    },
  });

  // WorkflowTemplate：ECR 預設一道 ADMIN 審核
  const ecrTemplate = await prisma.workflowTemplate.findFirst({
    where: { entityType: 'ECR', isActive: true },
  });
  if (!ecrTemplate) {
    await prisma.workflowTemplate.create({
      data: {
        name: '標準 ECR 審核流程',
        entityType: 'ECR',
        isActive: true,
        steps: {
          create: [{ order: 1, name: 'ADMIN 審核', approverRole: 'ADMIN', isRequired: true }],
        },
      },
    });
  }

  console.log('Seed data 建立完成');
  console.log('用戶：');
  console.log('  admin / admin123 (ADMIN)');
  console.log('  engineer1 / pass123 (ENGINEER)');
  console.log('  viewer1 / pass123 (VIEWER)');
  console.log('產品系列：SL-A, SL-B, SL-C');
  console.log('成品：PRD-001, PRD-002, PRD-003');
  console.log('零部件類別：CAT-MECH, CAT-ELEC, CAT-PCB');
  console.log('零部件：PRT-M001, PRT-E001, PRT-P001');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
