-- CreateEnum: how often a person is sent the summary of what changed in their projects (Roadmap TASK-42)
CREATE TYPE "SummaryFrequency" AS ENUM ('NONE', 'DAILY', 'WEEKLY');

-- AlterTable: the frequency a person chose (weekly until they choose otherwise) and when the last summary was
-- made, so a restart or a second run on the same day sends it once.
ALTER TABLE "Actor" ADD COLUMN "summaryFrequency" "SummaryFrequency" NOT NULL DEFAULT 'WEEKLY',
ADD COLUMN "summaryLastSentAt" TIMESTAMP(3);
