-- AlterTable: the per-project switch that writes the QA handoff, its approval and its return into the
-- ledger as the skill's review stage (Roadmap TASK-08, GAP-40). Every project starts with it off, as before.
ALTER TABLE "Project" ADD COLUMN "ledgerQaHandoff" BOOLEAN NOT NULL DEFAULT false;
