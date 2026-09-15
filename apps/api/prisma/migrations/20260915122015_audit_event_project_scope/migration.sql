-- AlterTable
ALTER TABLE "AuditEvent" ADD COLUMN     "projectId" TEXT;

-- CreateIndex
CREATE INDEX "AuditEvent_projectId_occurredAt_idx" ON "AuditEvent"("projectId", "occurredAt");

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: every audit row written before this migration describes a Task
-- (task changes, sync, write-back and conflict resolution all audited
-- entityType='Task'), so its project is the task's project.
UPDATE "AuditEvent" AS a
SET "projectId" = t."projectId"
FROM "Task" AS t
WHERE a."entityType" = 'Task' AND a."entityId" = t."id";
