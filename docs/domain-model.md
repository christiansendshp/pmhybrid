# Domain model

This is the functional spec for `apps/api/prisma/schema.prisma`. See
`docs/architecture.md` for how modules map to these entities, and
`docs/skillProyectDocument-analysis.md` for why the model below layers on top
of, rather than inside, a managed project's own documents.

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
  priority?, progressPercent?,           // explicit override; null = derive via rollup
  startDate?, estimatedDate?, dueDate?,
  assigneeActorId?, assigneeLockedAt?,   // set when status becomes EN_DESARROLLO
  rawOwner?, ownerClaimedAt?,            // parsed "<agent>@<timestamp>" Owner cell
  acceptanceCriteria?,
  roadmapTable: ACTIVE|NEAR_TERM|BLOCKED|null,   // null = not doc-sourced
  blockedReason?, neededDecision?,
  sourceOrigin: UI|ROADMAP,               // immutable at creation
  lastSyncedContentHash?, lastSyncedAt?,
  createdAt, updatedAt
)
@@unique([projectId, externalId])
@@index([projectId, status])
```

- `TaskDependency(taskId, dependsOnTaskId?, rawExternalRef?)` — a resolved
  internal reference when the dependency's ID matches a known `Task`, else the
  raw free-text "Depends on" value. Cycle prevention (A depends on B depends
  on A) is application-level (`TasksService.validateDependencyGraph()`, a
  bounded DFS) — Postgres cannot cheaply enforce acyclic graphs declaratively.
- `TaskAssignment(id, taskId, actorId, assignedAt, unassignedAt?, assignedByActorId, reason?)`
  — structured reassignment history, distinct from `AuditEvent`: this is a
  read-optimized current+historical index for the Workload view, while
  `AuditEvent` is a generic append-only log across all entity types. Same
  underlying fact recorded twice on purpose, for two different query shapes.
- `sourceOrigin` stays immutable at creation even though a UI-created task
  later gets an `externalId` once written back into `Roadmap.md` — it remains
  the only record of which side originated the task.

## Documents / sync / audit

```
Document(id, projectId, kind: ROADMAP|AGENTSLOG|PRODUCT_DESCRIPTION|STACK_TECH|
  FEATURES|AGENTS_RULES, filePath, lastKnownHash?, lastSyncedAt?, lastSyncRunId?)
  @@unique([projectId, kind])

DocumentRevision(id, documentId, contentHash, rawContent, capturedAt, source: SYNC|UI)

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
  CONCURRENT_FIELD_EDIT|WRITE_BACK_COLLISION, entityType, entityId,
  localVersion jsonb, externalVersion? jsonb, detectedAt, resolvedAt?,
  resolvedByActorId?, resolutionStrategy?: KEEP_LOCAL|KEEP_EXTERNAL|MANUAL_EDIT|DISMISSED)

AuditEvent(id, projectId?, actorId?, entityType, entityId, operation,
  previousValue? jsonb, newValue? jsonb,
  origin: UI|ROADMAP|AGENTSLOG|SYNC|API|SYSTEM, occurredAt)
  @@index([entityType, entityId, occurredAt])
  @@index([projectId, occurredAt])   // a project's whole history in one query

Notification(id, actorId, projectId, type, payload? jsonb, readAt?, createdAt)
```

`Conflict` is a first-class entity (brief §26), not just an audit log line —
it needs its own list/detail/resolve endpoints and UI route.

`AuditEvent` rows are written by `AuditService.record()` inside the same
transaction as the change they describe, and `previousValue`/`newValue` carry
only the fields that actually changed. Audited entity types: `Project`,
`Task`, `ProjectMember`, `ActorRole`, `Phase`, `Epic`, `Template`, `SyncRun`.
Operations: `CREATE`, `UPDATE`, `PROGRESS_CHANGE`, `ASSIGN`, `REASSIGN`,
`STATUS_CHANGE`, `DEPENDENCY_ADD`, `MEMBER_ADD`/`MEMBER_REMOVE`,
`ROLE_ASSIGN`/`ROLE_REVOKE`, `WRITE_BACK`/`WRITE_BACK_AGENTSLOG_ONLY`,
`ROADMAP_TABLE_CHANGE`, `ROADMAP_FIELD_UPDATE`,
`COMPLETE_VIA_ROADMAP_REMOVAL`, `SYNC_RUN` (manual runs and scheduled runs
that changed something), `CONFLICT_DETECTED`, `CONFLICT_RESOLVED`. Every
authenticated REST call on a person's behalf is origin `UI`; `API` is
reserved for agent API-key access.

## Project

```
Project(id, name, description?, repoUrl?, docsPath, syncIntervalMinutes default 5,
  progressRollupStrategy: EQUAL_WEIGHT_AVERAGE|LEAF_EQUAL_WEIGHT default EQUAL_WEIGHT_AVERAGE,
  nextTaskSeq default 1,      // monotonic counter for minted externalIds, see below
  status default "ACTIVE", createdAt)
```

No hard deletes on `Project`/`Task` in MVP — soft-delete via `status`/
`isActive` flags. `AuditEvent` never cascades on delete, since it's the
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

## Task ID minting for app-created tasks

`PMH-<n>` via `Project.nextTaskSeq` (a monotonic per-project counter).
Readable in a hand-edited Markdown file, guaranteed not to collide with
user/agent-authored IDs like `F01-S01-T01`, and — like every `externalId` —
treated purely as an opaque string by any parser, never assumed to carry a
grammar.
