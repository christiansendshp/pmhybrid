-- AlterTable: advisory limits on the work in progress (Roadmap TASK-15). Null is no limit, which is every
-- project until someone sets one.
ALTER TABLE "Project" ADD COLUMN     "wipLimitDevelopment" INTEGER,
ADD COLUMN     "wipLimitQa" INTEGER,
ADD COLUMN     "wipLimitAgent" INTEGER;
