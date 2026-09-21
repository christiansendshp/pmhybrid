# ADR-018 — Investigation before rewriting the parsers for the skill's v2 schema

- **Status:** CONFIRMED
- **Date:** 2026-09-18
- **Detailed in:** apps/api/src/modules/roadmap/roadmap-row-writer.util.ts, apps/api/src/modules/roadmap/roadmap-row-writer.util.spec.ts, docs/Roadmap.md (GAP-28)

## Decision

Roadmap GAP-28 investigation: before rewriting the Roadmap/Agentslog parsers for the project-documentation skill v2 schema, a full read of `roadmap-parser.service.ts`/`roadmap-yaml-entry.util.ts`/`roadmap-row-writer.util.ts`/`agentslog-parser.service.ts`/`agentslog-writer.util.ts` found dual-format read+write already implemented and tested — the ticket's own problem statement ("only understand the old format") was stale. One real parity bug found in that review and fixed: `upsertLifecycleRoadmapEntry` (the new-format sibling of `upsertLifecycleRoadmapRow`) unconditionally overwrote `status` on every lifecycle write-back, silently clearing a `BLOCKED` entry's blocked state on any unrelated trigger

## Reason

Missing definition this ADR resolves: what a lifecycle write-back should do to a new-format entry whose current `status` is `BLOCKED`. Decided: mirror the old format exactly — a Blocked-table row there has no Status column at all, so a write-back against it can only ever touch Owner; the new-format entry now checks its own current `status` before mutating and, when `BLOCKED`, skips `status`/leaves `blocked_by` untouched while still bumping `owner`/`updated_at`, the same asymmetry the old format has always had. Read-side parity already existed (`roadmapYamlEntryToRow` already special-cased `status: BLOCKED` into `RoadmapTable.BLOCKED`); only the write side was missing it. GAP-28 stays `EN_DESARROLLO`, not `DONE`: its acceptance criterion's second clause — converting this repo's own `docs/Roadmap.md` to the new schema — is real remaining work, deliberately not attempted in the same pass given the running dev server's 5-minute sync of this exact file

---

This record is the row `ADR-018` of the decision table in [`docs/Stack_Tecnologies.md`](../Stack_Tecnologies.md), which stays the compact form; a change to the decision is made in the table and here together.
