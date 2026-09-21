-- Roadmap GAP-36d: the date a task was completed.
ALTER TABLE "Task" ADD COLUMN "completedAt" TIMESTAMP(3);

-- Tasks already TERMINADA get the moment they last moved there, from the audit
-- trail; one with no such event (created done, or from before the trail) falls
-- back to its last update.
UPDATE "Task" AS t
SET "completedAt" = COALESCE(
  (
    SELECT MAX(a."occurredAt")
    FROM "AuditEvent" AS a
    WHERE a."entityType" = 'Task'
      AND a."entityId" = t."id"
      AND a."newValue" ->> 'status' = 'TERMINADA'
  ),
  t."updatedAt"
)
WHERE t."status" = 'TERMINADA';
