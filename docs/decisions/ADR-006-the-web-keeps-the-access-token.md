# ADR-006 — The web keeps the access token in memory and the refresh token in localStorage

- **Status:** CONFIRMED
- **Date:** 2026-09-14
- **Detailed in:** apps/web/src/app/core/auth.service.ts

## Decision

Angular: access token lives only in an in-memory Signal (never persisted); refresh token lives in `localStorage` so a page reload can silently re-authenticate via `/auth/refresh`

## Reason

Keeps the access token (short-lived, sent on every request) out of persistent storage to reduce XSS blast radius, while still surviving a reload without forcing re-login every time. `httpOnly` cookies would be stronger but need CORS/cookie plumbing beyond this phase's scope

---

This record is the row `ADR-006` of the decision table in [`docs/Stack_Tecnologies.md`](../Stack_Tecnologies.md), which stays the compact form; a change to the decision is made in the table and here together.
