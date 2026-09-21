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
   Changed → insert a `DocumentRevision`, update `Document`. The rules document
   (`AGENTS_RULES`) is `docs/Agents.md` when there is one and otherwise the
   repository-root `AGENTS.md` the latest skill uses (Roadmap GAP-37c); the
   `documents/agents-rules/raw` view reads the same way, and a project with
   neither still gets its 404.
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
   conflicts-raised) and `entryErrors`. `PARTIAL` means the run finished but
   left something for a person: a conflict, or a Roadmap entry it could not
   read.

### Unreadable Roadmap entries and failed runs (Roadmap BUG-05)

- **One bad entry no longer fails the run.** Sync reads the Roadmap
  tolerantly (`docs/roadmap-parser.md`): the readable entries reconcile as
  usual; each unreadable one is listed in `summary.entryErrors` as
  `{ id, line, reason }` (capped at 50) and its task is left exactly as it
  was. Its id counts as _seen_, so the disappeared-row sweep (step 6) never
  completes it or raises a conflict for it — it did not disappear, it was not
  understood. A standing entry error is not a "change": it does not put every
  idle scheduled tick into the audit log.
- **Notifications are per change, not per run.** `ROADMAP_ENTRIES_INVALID`
  (payload `{ syncRunId, count, entries: [{ id, reason }] }`, at most 5
  entries) is sent only when the set of unreadable entries differs from the
  previous completed run's; a `SYNC_FAILED` identical to the previous run's
  is recorded in the history but not notified again. A run that fixes
  everything and one that later breaks again are different news.
- **A failed run says what to fix.** The persisted `summary.error` is one
  line, bounded to 300 characters, with no filesystem paths and no yaml code
  frame. A problem in the project's own documents or docs folder (an
  unterminated fence; a missing/unreadable folder) answers **422** with that
  message; any other failure keeps its own status (a DB outage stays a 500).
- **Scheduled retries back off.** Each consecutive `FAILED` run doubles the
  wait before the next scheduled attempt, up to 16 × the project's
  `syncIntervalMinutes`; a success or a manual run resets it.

### Owner and assignee (Roadmap GAP-35a)

The document's owner is resolved to a project member and becomes the task's
`assigneeActorId`; PM Hub's assignments are written back. Both directions
share one rule set, so they cannot disagree.

**Which field names the assignee.** In the per-entry format (schema §11) an
agent is `executor: AI` + `assigned_agent`, and that wins over `owner`, which
stays the _accountable_ person. Without an agent, `owner.name` is the
assignee. `owner.type` (`HUMAN`, `AI`/`AI_AGENT`) narrows the match to a
person or an agent; an `owner` with no type, and the old tables' Owner cell,
search both.

**Resolution.** By display name — case, surrounding and repeated whitespace
and Unicode composition ignored; accents are _not_ folded — among the
project's _active_ members with an active actor. Exactly one match resolves.
None, or more than one, leaves the assignee alone and the raw owner intact:
never an arbitrary pick, never an unassignment (a document that names nobody
does not unassign either). Resolution runs on every sync for every row, not
only when the row's content hash changed, because it also depends on who is a
member _now_: an owner that named nobody at the last sync is picked up once
that member is added.

**Applying it.** A task with no assignee gets the document's owner. A task
with a _different_ assignee keeps it if the document's owner is what it was at
the last sync (`rawOwner`) — the difference is an assignment made in PM Hub.
If the document's owner changed, it applies, unless the assignee was also
changed in PM Hub and the document does not reflect that (its owner at the
last sync is not the local assignee) and a person or API client changed it
since — then it is a `CONCURRENT_FIELD_EDIT` on `assigneeActorId`. Resolving
that conflict applies the chosen assignee like any reassignment: it needs
`task.assign` (`task.reassign.locked` once EN_DESARROLLO), the assignee must
be an active member, and it leaves a `TaskAssignment` row and an audit event.
A document-side assignment leaves a `TaskAssignment` row too, with the
assignee as `assignedBy` (the model requires one and the document has no
actor; a claim is the closest fit) and the reason "Assigned by the Roadmap
document".

**The EN_DESARROLLO lock.** It restricts who may reassign _in PM Hub_. It does
not stop the document: an agent claiming a task edits the document, usually
together with the status. A document-side owner change therefore applies to a
locked task; if the UI reassigned it too, that is the conflict above.

**Status is untouched.** Assigning from the document does not move a
`PENDIENTE` task to `ASIGNADA`; the document's own status wins.

**Write-back.** Every `assign()` in PM Hub (not only a locked reassignment)
rewrites who the entry names, as _one_ form: an agent sets `executor: AI` +
`assigned_agent` and leaves `owner` alone; a person sets `executor: HUMAN`,
`owner: {type: HUMAN, name}` and removes `assigned_agent` — a stale
`assigned_agent` would win on the next read and hand the task back. (The
schema has no field for a human performer other than `owner`, so assigning a
person replaces the accountable owner; that is the mapping the reader already
used.) The old tables get the Owner cell (`Name@timestamp` for an agent, the
bare name for a person), and Near term rows, which have no Owner column, are
left alone. No Agentslog entry is appended for an ordinary assignment. The
usual drift rule applies: if the document changed since PM Hub last saw it and
its owner is no longer the pre-edit assignee, the write is deferred
(`WRITE_BACK_DEFERRED`) and sync contests it. The write does not advance the
task's `lastSyncedAt`: assigning also moves `PENDIENTE` to `ASIGNADA`, which the
document does not record, so that status edit must stay unsynced.

### Unrecognized statuses, duplicate ids and blocked entries (Roadmap GAP-35b)

- **A status in none of the document's vocabularies** (a typo such as
  `IN_PROGES`, a private state such as `WIP`) is a mistake in the document, not
  a state to guess at. The task keeps the status it has, a task first seen
  with one is created `PENDIENTE`, and one `UNRECOGNIZED_STATUS` conflict
  (`localVersion {status}`, `externalVersion {statusRaw}`) asks a person to
  choose. It is checked on every row, not only a changed one, and raised once
  per distinct token per task — open or already answered — so an unrelated
  edit of the row does not ask again. Resolving: `MANUAL_EDIT` with a valid
  `status` (held to the permission of that move), `KEEP_LOCAL` or `DISMISSED`.
  `KEEP_EXTERNAL` is a 400: there is no document value to keep.
- **Valid states with no Kanban column are not errors.** The per-entry
  vocabulary is `IDEA BACKLOG READY IN_PROGRESS REVIEW TESTING BLOCKED DONE
CANCELLED DEFERRED`; `IDEA`, `REVIEW`, `CANCELLED` and `DEFERRED` stay
  unmapped and raise nothing (a new task with one is `PENDIENTE`, which is a
  product question — where such tasks belong on the board — not a sync one).
  In the old tables every token outside the mapping table is unrecognized.
- **A duplicated id imports none of its copies.** Two entries or rows with the
  same id (in either format, across tables too) are ambiguous — which one is
  the task? — so each copy is an entry error (`duplicate id, also defined at
line N`), the task is protected like any unreadable entry, and a write-back
  to that id is refused. Keeping "the last one" silently was the defect.
- **A blocked entry keeps its title**, and a Blocked row reconciles the
  fields it carries — title and owner — instead of only the blocker. The
  columns a blocked row lacks (status, acceptance check) are undefined on it,
  so they stay as last known, as before. Recording the owner matters: the
  assignee comparison of "Owner and assignee" needs it to advance, or the same
  contested assignee would be raised again on every sync.

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

### One unit, or nothing (Roadmap BUG-07a)

A task change and the write of its document are **one transaction** under the
project's advisory lock (`WriteBackService.inTransaction`): creating, editing,
assigning, moving, linking and removing a task each run their database change
and then the write-back inside it. Before, the change committed first and the
document was written in a second transaction, so a document that could not be
written returned a 500 with the change already saved, and retrying a creation
left a duplicate without an `externalId` that sync could not repair.

- Both happen or neither does. A document that cannot be read or written
  (`ENOENT`/`EACCES`/`EPERM`/`ENOTDIR`/`EISDIR`, or the target entry being
  unreadable) answers **422** `Not saved: …` — no server path in it — with
  nothing persisted, so a retry after fixing the folder creates exactly one task.
  Any other error keeps its own status.
- **The lock is taken before the change touches a row.** A write-back that held
  the lock and then waited for a row the change already held would deadlock;
  sync and every write-back take the lock first as well, so none can.
- The failure that remains is the reverse one: the document is written and the
  commit then fails. The document then holds a row PM Hub does not, which the
  next sync imports as a task — nothing is lost.
- Conflict resolution's write-back (BUG-06b) stays outside the resolution's
  transaction on purpose: a document that cannot be written must not undo a
  decision a person already made.

### Field edits

A UI edit that changes a Roadmap-backed field — `title` (Outcome) or
`acceptanceCriteria` (Acceptance check) — rewrites just those cells of the
task's existing row, in whichever table holds it: a Near term row is never
moved into Active work, and a Blocked row (which has neither column) is left
alone. No Agentslog entry is appended: an in-place edit never makes a row
vanish, so step 3's ordering has nothing to protect. Priority, dates,
progress and hierarchy are not Roadmap columns and never touch the document.
An ordinary assignment is a field edit of the same kind: it rewrites who the
entry names (see "Owner and assignee").

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

Sync keeps a task's dependencies equal to its row's `Depends on` cell in
both directions (Roadmap GAP-35e). Each `TaskDependency` records whether the
document has listed it (`inDocument`): set when sync sees it in a row, and by
the add-dependency write-back above, which writes the whole set into the cell.
A dependency the document listed and no longer lists is **removed** (audited as
`DEPENDENCY_REMOVE`, origin ROADMAP) — PM Hub has no endpoint to remove one
itself, so the document is the only place it can be dropped. Nothing else is
ever removed:

- a dependency the document never listed (added in PM Hub while the row sat in
  a table with no `Depends on` column, so there was nowhere to write it);
- anything on a Blocked row, where an absent cell says nothing;
- anything on an unreadable or duplicated entry, which is present but not
  understood (see "Unreadable Roadmap entries").

**Cycles are checked in memory** (Roadmap IMPROVEMENT-01a). A run loads the project's
dependency edges once and checks every link against that graph, which each link
and removal it makes keeps current; adding `A -> B` is refused when `B` can
already reach `A`. The check used to be one query per hop, so a chain of 150
entries took 15 s and 500 outlasted the 20 s transaction; a chain of 500 now
syncs in a few seconds. A dependency added in PM Hub is checked the same way,
against the edges read once.

**A loop is reported, not swallowed** (Roadmap BUG-06c). A dependency the document
declares that would close a cycle is left unlinked — in both places sync can
skip one: a link that is refused when it is first read, and a reference that was
left dangling until its target appeared — and each is listed in
`summary.skippedCycles` as `{ from, to }`, the row that declares it and the
reference it names. The run is `PARTIAL` while any exists, and the project header
lists them; fixing the document clears the list on the next run. No notification:
it is a standing fact of the document, like an unreadable entry that has not
changed.

The flag starts false for dependencies that existed before it did; the next
sync that sees them listed sets it, so removal applies from then on. A
document that loses a `depends_on` by accident (a bad merge) does remove the
dependency here; the audit event records what went, and the dependency is
re-linked by the next sync once the document lists it again.

### Removal

Removing a task (a soft delete, `docs/domain-model.md`) appends a `REMOVED`
Agentslog entry first and then takes the task's row out of whichever table
holds it; a table left without rows gets its `—` placeholder row back. Sync
skips a removed task entirely: a row that still names it neither recreates nor
updates it, and its missing row never raises
`ROADMAP_ROW_DISAPPEARED_NO_TERMINAL_LOG`.

### Documents in the latest skill's format (Roadmap GAP-37b)

The project-documentation skill's current tables (`docs/roadmap-parser.md`)
are validated by the skill's own `check`, which rejects what write-back used to
produce. A document is in that format when one of its tables has a `Pause
reason` column; only then does write-back change, so every other document is
written exactly as before.

- **A row is found wherever it is.** Active work, Near term, every Plan table
  and the Gaps table are searched in order for the ID, so editing a Plan or
  Gaps row edits it in place instead of appending a duplicate to Active work.
  `Outcome` is written to `Description` in a table that has no `Outcome`
  column. A new task's first row still goes to Active work.
- **Status is the skill's word.** Every Status cell of the file must be `TODO`,
  `IN_PROGRESS`, `PAUSE` or `DONE`, so `PENDIENTE`/`ASIGNADA` are written
  `TODO`, `EN_DESARROLLO`/`QA` `IN_PROGRESS`, `TERMINADA` `DONE`. The
  distinction the vocabulary cannot carry stays in PM Hub, and reading the
  coarse word back is not a change: a task in `QA` against a row that says
  `IN_PROGRESS` raises nothing and moves nothing (`rowStatusDiffers`). A
  verbatim board word in the document (`QA`) still counts as itself.
- **A paused row stays paused.** A lifecycle or status write leaves `PAUSE` and
  its `Pause reason` alone, as a `BLOCKED` entry is left alone in the YAML
  format; only completing the task writes `DONE` and clears the reason (the
  skill's `done` does the same).
- **The ledger holds only states the skill accepts** (`IN_PROGRESS`, `PAUSE`,
  `DONE`), a real `Verify` on `DONE`, one holder per task, and no ID that is in
  neither Roadmap.md nor Features.md:

  | Event                           | Entries                                                                                                |
  | ------------------------------- | ------------------------------------------------------------------------------------------------------ |
  | created                         | none — there is no such state, and the row carries it                                                  |
  | started (`EN_DESARROLLO`)       | `IN_PROGRESS` for the assignee (else the requester), `Verify: pending`; none if the task is held       |
  | completed (`TERMINADA`)         | `DONE`, `Verify: marked done in PM Hub by <name>; no automated check ran`                              |
  | held task given to someone else | `PAUSE` for the previous holder (`OTRO - reassigned in PM Hub to <name>`), then `IN_PROGRESS` for them |
  | removed                         | none — an entry for a row that is gone fails the skill's ID check; the audit trail records it          |

  Rejected: `CREATED`/`REASSIGNED`/`REMOVED` words (the check rejects them), and
  `DONE` for a removal (it would read as a completed capability). Known limit:
  removing a task that already has ledger entries leaves those entries naming an
  ID that is no longer in Roadmap.md, which the skill's `check` reports; PM Hub
  does not invent a Features.md entry to satisfy it.

Checked with the upstream skill's own script: a project made by its `init`,
its `claim`, and PM Hub's create, start, reassign, edit, complete and remove all
leave `check` passing (a `CREATED` entry, by contrast, fails it).

### Revision retention (Roadmap BUG-07c)

Every changed sync and every write-back stores a full copy of the document as a
`DocumentRevision`. `RevisionRetentionService` keeps the newest
`DOCUMENT_REVISION_RETENTION` of each document (default 200; `0` keeps all) and
deletes the rest, daily at 03:00 and outside the write-back lock. It counts
revisions rather than age, so a document that rarely changes never loses its
only history. Nothing holds a foreign key to a revision (the ledger's
`sourceDocumentRevisionId` is a plain string nothing reads back, and the
dashboard and the revision list ask only for the newest), so trimming breaks no
pointer; the one visible effect is a `404` for a deleted revision's id.

## Conflicts (brief §26)

`Conflict` is a first-class entity with its own endpoints/UI route, not just
a log line. Sync never _decides_ a conflict; an authorized user sees local
vs. external versions and chooses `KEEP_LOCAL`, `KEEP_EXTERNAL`, or
`MANUAL_EDIT` (or dismisses it). Resolving a conflict writes an `AuditEvent`
and, if the resolution changes stored data, may trigger a normal write-back.

### Resolving writes back (Roadmap BUG-06b)

A resolution that chose PM Hub's value writes it to the document — before, only
PostgreSQL changed, and the stored hash already said the two were in sync, so no
later sync repaired the document.

- `KEEP_LOCAL` writes the task's current value of each contested field;
  `MANUAL_EDIT` writes the person's. `KEEP_EXTERNAL` and `DISMISSED` write
  nothing, and neither does a field that already holds the same value.
- Fields with a place in the document: `title` (Outcome), `acceptanceCriteria`
  (Acceptance check), `status` (the Status cell verbatim, or the entry's
  mapped `status`; a BLOCKED entry keeps its own) and `assigneeActorId` (the
  owner, as in "Owner and assignee"). `rawOwner` is only the owner's raw text and
  is not written.
- **Only over what the conflict showed.** A field is written only if the document
  still holds the value the conflict recorded as its side. If the document moved
  on since, that is an edit the person has not seen: it is left
  (`WRITE_BACK_DEFERRED`) and the next sync raises it as a conflict of its own.
- Runs after the resolution has committed, under the project's advisory lock, and
  audited as `WRITE_BACK` with trigger `CONFLICT_RESOLUTION`. A document that
  cannot be written (folder gone) is logged; it does not fail or undo a
  resolution that already happened. The task's baseline (`lastSyncedContentHash`,
  `rawOwner`, `lastSyncedAt`) moves to the written row only if the row carried no
  other document change.
- A `ROADMAP_ROW_DISAPPEARED_NO_TERMINAL_LOG` conflict writes nothing: keeping
  the task does not re-add its row.

### Keeping the list honest (Roadmap BUG-06a)

Conflicts used to pile up (a missing row raised a new one on every run — 7 on
one task — and stayed open after the cause was gone). Now:

- **One open conflict per task and kind for a disappeared row.** While it is
  open the sweep does not ask again. When the row comes back, the conflict
  closes itself.
- **One open conflict per task and field.** A later document change to a
  field that is already contested updates the open conflict to the latest local
  and document values instead of adding another; only fields no open conflict
  covers get a new one, which is also the only case that counts as "raised" (and
  notified). When every contested field holds the same value on both sides
  again, the conflict closes itself.
- **Automatic closing is not a decision.** It is recorded as `DISMISSED` with no
  resolving actor and a `CONFLICT_RESOLVED` audit event marked `automatic`, with
  the reason; the run counts it in `summary.conflictsClosed`. No value is chosen
  or written anywhere.
- **A settled disappeared-row conflict stays settled.** Keeping the task or
  dismissing the conflict records that it has no row (`roadmapTable` null, no
  task permission needed — it is not an edit of the task's content), and the
  sweep skips a task without a table. Seeing its row again gives it its table
  back — whether or not the row's content changed, which the row-hash check
  would otherwise decide — so losing the row later is noticed again.
- **An empty `Roadmap.md` is refused, not read as mass deletion.** A drained
  Roadmap keeps its structure (headings, table skeletons); a file that is empty
  or only whitespace, in a project that has tasks from the document, fails the
  run as a fixable document problem (422) inside the transaction, so nothing of
  the run is kept. An empty file in a project with no such tasks yet is fine.
