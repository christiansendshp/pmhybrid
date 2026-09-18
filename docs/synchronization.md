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
- **Webhook** (Roadmap GAP-29, brief §27/§29): `POST /webhooks/github`
  verifies GitHub's `X-Hub-Signature-256`, then syncs every `Project` whose
  `docsPath` names the pushed repository (see `docs/permissions.md`'s
  "GitHub webhook trust boundary" for the auth model) — a `push` no longer
  waits for the next scheduled tick. To wire one up: on the GitHub repo,
  Settings -> Webhooks -> Add webhook, Payload URL
  `https://<api-host>/webhooks/github`, **content type
  `application/json`** (not "urlencoded" — that puts the payload in a
  `payload` form field instead of the JSON body, which passes signature
  verification but silently never matches a project, logged as a warning),
  secret matching the API's `GITHUB_WEBHOOK_SECRET`, "Just the push event."
  The response only reports how many projects matched — it does not wait
  for their sync to finish (GitHub's own delivery timeout is short, and a
  `GIT_PROVIDER_TYPE=github` sync makes several sequential GitHub API
  calls); check that project's own sync-run history for the outcome, same
  as a scheduled or manual run.

All three paths call the same `SynchronizationService.runSync(projectId, trigger)`, with `trigger` recorded on the resulting `SyncRun` (`SCHEDULED`/`MANUAL`/`WEBHOOK`). The scheduled path can be switched off with `SYNC_SCHEDULER_ENABLED=false`; the e2e suite does, and triggers sync explicitly.

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
5. **Existing rows still present** — first compare the row's content hash
   with `Task.lastSyncedContentHash` (the last known external version of the
   row, set on creation-from-row, on every reconcile and after every
   write-back). **Equal → skip the row entirely**: the document did not
   change, so any difference from the task is a local edit that must stand.
   Otherwise diff mapped fields against the incoming row:
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
     - Empty intersection → apply everything.
   - UI edits reach this check because every task mutation audits exactly
     the fields it changed (`PATCH` included), never unchanged ones.
   - Always store the new `lastSyncedContentHash`, so an already-raised
     conflict is not raised again for the same document. Advance
     `lastSyncedAt` (the start of the UI-edit window) only when nothing was
     contested — otherwise a later document edit to a still-contested field
     would be applied silently.
   - Applied document fields are audited as
     `AuditEvent(operation=ROADMAP_FIELD_UPDATE, origin=ROADMAP)`; a row seen
     for the first time as `AuditEvent(operation=CREATE, origin=ROADMAP)`.
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
a `Summary` bullet and whichever of `Files`/`Verify`/`Follow-up`/`Pause`
follow it, in any subset — the old skill format always wrote all four except
`Pause`; the project-documentation skill v2 format has no `Follow-up` bullet
at all and only writes `Verify`/`Pause` when the entry's status calls for
them (`references/workflow.md`). Ingestion is
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
4. Render the row into the correct table's exact column set — resolved by
   locating the row wherever it already sits in the document (Active, Near
   term or Blocked), not by reading `Task.roadmapTable` directly, so this
   self-corrects even against a document a bug once left in a
   `Task.roadmapTable`-inconsistent state (Roadmap GAP-19). Only the headers
   that table actually has are touched — Near term has no `Owner` column, and
   Blocked has neither `Outcome`/`Acceptance check`/`Status`/`Depends on`,
   just `Owner` (the same assignee field as every other table,
   `docs/roadmap-parser.md` "Owner cell parsing") plus its own
   `Blocker`/`Needed decision or event`, which write-back never touches. The
   `Depends on` cell is rendered from the task's actual current
   `TaskDependency` set — each entry by its resolved target's `externalId`,
   or its `rawExternalRef` when unresolved, sorted for a stable cell content
   regardless of add order (Roadmap GAP-22; see "Dependencies" below for the
   dedicated add-triggered write-back). The Kanban status is written
   **verbatim** — `Task.status`'s own enum spelling
   (`EN_DESARROLLO`, `QA`, ...) — `check_docs()` only validates heading
   presence, never cell values, so no round-trip mapping back to `TODO`/`DONE`
   is needed on write (ADR-002, `docs/Stack_Tecnologies.md`). If the assignee
   is `AI_AGENT`, emit `<displayName>@<ISO8601>` to match the skill's
   multi-agent Owner convention; humans are written bare.
5. Surgical single-row file edit: locate the row by ID within the correct
   table block, replace only that row's line(s) (or append if new); never
   regenerate other rows from DB state.
6. Before writing, re-hash the file against `Document.lastKnownHash`. If it
   drifted, run the read/reconcile path (steps 1-7 above) inline first, then
   re-check whether the specific row being written is still uncontested —
   if it collided with what just came in, raise
   `Conflict(kind=WRITE_BACK_COLLISION)` instead of blind-writing.
7. Write, rehash, update `Document`, insert `DocumentRevision(source=UI)`.
   Re-parse the written row and store its hash as the task's
   `lastSyncedContentHash` (and `lastSyncedAt = now`): the row on disk is
   exactly what PM Hub rendered, so the next read must neither mistake it for
   a document-side change nor treat the task's earlier, now-written UI edits
   as still contested.
8. `AuditEvent(origin=UI)`.

### Field edits

A UI edit that changes a Roadmap-backed field — `title` (Outcome) or
`acceptanceCriteria` (Acceptance check) — rewrites just those cells of the
task's existing row, in whichever table holds it: a Near term row is never
moved into Active work, and a Blocked row (which has neither column) is left
alone. No Agentslog entry is appended: an in-place edit never makes a row
vanish, so step 3's ordering has nothing to protect. Priority, dates,
progress and hierarchy are not Roadmap columns and never touch the document.

- Document unchanged since PM Hub last saw it: the cells are written.
- Document drifted: a cell that no longer holds the pre-edit value was edited
  on the document side too, so it is left untouched (`WRITE_BACK_DEFERRED`
  when nothing else is written) and the next sync raises it once as
  `CONCURRENT_FIELD_EDIT` (step 5).
- The written row becomes the task's `lastSyncedContentHash` only if the row
  carried no unreconciled document change; otherwise the next sync still
  applies or contests the document's changes to the row's other cells.

### Dependencies

Adding a `TaskDependency` via `POST /projects/:id/tasks/:taskId/dependencies`
(Roadmap GAP-22) re-renders the task's whole current dependency set into its
row's `Depends on` cell, the same way every other lifecycle write-back does
(step 4 above) — not just the one dependency that was added, so the cell
always reflects the task's true current set even if it drifted for any
reason. No Agentslog entry, for the same reason as a field edit: an addition
never makes a row vanish. A task with no `externalId` yet, or whose row has
disappeared from the document, is left alone — its dependencies render on
its next real write-back.

There is still no removal write-back (no dependency-removal endpoint exists
at all yet), which is why `reconcileDependencies`'s read-side reconciliation
(step 5, "Disappeared rows" doesn't apply here — dependencies are reconciled
per-row regardless of hash match) stays additive-only: a reference missing
from a cell isn't reliable evidence it was intentionally removed rather than
just never written back.

### Removal

Removing a task (a soft delete, `docs/domain-model.md`) appends a `REMOVED`
Agentslog entry first and then takes the task's row out of whichever table
holds it; a table left without rows gets its `—` placeholder row back. Sync
skips a removed task entirely: a row that still names it neither recreates nor
updates it, and its missing row never raises
`ROADMAP_ROW_DISAPPEARED_NO_TERMINAL_LOG`.

## Conflicts (brief §26)

`Conflict` is a first-class entity with its own endpoints/UI route, not just
a log line. A conflict is never auto-resolved; an authorized user sees local
vs. external versions and chooses `KEEP_LOCAL`, `KEEP_EXTERNAL`, or
`MANUAL_EDIT` (or dismisses it). Resolving a conflict writes an `AuditEvent`
and, if the resolution changes stored data, may trigger a normal write-back.
