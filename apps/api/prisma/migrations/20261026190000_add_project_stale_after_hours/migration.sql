-- AlterTable: the hours without activity after which a task in development is stale, a setting of the project
-- (Roadmap TASK-44).
ALTER TABLE "Project" ADD COLUMN "staleAfterHours" INTEGER NOT NULL DEFAULT 72;
