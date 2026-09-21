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

| Module                         | Responsibility                                                                                    |
| ------------------------------ | ------------------------------------------------------------------------------------------------- |
| `auth`                         | JWT issuance/verification, login                                                                  |
| `users`                        | Human actor management (thin layer over `Actor`/`UserCredential`)                                 |
| `agents`                       | AI agent actor management (`Actor`/`AgentProfile`)                                                |
| `projects`                     | Project CRUD, settings (sync interval, docs path, rollup strategy)                                |
| `project-members`              | Membership records, independent of role grants                                                    |
| `roles`                        | Role/Permission/ActorRole CRUD, permission checks                                                 |
| `phases`, `epics`, `templates` | Optional hierarchy rungs                                                                          |
| `tasks`                        | Task CRUD, subtasks (self-referential), dependencies, assignment, Kanban transition policy        |
| `roadmap`                      | `RoadmapParserService`, `AgentslogParserService` — parsing only, no orchestration                 |
| `synchronization`              | Scheduler, reconciliation algorithm, write-back orchestration                                     |
| `git-providers`                | `ProjectRepositoryProvider` interface + `LocalFsGitProvider`/`GitHubGitProvider`                  |
| `github-webhook`               | `POST /webhooks/github` — verifies GitHub's signature, triggers `synchronization`'s runSync       |
| `mcp`                          | `POST /mcp` — MCP tools for agent task ops, thin adapters over `tasks`'s methods (Roadmap GAP-30) |
| `audit`                        | `AuditEvent` recording inside callers' transactions + project audit trail read API                |
| `notifications`                | `Notification` recording, subscribes to domain events                                             |
| `realtime`                     | Ticket-based WS handshake + `NotificationsGateway`'s per-actor push (Roadmap GAP-26)              |
| `conflicts`                    | `Conflict` CRUD and resolution endpoints                                                          |
| `dashboard`                    | Cross-project summary + activity feed (brief §14) — aggregate, not project-scoped                 |
| `workload`                     | Cross-project per-actor task list (brief §19) — `projectId` is an optional filter, not scope      |
| `health`                       | Liveness/readiness (`@nestjs/terminus` + Prisma check)                                            |

`roadmap` (parsing) and `synchronization` (orchestration) are deliberately
separate modules — parsing is a pure function of document text, orchestration
owns scheduling, locking, and reconciliation policy. Merging them would couple
unrelated concerns.

## Decoupling points (extensibility seams, brief §20)

Three areas are built behind an interface/strategy from day one so they can
grow without touching call sites:

1. **`ProjectRepositoryProvider`** (`git-providers` module): `readFile`,
   `writeFile`, `listRevisions`, and `readRootRulesFile` (the repository-root
   `AGENTS.md` the latest project-documentation skill keeps its rules in; it
   takes no file name, so no path reaches above the docs folder — the local
   provider also requires that parent to be inside an allowed root, Roadmap
   GAP-37c). `LocalFsGitProvider` (local disk) and
   `GitHubGitProvider` (GitHub REST API, Roadmap GAP-23) both implement it
   unchanged; GitLab/Bitbucket providers are additive later. Selected
   process-wide by `GIT_PROVIDER_TYPE` (`local` default, or `github`), not
   per-project — `git-providers.module.ts` builds only the selected one so
   `GitHubGitProvider`'s fail-fast `GITHUB_TOKEN` check never runs for local
   deployments. Because the interface takes only `(docsPath, relativePath)`
   with no project id or repo-URL parameter, a GitHub-backed `Project.docsPath`
   holds `"owner/repo"` or `"owner/repo/subpath"` instead of a local path —
   `Project.repoUrl` stays informational only (see the provider's own doc
   comment for the full reasoning). The docsPath filesystem browser (GAP-27)
   only makes sense for `local` and refuses with 409 otherwise.
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

Side effects that may lag (notifications) hang off `@nestjs/event-emitter`
events, without touching business logic. Concretely,
`SynchronizationService.runSync` emits `sync.completed`/`sync.failed` (with
`emitAsync`, awaited) only after its own reconciliation transaction has
resolved; `NotificationsService` is the only listener, and excludes whoever
directly triggered that run from the fan-out. After persisting the
`Notification` rows for a fan-out, `NotificationsService` also pushes a
content-free "go refetch" signal to each notified actor's open sockets
(Roadmap GAP-26) via `NotificationsGateway` (`realtime` module) — a plain
`ws.WebSocketServer` attached to the existing HTTP server through
`HttpAdapterHost`, deliberately not `@nestjs/websockets`' gateway decorator
(see `docs/Stack_Tecnologies.md` ADR-015 for why, and `docs/permissions.md`
for the ticket-based handshake auth). A push failure is isolated from and
never mislabelled as a persistence failure: the rows are already committed
by the time the push is attempted, and the REST list stays authoritative —
opening the notifications panel (or the next app load) always refetches it,
so a dropped push only delays the badge, it never loses a notification.
GAP-26 picked WebSockets first for having existing groundwork (this
section, and the "no push" known limitation); GitHub webhook ingestion
(`webhooks/github`, Roadmap GAP-29 — `docs/synchronization.md` "Trigger")
followed it, extending GAP-23's `GitHubGitProvider`. The brief §27/§29 trio
closes with an MCP server (`mcp` module, Roadmap GAP-30): `list_tasks`/
`get_task`/`update_task`/`transition_task` tools (and, since GAP-36b, the workflow
tools `list_projects`/`get_context`/`claim_task`/`create_task`/`list_conflicts`/
`read_document`, `docs/permissions.md`) over a stateless
Streamable HTTP endpoint, thin adapters over `tasks`'s existing service
methods rather than a new authorization model (`docs/Stack_Tecnologies.md`
ADR-017). Its "comment" verb was split off as GAP-31 (`docs/Roadmap.md`) and
is now DONE too: a `TaskComment` model plus `TaskCommentsController`/
`Service` (still inside the `tasks` module) and two more MCP tools,
`list_comments`/`add_comment` (`docs/Stack_Tecnologies.md` ADR-019). It is
deliberately not doc-sourced — no write-back to Roadmap.md/Agentslog.md,
unlike everything else `tasks` mutates.

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
task detail. `task-detail` renders every task sub-resource except comments —
`TaskComment` (Roadmap GAP-31) has a REST endpoint and an MCP tool but no
Angular view yet, recorded here per that ticket's own acceptance check
rather than silently built or silently skipped. Global tokens and
shared page classes (`page-header`, `tab-nav`, `kind-badge`) live in
`src/styles.scss` on top of the Angular Material theme.

## Security (brief §28)

JWT auth, RBAC enforced via `Role`/`Permission`/`ActorRole` and a
`permissionGuard` reading route/handler metadata, global rate limiting
(`@nestjs/throttler`), input validation via NestJS pipes/DTOs, argon2id (or
bcrypt) password hashing, secrets only via environment variables — never
persisted in `AgentProfile.configJson` or anywhere else in the database.

## The three large services, and how they would be split (Roadmap TEST-01d)

Three services carry most of the behaviour and are big enough to be hard to
change safely (measured 2026-09-21): `SynchronizationService` (about 1,540
lines), `WriteBackService` (about 1,070) and `TasksService` (about 880). This
is a plan, not a refactor: nothing here is scheduled, and each split should be
its own commit with the e2e suite green before and after (the suite drives all
three through HTTP, so it is the safety net for moving code).

**Rule for any split**: cut along a line the code already draws — a private
method group that shares a data shape — never by size. Keep the public method
names each caller uses (`runSync`, `recordTaskEvent`, `create`, …) on the
original class as a thin facade until every caller has moved, so a split never
changes a controller, a listener or a spec at the same time.

| Service                  | What is in it today                                                                                                                                                                                                                   | Seam already there                                                                                                                                                      | Split into                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SynchronizationService` | The run (lock, documents, result), the Roadmap reconciliation loop, task creation from a row, owner and assignee resolution, conflict raising and auto-closing, field reconciliation, dependency reconciliation                       | Each of these is a group of `private` methods that takes the transaction and a row, and shares `SyncSummary` and `OpenConflict`                                         | `SyncRunner` (`runSync`, `runLocked`, `syncDocument`, notifications), `RoadmapReconciler` (`reconcileRoadmap`, `reconcileExistingRow`, `createFromRoadmapRow`), `SyncConflictService` (`raise*`, `closeConflictAutomatically`, `closeAgreedFieldConflicts`), `DependencyReconciler` (`reconcileDependencies`, `resolveDanglingDependencies`), `AssigneeReconciler` (`loadOwnerCandidates`, `reconcileAssignee`, `assigneeEditedLocally`) |
| `WriteBackService`       | One public method per lifecycle event (`recordTaskEvent`, `recordFieldEdit`, `recordConflictResolution`, `recordTaskRemoval`, `recordDependencyAdded`), each with its `*Locked` body, plus the lock wrapper and the revision recorder | The `*Locked` bodies do not call each other; they share only `inTransaction`, `recordDocumentRevision` and the row writers in `roadmap/`                                | Keep `WriteBackService` as the lock wrapper and revision recorder; move each `*Locked` body into its own class (`LifecycleWriteBack`, `FieldEditWriteBack`, `ResolutionWriteBack`, `RemovalWriteBack`, `DependencyWriteBack`) that receives the wrapper                                                                                                                                                                                  |
| `TasksService`           | Reads (list, detail), create with idempotency, update, assign, transition, dependencies, removal, and the hierarchy and cycle guards                                                                                                  | The guards (`assertHierarchy`, `assertNoParentCycle`, `assertNoDependencyCycle`) and the field helpers at the bottom are already free of instance state except `prisma` | `TaskQueryService` (reads), `TaskHierarchyGuards` (the `assert*` group and the helpers), and `TasksService` keeping the writes; assignment and transition are the next candidates once the guards are out                                                                                                                                                                                                                                |

What makes the order safe: start with the pieces that have no callers outside
their own class (the guards, the conflict raising, the `*Locked` bodies), since
moving them changes no signature anyone else uses. The dependency
reconciliation and the assignee resolution come after, because they read what
the reconciliation loop has already loaded. The run itself
(`runSync`/`runLocked`) moves last, since it is the transaction boundary every
other piece runs inside.

## What this document intentionally does not cover

Entity fields and relations live in `docs/domain-model.md`. Sync/reconciliation
mechanics live in `docs/synchronization.md`. Roadmap/Agentslog parsing rules
live in `docs/roadmap-parser.md`. The REST route/auth/error-shape reference
lives in `docs/api-reference.md`, the full permission-key and default-role
matrix in `docs/permissions.md`, and the test layout/commands/conventions in
`docs/testing.md`.
