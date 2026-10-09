# Project tracking: analysis and improvement plan

- **Status:** PROPOSAL. Nothing in this document is built; the work is registered in
  `docs/Roadmap.md` as `EPIC-01` with `FEATURE-01` to `FEATURE-09`, all `IDEA`, so nobody
  takes it before it is approved.
- **Requested:** 2026-10-09, "analyze how the system works and propose improvements to the
  tracking of projects".
- **Evidence:** the persistent instance as of 2026-10-09 (project SMARTHR, the only real
  one) and the code at `develop`. Every number below comes from a query listed in the
  appendix; what is inference says so.

## 1. How tracking works today

```
Roadmap.md + Agentslog.md  --sync every 5 min-->  PostgreSQL  -->  views
  (the project's own docs)     (conflicts raised,                     Panel, My projects,
                                write-back to the docs)               Kanban, Phases and
                                                                      progress, Workload,
                                                                      Conflicts, Audit, Documents
```

- The documents stay the source of truth (ADR-001). A task is a Roadmap row; the Agentslog
  is the ledger of what the agents did.
- Sync is solid: about 3,700 runs in 16 days and none failed. Every change is audited
  (about 2,000 events), conflicts are surfaced and never auto-resolved, and a task change and
  the write of its document are one transaction.
- The views answer **"what is the state right now"**: counts by status, a progress tree,
  who holds what, five "latest ..." feeds. They are snapshots. Nothing in the product
  has a time axis, and nothing says what needs attention.

## 2. What the live data says

SMARTHR, 2026-10-09.

| #   | Finding                                                                                                                                                                                            | What it means for tracking                                                                                                      |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 293 tasks: 246 done (84 %), 46 pending, 1 in development.                                                                                                                                          | The headline number is healthy, and says nothing about pace or what is left.                                                    |
| 2   | **No task has an assignee, a due date, a priority or a progress value.** One active member.                                                                                                        | Workload, overdue, "active agents" and priority views are empty by construction for this project.                               |
| 3   | The Agentslog holds 978 entries from 2026-08-10, by 5 agents (469 + 352 + 122 + 31 + 4).                                                                                                           | The richest history in the system, used only for a "latest events" feed.                                                        |
| 4   | **387 of the 978 entries (40 %) are about 280 task IDs that are not tasks in PM Hub**: 251 of them have a DONE entry, 29 never closed. 508 IDs are logged, 293 exist.                              | Work that was opened and closed between two syncs, or never listed, is invisible to the board, the progress and the throughput. |
| 5   | 159 tasks carry an owner in the Roadmap (the ones I sampled read `agent@timestamp`), and none is resolved to an assignee.                                                                          | The agents that do the work are not actors of the project, so "who is doing what" has no answer.                                |
| 6   | The log has 34 distinct status words (`DONE`, `DONE (chunk 1/2)`, `IN_PROGRESS (revisión, 3 correcciones...)`, `BLOQUEADO_PO`, `SUPERADO`, `DESCARTADA`...).                                       | The state of the work is in the log but cannot be counted without normalizing it.                                               |
| 7   | Tasks created vs completed per week (created = first seen by sync): 10/4, 103/107, 180/135.                                                                                                        | The pending count only looks small because scope keeps arriving: this week so far, 45 more tasks came in than were closed.      |
| 8   | Done entries in the log per week: 28, 5, 16, 8, 29, 105, 65, 135, 181.                                                                                                                             | Done entries went from 29 to 181 a week in four weeks. This is the trend a manager wants and the product cannot show.           |
| 9   | Time from claim to done is measurable for **19 of 246** done tasks (median 0.9 h, p90 142 h). Most log entries are written once, when the work ends: median span between a task's entries is 25 s. | Cycle time cannot be derived from the log as it is written today. A convention change is needed, not only a chart.              |
| 10  | 182 dependency links, 11 tasks with a block reason, 0 with "decision needed", 5 conflicts open, 4 notifications in total and all 4 unread.                                                         | Blocking exists in the data and is not surfaced; the notification channel is barely used.                                       |
| 11  | `SyncRun` grows by about 230 rows a day, with no retention.                                                                                                                                        | A small operational debt that will show up as a slow project page.                                                              |

Caveat on #7: a task opened and closed inside one sync interval is never created as a row
(that is finding #4), so created is a floor.

## 3. Questions a manager cannot answer today

| Question                                                   | Why not                                                                  | Proposal   |
| ---------------------------------------------------------- | ------------------------------------------------------------------------ | ---------- |
| At what pace are we moving, and when do we finish?         | No time axis, no throughput, no forecast.                                | FEATURE-01 |
| What work happened that is not on the board?               | Log entries without a task are not shown anywhere.                       | FEATURE-02 |
| Who (which agent) is doing what?                           | Agents seen in the log are not actors; owner text is not resolved.       | FEATURE-03 |
| What is the real state of the work in the log?             | Status words are free text.                                              | FEATURE-04 |
| What is waiting, and on whom?                              | Blocks, decisions and conflicts are in different places and have no age. | FEATURE-05 |
| What changed since I last looked?                          | Only "latest N" feeds; six notification types; nothing periodic.         | FEATURE-06 |
| What is at risk?                                           | No stale, no unowned, no critical path, no per-phase signal.             | FEATURE-07 |
| How do I share the state with someone who does not log in? | No report or export; no history of past states.                          | FEATURE-08 |

## 4. Proposals

Sizes: **S** a day or less, **M** two to four days, **L** a week or more of focused work.
Each one keeps the invariant of the product: documents are never silently overwritten,
and everything derived is derived, not typed in.

### FEATURE-01. Pace, progress over time and forecast (M)

- **Problem:** findings #1, #7, #8. Progress is a percentage today; it has no history.
- **Change:** a `Seguimiento` tab in the project with: tasks completed per week (from
  `Task.completedAt`, which 246 of 246 done tasks have), created vs completed per week
  (is the backlog growing?), burn-up per phase, and a **forecast as a range** ("at the pace
  of the last 2 and 4 weeks, the open work ends between D1 and D2"), always shown with the
  scope growth next to it, because a forecast that ignores incoming scope is wrong in
  exactly the case the data shows.
- **Technical:** `GET /projects/:id/metrics?weeks=` computed from existing columns; no
  migration. A pure calculator with unit tests, like `ProgressCalculator`.
- **Acceptance:** for SMARTHR the weekly figures equal the SQL in the appendix; with fewer
  than 2 weeks of data the forecast says "not enough history" instead of a date.
- **Risk:** low. The honest unknown is what to do with the 280 invisible IDs; see FEATURE-02.

### FEATURE-02. Work logged without a task (M, needs decision D1)

- **Problem:** finding #4, 40 % of the ledger.
- **Change:** list "Registro sin tarea" per project (ID, first and last entry, agents, last
  status), with a link to the log entry. Then, as a choice and not by default, **import them
  as completed tasks** with `sourceOrigin = AGENTSLOG`, so the progress, the throughput and
  the history include them.
- **Technical:** the reconciler already matches `AgentLogEvent.taskExternalId`; the list is a
  query on `taskId IS NULL`. Import needs a new `TaskSourceOrigin` value and a migration.
- **Decision D1:** do these count in the project's progress? Counting the 251 that closed
  moves "done" from 246 of 293 (84 %) to 497 of 573 (87 %), and changes every figure people
  already know; the 29 that never closed would join the open work. Recommended: show them
  first, count them only after you have seen them.
- **Risk:** medium, for the change in the numbers, not for the code.

### FEATURE-03. Agents as the responsible actors (M)

- **Problem:** findings #2 and #5.
- **Change:** when the log or the owner text names an agent that is not an actor, offer to
  register it (name, kind AI_AGENT, member of the project); once registered, resolve
  `agent@timestamp` to the assignee and to `ownerClaimedAt`. Workload and "active agents"
  start to answer.
- **Technical:** the document's owner already resolves to a member when it matches
  (`GAP-35a`); this adds the suggestion and the `name@time` form. Registering an actor is an
  `actors.manage` action: the suggestion is shown, never done silently.
- **Acceptance:** for SMARTHR, after registering the 5 agents, at least the 159 tasks with an
  owner have an assignee and the Workload page lists the 5.
- **Risk:** low. Model names change over time (`claude-sonnet-5` and `claude-sonnet-5-5`), so
  the suggestion must be per name and not guess families.

### FEATURE-04. A normalized status for each log entry (S)

- **Problem:** finding #6.
- **Change:** `AgentLogEvent.canonicalStatus` (DONE, IN_PROGRESS, PAUSE, BLOCKED, DROPPED,
  SUPERSEDED, FINDING, OTHER) derived from the status word, with the original kept and the
  qualifier (`(chunk 1/2)`) as a note. Counted and filtered in the views.
- **Technical:** one pure function with a table of synonyms (`BLOQUEADO_PO`, `DESCARTADA`,
  `SUPERADO`), a migration for the column and a backfill from the existing 978 rows.
- **Risk:** low. Unknown words fall to `OTHER` and are listed so the table can grow.

### FEATURE-05. What is waiting, and on whom (M)

- **Problem:** finding #10. A block, a decision and a conflict are three places and none
  has an age.
- **Change:** a `Esperando` section (project page and Panel): blocked tasks with the reason
  and **how long**, decisions needed and **from whom** (the log already says `BLOQUEADO_PO`),
  conflicts open, and the dependencies that hold other tasks. One list, oldest first.
- **Technical:** needs the time a task entered the blocked state; today only the current
  state is stored. Derive it from `AuditEvent` (status changes are audited) and store
  `blockedSince` going forward. Per-phase and per-epic blocked counts (already a known gap)
  come with it.
- **Risk:** low to medium: reading the age from the audit trail for rows before the column.

### FEATURE-06. What changed, and a periodic summary (M, needs decision D3)

- **Problem:** finding #10, only 4 notifications in total. Six types exist (sync failed,
  conflicts raised, conflict resolved, assigned, reassigned, commented).
- **Change:** "Desde tu última visita" at the top of the Panel (done, blocked, unblocked,
  new scope, new conflicts, per project). New notification types: blocked, unblocked,
  decision needed, phase completed, task stale. A **daily or weekly summary** per person,
  chosen in their profile.
- **Technical:** a last-seen marker per actor and project; the summary is the same query as
  the section. Delivery channel is the decision: in-app only, or e-mail or a webhook.
- **Risk:** medium: notification noise. Default to the summary, not to one message per event.

### FEATURE-07. Risk signals (L)

- **Problem:** nothing says what is going wrong before someone looks.
- **Change:** a semaphore per phase and per epic and a list of signals: in development with
  no activity for N hours, **in development with no owner**, due date passed (when there is
  one), blocked by a task that is itself blocked, and the **critical path** over the 182
  dependency links (the open chain with the most tasks behind it).
- **Technical:** the cycle check already holds the graph in memory
  (`IMPROVEMENT-01a`); the longest open chain is a pass over it. Thresholds are project
  settings with defaults.
- **Risk:** medium: false positives erode trust faster than missing signals. Start with the
  two that cannot be wrong: unowned in development, and blocked by a blocked task.

### FEATURE-08. Shareable status report and history (L)

- **Problem:** the state is only visible by logging in, and the past state is not kept.
- **Change:** a weekly **status report** (Markdown first, PDF after) built from FEATURE-01,
  05 and 07: progress, pace, what finished, what is waiting, risks, next. A daily
  `ProjectSnapshot` so "how were we two weeks ago" is a number and not a reconstruction.
- **Technical:** a `ProjectSnapshot` table (project, day, counts by status, progress,
  blocked, open conflicts), written by the scheduler; the report is a template over the
  metrics endpoint. A snapshot can be rebuilt from `completedAt` and the audit trail for the
  past, approximately and labelled so.
- **Risk:** low for the table, medium for the PDF (a rendering dependency).

### FEATURE-09. Operational hygiene (S)

- **Change:** retention for `SyncRun` (keep the last N and every failure; about 230 rows a
  day today) and for read notifications; a documented Postgres backup (`pg_dump` on a
  schedule, restore tested) for the persistent stack, which holds the only copy of the
  audit trail and the LLM configuration.
- **Risk:** low. The backup is the one item here whose absence can lose data.

## 5. Plan

Order is by value per risk, and each wave is usable on its own.

| Wave | Contents                                       | Why this order                                                                                        | Size    |
| ---- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------- |
| 1    | FEATURE-03, FEATURE-04, FEATURE-01, FEATURE-09 | Only existing data; unblocks Workload and gives the first time axis. 09 rides along as it is small.   | M+S+M+S |
| 2    | FEATURE-02, FEATURE-05                         | Shows what is hidden (40 % of the ledger) and what is waiting. 02 needs D1 before it counts anything. | M+M     |
| 3    | FEATURE-06, FEATURE-07                         | Needs waves 1 and 2: the summary and the risk signals are built on those queries.                     | M+L     |
| 4    | FEATURE-08                                     | The report is only as good as what it summarizes; do it last.                                         | L       |

Dependencies: 01 uses nothing; 03 before the owner-based parts of 05 and 07; 04 before
02 (the import needs the canonical status to know which entries closed the work); 05 before
06 and 07.

**Measures of success** (checked on SMARTHR):

1. The Workload page lists the agents and the tasks they hold (today: empty).
2. The project page answers "when do we finish" with a range and shows whether scope is
   growing (today: neither).
3. Every ledger entry has a canonical status and none of the 280 IDs is unseen.
4. "What is waiting" shows each item with its age, and the 11 blocked tasks are in it.
5. A person who opens the Panel after two days is told what changed without searching.

## 6. Decisions I need from you

| #   | Decision                                                                                   | Recommended                                                                                                   |
| --- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| D1  | Do work logged without a task count in the project's progress?                             | Show it first (FEATURE-02), count it after you have seen it.                                                  |
| D2  | May the system register the agents it sees in the log as project members?                  | Suggest, and register on one click by someone holding `actors.manage`. Never silently.                        |
| D3  | How are summaries delivered?                                                               | In-app first. E-mail or a webhook only if you will use them: each is a credential and a failure mode to run.  |
| D4  | Should the Roadmap carry dates (`due`, `target`) so overdue and milestones mean something? | Yes, for phases only: a target date per phase is enough for a semaphore without making people date 300 tasks. |
| D5  | Should agents write a start entry when they claim a task, so cycle time can be measured?   | Yes: it is a line in the agents' rules, and it is the only way to get cycle time (finding #9).                |

## 7. Not proposed, and why

- **Estimates and story points.** Nobody estimates here and the data does not have them; the
  pace of finished tasks is a better predictor than guesses typed after the fact.
- **A portfolio view across projects.** There is one real project. The summary that exists
  already covers the demo ones; revisit with a second real project.
- **Time tracking.** The agents' time is not a cost PM Hub can see, and people's time is not
  tracked in the documents. Cycle time (D5) gives the useful part.
- **Replacing the documents with the database as the place to plan.** It would break the
  invariant that makes the product trustworthy (ADR-001).

## Appendix: queries behind the numbers

Run against the persistent Postgres (`pmhybrid-prod-postgres-1`, database `pmhybrid`).

```sql
-- #1, #2: status and field completeness
select status, count(*) from "Task" where "deletedAt" is null group by 1;
select count(*) filter (where "assigneeActorId" is not null) assigned,
       count(*) filter (where "dueDate" is not null) with_due,
       count(*) filter (where priority is not null) with_priority,
       count(*) filter (where "progressPercent" is not null) with_progress
from "Task" where "deletedAt" is null;

-- #3, #4: the ledger and what has no task
select count(*), min("timestampFromLog"), max("timestampFromLog"), count(distinct "agentName"),
       count(distinct "taskExternalId") from "AgentLogEvent";
select count(*) filter (where "taskId" is null) events_without_task,
       count(distinct "taskExternalId") filter (where "taskId" is null) ids_without_task
from "AgentLogEvent";

-- #4: of the task-less IDs, how many closed
with ids as (select "taskExternalId" ext, bool_or("statusWord" like 'DONE%') closed
             from "AgentLogEvent" where "taskId" is null group by 1)
select count(*), count(*) filter (where closed), count(*) filter (where not closed) from ids;

-- #6: status words
select "statusWord", count(*) from "AgentLogEvent" group by 1 order by 2 desc;

-- #7, #8: pace
select date_trunc('week', "completedAt") wk, count(*) from "Task"
where "completedAt" is not null and "deletedAt" is null group by 1 order by 1;
select date_trunc('week', "createdAt") wk, count(*) from "Task" where "deletedAt" is null group by 1 order by 1;
select date_trunc('week', "timestampFromLog") wk, count(*) filter (where "statusWord" like 'DONE%')
from "AgentLogEvent" group by 1 order by 1;

-- #9: cycle time where the claim time is known
select count(*), percentile_cont(0.5) within group (order by extract(epoch from ("completedAt" - "ownerClaimedAt"))/3600)
from "Task" where "ownerClaimedAt" is not null and "completedAt" > "ownerClaimedAt" and "deletedAt" is null;

-- #10: blocking, links, conflicts, notifications
select count(*) filter (where "blockedReason" is not null) blocked,
       count(*) filter (where "neededDecision" is not null) needs_decision from "Task" where "deletedAt" is null;
select count(*) from "TaskDependency";
select count(*) from "Conflict" where "resolvedAt" is null;
select count(*) filter (where "readAt" is null), count(*) from "Notification";
```
