-- CreateTable: until when a person has seen the news of a project, so "Desde tu última visita" counts from it
-- (Roadmap TASK-38).
CREATE TABLE "ProjectSeen" (
    "actorId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "seenAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectSeen_pkey" PRIMARY KEY ("actorId","projectId")
);

-- AddForeignKey
ALTER TABLE "ProjectSeen" ADD CONSTRAINT "ProjectSeen_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "Actor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectSeen" ADD CONSTRAINT "ProjectSeen_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
