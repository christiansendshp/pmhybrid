# Stack technologies

> The legacy filename `Stack_Tecnologies.md` is intentionally preserved.

## Operational summary

- Runtime: `Node.js + TypeScript (NestJS API), Angular (web), PostgreSQL 17`
- Architecture: `pnpm monorepo — apps/api (NestJS, modular), apps/web (Angular, standalone/lazy), packages/shared-types`
- Data: `PostgreSQL via Prisma ORM; documents (Roadmap.md/Agentslog.md/etc.) are an external synced source, not the primary store`
- Test command: `pnpm -r test`
- Delivery: `Local dev via docker-compose (Postgres) + pnpm dev; no CI/CD configured yet`

<!-- context:end -->

## Components

| Area           | Technology and version                                                                    | Source       | Status    |
| -------------- | ----------------------------------------------------------------------------------------- | ------------ | --------- |
| Frontend       | Angular (latest stable), TypeScript, Signals, standalone components, Angular Material/CDK | brief §21    | CONFIRMED |
| Backend        | Node.js + TypeScript, NestJS                                                              | brief §22    | CONFIRMED |
| Data           | PostgreSQL (latest stable compatible), Prisma ORM                                         | brief §23    | CONFIRMED |
| Infrastructure | docker-compose (Postgres only, MVP)                                                       | this project | CONFIRMED |

## Architecture anchors

| Concern    | Current truth                                                                                                                                                                             | Authoritative artifact    |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| Boundaries | NestJS modules: Auth, Users, Projects, ProjectMembers, Roles, Tasks, Phases, Epics, Templates, Agents, Roadmap, AgentLogs, Synchronization, GitProviders, Audit, Notifications, Conflicts | `docs/architecture.md`    |
| Data flow  | Managed-project documents <-> Synchronization module <-> PostgreSQL <-> API <-> Angular; documents are read/written via a decoupled `ProjectRepositoryProvider`                           | `docs/synchronization.md` |
| Security   | JWT auth, RBAC via Role/Permission/ActorRole, secrets via env vars only (never in DB configJson)                                                                                          | `docs/permissions.md`     |

## Commands

| Purpose       | Command                                      | Status                                                                                                         |
| ------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Test          | `pnpm -r test`                               | CONFIRMED — 1 (web) + 3 (api) tests pass                                                                       |
| E2E           | `pnpm test:e2e`                              | CONFIRMED — `/health` e2e passes against live Postgres                                                         |
| Lint or check | `pnpm -r lint`                               | CONFIRMED — clean on all 3 packages                                                                            |
| Build         | `pnpm -r build`                              | CONFIRMED — clean on all 3 packages                                                                            |
| DB up         | `docker compose up -d`                       | CONFIRMED — Postgres 17 healthy on `127.0.0.1:5436` (5432 was occupied by an unrelated container on this host) |
| Migrate       | `pnpm --filter api prisma:migrate`           | CONFIRMED — see ADR-003 for the CI=true fix                                                                    |
| Seed          | `pnpm --filter api prisma:seed`              | CONFIRMED — row counts verified via psql                                                                       |
| API dev       | `pnpm --filter api dev` (→ `GET /health`)    | CONFIRMED — 200, `{"status":"ok","info":{"db":{"status":"up"}}}`                                               |
| Web dev       | `pnpm --filter web dev` (→ `localhost:4200`) | CONFIRMED — 200, all 9 lazy routes resolve                                                                     |

## Environment variables

Names and purpose only; never store real values.

| Name                          | Purpose                                                                | Required |
| ----------------------------- | ---------------------------------------------------------------------- | -------- |
| DATABASE_URL                  | Postgres connection string for Prisma                                  | yes      |
| JWT_SECRET                    | Signing secret for access/refresh tokens                               | yes      |
| JWT_EXPIRES_IN                | Access token lifetime                                                  | yes      |
| PORT                          | API listen port                                                        | no       |
| SYNC_DEFAULT_INTERVAL_MINUTES | Default project sync interval                                          | no       |
| GIT_PROVIDER_TYPE             | Selects the ProjectRepositoryProvider implementation (`local` for MVP) | no       |

## Decisions

Keep this table compact. Link long records from `docs/decisions/`.

| ID      | Date       | Decision                                                                                                                                                                                                                                                                        | Reason                                                                                                                                                                                                                                                                                                                                                                                                                          | Status    | Detail                                                                          |
| ------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------- |
| ADR-001 | 2026-09-14 | Managed projects' six-file doc format (Roadmap.md/Agentslog.md/etc.) stays the unmodified write target; the richer domain model (Phase/Epic/Subtask hierarchy, 5-state Kanban, RBAC, agent personas) lives only in PostgreSQL as an app-level layer referencing Roadmap row IDs | The brief's own hierarchy/Kanban assumptions contradict the actual `skillProyectDocument` schema (flat Roadmap/Agentslog, no Phase/Epic/state-enum); brief rule 3 forbids inventing a parallel structure that contradicts the docs, so the docs win and richer concepts become optional/nullable app-level extensions                                                                                                           | CONFIRMED | `docs/skillProyectDocument-analysis.md`, `docs/domain-model.md`                 |
| ADR-002 | 2026-09-14 | Kanban status is written verbatim (not mapped down) into the Roadmap.md Status cell                                                                                                                                                                                             | `check_docs()` validates heading presence only, never cell values, so verbatim write-back is lossless and not a structural violation; mapping down would be lossy and cause spurious conflicts                                                                                                                                                                                                                                  | CONFIRMED | user decision this session                                                      |
| ADR-003 | 2026-09-14 | `apps/api` Vitest configs (`vitest.config.ts`, `vitest.config.e2e.ts`) load `unplugin-swc` alongside `vite-tsconfig-paths`; `prisma:migrate` script runs with `CI=true` (via `cross-env`)                                                                                       | Vite's default esbuild TS transform silently drops `emitDecoratorMetadata`, so NestJS constructor-type-based DI resolved `undefined` for every injected service under Vitest with no error until first use (surfaced by the `/health` e2e test) — swc's transform preserves it. Separately, `prisma migrate dev` hung indefinitely with no output when stdin has no TTY (this shell); `CI=true` forces its non-interactive path | CONFIRMED | apps/api/vitest.config.ts, apps/api/vitest.config.e2e.ts, apps/api/package.json |
