# Agents that identify themselves, development and QA on the Kanban, more views (app and skill)

- **Status:** PROPOSAL. Nothing here is built. It is registered in `docs/Roadmap.md` as
  `EPIC-02` (features `FEATURE-10` to `FEATURE-13`, tasks `TASK-01` to `TASK-23`, subtasks,
  `GAP-40` to `GAP-44`, `BUG-17`, `DOC-01`, `DEPENDENCY-01` and `DEPENDENCY-02`, and the
  decisions `DEC-005` and `DEC-006`).
- **Requested:** 2026-10-13. Analyze the system and the skill together; propose that agents
  identify themselves better and that the Kanban shows when a task is in development and when
  it is in QA; add views next to the Kanban; improve tracking; compare with what is built and
  say clearly where something conflicts or overlaps.
- **Sources:** the live instance (project SMARTHR, the only real one), the code at `develop`,
  this repo's copy of the skill (`.claude/skills/project-documentation`) and the upstream repo
  `christiansendshp/skillProyectDocument` at `15805b1`. Behavior described from reading the
  code is marked **(read, not run)**. This plan sits next to `docs/tracking-improvement-plan.md`
  (`EPIC-01`); section 3 says where they meet.

## 1. Two products, two objectives

|                 | PM Hub (the app)                                                                     | The skill                                                                                             |
| --------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| Objective       | **Track** projects: what is being done, by whom, in which state, how far along.      | **Develop jointly** with AI agents, who **document every step** in the project's own files.           |
| Source of facts | Derives and shows. It must never invent a fact the documents do not carry (ADR-001). | Originates the facts: the Roadmap rows and the Agentslog ledger, the "source of truth for ownership". |
| Worst failure   | Showing a state the work is not in; overwriting a document silently.                 | Making documentation heavier than the work, so agents skip or batch it.                               |

The rule used to judge every proposal: **a fact is born in the skill's documents; the app
reads it, shows it and never guesses it.** Anything the app needs and the documents cannot
say today is first a change to the skill, and only then a change to the app that depends on it.

## 2. What the system does today, and what the evidence shows

**Status words, both directions.** The app has five states (PENDIENTE, ASIGNADA, EN_DESARROLLO, QA,
TERMINADA) and a permission split around QA. The documents have fewer.

| Document format                              | Reads                                                                   | Writes                                                              |
| -------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Old tables (three tables)                    | TODO, IN PROGRESS, DONE and the five Kanban words as they are           | The Kanban word verbatim (BR-002)                                   |
| YAML entries (this repo's fork of the skill) | BACKLOG, READY, IN_PROGRESS, TESTING, DONE (REVIEW is read as no state) | The inverse: ASIGNADA as READY, QA as TESTING                       |
| **Latest-skill tables (what SMARTHR uses)**  | TODO, IN_PROGRESS, DONE (PAUSE is a block)                              | PENDIENTE and ASIGNADA as TODO, EN_DESARROLLO and QA as IN_PROGRESS |

Sources: `STATUS_MAP`, `NEW_STATUS_TO_TASK_STATUS`, `KANBAN_TO_WORKFLOW` **(read, not run)**.

What the live data and the code say:

1. **In a table project the QA and ASIGNADA columns can never fill.** SMARTHR has 246 TERMINADA,
   46 PENDIENTE, 1 EN_DESARROLLO, 0 ASIGNADA and 0 QA. The skill has no word for either and the app
   does not infer them. Two of five columns are structurally empty for the only real project.
2. **Moving a task to QA writes nothing to the documents.** Only creation, EN_DESARROLLO,
   TERMINADA and a locked reassignment are write-back triggers
   (`tasks.service.ts:675-696`, verified). An agent that hands a task to QA through MCP leaves no
   trace in the ledger, which is the opposite of "agents document every step".
3. **A third of the work is documented after the fact, so the board cannot show it in development.**
   In SMARTHR 117 of the 358 tasks that have both an IN_PROGRESS and a DONE entry were closed within 5 minutes of starting (91 within one minute) and 56 took an hour or more; a batch close writes both entries a second apart (for example `14:18:09` and
   `14:18:10`). This is how the agents work, not a missing feature. See the appendix for the query.
4. **Agent identity is free text and must match exactly.** In the skill, `<agent>` is any string and
   ownership is an exact match; a probe showed that after `claim` as `claude-sonnet-5-5`, a `pause`
   as `claude-sonnet-5` is refused. This repo's own logs use `claude`, `claude-code`, `Claude` and
   `claude-sonnet-5` for the same kind of agent (the counts differ between the current and the
   archived logs, so none is quoted); SMARTHR's uses five model names. In the app the
   owner cell `name@timestamp` is already parsed and matched to a member by exact display name
   (`parseOwnerCell`, `resolveOwner`), but the ledger's agent name never feeds identity, and no
   agent of SMARTHR is registered, so no task has an assignee.
5. **No reviewer exists.** QA can approve and reject but cannot move a task into QA; DEVELOPER and
   AI_AGENT can move a task into QA but cannot approve; no field says who reviews a task
   (`access-catalog.ts:107-137`). BR-001 locks the assignee in EN_DESARROLLO, so a reviewer cannot
   be stored as the assignee.
6. **The card says who and how far, not how long or how sure.** It shows ID, priority, short title,
   phase and epic, assignee and kind, progress, subtasks, dependencies, dates and a block reason.
   It does not show how long the task has been in its state, a reviewer, the last thing the agent
   logged, or that the ledger and the board disagree. The board has no WIP limits, no list view,
   no timeline, no dependency view; the only other views are the progress tree, Workload and the
   Panel.
7. **The ledger's words are not normalized, and the terminal check is literal.** 34 distinct status
   words; the terminal check for a row that disappeared is the exact word `DONE`
   (`TERMINAL_STATUS_WORDS`, **read, not run**), while the log holds `DONE parcial`,
   `DONE (2 de 3 partes)`, `DONE (chunk 1/2)`. A prefix match would be wrong (those are partial),
   an exact match leaves the others as not closed.
8. **The skill has no review, handoff or assign command, and its `check` rejects any ledger word but
   `IN_PROGRESS`, `PAUSE` and `DONE`.** Its YAML schema names `REVIEW` and `TESTING`, but no command sets
   them and a hand-set one hides the task from `status` and from `context` (a defect of this repo's
   copy, `open_task_states`).

## 3. Where this conflicts with, or overlaps, what exists

Read this section before the proposals. **BLOCKS** means something cannot be built before the
thing it names is settled; **OVERLAP** means do not build it twice; **INVARIANT** is a rule the
design keeps; **STALE** is a document that is now wrong; **DECISION** needs your answer; **CONFLICT** and
**DEFECT** are things that would break, or already are broken.

| #   | Kind      | The request implies                                | What exists or is planned                                                                                                                                                                                                             | Resolution                                                                                                                                                                                                                             |
| --- | --------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | BLOCKS    | The app records a handoff to QA in the ledger.     | The latest skill's `check` rejects any ledger word but three; the app's own write-back already follows that (`SKILL_STATES`).                                                                                                         | The app **reads** `REVIEW` now; it **writes** it only after the skill accepts it (`DEPENDENCY-01`, `TASK-08`).                                                                                                                         |
| C2  | BLOCKS    | One place to add the QA word.                      | Two skill lines: this repo's YAML fork and the upstream tables, diverged (upstream reverted to tables in PRs #4 and #5).                                                                                                              | `DEC-005`. The app side is built format-agnostic so almost nothing waits for it.                                                                                                                                                       |
| C3  | DECISION  | QA approval means something.                       | Sync applies a document's status with no transition or permission check: a document `DONE` moves a task out of QA without `task.qa.approve`, as does a disappeared row with a DONE entry (**read, not run**).                         | `DEC-006` and `GAP-41`. Today's behavior is kept unless a project turns approval on.                                                                                                                                                   |
| C4  | OVERLAP   | Agents resolve to actors.                          | `FEATURE-03` of `EPIC-01`. Its `name@time` form is already implemented; what is missing is aliases and registration.                                                                                                                  | `FEATURE-10` refines `FEATURE-03`; `FEATURE-03` is narrowed, not built twice.                                                                                                                                                          |
| C5  | OVERLAP   | The ledger carries the stage.                      | `FEATURE-04` (`canonicalStatus`) has no REVIEW or ASSIGNED, and BR-003's terminal check is the exact word `DONE`.                                                                                                                     | `TASK-06` adds the stage words and `FEATURE-04` is amended to cover partial closes (`DONE parcial` is not terminal).                                                                                                                   |
| C6  | OVERLAP   | Agents document when they start.                   | `D5` of `DEC-004` asks for a start entry on claim. `claim` already writes one.                                                                                                                                                        | The cause is closing in batch, not a missing entry. `D5` is reframed; see `TASK-12` and `DEPENDENCY-02`.                                                                                                                               |
| C7  | OVERLAP   | Waiting and dependency views.                      | `FEATURE-05` (waiting) and `FEATURE-07` (critical path) of `EPIC-01`.                                                                                                                                                                 | `TASK-21` and `TASK-22` are thin board views over those features, not new queries.                                                                                                                                                     |
| C8  | OVERLAP   | Short names.                                       | Upstream's `Name` column (at most 10 words) and `GAP-39`/`UX-04` (LLM and view shortening) apply the same rule twice.                                                                                                                 | `GAP-43`: when a row carries a `Name`, the app uses it and does not call the LLM for that row.                                                                                                                                         |
| C9  | INVARIANT | A reviewer per task.                               | BR-001 locks the assignee in EN_DESARROLLO; Workload reads the assignee.                                                                                                                                                              | A separate `reviewerActorId`, in Postgres only (no document has a field for it). Never the assignee column.                                                                                                                            |
| C10 | INVARIANT | The app derives QA from the documents.             | ADR-001: documents stay the write target; the app never silently overwrites them.                                                                                                                                                     | Deriving QA writes nothing. Writing the handoff appends to the ledger only, per project, opt in (`TASK-08`).                                                                                                                           |
| C11 | STALE     | Docs say the app writes `QA` into the Status cell. | True for the old tables; false for latest-skill tables, where QA is written as `IN_PROGRESS`.                                                                                                                                         | `DOC-01`. It also covers `skillProyectDocument-analysis.md` (describes the v1 skill), `domain-model.md:357` (reopen is also held by PROJECT_MANAGER), BR-002's wording, and ADR-002, superseded only in a code comment.                |
| C12 | DEFECT    | Agents identified in the audit trail.              | Write-back audit and revisions are recorded as origin `UI` even when an agent's API call caused them (`write-back.service.ts:1143,1171`, **read, not run**).                                                                          | `GAP-44`.                                                                                                                                                                                                                              |
| C13 | OVERLAP   | An agent lane on the board.                        | Swimlanes by assignee and the Workload page exist.                                                                                                                                                                                    | `TASK-20` builds on them; the new part is resolving agents (`TASK-02`) and showing the unregistered ones.                                                                                                                              |
| C14 | CONFLICT  | Agents are identified by one name everywhere.      | PM Hub writes the agent's display name in the ledger (`skill-ledger.util.ts`, **read, not run**); the skill compares the agent string exactly, and a probe showed `claude-sonnet-5` is refused on a task held by `claude-sonnet-5-5`. | The agent's own `done` after PM Hub's entry would be refused as another agent's task, and the ledger would show two holders. `TASK-01` adds a `ledgerName`, the exact string the agent passes to the skill, and `TASK-04` writes that. |
| C15 | STALE     | The assignee is locked in development.             | BR-001 says changing it needs a special permission; `reconcileAssignee` applies a document owner change anyway (the lock restricts reassigning in PM Hub, not the document).                                                          | `DOC-01` states it; `TASK-02` pins today's behavior with a test instead of asserting a rule the code does not have.                                                                                                                    |

## 4. Proposals

### 4.1 Agents identify themselves (`FEATURE-10`)

- **Skill** (`DEPENDENCY-02`): a roster in `AGENTS.md` (agent id, kind, model, role developer or QA,
  aliases); `claim`, `handoff`, `review` and `done` normalize an alias to the canonical id without
  regard to case, warn on an unknown name, and `check` lists unknown names in the ledger; the
  adapters say which string each runtime passes and that it never changes.
- **App:** `AgentProfile` gains a `ledgerName` (the exact string the agent passes to the skill, and the
  one PM Hub writes in the ledger), aliases, model and stage role (`TASK-01`); the owner cell and the
  ledger's agent name resolve through them, with `AgentLogEvent.agentActorId` backfilled
  (`TASK-02`); unknown names are suggested for registration, never registered silently
  (`TASK-03`); MCP `whoami` (`TASK-04`). The roster and the three rules in `AGENTS.md` are the skill's
  template (`DEPENDENCY-02`); the app's skeleton holds no `AGENTS.md`, so `TASK-05` was cancelled and the
  app only offers the roster to paste (`TASK-25`).

### 4.2 Development and QA are visible (`FEATURE-11`)

The state machine the ledger would carry, **backward compatible** (a project that never uses
`REVIEW` is untouched):

```
IN_PROGRESS (developer)  --handoff-->  REVIEW (developer; "- Handoff: <agent or role>")
REVIEW (reviewer)  "- Review: PASS - detail"   -> ready for DONE
REVIEW (reviewer)  "- Review: FAIL - detail"   -> back to IN_PROGRESS for the developer
```

- **Skill** (`DEPENDENCY-01`): the ledger word `REVIEW` (and optionally `ASSIGNED`), the optional lines
  `Handoff` and `Review`, the commands `handoff`, `review` and `assign`, `done` held by the holder or
  by the reviewer who passed it. In the table line the Roadmap `Status` stays `IN_PROGRESS`; the stage
  lives in the ledger, which already is "the source of truth for task ownership" and a handoff is an
  ownership event.
- **App, no dependency on the skill:** read the stage words (`TASK-06`), derive QA and ASIGNADA from
  the ledger in table projects without writing anything (`TASK-07`), record when a task entered
  its state (`TASK-11`), flag instant closes (`TASK-12`).
- **App, after the skill accepts the word:** write the handoff to the ledger, opt in per project
  (`TASK-08`). **Reviewer** on the task (`TASK-09`), MCP `handoff_task` and `review_task` (`TASK-10`).
- **Not proposed:** inferring development or QA from today's free-text words. It contradicts the
  skill's own `check` and would make the board say what the documents did not.

### 4.3 The card and the board say more (`FEATURE-12`)

Agent chip with kind and model, how long the task has been in its stage ("en QA hace 2 d"), the
reviewer, the last ledger line on hover (`TASK-13`); a badge when the ledger and the board
disagree (`TASK-14`); advisory WIP limits per column and per agent, never blocking a move
(`TASK-15`); filters for stale tasks, agent kind, reviewer and divergence (`TASK-16`). Anything that
changes the state is also written in words, not only by color.

### 4.4 More views next to the Kanban (`FEATURE-13`)

A view switcher over one set of filters and one URL state (`TASK-17`), then: **Lista** (`TASK-18`),
**En revisión** with the approve and reject actions (`TASK-19`), **Por agente** (`TASK-20`),
**Esperando** (`TASK-21`), **Dependencias** (`TASK-22`) and **Línea de tiempo** (`TASK-23`). The
existing `/kanban` address keeps working.

### 4.5 What the skill and the app owe each other

| The skill gives the app                                                       | The app gives the skill                                                                              |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| A stable agent id, a stage in the ledger, claim at the start, a handoff note. | A place where the documentation becomes visible: the card, the queue, the timeline.                  |
| Words `check` accepts, so nothing the app writes can break it.                | The evidence of what agents skip (instant closes, unknown names), so the skill's rules can be tuned. |

## 5. Plan

| Wave | Contents                                                                                             | Needs                                  |
| ---- | ---------------------------------------------------------------------------------------------------- | -------------------------------------- |
| 0    | `DEC-005`, `DEC-006`; `GAP-44`; `DOC-01`; `BUG-17` after `DEC-005`; send `DEPENDENCY-01/02` upstream | Your answers                           |
| 1    | `TASK-01`, `TASK-02` (with its 3 subtasks), `TASK-11`, `TASK-12`, `TASK-04` (`TASK-05` cancelled)    | Nothing from the skill                 |
| 2    | `TASK-06`, `TASK-07`                                                                                 | Wave 1 (`TASK-11` for precedence)      |
| 3    | `TASK-17`, `TASK-13`, `TASK-14`, `TASK-16`, `TASK-18`, `TASK-15` (2 subtasks)                        | Waves 1-2                              |
| 4    | `TASK-09` (3 subtasks), `TASK-10`, `TASK-19`, `TASK-20`, and `TASK-08` once `DEPENDENCY-01` lands    | `DEC-006`; the skill for `TASK-08`     |
| 5    | `TASK-21`, `TASK-22`, `TASK-23`                                                                      | `EPIC-01`'s `FEATURE-05`, `FEATURE-07` |

What waves 1-3 change on SMARTHR **by themselves**: the board shows the agents by their names, how long a
task has been in its state, the reviewer and the last ledger line; an instant close is visible as one;
the list and the review queue answer "what is on my plate" without opening cards.

**What they do not change until the skill does:** no app-side task fills the QA or ASIGNADA column of
SMARTHR. Waves 1-2 are the read side; the columns fill only once the skill accepts the `REVIEW` and
`ASSIGNED` words (`DEPENDENCY-01`) and the agents write them. That is the other repository.

## 6. Decisions

| #         | Decision                                                                                                                    | Recommended                                                                                                                        |
| --------- | --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `DEC-005` | Which skill line do the ledger changes target: upstream tables, this repo's YAML fork, or a merged one?                     | Upstream tables first, because the only external project uses them. Keep this repo on its fork; do not migrate it. Converge later. |
| `DEC-006` | May a document's `DONE` move a task out of QA without approval, and must a reviewer be named and differ from the developer? | A per-project switch, off by default (no change today); on: a document `DONE` in QA raises a conflict, and a reviewer is required. |
| `DEC-004` | `D2`, `D5` of the earlier plan.                                                                                             | `D5` is reframed: see C6.                                                                                                          |

## 7. Not verified

- Nothing was run: the status mapping, the sync's lack of a permission check and the audit origin are
  from reading the code. The first task that touches each starts with a test that proves it.
- Whether the app reads the upstream `Name` column: not checked (`GAP-43` starts there).
- Upstream's scripts at `15805b1` were not executed, and the PowerShell scripts were only skimmed.

## Appendix: queries behind the numbers

Run against the persistent Postgres (`pmhybrid-prod-postgres-1`, database `pmhybrid`), 2026-10-13.

```sql
-- Finding 3: tasks documented after the fact (a start entry and a close entry minutes apart)
with s as (
  select "taskExternalId" ext,
         min("timestampFromLog") filter (where "statusWord" like 'IN_PROGRESS%') started,
         max("timestampFromLog") filter (where "statusWord" = 'DONE') done
  from "AgentLogEvent" group by 1)
select count(*) closed_tasks,
       count(*) filter (where done - started < interval '5 minutes') under_5_min,
       count(*) filter (where done - started < interval '1 minute') under_1_min,
       count(*) filter (where done - started >= interval '1 hour') an_hour_or_more
from s where started is not null and done is not null and done >= started;
-- 358 tasks: 117 under 5 minutes, 91 under 1 minute, 56 an hour or more

-- Status of every task in SMARTHR (no ASIGNADA, no QA)
select status, count(*) from "Task" where "deletedAt" is null group by 1;
```
