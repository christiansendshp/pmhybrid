# Status report and history

Status: the daily snapshot (Roadmap TASK-46), the rebuilding of past days (TASK-47) and the weekly report in
Markdown (TASK-48) exist. The Informe tab (TASK-49) adds its part here. The idea is FEATURE-08 of
`docs/tracking-improvement-plan.md`: the state of a project should be readable without logging in, and the past state
should be a number and not a reconstruction.

## The daily snapshot (`ProjectSnapshot`)

One row per project and UTC day, **recorded** that day by a job (`SnapshotService`, `@Cron('10 0 * * *')`, 00:10 UTC)
for every **active** project (a paused or archived one gets none). It holds, over the tasks **that count towards the
progress** (alive, and work: the same filter as the progress, the pace and the risks):

| Column          | Meaning                                                                                                    |
| --------------- | ---------------------------------------------------------------------------------------------------------- |
| `day`           | The UTC day the counts are of (a `DATE`).                                                                  |
| `source`        | `RECORDED` (written that day) or `RECONSTRUCTED` (rebuilt later, TASK-47, approximate).                    |
| `total`, `done` | All the tasks, and the finished ones.                                                                      |
| `byStatus`      | The count in each status (`PENDIENTE`, `ASIGNADA`, `EN_DESARROLLO`, `QA`, `TERMINADA`), every key present. |
| `blocked`       | Open tasks in the Roadmap's Blocked table.                                                                 |
| `openConflicts` | Conflicts of the project not resolved yet.                                                                 |
| `progress`      | The project's progress, rounded to a whole percentage; null when there is nothing to average.              |

A project has **one snapshot per day**: the table's unique key is `(projectId, day)` and the job writes with
`skipDuplicates`, so running it twice the same day, a restart, or two runs at once write one row and keep the first.
One project's failure is logged and does not stop the others. `recordDay(now, onlyProjectIds?)` is what the job calls
and what the tests call with a chosen moment and chosen projects.

## The history (`GET /projects/:projectId/snapshots`)

Any member can read it. `?days=` is a whole number from 1 to 365 (30 by default; anything else is a 400) and gives the
last N days, today included, **oldest first**, each as `{ day, source, total, done, byStatus, blocked, openConflicts,
progress }`. A day with no row is simply not in the list: a project that was created yesterday has one day, and a day
the job did not run is a gap, never a zero made up.

## Rebuilding the past (`POST /projects/:projectId/snapshots/reconstruct`)

A project that has existed for months has no snapshots before the job began. A person with `project.update` can ask for
the missing days to be **rebuilt** (`?days=`, 1 to 365, 30 by default); a member without that permission gets a 403
and nothing is written. For each of the `days` days before today (**today is the job's**) it writes a
`RECONSTRUCTED` row, unless that day

- already has a snapshot, recorded or rebuilt (the table's unique key and `skipDuplicates` make this safe: **a recorded
  day is never overwritten**, and asking twice writes nothing the second time), or
- is before the day the project was created (it did not exist, so there is nothing to say; a zero would mislead).

What it knows is only **the dates of the tasks**: `total` and `done` at the end of the UTC day. A task counts from the
day it was created until the day it was deleted (a deleted task is read too, which the live counts leave out), and is
done once its `completedAt` has passed; the cards that are not work are out, as in every count. It is **approximate on
purpose**: a task that was finished and later reopened has lost its `completedAt` and counts as open on the days it
was done. Everything else (`byStatus`, `blocked`, `openConflicts`, `progress`) is **null**, never invented, and the
row says `RECONSTRUCTED` so no page presents it as a recorded figure (BR-020). The answer is `{ written, days[] }`.

## The weekly report (`GET /projects/:projectId/report`)

Any member can read it. It answers `{ generatedAt, from, to, markdown }` for **the 7 days ending now**
(`from` = now − 7 days) and does nothing a person could not read elsewhere: `ReportService` gathers what the app
already computes and `buildReport` (pure) puts it in words, in Spanish, as plain Markdown:

| Section                              | Where it comes from                                                                                                                                                                                                   |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Resumen**                          | The progress now (`ProgressRollupService`) and the tasks done of all; the snapshot of seven days ago (`ProjectSnapshot`); the tasks finished and created in the week; the light of the risks and the number of waits. |
| **Qué se terminó**                   | The tasks whose `completedAt` is in the week, newest first, each with its day.                                                                                                                                        |
| **Ritmo y pronóstico**               | The last complete weeks (`PaceService`) and the forecast sentence of BR-016: a range, or why there is none.                                                                                                           |
| **Qué espera**                       | `WaitingService`: the blocked tasks, the decisions the ledger waits on and the open conflicts, the longest waiting first, with since when; a note when the ledger could not be read.                                  |
| **Riesgos**                          | `RisksService`: the light and what counts against it, the signals with their reason, and the critical path in order.                                                                                                  |
| **En desarrollo** / **Lo siguiente** | The tasks in development, and the tasks assigned and not started.                                                                                                                                                     |

A list names at most **10** and says how many more there are ("…y 4 más"). The progress of a week ago comes from the
snapshot of that day: **with none it says "No hay historia de hace 7 días para comparar", never a zero**, and a day
that was rebuilt (TASK-47) says it is approximate. A project with no tasks gets a report that says so and has no
sections. The tasks are the ones that count towards the progress (deleted ones and the cards that are not work are
out).

**Markdown, not HTML** (BR-021): a task title is data, so `escapeMarkdown` puts a backslash before `\`, `*`, `_`,
`{ } [ ]`, `< >`, `#`, `|` and `~`, turns line breaks into spaces, and the report has no raw HTML tag whatever the
titles say. `apps/api/src/modules/report/report.util.spec.ts` and `apps/api/test/report.e2e-spec.ts` check it.
