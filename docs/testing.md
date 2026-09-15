# Testing

## Layout

| Suite           | Location                | Runner                                                              | What it covers                                                                    |
| --------------- | ----------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `apps/api` unit | `src/**/*.spec.ts`      | Vitest (`vitest.config.ts`)                                         | Pure logic: parsers, policy checks, utility functions — no DB, no HTTP            |
| `apps/api` e2e  | `test/**/*.e2e-spec.ts` | Vitest (`vitest.config.e2e.ts`)                                     | Full `Nest.js` app + real Postgres via `supertest` — every module's real behavior |
| `apps/web` unit | `src/app/**/*.spec.ts`  | Vitest via Angular's `@angular/build:unit-test` builder (`ng test`) | Component/service logic with `TestBed`, mocked HTTP                               |

Both apps' Vitest configs load `unplugin-swc` alongside `vite-tsconfig-paths`
(ADR-003, `Stack_Tecnologies.md`) — esbuild's default TS transform silently
drops `emitDecoratorMetadata`, which NestJS's constructor-type-based DI
depends on; swc's transform preserves it.

## Commands

```bash
pnpm -r test          # both apps' unit suites
pnpm --filter api test        # api unit only
pnpm --filter web test        # web unit only
pnpm test:e2e          # api e2e only (root script -> pnpm --filter api test:e2e)
pnpm -r lint            # oxlint (api) + eslint (web)
pnpm -r build            # nest build + ng build (also the closest thing to a typecheck gate)
```

`pnpm test:e2e` needs `apps/api/.env`'s `DATABASE_URL` pointing at a
migrated, seeded Postgres (`docker compose up -d`, then
`pnpm prisma:migrate` and `pnpm prisma:seed` from the repo root) — most
specs log in as the seeded demo actor (`prisma/demo-credentials.ts`).

## e2e conventions worth knowing before adding a spec

- Each spec file boots its own full `Nest.js` app (`Test.createTestingModule`)
  in `beforeEach`/`afterEach` — expensive, but gives every spec file a clean
  slate isolated from the others' in-memory state (not from the shared
  database — see below).
- **The database is shared across the whole suite and never reset between
  runs.** The seeded demo actor accumulates real rows (projects, tasks,
  notifications) across every run this session has ever done. Scope
  assertions to IDs your own test created — never assert "the list does NOT
  contain X" against a shared resource's full history; it will eventually
  pick up stale rows from an earlier run. `notifications.e2e-spec.ts` and
  `roadmap-dependencies.e2e-spec.ts` show this pattern (scoping by
  `syncRunId`/target id, not by type alone).
- Tests that write to a Roadmap document use `createScratchDocsPath()`
  (`test/helpers/scratch-docs.ts`) — a fresh temp directory per test, never
  this repo's own `docs/`.
- `SYNC_SCHEDULER_ENABLED=false` is set for the whole e2e config
  (`vitest.config.e2e.ts`) — each spec file's app would otherwise run its own
  background cron sync against every project in the shared database,
  contending for the same per-project Postgres advisory lock
  (`pg_advisory_xact_lock`) that write-back and manual sync both take.
- **The API dev server (`nest start --watch`) must be stopped before running
  `test:e2e` locally.** A live dev server's own `SyncSchedulerService`
  contends for the same advisory locks and causes real, intermittent
  flakiness — not a config issue, an actual second writer racing the tests.
  Restart it afterward if you need it.
- Prefer running the full e2e suite **twice** in a row before trusting a
  "all green" result on anything touching async event listeners
  (`@nestjs/event-emitter`) or transaction ordering: `EventEmitter2.emit()`
  is fire-and-forget and does not await listeners (`emitAsync()` does) — a
  race there passed standalone but failed intermittently under the full
  suite's parallel load, and only running it more than once surfaced it.

## CI

`.github/workflows/ci.yml` (Roadmap GAP-17) runs `lint` → `build` → unit
tests → `prisma migrate deploy` + `prisma db seed` → `test:e2e`, on every
push and PR against `main`/`develop`, against a fresh `postgres:17-alpine`
service container — so the shared-database caveat above never applies to a
CI run, only to a local machine's long-lived dev database.
