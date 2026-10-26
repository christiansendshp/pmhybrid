# What changed: since the last visit, notifications and summaries

Status: all of FEATURE-06 exists: the marker and the summary of what is new in the API (Roadmap TASK-38), the Panel
section (TASK-39), the blocked and unblocked notifications (TASK-40), the phase completed notification (TASK-41) and
the periodic summary (TASK-42). DEC-004 D3: everything stays in the app, nothing is sent out.

## The marker (`ProjectSeen`)

One row per person and project: `seenAt`, until when the person has seen the news of that project. **Only the
person moves it, with an explicit call** (BR-017): opening a task from the list, or the project itself, does not,
because it would hide the rest of the news. Nobody's marker affects anybody else's. A person with no row for a
project is read from 7 days back, which is also what a project they have just joined shows.

## The summary (`apps/api/src/modules/dashboard/since-visit.service.ts`)

`GET /dashboard/since-last-visit` gives, for each active project the caller is an active member of **and that has
news**, what happened since their marker:

| Kind        | What counts                                                                                                                                                                                                                                                                                                             |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `done`      | Tasks whose `completedAt` is after the marker.                                                                                                                                                                                                                                                                          |
| `blocked`   | Tasks in the Blocked table now whose `blockedSince` is after the marker.                                                                                                                                                                                                                                                |
| `unblocked` | Tasks the audit trail shows taken out of the Blocked table for another table after the marker (`blockedMove`, the rule the notifications use too) that are neither blocked nor done now. A row that vanished is not another table, a move out that completed the task is `done`, and a task blocked again is `blocked`. |
| `newScope`  | Tasks whose `createdAt` is after the marker.                                                                                                                                                                                                                                                                            |
| `conflicts` | A count of the conflicts detected after the marker that are still open.                                                                                                                                                                                                                                                 |

Each task kind is `{ count, tasks }`: the count is of all of them, the list names the first 10 (`id`,
`externalId`, `title`). They are the tasks that count towards the progress (deleted ones and the cards that are not
work are out), as in the rest of the app. `since` says where each project's count starts, so the page can say it.

`POST /dashboard/since-last-visit/seen` with `{ projectIds? }` moves the marker to now for those projects, or for
all of the caller's when none is named, and answers the ones it moved. A project the caller does not belong to is
left alone, whatever was asked, and a list that is not a list of ids is a 400.

The same builder is what the periodic summary (TASK-42) will read over a period instead of a marker.

## The section of the Panel ("Desde tu última visita")

`apps/web/src/app/features/dashboard/since-visit.*`, the first thing under the title of the Panel. It reads
`GET /dashboard/since-last-visit` **on its own**, apart from the rest of the Panel: if that read fails it says so
("No se pudo leer lo que cambió desde tu última visita. El resto del panel sigue igual.") and the figures and the
activity below are untouched.

- Each project with news is a card: the project (a link to its board), "desde el <date and time>" (where its count
  starts) and "Marcar como visto".
- Inside it, one line per kind that has something, **in the order a person has to act**: tasks blocked, new
  conflicts (with "Ver los conflictos"), tasks unblocked, tasks done, tasks new. Every count is a sentence ("1 tarea
  bloqueada", "14 tareas terminadas"), never a bare number, and the blocked and conflict lines carry an edge as
  well. The first tasks of a kind are links to their page, with their ID, and "y N más" says how many the list
  leaves out.
- "Marcar como visto" (per project; "Marcar todo como visto" appears only when there is more than one project)
  calls `POST …/seen` and takes what was marked off the list **without reloading**; if the call fails it says
  "No se pudo marcar como visto" and keeps the list. With no project left it says "Nada nuevo desde tu última
  visita", which is also what a person with no news sees from the start.
- The pure part, the sentences and their order, is `core/since-visit.ts` (`newsLines`), with its own tests; the
  component spec checks the reading, the failures, the links and the marking, and the Panel is in the accessibility
  and target-size suites.

## Blocked and unblocked notifications (`TASK_BLOCKED`, `TASK_UNBLOCKED`)

Sent to **the assignee of a task** (Roadmap TASK-40), by one listener on `sync.completed`
(`NotificationsService.notifyBlockedMoves`): it reads the audit events of that run (`ROADMAP_TABLE_CHANGE`, origin
`SYNC`, between the run's start and its end), so none of the places that write the Roadmap table has to say
anything. For each task it takes the **net** move of the run, from where its first change started to where its last
one ended (`netBlockedMoves`), and applies `blockedMove`:

- Into the Blocked table from anywhere else: `TASK_BLOCKED`, with the title, the blocker (`reason`) and the
  decision it needs (`neededDecision`).
- Out of the Blocked table into another table: `TASK_UNBLOCKED`.
- **Not** an unblocking: a row that vanished (it is in no table, not in another), and a change that completed the
  task (it is done). A task blocked and unblocked again within one run is news to nobody.

Nobody is told about their own change: when the person who ran the sync is the assignee, nothing is sent. A task
with no assignee, a deleted one or a finished one tells nobody, and a sync that changes nothing sends nothing; the
runs are one after another under the project's lock, so a change is in the window of one run only. A failure in
the listener is logged and never changes the sync's own outcome. The notification list says each in a sentence
("Tu tarea «…» quedó bloqueada: <reason>. Necesita: <decision>", "Tu tarea «…» ya no está bloqueada").

## Phase completed (`PHASE_COMPLETED`)

Sent once to **every active member** of the project when the last open work task of a phase is done (Roadmap
TASK-41), whoever did it: it is about the phase, not about one person's action. `PhaseCompletionService` counts the
work tasks of each phase (the tasks that count towards the progress, so deleted tasks and the cards that are not
work are out) after either trigger:

- a write of tasks in the app: `WriteBackService.inTransaction`, which every UI, MCP and API write goes through,
  emits `project.tasks-written` (`common/events.ts`) once the transaction has committed, so the announcement never
  describes something that rolled back;
- a synchronization: `sync.completed`.

A phase is complete when it has work tasks and none is open; a phase with no tasks never completes. `Phase.completionNotifiedAt`
is the marker: a complete phase with no marker is announced and gets it (claimed with a conditional update, so two
checks at once announce once); a phase with the marker that has an open task again has it cleared, so finishing it
again is announced again. The migration marks the phases that are complete when it runs, so deploying it does not
announce work finished long ago. A failure in the check is logged and never changes what the write or the sync
answers.

## The periodic summary (`PERIOD_SUMMARY`)

In the app only (DEC-004 D3): nothing is sent out, so there is no channel to run or credential to keep. A job at
**07:00 UTC** (`PeriodSummaryService`, `@Cron`) makes it, from the same builder as "Desde tu última visita"
(`SinceVisitService.newsOf`) but over a **period** instead of a marker:

| Frequency (`Actor.summaryFrequency`) | When it is made  | What it covers  |
| ------------------------------------ | ---------------- | --------------- |
| `DAILY`                              | every day        | the last day    |
| `WEEKLY` (the default)               | on Mondays (UTC) | the last 7 days |
| `NONE`                               | never            |                 |

It makes **one `PERIOD_SUMMARY` per project that has news** for each person who is due one, with the counts of
each kind (`done`, `blocked`, `unblocked`, `newScope`, `conflicts`), the period and the project's name; a
project with nothing new gets none. Only a person is sent one, **never an agent**, whatever its frequency says, and
only an active member of an active project. `Actor.summaryLastSentAt` is claimed with a conditional update before the
summary is made (it must be behind today's midnight UTC), so a restart, a second run the same day or two runs at
once send it once. One person's failure is logged and does not stop the others. `sendDue(now, onlyActorIds?)` is
what the job calls, and what the tests call with a chosen moment and chosen people.

A person chooses the frequency in the notifications panel ("Resumen de lo que cambió": Diario, Semanal, Ninguno,
`apps/web/src/app/layout/app-shell/notification-preferences.ts`), which reads and writes
`GET/PATCH /notifications/preferences`: always their own, from their session. The list says each summary as a
sentence, what needs a person first ("Resumen semanal de «Alpha»: 1 bloqueada, 5 conflictos nuevos, 3 terminadas").

The weekly default means a person who never chose receives one summary per project with news every Monday; they can
turn it off in the panel, and the migration gives it to everyone who already exists.
