-- CreateEnum
CREATE TYPE "TitleNormalizationStatus" AS ENUM ('PENDING', 'DONE', 'FAILED');

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "generatedDescription" TEXT,
ADD COLUMN     "originalTitle" TEXT,
ADD COLUMN     "titleNormalizationError" TEXT,
ADD COLUMN     "titleNormalizedAt" TIMESTAMP(3),
ADD COLUMN     "titleNormalization" "TitleNormalizationStatus";

-- CreateIndex
CREATE INDEX "Task_projectId_titleNormalization_idx" ON "Task"("projectId", "titleNormalization");
