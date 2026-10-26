# What changed: since the last visit, notifications and summaries

Status: the marker and the summary of what is new in the API exist (Roadmap TASK-38). The Panel section
(TASK-39), the new notification types (TASK-40, TASK-41) and the periodic summary (TASK-42) build on it and add
their parts here. DEC-004 D3: everything stays in the app, nothing is sent out.

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
