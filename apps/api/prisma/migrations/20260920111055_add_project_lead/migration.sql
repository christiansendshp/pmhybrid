-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "leadActorId" TEXT;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_leadActorId_fkey" FOREIGN KEY ("leadActorId") REFERENCES "Actor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
