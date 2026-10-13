-- AlterTable: how many minutes between a task's first IN_PROGRESS and its DONE make it an instant
-- close (Roadmap TASK-12). Five minutes for every project until a person sets another.
ALTER TABLE "Project" ADD COLUMN     "instantCloseMinutes" INTEGER NOT NULL DEFAULT 5;
