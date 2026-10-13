-- AlterTable: when a task entered its current state (Roadmap TASK-11). A new task is in its
-- state from the moment it exists, which is what the default says.
ALTER TABLE "Task" ADD COLUMN     "statusChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Backfill: the latest status change in the audit trail, else when the task was created.
UPDATE "Task" t
SET "statusChangedAt" = COALESCE(
  (
    SELECT MAX(a."occurredAt")
    FROM "AuditEvent" a
    WHERE a."entityType" = 'Task'
      AND a."entityId" = t."id"
      AND a."operation" = 'STATUS_CHANGE'
  ),
  t."createdAt"
);

-- CreateIndex
CREATE INDEX "Task_projectId_status_statusChangedAt_idx" ON "Task"("projectId", "status", "statusChangedAt");
