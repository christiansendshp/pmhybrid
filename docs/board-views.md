# The board and its views

What the project's board shows is held in its address, so a board can be reloaded, shared, or come back
to from a task, and it is the same board each time (Roadmap UX-02b). This page says what the address
holds and how each filter works. It grows with the views next to the Kanban (`FEATURE-13`).

## The views (Roadmap TASK-17)

A switcher at the top of the page, a navigation landmark called "Vistas del tablero", offers the views
that exist and only those: **Tablero** (`/projects/:id/kanban`, the board, whose address does not
change) and **Lista** (`/projects/:id/list`, below). Every link carries the filters of the view being
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
title as its tooltip), state (with the "Registro: … · PM Hub: …" and "Cierre inmediato" notes), agent
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

## The card

Besides what the board always showed, a card says in words (never by colour alone): the agent with its
kind and model, how long the task has been in its stage ("en QA hace 2 d", from `statusChangedAt`, in
elapsed time so a day boundary or a time zone changes nothing; none for a finished task), the reviewer
while it is in QA, an instant close, a disagreement between ledger and board ("Registro: QA · PM Hub:
EN DESARROLLO"), and, when the card is hovered or has focus, the start of the latest ledger line
(120 characters), which the title link also carries as its description for a screen reader.
