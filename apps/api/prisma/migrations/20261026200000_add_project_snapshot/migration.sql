-- CreateEnum: whether a snapshot of a project's day was recorded that day or rebuilt later (Roadmap TASK-46, TASK-47)
CREATE TYPE "SnapshotSource" AS ENUM ('RECORDED', 'RECONSTRUCTED');

-- CreateTable: one day of the state of a project, so how it was two weeks ago is a number and not a reconstruction
CREATE TABLE "ProjectSnapshot" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "source" "SnapshotSource" NOT NULL,
    "total" INTEGER NOT NULL,
    "done" INTEGER NOT NULL,
    "byStatus" JSONB,
    "blocked" INTEGER,
    "openConflicts" INTEGER,
    "progress" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: a project has one snapshot per day
CREATE UNIQUE INDEX "ProjectSnapshot_projectId_day_key" ON "ProjectSnapshot"("projectId", "day");

-- AddForeignKey
ALTER TABLE "ProjectSnapshot" ADD CONSTRAINT "ProjectSnapshot_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
