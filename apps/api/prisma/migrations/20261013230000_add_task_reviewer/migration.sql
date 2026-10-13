-- AlterTable: who was asked to review a task in QA, and since when (Roadmap SUBTASK-09.1). Both
-- nullable: a task nobody was asked about, or that is not in QA, has neither.
ALTER TABLE "Task" ADD COLUMN     "reviewerActorId" TEXT,
ADD COLUMN     "reviewRequestedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Task_reviewerActorId_idx" ON "Task"("reviewerActorId");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_reviewerActorId_fkey" FOREIGN KEY ("reviewerActorId") REFERENCES "Actor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
