-- Make AuditLog.userId nullable and set onDelete: SetNull
-- This allows users to be deactivated/deleted without violating FK constraints
-- while preserving audit trail records (userId becomes NULL)

ALTER TABLE "AuditLog" ALTER COLUMN "userId" DROP NOT NULL;
