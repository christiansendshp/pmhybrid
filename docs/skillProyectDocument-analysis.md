# Analysis of `skillProyectDocument` (canonical name: `project-documentation`)

Source: https://github.com/christiansendshp/skillProyectDocument, cloned and read in full
(README.md, SKILL.md, every file under `templates/`, `references/`, `adapters/`, `agents/`,
`evals/`, `scripts/`). This document is the functional source of truth for building the
Project Management Hub parser/domain model, per the project's REGLA FUNDAMENTAL.

**Top-line finding: this repository is NOT a project-management task/hierarchy schema.**
It is a _skill for AI coding agents_ that maintains a compact, six-file "project memory"
(functional truth, technical truth, active roadmap, verified features, and an append-only
agent ledger) so that agents don't have to reload a project's entire history on every turn.
There is no Phase/Epic/Template/Task/Subtask hierarchy, no Kanban state machine, and no
registry of named AI agent personas anywhere in the repo. See §14 for the full list of
mismatches against the outer task brief's assumptions — these need an explicit decision
before modeling the domain.

---

## 0. Repo identity and naming

- Canonical skill name: `project-documentation`. The repo/folder name `skillProyectDocument`
  is an accepted **legacy alias** during a transition period — both names must never be
  installed/loaded simultaneously (`SKILL.md`, `references/adapters.md`).
- Purpose (`SKILL.md` frontmatter): "Initialize and maintain a compact six-file project
  memory for AI-assisted software work... Create missing project documents before coding,
  load only the bounded task-relevant context, record each logical change, and validate the
  documentation before closing the task."

## 1. Folder structure and purpose

| Path                                                                                                   | Purpose                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `README.md`                                                                                            | High-level pitch + contract-file table + command cheat-sheet                                                                                                                             |
| `SKILL.md`                                                                                             | Canonical agent workflow (frontmatter `name: project-documentation`)                                                                                                                     |
| `templates/*.md` (6 files)                                                                             | The literal starter content copied into a new project's `docs/` on `init`                                                                                                                |
| `references/workflow.md`                                                                               | Full workflow rules: context budget, ledger rotation, multi-agent coordination, content-maintenance rules, the `check` gate                                                              |
| `references/adapters.md`                                                                               | How the skill is wired into each AI coding runtime (Claude Code, Codex, OpenCode, Antigravity)                                                                                           |
| `adapters/AGENTS.md`, `adapters/CLAUDE.md`, `adapters/.antigravity/rules.md`, `adapters/opencode.json` | The literal merge-blocks each runtime's own instruction file should contain                                                                                                              |
| `agents/openai.yaml`                                                                                   | A single manifest describing the skill itself as an "agent/tool" for an OpenAI-style runtime (display name, description, default prompt) — **not** a roster of collaborating AI personas |
| `scripts/project_docs.sh`, `scripts/project_docs.ps1`                                                  | The actual implementation of `init`, `context`, `check`, `append-log`, `rotate` (POSIX and PowerShell, verified byte-for-byte equivalent)                                                |
| `scripts/init_docs.sh`, `scripts/check_docs.sh`                                                        | Thin backward-compatible wrappers that just call `project_docs.sh init`/`check`                                                                                                          |
| `evals/evals.json`                                                                                     | 3 acceptance scenarios for the skill's own behavior (see §10)                                                                                                                            |

No `docs/decisions/`, `docs/features/`, or `docs/history/` folders exist **inside this skill
repo** — those are conventions the skill tells _target_ projects to create on demand; they
are not part of `skillProyectDocument` itself.

## 2. Document types defined — the six contract files

Per `SKILL.md` / `README.md`, every project managed by this skill gets exactly these files
under `<project>/docs/`, created by `init` (idempotent — never overwrites an existing file):

| File                    | Compact responsibility                                                        |
| ----------------------- | ----------------------------------------------------------------------------- |
| `Agents.md`             | Repository rules and selective-reading/startup/close policy                   |
| `Agentslog.md`          | Recent append-only ledger of logical changes (hot log, rotates)               |
| `ProductDescription.md` | Current functional truth                                                      |
| `Stack_Tecnologies.md`  | Current technical truth (legacy misspelling intentionally retained)           |
| `Roadmap.md`            | Active and near-term work only (completed work is _removed_, not accumulated) |
| `Features.md`           | Index of verified capabilities                                                |

No frontmatter/YAML metadata is used in any template — everything is plain Markdown headings
and pipe-tables. Each of Product/Stack/Features has an `## Operational summary` block that
ends with a literal `<!-- context:end -->` HTML-comment marker — this is the exact delimiter
the `context` command's `awk`/PowerShell parser uses to extract the bounded summary. Any
parser we build must key on this same marker.

## 3. Hierarchy — actual vs. assumed

**There is no Project → Phase → Epic → Template → Task → Subtask hierarchy in this repo.**
The word "Template" in this repo means _a document template file_ (one of the six `.md`
files under `templates/`), not a level between Epic and Task.

The only structural levels that actually exist:

- **Roadmap** — a flat list of work items split into three tables: **Active work**, **Near
  term**, **Blocked**. No Phase or Epic grouping column exists anywhere.
- **Agentslog** — a flat, chronological, append-only ledger of "logical changes," each tied
  to one Roadmap item ID.
- **Features** — a flat index of verified capabilities, unrelated to Roadmap hierarchy.

There is no explicit Subtask concept, no Epic concept, no Phase concept, and no "which
higher-level instance does this task belong to" field of any kind. Dependency is expressed
only via a single free-text **"Depends on"** column referencing other Roadmap IDs (see §8).

## 4. Exact task field list (Roadmap tables, verbatim from `templates/Roadmap.md`)

**Active work:**

```
| ID | Outcome | Acceptance check | Status | Owner | Depends on |
|---|---|---|---|---|---|
| F01-S01-T01 | UNKNOWN | UNKNOWN | TODO | — | — |
```

**Near term** (no Owner column):

```
| ID | Outcome | Acceptance check | Status | Depends on |
|---|---|---|---|---|---|
| F01-S01-T02 | UNKNOWN | UNKNOWN | TODO | — |
```

**Blocked:**

```
| ID | Blocker | Needed decision or event | Owner |
|---|---|---|---|
| — | — | — | — |
```

There is no title/description split, no priority field, no start/estimated/finish date
fields, no percentage-of-progress field, and no acceptance-criteria list distinct from the
single "Acceptance check" cell. This is deliberately minimal — the skill's whole premise is
compactness (8 KiB context budget), not a full task-management schema.

## 5. Status/state vocabulary — actual vs. assumed (critical mismatch)

There is **no formally declared closed enum of states** anywhere in the repo. The only
status tokens that actually appear are, by convention, in prose/examples:

- `TODO` — seed placeholder value in `templates/Roadmap.md`.
- `IN_PROGRESS` — mentioned only in prose: `references/workflow.md` §"Multi-agent
  coordination": _"Use Roadmap ownership only for work that may overlap... Format owner as
  `<agent>@<timestamp>`"_ and `SKILL.md`: _"Mark a Roadmap item `IN_PROGRESS` before
  implementation when multiple agents may work concurrently."_
- `DONE` — used in the fixed Agentslog entry-header example: `## [timestamp] | agent | TASK-ID | DONE`.
- Certainty tags `CONFIRMED` / `UNKNOWN` / `HYPOTHESIS` / `N/A` — these are **not task
  states**, they are placeholders for _fact confidence_ used throughout Product/Stack/
  Features/Decisions tables (`references/workflow.md`: _"Use `CONFIRMED`, `UNKNOWN`,
  `HYPOTHESIS`, or `N/A` for facts whose certainty matters."_).

**The outer task brief's Kanban vocabulary — PENDIENTE / ASIGNADA / EN DESARROLLO / QA /
TERMINADA — does not appear anywhere in this repo, in any language.** Nothing here defines a
QA state, an "assigned" state distinct from in-progress, or a transition-lock rule tied to
"desarrollo." This is a genuine gap the outer brief's rule 3 ("no inventar estructura
paralela que contradiga esos documentos") flags as needing resolution, since the outer brief
itself specifies states that contradict/extend what the source repo defines.

## 6. ID scheme

The only concrete example is `F01-S01-T01` / `F01-S01-T02` (seed rows in
`templates/Roadmap.md`), suggestive of `F<eature>NN-S<ection>NN-T<ask>NN`, but **this pattern
is never explained or formally specified anywhere** — it appears exactly twice, only as
placeholder seed data, with no accompanying prose defining the grammar. Everywhere else the
skill just says "TASK-ID" generically (`references/workflow.md` entry-format block, `## [ts]
| agent | TASK-ID | DONE`). There is no separate ID scheme for phases/epics/subtasks because
those concepts don't exist in this repo. The one hard requirement that _is_ explicit: an
ID must be **stable** and is the correlation key between Roadmap and Agentslog (a Roadmap row
ID is referenced verbatim as `TASK-ID` in the corresponding log entries) — this does match the
outer brief's rule 24 ("Nunca utilizar únicamente el título para identificar una tarea").

## 7. Agentslog / agent-log format

Exact entry format, verbatim from `templates/Agentslog.md` and `references/workflow.md`
(both identical):

```markdown
## [YYYY-MM-DDTHH:mm:ssZ] | agent | TASK-ID | DONE

- Summary: observable outcome
- Files: compact paths or component names
- Verify: command and result
- Follow-up: none or one pointer
```

- Header fields, pipe-delimited: **ISO-8601 UTC timestamp | agent name | Task ID | status
  word**. The status word is free text supplied by the caller of `append-log` (see script
  signature below) — the template just shows `DONE` as the illustrative example, it is not
  hard-coded as the only legal value.
- Body: exactly four fixed bullet fields — `Summary`, `Files`, `Verify`, `Follow-up` — no
  more, no fewer. `append_log()` in `project_docs.sh`/`project_docs.ps1` enforces this by
  signature: `append-log <agent> <task> <status> <summary> <files> <verify> [follow-up]`
  (follow-up defaults to `"none"` if omitted). Pipe/CR/LF characters in any field are
  sanitized to spaces/slashes before writing (`clean_field()` / `ConvertTo-LogField`).
- Correlation key to Roadmap: the literal `TASK-ID` token, matched against a Roadmap row ID.
- No structured "blocker"/"error"/"started-at" fields exist distinct from free-text
  `Summary`/`Follow-up` — the outer brief's request (§13: detect blockers, errors, start
  time, completion as distinct structured signals) is **not directly supported**; at best it
  would have to be parsed heuristically out of the `Summary`/`Follow-up` prose, which the
  skill's own design does not anticipate or promise.
- **`agents/openai.yaml` is not a roster of agent personas** (Codex/Claude/Gemini/QA/etc. as
  the outer brief assumes at §3/§13). It contains exactly one `interface:` block describing
  how _the skill itself_ should be surfaced to an OpenAI-style tool-calling runtime:
  `display_name: "Project Documentation"`, `short_description`, `default_prompt`. There is no
  other file under `agents/`. The outer brief's assumption that this repo defines named,
  configurable AI-agent types is **not supported by the repo** — that concept has to be
  invented by the PM Hub application itself, using its own `Agent` entity (per outer brief
  §3), not sourced from this skill.

## 8. Dependency / relationship notation

The only dependency mechanism is the **"Depends on"** column in the Active-work and
Near-term Roadmap tables (see §4), holding free-text references to other Roadmap IDs (seed
example uses `—` for "none"). There is no distinct notation for "child of Phase/Epic" because
no Phase/Epic level exists; the closest thing to a parent-scope reference is the ID prefix
convention itself (`F01-S01-...`), which — as noted in §6 — is never formally defined, so it
cannot be relied on as a validated schema, only as an informal illustrative pattern.

## 9. Adapter contracts (`adapters/`)

**These are AI coding-runtime instruction adapters, not Git-hosting-provider adapters.**
They have nothing to do with the outer brief's §20 "Project Repository Provider"
(GitHub/GitLab/Bitbucket) concept — that is a naming collision only. Each file is a short
merge-block meant to be pasted/merged into that runtime's own root instruction file, all
saying the same three things: run `init` then `context` before coding; update only affected
truths, append one log entry, run `rotate` then require `check` to pass after coding; never
invent facts or store secrets.

| Runtime     | Target file merged into                                                    | Adapter source                                                                                                                                                                  |
| ----------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Claude Code | `.claude/skills/project-documentation/SKILL.md` + merged `CLAUDE.md` block | `adapters/CLAUDE.md`                                                                                                                                                            |
| Codex       | installed skill + merged root `AGENTS.md` block                            | `adapters/AGENTS.md`                                                                                                                                                            |
| OpenCode    | root `AGENTS.md` as sole instruction source                                | `adapters/opencode.json` (`"instructions": ["AGENTS.md"]`) + its own bash permission allowlist (`git mv *`/skill scripts allowed, `rm *`/`git push *` ask, everything else ask) |
| Antigravity | merged `.antigravity/rules.md` block                                       | `adapters/.antigravity/rules.md`                                                                                                                                                |

Rule from `references/adapters.md`: **merge, never overwrite** — if the target already has
an `AGENTS.md`/`CLAUDE.md`/etc., preserve its existing content and merge the compact block
in; adapters intentionally expose only `init`, `context`, `append-log`, `rotate`, `check` and
must not inline the full `SKILL.md`/`workflow.md` reference material.

## 10. Evals — the functional acceptance contract (`evals/evals.json`)

Three scenarios, defining exactly what "correct" behavior means for the skill's own
commands — directly useful for building a validator/parser later:

1. **Idempotent init**: first `init` on a path containing spaces creates exactly the six
   contract files; a second `init` (even after a custom repository rule was hand-added)
   creates **zero** new files and preserves the custom rule **byte-for-byte**.
2. **Partial recovery + bounded context**: `init` on a project missing exactly one
   contract file recovers only that one file; `context` output is **≤ 8192 UTF-8 bytes**,
   includes repository rules + summaries + active work, and includes **no more than five**
   real Agentslog entries; cold history (`docs/history/`) is never loaded.
3. **Ledger rotation integrity**: after >200 logical changes, rotation archives the oversized
   hot ledger exactly once into `docs/history/`, verifies it by **SHA-256**, and `check` only
   passes after rotation completes — no history is lost.

Matches the exact numeric limits hard-coded in both scripts: `CONTEXT_LIMIT=8192`,
`LOG_BYTES_LIMIT=131072`, `LOG_ENTRIES_LIMIT=200`.

## 11. Versioning / revision-history conventions

- No per-document frontmatter or version numbers anywhere.
- **Agentslog rotation** is the sole revision-history mechanism: when the hot ledger exceeds
  200 entries or 128 KiB, it is copied verbatim to `docs/history/Agentslog-<YYYYMMDD>-<NNN>.md`
  (zero-padded 3-digit sequence, incremented if a same-day archive already exists), the copy
  is verified against the source via **SHA-256** (rotation aborts if hashes mismatch), and the
  hot ledger is atomically replaced with a fresh one whose header records the archive's path
  and hash under a `## Previous segment` section. Archives are documented as **immutable**
  and read "only when a current entry or decision points to it."
- `Stack_Tecnologies.md` has a compact `## Decisions` table (`ID | Date | Decision | Reason |
Status | Detail`, seed row `ADR-001 | UNKNOWN | UNKNOWN | UNKNOWN | HYPOTHESIS | —`) meant
  to link out to long-form ADRs conventionally placed under `docs/decisions/` — but that
  folder does not exist in this skill repo; it's a target-project convention only.
- Philosophy stated explicitly in `references/workflow.md`: _"Git is the recovery mechanism
  for normal deletions. Archive only audit history and superseded decisions that remain
  useful; do not enforce 'nothing is ever deleted.'"_ — i.e., this skill deliberately does
  **not** aim for the outer brief's full immutable-audit-trail model (§25); it is optimized
  for agent context-window economy, not compliance-grade auditing.

## 12. `check` validation rules (useful for building our own validator)

`check_docs()` in both scripts validates structure by **literal substring presence of
required headings** per file (not a markdown AST/schema check):

- `Agents.md` must contain: `## Repository rules`, `## Startup`, `## Close`
- `Agentslog.md` must contain: `## Entry format`, `## Entries`
- `ProductDescription.md` must contain: `## Operational summary`, `## Business rules`
- `Stack_Tecnologies.md` must contain: `## Operational summary`, `## Decisions`
- `Roadmap.md` must contain: `## Active work`, `## Near term`
- `Features.md` must contain: `## Operational summary`, `## Verified capabilities`

Then it re-derives `context` (must not throw / must stay ≤ 8192 bytes) and checks the
Agentslog byte/entry-count thresholds. Any failure is fatal (`check_docs: check failed`,
non-zero exit) — "a task is not complete while `check` fails" is stated as a hard rule in both
`SKILL.md` and `references/workflow.md`.

## 13. Multi-agent coordination conventions (relevant to our Agent/RBAC design)

- Ownership claim format: `Owner` cell in an Active-work Roadmap row is written as
  `<agent>@<timestamp>` when a task might be worked by more than one agent concurrently.
- Rule: _"Do not touch a row owned by another active agent unless coordinating"_ and
  _"Escalate incompatible concurrent decisions instead of silently overwriting another
  agent's work"_ — this is a soft social-convention rule enforced by agent discipline, not by
  any lock/permission mechanism in the scripts (the scripts have no concept of "owner" at
  all beyond a table cell of text).
- Documentation language should "match the project unless the user specifies one"
  (`templates/Agents.md`).

## 14. Mismatches / gaps vs. the outer task brief — must be resolved before modeling

| Outer brief assumes                                                                              | This repo actually defines                                                                                                                    | Verdict                                                                                                                                              |
| ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hierarchy `PROJECT → PHASE → EPIC → TEMPLATE → TASK → SUBTASK`                                   | No Phase/Epic/Subtask concept at all. "Template" = a doc-template file, not a hierarchy level. Only a flat Roadmap (Active/Near-term/Blocked) | **Contradicted, not just absent**                                                                                                                    |
| Kanban states `PENDIENTE / ASIGNADA / EN DESARROLLO / QA / TERMINADA`                            | Only informal `TODO` / `IN_PROGRESS` / `DONE` appear, nowhere as a declared closed enum; no QA state exists                                   | **Contradicted** — different vocabulary, different granularity, no QA phase                                                                          |
| Rich task fields: priority, start/estimated/finish dates, % progress, acceptance-criteria list   | Only `ID, Outcome, Acceptance check, Status, Owner, Depends on`                                                                               | **Repo is far leaner; brief's fields are absent, not contradicted**                                                                                  |
| Named, configurable AI agent personas (Codex, Claude, Gemini, QA agent, UI/UX agent...)          | `agents/openai.yaml` only describes the skill's own tool manifest for a runtime; no persona roster                                            | **Absent** — must be invented entirely inside the PM Hub app's own `Agent` entity                                                                    |
| AGENTSLOG records blocker/error/start-time/finish as distinct structured signals per task        | Only 4 free-text fields (Summary/Files/Verify/Follow-up) plus a status word in the header                                                     | **Partially supported** — correlation by TASK-ID works; structured blocker/error detection would need heuristic text parsing, not a guaranteed field |
| `adapters/` = Git hosting provider integration (GitHub/GitLab/Bitbucket)                         | `adapters/` = AI coding-runtime instruction merge blocks (Claude Code/Codex/OpenCode/Antigravity)                                             | **Naming collision only — unrelated concepts**                                                                                                       |
| Full immutable audit trail of every change                                                       | Ledger explicitly rotates/compacts; philosophy states Git (not the ledger) is "the recovery mechanism for normal deletions"                   | **Different philosophy** — compact context economy, not compliance auditing                                                                          |
| Documents live under a `skillProyectDocument`-defined ROADMAP/AGENTSLOG format with phases/epics | Documents live under `<project>/docs/{Roadmap.md, Agentslog.md, ...}` — confirmed exact filenames/paths, but flat content model               | **Filenames/paths confirmed; internal schema is much flatter than assumed**                                                                          |

### Recommendation flagged for the parent task

Per the outer brief's own rule 3 ("La aplicación NO debe inventar una estructura paralela que
contradiga esos documentos") and rule 5 ("Si el repositorio no es accesible, detenerse..."):
the repo **is** accessible and has been fully read, so there is no blocking access failure —
but the outer brief's _own_ structural assumptions (hierarchy + Kanban states) do not match
what the source-of-truth repo defines. This is a genuine conflict inside the brief itself
(brief's rule 3 vs. brief's rules 5/7/119-131 hierarchy/state assumptions) that a human
decision-maker should resolve explicitly before schema/DB design proceeds — options include:
(a) treat the flat Roadmap/Agentslog schema as ground truth and layer the richer
Kanban/hierarchy/agent-persona concepts as **application-level extensions** stored in
PostgreSQL that _reference_ Roadmap IDs but are not required by or written back verbatim into
the six-file format, or (b) extend the six-file template format itself (a fork/superset of
`project-documentation`) to add Phase/Epic/Subtask sections and richer status vocabulary. Each
has different sync/parsing implications for FASE 6 (parser) and FASE 8 (sync) of the outer
brief's plan.
