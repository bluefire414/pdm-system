import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

async function tableExists(name: string): Promise<boolean> {
  try {
    await prisma.$queryRawUnsafe(`SELECT 1 FROM "${name}" LIMIT 1`);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  if (await tableExists('DocumentPart')) {
    console.log('[migrate] DocumentPart already exists — skipping data migration.');
    return;
  }

  // Read legacy relations before db push drops the columns
  let partsRows: Array<{ id: string; partId: string }> = [];
  let productsRows: Array<{ id: string; productId: string }> = [];
  try {
    partsRows = await prisma.$queryRawUnsafe(
      `SELECT "id", "partId" FROM "Document" WHERE "partId" IS NOT NULL`
    );
    productsRows = await prisma.$queryRawUnsafe(
      `SELECT "id", "productId" FROM "Document" WHERE "productId" IS NOT NULL`
    );
  } catch {
    // Fresh database — Document table or legacy columns don't exist yet
    console.log('[migrate] No legacy Document data found — nothing to migrate.');
    return;
  }

  const isPostgres = (process.env.DATABASE_URL ?? '').startsWith('postgres');

  if (isPostgres) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "DocumentPart" (
        "id" TEXT NOT NULL,
        "documentId" TEXT NOT NULL,
        "partId" TEXT NOT NULL,
        CONSTRAINT "DocumentPart_pkey" PRIMARY KEY ("id")
      )
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "DocumentProduct" (
        "id" TEXT NOT NULL,
        "documentId" TEXT NOT NULL,
        "productId" TEXT NOT NULL,
        CONSTRAINT "DocumentProduct_pkey" PRIMARY KEY ("id")
      )
    `);
  } else {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "DocumentPart" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "documentId" TEXT NOT NULL,
        "partId" TEXT NOT NULL
      )
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "DocumentProduct" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "documentId" TEXT NOT NULL,
        "productId" TEXT NOT NULL
      )
    `);
  }

  for (const { id: documentId, partId } of partsRows) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "DocumentPart" ("id", "documentId", "partId") VALUES ('${randomUUID()}', '${documentId}', '${partId}')`
    );
  }

  for (const { id: documentId, productId } of productsRows) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "DocumentProduct" ("id", "documentId", "productId") VALUES ('${randomUUID()}', '${documentId}', '${productId}')`
    );
  }

  console.log(
    `[migrate] Done — ${partsRows.length} part link(s) and ${productsRows.length} product link(s) migrated.`
  );
}

main()
  .catch((e) => {
    console.error('[migrate] Error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
