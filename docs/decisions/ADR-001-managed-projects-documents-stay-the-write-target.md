# ADR-001 — Managed projects' documents stay the write target; the richer model lives in PostgreSQL

- **Status:** CONFIRMED
- **Date:** 2026-09-14
- **Detailed in:** `docs/skillProyectDocument-analysis.md`, `docs/domain-model.md`

## Decision

Managed projects' six-file doc format (Roadmap.md/Agentslog.md/etc.) stays the unmodified write target; the richer domain model (Phase/Epic/Subtask hierarchy, 5-state Kanban, RBAC, agent personas) lives only in PostgreSQL as an app-level layer referencing Roadmap row IDs

## Reason

The brief's own hierarchy/Kanban assumptions contradict the actual `skillProyectDocument` schema (flat Roadmap/Agentslog, no Phase/Epic/state-enum); brief rule 3 forbids inventing a parallel structure that contradicts the docs, so the docs win and richer concepts become optional/nullable app-level extensions

---

This record is the row `ADR-001` of the decision table in [`docs/Stack_Tecnologies.md`](../Stack_Tecnologies.md), which stays the compact form; a change to the decision is made in the table and here together.
