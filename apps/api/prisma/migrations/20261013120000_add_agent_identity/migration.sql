-- CreateEnum
CREATE TYPE "AgentStageRole" AS ENUM ('DEVELOPER', 'QA', 'BOTH');

-- CreateEnum
CREATE TYPE "AgentIdentifierKind" AS ENUM ('LEDGER_NAME', 'ALIAS');

-- AlterTable
ALTER TABLE "AgentProfile" ADD COLUMN     "modelName" TEXT,
ADD COLUMN     "stageRole" "AgentStageRole" NOT NULL DEFAULT 'BOTH';

-- CreateTable
CREATE TABLE "AgentIdentifier" (
    "id" TEXT NOT NULL,
    "agentProfileId" TEXT NOT NULL,
    "kind" "AgentIdentifierKind" NOT NULL,
    "value" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentIdentifier_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AgentIdentifier_key_key" ON "AgentIdentifier"("key");

-- CreateIndex
CREATE INDEX "AgentIdentifier_agentProfileId_idx" ON "AgentIdentifier"("agentProfileId");

-- AddForeignKey
ALTER TABLE "AgentIdentifier" ADD CONSTRAINT "AgentIdentifier_agentProfileId_fkey" FOREIGN KEY ("agentProfileId") REFERENCES "AgentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
