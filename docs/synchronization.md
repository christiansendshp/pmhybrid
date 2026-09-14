# Synchronization

How PM Hub keeps a managed project's documents (`Roadmap.md`, `Agentslog.md`)
and PostgreSQL coherent in both directions, per brief §11-12, §26. Parsing
mechanics (table discrimination, status/owner mapping) live in
`docs/roadmap-parser.md`; this document covers the reconciliation algorithm
and write-back that consume the parser's output.

## Trigger

- **Scheduled**: a `@nestjs/schedule` minute tick checks every active
  `Project` where `now - lastSyncedAt >= syncIntervalMinutes`.
- **Manual**: `POST /projects/:id/sync` ("Sincronizar ahora", brief §11).

Both paths call the same `SynchronizationService.runSync(projectId, trigger)`.

## Concurrency guard

The whole run is wrapped in `pg_advisory_xact_lock(hashtext(projectId))`, so
the write-back path (below) blocks on the same lock instead of racing a
scheduled sync for the same project. `SyncRun.status = RUNNING` is recorded at
start with a stale-timeout check: a run still `RUNNING` past a configured
threshold is treated as crashed and a new run is allowed to proceed.

## Per-run algorithm (Documents → Postgres)

1. Insert a `SyncRun` row (`RUNNING`).
2. For each `DocumentKind`, read via `ProjectRepositoryProvider.readFile`,
   hash the content, compare to `Document.lastKnownHash`. Unchanged → skip.
   Changed → insert a `DocumentRevision`, update `Document`.
3. Parse `Roadmap.md` into rows per table (ACTIVE/NEAR_TERM/BLOCKED — see
   `docs/roadmap-parser.md` for the discrimination rule) and `Agentslog.md`
   into entries (see below).
4. **New rows** (`externalId` not yet known for this project) → create
   `Task(sourceOrigin=ROADMAP, externalId=row.id, roadmapTable=..., ...)`
   with fields mapped per the row's table type. A row that first appears only
   in Blocked (no prior Active/Near-term history) gets `status=PENDIENTE`
   (documented default — there is no other status source for it), with null
   `dependencies`/`acceptanceCriteria` until a later Active/Near-term
   appearance backfills them.
5. **Existing rows still present** — diff mapped fields against the incoming
   row:
   - Table membership changed → update `Task.roadmapTable`, write
     `AuditEvent(operation=ROADMAP_TABLE_CHANGE)`. This is the _entire_
     mechanism for tracking "which table a row sits in is itself a status
     signal" (brief's blocked-tasks metric) — no separate table or column is
     needed beyond this audit trail plus the current `roadmapTable` value.
   - Moving **into** BLOCKED → set `blockedReason`/`neededDecision` from the
     row. **Do not clear** `status`/`dependencies`/`acceptanceCriteria` —
     the Blocked table's column set doesn't carry those fields, but Postgres
     retains the last-known values so they're not lost while blocked.
   - Moving **out of** BLOCKED → clear `blockedReason`/`neededDecision`;
     status/dependencies/acceptance are present in the row again, apply
     normally.
   - **Per-field conflict check**: query `AuditEvent` for
     `entityType=Task AND entityId=task.id AND origin=UI AND occurredAt >
task.lastSyncedAt`, collecting the field names touched in `newValue`.
     Intersect with the fields the incoming row is about to change.
     - Non-empty intersection → create
       `Conflict(kind=CONCURRENT_FIELD_EDIT, localVersion=<contested fields
from DB>, externalVersion=<contested fields from row>)`; apply only the
       non-contested fields.
     - Empty intersection → apply everything; update
       `lastSyncedContentHash`/`lastSyncedAt`.
6. **Disappeared rows** — a known `externalId` not present in this parse. This
   is the core hazard: `Roadmap.md` _removes_ completed rows rather than
   marking them done, so a naive parser would report every completion as a
   deletion (forbidden by brief §12: "no sobrescribir silenciosamente cambios
   externos" and never silently deleting).
   - Query `AgentLogEvent` for `taskExternalId = task.externalId AND
statusWord IN terminalSet` (seed `terminalSet = ["DONE"]`, an extensible
     configured list, not hardcoded to one literal forever).
   - **Never filter on `timestampFromLog`** — it's an untrusted,
     agent-authored clock. A terminal entry is terminal regardless of what
     time it claims to have been written.
   - If the hot `Agentslog.md` shows a rotation pointer (a `## Previous
segment` section with an archive path + SHA-256), ingest the referenced
     archived segment first (verifying its hash), so a `DONE` entry that
     rotated out of the hot log _before_ the row vanished from `Roadmap.md`
     is still found.
   - **Found** → `Task.status = TERMINADA`, `roadmapTable = null`,
     `AuditEvent(operation=COMPLETE_VIA_ROADMAP_REMOVAL, origin=SYNC)`.
   - **Not found** → `Conflict(kind=ROADMAP_ROW_DISAPPEARED_NO_TERMINAL_LOG)`;
     the `Task` is left **completely untouched**. Never a database delete, in
     either branch.
7. Finalize the `SyncRun` (`SUCCESS`/`PARTIAL`/`FAILED`) with a `summary`
   jsonb of counts (created/updated/table-changed/completed-via-removal/
   conflicts-raised).

## Agentslog ingestion

Entries matched on `## [ISO8601] | agent | TASK-ID | status-word` followed by
exactly four bullets (`Summary`/`Files`/`Verify`/`Follow-up`), per the skill's
own entry format (`docs/skillProyectDocument-analysis.md` §7). Ingestion is
idempotent via the unique `rawEntryHash`, so re-parsing an overlapping
revision (e.g. across a rotation boundary) is safe. `taskExternalId` is
correlated to `Task.externalId` within the same project to backfill `taskId`.

## Write-back (Postgres → Documents)

Triggered by a UI-originated task change (creation, status transition,
locked reassignment):

1. Persist the change in Postgres, inside a transaction.
2. If the task is new (no `externalId` yet), mint one: `PMH-<n>` via
   `Project.nextTaskSeq` (see `docs/domain-model.md`).
3. **Append the Agentslog entry first**, before touching the Roadmap row —
   this ordering (not the reverse) preserves the invariant step 6 above
   depends on ("a terminal log entry exists before a row can vanish") even if
   the process crashes mid-write-back. Only a curated subset of transitions
   auto-appends an entry: task created, status → `EN_DESARROLLO`, status →
   `TERMINADA`, and locked reassignment — not every field edit, to avoid
   ledger-rotation churn from fine-grained UI activity. Apply the skill's own
   field sanitization (strip `|`/CR/LF) to every field.
4. Render the row into the correct table's exact column set for
   `Task.roadmapTable`, writing the Kanban status **verbatim** into the
   Status cell (`EN DESARROLLO`, `QA`, ...) — `check_docs()` only validates
   heading presence, never cell values, so no round-trip mapping back to
   `TODO`/`DONE` is needed on write (ADR-002, `docs/Stack_Tecnologies.md`).
   If the assignee is `AI_AGENT`, emit `<displayName>@<ISO8601>` to match the
   skill's multi-agent Owner convention; humans are written bare.
5. Surgical single-row file edit: locate the row by ID within the correct
   table block, replace only that row's line(s) (or append if new); never
   regenerate other rows from DB state.
6. Before writing, re-hash the file against `Document.lastKnownHash`. If it
   drifted, run the read/reconcile path (steps 1-7 above) inline first, then
   re-check whether the specific row being written is still uncontested —
   if it collided with what just came in, raise
   `Conflict(kind=WRITE_BACK_COLLISION)` instead of blind-writing.
7. Write, rehash, update `Document`, insert `DocumentRevision(source=UI)`.
8. `AuditEvent(origin=UI)`.

## Conflicts (brief §26)

`Conflict` is a first-class entity with its own endpoints/UI route, not just
a log line. A conflict is never auto-resolved; an authorized user sees local
vs. external versions and chooses `KEEP_LOCAL`, `KEEP_EXTERNAL`, or
`MANUAL_EDIT` (or dismisses it). Resolving a conflict writes an `AuditEvent`
and, if the resolution changes stored data, may trigger a normal write-back.
