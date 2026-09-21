# ADR-009 — Agent API keys are hashed with SHA-256

- **Status:** CONFIRMED
- **Date:** 2026-09-15
- **Detailed in:** apps/api/src/modules/auth/api-key-crypto.util.ts

## Decision

Agent API keys (Roadmap GAP-15) are hashed with plain SHA-256, not `argon2id` — deliberately diverging from ADR-004

## Reason

The secret is 256 bits of `crypto.randomBytes` generator entropy, not a user-chosen password — there is no dictionary to defend against, so a deliberately slow hash only costs CPU on every agent request (and is a cheap unauthenticated DoS lever) without adding security. SHA-256 is deterministic, so the hash doubles as the unique lookup key with no separate salt or prefix search needed

---

This record is the row `ADR-009` of the decision table in [`docs/Stack_Tecnologies.md`](../Stack_Tecnologies.md), which stays the compact form; a change to the decision is made in the table and here together.
