# Risks: signals, critical path and semaphore

Status: all of FEATURE-07 exists: the calculator (Roadmap TASK-43), the endpoint (TASK-44) and the Riesgos page
(TASK-45). The idea is FEATURE-07 of `docs/tracking-improvement-plan.md`: say what is going wrong
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

## The endpoint (`GET /projects/:projectId/risks`)

Any member of the project can read it (`ProjectMemberGuard`); it only reads. It gives the calculator's answer for the
project, with what a page needs to say it:

- `signals`, `criticalPath` and `project` (the semaphore of the whole project), as the calculator gives them.
- `phases`: **every phase of the project, in its own order**, each with its name and semaphore; a phase with nothing
  open (or no task) has the semaphore with no light. `epics`, the same by name.
- `staleAfterHours`: the threshold used, so the page can say "más de 72 h sin actividad".

What it reads, from what the database already holds:

- The tasks **that count towards the progress** (alive, and work; the same filter as the progress and the pace) that are
  not finished. A dependency counts when both tasks are among them.
- A task is **held** (`holdsTask`) with an assignee, or with an owner written in its row; `—` or nothing is nobody.
- A task's **last activity** is the latest of its status change (`statusChangedAt`), the ledger entries about it
  (`AgentLogEvent.timestampFromLog`) and its comments. `updatedAt` is not used: it moves whenever a sync touches the
  row, which says nothing about whether anyone worked on it.
- `Project.staleAfterHours` (72 by default, 1 to 8760, hand-written migration `add_project_stale_after_hours`) is
  changed through `PATCH /projects/:id` like the other project settings, audited, and a value outside the range or not
  a whole number is a 400.

## The Riesgos tab (`/projects/:projectId/risks`)

A tab of the project, next to Seguimiento (`apps/web/src/app/features/risks`). It reads `GET …/risks` **once per visit**
and shows three sections:

1. **Semáforo**: a table with a row for the project, each phase (in its own order) and each epic: the level, the name,
   the **light as a word with a shape of its own** (▲ Rojo, ◆ Ámbar, ● Verde, – Sin trabajo abierto; the colour only
   repeats them) and **why**, in words ("9 tareas abiertas: 1 fuera de plazo, 1 espera a una bloqueada, 1 en
   desarrollo sin responsable, 1 sin actividad en desarrollo, 1 bloqueada"). A light is never alone (BR-019). The table
   scrolls inside its own focusable region when it is wider than the screen, never the page.
2. **Señales**: grouped by kind, what is late or stuck first (fuera de plazo, esperan a una tarea bloqueada, en
   desarrollo y sin responsable, en desarrollo y sin actividad hace más de N), each with its count. Each signal is the
   task as a link to its page and the reason in a sentence ("Debía estar terminada el 20 Oct 2026", "Depende de una
   tarea bloqueada: T-3 …", "Está en desarrollo y lleva 4 días sin actividad"). With none it says so.
3. **Camino crítico**: a sentence ("La cadena más larga de trabajo abierto tiene 2 tareas: T-3 → T-2.") and the tasks
   in the order the work has to be done, each with its status. With no chain it says no open task waits on another.

The pure part (the words, the order of the kinds, the sentences, the lights and their shapes) is `core/risks.ts`, with
its own tests; the page and the settings have component specs, and the page is in the accessibility, mobile-layout and
target-size suites.

The project's settings have a field **"Sin actividad en desarrollo (horas)"** (`staleAfterHours`, 1 to 8760, 72 by
default) with its hint, saved through the project's update like the others.
