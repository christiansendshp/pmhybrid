# Agents log

Recent append-only ledger. Keep one entry per logical change, no more than six
lines or roughly 700 characters. Older segments live in `docs/history/`.

## Entry format

```markdown
## [YYYY-MM-DDTHH:mm:ssZ] | agent | TASK-ID | DONE

- Summary: observable outcome
- Files: compact paths or component names
- Verify: command and result
- Follow-up: none or one pointer
```

## Entries

## [2026-09-14T16:32:43Z] | claude-code | FASE-02 | DONE

- Summary: Bootstrapped project-documentation skill on PMHYBRID; wrote architecture/domain-model/synchronization/roadmap-parser docs
- Files: docs/architecture.md, docs/domain-model.md, docs/synchronization.md, docs/roadmap-parser.md
- Verify: project_docs.sh check -> OK
- Follow-up: Start FASE-03 scaffold

## [2026-09-14T17:15:02Z] | claude-code | FASE-03 | DONE

- Summary: Scaffolded pnpm monorepo: NestJS api (17 modules, Prisma, Terminus), Angular web (9 routes, Material), shared-types, docker Postgres, Husky. git init, 2 commits, no remote.
- Files: apps/api, apps/web, packages/shared-types
- Verify: lint+build+test+e2e all green; /health 200; hooks verified firing
- Follow-up: Start FASE-04 auth

## [2026-09-14T17:35:13Z] | claude-code | FASE-04 | DONE

- Summary: Real JWT auth (argon2id, access+stateless-refresh, Passport). Users CRUD. Angular AuthService/interceptor/guard/login page. Fixed: JwtAuthGuard needs PassportModule re-exported from AuthModule (consuming-module DI resolution).
- Files: apps/api/src/modules/auth, apps/api/src/modules/users, apps/web/src/app/core
- Verify: lint+build+test+e2e green (7 e2e); browser login verified against live API
- Follow-up: Start FASE-05 projects/RBAC

## [2026-09-14T17:57:04Z] | claude-code | FASE-05 | DONE

- Summary: Real projects/project-members/roles modules. PermissionGuard+ProjectMemberGuard via new @Global() CommonModule. 3 new permission keys. Angular My Projects + members panel, real guards.
- Files: apps/api/src/modules/{projects,project-members,roles,common}/**, apps/web/src/app/{core,features/my-projects,features/project-dashboard}/**
- Verify: lint+build+test+e2e green (12 e2e); browser: created project, added AI_AGENT member, non-member denied
- Follow-up: Start FASE-06 roadmap parser

## [2026-09-14T18:15:51Z] | claude-code | FASE-06 | DONE

- Summary: Real RoadmapParserService (column-signature discrimination, status mapping, owner-cell parsing) and AgentslogParserService (entry regex, rawEntryHash, rotation pointer). New RoadmapController: raw + structured views. Seed adds pmhybrid-self project pointing at this repo's own docs/. Fixed: parser was matching the fenced Entry-format example as a real entry.
- Files: apps/api/src/modules/roadmap, apps/web/src/app/{core/documents.service.ts,features/documents-viewer}
- Verify: lint+build+test+e2e green (17 e2e); browser: roadmap raw+structured rendered real PMHYBRID docs
- Follow-up: Start FASE-07 tasks/hierarchy

## [2026-09-14T18:35:45Z] | claude-code | FASE-07 | DONE

- Summary: Real phases/epics/templates CRUD (hierarchy, optional, gated by project.update). Real tasks module: create/list/get/update, subtasks, TaskDependency with cycle-DFS, TaskAssignment+AuditEvent, transition endpoint enforcing task-status-policy.ts, assign() auto-moves PENDIENTE->ASIGNADA and locks on EN_DESARROLLO (task.reassign.locked). ProgressRollupService (EQUAL_WEIGHT_AVERAGE, recursive). Angular: functional Kanban columns + create form (DnD is FASE-09), real TaskDetail (transition/assign/subtask/dependency), real Progress tree view. Corrected FASE-07/08 Roadmap split: reassignment-lock is scenario 9, belongs here not in sync.
- Files: apps/api/src/modules/{phases,epics,templates,tasks}, apps/web/src/app/{core/tasks.service.ts,features/kanban,features/task-detail,features/phases-progress}
- Verify: lint+build+test+e2e green (22 e2e, 5 new covering assign/transition/lock/cycle/cross-project); browser: created task, assigned (auto ASIGNADA), transitioned to EN_DESARROLLO (50%), added subtask (rollup recomputed to 0%), Progress view matched
- Follow-up: Start FASE-08 synchronization

## [2026-09-14T19:08:07Z] | claude-code | FASE-08 | DONE

- Summary: Real sync: SynchronizationService (read path, per-field conflict check, disappeared-row incl. archive-following), WriteBackService (curated triggers: created/EN_DESARROLLO/TERMINADA/locked-reassign, surgical row edit), ConflictsService (KEEP_LOCAL/KEEP_EXTERNAL/MANUAL_EDIT/DISMISSED), Cron scheduler. Fixed real bug: AgentLogEvent.rawEntryHash was globally unique, not per-project -> migration to scope it. Angular: Sync now button, real Conflicts view.
- Files: apps/api/src/modules/{synchronization,conflicts,roadmap}, apps/web/src/app/{core/synchronization.service.ts,features/conflicts}, prisma migration 20260914190026
- Verify: lint+build+test+e2e green (28 e2e incl. archive-following + concurrent-field-edit + write-back content checks); browser: Sync now against real pmhybrid-self docs, Conflicts view renders
- Follow-up: Start FASE-09 Kanban drag & drop

## [2026-09-14T19:15:33Z] | claude-code | FASE-09 | DONE

- Summary: Real Kanban drag & drop via Angular CDK (cdkDropList/cdkDrag), calling /transition on drop. PENDIENTE/ASIGNADA excluded as drop targets (need a picked assignee) -- Task Detail covers those. Added title + assignee filters. Extracted shared core/task-status-policy.ts (was duplicated in task-detail.ts).
- Files: apps/web/src/app/core/task-status-policy.ts, apps/web/src/app/features/kanban
- Verify: lint+build+test+e2e green (12 web unit incl. new isDraggableTransition tests, 28 e2e); browser: filters verified live, legal/illegal drag transitions verified via onDrop() with a real API round-trip
- Follow-up: Start FASE-10 dashboard + metrics

## [2026-09-14T19:29:10Z] | claude-code | FASE-10 | DONE

- Summary: New dashboard module (no FASE-03 stub existed): GET /dashboard/summary (active projects, task counts by status, blocked, avg global progress across the actor's projects) and /dashboard/activity (5 feeds per brief SS14: modified tasks, status changes, assignments, AI agent events, document changes). Angular Dashboard is now the post-login landing route. Fixed a real test-isolation bug: parallel e2e spec files share demo-human, so cross-project diff assertions need a dedicated actor.
- Files: apps/api/src/modules/dashboard, apps/web/src/app/{core/dashboard.service.ts,features/dashboard}, app.routes.ts
- Verify: lint+build+test+e2e green (30 e2e); browser: dashboard renders real cross-project counts + all 5 activity feeds, including my own Agentslog entries via pmhybrid-self
- Follow-up: Start FASE-11 workload view

## [2026-09-14T19:38:37Z] | claude-code | FASE-11 | DONE

- Summary: New workload module (no FASE-03 stub existed): GET /workload with project/actor/status/phase/epic filters, per brief SS18. Corrected the FASE-03 route stub: moved from nested projects/:projectId/workload to top-level /workload -- proyecto is a FILTER, not the view's scope (matches Dashboard's cross-project pattern). Added a persistent Dashboard/My Projects/Workload nav to all 4 top-level pages.
- Files: apps/api/src/modules/workload, apps/web/src/app/{core/workload.service.ts,features/workload}, app.routes.ts
- Verify: lint+build+test+e2e green (32 e2e); browser: workload table renders real Actor/Tipo/Proyecto/Tarea/Estado/Avance rows matching brief SS18's example shape, status filter verified live
- Follow-up: Start FASE-12 testing + stabilization + full demo dataset

## [2026-09-14T20:04:17Z] | claude-code | FASE-12 | DONE

- Summary: Full brief SS33 14-scenario E2E walkthrough (apps/api/test/brief-scenarios.e2e-spec.ts), sequential against one project, all 14 green. Found+fixed a real write-back bug: Roadmap Owner cell used the requesting actor instead of the task's actual assignee. Built the full brief SS32 demo dataset in seed.ts: 2 rich projects (Website Relaunch, Mobile App Revamp) with phases/epics/subtasks/dependencies/all 5 Kanban states/2 blocked tasks/human+AI assignees, Roadmap.md+Agentslog.md rendered from the same source array as the DB seed (single source of truth), idempotent (verified 2 consecutive runs, stable row counts). Reconciled docs/architecture.md (dashboard+workload module rows), docs/roadmap-parser.md (per-project rawEntryHash scoping, fenced-block skip), README.md (demo dataset section).
- Files: apps/api/test/brief-scenarios.e2e-spec.ts, apps/api/src/modules/synchronization/write-back.service.ts, apps/api/prisma/seed.ts, docs/architecture.md, docs/roadmap-parser.md, README.md
- Verify: lint+build+test+e2e green across api (46 e2e, 19 unit) and web (12 unit); seed run twice with no row-count growth; browser: Dashboard/Workload/Kanban all render the new demo dataset correctly (blocked=2, global progress=31.64%, all 5 activity feeds populated)
- Follow-up: This is the last phase in the 12-phase MVP plan -- no further phases queued

## [2026-09-15T12:33:14Z] | claude-code | GAP-01 | DONE

- Summary: In-transaction changed-fields audit for task/project/member/role/hierarchy/sync/conflict changes; AuditEvent.projectId + backfill; GET /projects/:id/audit; Audit view + task history. Fixed sync silently reverting UI edits (row-hash baseline).
- Files: api modules audit/tasks/synchronization/+6, migration audit_event_project_scope, web audit-log + task-detail
- Verify: lint+build; 55 api e2e, 19 api unit, 23 web green
- Follow-up: GAP-02

## [2026-09-15T12:48:34Z] | claude-code | GAP-02 | DONE

- Summary: Administrable actors: global ADMIN role + actors.manage (seeded, demo login); users create/edit/deactivate; agents CRUD with provider + non-secret config (credential keys rejected); GET /agents authenticated; inactive actors blocked at login, per-request JWT, membership, assignment; /auth/me global permissions; Team page.
- Files: api users/agents/auth/roles/members/tasks, seed, shared-types, web team + actors.service
- Verify: lint+build; 64 api e2e (actors 9), 23 api unit, 28 web green
- Follow-up: GAP-03

## [2026-09-15T13:07:26Z] | claude-code | GAP-03 | DONE

- Summary: Shared app shell: signed-in routes nested under one AppShell (header nav with aria-current, actor + kind badge, sign out, skip link); duplicated navs removed; project header with sync status, members strip, section tabs; base tokens + light/dark Material theme, system fonts; login outside the shell. PRODUCT.md inferred from brief.
- Files: web layout/app-shell, app.routes(+spec), styles.scss, project-dashboard, login, 4 page templates, apps/web/PRODUCT.md
- Verify: lint+build; 64 api e2e, 23 api unit, 38 web green; detector clean; browser: login light/dark, signed-out redirect
- Follow-up: GAP-04

## [2026-09-15T13:37:17Z] | claude-code | GAP-04 | DONE

- Summary: Task create/edit: required title + acceptance (never cleared), priority enum, date order, agreeing phase/epic/template links, progress read-only with subtasks. Title/acceptance edits rewrite only those cells of the row in its own table, no Agentslog entry, per-cell drift check. Shared task form (parent-instance question) in Kanban, task edit, subtasks.
- Files: api tasks dto/service, write-back, row writer, shared-types TaskPriority, e2e task-editing/sync/audit; web shared/task-form, hierarchy.service, kanban, task-detail
- Verify: lint+build; 72 api e2e, 26 api unit, 47 web green; no browser login (credential policy): component specs
- Follow-up: GAP-05; GAP-19 logged

## [2026-09-15T13:51:18Z] | claude-code | GAP-05 | DONE

- Summary: Task removal: DELETE task (task.delete, seeded for OWNER/PROJECT_ADMIN/PROJECT_MANAGER), soft delete via Task.deletedAt (migration), refused with live subtasks; drops dependency links, closes assignment, audits DELETE. Write-back appends REMOVED entry then removes the row from its own table (placeholder kept). Sync skips removed tasks; lists, progress, workload, dashboard exclude them. Task detail: confirm-to-remove.
- Files: api tasks/write-back/row writer/sync/rollup/dashboard/workload, schema+migration, seed, shared-types; e2e task-removal; web task-detail
- Verify: lint+build; 76 api e2e, 29 api unit, 49 web green
- Follow-up: GAP-06; backlog reordered frontend-first

## [2026-09-15T14:03:58Z] | claude-code | GAP-06 | DONE

- Summary: Kanban per brief §15: cards show ID, title, assignee + kind, priority, rolled-up progress, phase › epic, subtask and open-dependency counts, due/estimated/overdue date, blocked indicators; search by title/ID, assignee/priority/phase/epic/blocked filters, swimlane grouping, in-column sorting. Task list API returns the card fields. Fixed ASIGNADA cards not draggable to EN DESARROLLO.
- Files: api tasks.service list + e2e task-board; web core/board(+spec), TaskCard, kanban ts/html/scss/spec
- Verify: lint+build; 77 api e2e, 29 api unit, 59 web green; browser check pending a signed-in session (credential policy)
- Follow-up: GAP-07

## [2026-09-15T14:11:53Z] | claude-code | GAP-07 | DONE

- Summary: My Projects per brief §19: GET /projects adds a summary (rolled-up progress, active = ASIGNADA/EN_DESARROLLO/QA, overdue = past due and not TERMINADA, active AI agents on active tasks, open conflicts, last sync run); dense table with status and quick access. Project Settings tab: name, description, status (ACTIVE/PAUSED/ARCHIVED), sync interval, docs path, repo URL; project.update to edit; required settings never cleared; header updates via ProjectContext.
- Files: api projects service/module/update DTO + e2e; web my-projects, project-settings, ProjectContext, project-dashboard, routes
- Verify: lint+build; 79 api e2e, 29 api unit, 65 web green; browser check pending a signed-in session
- Follow-up: GAP-11

## [2026-09-15T14:23:40Z] | claude-code | E2E-STABILITY | DONE

- Summary: API e2e runs no longer start the sync scheduler in every worker (SYNC_SCHEDULER_ENABLED=false in vitest.config.e2e.ts): it synced every project in the shared DB, including stale e2e ones, contended for advisory locks and timed out a hierarchy test. e2e testTimeout 20s, hookTimeout 30s. Switch defaults on; documented in .env.example and Stack.
- Files: apps/api config/env.validation, sync-scheduler (+spec), vitest.config.e2e.ts, .env.example, docs Stack + synchronization
- Verify: 80 api e2e green in 48s with zero scheduler log lines; 33 api unit incl. scheduler spec
- Follow-up: none

## [2026-09-15T14:23:50Z] | claude-code | GAP-11 | DONE

- Summary: Workload per brief §18: every active actor shows up — members with nothing assigned get an idle row unless a status, phase or epic filter narrows to tasks; new kind filter (people / AI agents); rows ordered by actor. Web: filters for project, kind, actor, status, and phase and epic within a chosen project (reset with it); actor, task and idle counts; progress bars.
- Files: api workload service/dto + e2e (task-removal workload check updated); web workload service/view/scss/spec
- Verify: lint+build; 80 api e2e, 33 api unit, 68 web green; browser check pending a signed-in session
- Follow-up: GAP-10

## [2026-09-15T14:48:12Z] | claude-code | GAP-10 | DONE

- Summary: Conflict resolution UI (brief §26): field-by-field local-vs-external diff (core/conflict-diff.ts), MANUAL_EDIT form restricted to each conflict's own contested+editable fields, API whitelist rejecting unknown/uncontested manualValue keys as 400 (was an unguarded Prisma 500). Ran full monorepo gate first (lint/build/unit/e2e all green on HEAD) per an advisor review that flagged the gate had drifted to per-package runs.
- Files: apps/api/src/modules/conflicts/conflicts.service.ts, apps/api/test/conflicts.e2e-spec.ts, apps/web/src/app/core/conflict-diff.ts, apps/web/src/app/core/conflict-diff.spec.ts, apps/web/src/app/features/conflicts/*, apps/web/src/app/app.routes.ts, docs/Features.md, docs/Roadmap.md
- Verify: 88 api e2e, 33 api unit, 76 web; api+web lint/build green
- Follow-up: Browser check pending the user's own login (credentials policy); GAP-16 will add a conflicts.spec.ts component test

## [2026-09-15T14:59:09Z] | claude-code | GAP-09 | DONE

- Summary: Documents view (brief §10): search with <mark> highlight and section navigation over the documental (raw) view, same search box filters the structured view's rows/entries, revision history per document kind (new GET .../documents/:kind/revisions[/:revisionId] reading DocumentRevision, which synchronization.service.ts already populated but nothing exposed). Raw content now renders line-by-line (not one <pre> blob) so headings and matches can be targeted individually.
- Files: apps/api/src/modules/roadmap/roadmap.controller.ts, apps/api/src/modules/roadmap/document-kind.util.ts, apps/api/test/documents.e2e-spec.ts, apps/web/src/app/core/document-view.ts, apps/web/src/app/core/document-view.spec.ts, apps/web/src/app/core/documents.service.ts, apps/web/src/app/features/documents-viewer/*, docs/Features.md, docs/Roadmap.md
- Verify: 92 api e2e, 33 api unit, 88 web; api+web lint/build green
- Follow-up: Browser check pending the user's own login (credentials policy)
