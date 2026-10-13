-- AlterTable: the start of the latest ledger entry's summary (Roadmap TASK-13). Filled by the sync, which
-- is idempotent; null for a task with no entry.
ALTER TABLE "Task" ADD COLUMN     "ledgerNote" TEXT;
