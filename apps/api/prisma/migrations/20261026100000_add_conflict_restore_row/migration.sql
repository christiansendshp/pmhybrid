-- AlterEnum: a conflict about a row that left the Roadmap can be settled by writing the row back (Roadmap GAP-46)
ALTER TYPE "ConflictResolutionKind" ADD VALUE 'RESTORE_ROW';
