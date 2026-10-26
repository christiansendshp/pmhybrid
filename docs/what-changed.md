# What changed: since the last visit, notifications and summaries

Status: the marker and the summary of what is new in the API (Roadmap TASK-38) and the Panel section
(TASK-39) exist. The new notification types (TASK-40, TASK-41) and the periodic summary (TASK-42) build on them and
add their parts here. DEC-004 D3: everything stays in the app, nothing is sent out.

## The marker (`ProjectSeen`)

One row per person and project: `seenAt`, until when the person has seen the news of that project. **Only the
person moves it, with an explicit call** (BR-017): opening a task from the list, or the project itself, does not,
because it would hide the rest of the news. Nobody's marker affects anybody else's. A person with no row for a
project is read from 7 days back, which is also what a project they have just joined shows.

## The summary (`apps/api/src/modules/dashboard/since-visit.service.ts`)

`GET /dashboard/since-last-visit` gives, for each active project the caller is an active member of **and that has
news**, what happened since their marker:

| Kind        | What counts                                                                                                                                                                                                                                                              |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `done`      | Tasks whose `completedAt` is after the marker.                                                                                                                                                                                                                           |
| `blocked`   | Tasks in the Blocked table now whose `blockedSince` is after the marker.                                                                                                                                                                                                 |
| `unblocked` | Tasks the audit trail shows taken out of the Blocked table after the marker (`previousValue.roadmapTable` Blocked, new one not) that are neither blocked nor done now. A move out that completed the task is `done`, not `unblocked`; a task blocked again is `blocked`. |
| `newScope`  | Tasks whose `createdAt` is after the marker.                                                                                                                                                                                                                             |
| `conflicts` | A count of the conflicts detected after the marker that are still open.                                                                                                                                                                                                  |

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
