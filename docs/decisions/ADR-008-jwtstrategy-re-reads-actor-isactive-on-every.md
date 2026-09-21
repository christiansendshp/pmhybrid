# ADR-008 — JwtStrategy re-reads Actor.isActive on every request

- **Status:** CONFIRMED
- **Date:** 2026-09-15
- **Detailed in:** apps/api/src/modules/auth/strategies/jwt.strategy.ts

## Decision

`JwtStrategy` re-reads `Actor.isActive` on every authenticated request

## Reason

Deactivating an actor must cut off already-issued access tokens immediately (brief §3); one primary-key lookup per request is the accepted cost

---

This record is the row `ADR-008` of the decision table in [`docs/Stack_Tecnologies.md`](../Stack_Tecnologies.md), which stays the compact form; a change to the decision is made in the table and here together.
