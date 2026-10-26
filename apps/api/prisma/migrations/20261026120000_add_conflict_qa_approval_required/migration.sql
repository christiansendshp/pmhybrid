-- AlterEnum: a document that closes a task in QA, in a project that requires approval, raises a conflict (Roadmap GAP-41)
ALTER TYPE "ConflictKind" ADD VALUE 'QA_APPROVAL_REQUIRED';
