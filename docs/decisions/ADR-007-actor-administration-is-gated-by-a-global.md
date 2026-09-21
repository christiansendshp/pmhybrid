# ADR-007 — Actor administration is gated by a global actors.manage permission

- **Status:** CONFIRMED
- **Date:** 2026-09-15
- **Detailed in:** apps/api/prisma/seed.ts, apps/api/src/modules/{users,agents,roles}

## Decision

Actor administration is gated by a global `actors.manage` permission held by a seeded GLOBAL `ADMIN` role (granted with `projectId` null); project roles never carry global permissions and the project roles endpoint refuses GLOBAL roles

## Reason

Brief §4 separates global from project roles; people and agents are instance-wide, so granting their management through a project role would let any project owner escalate

---

This record is the row `ADR-007` of the decision table in [`docs/Stack_Tecnologies.md`](../Stack_Tecnologies.md), which stays the compact form; a change to the decision is made in the table and here together.
