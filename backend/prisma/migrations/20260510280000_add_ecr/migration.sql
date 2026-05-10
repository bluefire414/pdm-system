-- CreateTable
CREATE TABLE "ECR" (
    "id" TEXT NOT NULL,
    "ecrNumber" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "reason" TEXT,
    "documentId" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "ecnId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ECR_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ECR_ecrNumber_key" ON "ECR"("ecrNumber");
CREATE UNIQUE INDEX "ECR_ecnId_key" ON "ECR"("ecnId");
CREATE INDEX "ECR_documentId_idx" ON "ECR"("documentId");
CREATE INDEX "ECR_requesterId_idx" ON "ECR"("requesterId");
CREATE INDEX "ECR_status_idx" ON "ECR"("status");

-- AddForeignKey
ALTER TABLE "ECR" ADD CONSTRAINT "ECR_documentId_fkey"
    FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON UPDATE CASCADE;
