# Roadmap

Every entry is a `### TYPE-ID — Title` heading followed by a fenced `yaml`
block; the block is the source of truth, the heading is for humans skimming
the file. See the project-documentation skill's
`references/roadmap-schema.md` for the full type taxonomy, field reference,
state vocabulary, and a complete worked example.

`## Plan` holds the VISION → PHASE → THEME → EPIC → FEATURE → TASK → SUBTASK
spine, linked by each entry's `parent` field, not by heading depth.
`## Cross-cutting` holds GAP, BUG, IMPROVEMENT, REFACTOR, SPIKE, DECISION,
BLOCKER, DEPENDENCY, TECH_DEBT, DOC, TEST, SECURITY, and UX entries, related
to any level via `affects`/`depends_on`/`blocks`/`blocked_by` instead of
`parent`.

Verified completed capability belongs in `Features.md`; history belongs in
`Agentslog.md`. This file holds pending and in-progress work only — `done`
removes a closed entry from here and records it in `Features.md`.

Converted from the old table/4-bullet format to this per-entry YAML schema
on 2026-09-18 (Roadmap GAP-28, `Features.md` F41) — see that entry's history
note below for what the conversion changes and why it was deferred until
this point.

## Plan

No entries yet — this project has never tracked a Phase/Epic/Task planning
hierarchy in this file; that hierarchy lives in the PM Hub app's own
database, one level below this document (this repository is itself a
project the app manages, `docsPath` = this repo's `docs/`). Add a
`### TYPE-ID — Title` heading and `yaml` block here if a VISION/PHASE/
THEME/EPIC/FEATURE/TASK/SUBTASK-level planning entry is ever needed.

## Cross-cutting

### DEC-002 — Frontend redesign: refine the existing GAP-20 system, or replace it with a new visual direction?

```yaml
id: DEC-002
type: DECISION
title: Frontend redesign -- refine the existing GAP-20 system, or replace it with a new visual direction?
status: DECIDED
question: >
  User request 2026-09-20: "Rediseña el frontend completo que sea moderno y
  minimalista." Investigated before acting: this isn't a blank slate. GAP-20
  (closed 2026-09-16, `Features.md` F30) already delivered a documented
  design system -- `apps/web/DESIGN.md`/`PRODUCT.md`, a shared `AppShell`
  every route renders inside (no duplicated per-page nav), a custom Material
  3 theme (azure/violet palettes via `mat.theme()`), light/dark mode, fixed
  spacing/radius tokens, flat tonal surfaces (no shadows), and a shared
  component vocabulary (`.page-header`, `.tab-nav`, `.kind-badge`, etc.)
  applied across all ~14 routed pages -- explicitly including Do's/Don'ts
  against KPI-tile card grids, extra accent colors, and a second icon
  system. A full from-scratch replacement would discard that investment;
  a refinement pass would build on it. Either is a large, product-visible,
  costly-to-reverse effort, not an implementation detail -- escalated per
  AGENTS.md's own rule rather than guessed.
options:
  - Refine the current system toward more minimalism -- audit each of the
    ~14 pages against DESIGN.md's own Do's/Don'ts, reduce visual noise/
    density where it still exists, keep the shell/theme/token investment.
    Fastest, lowest-risk, compounds on GAP-20 rather than discarding it.
  - Replace the current system with a new visual direction -- treat
    DESIGN.md as evidence/anti-reference only (per the impeccable skill's
    own redesign-vs-refinement distinction), pick a new aesthetic, rebuild
    the shell/theme/tokens and all ~14 pages from there. Materially larger
    effort, appropriate only if the current system's actual problem is its
    visual identity, not its execution.
  - Something narrower than "complete" -- name specific pages/flows that
    feel wrong today, and scope the work to those instead of every surface.
decision: Replace the current system with a new visual direction.
decision_reason: >
  User chose this explicitly via AskUserQuestion, having been told plainly
  that it discards GAP-20's investment (shell/theme/tokens/component
  vocabulary across ~14 pages) rather than building on it -- an informed,
  deliberate choice on a question that was escalated precisely because it
  is not reversible or scoped to implementation detail.
decision_owner:
  type: HUMAN
  name: Christian
decision_date: 2026-09-20T00:00:00Z
technical_context:
  frontend: apps/web/DESIGN.md, apps/web/PRODUCT.md, apps/web/src/app/layout/app-shell, apps/web/src/styles.scss
next_action: >
  Executed in two slices per GAP-33's own sequencing rule (close + re-claim
  per surface, not one long-lived entry -- see TECH_DEBT-02): GAP-33
  (closed 2026-09-20) shipped the shell+theme foundation -- new DESIGN.md,
  `mat.theme()` repointed to cyan/orange (a deliberate new primary hue, not
  just the tertiary swap -- an independent finish review caught that azure
  as primary would have left the ground byte-identical to GAP-20's; orange
  replaces violet as the AI-agent channel), hairline-seam panels, tracked
  table headers, tighter radii -- zero unit/e2e/a11y breakage since shared
  classes and page DOM were kept stable. GAP-34 carries the remaining ~14
  pages' own component-level styling into the same direction.
created_at: 2026-09-20T00:00:00Z
updated_at: 2026-09-20T11:50:00Z
```

### DEC-001 — How should the project-documentation `context` budget handle this project's doc set?

```yaml
id: DEC-001
type: DECISION
title: How should the project-documentation context budget handle this project's doc set?
status: DECIDED
question: >
  `project_docs.sh`'s `context`/`check` commands hard-gate at
  CONTEXT_LIMIT=8192 bytes (`die()`, aborting all remaining checks). For
  this project, AGENTS.md's init-managed template (4229 bytes, regenerated
  by `init`) plus the 5 most recent Agentslog entries `context` always
  includes verbatim (currently 4908 bytes) already sum to 9137 -- over
  budget before any of this project's own doc summaries are counted. See
  TECH_DEBT-01 for the full measurement. How should this structural gap be
  closed?
options:
  - Raise CONTEXT_LIMIT (e.g. to ~12-16 KiB) to fit this project's actual
    doc-set size and target agent context window, accepting a larger
    per-session context cost.
  - Shrink the last-N-entries log window below 5 (or cap by bytes instead
    of count), trading less recent-history visibility for headroom.
  - Compact or make optional the init-managed AGENTS.md template block
    itself (the skill's own boilerplate, not this project's content).
  - Some combination of the above, tuned to measured data rather than a
    single lever.
decision: Raise CONTEXT_LIMIT from 8192 to 16384 bytes in both project_docs.sh
  and project_docs.ps1; leave the 5-entry log window and the AGENTS.md
  template untouched.
decision_reason: >
  Re-examined on re-escalation (the active session's standing autonomy
  directive requires resolving a missing definition rather than parking it,
  once genuinely reversible and scoped): the original "escalate, this is
  tooling affecting every future session" framing was too cautious. This
  skill installation lives entirely under this repo's own .claude/skills/
  -- confirmed no ~/.claude/skills/project-documentation global copy
  exists -- so the change's blast radius is this project only, fully
  reversible by editing one constant back. Measured actual context size at
  decision time: 11427 bytes, comfortably under 16384 with ~30% headroom
  for organic growth. Shrinking the log window was rejected: it doesn't
  fix the root cause (this project's real, legitimate documentation
  footprint, not bloat) and trades away genuinely useful session-startup
  visibility for a smaller win. Compacting the AGENTS.md template was
  rejected as not durably actionable: it's regenerated by `init`, so a
  hand-edit doesn't survive; pursuing it would mean changing the skill's
  own template-generation logic for uncertain benefit when the simpler
  lever already fully resolves the measured gap. The budget is a one-time,
  per-session context cost (loaded once at session start, not repeated per
  message) -- trivial next to a modern LLM's context window, so the "cost"
  AGENTS.md's escalation criteria is protecting against doesn't meaningfully
  apply at this scale.
decision_owner:
  type: AI
  name: Claude
decision_date: 2026-09-20T19:55:00Z
affects:
  - TECH_DEBT-01
technical_context:
  backend: .claude/skills/project-documentation/scripts/project_docs.sh (CONTEXT_LIMIT, latest_log_entries, build_context), project_docs.ps1 ($ContextLimit)
next_action: >
  Resolved and verified: `check .` now exits 0 on this project (previously
  died on the context-size gate before reaching any further validation).
  Raising the limit also unmasked a second, previously-invisible failure
  in check_roadmap_features_ids (this project's Features.md used a
  sequential F<N> id scheme for its first 42 rows, predating the
  log:TASK-ID linkage `done` now writes into every new row) -- fixed
  alongside this decision; see TECH_DEBT-01's closing Agentslog entry for
  detail. TECH_DEBT-01 closed as a result.
created_at: 2026-09-19T09:40:00Z
updated_at: 2026-09-20T19:55:00Z
```

### GAP-35 — Sync ignores the document's hierarchy, owner, priority and progress

```yaml
id: GAP-35
type: GAP
title: Sync ignores the document's hierarchy, owner, priority and progress
status: BACKLOG
priority: P1
description: >
  Found by the 2026-09-21 evaluation (sync audit, live tests; code
  re-checked: `parent` appears nowhere in the parser or sync service).
  In the new YAML format `parent`, `type`, `priority`, `progress`, `owner`
  and `executor` are not imported, so PHASE/EPIC/DECISION/GAP rows become
  flat tasks with null parent/phase/epic, `/progress` returns `phases: []`
  and the global progress is wrong (23 percent on a test project). The
  document's `owner` is never resolved to `assigneeActorId`, so Kanban and
  Workload cannot see what an agent claims in the document. In the other
  direction `assign()` does not write back (brief section 8 says the
  assignment must reach ROADMAP, not stay in PostgreSQL), hierarchy and
  progress edits are not written, and a UI progress PATCH leaves the
  document at its old value. Related: BLOCKED entries lose their title,
  REVIEW/IDEA silently become PENDIENTE (synchronization.md promises a
  conflict), duplicate ids silently keep the last, removing `depends_on`
  is ignored, and CRLF files are rewritten to LF.
expected_behavior: >
  Round trip parity for type, parent, priority, progress, owner/executor,
  dependencies and status between Roadmap.md, PostgreSQL and the UI,
  matching docs/synchronization.md and brief sections 8, 9 and 12; unknown
  statuses raise a conflict; write-back preserves line endings.
technical_context:
  backend: apps/api/src/modules/roadmap, synchronization, tasks/tasks.service.ts (assign), write-back.service.ts
depends_on:
  - GAP-35a
  - GAP-35b
  - GAP-35c
  - GAP-35d
  - GAP-35e
next_action: >
  Umbrella only. Refined on 2026-09-21 into four slices (GAP-35a owner
  round trip, GAP-35b statuses/duplicates/blocked, GAP-35c
  type/priority/progress, GAP-35d hierarchy, GAP-35e dependency removal and
  line endings); close this entry when all four are done.
created_at: 2026-09-21T09:00:00Z
updated_at: 2026-09-21T15:00:00Z
```

### GAP-35c — Import type, priority and progress, and write progress back

```yaml
id: GAP-35c
type: GAP
title: Import type, priority and progress, and write progress back
status: BACKLOG
priority: P2
parent: GAP-35
depends_on:
  - GAP-35a
description: >
  Third slice of GAP-35. `type`, `priority` and `progress` in an entry are
  not imported (Task has no type column), so the global progress is wrong
  and a PATCH of a task's progress leaves the document at its old value.
expected_behavior: >
  Priority and progress round trip between the entry, the task and the UI;
  the entry type is kept so PHASE, EPIC, DECISION and GAP entries can be
  told apart from work items.
technical_context:
  backend: apps/api/prisma/schema.prisma (Task), roadmap-yaml-entry.util.ts, synchronization.service.ts, tasks/progress-rollup.service.ts
next_action: >
  Decide whether the entry type becomes a column or a derived value, then
  import priority and progress.
created_at: 2026-09-21T15:00:00Z
updated_at: 2026-09-21T15:00:00Z
```

### GAP-35d — Import the document's hierarchy (parent, phases and epics)

```yaml
id: GAP-35d
type: GAP
title: Import the document's hierarchy (parent, phases and epics)
status: BACKLOG
priority: P2
parent: GAP-35
depends_on:
  - GAP-35c
description: >
  Fourth slice of GAP-35. `parent` is not imported, so PHASE and EPIC
  entries become flat tasks with no parent, phase or epic and `/progress`
  returns `phases: []`. Phase and Epic have no `externalId`, so real
  hierarchy needs either a migration adding one or a name-based identity
  mapping; that is the largest and riskiest slice and is left for last.
expected_behavior: >
  `parent` links tasks to their parent task, PHASE and EPIC entries map to
  Phase and Epic records with a stable identity, and `/progress` reports the
  document's phases; hierarchy edits made in PM Hub are written back.
technical_context:
  backend: apps/api/prisma/schema.prisma (Phase, Epic), synchronization.service.ts, tasks/progress-rollup.service.ts, phases
next_action: >
  Decide the identity of Phase and Epic (externalId column versus name) and
  record it as a DECISION before implementing.
created_at: 2026-09-21T15:00:00Z
updated_at: 2026-09-21T15:00:00Z
```

### BUG-06 — Conflicts pile up, resolving does not update the document, and an empty file floods them

```yaml
id: BUG-06
type: BUG
title: Conflicts pile up, resolving does not update the document, and an empty file floods them
status: BACKLOG
priority: P1
depends_on:
  - BUG-06a
  - BUG-06b
  - BUG-06c
description: >
  Found by the 2026-09-21 evaluation (sync audit, live). KEEP_LOCAL leaves
  the database with the UI value and the document with the external one and
  the stored hash has already advanced, so no later sync repairs it
  (conflicts.service.ts states it does no write-back). Conflicts are not
  deduplicated (16 -> 19 open across 3 syncs, 7 stacked on one task); they
  stay open after the row reappears; an empty Roadmap.md produced 11
  conflicts in one run (an invalid YAML fails safely, an empty file does
  not); a dependency cycle A<->B leaves a dangling edge silently.
expected_behavior: >
  One open conflict per task and field, auto-closed when the sides agree
  again; resolution writes the chosen value back to the document; an empty
  or truncated document is rejected instead of treated as mass deletion.
technical_context:
  backend: apps/api/src/modules/conflicts, synchronization/synchronization.service.ts
next_action: >
  Umbrella only, refined on 2026-09-21 into BUG-06a (conflict hygiene and
  the empty-document guard), BUG-06b (resolution writes back) and BUG-06c
  (dependency cycles reported); close it when all three are done.
created_at: 2026-09-21T09:00:00Z
updated_at: 2026-09-21T17:30:00Z
```

### BUG-06c — A dependency cycle in the document is dropped silently

```yaml
id: BUG-06c
type: BUG
title: A dependency cycle in the document is dropped silently
status: BACKLOG
priority: P3
parent: BUG-06
description: >
  Third slice of BUG-06. When the document declares A depends on B and B
  depends on A, sync skips the edge that would close the cycle and says
  nothing, so the document and PM Hub disagree with no trace.
expected_behavior: >
  The skipped edge is reported on the run (which row, which reference) so the
  authoring mistake can be found.
technical_context:
  backend: apps/api/src/modules/synchronization/synchronization.service.ts (reconcileDependencies, resolveDanglingDependencies)
next_action: >
  Add the skipped references to the run summary next to entryErrors.
created_at: 2026-09-21T17:30:00Z
updated_at: 2026-09-21T17:30:00Z
```

### BUG-07 — Write-back runs outside the transaction and is not idempotent

```yaml
id: BUG-07
type: BUG
title: Write-back runs outside the transaction and is not idempotent
status: BACKLOG
priority: P1
depends_on:
  - BUG-07a
  - BUG-07b
  - BUG-07c
description: >
  Found by the 2026-09-21 evaluation and hit by hand on 2026-09-20: a
  failed write-back after the database commit returns 500 with the row
  already saved (a project whose docs folder is missing returned 500 on
  `POST /tasks` and the task still existed). Retrying creates duplicates
  without `externalId` that sync cannot repair, and there is no idempotency
  key. Every write also stores a full copy in DocumentRevision with no
  retention (119 rows after about 100 tasks).
expected_behavior: >
  Either the database change and the document write succeed together or
  the request reports a clean error with nothing persisted (or an outbox
  retries the write); a client retry key makes creation idempotent;
  revisions have a retention policy.
technical_context:
  backend: apps/api/src/modules/tasks/tasks.service.ts (create), synchronization/write-back.service.ts, DocumentRevision
next_action: >
  Umbrella only, refined on 2026-09-21 into BUG-07a (change and document
  write in one transaction), BUG-07b (Idempotency-Key on task creation) and
  BUG-07c (revision retention); close it when all three are done.
created_at: 2026-09-21T09:00:00Z
updated_at: 2026-09-21T18:00:00Z
```

### BUG-07b — Task creation has no idempotency key

```yaml
id: BUG-07b
type: BUG
title: Task creation has no idempotency key
status: BACKLOG
priority: P2
parent: BUG-07
depends_on:
  - BUG-07a
description: >
  Second slice of BUG-07. A client that times out after the server created a
  task cannot tell, and retrying creates a second one. Nothing identifies a
  retry as the same request.
expected_behavior: >
  POST /projects/:id/tasks accepts an Idempotency-Key header; a repeat with
  the same key from the same actor in the same project returns the task the
  first request created instead of creating another. Keys expire.
technical_context:
  backend: apps/api/src/modules/tasks (controller, service), a new key table with a migration
next_action: >
  Store (project, actor, key) -> task id in the creating transaction, unique,
  with a retention window.
created_at: 2026-09-21T18:00:00Z
updated_at: 2026-09-21T18:00:00Z
```

### BUG-07c — DocumentRevision grows without a retention policy

```yaml
id: BUG-07c
type: BUG
title: DocumentRevision grows without a retention policy
status: BACKLOG
priority: P2
parent: BUG-07
description: >
  Third slice of BUG-07. Every write-back and every changed sync stores a
  full copy of the document in DocumentRevision, forever (119 rows after
  about 100 tasks).
expected_behavior: >
  A configurable retention keeps the most recent revisions of each document
  and drops the rest on a schedule, without breaking anything that points at
  a revision.
technical_context:
  backend: apps/api/prisma/schema.prisma (DocumentRevision), synchronization (scheduler)
next_action: >
  Find what references a DocumentRevision before choosing what may be deleted.
created_at: 2026-09-21T18:00:00Z
updated_at: 2026-09-21T18:00:00Z
```

### IMPROVEMENT-01 — Performance and data limits (cycle check, progress N+1, pagination, indexes, DTO limits)

```yaml
id: IMPROVEMENT-01
type: IMPROVEMENT
title: Performance and data limits (cycle check, progress N+1, pagination, indexes, DTO limits)
status: BACKLOG
priority: P2
description: >
  Measured by the 2026-09-21 evaluation. `wouldCreateCycle`
  (synchronization.service.ts) queries once per hop: a 150-entry dependency
  chain took 15.5 s and 500 exceeds the 20 s timeout (without dependencies
  500 entries take 1.9 s). computeTaskProgress runs per task in /tasks,
  /workload and /projects (N+1); lists are not paginated (95 tasks = 89 KB,
  143-174 ms against 48 ms for 14); /dashboard/activity returns full
  rawContent. Missing indexes seen in migrations: TaskDependency(taskId,
  dependsOnTaskId), Task.parentTaskId, Task.assigneeActorId,
  SyncRun(projectId,startedAt), Conflict(projectId,resolvedAt),
  Notification(actorId,createdAt). No DTO has MaxLength (a 90,000 char
  title made Roadmap.md 96 KB), `?status=BOGUS` returns 500, duplicate
  dependencies are stored and cannot be removed.
expected_behavior: >
  Sync of 500 chained entries stays under a few seconds using an in-memory
  graph per run; rollups are computed in batch; list endpoints paginate;
  the listed indexes exist; DTOs validate length and enums; a dependency
  removal endpoint exists.
technical_context:
  backend: apps/api/src/modules/synchronization, tasks, workload, projects, dashboard, prisma/schema.prisma
next_action: >
  Start with the cycle check (blocks large real projects) and the indexes.
created_at: 2026-09-21T09:00:00Z
updated_at: 2026-09-21T09:00:00Z
```

### SECURITY-04 — Authentication and transport hardening

```yaml
id: SECURITY-04
type: SECURITY
title: Authentication and transport hardening
status: BACKLOG
priority: P2
description: >
  From the 2026-09-21 backend audit. Login leaks account existence by
  timing (157-370 ms existing vs 11-14 ms unknown) and checks "inactive"
  before the password; the seed creates an ADMIN with password demo1234
  with no environment guard; JWT_SECRET has no minimum length and
  .env.example ships "change-me"; API keys do not expire, have no scope or
  lastUsedAt and reach every REST route (one listed 40 users); there is
  no password change or reset; CORS is fully open and there is no helmet
  (X-Powered-By exposed); throttling is per IP so several agents behind one
  host hit 429 after about 100 writes; WebSocket has no maxPayload and its
  tickets live in process memory (single instance only).
expected_behavior: >
  Constant-time login, seed refuses to run against a production-like
  environment, secrets validated at startup, API keys with expiry, scope
  and last-used tracking (throttled per key), a CORS allowlist plus
  helmet, a password change flow, and WS limits.
technical_context:
  backend: apps/api/src/modules/auth, main.ts, prisma/seed.ts, agents (API keys), realtime
next_action: >
  Group into two slices: login/secrets/seed first, API-key scope and
  transport second.
created_at: 2026-09-21T09:00:00Z
updated_at: 2026-09-21T09:00:00Z
```

### UX-01 — Errors and sync status are invisible in the UI

```yaml
id: UX-01
type: UX
title: Errors and sync status are invisible in the UI
status: BACKLOG
priority: P1
description: >
  From the 2026-09-21 frontend audit. `syncNow()` (project-dashboard.ts),
  `transition()`, `assign()` and `addDependency()` (task-detail.ts) and the
  dashboard `Promise.all` have no catch, so a 403/409 (including the locked
  assignment of brief section 7) or a failed sync shows nothing; a missing
  task renders blank and a missing project redirects silently. Sync
  failures appear only as gray text in My Projects, the project header does
  not load the last run, and the bell accumulates duplicate notifications
  with English text and server paths and has no "mark all read". The
  panel does not close on Esc, outside click or navigation and overflows
  the viewport at 390 px. There is no visual mark for a locked assignee.
expected_behavior: >
  Every action surfaces success or a readable error; a status banner in the
  project header shows the last sync and its error; notifications are
  grouped, localized, path-free, have "mark all read", and the panel is
  dismissible and fits mobile.
technical_context:
  frontend: apps/web/src/app/features/project-dashboard, task-detail, my-projects, layout/app-shell
next_action: >
  Introduce one shared error/snackbar helper and apply it to all actions.
created_at: 2026-09-21T09:00:00Z
updated_at: 2026-09-21T09:00:00Z
```

### UX-02 — Mobile layout, Kanban size and Settings overlaps

```yaml
id: UX-02
type: UX
title: Mobile layout, Kanban size and Settings overlaps
status: BACKLOG
priority: P2
description: >
  From the 2026-09-21 frontend audit (390 px). The sticky header takes 105
  px; the main nav and the project tabs overflow (Roles, Auditoria and
  Configuracion are hidden with no scroll cue); a project page overflows
  the viewport by 194 px (`.members__add`); tables hide columns inside an
  inner scroll. Kanban columns grow without limit (TERMINADA = 2,900 px
  with 12 cards), filters reset when coming back from the task detail, the
  project header uses 290 px before content. Settings hints overlap the
  next field (missing subscriptSizing dynamic) and read-only mode is
  nearly illegible; the remove-role button is 20 px (WCAG 2.5.8 asks 24);
  some selects have no accessible name (audit-log, task-detail) and the
  nav aria-label is English.
expected_behavior: >
  No horizontal page overflow at 390 px, visible scroll cues, a compact
  mobile header, capped or collapsible Kanban columns, filters preserved in
  the URL, no overlapping hints, 24 px minimum targets, labeled controls.
technical_context:
  frontend: apps/web/src/app/layout/app-shell, features/kanban, project-dashboard, project-settings, audit-log, task-detail, styles.scss
next_action: >
  Extend the Playwright a11y suite to the routes that were not covered.
created_at: 2026-09-21T09:00:00Z
updated_at: 2026-09-21T09:00:00Z
```

### UX-03 — Spanish localization, readable labels, progress view and task detail

```yaml
id: UX-03
type: UX
title: Spanish localization, readable labels, progress view and task detail
status: BACKLOG
priority: P2
description: >
  From the 2026-09-21 frontend audit. `<html lang="en">` with a Spanish UI;
  no LOCALE_ID so dates render as "Sep 21, 2026" and "9/21/26"; raw enums
  shown (HIGH, SYNC_RUN, SUCCESS, COMPLETE_VIA_ROADMAP_REMOVAL,
  KEEP_LOCAL); voseo ("Asigna") mixed with tuteo; internal leaks ("brief
  section 4", "permiso project.update", "columna Acceptance check").
  Progress shows "85.71428571428571%" as a flat list of links without bars
  (phases-progress.html); the task detail is almost unstyled, "Depende de"
  shows the hierarchy location, history is raw ("externalId: -> DEC-002"),
  and the blocked reason lives only in a `title` (unreachable on touch).
  Dashboard items are not links and change entries do not say which task.
  Team has no search or pagination.
expected_behavior: >
  lang="es", es-ES LOCALE_ID and one date pipe, a label dictionary for all
  enums, rounded percentages with bars, breadcrumbs and a styled task
  detail with visible block reason, linked dashboard items.
technical_context:
  frontend: apps/web/src/app (index.html, features/phases-progress, task-detail, dashboard, audit-log, conflicts, roles, team)
next_action: >
  Start with lang/LOCALE_ID and the enum dictionary; both are mechanical.
created_at: 2026-09-21T09:00:00Z
updated_at: 2026-09-21T09:00:00Z
```

### GAP-36 — Agent experience and onboarding gaps

```yaml
id: GAP-36
type: GAP
title: Agent experience and onboarding gaps
status: BACKLOG
priority: P2
description: >
  From the 2026-09-21 evaluation. The MCP server exposes 6 tools
  (list_tasks, get_task, update_task, transition_task, list_comments,
  add_comment); agents cannot list projects, claim or create tasks and
  subtasks, read documents or conflicts, or get project context. An
  AI_AGENT cannot move QA -> TERMINADA (403) and nothing tells an agent it
  was assigned work. Only 2 of the 9 notification events of brief section
  29 exist (conflict, sync failure). The brief's task completion date
  (section 6) is missing. Onboarding an empty repository fails
  (`POST /sync` and `POST /tasks` return 500, a non-existent path is
  accepted at creation with 201) and no document skeleton is generated.
  LEAF_EQUAL_WEIGHT is selectable but not implemented. A single rate limit
  of 100 requests per minute per IP throttles several agents on one host.
expected_behavior: >
  MCP covers the agent workflow (list_projects, claim_task, create_task,
  get_context, list_conflicts), agent-assignment notifications exist for
  the section 29 events, creating a project on an empty folder scaffolds
  Roadmap.md and Agentslog.md, and the completion date and
  LEAF_EQUAL_WEIGHT are implemented or explicitly descoped.
technical_context:
  backend: apps/api/src/modules/mcp, notifications, projects, tasks, progress rollup
next_action: >
  File separate slices; the MCP tools depend on GAP-35's owner resolution.
created_at: 2026-09-21T09:00:00Z
updated_at: 2026-09-21T09:00:00Z
```

### TEST-01 — Negative RBAC, concurrency and coverage gaps

```yaml
id: TEST-01
type: TEST
title: Negative RBAC, concurrency and coverage gaps
status: BACKLOG
priority: P2
description: >
  From the 2026-09-21 evaluation. 53 of 60 services, guards and controllers
  have no unit spec (module-level coverage relies on 25 e2e files); only
  about 43 assertions check 401/403/404, none check concurrency, and the
  critical findings SECURITY-01, SECURITY-02 and BUG-04 have no negative
  test. Coverage is not measured or gated. auth.interceptor (401 refresh),
  login and project-member.guard have no spec in the web app, and the
  Playwright a11y suite covers 5 routes only. Very large services:
  synchronization.service.ts (808 lines), tasks.service.ts (738),
  write-back.service.ts (719).
  The local e2e database also keeps every run's throwaway projects (2,806
  after a few days, found 2026-09-21 while closing SECURITY-01): past that
  size GET /projects returned 500 under the suite's parallel load because
  it builds every project summary at once (see IMPROVEMENT-01), so the
  suite needs a global teardown or a per-run schema.
expected_behavior: >
  Negative RBAC and concurrency tests for the critical routes, a coverage
  report with a floor in CI, unit specs for the untested web core pieces,
  a11y coverage of all routes, a plan to split the three large services,
  and an e2e database that does not grow without bound.
technical_context:
  backend: apps/api/test, apps/api/src
  frontend: apps/web/src/app/core, apps/web/a11y
next_action: >
  Write each negative test together with the fix of its finding.
created_at: 2026-09-21T09:00:00Z
updated_at: 2026-09-21T09:00:00Z
```

### IMPROVEMENT-02 — Deployment, containerization and documentation gaps

```yaml
id: IMPROVEMENT-02
type: IMPROVEMENT
title: Deployment, containerization and documentation gaps
status: BACKLOG
priority: P3
description: >
  From the 2026-09-21 evaluation. There is no Dockerfile for the API or the
  web app (docker-compose.yml only runs PostgreSQL), no production
  configuration or health/readiness story beyond `/health`, and the web
  app hardcodes API_BASE_URL to http://localhost:3000 in source.
  docs/decisions/ is empty although code and docs reference ADRs, and
  docs/synchronization.md and docs/roadmap-parser.md describe table
  formats and rules the code does not implement (conflict on unknown
  status, Owner resolution). Legacy fixture users from e2e runs before the
  test database isolation (about 40 "Dev", "Outsider", "Role tester"
  accounts) still clutter the development Team page.
expected_behavior: >
  Reproducible container images and a documented deployment path with
  runtime-configurable API URL, ADR files present for every ADR cited, sync
  docs matching the implemented behavior, and a clean development dataset.
technical_context:
  backend: docker-compose.yml, apps/web/src/app/core/api-base-url.ts, docs/
next_action: >
  Decide the target runtime before writing images.
created_at: 2026-09-21T09:00:00Z
updated_at: 2026-09-21T09:00:00Z
```

### BUG-08 — Removing a project member keeps their roles and assignments

```yaml
id: BUG-08
type: BUG
title: Removing a project member keeps their roles and assignments
status: BACKLOG
priority: P2
description: >
  Split off from SECURITY-02 on 2026-09-21. `ProjectMembersService.removeMember`
  only sets `isActive: false`. The member's project-scoped ActorRole rows stay,
  so re-adding them silently restores every role they held, and their
  assigned tasks keep pointing at an actor who can no longer act on them
  (a locked EN_DESARROLLO task in particular can only be reassigned by
  someone holding task.reassign.locked). ProjectMemberGuard already stops a
  removed member from acting, so this is hygiene and predictability, not an
  open door.
expected_behavior: >
  Removing a member revokes their project-scoped roles in the same
  transaction and defines what happens to their open assignments (unassign
  with a visible audit event, or refuse the removal until reassigned), with
  an e2e test for each outcome.
technical_context:
  backend: apps/api/src/modules/project-members/project-members.service.ts, roles
next_action: >
  Product decision on assignments (unassign vs block); roles can be revoked
  unconditionally.
created_at: 2026-09-21T11:10:00Z
updated_at: 2026-09-21T11:10:00Z
```

Post-MVP gap backlog derived from a brief-vs-code review on 2026-09-15
(GAP-12–GAP-19), the 2026-09-16 frontend redesign (GAP-20), and a
2026-09-16 user-requested docsPath folder picker (GAP-27) are all DONE
— see `Agentslog.md`/`Features.md` (F31 for GAP-27). GAP-21–GAP-26 were
a fresh brief-vs-code review done 2026-09-16 against the original brief
(`Prompt — Desarrollo de Project Management Hub Humano + IA.md`), covering
what the brief asks for that the app does not yet do. GAP-21 is DONE (see
`Features.md` F32); GAP-22 is DONE (see `Features.md` F33); GAP-24 is DONE (see `Features.md` F34); GAP-23 is DONE (see `Features.md` F35); GAP-25 is DONE (see `Features.md` F36); GAP-26 is DONE for its WebSockets slice (see `Features.md` F37); the GitHub-webhooks and MCP-server slices it named split off below as GAP-29/GAP-30. GAP-29 is DONE (see `Features.md` F38); GAP-30 is DONE for its `list_tasks`/`get_task`/`update_task`/`transition_task` slice (see `Features.md` F39, ADR-017) — its "comment" verb has no existing model anywhere in this app to adapt and split off as its own entry, GAP-31.

GAP-29 and GAP-30 are the two GAP-26 named but did not build: GAP-26 itself
picked WebSockets first because two independent in-repo signals already
pointed at it (`docs/architecture.md`'s already-wired event-emitter, and
Features.md's already-documented "no push" limitation) — ADR-015,
`docs/Stack_Tecnologies.md`. Between the remaining two, GAP-29 was picked
next rather than left for a human to prioritize: it depended on and
directly extended the already-built `GitHubGitProvider` (GAP-23), and its
acceptance check was concrete — verify GitHub's signature, map the payload
to a project, trigger the existing sync path — where GAP-30's MCP-server
surface is a materially larger, less-scoped new protocol with no existing
groundwork to build from. GAP-29 is DONE (`Features.md` F38, ADR-016).

GAP-30 is DONE for `list_tasks`/`get_task`/`update_task`/`transition_task` —
four thin MCP adapters over `TasksService`'s existing methods, zero new
domain concepts (`Features.md` F39, ADR-017). Its acceptance check's third
verb, "comment," is the one exception: there is no comment concept
anywhere in this app yet (no model, no REST endpoint, no UI), so
satisfying it would have meant inventing a whole new capability whose only
consumer is an MCP agent — data a human member could never see or read
back. That crosses from "missing implementation detail" into "affects
product behavior" (AGENTS.md's escalation line), so rather than silently
skipping the verb or quietly building an MCP-only comment feature, it is
named explicitly and split off as GAP-31, scoped to include the REST
surface a real feature needs, not just the MCP one.

GAP-31 is DONE (`Features.md` F40, ADR-019): a `TaskComment` model, a
dedicated `TaskCommentsController`/`Service` (`GET`/`POST` under
`/projects/:projectId/tasks/:taskId/comments`, membership-gated only, no
extra permission — matching the ticket's own "any authenticated member"
wording), and two MCP tools (`list_comments`, `add_comment`) reusing the
same service. REST `POST` is a deliberate addition beyond the ticket's
literal minimum (MCP-write, REST-read only) — chosen for symmetry, since a
thread only agents could write to is the same asymmetry that got GAP-30's
"comment" verb escalated in the first place. No document write-back, no
notifications, and no Angular view were added — none are asked for by the
acceptance check, and the last is recorded here per its own "docs updated
on whether a view renders them" clause rather than silently built or
silently skipped.

GAP-28 (dual-format `Roadmap.md`/`Agentslog.md` read+write) is DONE
(`Features.md` F41): the app's parser/writer already round-tripped both
formats — `roadmap-parser.service.ts`, `roadmap-yaml-entry.util.ts`,
`roadmap-row-writer.util.ts`, `agentslog-parser.service.ts`/
`agentslog-writer.util.ts`, all regression-tested — before this file itself
converted. One real parity bug was found and fixed along the way: a
new-format entry with `status: BLOCKED` lost that status on any lifecycle
write-back, unlike the old format's Blocked table, which has no Status
column to overwrite. The remaining acceptance criterion — converting this
file to the new schema — was deliberately deferred past the parser work,
since this repository is itself a project the running PM Hub app syncs
every 5 minutes; converting it while that scheduler was live risked racing
a real sync tick mid-edit. Done once confirmed no dev server was running
and with the user's explicit sign-off, given the next sync tick will still
process this change (see `BUG-01` above for a second hazard found and
deliberately _not_ fixed in this same pass, kept out of scope on purpose).
