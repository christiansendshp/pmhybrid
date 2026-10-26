-- AlterEnum: a task a person imports from work the ledger carries and the Roadmap does not (Roadmap TASK-34,
-- DEC-004 D1). It has no Roadmap row: the ledger is where it lives.
ALTER TYPE "TaskSourceOrigin" ADD VALUE 'AGENTSLOG';
