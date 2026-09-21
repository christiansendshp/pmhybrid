# Agents log

Append-only ledger and the source of truth for task ownership. Older
segments live in `docs/history/`.

## Entry format

```markdown
## [YYYY-MM-DDTHH:mm:ssZ] | agent | TASK-ID | IN_PROGRESS

- Summary: what the agent will do or did
- Files: paths or component names (optional)
- Verify: command and result, or "pending" (required for DONE)
- Pause: CATEGORY - detail (required for PAUSE)
```

## Previous segment

- Archive: `docs/history/Agentslog-20260921-001.md`
- SHA-256: `84367303778b51b1edbfc4c4cfedeb8a02d7622d90ff0e75073dd9dbadd6ac86`

## Entries

## [2026-09-16T11:56:43Z] | claude-sonnet-5 | GAP-20 foundation | IN_PROGRESS

- Summary: carried forward from docs/history/Agentslog-20260921-001.md at rotation

## [2026-09-16T12:01:23Z] | claude-sonnet-5 | GAP-20 dashboard | IN_PROGRESS

- Summary: carried forward from docs/history/Agentslog-20260921-001.md at rotation

## [2026-09-16T12:06:40Z] | claude-sonnet-5 | GAP-20 team | IN_PROGRESS

- Summary: carried forward from docs/history/Agentslog-20260921-001.md at rotation

## [2026-09-16T12:12:43Z] | claude-sonnet-5 | GAP-20 roles/audit/progress | IN_PROGRESS

- Summary: carried forward from docs/history/Agentslog-20260921-001.md at rotation

## [2026-09-16T12:16:08Z] | claude-sonnet-5 | GAP-20 copy pass 1 | IN_PROGRESS

- Summary: carried forward from docs/history/Agentslog-20260921-001.md at rotation

## [2026-09-16T12:20:30Z] | claude-sonnet-5 | GAP-20 kanban/task-form | IN_PROGRESS

- Summary: carried forward from docs/history/Agentslog-20260921-001.md at rotation

## [2026-09-16T12:22:55Z] | claude-sonnet-5 | GAP-20 task-detail | IN_PROGRESS

- Summary: carried forward from docs/history/Agentslog-20260921-001.md at rotation

## [2026-09-16T12:29:31Z] | claude-sonnet-5 | GAP-20 copy pass 2 | IN_PROGRESS

- Summary: carried forward from docs/history/Agentslog-20260921-001.md at rotation

## [2026-09-21T21:00:05Z] | claude | UX-02a | IN_PROGRESS

- Summary: The shell and the page overflow at 390 px: one-row header, scroll cues for the navigation and tables, no horizontal page scroll, Spanish nav label, layout check in the Playwright suite
- Verify: pending

## [2026-09-21T21:09:00Z] | claude | UX-02a | DONE

- Summary: The shell and the page overflow at 390 px: the header is two rows and 85 px instead of three and 105 (brand and actions, then the navigation), a bell with the unread count stands in for the word Notificaciones (still its accessible name), the signed-in name is dropped on a phone; the primary and project navs and every data table fade where they scroll on (ScrollCue writes data-scroll-more, a mask does the rest) and the navs scroll the active link into view; the add-member row wraps and the conflict diff wraps, so no route scrolls the page sideways at 360 or 390 px, which the Playwright suite now checks; the primary nav label is Spanish.
- Files: apps/web/src/app/shared/scroll-cue.ts,apps/web/src/app/layout/app-shell/app-shell.html,apps/web/src/app/layout/app-shell/app-shell.scss,apps/web/src/app/features/project-dashboard/project-dashboard.scss,apps/web/src/styles.scss,apps/web/a11y/mobile-layout.a11y.spec.ts,apps/web/DESIGN.md
- Verify: web unit 248 and eslint clean; Playwright a11y 41 pass (axe on every route, layout at 360 and 390 px); web build ok

## [2026-09-21T21:09:57Z] | claude | BUG-09 | IN_PROGRESS

- Summary: Read a rotated ledger whose pointer is relative to the repository root
- Verify: pending

## [2026-09-21T21:17:45Z] | claude | BUG-09 | DONE

- Summary: A rotated ledger is read whichever way its pointer is written: the archive path is tried as written and then without a leading docs/, because the latest skill's rotate writes docs/history/... from the repository root while files are read from the docs folder. The hash is still verified. Before, a DONE entry that had rotated out was never seen and a task completed before the rotation and taken out of the Roadmap raised a false 'row disappeared' conflict (GAP-38 did in this repository's own project).
- Files: apps/api/src/modules/synchronization/agentslog-ingestion.service.ts,apps/api/src/modules/synchronization/agentslog-ingestion.service.spec.ts,apps/api/test/synchronization.e2e-spec.ts,docs/synchronization.md
- Verify: api unit 455 and e2e 300 pass (coverage 88.0); api lint and nest build ok

## [2026-09-21T21:18:22Z] | claude | UX-02b | IN_PROGRESS

- Summary: Kanban: bounded columns that say how many more cards there are, a board that starts near the top on a phone, filters kept in the URL
- Verify: pending

## [2026-09-21T21:31:17Z] | claude | UX-02b | DONE

- Summary: The Kanban on a phone and its way back from a task: columns stack instead of scrolling sideways and show their first eight cards with a Mostrar N mas button (a card dropped on a column opens it), the filters and the view fold behind Filtros y vista (N) and the project's members behind Miembros (N) via a Viewport media-query signal, the page went from 10,805 to 3,733 px at 390 px; the search, filters, grouping and order are in the address (defaults omitted, replaced not pushed) and a BoardMemory gives a board reached without a query the one it was left with. Found and fixed on the way: the task detail's Tablero and Volver al tablero links pointed at /tasks/kanban, a task that does not exist, because ../kanban is relative to a route of two segments; they now go back to the board with its filters.
- Files: apps/web/src/app/core/board-query.ts,apps/web/src/app/core/viewport.ts,apps/web/src/app/features/kanban/kanban.ts,apps/web/src/app/features/kanban/kanban.html,apps/web/src/app/features/kanban/kanban.scss,apps/web/src/app/features/task-detail/task-detail.html,apps/web/src/app/features/project-dashboard/project-dashboard.html,apps/web/a11y/board-navigation.a11y.spec.ts,apps/web/DESIGN.md
- Verify: web unit 273 and eslint clean; Playwright a11y 48 pass (axe on every route, layout at 360 and 390 px, board navigation); web build ok

## [2026-09-21T21:32:14Z] | claude | UX-02c | IN_PROGRESS

- Summary: Settings form hints and read-only legibility, 24 px targets, unnamed selects
- Verify: pending

## [2026-09-21T21:38:52Z] | claude | UX-02c | DONE

- Summary: Settings, small targets and unlabeled controls: the Settings fields size their hints dynamically (a long hint no longer overlaps the next field) with a roomier grid; a form that can only be read carries settings--readonly, which lifts Material's disabled tokens back to full contrast (text was 38% alpha); the remove-role button is 24 px and the dashboard activity and progress-tree links are at least 24 px tall, checked on every route by a Playwright target-size spec; the audit-log and task-detail selects are named for what they do.
- Files: apps/web/src/app/features/project-settings/project-settings.html,apps/web/src/app/features/project-settings/project-settings.scss,apps/web/src/app/features/project-dashboard/project-dashboard.scss,apps/web/src/app/features/dashboard/dashboard.scss,apps/web/src/app/features/phases-progress/progress-task-node.scss,apps/web/src/app/features/audit-log/audit-log.html,apps/web/src/app/features/task-detail/task-detail.html,apps/web/a11y/target-size.a11y.spec.ts,apps/web/DESIGN.md
- Verify: web unit 275 and eslint clean; Playwright a11y 60 pass (axe on every route, layout at 360 and 390 px, board navigation, no target under 24 px); web build ok

## [2026-09-21T21:38:54Z] | claude | UX-02 | IN_PROGRESS

- Summary: Closing the umbrella: 02a-02c are done
- Verify: pending

## [2026-09-21T21:38:55Z] | claude | UX-02 | DONE

- Summary: Mobile layout, Kanban size and Settings overlaps: at 390 px the header is two rows and 85 px, no route scrolls the page sideways (checked at 360 and 390), navigations and tables fade where they go on, the Kanban stacks bounded columns with its filters in the address, the Settings hints no longer overlap and the read-only form is legible, every target is at least 24 px and the selects are named.
- Files: docs/Roadmap.md,apps/web/DESIGN.md
- Verify: All three slices done and verified: web unit 275 and eslint clean; Playwright a11y 60 pass (axe on every route, layout at 360 and 390 px, board navigation, no target under 24 px); web build ok

## [2026-09-21T21:40:39Z] | claude | IMPROVEMENT-01d1 | IN_PROGRESS

- Summary: The dashboard activity feed's document revisions carry no content
- Verify: pending

## [2026-09-21T21:44:27Z] | claude | IMPROVEMENT-01d1 | DONE

- Summary: The dashboard activity feed carries summaries, not documents: the recent document revisions are selected as id, capturedAt, source, contentHash and the document's kind and project, with no rawContent (ten whole documents used to go out on every load); the viewer is what reads a revision's content. An e2e test asserts no revision of the feed has rawContent.
- Files: apps/api/src/modules/dashboard/dashboard.service.ts,apps/api/test/dashboard.e2e-spec.ts
- Verify: api unit 455 and e2e 301 pass (coverage 88.0); api lint and tsc clean

## [2026-09-21T21:53:57Z] | claude | IMPROVEMENT-01d2 | DONE

- Summary: A dependency can be removed, and the same one cannot be added twice: DELETE /projects/:id/tasks/:taskId/dependencies/:dependencyId (task.write; a dependency belongs to its task so another task's id is a 404) deletes it, audits DEPENDENCY_REMOVE with what it was and re-renders the Roadmap row's Depends on cell from what is left in the same transaction (the cell reads a dash once none is left), reusing the whole-set write of the addition; adding one the task already has, by task or by outside reference, is a 409 checked under the project lock. The task detail shows a Quitar button per dependency to a member with task.write and the picker no longer offers a task already depended on.
- Files: apps/api/src/modules/tasks/tasks.service.ts,apps/api/src/modules/tasks/tasks.controller.ts,apps/api/src/modules/synchronization/write-back.service.ts,apps/api/test/task-dependency-removal.e2e-spec.ts,apps/web/src/app/features/task-detail/task-detail.html,apps/web/src/app/core/tasks.service.ts,docs/synchronization.md
- Verify: api unit 455 and e2e 307 pass (coverage 88.0); web unit 280 and eslint clean; Playwright a11y 60 pass; api lint, nest build and web build ok

## [2026-09-21T21:54:40Z] | claude | IMPROVEMENT-01d3 | IN_PROGRESS

- Summary: Task and notification lists take a limit and a cursor, the cursor in a response header, the body still an array
- Verify: pending

## [2026-09-21T22:03:56Z] | claude | IMPROVEMENT-01d3 | DONE

- Summary: The task list, the one list that grows with a project, is read a page at a time: GET /projects/:id/tasks takes limit (1-500, default and maximum 500) and cursor, its body stays the array it was, and a page that is not the last names the next in the X-Next-Cursor header (exposed by CORS). Creation order with the id as tie-break, so a boundary never repeats or skips a task, filters hold across pages, a malformed limit or cursor is a 400. The web reads every page so a board is never cut; MCP list_tasks still returns the whole list. Notifications (take 50) and audit (limit and cursor) were already bounded and the other lists do not grow with the work. Autonomous decision: header cursor and array body, so no client had to change.
- Files: apps/api/src/common/pagination.ts,apps/api/src/modules/tasks/tasks.service.ts,apps/api/src/modules/tasks/tasks.controller.ts,apps/api/src/modules/tasks/dto/list-tasks-query.dto.ts,apps/api/src/security/http-hardening.ts,apps/api/test/task-pagination.e2e-spec.ts,apps/web/src/app/core/tasks.service.ts,docs/api-reference.md
- Verify: api unit 466 and e2e 316 pass (coverage 88.1); web unit 282 and eslint clean; Playwright a11y 60 pass; api lint, nest build and web build ok

## [2026-09-21T22:03:58Z] | claude | IMPROVEMENT-01d | IN_PROGRESS

- Summary: Closing the slice: 01d1-01d3 are done
- Verify: pending

## [2026-09-21T22:03:59Z] | claude | IMPROVEMENT-01d | DONE

- Summary: Pagination, the activity payload and dependency removal: the activity feed carries no document content (01d1), a dependency can be removed and not added twice, written back to the document (01d2), and the task list is read a page at a time (01d3).
- Files: docs/Roadmap.md
- Verify: All three done and verified: api unit 466 and e2e 316 pass (coverage 88.1); web unit 282 and eslint clean; Playwright a11y 60 pass; api lint, nest build and web build ok

## [2026-09-21T22:04:00Z] | claude | IMPROVEMENT-01 | IN_PROGRESS

- Summary: Closing the umbrella: 01a-01d are done
- Verify: pending

## [2026-09-21T22:04:02Z] | claude | IMPROVEMENT-01 | DONE

- Summary: Performance and data limits: the dependency cycle check runs in memory and a 500-entry chain syncs in seconds with the missing indexes added (01a), DTOs validate length and enums (01b), progress and the multi-project summary are computed in batch (01c), and the activity payload, dependency removal and the task list pages are done (01d).
- Files: docs/Roadmap.md
- Verify: All four slices done and verified: api unit 466 and e2e 316 pass (coverage 88.1); web unit 282 and eslint clean; Playwright a11y 60 pass; api lint, nest build and web build ok

## [2026-09-21T22:06:11Z] | claude | IMPROVEMENT-02a | IN_PROGRESS

- Summary: One file per ADR in docs/decisions, generated verbatim from the Stack table, with an index
- Verify: pending

## [2026-09-21T22:08:23Z] | claude | IMPROVEMENT-02a | DONE

- Summary: docs/decisions has one file per ADR (all 19 the table lists, generated verbatim from its rows with a written title, status, date, decision, reason and where it is detailed) and an index; the Stack table points at them. A unit test fails on a cited ADR with no file, a file the table does not list, a record that drifts from its row, or a file missing from the index.
- Files: docs/decisions,docs/Stack_Tecnologies.md,apps/api/src/modules/roadmap/self-decisions.spec.ts
- Verify: api unit 470 pass; api lint clean
