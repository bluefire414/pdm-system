-- CreateTable
CREATE TABLE "WorkflowTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkflowTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowStep" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "approverRole" TEXT NOT NULL,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "WorkflowStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalRecord" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "stepId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "approverId" TEXT,
    "comment" TEXT,
    "actionAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ApprovalRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkflowTemplate_entityType_isActive_idx" ON "WorkflowTemplate"("entityType", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowStep_templateId_order_key" ON "WorkflowStep"("templateId", "order");

-- CreateIndex
CREATE INDEX "WorkflowStep_templateId_idx" ON "WorkflowStep"("templateId");

-- CreateIndex
CREATE INDEX "ApprovalRecord_entityType_entityId_idx" ON "ApprovalRecord"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "ApprovalRecord_entityType_entityId_status_idx" ON "ApprovalRecord"("entityType", "entityId", "status");

-- AddForeignKey
ALTER TABLE "WorkflowStep" ADD CONSTRAINT "WorkflowStep_templateId_fkey"
    FOREIGN KEY ("templateId") REFERENCES "WorkflowTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalRecord" ADD CONSTRAINT "ApprovalRecord_stepId_fkey"
    FOREIGN KEY ("stepId") REFERENCES "WorkflowStep"("id") ON UPDATE CASCADE;
