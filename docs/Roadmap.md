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
  Filed as GAP-33: full frontend replacement per the impeccable skill's
  redesign path (new-work.md) -- DESIGN.md/PRODUCT.md treated as evidence
  and anti-reference, not preserved. Sequenced after GAP-32 closes, so the
  new design has the project-lead-assignment surface to design around
  rather than adding it twice.
created_at: 2026-09-20T00:00:00Z
updated_at: 2026-09-20T00:00:00Z
```

### GAP-33 — Full frontend replacement with a new visual direction (DEC-002)

```yaml
id: GAP-33
type: GAP
title: Full frontend replacement with a new visual direction (DEC-002)
status: BACKLOG
description: >
  DEC-002's decided outcome: replace GAP-20's design system (shared
  AppShell, Material 3 azure/violet theme, spacing/radius tokens, shared
  component vocabulary across ~14 routed pages) rather than refine it.
  Kept BACKLOG (not claimed) until GAP-32 closes, so the redesign covers
  the project-lead-assignment surface GAP-32 adds instead of missing it.
expected_behavior: >
  Every routed page in apps/web renders under a new visual direction, with
  a new DESIGN.md replacing the current one -- product truth, content,
  function, and native/accessibility affordances preserved throughout
  (per the impeccable skill's redesign-vs-refinement distinction: this is
  a new look on the same product, not new functionality).
technical_context:
  frontend: apps/web/DESIGN.md, apps/web/PRODUCT.md, apps/web/src/app/layout/app-shell, apps/web/src/styles.scss, apps/web/src/app/**
next_action: >
  Claim once GAP-32 is DONE. Run the impeccable skill's context.mjs first,
  then its new-work.md redesign path: DESIGN.md/PRODUCT.md are evidence
  and anti-reference only, not preserved. Constraints already known from
  research: violet is currently the sole visual channel distinguishing
  human vs. AI-agent actors across the app (badges, kind-labels) -- the
  new direction needs an equally distinct, non-arbitrary replacement
  channel for that same product-core distinction, not just a new palette
  with no equivalent. Expect and budget for real breakage in apps/web's
  164 unit tests (many assert on component markup) and in
  documents.e2e-spec.ts-adjacent e2e specs that render live pages -- run
  the full pnpm test:e2e, not a targeted subset, given how much markup
  changes. Sequence per-surface (shell+theme first, then each page),
  closing and re-claiming rather than one giant entry with ad-hoc slice
  log labels (see TECH_DEBT-02 for exactly why that pattern is broken).
created_at: 2026-09-20T00:00:00Z
updated_at: 2026-09-20T00:00:00Z
```

### TECH_DEBT-01 — This doc set cannot fit the 8 KiB `context` budget

```yaml
id: TECH_DEBT-01
type: TECH_DEBT
title: This doc set cannot fit the 8 KiB context budget
status: BLOCKED
blocked_by:
  - DEC-001
description: >
  Found closing GAP-28: converting docs/Roadmap.md to the new schema
  cleared the old "MIGRATION REQUIRED" check-gate, which had always
  short-circuited `check` before it ever reached the context-size gate --
  so this was never actually exercised until now. This is not a growth
  problem that discipline can outrun: AGENTS.md's init-managed template
  block alone (4229 bytes, not hand-editable -- regenerated by the
  project-documentation skill's `init` command) plus just the 5 most
  recent Agentslog entries `context` always includes verbatim (currently
  4908 bytes for 5 entries) already total 9137 bytes -- over the 8192
  budget with ProductDescription.md/Stack_Tecnologies.md/Features.md's
  summaries, the active-work summary, and the open-tasks line all at
  zero. Shrinking those summaries (tried: trimmed AGENTS.md's one
  hand-editable custom section from 1814 to 233 bytes across two passes,
  saving ~1580 bytes total) can approach the line but cannot durably clear
  it, because the two largest contributors are outside this project's
  control: the template is regenerated by the skill itself, and the
  5-entry log window grows without bound as real work keeps happening.
  Four of the five latest log entries are already committed and pushed;
  AGENTS.md's own append-only Agentslog contract means rewriting pushed
  history to satisfy a size gate was rejected as the wrong trade -- an
  accurate audit trail matters more than this threshold.
expected_behavior: >
  `project_docs check`/`context` succeed within the 8 KiB budget on an
  ongoing basis, not just immediately after a one-time trim.
technical_context:
  backend: .claude/skills/project-documentation/scripts/project_docs.sh (build_context, CONTEXT_LIMIT, latest_log_entries)
next_action: >
  Blocked on DEC-001: whether to raise CONTEXT_LIMIT, shrink the
  last-N-entries log window (currently 5), exclude or compact the
  init-managed AGENTS.md template's contribution, or some combination --
  all are tooling-behavior changes to vendored skill machinery, not
  implementation details this session can decide unilaterally.
created_at: 2026-09-18T19:20:31Z
updated_at: 2026-09-19T09:40:00Z
```

### DEC-001 — How should the project-documentation `context` budget handle this project's doc set?

```yaml
id: DEC-001
type: DECISION
title: How should the project-documentation context budget handle this project's doc set?
status: PENDING
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
affects:
  - TECH_DEBT-01
technical_context:
  backend: .claude/skills/project-documentation/scripts/project_docs.sh (CONTEXT_LIMIT, latest_log_entries, build_context)
next_action: >
  Escalated per AGENTS.md's own rule (this changes tooling behavior
  affecting every future session's context, not a reversible
  implementation detail scoped to this project) -- needs a human decision
  on which lever(s) to pull before TECH_DEBT-01 can close.
created_at: 2026-09-19T09:40:00Z
updated_at: 2026-09-19T09:40:00Z
```

### TECH_DEBT-02 — Agentslog's open-task tracking never retires an abandoned state

```yaml
id: TECH_DEBT-02
type: TECH_DEBT
title: Agentslog's open-task tracking never retires an abandoned state
status: BACKLOG
description: >
  project_docs.sh's `all_task_states`/`open_tasks_line` (used by both
  `context`'s "Open tasks" section and `check`) treats a task as open
  from its most recent IN_PROGRESS/PAUSE log entry until a DONE entry for
  that *exact same* task-id string appears -- there is no other way to
  retire a state. Found while investigating TECH_DEBT-01: open_tasks_line
  currently lists 9 lines, 8 of them phantoms -- ad-hoc per-slice ids used
  during GAP-20's incremental delivery (`GAP-20 foundation`, `GAP-20
  dashboard`, `GAP-20 team`, `GAP-20 roles/audit/progress`, `GAP-20 copy
  pass 1`, `GAP-20 kanban/task-form`, `GAP-20 task-detail`, `GAP-20 copy
  pass 2`), each still showing IN_PROGRESS at 68h+ even though GAP-20
  itself is DONE (see prose below) -- nobody ever appended a closing entry
  for the individual slice ids, only for `GAP-20` itself. A 9th phantom
  appeared this very session and illustrates the defect precisely: a
  doc-sharpening log entry used `BUG-02 | PAUSE` (the closest fit in the
  IN_PROGRESS/PAUSE/DONE vocabulary for "touched this entry's docs, did
  not finish or claim the underlying bug"), which briefly showed BUG-02
  as open/held-by-Claude in the log while Roadmap.md's BUG-02 entry said
  `status: BACKLOG` -- a live instance of AGENTS.md's own "the log wins
  on conflict" rule producing a misleading conflict from a single
  documentation touch, not an actual claim. It retired cleanly only
  because BUG-02 happened to be closed for real (`done`) shortly after,
  in the same session -- nothing in the tooling reconciled it; a PAUSE
  with no following DONE, which is the common case, stays a phantom
  exactly like the 8 GAP-20 slices.
expected_behavior: >
  `open_tasks_line` reflects genuinely open work, not permanently-stuck
  historical artifacts, and a docs-only touch to an entry does not read as
  an open claim on it.
technical_context:
  backend: .claude/skills/project-documentation/scripts/project_docs.sh (all_task_states, open_tasks_line, check_log_entries)
next_action: >
  Do not work around this by appending 8 individual closing entries for
  the stale GAP-20 slices -- each costs roughly 700-1000 bytes and would
  evict real recent history from the last-5-entries window `context`
  shows (see TECH_DEBT-01/DEC-001), trading one phantom-open-task problem
  for a worse one. The durable fix is in the tooling itself: either teach
  `all_task_states` to also retire a task's open state when its matching
  Roadmap entry's `status` changes to something other than IN_PROGRESS/
  BLOCKED, or add a lighter-weight log verb than DONE for "touched, not
  claimed" so docs-only edits stop reading as claims -- both are
  vendored-tooling-behavior changes, not implementation details.
created_at: 2026-09-19T09:40:00Z
updated_at: 2026-09-19T09:40:00Z
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
