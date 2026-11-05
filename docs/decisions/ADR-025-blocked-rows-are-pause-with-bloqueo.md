# ADR-025 — A blocked task is a PAUSE row with category BLOQUEO

- **Status:** CONFIRMED
- **Date:** 2026-11-05
- **Detailed in:** docs/Roadmap.md (GAP-50, TASK-24, FEATURE-10, EPIC-02), BR-003 in docs/ProductDescription.md

## Decision

A task that cannot go on until a person answers stays a `PAUSE` row with category `BLOQUEO`, with `BLOQUEADA` and the cause at the start of its Description: the skill's status words (`TODO IN_PROGRESS PAUSE DONE`) are not extended. A PM Hub task whose Roadmap row left with no closing entry stays open until a person settles it in the app (BR-003), and no agent writes to the live database

## Reason

The skill's check accepts four status words and maps BLOCKED to PAUSE, as PM Hub's roadmap parser does; a literal BLOQUEADA would mean relaxing that check, which the goal forbids. The owner was asked on 2026-11-05 whether to accept PAUSE with BLOQUEO as BLOQUEADA, to extend the skill, or to register the SMARTHR agents, and chose the first. TASK-24, FEATURE-10 and EPIC-02 are the rows it covers: they wait for live SMARTHR data and a person's decision on which agent names are one agent. For the 26 SMARTHR tasks and F01-E01-T01 left open in PM Hub after their rows left the Roadmap, the owner chose to leave them as they are: BR-003 says a vanished row is neither done nor cancelled, and the live database is the user's.

---

This record is the row `ADR-025` of the decision table in [`docs/Stack_Tecnologies.md`](../Stack_Tecnologies.md), which stays the compact form; a change to the decision is made in the table and here together.
