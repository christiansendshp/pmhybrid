# ADR-002 — Kanban status is written verbatim into the Roadmap Status cell

- **Status:** CONFIRMED
- **Date:** 2026-09-14
- **Detailed in:** user decision this session

## Decision

Kanban status is written verbatim (not mapped down) into the Roadmap.md Status cell

## Reason

`check_docs()` validates heading presence only, never cell values, so verbatim write-back is lossless and not a structural violation; mapping down would be lossy and cause spurious conflicts

---

This record is the row `ADR-002` of the decision table in [`docs/Stack_Tecnologies.md`](../Stack_Tecnologies.md), which stays the compact form; a change to the decision is made in the table and here together.
