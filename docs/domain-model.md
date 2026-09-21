# Domain model

This is the functional spec for `apps/api/prisma/schema.prisma`. See
`docs/architecture.md` for how modules map to these entities,
`docs/skillProyectDocument-analysis.md` for why the model below layers on top
of, rather than inside, a managed project's own documents,
`docs/permissions.md` for the full permission-key/role-grant reference (this
file only covers the RBAC schema, not every key), and `docs/api-reference.md`
for the REST surface these entities are served through.

## Brief → schema mapping

The brief's §23 minimum entity list is honored, with two deliberate
consolidations justified by §23's own "avoid unnecessary duplication" and
§34's "avoid premature abstraction":

| Brief §23 name          | Schema                                      | Rationale                                                                                                           |
| ----------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `User`, `Agent`         | `Actor` (+ `UserCredential`/`AgentProfile`) | Identical shape for HUMAN/AI_AGENT actors per §3; a literal `User`/`Agent` split would duplicate every shared field |
| `ProjectRole`           | `ActorRole` (with nullable `projectId`)     | One table cleanly expresses both global roles (§4) and per-project roles without a parallel near-identical table    |
| _(no separate Subtask)_ | `Task` with self-referential `parentTaskId` | §23's own minimum list omits a `Subtask` table; a subtask is a `Task` whose parent is set                           |

Everything else in §23's list (`Phase`, `Epic`, `Template`, `TaskDependency`,
`TaskAssignment`, `AuditEvent`, `Document`, `DocumentRevision`, `SyncRun`,
`AgentLogEvent`, plus `Permission`/`RolePermission`, `ProjectMember`) is a
direct 1:1 entity below.

## Actors

Avoids duplicating fields between humans and AI agents (brief §3):

```
Actor(id, kind: HUMAN|AI_AGENT, displayName, avatarUrl?, email?, isActive, createdAt)
UserCredential(1:1 Actor where kind=HUMAN): passwordHash?, authProvider, providerUserId?
AgentProfile(1:1 Actor where kind=AI_AGENT): providerType (free text — "no asumir
  nombres concretos"), configJson? (non-secret labels/refs only; real API keys
  stay in environment variables per brief §28)
```

## RBAC (brief §4)

```
Role(id, name, scope: GLOBAL|PROJECT, isSystem)
Permission(id, key, description)
RolePermission(roleId, permissionId)
ActorRole(actorId, roleId, projectId?)   // null = global grant, set = project-scoped
ProjectMember(projectId, actorId, joinedAt, isActive)
```

`ActorRole` handles both global and per-project role assignment in one table —
"different roles in different projects" (brief §4) falls out of `projectId`
varying per row. `ProjectMember` stays separate: it answers "who has ever been
part of this project," independent of role churn, and is its own §23 entity.

Seeded catalog: seven `PROJECT` roles (`OWNER` … `AI_AGENT`) carrying only
project permissions, and one `GLOBAL` role, `ADMIN`, carrying the global
`actors.manage` permission (create/edit/deactivate users and AI agents). A
global role is granted only with `projectId = null` — the project roles
endpoint refuses it, so no project owner can escalate anyone instance-wide.
The seeded demo login holds `ADMIN`.

`Actor.isActive = false` (brief §3) blocks login, refresh **and** every
already-issued access token (checked per request), and the actor can no longer
join a project or be assigned a task; history and existing assignments stay.
`AgentProfile.configJson` holds non-secret settings only — credential-looking
keys are rejected, secrets live in environment variables (brief §28).

**Postgres nuance to carry into the migration**: the natural
`@@unique([actorId, roleId, projectId])` does **not** deduplicate global grants,
because `NULL` is treated as distinct in a unique constraint — two rows with
the same `actorId`/`roleId` and `projectId = NULL` are not caught as
duplicates. A follow-up raw-SQL migration adds a partial index:

```sql
CREATE UNIQUE INDEX actor_role_global_uq
  ON "ActorRole" (actor_id, role_id) WHERE project_id IS NULL;
```

## Controlled API access for AI agents (brief §27, §28, Roadmap GAP-15)

```
ApiKey(id, actorId, name?, prefix, secretHash, createdAt, revokedAt?,
        expiresAt?, scope: READ_ONLY|READ_WRITE, lastUsedAt?)
```

Scoped to one agent Actor (`AgentApiKeysService`/`AgentApiKeysController`
under `/agents/:agentId/keys`, gated by `actors.manage`, same as creating or
editing the agent itself). The plaintext key is `pmh_<64 hex chars>` — 256
bits of generator entropy — returned exactly once, in the create response,
and never persisted: `secretHash` is a plain SHA-256 digest of the part after
`pmh_`, not argon2id (ADR-009, Stack_Tecnologies.md), because there is no
dictionary to defend against and it doubles as the deterministic lookup key.
`prefix` (its first 8 hex chars) is plaintext and display-only.

**Expiry, scope and last use** (Roadmap SECURITY-04b2). `expiresAt` (from
`expiresInDays` at creation, 1 to 3650) makes a key stop working at that moment,
refused exactly like a revoked one; null never expires, which is how every
key was. `scope` is `READ_WRITE` (the default) or `READ_ONLY`: a read-only key
is refused, with a 403, every request whose method is not GET, HEAD or OPTIONS.
It is enforced by the method in `ApiKeyGuard`, in one place, because a scope
per permission would have needed every route annotated; the cost is that the MCP
endpoint, a POST for every call, is closed to a read-only key. `lastUsedAt` is
written when the key authenticates and is at least a minute old (one write a
minute, not one per request) and is shown in the Team page next to the expiry.
The request budget is counted per real key instead of per address
(`ApiKeyThrottlerGuard`), so several agents behind one host no longer starve
each other; a made-up, revoked or expired key is counted against the address,
so random keys cannot buy a fresh budget.

A key authenticates **as** the owning agent: `ApiKeyGuard`, composed into the
existing `JwtAuthGuard` behind an `X-API-Key` header (instead of replacing it
with a second auth axis), sets the same `request.user` shape a JWT would —
so `PermissionGuard`/`CurrentActorId` and every route's RBAC apply completely
unchanged, with no route needing to know which credential form was used.
Re-checked per request, same as `JwtStrategy`: a revoked key or a deactivated
agent is rejected immediately, not just on next login. Restricted to
`AI_AGENT` actors as defense in depth (key creation is already confined to
agents).

`JwtPayload.authMethod` (`'JWT' | 'API_KEY'`) records which credential form
authenticated the request, but is not yet threaded into `AuditService.record`
calls — every service still hardcodes `origin: 'UI'` even for a
key-authenticated write. Key **management** (an admin minting or revoking) is
correctly audited as `UI` (`API_KEY_CREATE`/`API_KEY_REVOKE`, added to the
operations list below); threading `authMethod` through every service so a
key-authenticated write reads `origin: 'API'` — the reservation
`AuditService` already documents — is a known follow-up, not yet done.

## Hierarchy (brief §5 — no level mandatory)

All nullable/app-level, since the managed project's own documents don't define
these levels:

```
Phase(id, projectId, name, order, description?, status?)
Epic(id, projectId, phaseId?, name, order, description?, status?)
Template(id, projectId, epicId?, name, order, description?)
```

"Template" here is the brief's hierarchy rung between Epic and Task (§5, §6) —
unrelated to the `project-documentation` skill's own unrelated use of the word
"template" for its starter `.md` files. Naming collision only, not a shared
concept; document data can leave this rung mostly empty since no level is
mandatory.

## Task

```
Task(
  id uuid, externalId?,                  // Roadmap row ID, opaque string, unique per project;
                                          // never parsed for a prefix grammar
  projectId, phaseId?, epicId?, templateId?, parentTaskId?,  // self-ref = subtask
  title, description?,
  status: PENDIENTE|ASIGNADA|EN_DESARROLLO|QA|TERMINADA,
  priority?: LOW|MEDIUM|HIGH|CRITICAL,
  progressPercent?,                      // explicit override; null = derive via rollup
  startDate?, estimatedDate?, dueDate?,
  assigneeActorId?, assigneeLockedAt?,   // set when status becomes EN_DESARROLLO
  rawOwner?, ownerClaimedAt?,            // parsed "<agent>@<timestamp>" Owner cell
  acceptanceCriteria?,                   // required for app-created tasks (brief §9)
  roadmapTable: ACTIVE|NEAR_TERM|BLOCKED|null,   // null = not doc-sourced
  blockedReason?, neededDecision?,
  sourceOrigin: UI|ROADMAP,               // immutable at creation
  lastSyncedContentHash?, lastSyncedAt?,
  deletedAt?,                            // soft delete: out of every view, never recreated by sync
  createdAt, updatedAt
)
@@unique([projectId, externalId])
@@index([projectId, status])
```

- `TaskDependency(taskId, dependsOnTaskId?, rawExternalRef?, inDocument)` — a resolved
  internal reference when the dependency's ID matches a known `Task`, else the
  raw free-text "Depends on" value. Cycle prevention (A depends on B depends
  on A) is application-level (`TasksService.validateDependencyGraph()`, a
  bounded DFS) — Postgres cannot cheaply enforce acyclic graphs declaratively.
  `inDocument` is true once the document has listed the dependency; only such a
  dependency is removed when the document later drops it
  (`docs/synchronization.md` "Dependencies").
- `TaskAssignment(id, taskId, actorId, assignedAt, unassignedAt?, assignedByActorId, reason?)`
  — structured reassignment history, distinct from `AuditEvent`: this is a
  read-optimized current+historical index for the Workload view, while
  `AuditEvent` is a generic append-only log across all entity types. Same
  underlying fact recorded twice on purpose, for two different query shapes.
- `TaskComment(id, taskId, authorActorId, body, createdAt)` (Roadmap GAP-31)
  — a live, append-only comment thread any project member writes directly
  through the app (REST `POST`, human; MCP `add_comment`, agent), read back
  via REST `GET`/MCP `list_comments`. Deliberately distinct from
  `AgentLogEvent` below: that model is a one-way, read-only mirror of
  `Agentslog.md` entries populated by document ingestion (`agentName` is a
  denormalized string there, since a log's author need not be a registered
  `Actor`), while `TaskComment` is a direct interactive write path with no
  document counterpart — never read from or written back to `Roadmap.md`/
  `Agentslog.md` (see `docs/Stack_Tecnologies.md` ADR-019).
- `IdempotencyKey(id, projectId, actorId, key, requestHash, taskId, createdAt)`
  (Roadmap BUG-07b) — remembers which task a creation request made, so a
  client that retries after a timeout gets that task back instead of a second
  one. `POST /projects/:projectId/tasks` reads an optional `Idempotency-Key`
  header (1-128 printable characters, no spaces; a malformed one is a 400).
  With a key, the lookup and the insert run in the creating transaction under
  the project's advisory lock, so two simultaneous requests cannot both miss
  each other. Unique per `(projectId, actorId, key)`: a key is one caller's, and
  never reveals another's task. `requestHash` (a SHA-256 of the request body)
  catches a key reused for a different request — a 422, nothing created. A
  remembered key is dropped after 24 hours (the project's expired keys are
  deleted whenever a keyed creation runs, so there is no separate job), and is
  released early when its task has been removed. No header: exactly the old
  behaviour.
- Creating and editing a task from the app (brief §6, §9, `TasksService`):
  `title` and `acceptanceCriteria` are required and can change but never be
  cleared; every other field is optional and cleared with `null`. Hierarchy
  links stay optional (§5) but must agree — an epic that sits in a phase only
  under that phase, a template only under its own epic. `estimatedDate` and
  `dueDate` cannot precede `startDate`. An explicit `progressPercent` is
  refused once the task has subtasks (rollup rule 2 below). The web form
  still makes the creator answer "which parent instance?" explicitly, with
  "None" as a valid answer (BR-004).
- `sourceOrigin` stays immutable at creation even though a UI-created task
  later gets an `externalId` once written back into `Roadmap.md` — it remains
  the only record of which side originated the task.

## Documents / sync / audit

```
Document(id, projectId, kind: ROADMAP|AGENTSLOG|PRODUCT_DESCRIPTION|STACK_TECH|
  FEATURES|AGENTS_RULES, filePath, lastKnownHash?, lastSyncedAt?, lastSyncRunId?)
  @@unique([projectId, kind])

DocumentRevision(id, documentId, contentHash, rawContent, capturedAt, source: SYNC|UI)
  — only the newest `DOCUMENT_REVISION_RETENTION` (default 200) per document are kept;
  a daily job deletes the rest (Roadmap BUG-07c, `docs/synchronization.md`)

SyncRun(id, projectId, startedAt, finishedAt?, trigger: SCHEDULED|MANUAL,
  status: SUCCESS|PARTIAL|FAILED|RUNNING, summary jsonb?)

AgentLogEvent(id, projectId, taskExternalId?, taskId?, agentName, timestampFromLog,
  statusWord, summary, files, verify, followUp, rawEntryHash unique,
  sourceDocumentRevisionId, createdAt)
```

`rawEntryHash` is unique so re-ingesting an overlapping revision (e.g. after
ledger rotation) is idempotent. `timestampFromLog` is an untrusted,
agent-authored clock; `createdAt` (our own ingestion time) is what
reconciliation logic relies on — see `docs/synchronization.md`.

```
Conflict(id, projectId, kind: ROADMAP_ROW_DISAPPEARED_NO_TERMINAL_LOG|
  CONCURRENT_FIELD_EDIT|WRITE_BACK_COLLISION|UNRECOGNIZED_STATUS, entityType, entityId,
  localVersion jsonb, externalVersion? jsonb, detectedAt, resolvedAt?,
  resolvedByActorId?, resolutionStrategy?: KEEP_LOCAL|KEEP_EXTERNAL|MANUAL_EDIT|DISMISSED)

AuditEvent(id, projectId?, actorId?, entityType, entityId, operation,
  previousValue? jsonb, newValue? jsonb,
  origin: UI|ROADMAP|AGENTSLOG|SYNC|API|SYSTEM, occurredAt)
  @@index([entityType, entityId, occurredAt])
  @@index([projectId, occurredAt])   // a project's whole history in one query

Notification(id, actorId, projectId, type, payload? jsonb, readAt?, createdAt)
  // type: CONFLICTS_DETECTED | SYNC_FAILED | ROADMAP_ENTRIES_INVALID
```

`Conflict` is a first-class entity (brief §26), not just an audit log line —
it needs its own list/detail/resolve endpoints and UI route.

`AuditEvent` rows are written by `AuditService.record()` inside the same
transaction as the change they describe, and `previousValue`/`newValue` carry
only the fields that actually changed. Audited entity types: `Project`,
`Task`, `Actor`, `Role`, `ProjectMember`, `ActorRole`, `Phase`, `Epic`,
`Template`, `SyncRun`. Operations: `CREATE`, `UPDATE`, `PROGRESS_CHANGE`, `ASSIGN`,
`REASSIGN`, `STATUS_CHANGE`, `DELETE`, `DEPENDENCY_ADD`, `MEMBER_ADD`/`MEMBER_REMOVE`,
`ROLE_ASSIGN`/`ROLE_REVOKE`, `ROLE_PERMISSIONS_UPDATE`,
`WRITE_BACK`/`WRITE_BACK_AGENTSLOG_ONLY`,
`ROADMAP_TABLE_CHANGE`, `ROADMAP_FIELD_UPDATE`,
`COMPLETE_VIA_ROADMAP_REMOVAL`, `SYNC_RUN` (manual runs and scheduled runs
that changed something), `CONFLICT_DETECTED`, `CONFLICT_RESOLVED`,
`API_KEY_CREATE`, `API_KEY_REVOKE` (Roadmap GAP-15). Every authenticated REST
call made by a human, or an agent key-managed by one, is origin `UI`; `API`
is reserved for a request an agent _authenticated with its own key_ —
minted per this section, but not yet threaded into every service's
`audit.record()` call (see above), so it is reserved but currently unused.

## Project

```
Project(id, name, description?, repoUrl?, docsPath, syncIntervalMinutes default 5,
  progressRollupStrategy: EQUAL_WEIGHT_AVERAGE|LEAF_EQUAL_WEIGHT default EQUAL_WEIGHT_AVERAGE,
  nextTaskSeq default 1,      // monotonic counter for minted externalIds, see below
  status: ACTIVE|PAUSED|ARCHIVED default ACTIVE,   // only ACTIVE projects sync on a schedule
  leadActorId?,               // Roadmap GAP-32 — single responsible member, human or AI agent
  createdAt)
```

`leadActorId` (nullable FK to `Actor`) is a project-scoped analogue of
`Task.assigneeActorId`: one designated "responsible for this project" member,
independent of `ProjectMember` (access) and `ActorRole` (permission grants,
including `OWNER`, which any number of actors can hold at once). Named
`lead`, not `owner`, specifically to avoid colliding with the RBAC `OWNER`
role's different meaning. Set via `PATCH /projects/:id` (`ProjectsService.
update`, permission `project.update`), which requires the given actor to be
an active member of the project — same rule `TasksService.assign()` already
enforces for a task's assignee — or `null` to clear it, which always
succeeds. No kind restriction: an `AI_AGENT` actor can be a project's lead,
matching `RolesService.assignProjectRole`'s existing kind-agnostic behavior.

No hard deletes on `Project`/`Task` in MVP — a project is soft-deleted via
`status`, a task via `deletedAt` (`DELETE /projects/:id/tasks/:taskId`,
permission `task.delete`, refused while the task has live subtasks; its
dependency links are dropped and its open assignment closed, and removed
tasks are excluded from lists, progress, workload and dashboard). A removed
task keeps its `externalId`, so sync never recreates it (`docs/synchronization.md`
"Removal"). `AuditEvent` never cascades on delete, since it's the
compliance record and must be able to outlive the row it describes.

## Kanban transition policy (brief §7)

A code-level table (`apps/api/src/modules/tasks/task-status-policy.ts`), not
admin-editable in MVP — same decoupling idiom as `ProjectRepositoryProvider`
so it can move to DB-driven config later without touching callers.

| From          | To                  | Required permission                      |
| ------------- | ------------------- | ---------------------------------------- |
| PENDIENTE     | ASIGNADA            | `task.assign` (requires assignee set)    |
| ASIGNADA      | PENDIENTE           | `task.assign`                            |
| ASIGNADA      | EN_DESARROLLO       | `task.status.transition`                 |
| EN_DESARROLLO | QA                  | `task.status.transition`                 |
| EN_DESARROLLO | ASIGNADA            | `task.status.transition`                 |
| QA            | TERMINADA           | `task.qa.approve`                        |
| QA            | EN_DESARROLLO       | `task.qa.reject`                         |
| TERMINADA     | EN_DESARROLLO or QA | `task.reopen` (OWNER/PROJECT_ADMIN only) |

**Hard rule**: once `status = EN_DESARROLLO`, `assigneeActorId` is locked.
Changing it requires `task.reassign.locked` and must, in one transaction,
write a `TaskAssignment` row (closing the old assignment, opening the new one)
and an `AuditEvent(operation=REASSIGN)`.

**Concurrency** (Roadmap BUG-04): `assign`, `transition` and conflict resolution decide
from a snapshot of the task (its status and assignee) — the lock check, the
permission they require, the next status — and only apply if the task is still
exactly that snapshot: the write is a conditional `updateMany` on the status and
assignee that were read, and a lost race answers **409** ("the task changed
while this action was being processed; reload it and try again") with nothing
written. Without that, a reassignment racing a move to `EN_DESARROLLO` could
slip past the lock or restore a stale status.

Blocking (`roadmapTable = BLOCKED`) is orthogonal to Kanban status, not a
sixth column — a task can be `EN_DESARROLLO` and blocked simultaneously. The
"tareas bloqueadas" dashboard metric (brief §14) counts
`roadmapTable = BLOCKED`, not any status value.

## Progress rollup (brief §16-17)

`ProgressRollupService` behind a strategy interface, selected per-project via
`Project.progressRollupStrategy`.

**`EQUAL_WEIGHT_AVERAGE` (MVP default):**

1. Leaf task (no subtasks): uses its explicit `progressPercent` if set, else a
   status-mapped fallback: `PENDIENTE=0, ASIGNADA=0, EN_DESARROLLO=50, QA=80,
TERMINADA=100`.
2. Task with subtasks: arithmetic mean of its immediate children's computed
   progress (recursive). Its own `progressPercent` becomes derived/read-only
   once it has subtasks.
3. Epic: mean of its direct top-level Tasks (`epicId = this.id AND
parentTaskId IS NULL`) — subtasks are already folded into their parent
   task's value, avoiding double-counting.
4. Phase: mean of its Epics and any Tasks attached directly to the Phase
   without an Epic, as equal-weight siblings.
5. Project: mean of its Phases and any orphan Tasks/Epics without a Phase.
6. A container with zero descendants shows "no data," not 0 — brief's
   fallback-to-manual case when nothing is computable.

Known, documented pathology: a Phase with one 20-task Epic and one loose Task
weights that loose task at 50% of the Phase's progress. The documented,
not-yet-implemented alternative behind the same interface is
`LEAF_EQUAL_WEIGHT` (weight by total leaf-descendant count instead of
immediate-child count).

Computed on read; no persisted rollup columns, to avoid a stale-cache bug
class at MVP data volumes.

**In batches, from memory** (Roadmap IMPROVEMENT-01c). The rollup is computed by a
pure `ProgressCalculator` from one read of a project's live tasks, epics and
phases; `ProgressRollupService` reads them for a whole batch of projects at once
(at most 5,000 ids per query, under Postgres' bind-parameter limit) and answers
for every project or task in it. The project list, the task list, the workload
view and the dashboard therefore run a fixed number of queries however many
projects or tasks they show; they used to walk the tree with a query per node,
per task, per project, and a few thousand projects exhausted the connection pool
and answered 500. The semantics above are unchanged — a removed task never counts
towards its parent, and an empty container is `null`, not 0.

## Task ID minting for app-created tasks

`PMH-<n>` via `Project.nextTaskSeq` (a monotonic per-project counter).
Readable in a hand-edited Markdown file, guaranteed not to collide with
user/agent-authored IDs like `F01-S01-T01`, and — like every `externalId` —
treated purely as an opaque string by any parser, never assumed to carry a
grammar.
