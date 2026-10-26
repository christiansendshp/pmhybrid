-- AlterTable: when the members were told every work task of a phase is done, so the notice is sent once and
-- again only after the phase had an open task and was finished again (Roadmap TASK-41).
ALTER TABLE "Phase" ADD COLUMN "completionNotifiedAt" TIMESTAMP(3);

-- The phases that are complete now are marked, so deploying this does not announce work finished long ago: a
-- phase is complete when it has work tasks (alive, and not a card for a phase, an epic, a decision, ...) and all
-- of them are done. The same set of cards the progress leaves out.
UPDATE "Phase" AS p
SET "completionNotifiedAt" = NOW()
WHERE EXISTS (
    SELECT 1 FROM "Task" t
    WHERE t."phaseId" = p."id"
      AND t."deletedAt" IS NULL
      AND (t."entryType" IS NULL OR t."entryType" NOT IN ('VISION', 'PHASE', 'THEME', 'EPIC', 'DECISION', 'BLOCKER', 'DEPENDENCY'))
  )
  AND NOT EXISTS (
    SELECT 1 FROM "Task" t
    WHERE t."phaseId" = p."id"
      AND t."deletedAt" IS NULL
      AND (t."entryType" IS NULL OR t."entryType" NOT IN ('VISION', 'PHASE', 'THEME', 'EPIC', 'DECISION', 'BLOCKER', 'DEPENDENCY'))
      AND t."status" <> 'TERMINADA'
  );
