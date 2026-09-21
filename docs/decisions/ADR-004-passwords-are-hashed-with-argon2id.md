# ADR-004 — Passwords are hashed with argon2id

- **Status:** CONFIRMED
- **Date:** 2026-09-14
- **Detailed in:** apps/api/src/modules/users/users.service.ts, apps/api/src/modules/auth/auth.service.ts

## Decision

Password hashing uses `argon2id` (`argon2` package), not bcrypt

## Reason

Current OWASP-recommended default for password storage; brief §28 leaves the specific algorithm open ("bcrypt o similar")

---

This record is the row `ADR-004` of the decision table in [`docs/Stack_Tecnologies.md`](../Stack_Tecnologies.md), which stays the compact form; a change to the decision is made in the table and here together.
