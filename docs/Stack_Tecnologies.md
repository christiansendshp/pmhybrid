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

| Purpose       | Command                | Status                                    |
| ------------- | ---------------------- | ----------------------------------------- |
| Test          | `pnpm -r test`         | HYPOTHESIS — apps not yet scaffolded      |
| Lint or check | `pnpm -r lint`         | HYPOTHESIS — apps not yet scaffolded      |
| Build         | `pnpm -r build`        | HYPOTHESIS — apps not yet scaffolded      |
| DB up         | `docker compose up -d` | HYPOTHESIS — compose file not yet written |

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

| ID      | Date       | Decision                                                                                                                                                                                                                                                                        | Reason                                                                                                                                                                                                                                                                                                                | Status    | Detail                                                          |
| ------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | --------------------------------------------------------------- |
| ADR-001 | 2026-09-14 | Managed projects' six-file doc format (Roadmap.md/Agentslog.md/etc.) stays the unmodified write target; the richer domain model (Phase/Epic/Subtask hierarchy, 5-state Kanban, RBAC, agent personas) lives only in PostgreSQL as an app-level layer referencing Roadmap row IDs | The brief's own hierarchy/Kanban assumptions contradict the actual `skillProyectDocument` schema (flat Roadmap/Agentslog, no Phase/Epic/state-enum); brief rule 3 forbids inventing a parallel structure that contradicts the docs, so the docs win and richer concepts become optional/nullable app-level extensions | CONFIRMED | `docs/skillProyectDocument-analysis.md`, `docs/domain-model.md` |
| ADR-002 | 2026-09-14 | Kanban status is written verbatim (not mapped down) into the Roadmap.md Status cell                                                                                                                                                                                             | `check_docs()` validates heading presence only, never cell values, so verbatim write-back is lossless and not a structural violation; mapping down would be lossy and cause spurious conflicts                                                                                                                        | CONFIRMED | user decision this session                                      |
