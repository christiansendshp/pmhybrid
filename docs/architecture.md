# Architecture

## System overview

PM Hub is a Project Management Hub for teams composed of human users and AI
agents. It manages multiple software projects, each backed by a Git repository
containing documents maintained by the [`project-documentation`
skill](https://github.com/christiansendshp/skillProyectDocument) (`Roadmap.md`,
`Agentslog.md`, `ProductDescription.md`, `Stack_Tecnologies.md`, `Features.md`,
`Agents.md`). Those documents are the functional source of truth for a managed
project's active work; PM Hub layers a richer domain model (hierarchy, RBAC,
Kanban states, agent personas, audit, conflict detection) on top in PostgreSQL,
referencing but never overwriting the documents' own structure. See
`docs/skillProyectDocument-analysis.md` for the full analysis that grounds this
decision, and ADR-001/ADR-002 in `docs/Stack_Tecnologies.md` for the resolution.

## Stack

- **Frontend**: Angular (latest stable), TypeScript, Signals, standalone
  components, lazy loading, Angular Router, Reactive Forms, Angular
  Material/CDK.
- **Backend**: Node.js + TypeScript, NestJS, modular architecture.
- **Database**: PostgreSQL, Prisma ORM.
- **Docs source**: managed projects' own Git repositories, read/written via a
  decoupled `ProjectRepositoryProvider`.

## Monorepo layout

pnpm workspaces (not npm workspaces — faster installs, less disk usage, native
`workspace:*` protocol). Turborepo deliberately not adopted for MVP scale —
plain `pnpm -r` / `--filter` scripts are enough; revisit only if build times
become a real problem.

```
PMHYBRID/
  package.json  pnpm-workspace.yaml  .npmrc  tsconfig.base.json
  eslint.config.mjs  .prettierrc  .prettierignore
  .husky/  .lintstagedrc.json  commitlint.config.cjs
  docker-compose.yml  .env.example  .gitignore
  docs/          (architecture, domain model, sync, parser, + the skill's six files)
  apps/
    api/         (NestJS)
    web/         (Angular)
  packages/
    shared-types/ (enums, permission keys, DTOs shared between api and web)
```

## Backend module boundaries

Each module is small and cohesive (brief §22, §34 — no premature abstraction,
no oversized modules):

| Module                         | Responsibility                                                                               |
| ------------------------------ | -------------------------------------------------------------------------------------------- |
| `auth`                         | JWT issuance/verification, login                                                             |
| `users`                        | Human actor management (thin layer over `Actor`/`UserCredential`)                            |
| `agents`                       | AI agent actor management (`Actor`/`AgentProfile`)                                           |
| `projects`                     | Project CRUD, settings (sync interval, docs path, rollup strategy)                           |
| `project-members`              | Membership records, independent of role grants                                               |
| `roles`                        | Role/Permission/ActorRole CRUD, permission checks                                            |
| `phases`, `epics`, `templates` | Optional hierarchy rungs                                                                     |
| `tasks`                        | Task CRUD, subtasks (self-referential), dependencies, assignment, Kanban transition policy   |
| `roadmap`                      | `RoadmapParserService`, `AgentslogParserService` — parsing only, no orchestration            |
| `synchronization`              | Scheduler, reconciliation algorithm, write-back orchestration                                |
| `git-providers`                | `ProjectRepositoryProvider` interface + `LocalFsGitProvider` (MVP)                           |
| `audit`                        | `AuditEvent` recording inside callers' transactions + project audit trail read API           |
| `notifications`                | `Notification` recording, subscribes to domain events                                        |
| `conflicts`                    | `Conflict` CRUD and resolution endpoints                                                     |
| `dashboard`                    | Cross-project summary + activity feed (brief §14) — aggregate, not project-scoped            |
| `workload`                     | Cross-project per-actor task list (brief §19) — `projectId` is an optional filter, not scope |
| `health`                       | Liveness/readiness (`@nestjs/terminus` + Prisma check)                                       |

`roadmap` (parsing) and `synchronization` (orchestration) are deliberately
separate modules — parsing is a pure function of document text, orchestration
owns scheduling, locking, and reconciliation policy. Merging them would couple
unrelated concerns.

## Decoupling points (extensibility seams, brief §20)

Three areas are built behind an interface/strategy from day one so they can
grow without touching call sites:

1. **`ProjectRepositoryProvider`** (`git-providers` module): `readFile`,
   `writeFile`, `listRevisions`. MVP ships `LocalFsGitProvider` only; GitHub/
   GitLab/Bitbucket providers are additive later.
2. **`ProgressRollupStrategy`** (`tasks` module): selected per-project via
   `Project.progressRollupStrategy`. MVP implements `EQUAL_WEIGHT_AVERAGE`
   only; `LEAF_EQUAL_WEIGHT` is a documented, not-yet-built alternative behind
   the same interface.
3. **Kanban transition policy** (`tasks/task-status-policy.ts`): a code-level
   table today, structured so it can move to DB-driven configuration later
   without changing callers.

## Cross-cutting concerns via events

Audit is deliberately **not** event-driven: an `AuditEvent` must commit or
roll back with the mutation it describes, so services call
`AuditService.record(entry, tx)` inside their own transaction. Sync's
per-field conflict check depends on those rows existing the moment a UI edit
commits.

Side effects that may lag (notifications, a future WebSocket gateway for brief
§27/§29) are the ones meant to hang off `@nestjs/event-emitter` events, without
touching business logic — no gateway is built in MVP.

## Frontend structure

Standalone Angular components, lazy-loaded per feature area under
`src/app/features/`: `auth`, `dashboard`, `my-projects`, `project-dashboard`,
`kanban`, `phases-progress`, `task-detail`, `workload`, `team`, `documents-viewer`,
`conflicts`, `audit-log`, `project-settings`. `/login` is the only route outside
`src/app/layout/app-shell`; every signed-in route is a child of that shell,
which owns the one primary navigation, the signed-in actor and sign-out, and
runs `authGuard` on each child navigation. `dashboard`, `projects`, `workload`
and `team` are top-level children (post-login landing is `/dashboard`);
`project-dashboard` is the project header (sync, members, section tabs) for the
routes nested under `/projects/:projectId`. `core/` holds guards, interceptors
and API services, including the Signals-based `AuthService`; `shared/` holds
cross-feature UI such as the task create/edit form used by the Kanban and the
task detail. Global tokens and
shared page classes (`page-header`, `tab-nav`, `kind-badge`) live in
`src/styles.scss` on top of the Angular Material theme.

## Security (brief §28)

JWT auth, RBAC enforced via `Role`/`Permission`/`ActorRole` and a
`permissionGuard` reading route/handler metadata, global rate limiting
(`@nestjs/throttler`), input validation via NestJS pipes/DTOs, argon2id (or
bcrypt) password hashing, secrets only via environment variables — never
persisted in `AgentProfile.configJson` or anywhere else in the database.

## What this document intentionally does not cover

Entity fields and relations live in `docs/domain-model.md`. Sync/reconciliation
mechanics live in `docs/synchronization.md`. Roadmap/Agentslog parsing rules
live in `docs/roadmap-parser.md`.
