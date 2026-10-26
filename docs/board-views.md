# The board and its views

What the project's board shows is held in its address, so a board can be reloaded, shared, or come back
to from a task, and it is the same board each time (Roadmap UX-02b). This page says what the address
holds and how each filter works. It grows with the views next to the Kanban (`FEATURE-13`).

## The views (Roadmap TASK-17)

A switcher at the top of the page, a navigation landmark called "Vistas del tablero", offers the views
that exist and only those: **Tablero** (`/projects/:id/kanban`, the board, whose address does not
change), **Lista** (`/projects/:id/list`), **En revisión** (`/projects/:id/review`), **Por agente**
(`/projects/:id/agents`) and **Línea de tiempo** (`/projects/:id/timeline`), each described below. Every link carries the filters of the view being
left in its address, so the next view shows the same tasks; what only one view has (the board's grouping
and column order, the list's order and page) is not carried. A view that cannot use a filter that is on
says so in words under the switcher (none does today). The current view is marked as the current page,
by weight and underline as well as by colour. A view is added to the switcher when it ships.

Both views are one page: the same toolbar, the same filters, the same address and the same remembered
state, so what is filtered on one is filtered on the other.

## The address

`/projects/:projectId/kanban` is the board. Only what differs from a plain board is in its query, so an
untouched board has a clean address. A value the board does not know is ignored, never an error: a
hand-edited or an old link still opens.

| Parameter   | Meaning                                                             | Values                                                              |
| ----------- | ------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `q`         | Search by title or Roadmap ID                                       | any text                                                            |
| `assignee`  | Assignee                                                            | an actor id, or `__unassigned__`                                    |
| `priority`  | Priority                                                            | `LOW`, `MEDIUM`, `HIGH`, `CRITICAL`                                 |
| `phase`     | Phase                                                               | a phase id                                                          |
| `epic`      | Epic                                                                | an epic id                                                          |
| `blocked`   | Only the blocked                                                    | `1`                                                                 |
| `stale`     | Only the unfinished tasks that have not moved for more than N hours | a whole number from 1 to 8760 (the toolbar offers 24, 72, 168, 720) |
| `kind`      | Only the tasks whose assignee is a person or an agent               | `HUMAN`, `AI_AGENT`                                                 |
| `reviewer`  | Only the tasks this actor was asked to review                       | an actor id                                                         |
| `divergent` | Only the tasks whose ledger and board disagree about the stage      | `1`                                                                 |
| `instant`   | Only the tasks closed within minutes of starting                    | `1`                                                                 |
| `group`     | Swimlanes                                                           | `assignee`, `phase`, `epic`, `priority`                             |
| `sort`      | Order inside every column                                           | `priority`, `dueDate`, `progress`, `updated`, `externalId`          |

The board also remembers, for the length of the session, what each project's board was left with: a
link back to the board that carries no query (a breadcrumb, the tab) finds the filters where they were
left. An address that names a view wins over what was left.

## The list (Roadmap TASK-18)

`/projects/:projectId/list` shows the tasks as a table: ID, title (shortened like a card's, with the whole
title as its tooltip), state (with the "Registro: … · PM Hub: …", "Cierre inmediato" and "Sin fila en el Roadmap" notes), agent
(with its kind and model), reviewer, priority, time in the stage, due date and last update. It does not
load every task: it asks the server for one page of 50 (`GET /projects/:id/task-table`), filtered with the
same filters as the board and ordered by the column the person chose over everything the filters keep,
so the order is the same on every page and a project of any size shows its first page at once.

Its address holds, besides the filters above, `order` (the column: `externalId`, `title`, `status`,
`assignee`, `reviewer`, `priority`, `age`, `dueDate`, `updatedAt`; creation order when absent), `dir`
(`desc`; ascending when absent) and `page` (from 2; the first when absent). A value that makes no sense
is ignored. Changing a filter, or the order, goes back to the first page; a page past the end goes to the
last one there is. Each header is a button that orders by its column (again, the other way round) and
says so with `aria-sort`; "ascending" on the time in the stage is the shortest first. Text is ordered the
way a person reads it ("PMH-2" before "PMH-10"), the status by the board and the priority from the most
urgent, and a task with no value for the column goes last either way. The table scrolls inside its own
region, which has a name and can be reached with the keyboard, so the page does not scroll sideways on a phone.

## The filters of Roadmap TASK-16

All of them narrow the cards already loaded, and they combine with each other and with the older
filters.

- **Without movement** (`stale`): the task has been in its stage for longer than the hours asked, by
  `statusChangedAt` (Roadmap TASK-11). A finished task is never stale: it waits for nothing. A task
  that moved exactly that long ago is not yet stale.
- **Kind of assignee** (`kind`): a person or an agent; a task nobody holds is in neither.
- **Reviewer** (`reviewer`): the tasks that actor was asked to review while they are in QA
  (Roadmap SUBTASK-09.1).
- **Ledger and board disagree** (`divergent`): the stage the ledger's latest entry gives the task
  differs from its status (Roadmap TASK-14). A start in the ledger (`IN_PROGRESS`) agrees with
  development and with QA alike, as the sync reads a coarse row; every other pair that differs is a
  disagreement. A task whose ledger says nothing about its stage never disagrees.
- **Instant closes** (`instant`): the task was closed within the project's threshold of its first
  start in the ledger (Roadmap TASK-12).

## The review queue (Roadmap TASK-19)

`/projects/:projectId/review` shows only the tasks in QA, as a queue per reviewer (Roadmap SUBTASK-09.1):
the queue of whoever looks at it first and named "Tu cola", then the tasks nobody was asked to review ("Sin
revisor"), then the other reviewers by name; in each one the task that has been in QA longest comes first.
Each task shows who developed it, how long it has waited in QA and the start of the last thing the ledger said
about it. **Aprobar** and **Rechazar** are the transitions the board already has (QA to TERMINADA, QA back to
EN_DESARROLLO) with the permissions they already need, `task.qa.approve` and `task.qa.reject`: a person who does
not hold one does not see its button, and the API refuses regardless. Rejecting asks for the reason (it is
required), keeps it as a comment on the task ("Rechazada en revisión: …") before the task goes back, and does
not send the task back if the comment could not be kept. When nothing waits it says so in words. It uses the
same filters and address as the other views.

## The view by agent (Roadmap TASK-20)

`/projects/:projectId/agents` has a lane for every agent that is an active member of the project, **the idle
ones too**, with its tasks by stage (the one that has waited longest first in each), how many it has and, when
the project sets a limit per agent, its work in development against it ("en desarrollo 2/1 ! excedido"; read
against every task of the project, not what the filters leave). The tasks no agent holds, because a person
does or nobody does, are in no lane and are counted in words above them. Below the lanes, a lane marked as
"Sin registrar" lists the names the ledger carries that no registered agent answers to (`GET
/projects/:id/unresolved-names`, Roadmap TASK-02), with how many entries carry each and why: no agent
answers to it, or two do. If that list cannot be read, the view says so and keeps the lanes. It reads what
the board and the workload read, and nothing more than that one list.

## The timeline (Roadmap TASK-23)

`/projects/:projectId/timeline` shows the tasks by phase, each as the stretch of time it was worked on, on one
axis from the earliest start to now (marks every day, week or month, whichever keeps them to about eight).
Phases are in their order, the tasks of no phase are a last group ("Sin fase"), and a phase none of the tasks
the filters keep belongs to is left out. A phase's header says how many tasks it has, the days it covers and how
many were never started ("sin iniciar"), and a thin bar shows that span. A phase opens and closes with its
button; when more than 80 tasks are drawn only the phases with something open start open, and **Abrir todas** /
**Cerrar todas** do the rest. It uses the same filters and address as the other views.

A task is drawn when it was started, and a bar is:

|                   | Starts                                                                                                                                  | Ends                                                                                      |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| In the ledger     | the first `IN_PROGRESS` entry (the agent's own clock)                                                                                   | the last `DONE` entry, if the task is done; otherwise it is **open** and fades out to now |
| Not in the ledger | its creation, but only once it is in development, in QA or done (one still waiting has nothing to draw and is counted as "sin iniciar") | its completion time, if done; otherwise open                                              |

A close dated before the start (a clock that was wrong) says nothing: the completion time of the task, or the
time it last changed, ends the bar instead, and a done task with no usable date is a mark at its start. A task
the ledger closed but the board does not show as done (it was reopened) is open: the board decides whether it
is done. A task **closed instantly** (Roadmap TASK-12: under the project's threshold after its first
`IN_PROGRESS`) is a **mark** at its close, not a bar of no width, and so is any close under a minute. Bars from
the ledger are solid, bars whose dates come from the task itself (no ledger entry) are striped; the legend says
so, and so does every row in words: its dates, how long it lasted and where they come from. The drawing is
hidden from assistive technology; the words are the content. The ledger's dates come from `GET
/projects/:id/metrics/spans`; if that cannot be read the view says so and draws from the tasks' own dates, with
no instant closes marked. Nothing here is a plan: the documents carry no planned dates, so none is drawn.

## Advisory limits on the work in progress (Roadmap TASK-15)

A project may set three limits in its settings (`project.update`): tasks in development, tasks in QA and
tasks in development **per agent**, each a whole number from 1 to 999, or empty for none (every project
starts with none). They warn and never block: a move into a full column goes through.

On the board without swimlanes a column with a limit reads "EN DESARROLLO 4/3 ! excedido" when it is
past the limit, and "EN DESARROLLO 3/3" when it is full without being past it; the counter is the whole
project's count in that status, not what the filters leave. Grouped by assignee, the lane of an agent
reads "en desarrollo 4/3 ! excedido" against the per-agent limit (the tasks of that agent in
development; people have no limit). The excess is a word and a mark, never colour alone. After a move
that leaves a column past its limit the board says so in a status line ("El límite avisa, no impide
mover tareas"). A project with no limit shows none of this.

## The card

Besides what the board always showed, a card says in words (never by colour alone): the agent with its
kind and model, how long the task has been in its stage ("en QA hace 2 d", from `statusChangedAt`, in
elapsed time so a day boundary or a time zone changes nothing; none for a finished task), the reviewer
while it is in QA, an instant close, a disagreement between ledger and board ("Registro: QA · PM Hub:
EN DESARROLLO"), that the task has **lost its row** ("Sin fila en el Roadmap: hay un conflicto
abierto", with a link to the Conflicts page: the row left the Roadmap, the ledger does not say the task
was closed, and the conflict about it is still open; Roadmap GAP-47, `rowGone` on the card), and, when
the card is hovered or has focus, the start of the latest ledger line
(120 characters), which the title link also carries as its description for a screen reader.
