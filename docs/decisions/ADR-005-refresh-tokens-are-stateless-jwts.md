# ADR-005 — Refresh tokens are stateless JWTs

- **Status:** CONFIRMED
- **Date:** 2026-09-14
- **Detailed in:** apps/api/src/modules/auth/

## Decision

Refresh tokens are stateless JWTs (same `JWT_SECRET`, a `type: 'refresh'` claim, longer expiry via `JWT_REFRESH_EXPIRES_IN`) — no `RefreshToken` table, no server-side revocation list

## Reason

`docs/domain-model.md`'s entity list has no refresh-token entity; adding one now would be inventing a table the brief/domain-model doesn't call for. Accepted trade-off: a leaked refresh token is valid until it expires, cannot be revoked early. Documented as a known MVP limitation, not silently assumed

---

This record is the row `ADR-005` of the decision table in [`docs/Stack_Tecnologies.md`](../Stack_Tecnologies.md), which stays the compact form; a change to the decision is made in the table and here together.
