-- AlterTable: since when a task is in the Roadmap's Blocked table, so what is waiting can say for how long
-- (Roadmap TASK-31).
ALTER TABLE "Task" ADD COLUMN "blockedSince" TIMESTAMP(3);

-- The tasks blocked now: since the last time a sync read their row into the Blocked table (the audit trail
-- keeps it), else since the task exists. Approximate, as the audit trail only keeps what a sync saw.
UPDATE "Task" AS t
SET "blockedSince" = COALESCE(
  (
    SELECT MAX(a."occurredAt")
    FROM "AuditEvent" AS a
    WHERE a."entityType" = 'Task'
      AND a."entityId" = t."id"
      AND a."operation" = 'ROADMAP_TABLE_CHANGE'
      AND a."newValue" ->> 'roadmapTable' = 'BLOCKED'
  ),
  t."createdAt"
)
WHERE t."roadmapTable" = 'BLOCKED' AND t."deletedAt" IS NULL;
