-- AlterTable: the stage words of the ledger (Roadmap TASK-06). All nullable: an entry that was read
-- before this, or whose word the skill does not know, keeps them null. The existing entries are
-- classified by the sync that follows, which is idempotent, not by this migration.
ALTER TABLE "AgentLogEvent" ADD COLUMN     "canonicalStatus" TEXT,
ADD COLUMN     "statusQualifier" TEXT,
ADD COLUMN     "handoffTo" TEXT,
ADD COLUMN     "reviewResult" TEXT;
