# ADR-011 — Local e2e runs against a separate pmhybrid_test database

- **Status:** CONFIRMED
- **Date:** 2026-09-16
- **Detailed in:** apps/api/vitest.config.e2e.ts, apps/api/package.json (`test:e2e:db:setup`), docs/testing.md

## Decision

Local (non-CI) `test:e2e` runs against a separate `pmhybrid_test` database (`vitest.config.e2e.ts`, gated on `!process.env.CI`), not `apps/api/.env`'s `DATABASE_URL`

## Reason

Every e2e spec creates several throwaway projects with no cleanup, and both the dev server and local e2e runs read the same `.env` by default — 76 test-created projects had leaked into the real dev database this session, visible in the app's own "My Projects" alongside the user's actual projects. CI is unaffected: its `DATABASE_URL` is set at the job `env:` level against a disposable per-run container

---

This record is the row `ADR-011` of the decision table in [`docs/Stack_Tecnologies.md`](../Stack_Tecnologies.md), which stays the compact form; a change to the decision is made in the table and here together.
