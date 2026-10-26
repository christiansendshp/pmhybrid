# Testing

## Layout

| Suite           | Location                  | Runner                                                              | What it covers                                                                                |
| --------------- | ------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `apps/api` unit | `src/**/*.spec.ts`        | Vitest (`vitest.config.ts`)                                         | Pure logic: parsers, policy checks, utility functions — no DB, no HTTP                        |
| `apps/api` e2e  | `test/**/*.e2e-spec.ts`   | Vitest (`vitest.config.e2e.ts`)                                     | Full `Nest.js` app + real Postgres via `supertest` — every module's real behavior             |
| `apps/web` unit | `src/app/**/*.spec.ts`    | Vitest via Angular's `@angular/build:unit-test` builder (`ng test`) | Component/service logic with `TestBed`, mocked HTTP                                           |
| `apps/web` a11y | `apps/web/a11y/*.spec.ts` | Playwright (`playwright.config.a11y.mts`) + `@axe-core/playwright`  | Real-browser WCAG 2.2 AA scan (Roadmap GAP-25) against the app shell + 5 representative pages |

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
pnpm --filter api test:cov       # api unit with coverage and its floor
pnpm test:e2e:cov      # api e2e with coverage and its floor
pnpm test:a11y          # web a11y only (root script -> pnpm --filter web test:a11y); needs Chromium: pnpm --filter web exec playwright install chromium
pnpm -r lint            # oxlint (api) + eslint (web)
pnpm -r build            # nest build + ng build (also the closest thing to a typecheck gate)
```

`pnpm test:e2e` needs a migrated, seeded Postgres — most specs log in as the
seeded demo actor (`prisma/demo-credentials.ts`). Outside CI it runs against
its own `pmhybrid_test` database, never `apps/api/.env`'s `DATABASE_URL`
(see "Local e2e database" below) — one-time setup:

```bash
docker compose up -d                        # from the repo root
pnpm --filter api test:e2e:db:setup          # creates/migrates/seeds pmhybrid_test
```

Re-run `test:e2e:db:setup` after adding a new Prisma migration.

## e2e conventions worth knowing before adding a spec

- Each spec file boots its own full `Nest.js` app (`Test.createTestingModule`)
  in `beforeEach`/`afterEach` — expensive, but gives every spec file a clean
  slate isolated from the others' in-memory state (not from the shared
  database — see below).
- **Local e2e database.** `vitest.config.e2e.ts` points local (non-CI) runs
  at a separate `pmhybrid_test` database (`test.env.DATABASE_URL`, gated on
  `!process.env.CI`) instead of the dev database `docker compose`/the API dev
  server use. Every e2e spec creates several throwaway projects with no
  cleanup — before this, that meant every local `test:e2e` run leaked dozens
  of "... E2E ..." rows straight into "My Projects" in the actual app. One-
  time setup: `pnpm --filter api test:e2e:db:setup`. **A local run starts by
  resetting that database** (Roadmap TEST-01a): `test/global-setup.ts` runs
  `prisma migrate reset` and the seed against `pmhybrid_test` before the suite, so
  it no longer grows by thousands of rows across runs (it did, and past a few
  thousand projects the list endpoints degraded). It costs about ten seconds, only
  ever touches a database named exactly `pmhybrid_test` (it refuses anything
  else), and does nothing in CI, whose Postgres is a fresh container. Set
  `E2E_KEEP_DB=1` to skip it and inspect what a run left behind. Within one run
  the database is still shared by every spec — scope assertions to IDs your own
  test created; never assert "the list does NOT contain X" against a shared
  resource's full history. `notifications.e2e-spec.ts`
  and `roadmap-dependencies.e2e-spec.ts` show this pattern (scoping by
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
- **What makes the suite fast, so a new spec keeps it so** (Roadmap TASK-27: from 330–440 s to about
  170 s for the e2e, and under five minutes for `VALIDAR` as a whole). The applications a file boots in
  its tests share **one `PrismaService`** (`test/setup-shared-prisma.ts`, registered in
  `vitest.config.e2e.ts`): starting a Prisma query engine cost about two seconds in every test, measured
  at 20 ms once shared. It is connected by the first query, capped at 6 connections
  (`test/e2e-limits.ts`) and ended when the file is done; the suite runs at most 12 files at once, so it
  asks Postgres for at most 72 of its 100 connections (`too many clients already` is what a larger pool or
  more workers produces). Do not call `PrismaService` lifecycle methods in a spec, and do not make one
  of your own with `new PrismaService()`. The other costs to remember: a test that starts the skill's
  `init` pays a shell start (a few seconds on Windows), so use it only when the test runs the skill
  (`ledger-name` and `ledger-qa-handoff` write the two files they need otherwise); and what a test does
  to **every** project in the shared database (the LLM queue did) grows with the rest of the suite, so it
  has to cost nothing for the projects that have nothing to do.

## Coverage floor (Roadmap TEST-01b)

Coverage of `apps/api/src` is measured with `@vitest/coverage-v8` and gated by a
floor set just under the value measured on 2026-09-21, so it cannot fall
without CI saying so. There are two floors because the two suites cover
different things: the unit specs exercise pure logic and small services, the
e2e suite runs the whole app through HTTP.

| Suite | Statements | Branches  | Functions | Lines     | Config                          |
| ----- | ---------- | --------- | --------- | --------- | ------------------------------- |
| unit  | 42 (43.8)  | 41 (43.2) | 34 (36.5) | 42 (43.5) | `apps/api/vitest.config.ts`     |
| e2e   | 84 (86.2)  | 74 (76.4) | 87 (89.9) | 84 (86.1) | `apps/api/vitest.config.e2e.ts` |

(The number in brackets is what was measured.) A run that drops below a floor
exits non-zero with `Coverage for statements (x%) does not meet global threshold
(y%)`. New code should raise the measured value, not lower it: when it goes up
a few points, raise the floor in the same commit so the gain is kept. The
report is a text summary in the log plus `apps/api/coverage/lcov.info` (ignored
by git). The web unit run has no floor yet.

## CI

`.github/workflows/ci.yml` (Roadmap GAP-17) runs `lint` → `build` → unit
tests (the API with its coverage floor) → `prisma migrate deploy` + `prisma db seed` → `test:e2e:cov` (its own floor), on every
push and PR against `main`/`develop`, against a fresh `postgres:17-alpine`
service container (its own `DATABASE_URL`, set at the job's `env:` level —
`vitest.config.e2e.ts`'s `pmhybrid_test` override only applies outside CI) —
so the "shared, never reset" caveat above never applies to a CI run, only to
the long-lived local `pmhybrid_test` database.

Since Roadmap SECURITY-03 the job also runs `pnpm audit --prod --audit-level=high`
right after installing dependencies, so a known high or critical advisory in
what ships fails the build (dev-only tooling is left out; it is covered by the
weekly Dependabot PRs, `.github/dependabot.yml`, which group the Nest and Angular
packages so a framework bump arrives as one PR). Reproduce it locally with the
same command.
