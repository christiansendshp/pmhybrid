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

- Summary: Conflicts UI (brief §26): field-by-field local-vs-external diff, MANUAL_EDIT limited to each conflict's own contested+editable fields. API whitelists manualValue keys, fixing an unguarded 500.
- Files: api conflicts service + e2e; web core/conflict-diff + spec, features/conflicts/*
- Verify: 88 api e2e, 33 api unit, 76 web green
- Follow-up: browser check pending sign-in; GAP-16 adds conflicts.spec.ts

## [2026-09-15T14:59:09Z] | claude-code | GAP-09 | DONE

- Summary: Documents view (brief §10): search+highlight and section nav over the documental view (line-by-line render, not one blob), same search filters the structured view, revision history via new GET .../documents/:kind/revisions[/:revisionId] over DocumentRevision.
- Files: api roadmap.controller + document-kind.util + e2e; web core/document-view + spec, features/documents-viewer/*
- Verify: 92 api e2e, 33 api unit, 88 web green
- Follow-up: browser check pending sign-in

## [2026-09-15T15:12:36Z] | claude-code | GAP-08 | DONE

- Summary: Progress tree (brief §16): phase/epic/project nodes carry statusCounts (subtree tasks by Kanban status); task nodes nest subtasks at any depth. New builder is local to getProjectProgressTree; the shared compute*Progress methods other callers use are untouched.
- Files: api progress-rollup.service + e2e; web core/tasks.service + status-counts + spec, features/phases-progress/*
- Verify: 96 api e2e, 33 api unit, 91 web green
- Follow-up: browser check pending sign-in

## [2026-09-15T15:23:48Z] | claude-code | GAP-08 | DONE

- Summary: Follow-up fix: a task node's own statusCounts (its subtree, computed but discarded in f386e7d) is now on the node too, not just epic/phase/project. Web shows it as a pill row on any task with subtasks. New component spec covers 2-level recursion; advisor review caught the gap.
- Files: api progress-rollup.service; web core/tasks.service + features/phases-progress/*; +progress-task-node.spec.ts
- Verify: 97 api e2e, 33 api unit, 94 web green
- Follow-up: none

## [2026-09-15T15:40:56Z] | claude-code | GAP-12 | DONE

- Summary: Role catalog + configurable permissions (brief §4): new roles.manage global permission; PATCH /roles/:id/permissions replaces any role's set, refusing an edit that strands the instance without a roles.manage holder. Project dashboard gained role assign/revoke on the members list; new top-level Roles page for the catalog.
- Files: apps/api/src/modules/roles/roles.service.ts, apps/web/src/app/features/roles/roles.ts, apps/web/src/app/features/project-dashboard/project-dashboard.ts
- Verify: apps/api/test/roles.e2e-spec.ts, features/roles/roles.spec.ts, project-dashboard.spec.ts
- Follow-up: Promoted GAP-16 to Active

## [2026-09-15T15:47:58Z] | claude-code | GAP-12 | DONE

- Summary: Follow-up fix (advisor review): PROJECT-scope roles could be granted a GLOBAL-only key (roles.manage/actors.manage) — never resolvable there, a silent dead grant that broke the seed's own documented invariant. Now rejected 400, backed by a shared GLOBAL_PERMISSION_KEYS list + seed drift-guard. Also fixed GET /roles never including rolePermissions, which would have crashed the new Roles page.
- Files: packages/shared-types/permissions.ts, apps/api roles.service.ts + seed.ts
- Verify: 104 api e2e, 33 api unit, 105 web green
- Follow-up: none

## [2026-09-15T15:51:37Z] | claude-code | GAP-16 | DONE

- Summary: Frontend component tests (brief §33): kanban/task-detail/workload already had specs from earlier work; only conflicts.spec.ts was missing. Added it: diff rendering, filter toggle, KEEP_LOCAL/KEEP_EXTERNAL/DISMISSED/MANUAL_EDIT (prefill + submit), editable-fields gating, failure surfacing.
- Files: apps/web/src/app/features/conflicts/conflicts.spec.ts
- Verify: 113 web green (was 105)
- Follow-up: Promoted GAP-13 to Active

## [2026-09-15T16:06:47Z] | claude-code | GAP-13 | DONE

- Summary: Internal notifications (brief §29): CONFLICTS_DETECTED/SYNC_FAILED events notify every active project member. Fixed a real bug found along the way: a failed sync's whole reconciliation tx (incl. the SyncRun row) used to roll back, so nothing persisted — now written separately. GET/PATCH /notifications scoped strictly to the caller's JWT actor (was an unauthenticated query-param hole). App-shell bell + panel.
- Files: apps/api synchronization.service.ts, notifications module; apps/web app-shell + notifications.service
- Verify: 109 api e2e, 33 api unit, 120 web green
- Follow-up: Promoted GAP-14 to Active

## [2026-09-15T16:15:16Z] | claude-code | GAP-13 | DONE

- Summary: Follow-up (advisor review): excluded whoever directly triggered a sync from its own CONFLICTS_DETECTED/SYNC_FAILED notification (they already saw the result); guarded emitAsync so a notification-emitter fault can never replace/mask the sync's real outcome. Updated docs/architecture.md with the concrete event names, since it only described the pattern before.
- Files: apps/api synchronization.service.ts, notifications.service.ts; test/notifications.e2e-spec.ts
- Verify: 109 api e2e (x2 stable), 33 api unit green
- Follow-up: none

## [2026-09-15T16:28:32Z] | claude-code | GAP-14 | DONE

- Summary: Roadmap Depends on -> TaskDependency (domain-model.md): resolves comma-separated external IDs against known Tasks, or stores a dangling rawExternalRef upgraded once the target appears — even later rows in the same sync, via an end-of-run resolution sweep (a per-row-only attempt missed that case). Additive-only (never removes a link) and skips anything that would close a cycle.
- Files: apps/api synchronization.service.ts (reconcileDependencies, resolveDanglingDependencies, wouldCreateCycle)
- Verify: 115 api e2e (x2 stable), 33 api unit green
- Follow-up: Promoted GAP-15 to Active

## [2026-09-15T16:37:43Z] | claude-code | GAP-14 | DONE

- Summary: Follow-up fix (advisor review): dependency dedup only matched on rawExternalRef, so a UI-added dependency (rawExternalRef null) plus a later document cell naming the same target created a duplicate TaskDependency row. Now dedups on target id too. Also added audit trail (DEPENDENCY_ADD/ROADMAP) for document-sourced links, which had none.
- Files: apps/api synchronization.service.ts (reconcileDependencies, resolveDanglingDependencies); test/roadmap-dependencies.e2e-spec.ts
- Verify: 116 api e2e x2 stable, 33 api unit, lint+build green
- Follow-up: none

## [2026-09-15T16:59:58Z] | claude-code | GAP-15 | DONE

- Summary: Controlled API access for AI agents (brief §27, §28): hashed pmh_ keys minted/revoked per agent (Team page, /agents/:id/keys), SHA-256 not argon2id (ADR-009). X-API-Key composes into JwtAuthGuard, authenticating as the agent under unchanged RBAC.
- Files: apps/api auth + agents modules (agent-api-keys.*), ApiKey model; apps/web api-keys.service.ts, features/team
- Verify: 125 api e2e x2, 33 api unit, 124 web green
- Follow-up: authMethod not threaded into audit.record yet

## [2026-09-15T17:15:17Z] | claude-code | GAP-19 | DONE

- Summary: Write-back always rendered into Active regardless of Task.roadmapTable, duplicating Near term/Blocked rows. upsertLifecycleRoadmapRow now edits in whichever table already holds the row, touching only that table's own headers; falls back to Active only for a brand-new row.
- Files: apps/api roadmap-row-writer.util.ts, write-back.service.ts; synchronization.e2e-spec.ts
- Verify: 127 api e2e x2, 35 api unit green
- Follow-up: none; GAP-17/18 left have no frontend surface

## [2026-09-15T17:31:45Z] | claude-code | GAP-17 | DONE

- Summary: CI pipeline (.github/workflows/ci.yml): lint+build+unit for api/web, then migrate deploy + seed against a Postgres service container, then full e2e — every push/PR to main/develop. Validated locally, then confirmed the actual GitHub Actions run green.
- Files: .github/workflows/ci.yml; docs/Stack_Tecnologies.md
- Verify: Real GH Actions run green in 1m40s (not just local)
- Follow-up: none; GAP-18 (docs) is next

## [2026-09-15T17:40:02Z] | claude-code | GAP-18 | DONE

- Summary: Doc gaps (brief §35): new docs/permissions.md (all 12 keys, role grant matrix, enforcement layers), docs/api-reference.md (route table, auth/error/rate-limit conventions), docs/testing.md (layout, commands, shared-DB/scheduler e2e caveats). Fixed stale Agents.md UNKNOWNs (branch=develop, code style, test cmd) and Stack.md's no-CI-yet line.
- Files: docs/permissions.md, docs/api-reference.md, docs/testing.md (new); docs/Agents.md, docs/architecture.md, docs/domain-model.md (cross-links)
- Verify: project-documentation check green; every docs/*.md cross-reference verified to resolve
- Follow-up: none; Post-MVP backlog (GAP-12..19) fully closed

## [2026-09-15T17:45:25Z] | claude-sonnet-5 | GAP-18 follow-up | DONE

- Summary: Fixed api-reference.md: X-API-Key takes precedence over Bearer (not mutually exclusive), and /auth/me requires JwtAuthGuard (not unauthenticated). Caught by advisor review.
- Files: docs/api-reference.md
- Verify: manual re-read of jwt-auth.guard.ts and auth.controller.ts
- Follow-up: none

## [2026-09-16T11:56:43Z] | claude-sonnet-5 | GAP-20 foundation | IN_PROGRESS

- Summary: New DESIGN.md; stock violet palette → azure/violet (M3, ADR-010); ThemeService adds a persisted light/dark toggle; shell+login copy unified to Spanish.
- Files: apps/web/DESIGN.md, styles.scss, core/theme.service.ts, layout/app-shell/_, features/auth/login/_
- Verify: 129 web unit, lint, build green; login checked in browser light+dark
- Follow-up: remaining raw pages next (dashboard, team, roles, audit, phases-progress)

## [2026-09-16T12:01:23Z] | claude-sonnet-5 | GAP-20 dashboard | IN_PROGRESS

- Summary: Panel/Dashboard was raw ul/li, mixed EN/ES; now figure stats + status-counts + grouped activity feed, Spanish, plus a missing error state and first spec (6 tests).
- Files: features/dashboard/*, styles.scss
- Verify: 135 web unit, lint, build green
- Follow-up: team/roles/audit/phases-progress still raw; rest need palette+copy pass

## [2026-09-16T12:06:40Z] | claude-sonnet-5 | GAP-20 team | IN_PROGRESS

- Summary: Redesigned Team: was raw h1/table/form, no page-header; now uses page-header/table-scroll/status-badge (promoted table-scroll+status-badge to global styles.scss, deduped from my-projects/workload), Spanish copy.
- Files: features/team/*, features/my-projects/my-projects.scss, features/workload/workload.scss, styles.scss
- Verify: 135 web unit green, lint clean, build clean
- Follow-up: roles, audit, phases-progress still raw

## [2026-09-16T12:12:43Z] | claude-sonnet-5 | GAP-20 roles/audit/progress | IN_PROGRESS

- Summary: Roles/Audit/Phases-progress: raw -> page-header/table-scroll, Spanish. Extracted 5x-duplicated status.replace('_',' ') into task-status-policy.ts statusLabel().
- Files: features/{roles,audit-log,phases-progress}/_, core/task-status-policy.ts
- Verify: 139 web unit, lint, build green
- Follow-up: copy pass on remaining pages; dark-mode QA once user logs in

## [2026-09-16T12:16:08Z] | claude-sonnet-5 | GAP-20 copy pass 1 | IN_PROGRESS

- Summary: My Projects/Workload/Team key panel unified to Spanish; workload's plural() no longer assumes English +s.
- Files: features/{my-projects,workload}/*, features/team/team.html
- Verify: 139 web unit, lint green
- Follow-up: kanban/task-detail/conflicts/documents-viewer/project-settings still English

## [2026-09-16T12:20:30Z] | claude-sonnet-5 | GAP-20 kanban/task-form | IN_PROGRESS

- Summary: Unified Kanban board (toolbar, card facts, empty states) and the shared task-form to Spanish; translated board.ts's group-label fallbacks (Unassigned/No priority/etc).
- Files: features/kanban/_, shared/task-form/_, core/board.ts
- Verify: 139 web unit, lint, build green
- Follow-up: task-detail/conflicts/documents-viewer/project-settings still English

## [2026-09-16T12:22:55Z] | claude-sonnet-5 | GAP-20 task-detail | IN_PROGRESS

- Summary: Unified Task Detail to Spanish (details, transitions, assignee, subtasks, dependencies, agent activity, history); now shows assignee kind and status labels via the shared helpers instead of raw enum text.
- Files: features/task-detail/*
- Verify: 139 web unit, lint, build green
- Follow-up: conflicts/documents-viewer/project-settings still English

## [2026-09-16T12:29:31Z] | claude-sonnet-5 | GAP-20 copy pass 2 | IN_PROGRESS

- Summary: Unified Conflicts, Documents viewer (+first spec, 5 tests), Project Settings and the Project Dashboard shell (members, sync banner, section tabs) to Spanish. Full-app sweep found no remaining English UI copy.
- Files: features/{conflicts,documents-viewer,project-settings,project-dashboard}/*
- Verify: 144 web unit, lint, build green
- Follow-up: none functional; every page now Spanish + on the DESIGN.md system

## [2026-09-16T12:31:07Z] | claude-sonnet-5 | GAP-20 | DONE

- Summary: Full frontend redesign closed: real M3 palette+theme toggle, every page (12 features) on the shared component system, all copy Spanish, 3 new spec files for previously-untested pages. Features.md F30.
- Files: apps/web/DESIGN.md, docs/Features.md, docs/Roadmap.md
- Verify: 144 web unit, lint, build green across every commit
- Follow-up: browser-verified only up to login (unauthenticated); full visual check needs user's own login

## [2026-09-16T14:23:59Z] | claude-sonnet-5 | doc-audit | DONE

- Summary: Full audit per user request (skillProyectDocument prompt): verified all 6 docs against running code, not just internal consistency. Fixed 4 real drifts: BR-002 said EN DESARROLLO (space), code writes EN_DESARROLLO verbatim; Stack.md module list had a phantom AgentLogs module and was missing Dashboard/Workload/Health; Commands table had bootstrap-era test counts (1+3) vs actual (144 web/35 api unit/127 e2e); JWT_EXPIRES_IN wrongly marked Required=yes (has a coded default).
- Files: docs/ProductDescription.md, docs/Stack_Tecnologies.md
- Verify: check: OK; all 45 Features.md file citations resolve; F-row count matches stated 30; rotate not needed (46 entries, 28KB)
- Follow-up: none

## [2026-09-16T14:34:37Z] | claude-sonnet-5 | roadmap-gap-review | DONE

- Summary: Fresh brief-vs-code review (full re-read of the original brief) surfaced 6 genuine gaps, added as GAP-21..26 in Roadmap Near term: rollup strategy has no UI despite full API support (S16); dependency write-back is read-only, not bidirectional like every other field (S8); only one Project Repository Provider exists (S20 wants GitHub next); API-key writes never audit as origin API (GAP-15 follow-up); no automated a11y testing exists; WebSocket/webhooks/MCP are 0% built (brief itself defers these, priority among them left UNKNOWN).
- Files: docs/Roadmap.md
- Verify: check: OK; each item verified against actual code (DTOs, provider impls, audit enum, a11y tooling, webhook/MCP grep) before being listed
- Follow-up: user or product decision needed to prioritize GAP-26's three integrations

## [2026-09-16T14:55:58.322Z] | Demo Human | GAP-21 | IN_PROGRESS

- Summary: Started: Progress rollup strategy is configurable on the API (`progressRollupStrategy` in create/update project DTOs) but never exposed in the UI — every project silently gets the schema default, unchangeable (brief §16 "estrategia configurable")
- Files: —
- Verify: —
- Follow-up: —

## [2026-09-16T15:13:41Z] | claude-sonnet-5 | GAP-27 | DONE

- Summary: docsPath folder picker: GET /filesystem-browser/browse (auth-only, root-confined) lists subfolders + flags Roadmap.md/Agentslog.md presence; Explorar... dialog wired into create-project and Project Settings
- Files: api git-providers module, web filesystem-browser.service + folder-browser-dialog, my-projects, project-settings, docs
- Verify: check OK; 153 web + 39 api unit; 129/130 e2e (1 pre-existing, unrelated); lint+build clean
- Follow-up: browser click-through still pending the user's own login

## [2026-09-16T15:49:18Z] | claude-sonnet-5 | test-db-isolation | DONE

- Summary: Wiped 76 leftover e2e-created projects from the dev DB (kept only the user's own: PM Hub self, SMARTRH). Root cause: local test:e2e shared apps/api/.env's DATABASE_URL with the dev server. Fixed: vitest.config.e2e.ts now points non-CI runs at an isolated pmhybrid_test DB
- Files: apps/api/vitest.config.e2e.ts, apps/api/package.json (test:e2e:db:setup), docs/{testing.md,Stack_Tecnologies.md,Features.md} (ADR-011)
- Verify: check OK; 130/130 e2e pass against pmhybrid_test; dev DB project count confirmed unchanged (2) before and after a full e2e run; lint clean
- Follow-up: none

## [2026-09-17T11:44:14Z] | claude-sonnet-5 | dev-server-stability | DONE

- Summary: Fixed the API dev server's repeated MODULE_NOT_FOUND crash (user-reported, happened 3x this session): nest-cli's deleteOutDir wiped the live watch process's dist/ whenever nest build ran concurrently. dev/start:dev/start:debug now compile into a separate dist-watch via tsconfig.watch.json
- Files: apps/api/tsconfig.watch.json, apps/api/package.json, .gitignore, docs/Stack_Tecnologies.md (ADR-012)
- Verify: lint clean; 39 api unit pass; stress test: ran pnpm -r build against a live dev server, health stayed 200 throughout, no restart/crash (previously reproduced the crash 2x)
- Follow-up: none

## [2026-09-17T12:03:38Z] | claude-sonnet-5 | collaborator-role-onestep | DONE

- Summary: Combined adding a project member and assigning its role into one action: the 'add member' form now has an optional role select alongside the actor select, assigning the role right after the member is added
- Files: apps/web/src/app/features/project-dashboard/{project-dashboard.ts,project-dashboard.html}, docs/Features.md (F25)
- Verify: 156 web unit pass (9 in project-dashboard.spec.ts, 3 new); lint+build clean; dev server stayed healthy through a concurrent build
- Follow-up: per-member role add/revoke for existing members is unchanged

## [2026-09-17T13:50:40Z] | claude | skill-v2-install | DONE

- Summary: Installed project-documentation skill v2 (multiagent claim/pause/done protocol, root AGENTS.md, new Roadmap YAML schema). Wrote AGENTS.md by hand from the new template with real project facts; retired docs/Agents.md; CLAUDE.md now redirects to AGENTS.md via the skill link command.
- Files: AGENTS.md,CLAUDE.md,docs/Agents.md(removed),.claude/skills/project-documentation/**
- Verify: sh .claude/skills/project-documentation/scripts/project_docs.sh init . && check .
- Follow-up: Roadmap.md deliberately kept in the OLD table format: converting it now would break PM Hub's own RoadmapParserService, which syncs this repo's docs/ every 5 min via the live dev scheduler (docsPath=self). check is expected to fail with MIGRATION REQUIRED: docs/Roadmap.md and Features/log cross-reference errors (Features.md's 31 rows and dozens of historical log IDs predate this schema) until the app's parser/writer is rewritten for the new schema and Features.md is retrofitted with log cross-references - both tracked as separate future work, not silently absorbed here.

## [2026-09-17T23:31:50Z] | claude | GAP-28 | IN_PROGRESS

- Summary: Phase 1 of GAP-28 landed: dual-format Roadmap.md read+write (RoadmapParserService/roadmap-row-writer.util now detect and handle both the old table format and the new YAML-per-entry schema; zero changes to old-format behavior, 39/39 roadmap unit tests + full pnpm -r test green). Status vocabulary translated at the boundary per the ADR-002-superseding decision (BACKLOG/READY/IN_PROGRESS/TESTING/DONE <-> PENDIENTE/ASIGNADA/EN_DESARROLLO/QA/TERMINADA; BLOCKED carried via RoadmapTable.BLOCKED, not statusMapped).
- Files: apps/api/src/modules/roadmap/roadmap-yaml-entry.util.ts,apps/api/src/modules/roadmap/roadmap-parser.service.ts,apps/api/src/modules/roadmap/roadmap-row-writer.util.ts,apps/api/package.json
- Verify: pnpm -r test (212 passed); pnpm test:e2e NOT run this phase - Docker Desktop's WSL2 backend (docker-desktop distro) is stuck in Stopped state after wsl --shutdown + relaunch, port 5436 unreachable
- Follow-up: Commit is local only, not pushed, until pnpm test:e2e passes (advisor guidance: synchronization.e2e-spec.ts is the one suite that exercises reconcileRoadmap/write-back/the disappeared-row sweep this phase touches). Phase 2 (Agentslog Pause-bullet fix) intentionally not started - avoid stacking a second unverified sync-path change. User needs to fix Docker/WSL (likely a reboot or Docker Desktop repair) before the e2e gate can run.

## [2026-09-17T23:40:16Z] | claude | GAP-28 | IN_PROGRESS

- Summary: Phase 2 of GAP-28 landed: AgentslogParserService now accepts the skill v2 Pause bullet (Summary required, Files/Verify/Pause each optional, no Follow-up) alongside the old fixed four-bullet shape - fixes a real silent-drop bug (a PAUSE-status entry with no Follow-up bullet was previously dropped entirely, invisible to hasTerminalEntry's disappeared-row check). agentslog-writer.util can now emit either shape. 45/45 roadmap unit tests, 218 total pnpm -r test green.
- Files: apps/api/src/modules/roadmap/agentslog-parser.service.ts,apps/api/src/modules/roadmap/agentslog-writer.util.ts,apps/api/src/modules/roadmap/agentslog-parser.service.spec.ts,apps/api/src/modules/roadmap/agentslog-writer.util.spec.ts
- Verify: pnpm -r test (218 passed); pnpm test:e2e still blocked - Docker Desktop's WSL2 backend is stuck (docker-desktop distro Stopped), tried Docker Desktop restart + wsl --shutdown + wsl --update, all failed or hung; needs a reboot or Docker Desktop repair, user's call
- Follow-up: Two commits (GAP-28 phase 1 + phase 2) both local-only, not pushed, until pnpm test:e2e passes covering both. Do not push or start further phases until the e2e gate clears - synchronization.e2e-spec.ts is the suite that exercises the exact sync paths both phases touch.

## [2026-09-18T11:56:36Z] | claude | GAP-28 | IN_PROGRESS

- Summary: Docker/WSL2 recovered (wsl --update fixed the stuck docker-desktop distro). pnpm test:e2e now green: 21/21 files, 130/130 tests, confirmed twice independently. Pushed both pending commits (e3c8e51 phase 1, 28a2245 phase 2) to origin/develop.
- Files: none - infra recovery + push only
- Verify: pnpm test:e2e (130/130 passed); git push origin develop -> 7dd864e..28a2245
- Follow-up: Roadmap.md itself still not converted to the new schema (deferred, self-sync risk unchanged - see AGENTS.md Migration status note); Features.md/log cross-reference retrofit still separate, out of scope. Moving to next backlog item: GAP-21 (progress rollup strategy UI exposure).

## [2026-09-18T12:51:35Z] | claude | GAP-21 | DONE

- Summary: Exposed progressRollupStrategy in the UI (mat-select on My Projects' create form, default EQUAL_WEIGHT_AVERAGE; editable on Project Settings, was read-only). Backend DTOs/service already validated+stored the field end-to-end, no API change needed. LEAF_EQUAL_WEIGHT remains accepted/stored but not yet computed differently (ProgressRollupService still EQUAL_WEIGHT_AVERAGE-only) - documented as a known limitation, not implemented here, matching the ticket's scope. Moved to Features.md F32; removed from Roadmap.md Near term.
- Files: apps/web/src/app/core/projects.service.ts,apps/web/src/app/features/my-projects/{my-projects.ts,my-projects.html,my-projects.spec.ts},apps/web/src/app/features/project-settings/{project-settings.ts,project-settings.html,project-settings.spec.ts},apps/api/test/projects.e2e-spec.ts,docs/Features.md,docs/Roadmap.md
- Verify: pnpm -r test (220 passed: 158 web + 62 api unit); pnpm test:e2e (131/131 passed); oxlint + eslint clean
- Follow-up: none

## [2026-09-18T13:06:28Z] | claude | GAP-22 | DONE

- Summary: Dependency write-back: adding a TaskDependency now renders the task's full dependency set into its Roadmap row's Depends on cell (WriteBackService.recordDependencyAdded), sorted for stability. Found + fixed a real pre-existing bug along the way: every lifecycle write-back (writeBackLocked) hardcoded the cell to em-dash, silently blanking any dependency a prior write had rendered - fixed by fetching+rendering the task's actual dependencies there too. Also added Depends on support to the new-format writer (replaceRoadmapEntryFields) and updated stale code comments/docs (synchronization.service.ts, docs/synchronization.md new Dependencies section, roadmap-dependencies.e2e-spec.ts docblock) that described the old one-way limitation. Still addition-only - no removal endpoint exists, out of scope. Moved to Features.md F33.
- Files: apps/api/src/modules/synchronization/write-back.service.ts,apps/api/src/modules/synchronization/synchronization.service.ts,apps/api/src/modules/roadmap/roadmap-row-writer.util.ts,apps/api/src/modules/tasks/tasks.service.ts,apps/api/test/roadmap-dependencies.e2e-spec.ts,docs/synchronization.md,docs/Features.md,docs/Roadmap.md
- Verify: pnpm -r test (220 passed); pnpm test:e2e (133/133 passed); oxlint clean
- Follow-up: none

## [2026-09-18T13:32:01Z] | claude | GAP-24 | DONE

- Summary: Threaded JwtPayload.authMethod through to AuditEvent.origin: new @CurrentAuditOrigin() decorator (mirrors @CurrentActorId()) reads authMethod off request.user, controllers pass it to service methods (new trailing optional origin: AuditOrigin = 'UI' param, non-breaking default), 26 audit.record() call sites across 11 services+13 controllers now record origin:'API' for X-API-Key writes vs 'UI' for JWT. Also fixed per-field conflict detection query in synchronization.service.ts that only checked origin:'UI' - now checks origin in [UI, API] so an agent's API-key edit still correctly contests a document change. API_KEY_CREATE/REVOKE now audit entityType:'ApiKey'/entityId=key's own id instead of the owning agent Actor. Mechanical multi-file part delegated to a background agent with a fully-specified pattern (proven on one file pair first), then verified/fixed (entityType mismatch it flagged) and tested by me.
- Files: apps/api/src/common/decorators/current-audit-origin.decorator.ts,apps/api/src/modules/{conflicts,agents,projects,users,project-members,phases,epics,tasks,roles,templates}/_.service.ts,apps/api/src/modules/{conflicts,agents,projects,users,project-members,phases,epics,tasks,roles}/_.controller.ts,apps/api/src/modules/synchronization/synchronization.service.ts,apps/api/test/{audit,api-keys}.e2e-spec.ts,docs/permissions.md,docs/Features.md,docs/Roadmap.md
- Verify: pnpm -r test (220 passed); pnpm test:e2e (135/135 passed); oxlint + tsc clean
- Follow-up: none

## [2026-09-18T13:51:00Z] | claude | GAP-23 | DONE

- Summary: GitHubGitProvider implements ProjectRepositoryProvider against GitHub REST API v3 (fetch, no new dep); GIT_PROVIDER_TYPE=github selects it process-wide via a manual-new factory so the fail-fast GITHUB_TOKEN check never runs for local deployments; GitHub docsPath repurposed as owner/repo[/subpath] slug (ADR-013); filesystem browser now 409s when provider isn't local
- Files: apps/api/src/modules/git-providers/github-git-provider.service.ts, git-providers.module.ts, filesystem-browser.service.ts, env.validation.ts, .env.example, docs/architecture.md, docs/Stack_Tecnologies.md, docs/Features.md
- Verify: lint clean; build clean; unit 72/72 (api) + 158/158 (web); e2e 135/135
- Follow-up: GAP-25 (a11y automation) and GAP-26 (WebSockets/webhooks/MCP priority) both need a human go-ahead before an agent picks them up, per Roadmap.md's note

## [2026-09-18T14:06:30Z] | claude | GAP-25 | DONE

- Summary: Playwright + @axe-core/playwright a11y suite (apps/web/playwright.config.a11y.mts, apps/web/a11y/) against app shell + 5 representative pages; found+fixed a real critical violation: documents-viewer/conflicts mat-form-fields were missing the app-wide appearance=outline convention, causing axe's hidden-explicit-label check to fire on the default fill appearance
- Files: apps/web/playwright.config.a11y.mts, apps/web/a11y/, apps/web/src/app/features/{documents-viewer,conflicts}/*.html, .github/workflows/ci.yml, docs/testing.md, docs/Stack_Tecnologies.md (ADR-014)
- Verify: lint clean; build clean; unit 72 api + 158 web; e2e 135/135; a11y 6/6
- Follow-up: GAP-26 still needs a human pick among WebSockets/webhooks/MCP; a11y coverage could broaden past the 5 current pages later

## [2026-09-18T14:29:05Z] | claude | GAP-26 | DONE

- Summary: NotificationsGateway pushes live over WebSockets (plain ws package via onApplicationBootstrap/HttpAdapterHost, not @nestjs/websockets decorator which crashed all e2e specs by probing for socket.io); ticket-based handshake auth (POST /realtime/ticket, single-use, 15s TTL); RealtimeService (web) refetches notifications on push, reconnects on drop. Picked WebSockets first of the brief GAP-26 trio per ADR-015; webhooks/MCP split to GAP-29/GAP-30
- Files: apps/api/src/modules/realtime/, apps/api/src/modules/notifications/notifications.service.ts, apps/web/src/app/core/realtime.service.ts, apps/web/src/app/layout/app-shell/app-shell.ts, packages/shared-types/src/realtime-message.ts, docs/architecture.md, docs/Stack_Tecnologies.md (ADR-015), docs/permissions.md
- Verify: lint clean; build clean; unit 82 api + 164 web; e2e 140/140; a11y 6/6
- Follow-up: GAP-29 (GitHub webhooks) and GAP-30 (MCP server) remain TODO, no strong asymmetry between them for an autonomous pick

## [2026-09-18T14:40:18Z] | Claude | GAP-26 | DONE

- Summary: Fix: isolate WS push failures (pushToActor) from notification-persistence errors in notifyProjectMembers — a stale socket or actor-lookup hiccup no longer logs as a failed notification create, since createMany already committed by the time push is attempted. Also tightened the docs/architecture.md realtime paragraph into one coherent flow.
- Files: apps/api/src/modules/notifications/notifications.service.ts, docs/architecture.md
- Verify: pnpm --filter api test 82/82, pnpm test:e2e 140/140, pnpm -r lint clean, pnpm -r build clean. Commit f39b0fc, pushed fc113fa..f39b0fc.
- Follow-up: Next: GAP-29 (GitHub webhooks) picked as the next autonomous target over GAP-30 (MCP server) — depends on GAP-23 already built, narrower acceptance criteria.

## [2026-09-18T15:05:12Z] | Claude | GAP-29 | DONE

- Summary: GitHub webhook ingestion: POST /webhooks/github verifies X-Hub-Signature-256 (HMAC-SHA256 over req.rawBody, timingSafeEqual), then runs SynchronizationService.runSync(projectId,'WEBHOOK') for every project whose docsPath names the pushed repo's full_name (exact JS-string prefix match, not Prisma startsWith -- Postgres LIKE treats backslash as its escape char, so a repo/docsPath with \, %, or _ silently failed to match; caught by the new e2e spec). New SyncTrigger.WEBHOOK enum value + migration. Non-push events (ping) and a matched project's own sync failure are both no-ops, never failing the delivery. ADR-016 (Stack_Tecnologies.md); permissions.md 'GitHub webhook trust boundary'; synchronization.md Trigger section updated. Picked over GAP-30 per Roadmap.md's recorded reasoning (extends GAP-23, narrower acceptance check).
- Files: apps/api/src/modules/github-webhook/_, apps/api/src/main.ts, apps/api/src/config/env.validation.ts, apps/api/prisma/schema.prisma+migration, apps/api/src/modules/synchronization/_, apps/api/src/app.module.ts, docs/{Stack_Tecnologies,permissions,synchronization,architecture,Roadmap,Features}.md
- Verify: pnpm --filter api test 92/92, pnpm test:e2e 145/145, pnpm -r lint clean, pnpm -r build clean.
- Follow-up: Next: GAP-30 (MCP server) is the only remaining brief §27/§29 item; otherwise continue scanning backlog/docs for the next pending point.
