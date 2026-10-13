# ADR-022 — A Roadmap of the latest skill holds the skill's status word

- **Status:** CONFIRMED
- **Date:** 2026-09-17
- **Detailed in:** apps/api/src/modules/roadmap/status-vocabulary.util.ts, apps/api/src/modules/roadmap/roadmap-yaml-entry.util.ts, apps/api/src/modules/roadmap/roadmap-row-writer.util.ts, docs/roadmap-parser.md

## Decision

In a Roadmap of the latest skill (per-entry YAML, or tables with a `Pause reason` column) the Status cell holds the skill's base word (`TODO`, `IN_PROGRESS`, `DONE`), translated at the boundary; supersedes ADR-002 for those documents only, the old tables keep the Kanban word verbatim

## Reason

The skill's own check rejects a Status outside its vocabulary, so the Kanban words made PM Hub's write-back fail it (Roadmap GAP-28, GAP-37b). The coarser word loses nothing the board needs: the stage is read from the ledger, and `rowStatusDiffers` counts a word and the column that projects to it as agreeing, so reading back what PM Hub wrote moves no card. Recorded on 2026-10-13 (DOC-01): until then the supersession lived only in a code comment

---

This record is the row `ADR-022` of the decision table in [`docs/Stack_Tecnologies.md`](../Stack_Tecnologies.md), which stays the compact form; a change to the decision is made in the table and here together.
