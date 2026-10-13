-- AlterTable: the agent a ledger name is (Roadmap TASK-02). Null until the names are linked,
-- which the app does idempotently (after each sync and after a change to an agent's names).
ALTER TABLE "AgentLogEvent" ADD COLUMN     "agentActorId" TEXT;

-- CreateIndex
CREATE INDEX "AgentLogEvent_agentActorId_idx" ON "AgentLogEvent"("agentActorId");

-- AddForeignKey
ALTER TABLE "AgentLogEvent" ADD CONSTRAINT "AgentLogEvent_agentActorId_fkey" FOREIGN KEY ("agentActorId") REFERENCES "Actor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
