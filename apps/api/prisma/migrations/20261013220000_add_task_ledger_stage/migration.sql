-- AlterTable: the stage the ledger gives a task (Roadmap TASK-14). Nullable and filled by the sync,
-- which is idempotent: a task whose ledger says nothing about its stage keeps it null.
ALTER TABLE "Task" ADD COLUMN     "ledgerStage" "TaskStatus";
