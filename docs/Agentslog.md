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

## [2026-09-21T22:12:07Z] | claude | IMPROVEMENT-02b | DONE

- Summary: The web reads its API address when it starts: index.html loads config.js (in public/, so it is served next to the app and a deployment replaces it) before the bundle, which sets window.**PMHYBRID**.apiBaseUrl; API_BASE_URL is that value without a trailing slash, else http://localhost:3000, so one build serves any API (the realtime socket derives from it too). Unit-tested, and a Playwright spec proves the address follows config.js and defaults to the development one.
- Files: apps/web/public/config.js,apps/web/src/index.html,apps/web/src/app/core/api-base-url.ts,apps/web/a11y/runtime-config.a11y.spec.ts
- Verify: web unit 285 and eslint clean; Playwright 62 pass (the address follows config.js and defaults to localhost:3000); web build ok

## [2026-09-21T22:12:41Z] | claude | IMPROVEMENT-02c | IN_PROGRESS

- Summary: Dockerfiles for the API and the web, a compose file that runs the stack, liveness and readiness endpoints, and a deployment guide, each built and run for real
- Verify: pending

## [2026-09-21T22:45:29Z] | claude | IMPROVEMENT-02c | DONE

- Summary: PM Hub deploys as containers, checked by building and running them: apps/api/Dockerfile (node 22 alpine, multi-stage, production dependencies only, runs as node) migrates the database, writes the access model and, only while there is no administrator, creates the first one from BOOTSTRAP_ADMIN_* (new src/bootstrap: the demo seed refuses production, which left a fresh production database with no roles and nobody able to sign in), then serves; apps/web/Dockerfile serves the build on nginx and writes config.js from API_BASE_URL at start; docker-compose.prod.yml runs the database, the API and the web with required values marked so a missing one names itself; GET /health/live answers without the database, /health is readiness; docs/deployment.md, deploy.env.example, a CI job that builds both images, and .gitattributes keeping LF on the scripts. The seed and the bootstrap share one access catalog. prisma moved to production dependencies for migrate deploy. Verified: a smoke stack under its own project name came up healthy, an admin bootstrapped on a fresh database and logged in, roles existed, the demo login was refused, a restart bootstrapped nothing twice, and it was torn down.
- Files: apps/api/Dockerfile,apps/web/Dockerfile,apps/web/nginx.conf,apps/web/docker-entrypoint.sh,apps/api/docker-entrypoint.sh,docker-compose.prod.yml,deploy.env.example,.dockerignore,.gitattributes,apps/api/src/bootstrap/bootstrap.ts,apps/api/src/bootstrap/access-catalog.ts,apps/api/src/modules/health/health.controller.ts,.github/workflows/ci.yml,docs/deployment.md
- Verify: api unit 480 and e2e 317 pass (coverage 86.3); api lint and nest build ok; both images built and the stack run for real (health, CORS, bootstrap on a fresh database and again on a restart, non-root user)

## [2026-09-21T22:46:47Z] | claude | IMPROVEMENT-02d | IN_PROGRESS

- Summary: The Team page folds inactive people and agents away, and a dry-run-by-default command deactivates the old test fixtures of the development database
- Verify: pending

## [2026-09-21T22:53:00Z] | claude | IMPROVEMENT-02d | DONE

- Summary: The development database is tidy and the Team page stays readable: inactive people and agents are folded away behind Mostrar inactivos (N) (a search still finds them), and pnpm --filter api db:tidy-dev finds the old test fixtures by the millisecond timestamp in their name or email, lists them, and with --apply deactivates them with an audit event each. A dry run by default, never deletes an actor, refuses production and any database that is not on this machine. Run on this development database: 43 of 48 active people and agents were fixtures and are now inactive, reversible from the Team page.
- Files: apps/api/scripts/tidy-dev-database.ts,apps/api/src/common/fixture-actors.ts,apps/web/src/app/features/team/team.ts,apps/web/src/app/features/team/team.html,README.md
- Verify: api unit 491 pass and lint clean; web unit 289 and eslint clean; Playwright a11y 62 pass; api and web builds ok; the command dry-run then applied on the development database (43 of 48 active actors were fixtures, 0 after)

## [2026-09-21T22:53:42Z] | claude | IMPROVEMENT-02e | IN_PROGRESS

- Summary: Read docs/synchronization.md and docs/roadmap-parser.md against the parser, the sync and the write-back, and correct what differs
- Verify: pending

## [2026-09-21T23:15:45Z] | claude | IMPROVEMENT-02e | DONE

- Summary: Docs vs code audit: docs/synchronization.md and docs/roadmap-parser.md now describe what the code does (scheduler backoff from SyncRun history, single-transaction concurrency guard, hash skip scope, per-field check over UI and API origins, blocked-row handling, write-back triggers and step 6 collision, conflict kinds with per-kind resolution and permissions, Agentslog bullet subset, owner cell); an assignment now audits status only when it moves the task, as the doc always claimed
- Files: docs/synchronization.md, docs/roadmap-parser.md, apps/api/src/modules/tasks/tasks.service.ts, apps/api/test/audit.e2e-spec.ts
- Verify: pnpm --filter api lint; pnpm --filter api test (491); pnpm --filter api test:e2e:cov (318); pnpm --filter api build

## [2026-09-21T23:15:56Z] | claude | IMPROVEMENT-02 | IN_PROGRESS

- Summary: Closing the umbrella: 02a-02e are done
- Verify: pending

## [2026-09-21T23:15:57Z] | claude | IMPROVEMENT-02 | DONE

- Summary: Deployment, containerization and documentation gaps closed: ADR files, runtime API URL, container images and compose stack with a bootstrap and liveness, a tidy development dataset, and synchronization docs matching the code
- Files: docs/decisions/, apps/web/public/config.js, apps/*/Dockerfile, docker-compose.prod.yml, docs/deployment.md, docs/synchronization.md, docs/roadmap-parser.md
- Verify: See 02a-02e: api lint/unit/e2e:cov, web unit, Playwright a11y, api/web builds, docker image builds

## [2026-09-23T16:16:22Z] | claude | BUG-10 | IN_PROGRESS

- Summary: Investigate frequent local downtime and make PM Hub run persistently
- Verify: pending

## [2026-09-23T16:27:38Z] | claude | BUG-10 | DONE

- Summary: PM Hub now runs as Docker containers (restart: unless-stopped) instead of as children of an editor's preview tool; api/main.ts also logs unhandled errors instead of dying silently. Found and fixed a real collision along the way: the dev and prod compose files shared a default project name and one's postgres service could replace the other's live container -- each now names its own project, with the dev volume pinned to its pre-existing name
- Files: apps/api/src/main.ts, docker-compose.yml, docker-compose.prod.yml, docs/deployment.md, docs/Roadmap.md
- Verify: api lint clean; unit 491 pass; e2e:cov 318 pass (threshold holds); build ok; docker compose -p pmhybrid-prod -f docker-compose.prod.yml up -d --build: postgres/api/web healthy, restart=unless-stopped, logged in as the bootstrap admin at localhost:4200; dev postgres verified intact throughout (52 actors, 3 projects) after the collision and its fix

## [2026-09-23T16:48:56Z] | claude | BUG-11 | IN_PROGRESS

- Summary: Add a way to reach a second configured docsPath browse root
- Verify: pending

## [2026-09-23T16:56:31Z] | claude | BUG-11 | DONE

- Summary: BrowseDirectoryResult now carries roots (every configured PROJECT_DOCS_BROWSE_ROOT entry, not just the current one); the folder picker renders them as an always-visible switcher above the up/path row, so a second (or further) root is one click away instead of a raw path typed by hand. docker-compose.prod.yml also gained a second, generic bind-mount slot (EXTRA_DOCS_DIR) so a docs folder living elsewhere on the host can be mounted without editing the compose file
- Files: apps/api/src/modules/git-providers/filesystem-browser.service.ts, apps/api/src/modules/git-providers/filesystem-browser.service.spec.ts, apps/api/test/filesystem-browser.e2e-spec.ts, apps/web/src/app/core/filesystem-browser.service.ts, apps/web/src/app/shared/folder-browser-dialog/*, docker-compose.prod.yml
- Verify: api lint clean; unit 493 pass; e2e:cov 318 pass; web unit 291 pass; api/web builds ok; verified live end-to-end after a docker rebuild: mounted C:/Users/Administrador/Documents/PROYECTO/SMARTHR/docs as a second root, the picker's switcher jumped to it, selected it, and created project SMARTHR pointing at its real docs

## [2026-10-05T15:50:44Z] | claude | GAP-39a | IN_PROGRESS

- Summary: LLM settings: typed table, AES-256-GCM key at rest, settings.manage permission, /settings/llm API
- Verify: pending

## [2026-10-05T16:00:45Z] | claude | GAP-39a | DONE

- Summary: The instance's LLM configuration lives in the database: a typed LlmSettings row (provider, model, enabled, optional temperature/timeout/max tokens) and the API key encrypted with AES-256-GCM under a key derived from JWT_SECRET (no variable, no .env). GET/PUT/DELETE api-key under /settings/llm need the new global settings.manage permission (granted to ADMIN); a response says only hasApiKey and a status (NOT_CONFIGURED, DISABLED, KEY_UNREADABLE, READY), the key is never returned, logged or audited (only apiKeyChanged), a malformed key is refused without echoing it, and enabling without a usable key is a 400. ADR-020 records the decisions of the whole feature
- Files: apps/api/prisma/schema.prisma, apps/api/prisma/migrations/20261005130000_add_llm_settings, apps/api/src/common/secret-crypto.util.ts, apps/api/src/modules/settings/, packages/shared-types/src/llm.ts, packages/shared-types/src/permissions.ts, apps/api/src/bootstrap/access-catalog.ts, docs/decisions/ADR-020-llm-normalization-of-long-roadmap-titles.md
- Verify: api lint clean; unit 509 pass (crypto 6, service 10); e2e:cov 326 pass (settings-llm 8: 401, 403 without settings.manage, key encrypted and never echoed, key absent from audit rows and stdout, malformed key refused, replace/keep/remove); build ok; prisma migrate diff against the migrated test db: no difference

## [2026-10-05T16:05:56Z] | claude | GAP-39c | IN_PROGRESS

- Summary: Normalizer core: word count, Anthropic/OpenAI adapters over fetch, prompt, validation, corrective retry, local fallback, connection test endpoint
- Verify: pending

## [2026-10-05T16:10:41Z] | claude | GAP-39c | DONE

- Summary: The title normalizer core, without touching tasks yet: countWords (whitespace tokens with a letter or digit), an LlmClient over the global fetch with Anthropic and OpenAI adapters (timeout, sanitized errors that cannot carry the key, a token so tests answer for the provider), the prompt (the task is data, never instructions), validation of the structured answer (title present and at most 10 words, real description, title grounded in the source, no invented acronym or identifier) with one corrective retry and a local cut to 10 words as fallback, every failure an outcome rather than an exception. POST /settings/llm/test makes a minimal real call with the stored configuration, usable while the integration is off, and answers without the key
- Files: apps/api/src/modules/llm/, apps/api/src/modules/title-normalization/, apps/api/src/modules/settings/llm-settings.controller.ts, apps/api/src/modules/settings/llm-settings.service.ts, apps/api/test/settings-llm.e2e-spec.ts
- Verify: api lint clean; unit 557 pass (providers 20, normalizer 13, validation 9, word count 3 and the earlier 509); build ok; settings e2e 13 pass including the test endpoint with a faked provider. The e2e coverage floor (84/87/84) reads 83.3/86.7/83.4 until GAP-39d wires the normalizer into sync and exercises it end to end: the two slices are pushed together

## [2026-10-05T16:11:57Z] | claude | GAP-39d | IN_PROGRESS

- Summary: Task persistence and sync integration of the title normalization
- Verify: pending

## [2026-10-05T16:32:18Z] | claude | GAP-39d | DONE

- Summary: A long Roadmap title is normalized without the sync waiting for it: sync only marks the task PENDING inside its transaction, and after the commit a single-flight runner per project (the database is the queue) calls the configured LLM and stores the short title with the original kept in Task.originalTitle, the generated description (never over one a person wrote) and a SYSTEM audit event. Roadmap.md is never written by normalization: reconciliation, field-edit baselines, conflict closing and the lifecycle write-back all use originalTitle ?? title, so an unrelated row change or a status change from PM Hub does not revert it or turn the document's long title into the short one, a title changed in the document resets and requeues it, and a person's own edit stands. A failure keeps the title, records a message free of the key and the rest of the Roadmap goes on; POST titles/normalize and tasks/:id/normalize-title retry. Under a test runner no real provider is ever called
- Files: apps/api/prisma/schema.prisma, apps/api/prisma/migrations/20261005140000_add_task_title_normalization, apps/api/src/modules/title-normalization/, apps/api/src/modules/synchronization/synchronization.service.ts, apps/api/src/modules/synchronization/write-back.service.ts, apps/api/src/modules/tasks/tasks.service.ts, apps/api/src/modules/conflicts/conflicts.service.ts, apps/api/src/modules/llm/llm.module.ts, apps/api/test/llm.e2e-spec.ts, apps/api/test/roles.e2e-spec.ts, docs/title-normalization.md, docs/synchronization.md
- Verify: api lint clean; unit 569 pass; e2e:cov 343 pass with the coverage floor met (llm.e2e-spec 25: short title never calls the LLM, long title normalized with the document byte-identical, unrelated row change keeps it, a changed document title replaces it and drops the generated description, LLM failure keeps the title and the rest is processed, retry per task and per project, unusable answer after the corrective retry, waiting while not configured, backfill, a person's description kept, a status change from PM Hub keeps the document's long title, a person's title edit reaches the document without a conflict, permissions); build ok; prisma migrate diff against the dev database: no difference. Found and fixed a stale restore in roles.e2e-spec that stripped settings.manage from the shared ADMIN role

## [2026-10-05T16:33:11Z] | claude | GAP-39b | IN_PROGRESS

- Summary: Configuration page for the LLM in the web app
- Verify: pending

## [2026-10-05T16:41:04Z] | claude | GAP-39e | IN_PROGRESS

- Summary: Show the normalization in the app, document and ship it
- Verify: pending

## [2026-10-05T16:48:22Z] | claude | BUG-12 | IN_PROGRESS

- Summary: Make the progress tree's task row the li itself
- Verify: pending

## [2026-10-05T17:00:46Z] | claude | BUG-12 | DONE

- Summary: The progress tree's task rows are list items of their own list: the component is now an attribute on the <li> (li[appProgressTaskNode]) instead of a custom element between the <ul> and the <li>, so axe's list and listitem rules pass whenever a project has tasks in its hierarchy (a latent defect that only showed once this repository's own project had tasks in its tree). Looks and reads the same
- Files: apps/web/src/app/features/phases-progress/progress-task-node.ts, progress-task-node.html, progress-task-node.scss, progress-task-node.spec.ts, phases-progress.html
- Verify: web unit 320 pass and eslint clean; web build ok; Playwright a11y 66 pass (the progress page failed list/listitem before the change, with this project's tasks in the tree)

## [2026-10-05T17:01:05Z] | claude | GAP-39b | DONE

- Summary: A Configuración page (route /settings, in the navigation only for a holder of settings.manage and guarded by a global-permission route guard) administers the LLM from the app: provider, model, a write-only API key, the switch, optional temperature/timeout/tokens, the status and a connection test. Once saved the key is never in the page again: a masked line says one is stored, with Reemplazar clave and Quitar clave (which asks first and also switches the integration off), the field starts empty after every save and asks the browser not to fill in the person's login password. Verified on the real stack: the key was in neither the DOM, the local storage nor the container logs, the test made a real call and showed the provider's 401 without the key
- Files: apps/web/src/app/features/settings/, apps/web/src/app/core/llm-settings.service.ts, apps/web/src/app/core/global-permission.guard.ts, apps/web/src/app/app.routes.ts, apps/web/src/app/layout/app-shell/, apps/web/src/app/core/labels.ts, apps/web/a11y/
- Verify: web unit 320 pass (settings page 14, guard 3, app shell navigation), eslint clean, build ok; Playwright a11y 66 pass including /settings (axe, 360 and 390 px layout, target size); checked in the browser against the rebuilt persistent stack: save, masking, the real connection test, removal

## [2026-10-05T17:01:25Z] | claude | GAP-39e | DONE

- Summary: The app shows the normalization where a person looks for it: the task detail gives the title the Roadmap holds and when it was summarized, a note while the title is queued and, when it failed, the reason with a Reintentar button for whoever may write the task (it looks again for a few seconds, the work being done in the background); the project settings get a Títulos largos action (project.update) that queues the failed ones and the long titles read before the feature existed and says how many, or that they wait because the LLM is not ready. docs/title-normalization.md, ProductDescription (BR-011, BR-012, a flow, and the stale Out of scope lines about WebSocket push and the GitHub provider) and ADR-020 describe it; the persistent stack was rebuilt, applied the migrations and granted the new permission through the bootstrap
- Files: apps/web/src/app/core/tasks.service.ts, apps/web/src/app/features/task-detail/, apps/web/src/app/features/project-settings/, docs/title-normalization.md, docs/ProductDescription.md
- Verify: web unit 320 pass (task detail 6 new, project settings 5 new), eslint clean, build ok; Playwright a11y 66 pass; the rebuilt persistent stack serves it: admin holds settings.manage, GET /settings/llm answers, and the SMARTHR project has 161 tasks of which 145 have titles over 10 words, all waiting to be queued by the new action

## [2026-10-05T17:01:26Z] | claude | GAP-39 | DONE

- Summary: Long Roadmap titles are normalized by a configured LLM, with nothing lost: a title of 10 words or fewer is kept and never sent, a longer one becomes a title of at most 10 words plus an extended description by Anthropic or OpenAI, the title the document holds is kept and Roadmap.md is never written by it, an LLM failure keeps the task as it was and never stops the Roadmap, and a Configuración page administers provider, model and the write-only encrypted API key from the app, never from .env. Sync only queues; a runner works the queue after the commit. ADR-020, docs/title-normalization.md
- Files: apps/api/src/modules/settings/, apps/api/src/modules/llm/, apps/api/src/modules/title-normalization/, apps/api/src/common/secret-crypto.util.ts, apps/web/src/app/features/settings/, docs/title-normalization.md, docs/decisions/ADR-020-llm-normalization-of-long-roadmap-titles.md
- Verify: slices GAP-39a, 39b, 39c, 39d and 39e verified: api unit 569, api e2e 343 with the coverage floor met, web unit 320, Playwright a11y 66, builds ok, and checked live on the rebuilt persistent stack

## [2026-10-06T15:10:23Z] | claude | BUG-13 | IN_PROGRESS

- Summary: Add OpenRouter as a provider and work the queue as soon as the LLM is enabled
- Verify: pending

## [2026-10-06T15:34:34Z] | claude | BUG-13 | DONE

- Summary: OpenRouter is a provider (one OpenAI-compatible adapter serves OpenAI and OpenRouter: URL, token-limit parameter and x-title header differ; default model anthropic/claude-haiku-4.5) and the LLM works by itself the moment a ready configuration is saved: every non-archived project's failed and never-queued long titles are queued and worked one project after another, with no sync or request; a refused key or quota (401/403/429) ends the pass at the first answer and leaves the rest PENDING instead of failing every task; the Configuración page offers OpenRouter, hints how its models are named and says enabling processes what already waited
- Files: apps/api/src/modules/llm/, apps/api/src/modules/settings/llm-settings.service.ts, apps/api/src/modules/title-normalization/title-normalization.service.ts, packages/shared-types/src/llm.ts, apps/web/src/app/features/settings/, apps/api/test/llm.e2e-spec.ts, docs/title-normalization.md, docs/decisions/ADR-020-llm-normalization-of-long-roadmap-titles.md, docs/Stack_Tecnologies.md, docs/api-reference.md, docs/ProductDescription.md
- Verify: api unit 587 and lint ok, api e2e 345 with the coverage floor met (llm.e2e-spec 28 incl. OpenRouter URL/bearer/max_tokens and enable-without-sync), web unit 323 and eslint ok, builds ok; found live: the user's OpenRouter key was saved under OpenAI and failed with 401 against api.openai.com

## [2026-10-07T13:31:09Z] | claude | BUG-14 | IN_PROGRESS

- Summary: Adapt long titles promptly after a sync: concurrency, empty-answer retry, bounded automatic retry of failed ones
- Verify: pending

## [2026-10-07T13:43:12Z] | claude | BUG-14 | DONE

- Summary: After a sync the long titles are adapted promptly and completely, in the system only (Roadmap.md is never written): the queue is worked four calls at a time within a project with the first call of a pass on its own, an answer with no text is asked again once with a four times larger output budget, and every sync tries a failed task again up to three failures in a row (Task.titleNormalizationAttempts; a person's retry or saving the configuration starts the count over)
- Files: apps/api/prisma/schema.prisma, apps/api/prisma/migrations/20261007120000_add_title_normalization_attempts/, apps/api/src/modules/title-normalization/, apps/api/src/modules/llm/, apps/api/test/llm.e2e-spec.ts, docs/title-normalization.md, docs/decisions/ADR-020-llm-normalization-of-long-roadmap-titles.md, docs/Stack_Tecnologies.md, docs/ProductDescription.md
- Verify: api unit 602 and lint ok, api e2e 350 with the coverage floor met (llm.e2e-spec 32: automatic retry by the next sync, stop after three failures, empty answer retried with 4096 tokens, concurrency peak between 2 and 4, document byte-identical), builds ok; found live: 43 adapted, 131 queued and 13 failed with no text hours after the first sync

## [2026-10-07T13:49:40Z] | claude | BUG-15 | IN_PROGRESS

- Summary: Degrade to one call at a time on an overlapped credit/quota refusal; 402 is a quota refusal
- Verify: pending

## [2026-10-07T13:54:39Z] | claude | BUG-15 | DONE

- Summary: A quota or balance refusal is handled as the account's, not the task's: 402 (OpenRouter, not enough credits given the requests in flight) is a RATE_LIMIT, and when such a refusal reaches a call that was in flight with others the pass goes one call at a time from then on and the task takes its turn again without being marked failed; only a refusal reaching a call that was alone pauses the pass, leaving the rest waiting
- Files: apps/api/src/modules/llm/http-json.util.ts, apps/api/src/modules/llm/llm.types.ts, apps/api/src/modules/title-normalization/title-normalization.service.ts, docs/title-normalization.md, docs/decisions/ADR-020-llm-normalization-of-long-roadmap-titles.md, docs/Stack_Tecnologies.md
- Verify: api unit 605 and lint ok, api e2e 350 with the coverage floor met, build ok; found live: four calls at a time made OpenRouter answer 402 for the credits reserved for requests in flight and 42 tasks were marked failed in seconds

## [2026-10-07T13:59:03Z] | claude | BUG-16 | IN_PROGRESS

- Summary: Refusals about the account do not count as a task's automatic attempts
- Verify: pending

## [2026-10-07T14:02:44Z] | claude | BUG-16 | DONE

- Summary: A failure about the key, the quota or the balance (401, 403, 429, 402) is recorded on the task with its reason but no longer counts as one of its three automatic attempts: while an account is refused (OpenRouter: Insufficient credits) every sync costs one call and no task is given up on, and once it is fixed the next sync goes on with the whole queue
- Files: apps/api/src/modules/title-normalization/title-normalization.service.ts, docs/title-normalization.md, docs/decisions/ADR-020-llm-normalization-of-long-roadmap-titles.md, docs/Stack_Tecnologies.md
- Verify: api unit 607 and lint ok, build ok, llm e2e 32 pass; found live: OpenRouter answered 402 Insufficient credits, the pass paused after one call as designed but that task was charged an attempt

## [2026-10-08T12:28:33Z] | claude | UX-04 | IN_PROGRESS

- Summary: Short titles on the board cards, as a view of the title: shared 10-word rule, shortTitle pipe
- Verify: pending

## [2026-10-08T12:32:03Z] | claude | UX-04 | DONE

- Summary: A Kanban card never shows a long title: one of more than 10 words is shown as its first 10, cut at a word boundary and followed by an ellipsis, with the whole title as a tooltip; a title of 10 words or fewer, and one the LLM already shortened, is shown as it is. It is only how the view presents the title, so it works as soon as a sync has read the Roadmap and while the LLM is refused; nothing is stored and Roadmap.md is not touched. The 10-word rule is defined once in shared-types and used by the API and the web
- Files: packages/shared-types/src/title-words.ts, apps/api/src/modules/title-normalization/word-count.util.ts, apps/web/src/app/shared/short-title.pipe.ts, apps/web/src/app/features/kanban/, docs/title-normalization.md, docs/ProductDescription.md
- Verify: web unit 331 and eslint ok, api unit 607 and lint ok, builds ok; the rebuilt persistent stack serves the bundle with the shortTitle pipe and its API uses the shared helper (the board itself was not looked at live: the browser pane had no session)
