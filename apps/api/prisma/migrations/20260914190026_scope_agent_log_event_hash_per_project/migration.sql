-- Scope AgentLogEvent.rawEntryHash uniqueness per-project instead of globally.
-- Two unrelated projects could coincidentally log byte-identical entry text;
-- a bare global unique constraint would silently drop the second project's
-- entry as a "duplicate" of the first's.
DROP INDEX IF EXISTS "AgentLogEvent_rawEntryHash_key";

CREATE UNIQUE INDEX "AgentLogEvent_projectId_rawEntryHash_key" ON "AgentLogEvent"("projectId", "rawEntryHash");
