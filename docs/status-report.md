# Status report and history

Status: the daily snapshot (Roadmap TASK-46) and the rebuilding of past days (TASK-47) exist. The weekly report in
Markdown (TASK-48) and the Informe tab (TASK-49) add their parts here. The idea is FEATURE-08 of
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
