-- AlterTable: the per-project switch for the reviewer rules and the QA approval a document cannot skip
-- (Roadmap SUBTASK-09.2, DEC-006). Every project starts with it off, as before.
ALTER TABLE "Project" ADD COLUMN "qaApprovalRequired" BOOLEAN NOT NULL DEFAULT false;
