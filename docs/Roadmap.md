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

### BUG-01 — Empty new-format Roadmap.md is indistinguishable from an empty old-format one

````yaml
id: BUG-01
type: BUG
title: Empty new-format Roadmap.md is indistinguishable from an empty old-format one
status: BACKLOG
description: >
  `looksLikeNewFormatRoadmap` (apps/api/src/modules/roadmap/
  roadmap-yaml-entry.util.ts) is a positive-signal detector: it returns true
  only when it finds at least one real `### ID — Title` heading immediately
  followed by a ```yaml fence. A new-format Roadmap.md with zero entries
  (both `## Plan` and `## Cross-cutting` empty) has no such heading, so the
  detector returns false for it -- indistinguishable from an empty
  old-format document. Found while converting this file for Roadmap GAP-28,
  before committing: an empty result either way feeds `reconcileRoadmap`
  a zero-row parse, which would sweep every Task this project has with a
  non-null externalId as "disappeared" (silently completed if a terminal
  Agentslog entry exists, else a ROADMAP_ROW_DISAPPEARED_NO_TERMINAL_LOG
  conflict per row) -- not caused by this specific edit (this file was kept
  non-empty specifically to avoid it), but a latent hazard for whoever
  empties the file next, e.g. once every entry it holds is eventually closed.
expected_behavior: >
  An intentionally empty new-format Roadmap.md (no entries, but the
  `## Plan`/`## Cross-cutting` structure present) should be recognized as
  new-format, not misread as an empty old-format document. One candidate
  fix: also treat a literal `## Cross-cutting` heading line as a positive
  signal -- confirmed unique to the new format (never used by any
  old-format code path, table, or fixture in this repo).
affects:
  - roadmap-yaml-entry.util.ts
technical_context:
  backend: apps/api/src/modules/roadmap/roadmap-yaml-entry.util.ts
files:
  - apps/api/src/modules/roadmap/roadmap-yaml-entry.util.ts
  - apps/api/src/modules/roadmap/roadmap-yaml-entry.util.spec.ts
next_action: >
  Add a regression test with an empty-entries new-format fixture (## Plan +
  ## Cross-cutting present, no ### entries) asserting
  looksLikeNewFormatRoadmap returns true, then make it pass -- e.g. by also
  matching a literal `## Cross-cutting` heading line.
created_at: 2026-09-18T19:13:19Z
updated_at: 2026-09-18T19:13:19Z
````

### TECH_DEBT-01 — This doc set cannot fit the 8 KiB `context` budget

```yaml
id: TECH_DEBT-01
type: TECH_DEBT
title: This doc set cannot fit the 8 KiB context budget
status: BACKLOG
description: >
  Found closing GAP-28: converting docs/Roadmap.md to the new schema
  cleared the old "MIGRATION REQUIRED" check-gate, which had always
  short-circuited `check` before it ever reached the context-size gate --
  so this was never actually exercised until now. Measured via
  project_docs.sh context: total 14490 bytes against the 8192 budget.
  Breakdown: AGENTS.md 4616 (4229 of that is the init-managed template,
  not editable by hand), ProductDescription.md summary 638,
  Stack_Tecnologies.md summary 619, Features.md summary 1942,
  roadmap_active_summary 15, open_tasks_line 492, latest_log_entries
  (last 5 Agentslog entries, verbatim) 6124. The floor alone -- everything
  except the 5 log entries -- is already 8322, over budget by itself.
  Already trimmed what's safely editable: compacted AGENTS.md's custom
  Migration section (saved ~1400 bytes) and the one not-yet-pushed log
  entry (saved ~600). Four of the five latest log entries are already
  committed and pushed; AGENTS.md's own append-only Agentslog contract
  means rewriting pushed history to satisfy a size gate was rejected as
  the wrong trade -- an accurate audit trail matters more than this
  threshold.
expected_behavior: >
  `project_docs check`/`context` succeed within the 8 KiB budget, or the
  budget itself is revisited if this project's doc set has durably outgrown
  it (Features.md's Known-limitations line and AGENTS.md's template block
  are the next-largest, still-growing contributors).
affects:
  - AGENTS.md
  - Features.md
technical_context:
  backend: .claude/skills/project-documentation/scripts/project_docs.sh (build_context, CONTEXT_LIMIT)
next_action: >
  Either shrink Features.md's Known-limitations sentence and any future
  AGENTS.md additions going forward so new headroom accumulates, or revisit
  whether CONTEXT_LIMIT (8192) is realistic for a project this size --
  human call, since raising it is a tooling-behavior change, not an
  implementation detail.
created_at: 2026-09-18T19:20:31Z
updated_at: 2026-09-18T19:20:31Z
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
