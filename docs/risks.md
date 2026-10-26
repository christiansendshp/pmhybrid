# Risks: signals, critical path and semaphore

Status: the calculator exists (Roadmap TASK-43); the endpoint (TASK-44) and the Riesgos page (TASK-45) build on it
and add their parts here. The idea is FEATURE-07 of `docs/tracking-improvement-plan.md`: say what is going wrong
before someone looks, with signals that **cannot be wrong about the data the app holds**, each saying why. False
positives erode trust faster than missing signals, so a signal that needs a guess is not here.

## The calculator (`apps/api/src/modules/risks/risks.util.ts`)

A pure function, `risksOf({ tasks, dependencies, now, staleAfterHours })`. The caller gives the tasks that count
towards the progress (deleted ones and the cards that are not work are out), their dependencies and the moment it
is read.

### The signals

Only **open** tasks (not `TERMINADA`) have signals.

| Signal                   | Rule                                                                                             | What it says                            |
| ------------------------ | ------------------------------------------------------------------------------------------------ | --------------------------------------- |
| `UNOWNED_IN_DEVELOPMENT` | Status `EN_DESARROLLO` and nobody holds it: no assignee and no owner written in the row.         | The task.                               |
| `BLOCKED_BY_BLOCKED`     | It depends on an open task that sits in the Roadmap's Blocked table.                             | The task, and `blockedBy`: which tasks. |
| `STALE_IN_DEVELOPMENT`   | Status `EN_DESARROLLO` and more than `staleAfterHours` hours (strictly) since its last activity. | The task and `idleHours`.               |
| `OVERDUE`                | It has a due date and the date is before now (strictly).                                         | The task and `dueDate`.                 |

A task that is merely `ASIGNADA`, `QA` or `PENDIENTE` has no owner or activity signal: it is not being worked on.
A dependency on a finished task, or on a task the project does not have, never makes `BLOCKED_BY_BLOCKED`. A
blocked task that depends on nothing blocked is blocked, which the semaphore counts, not blocked _by_ a blocked
one.

### The critical path

The longest chain of open tasks by dependency, **in the order the work has to be done** (the first step first): the
chain that cannot be shorter than its length however many people work. A dependency on a finished task adds
nothing; an edge that would close a cycle is ignored (the cycle is broken at the first task by name), so it never
loops; a task that depends on itself is ignored. When no open task waits on another there is no chain and the path
is empty. Ties are broken by the task's ID, so the same project always gives the same path.

### The semaphore

For the project, for each phase and for each epic (a task of no phase or epic counts only in the project), over its
open tasks:

| Light   | When                                                                                                             |
| ------- | ---------------------------------------------------------------------------------------------------------------- |
| none    | Nothing is open: a finished or empty phase has no light.                                                         |
| `RED`   | Any `OVERDUE` or `BLOCKED_BY_BLOCKED` signal in it.                                                              |
| `AMBER` | Otherwise, any `UNOWNED_IN_DEVELOPMENT` or `STALE_IN_DEVELOPMENT` signal, or any open task in the Blocked table. |
| `GREEN` | Otherwise.                                                                                                       |

Each carries the counts that say why (`open`, `blocked` and the count of each signal), because a light alone says
nothing: the page says it in words (BR-019).
