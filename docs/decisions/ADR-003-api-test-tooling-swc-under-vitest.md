# ADR-003 — API test tooling: swc under Vitest, and CI mode for the migrate script

- **Status:** CONFIRMED
- **Date:** 2026-09-14
- **Detailed in:** apps/api/vitest.config.ts, apps/api/vitest.config.e2e.ts, apps/api/package.json

## Decision

`apps/api` Vitest configs (`vitest.config.ts`, `vitest.config.e2e.ts`) load `unplugin-swc` alongside `vite-tsconfig-paths`; `prisma:migrate` script runs with `CI=true` (via `cross-env`)

## Reason

Vite's default esbuild TS transform silently drops `emitDecoratorMetadata`, so NestJS constructor-type-based DI resolved `undefined` for every injected service under Vitest with no error until first use (surfaced by the `/health` e2e test) — swc's transform preserves it. Separately, `prisma migrate dev` hung indefinitely with no output when stdin has no TTY (this shell); `CI=true` forces its non-interactive path

---

This record is the row `ADR-003` of the decision table in [`docs/Stack_Tecnologies.md`](../Stack_Tecnologies.md), which stays the compact form; a change to the decision is made in the table and here together.
