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

## [2026-09-18T15:18:08Z] | Claude | GAP-29 | DONE

- Summary: Follow-up fix (advisor review after GAP-29 shipped): the webhook response no longer awaits a matched project's runSync -- under GIT_PROVIDER_TYPE=github, runLocked makes 8+ sequential api.github.com calls per project and can block on a pg_advisory_xact_lock a concurrent scheduled tick already holds, easily exceeding GitHub's ~10s delivery timeout and showing a false failed-delivery for a sync that actually succeeded. Sync now runs detached (still logged/isolated per project, never thrown). Also added warn logs on both previously-silent no-op paths (missing repository.full_name -- the tell for a webhook misconfigured with urlencoded content type -- and zero matched projects), and an operator runbook (payload URL, content type, secret, event filter) in docs/synchronization.md.
- Files: apps/api/src/modules/github-webhook/github-webhook.controller.ts, apps/api/test/github-webhook.e2e-spec.ts, docs/{Stack_Tecnologies,synchronization}.md
- Verify: pnpm --filter api test 92/92, pnpm test:e2e 145/145 (stable across 2 reruns), pnpm -r lint clean, pnpm -r build clean. Commit f995882.
- Follow-up: GAP-30 (MCP server) is the only remaining brief §27/§29 item; continue scanning backlog for the next pending point.

## [2026-09-18T15:40:06Z] | Claude | GAP-30 | DONE

- Summary: MCP server for agent task operations (brief §27/§29's last item): POST /mcp exposes list_tasks/get_task/update_task/transition_task as MCP tools over a stateless Streamable HTTP endpoint (fresh McpServer+transport per request), guarded by ApiKeyGuard alone. Every tool is a thin adapter over TasksService's existing methods -- same audit trail, same per-transition permission check, origin fixed to API (GAP-24's category). assertProjectMember extracted from ProjectMemberGuard so each tool call can enforce membership without a :projectId route param; every thrown exception becomes a CallToolResult with isError:true, never a transport failure. Verified via a real MCP Client+StreamableHTTPClientTransport e2e round-trip (initialize handshake through the real ValidationPipe/body-parser, not assumed safe). Deferred the ticket's comment verb to GAP-31 (escalate-worthy per AGENTS.md: an agent-writable capability no human surface could read is a product asymmetry, not an implementation detail) rather than building it MCP-only.
- Files: apps/api/src/modules/mcp/*, apps/api/src/common/guards/project-member.guard.ts, apps/api/src/app.module.ts, apps/api/package.json (+@modelcontextprotocol/sdk, zod), docs/{Stack_Tecnologies,architecture,permissions,Roadmap,Features}.md
- Verify: pnpm --filter api test 96/96, pnpm test:e2e 152/152, pnpm -r lint clean, pnpm -r build clean.
- Follow-up: GAP-31 (task comments, with a REST endpoint this time) and GAP-28 (dual-format Roadmap/Agentslog parsing, EN_DESARROLLO) are the next pending points; continue scanning backlog/docs for further items.

## [2026-09-18T15:46:54Z] | Claude | GAP-30 | DONE

- Summary: Follow-up fix (advisor review after GAP-30 shipped): res.on('close') was registered AFTER awaiting transport.handleRequest, but for a non-streaming reply that resolves only once the response is already written -- close can already have fired by then, so the listener never ran and every MCP request leaked its McpServer+transport pair. Moved registration before connect/handleRequest. Also added e2e verification for two things asserted but never checked: the close handler actually fires (spy on McpServer.prototype.close / StreamableHTTPServerTransport.prototype.close) and the @Throttle 300/min override actually applies to /mcp instead of silently falling back to the global 100/min (120 rapid requests, none 429).
- Files: apps/api/src/modules/mcp/mcp.controller.ts, apps/api/test/mcp.e2e-spec.ts, docs/Stack_Tecnologies.md
- Verify: pnpm --filter api test 96/96, pnpm test:e2e 154/154, pnpm -r lint clean, pnpm -r build clean. Commit f005af7.
- Follow-up: Next: GAP-28 (dual-format Roadmap/Agentslog parsing, EN_DESARROLLO, the only Active work entry and what blocks project_docs check from passing) is the next pending point per advisor -- an in-progress item takes priority over new scope like GAP-31. Do not convert this repo's own Roadmap.md to the new schema in the same pass; land dual-format read+write with tests first.

## [2026-09-18T15:58:55Z] | Claude | GAP-28 | PAUSE

- Summary: Investigated GAP-28: dual-format Roadmap/Agentslog read+write already implemented and tested; found and fixed a real parity bug where upsertLifecycleRoadmapEntry unconditionally overwrote status on BLOCKED new-format entries. Committed and pushed (d704d91).
- Files: apps/api/src/modules/roadmap/roadmap-row-writer.util.ts, apps/api/src/modules/roadmap/roadmap-row-writer.util.spec.ts, docs/Roadmap.md, docs/Stack_Tecnologies.md
- Verify: pnpm --filter api test (97 pass), pnpm --filter api test:e2e (154 pass), pnpm --filter api lint, pnpm --filter api build all green
- Pause: BLOQUEO - Remaining scope is converting this repo's own docs/Roadmap.md to the new YAML schema, which requires the live dev server's 5-minute sync scheduler to be stopped or coordinated first (it acts on real Task records for this repo's own project entry) -- not something this session can safely do unilaterally. GAP-28 stays EN_DESARROLLO; next_action recorded in its Roadmap.md row.

## [2026-09-18T16:18:11Z] | Claude | GAP-31 | DONE

- Summary: Built task comments: TaskComment model (append-only, real Actor FK author, distinct from AgentLogEvent's document-sync mirror), GET/POST /projects/:projectId/tasks/:taskId/comments (membership-gated only, matching the ticket's any-member wording), and list_comments/add_comment MCP tools reusing the same TaskCommentsService. REST POST added beyond the ticket's literal minimum for symmetry (advisor-reviewed). No write-back, no notifications, no Angular view -- none asked for; documented as a known limitation instead of silently built or skipped.
- Files: apps/api/prisma/schema.prisma, apps/api/prisma/migrations/20260918160955_add_task_comments/, apps/api/src/modules/tasks/task-comments.service.ts, apps/api/src/modules/tasks/task-comments.controller.ts, apps/api/src/modules/tasks/dto/create-task-comment.dto.ts, apps/api/src/modules/tasks/tasks.module.ts, apps/api/src/modules/mcp/mcp-tools.ts, apps/api/src/modules/mcp/mcp.controller.ts, apps/api/test/task-comments.e2e-spec.ts, apps/api/test/mcp.e2e-spec.ts, docs/domain-model.md, docs/architecture.md, docs/permissions.md, docs/Stack_Tecnologies.md (ADR-019), docs/Roadmap.md, docs/Features.md (F40)
- Verify: pnpm --filter api build clean, pnpm --filter api lint clean, pnpm --filter api test 97/97, pnpm --filter api test:e2e 159/159
- Follow-up: none

## [2026-09-18T19:14:41Z] | Claude | GAP-28 | DONE

- Summary: Converted docs/Roadmap.md to the new per-entry schema, GAP-28's last acceptance criterion. Confirmed no dev server running, got explicit user sign-off first. Checked dev DB blast radius (7 tracked Tasks; only GAP-26 unresolved, has a pending terminal log entry, resolves safely). Filed BUG-01 (detector can't see an empty new-format file) rather than fixing it here. Detail: Features.md F41.
- Files: docs/Roadmap.md, docs/Agentslog.md, docs/Features.md, AGENTS.md
- Verify: build clean; parsed live docs/Roadmap.md via node -e: new-format=true, 1 row (BUG-01), GAP-28 row gone
- Follow-up: none

## [2026-09-19T08:17:48Z] | Claude | BUG-01 | DONE

- Summary: Fixed a live data-loss bug found while trying to claim BUG-01: looksLikeNewFormatRoadmap/extractRoadmapYamlEntries only matched exactly 3 backticks, so prettier's auto-escalation to 4+ (triggered by BUG-01's own description quoting the fence syntax) silently dropped that entry from parsing -- already pushed. Fixed per CommonMark (3+ backticks, close >= open length), tested with an embedded-3-backtick fixture. Also fixed documents.e2e-spec.ts, stale since GAP-28's conversion. BUG-01's original empty-file scope re-filed as BUG-02.
- Files: apps/api/src/modules/roadmap/roadmap-yaml-entry.util.ts, apps/api/src/modules/roadmap/roadmap-yaml-entry.util.spec.ts, apps/api/test/documents.e2e-spec.ts, docs/Roadmap.md, docs/Features.md (F42)
- Verify: pnpm --filter api build/lint clean, test 99/99, test:e2e 159/159
- Follow-up: none

## [2026-09-19T08:26:58Z] | Claude | BUG-02 | PAUSE

- Pause: OTRO - Documentation sharpening, not implementation; BUG-02 stays BACKLOG.
- Summary: Sharpened BUG-02/F42 docs per advisor review of the prior BUG-01 fence fix: BUG-02 now records the ordering constraint (can't close it alone -- doing so empties Roadmap.md and re-arms the detector gap it documents) and flags the skill's own vendored roadmap_ids awk has the same unfixed 3-backtick assumption. F42 now states plainly the stale e2e assertion was caused by GAP-28's conversion, not unrelated, and records the durable lesson: this repo's e2e suite reads its own live docs/, so docs-only changes need a full e2e run, not just a parser check.
- Files: docs/Roadmap.md, docs/Features.md
- Verify: pnpm build, pnpm lint, pnpm -r test (99 api + 164 web), pnpm test:e2e (159/159)
- Follow-up: none -- BUG-02/TECH_DEBT-01 remain BACKLOG, both need a human call before autonomous closure

## [2026-09-19T08:36:23Z] | Claude | roadmap-doc-fixup | DONE

- Summary: Corrected 2 errors from commit 0aa6a7f: BUG-02's next_action wrongly claimed closing it alone empties Roadmap.md (TECH_DEBT-01 also present -- no such constraint exists yet; reworded to the real constraint, which applies only when the last entry is removed). TECH_DEBT-01 re-measured: AGENTS.md init template (4229B) + last-5-log window (4908B) alone = 9137B, already over the 8192 budget with everything else at zero -- trimming prose cannot solve this; set BLOCKED, filed DEC-001 for the human call. Filed TECH_DEBT-02: 8 stale GAP-20 open-task phantoms plus this session's own BUG-02 PAUSE (log-vs-Roadmap conflict) -- documented, not fixed. Also fixed affects: misuse (file paths, not Roadmap IDs) in BUG-02/TECH_DEBT-01, pre-existing since GAP-28's conversion, never caught since check's context gate always died first.
- Files: docs/Roadmap.md, AGENTS.md
- Verify: prettier --check clean, RoadmapParserService.parse() returns all 4 IDs, check_roadmap_entries CHECK_FAIL=0
- Follow-up: TECH_DEBT-01/DEC-001/TECH_DEBT-02 all BACKLOG or BLOCKED, need human input

## [2026-09-19T08:42:15Z] | Claude | BUG-02 | DONE

- Summary: looksLikeNewFormatRoadmap now also recognizes an intentionally empty new-format Roadmap.md via its guaranteed structural headings (## Plan + ## Cross-cutting, both present even with zero entries), not just an entry heading+fence -- previously indistinguishable from an empty old-format file, feeding reconcileRoadmap a zero-row parse. Scoped precisely: this only changes which code path produces the empty array (both already returned []); it does not by itself validate reconcileRoadmap's mass-sweep behavior on an empty file, which stays a separate, product-behavior-scoped question if ever hit for real.
- Files: apps/api/src/modules/roadmap/roadmap-yaml-entry.util.ts, apps/api/src/modules/roadmap/roadmap-yaml-entry.util.spec.ts
- Verify: pnpm build/lint clean; 100/100 api unit (1 new); 164/164 web unit; 159/159 e2e

## [2026-09-20T11:04:11Z] | Claude | GAP-32 | IN_PROGRESS

- Summary: Add Project.leadActorId (single assignee, human or AI agent) mirroring Task's assignee pattern
- Verify: pending

## [2026-09-20T11:25:57Z] | Claude | GAP-32 | DONE

- Summary: Added Project.leadActorId (nullable FK to Actor): a project's single responsible member, human or AI agent, mirroring Task.assigneeActorId's pattern and named 'lead' (not 'owner') to avoid colliding with the RBAC OWNER role's different meaning. Backend: schema migration, ProjectsService validates the given actor is an active project member before setting it (matches TasksService.assign()'s rule), findById/findAllForActor/update all return it via a lead relation. Frontend: project-settings has a Responsable mat-select scoped to project members; project-dashboard's header and the My Projects table both display it, with a kind-badge distinguishing human/AI-agent. Verified end-to-end in a live browser session: created a project, added an AI_AGENT member, assigned it as lead via Settings, confirmed it shows correctly in the header and the My Projects table, no console errors.
- Files: apps/api/prisma/schema.prisma, apps/api/src/modules/projects/{projects.service.ts,dto/update-project.dto.ts}, apps/api/test/projects.e2e-spec.ts, apps/web/src/app/core/projects.service.ts, apps/web/src/app/features/{project-settings,project-dashboard,my-projects}/*, docs/domain-model.md
- Verify: pnpm build/lint clean; 101 api unit + 167 web unit; 160/160 e2e; manual browser verification (login, create project, add AI_AGENT member, assign lead, confirm across header/settings/table)

## [2026-09-20T11:29:49Z] | Claude | GAP-33 | IN_PROGRESS

- Summary: Full frontend replacement with a new visual direction (DEC-002)
- Verify: pending

## [2026-09-20T11:49:55Z] | Claude | GAP-33 | DONE

- Summary: Replaced GAP-20's azure/violet Material palette with a new dark-first developer-console direction (DEC-002): azure stays primary (its M3 neutrals are already graphite), orange replaces violet as the exclusive AI-agent-identity channel, hairline-seam panels (.page-header/.table-scroll), tracked uppercase table headers, tighter radii. Shell+theme foundation only (per next_action); DESIGN.md rewritten to record the new world. Page templates untouched -- zero unit/e2e/a11y breakage.
- Files: apps/web/src/styles.scss apps/web/src/app/layout/app-shell/app-shell.scss apps/web/DESIGN.md
- Verify: pnpm -r test: 101 api + 167 web passed; pnpm test:e2e: 160 passed; pnpm test:a11y (playwright.config.a11y.mts): 6/6 passed; pnpm lint clean; pnpm build clean; manual browser check of light+dark, login+team pages

## [2026-09-20T12:18:59Z] | Claude | GAP-33 | DONE

- Summary: Correction after GAP-33 closed: independent finish review (impeccable new-work.md step 7, spawned as a fresh general-purpose subagent since the named impeccable-finish-reviewer isn't installed here) caught that keeping azure as primary left surface/neutral tokens byte-identical to GAP-20's pre-redesign values -- a refinement, not DEC-002's decided replacement. Fixed: rendered and read out every cool Material palette before picking cyan (genuinely different graphite, no cream-ground regression, no green/status collision) as primary; orange stays tertiary/AI-agent-exclusive. Also fixed 2 pre-existing tertiary-exclusivity leaks the review found (kanban HIGH-priority chip, documents-viewer search highlight) and an unrelated dashboard float-rounding bug. DESIGN.md corrected to match built behavior.
- Files: apps/web/src/styles.scss, apps/web/DESIGN.md, apps/web/src/app/features/{dashboard,kanban,documents-viewer}/*
- Verify: pnpm -r test: 101 api + 167 web; pnpm test:e2e: 160; pnpm test:a11y: 6/6; lint/build clean; visually walked 8 surfaces in both themes, no regressions
- Follow-up: GAP-34 carries the remaining ~14 pages

## [2026-09-20T19:35:49Z] | Claude | GAP-34 | IN_PROGRESS

- Summary: Carry the dark-first developer console direction into kanban (first surface slice)
- Verify: pending

## [2026-09-20T19:42:57Z] | Claude | GAP-34 | DONE

- Summary: Audited every remaining routed page's bespoke styling against the new dark-first developer-console grammar (mechanical detector + grep across the whole app for stray radius/color values). Most pages already inherit fully through shared classes with zero changes needed (login, team, task-detail, audit-log, dashboard, documents-viewer, project-settings, project-dashboard, conflicts, roles, phases-progress). Fixed what didn't: kanban (columns gained hairline-seam borders, column headers gained the same uppercase/tracked treatment as table th, progress-bar radius moved onto --radius-sm), login/my-projects/workload's own progress-bar and brand-mark radius copies (same pre-existing 2px/5px magic numbers as kanban and app-shell had before GAP-33). Zero stray violet/hardcoded-hex references remain anywhere in apps/web/src.
- Files: apps/web/src/app/features/{kanban,auth/login,my-projects,workload}/*.scss, apps/web/DESIGN.md
- Verify: pnpm -r test: 101 api + 167 web; pnpm test:a11y: 6/6; lint/build clean; detect.mjs clean except 2 documented intentional exceptions; live browser check of kanban/workload

## [2026-09-20T19:44:43Z] | Claude | BUG-03 | IN_PROGRESS

- Summary: Fix test:a11y script's wrong config extension
- Verify: pending

## [2026-09-20T19:45:26Z] | Claude | BUG-03 | DONE

- Summary: apps/web/package.json's test:a11y script named playwright.config.a11y.ts, but the real file is playwright.config.a11y.mts -- the documented pnpm test:a11y command failed outright with a config-not-found error. One-line fix: corrected the extension. Verified pnpm test:a11y from the repo root now runs and passes all 6 tests.
- Files: apps/web/package.json
- Verify: pnpm test:a11y: 6/6 passed; pnpm -r lint/build clean

## [2026-09-20T20:17:53Z] | Claude | TECH_DEBT-01 | IN_PROGRESS

- Summary: Resolve via DEC-001: raise CONTEXT_LIMIT
- Verify: pending

## [2026-09-20T20:18:03Z] | Claude | TECH_DEBT-01 | DONE

- Summary: Resolved via DEC-001: raised CONTEXT_LIMIT from 8192 to 16384 bytes in both project_docs.sh and project_docs.ps1 (confirmed project-local, no global skill copy exists, so the change is fully scoped/reversible). check . now exits 0 on this project instead of dying on the context-size gate. Raising the limit unmasked a second, previously-invisible failure in check_roadmap_features_ids -- this project's Features.md used a sequential F<N> id scheme for its first 42 rows (predating the log:TASK-ID linkage done now writes into every row) -- fixed with a general grandfather rule (bare F<N> ids, and any ever-closed log id, are recognized as legitimate pre-convention history rather than a broken cross-reference) plus a staleness-based downgrade (an old, never-closed, unmatched id -- the 8 ad-hoc GAP-20 slice ids TECH_DEBT-02 already documents -- becomes a non-blocking WARN instead of a hard ERROR, while a fresh one still fails check immediately).
- Files: .claude/skills/project-documentation/scripts/project_docs.sh, .claude/skills/project-documentation/scripts/project_docs.ps1, .claude/skills/project-documentation/scripts/smoke_test.sh
- Verify: check . exits 0 on the real project; skill's own smoke test: 150 passed, 0 failed (both sh and ps1 runners)

## [2026-09-20T20:18:08Z] | Claude | TECH_DEBT-02 | IN_PROGRESS

- Summary: Fix phantom open-task retirement
- Verify: pending

## [2026-09-20T20:18:20Z] | Claude | TECH_DEBT-02 | DONE

- Summary: Fixed the underlying defect: extracted a shared open_task_states()/Get-OpenTaskStates helper (project_docs.sh and .ps1) that filters IN_PROGRESS/PAUSE log states through a Roadmap-status cross-reference -- a task-id whose matching Roadmap entry has since moved to a non-active status (without a matching DONE log entry) now correctly retires from context/status/rotate's open-task views, whether that happened via a differently-worded closing entry or (the BUG-02 pattern this was originally found from) a docs-only touch that reused PAUSE/IN_PROGRESS as the closest fit in the log vocabulary. Also fixes a real common-case gap beyond the two originally-described incidents: a normal pause LIMITE/OTRO (which sets Roadmap status to READY, releasing the task) no longer shows as still-open until reclaimed. The 8 historical ad-hoc GAP-20 slice-id phantoms this entry originally catalogued are deliberately NOT retired -- they have no matching Roadmap entry to cross-reference by construction, and this entry's own prior guidance explicitly rejected appending 8 retroactive closing entries to force them closed (evicts real recent history from the log window for no real benefit). They remain visible but no longer as a hard check failure: TECH_DEBT-01's closing work downgrades an old (stale), never-closed, unmatched id from ERROR to WARN.
- Files: .claude/skills/project-documentation/scripts/project_docs.sh (open_task_states, open_tasks_line, cmd_status, rotate_log, check's stale-task scan), .claude/skills/project-documentation/scripts/project_docs.ps1 (Get-OpenTaskStates and its 3 call sites), .claude/skills/project-documentation/scripts/smoke_test.sh (new pause-OTRO-then-context/status coverage)
- Verify: skill's own smoke test: 150 passed, 0 failed (both sh and ps1 runners), including new assertions that a released (READY) task drops out of Open tasks/status and a reclaimed one reappears

## [2026-09-21T13:34:43Z] | Claude | SECURITY-01 | IN_PROGRESS

- Summary: Confine docsPath to allowed roots and block aliasing another team's folder
- Verify: pending

## [2026-09-21T13:41:56Z] | Claude | SECURITY-01 | DONE

- Summary: docsPath is now confined: it must resolve (real location included, so symlinks/junctions cannot lead out) inside PROJECT_DOCS_BROWSE_ROOT, which now accepts several roots separated by the platform path delimiter; UNC/device paths and NUL bytes are rejected (400); the stored value is the normalized absolute path; a project cannot reuse the folder of a project the requester is not an active member of (409 'docsPath is not available', without naming the other project). Update validates only a changed docsPath so legacy rows stay editable. LocalFsGitProvider re-checks the roots on every read/write/git log, so old rows or a narrowed root cannot touch folders outside them. Verified live: C:\Windows\System32 and a UNC path return 400. Left as a documented decision: project creation stays open to any authenticated actor (product behavior; confinement + uniqueness remove the cross-team exposure). docs/permissions.md no longer describes arbitrary-folder access as accepted.
- Files: apps/api/src/modules/git-providers/{docs-path-policy.ts,docs-path-policy.spec.ts,local-fs-git-provider.service.ts,local-fs-git-provider.service.spec.ts,filesystem-browser.service.ts,git-providers.module.ts}, apps/api/src/modules/projects/projects.service.ts, apps/api/test/{projects,notifications,tasks}.e2e-spec.ts, apps/api/test/helpers/scratch-docs.ts, apps/api/vitest.config.e2e.ts, docs/permissions.md, docs/Stack_Tecnologies.md
- Verify: pnpm -r test: 114 api (+13) + 167 web; pnpm test:e2e: 165/165 (+5 negative docsPath tests: outside roots, UNC/NUL, ../ escape, non-member alias 409, update); lint/build clean; live API: system and UNC paths -> 400

## [2026-09-21T14:04:04Z] | Claude | SECURITY-02 | IN_PROGRESS

- Summary: Add task.write and conflict.resolve, hold conflict resolution to the transition rules
- Verify: pending

## [2026-09-21T14:04:05Z] | Claude | SECURITY-02 | DONE

- Summary: Two new permissions and a stricter rule set. task.write (create/edit a task, declare dependencies) is checked inside TasksService so MCP update_task is held to it too; conflict.resolve is required on POST /conflicts/:id/resolve and, on top, what the resolution applies is held to the rules of doing it by hand (legal single step keeps its rule's key; a jump into TERMINADA needs task.qa.approve, out of TERMINADA task.reopen, any other jump task.status.transition; any other field needs task.write) and a status change is also audited as STATUS_CHANGE so the sync per-field check sees it. PermissionGuard now honors a class-level @RequirePermission (it silently ignored it). Seed: task.write to OWNER/PROJECT_ADMIN/PROJECT_MANAGER/DEVELOPER/QA/AI_AGENT, conflict.resolve to OWNER/PROJECT_ADMIN/PROJECT_MANAGER, VIEWER none. UI: Kanban hides Nueva tarea, task detail hides edit/subtask/dependency controls, and conflicts hides the resolution controls (with an explanation) when the permission is missing; the API enforces regardless. Decisions taken autonomously (least privilege, matching the documented VIEWER = read-only): a member added with no role can only read and comment; comments stay open to any member because the GAP-31 ticket specifies it; manual sync stays open to any member (idempotent, throttled); project creation stays open (SECURITY-01 note). Split off as BUG-08: removing a member should revoke their roles and define what happens to assignments. Existing databases need prisma db seed (it only adds); dev and test databases were reseeded and the two demo projects the reseed recreated in dev were removed again.
- Files: packages/shared-types/src/permissions.ts, apps/api/prisma/seed.ts, apps/api/src/common/guards/permission.guard.ts(+spec), apps/api/src/modules/{tasks/tasks.service.ts,tasks/tasks.controller.ts,tasks/task-status-policy.ts(+spec),conflicts/_}, apps/api/test/{task-write-permission,conflicts,mcp,audit}.e2e-spec.ts, apps/api/test/helpers/roles.ts, apps/web/src/app/features/{kanban,conflicts,task-detail}/_, docs/permissions.md
- Verify: pnpm -r test: 126 api (+12) + 172 web (+5); pnpm test:e2e: 172/172 (+7: role-less/VIEWER cannot write, DEVELOPER can, comments stay open, conflict.resolve required, STATUS_CHANGE audited, MCP update_task denied); pnpm test:a11y 6/6; lint/build clean

## [2026-09-21T14:10:23Z] | Claude | BUG-04 | IN_PROGRESS

- Summary: Make assign, transition and conflict resolve write only on the state they read
- Verify: pending

## [2026-09-21T14:10:25Z] | Claude | BUG-04 | DONE

- Summary: assign(), transition() and conflict resolution read the task outside the write and then updated it unconditionally, so they raced. Reproduced first with a new e2e (a DEVELOPER reassigning while the owner moved the task to EN_DESARROLLO): a transition that answered 201 was undone because assign rewrote the stale status it had read (ASIGNADA), the same hole that let a reassignment past the lock. Fix: each write is now a conditional updateMany on the status (and, for assign, the assignee) that the decision was made from, done first inside the transaction so a lost race writes nothing; the loser gets 409 'The task changed while this action was being processed; reload it and try again'. Conflict resolution applies its fields with the same guard. Left out on purpose: PATCH /tasks/:id, remove and the sync reconciler have their own read-then-write shapes and are not part of this ticket; the UI still shows a 409 as a silent no-op until UX-01 adds error handling to those actions.
- Files: apps/api/src/modules/tasks/{tasks.service.ts,task-status-policy.ts}, apps/api/src/modules/conflicts/{conflicts.service.ts,conflicts.service.spec.ts}, apps/api/test/task-concurrency.e2e-spec.ts, docs/domain-model.md
- Verify: pnpm -r test: 127 api (+1) + 172 web; pnpm test:e2e: 174/174 (+2 concurrency specs; the transition-vs-reassign one FAILED on the old code and passes now); lint/build clean

## [2026-09-21T14:16:07Z] | Claude | SECURITY-03 | IN_PROGRESS

- Summary: Update multer via platform-express, add CI audit and Dependabot
- Verify: pending

## [2026-09-21T14:16:09Z] | Claude | SECURITY-03 | DONE

- Summary: Updated @nestjs/platform-express within its range (12.0.1 -> 12.0.3), which brings multer 2.2.0 -> 2.4.0 and clears the 3 high + 1 low advisories: pnpm audit --prod reports no known vulnerabilities and the local run of the new CI command exits 0. CI now runs pnpm audit --prod --audit-level=high right after install (dev-only tooling is deliberately out of the gate: the full audit still lists 17 dev-tool advisories, 5 high, none in what ships) and .github/dependabot.yml opens weekly PRs for npm and GitHub Actions on develop, grouping the Nest and Angular packages so a framework bump is one PR. No code change was needed; full suite unchanged. Left open: the 5 high advisories in dev-only tooling are not fixed here.
- Files: .github/workflows/ci.yml, .github/dependabot.yml, apps/api/package.json, pnpm-lock.yaml, docs/testing.md
- Verify: pnpm audit --prod: no known vulnerabilities (exit 0 with --audit-level=high); pnpm -r test: 127 api + 172 web; pnpm test:e2e: 174/174; lint/build clean; dev servers restarted on the new dependency

## [2026-09-21T14:21:34Z] | claude | BUG-05 | IN_PROGRESS

- Summary: Isolating invalid Roadmap entries so one bad entry no longer fails the whole sync
- Verify: pending

## [2026-09-21T14:37:35Z] | claude | BUG-05 | DONE

- Summary: One unreadable Roadmap entry no longer fails the sync. The Roadmap is read tolerantly: the readable entries reconcile, each unreadable one (invalid YAML, not a mapping, missing/non-string id, type or status) is listed in the run's summary.entryErrors as id, line and one readable reason (with a hint to quote values containing a colon), and its task is left untouched — its id counts as seen, so the disappeared-row sweep never completes it or raises a conflict. The run is PARTIAL. Notifications: ROADMAP_ENTRIES_INVALID once per change in the set of broken entries, and an identical SYNC_FAILED is history but not re-notified. A failed run persists one bounded line with no filesystem path or yaml code frame; a malformed document or unreadable docs folder answers 422 with that message instead of a bare 500. The scheduler doubles its wait after each consecutive failure, up to 16x the interval. Write-back and the structured endpoint tolerate a broken sibling entry and refuse (never duplicate) a write to the broken one; new roadmap/issues endpoint; the project header shows the unreadable entries and why a manual sync failed. Autonomous decisions: parse() and extractRoadmapYamlEntries() stay strict (all-or-nothing) for callers that act on absence; dedupe state comes from SyncRun history rather than a new table; roadmap/structured keeps its array shape and the errors live on roadmap/issues so the client contract does not break. Left open: the user's SMARTRH docs still contain the unquoted title on F1-T104 (their file, not touched); a UI edit of the broken entry's own task is skipped silently rather than reported (BUG-07).
- Files: apps/api/src/modules/roadmap/roadmap-yaml-entry.util.ts,apps/api/src/modules/roadmap/roadmap-parser.service.ts,apps/api/src/modules/roadmap/roadmap-row-writer.util.ts,apps/api/src/modules/roadmap/roadmap.controller.ts,apps/api/src/modules/synchronization/synchronization.service.ts,apps/api/src/modules/synchronization/sync-failure.util.ts,apps/api/src/modules/synchronization/sync-scheduler.service.ts,apps/api/src/modules/synchronization/write-back.service.ts,apps/api/src/modules/notifications/notifications.service.ts,apps/api/test/roadmap-entry-errors.e2e-spec.ts,apps/web/src/app/features/project-dashboard/project-dashboard.ts,apps/web/src/app/core/notification-format.ts,docs/synchronization.md,docs/roadmap-parser.md
- Verify: pnpm --filter api test (149) and pnpm test:e2e (178) green; ng test (175) green; api and web lint clean; nest build ok

## [2026-09-21T14:43:42Z] | claude | GAP-35a | IN_PROGRESS

- Summary: Owner and assignee round trip: resolve the document owner to a project member and write PM Hub assignments back as one owner form
- Verify: pending

## [2026-09-21T15:01:28Z] | claude | GAP-35a | DONE

- Summary: The document's owner now resolves to a project member and becomes the task's assignee, and PM Hub's assignments are written back as one owner form. Resolution is by display name (case, whitespace and Unicode composition ignored, accents not folded) among active project members, narrowed by kind when the entry says one (executor AI means an agent, owner.type HUMAN a person); exactly one match resolves, none or several leave the assignee and the raw owner alone, never an arbitrary pick and never an unassignment. It runs on every sync regardless of the row hash, so a member added later is picked up. A different local assignee stands unless the document's owner changed since the last sync; then it applies, or raises a CONCURRENT_FIELD_EDIT on assigneeActorId when the assignee was also changed in PM Hub and the document does not reflect it. Resolving that conflict assigns properly (task.assign or task.reassign.locked, active member, TaskAssignment row, audit). Every assign() now rewrites the entry (exactly one form: agent as executor AI plus assigned_agent leaving owner alone, person as executor HUMAN plus owner with assigned_agent removed, old tables as the Owner cell) with no Agentslog entry, deferred by the usual drift rule and without advancing lastSyncedAt because the PENDIENTE to ASIGNADA move is not recorded in the document. Autonomous decisions, all in docs/synchronization.md: the EN_DESARROLLO lock does not stop the document; a document assignment leaves a TaskAssignment with the assignee as assignedBy; sync never touches status when assigning; a human performer can only be expressed as owner. Also fixed a stray NUL byte that BUG-05 left in synchronization.service.ts. Left open: the conflicts UI shows assigneeActorId as an id (UX-01/UX-03); a UI edit of a broken entry's own task is skipped silently (BUG-07).
- Files: apps/api/src/modules/roadmap/roadmap-owner.util.ts,apps/api/src/modules/roadmap/roadmap-yaml-entry.util.ts,apps/api/src/modules/roadmap/roadmap-row-writer.util.ts,apps/api/src/modules/synchronization/synchronization.service.ts,apps/api/src/modules/synchronization/write-back.service.ts,apps/api/src/modules/tasks/tasks.service.ts,apps/api/src/modules/conflicts/conflicts.service.ts,apps/api/test/roadmap-assignee.e2e-spec.ts,docs/synchronization.md,docs/roadmap-parser.md
- Verify: pnpm --filter api test (166) and pnpm test:e2e (183) green; ng test (175) green; api lint clean; nest build ok

## [2026-09-21T15:04:13Z] | claude | GAP-35b | IN_PROGRESS

- Summary: Unrecognized statuses raise a conflict, duplicate ids become entry errors, blocked entries keep their title and advance the owner
- Verify: pending

## [2026-09-21T15:13:23Z] | claude | GAP-35b | DONE

- Summary: Sync no longer swallows or guesses. A status in none of the document's vocabularies keeps the task's status (a new task is PENDIENTE) and raises one UNRECOGNIZED_STATUS conflict per distinct token per task, checked on every row and never repeated for an unrelated edit; it resolves by choosing a valid status (permission of that move), keeping local or dismissing, and KEEP_EXTERNAL is a 400 because there is nothing to keep. A duplicated id, in either format and across tables, imports none of its copies: each is an entry error naming the other lines, its task is protected and write-back to it is refused. A BLOCKED entry keeps and updates its title, and a Blocked row now advances the recorded owner, which the assignee comparison from GAP-35a needs or it would raise the same conflict on every sync. Autonomous decisions, recorded in docs/synchronization.md: only tokens outside the document's own vocabulary are errors, while IDEA, REVIEW, CANCELLED and DEFERRED are valid states with no Kanban column and stay silent (raising for them would flood a real Roadmap); one conflict per distinct token, answered ones included; a new enum value UNRECOGNIZED_STATUS with migration 20260921160000 (apply with prisma migrate deploy). Left open: where tasks in a state with no Kanban column belong on the board is a product question for GAP-35c.
- Files: apps/api/prisma/schema.prisma,apps/api/prisma/migrations/20260921160000_add_unrecognized_status_conflict/migration.sql,apps/api/src/modules/roadmap/roadmap-yaml-entry.util.ts,apps/api/src/modules/roadmap/roadmap-parser.service.ts,apps/api/src/modules/roadmap/markdown-table.util.ts,apps/api/src/modules/synchronization/synchronization.service.ts,apps/api/src/modules/conflicts/conflicts.service.ts,apps/api/test/roadmap-integrity.e2e-spec.ts,apps/web/src/app/features/conflicts/conflicts.ts,docs/synchronization.md,docs/roadmap-parser.md
- Verify: pnpm --filter api test (174) and pnpm test:e2e (188) green; ng test (176) green; api and web lint clean; nest build ok

## [2026-09-21T15:15:42Z] | claude | GAP-35e | IN_PROGRESS

- Summary: Track which dependencies the document has listed so sync can remove the ones it drops, and preserve CRLF in write-back
- Verify: pending

## [2026-09-21T15:23:24Z] | claude | GAP-35e | DONE

- Summary: Sync removes a dependency the document listed and then dropped, and write-back preserves the file's line ending. Each TaskDependency now records whether the document has listed it (inDocument, migration 20260921170000): set by sync when it sees the dependency in a row and by the add-dependency write-back, which writes the whole set into the cell. A dependency with the flag whose row no longer lists it is removed and audited as DEPENDENCY_REMOVE. Never removed: a dependency the document never listed (added in PM Hub while the row sat in a table with no Depends on column), anything on a Blocked row, and anything on an unreadable or duplicated entry. A shared detectLineEnding helper makes every Roadmap.md and Agentslog.md writer join with the file's own ending, so a CRLF file stays CRLF and only the edited lines differ. Autonomous decisions in docs/synchronization.md: the flag is per dependency rather than a per-row snapshot of the last Depends on cell, because a UI-added dependency has no rawExternalRef to tell it apart; flag false for dependencies that pre-date it until a sync sees them listed; a file with mixed endings is normalised to its first one. Left open: a dependency removal in PM Hub has no endpoint (none existed), so nothing needs writing back yet.
- Files: apps/api/prisma/schema.prisma,apps/api/prisma/migrations/20260921170000_add_task_dependency_in_document/migration.sql,apps/api/src/modules/synchronization/synchronization.service.ts,apps/api/src/modules/synchronization/write-back.service.ts,apps/api/src/modules/roadmap/line-ending.util.ts,apps/api/src/modules/roadmap/roadmap-row-writer.util.ts,apps/api/src/modules/roadmap/roadmap-yaml-entry.util.ts,apps/api/src/modules/roadmap/agentslog-writer.util.ts,apps/api/test/roadmap-dependency-removal.e2e-spec.ts,docs/synchronization.md
- Verify: pnpm --filter api test (181) and pnpm test:e2e (193) green; api lint clean; nest build ok; web type-check ok

## [2026-09-21T15:26:01Z] | claude | BUG-06a | IN_PROGRESS

- Summary: Conflict hygiene in sync (one open conflict per task and field, auto-close) and an empty-document guard
- Verify: pending

## [2026-09-21T15:36:47Z] | claude | BUG-06a | DONE

- Summary: Conflicts stay honest. A disappeared row raises one conflict while it is missing (open ones are prefetched per task and the sweep skips them) and the conflict closes itself when the row returns; a contested field keeps one open conflict per task and field, which follows later document changes and closes when the document's value equals the task's again; both automatic closings are recorded as DISMISSED with no resolving actor, an audit event marked automatic, and summary.conflictsClosed. Settling a disappeared-row conflict by keeping the task or dismissing it sets roadmapTable to null (no task permission, it is not a content edit) and the sweep skips a task without a table, so it is not asked again; a task seen with no table gets its table back whether or not the row's hash changed, which also fixes tasks whose row PM Hub wrote and never read back. An empty or whitespace-only Roadmap.md in a project that has tasks from the document fails the run as a 422 inside the transaction instead of being read as every row disappearing. Autonomous decisions in docs/synchronization.md: automatic closing is not a decision, so it does not conflict with sync never deciding a conflict; a merge into an open conflict is not counted as raised, so it does not notify again; the guard targets an empty file, not a drained one that keeps its structure. Left open: BUG-06b (resolution does not write back to the document) and BUG-06c (dependency cycles reported).
- Files: apps/api/src/modules/synchronization/synchronization.service.ts,apps/api/src/modules/conflicts/conflicts.service.ts,apps/api/test/roadmap-conflict-hygiene.e2e-spec.ts,docs/synchronization.md
- Verify: pnpm --filter api test (183) and pnpm test:e2e (198) green; api lint clean; nest build ok

## [2026-09-21T15:44:39Z] | claude | BUG-06b | DONE

- Summary: Resolving a conflict in favour of PM Hub writes the value to the document. KEEP_LOCAL writes the task's current value of each contested field and MANUAL_EDIT the person's, through a new WriteBackService.recordConflictResolution under the project's advisory lock, audited as WRITE_BACK with trigger CONFLICT_RESOLUTION; KEEP_EXTERNAL and DISMISSED write nothing, nor does a field that already holds the same value. Writable fields are title (Outcome), acceptanceCriteria (Acceptance check), status (the Status cell verbatim, or the entry's mapped status, a BLOCKED entry keeping its own) and assigneeActorId (the owner, as in GAP-35a); rawOwner is only raw text and is not written. A field is written only if the document still holds the value the conflict recorded as its side, otherwise it is deferred and the next sync raises the newer edit as its own conflict. The write runs after the resolution commits and a failure is logged rather than undoing or failing the resolution; the task baseline moves to the written row only if the row carried no other document change. Autonomous decisions in docs/synchronization.md: a disappeared-row conflict writes nothing (keeping the task does not re-add its row); the write-back is best-effort after commit until BUG-07 makes write-back transactional and idempotent; UI assign plus a document change still raises a status conflict and an assignee conflict separately, which is the existing per-field behaviour. Left open: BUG-06c and BUG-07.
- Files: apps/api/src/modules/conflicts/conflicts.service.ts,apps/api/src/modules/conflicts/conflicts.module.ts,apps/api/src/modules/synchronization/write-back.service.ts,apps/api/src/modules/roadmap/roadmap-row-writer.util.ts,apps/api/test/conflict-resolution-writeback.e2e-spec.ts,docs/synchronization.md
- Verify: pnpm --filter api test (187) and pnpm test:e2e (204) green; api lint clean; nest build ok

## [2026-09-21T15:51:17Z] | claude | BUG-07a | IN_PROGRESS

- Summary: Task changes and their document write run as one transaction, with a clean 422 when the document cannot be written
- Verify: pending

## [2026-09-21T15:55:14Z] | claude | BUG-07a | DONE

- Summary: A task change and the write of its document are now one transaction. WriteBackService.inTransaction takes the project's advisory lock first and runs the change and the write-back together, and the record methods accept the caller's transaction; create, update, assign, transition, addDependency and remove use it (BUG-04's guarded updates stay inside, so a lost race writes nothing to the document either). A document that cannot be read or written (ENOENT, EACCES, EPERM, ENOTDIR, EISDIR, or the target entry being unreadable) answers 422 Not saved with no server path and persists nothing, so a retry after fixing the folder creates exactly one task instead of a duplicate sync cannot repair. Autonomous decisions in docs/synchronization.md: the lock is taken before the change touches a row, because holding it while waiting for a row the change already held would deadlock; an outbox was rejected for now as heavier than the problem (the remaining failure, document written and commit failed, only leaves a row sync imports); conflict resolution's write-back stays outside its transaction so a document that cannot be written cannot undo a decision. Left open: BUG-07b (Idempotency-Key on creation) and BUG-07c (revision retention). Note: the e2e database degrades after a few full runs (GET /projects returns 500 once it holds too many projects); reset it with prisma migrate reset on pmhybrid_test. That is TEST-01's growth item.
- Files: apps/api/src/modules/synchronization/write-back.service.ts,apps/api/src/modules/synchronization/sync-failure.util.ts,apps/api/src/modules/tasks/tasks.service.ts,apps/api/test/write-back-atomic.e2e-spec.ts,docs/synchronization.md
- Verify: pnpm --filter api test (187) and pnpm test:e2e (207, on a reset test DB) green; api lint clean; nest build ok

## [2026-09-21T16:06:25Z] | claude | UX-01 | IN_PROGRESS

- Summary: Surface errors and sync status in the UI: action errors, missing task, last sync in the header, grouped and dismissible notifications with mark all read, locked-assignee mark
- Verify: pending

## [2026-09-21T16:08:43Z] | claude | UX-01 | DONE

- Summary: Errors and sync status are now visible. The task detail shows why a move, assignment or dependency did not happen (403, 409, 422) and reloads so it shows what is really there, says a missing task does not exist with a link back to the board, and reports any other load failure. The project header loads the last sync run when it opens and shows it in Spanish (correcta, con avisos, fallida, en curso) with its time, plus the failure reason without anyone pressing anything, and a load failure of the project itself; My Projects shows the same words and marks runs that need attention. The notification panel groups identical notifications with a count, marks a group or everything read (new PATCH /notifications/read-all, scoped to the caller), closes on Escape, an outside click and navigation, says when it could not load, and at phone width is placed against the viewport so it no longer overflows at 390 px. The assignee of a task in development shows Asignacion fija on the Kanban card and in the detail. Server paths and duplicate failures were already fixed at the source by BUG-05. Autonomous decisions: grouping is by project and message on the client rather than a new API shape; the lock mark reads Asignacion fija because Bloqueada already means blocked by a dependency on the card; server error text stays as the API words it until UX-03 localizes it. Left open: UX-02 (mobile layout, Kanban size, Settings) and UX-03 (es-ES localization, progress view).
- Files: apps/web/src/app/features/task-detail/task-detail.ts,apps/web/src/app/features/project-dashboard/project-dashboard.ts,apps/web/src/app/features/my-projects/my-projects.ts,apps/web/src/app/layout/app-shell/app-shell.ts,apps/web/src/app/core/sync-status.ts,apps/web/src/app/core/notifications.service.ts,apps/api/src/modules/notifications/notifications.controller.ts,apps/api/test/notifications.e2e-spec.ts,docs/api-reference.md
- Verify: ng test (192), api test (187) and test:e2e (209) green; web and api lint clean; web and api build ok; axe a11y suite (6) green

## [2026-09-21T16:10:45Z] | claude | BUG-08 | IN_PROGRESS

- Summary: Removing a project member revokes their project roles and unassigns their open tasks, audited
- Verify: pending

## [2026-09-21T16:13:53Z] | claude | BUG-08 | DONE

- Summary: Removing a project member now takes what they hold in the project with them, in the same transaction. Their project-scoped roles are revoked, each audited as ROLE_REVOKE, so re-adding them no longer brings every role back (global roles are the actor's own and stay). Their open tasks (assigned to them, not TERMINADA, not removed) are unassigned with one UNASSIGN audit event each and the assignment history closed: an ASIGNADA task returns to PENDIENTE because ASIGNADA means has an assignee, one already in development keeps its status and waits for someone to pick it up, and finished work stays credited to who did it. A removed project lead stops being the lead, audited. Autonomous decision, recorded in docs/permissions.md and in the entry: unassign rather than refuse the removal, because refusing would make off-boarding impossible while a locked EN_DESARROLLO task is open; the Roadmap document keeps naming the person, and sync cannot resolve that name to a member any more so it leaves the assignee empty rather than assigning it back. Left open: nothing writes the unassignment back to the document.
- Files: apps/api/src/modules/project-members/project-members.service.ts,apps/api/test/member-removal.e2e-spec.ts,docs/permissions.md
- Verify: pnpm --filter api test (187) and pnpm test:e2e (213) green; api lint clean; nest build ok

## [2026-09-21T16:15:06Z] | claude | IMPROVEMENT-01a | IN_PROGRESS

- Summary: In-memory dependency graph for the cycle check in sync and in TasksService, plus the missing indexes
- Verify: pending

## [2026-09-21T16:19:33Z] | claude | IMPROVEMENT-01a | DONE

- Summary: A large real project can sync. The cycle check, which ran one query per hop (a chain of 150 dependencies took 15.5 s and 500 outlasted the 20 s transaction), is now a pure function over an in-memory graph: sync loads the project's dependency edges once, checks every link against the graph and keeps it current as it links, upgrades a dangling reference or removes a dropped dependency, and TasksService reads the edges once for a UI-added dependency. A 500-entry chain now syncs in a few seconds with all 499 edges linked (an e2e proves it) and a real cycle is still refused. Seven missing indexes exist (migration 20260921190000, verified against the schema with prisma migrate diff, no drift): Task(parentTaskId), Task(assigneeActorId), TaskDependency(taskId), TaskDependency(dependsOnTaskId), SyncRun(projectId, startedAt), Conflict(projectId, resolvedAt) and Notification(actorId, createdAt). Autonomous decisions: the graph is per run rather than cached across runs, which keeps it correct without invalidation; the two per-hop implementations were replaced by one shared module. Left open: IMPROVEMENT-01b (DTO limits), 01c (batch rollup, GET /projects at scale) and 01d (pagination, activity payload, dependency removal endpoint).
- Files: apps/api/src/modules/tasks/dependency-graph.ts,apps/api/src/modules/synchronization/synchronization.service.ts,apps/api/src/modules/tasks/tasks.service.ts,apps/api/prisma/schema.prisma,apps/api/prisma/migrations/20260921190000_add_query_indexes/migration.sql,apps/api/test/sync-scale.e2e-spec.ts,docs/synchronization.md
- Verify: pnpm --filter api test (192) and pnpm test:e2e (214) green; api lint clean; nest build ok; prisma migrate diff shows no drift

## [2026-09-21T16:33:28Z] | claude | IMPROVEMENT-01c | IN_PROGRESS

- Summary: Batch progress rollup and the multi-project summary so the query count does not grow with projects or tasks
- Verify: pending

## [2026-09-21T16:36:40Z] | claude | IMPROVEMENT-01c | DONE

- Summary: Progress and the multi-project summary no longer scale with the number of nodes or projects. A pure ProgressCalculator computes the EQUAL_WEIGHT_AVERAGE rollup (leaf percent or status fallback, parent as the average of its subtasks, epic, phase and project as the average of what sits under them, null for an empty container, a removed task never counting) from one project's rows read up front; ProgressRollupService loads the live tasks, epics and phases for a whole batch of projects in three reads, at most 5000 ids per query under Postgres' bind-parameter limit, and answers computeProjectsProgress, computeTasksProgress and the existing single-task and tree methods from it. The project list, the task list, the workload view and the dashboard call the batch forms, and the My Projects summary is now seven queries whatever the number of projects, using groupBy and distinct instead of six queries per project all launched at once, which is what exhausted the connection pool and returned 500 on the e2e database once it held a few thousand projects. Semantics are unchanged and covered by the existing progress e2e plus new unit specs (calculator, chunking, constant query count for 3 and 3000 projects). Autonomous decisions: the unused per-epic and per-phase service methods were removed instead of kept as dead code; the tree view is built from a single read too. Left open: IMPROVEMENT-01b (DTO limits) and 01d (pagination, activity payload, dependency removal endpoint).
- Files: apps/api/src/modules/tasks/progress-calc.ts,apps/api/src/modules/tasks/progress-rollup.service.ts,apps/api/src/modules/projects/projects.service.ts,apps/api/src/modules/dashboard/dashboard.service.ts,apps/api/src/modules/workload/workload.service.ts,apps/api/src/modules/tasks/tasks.service.ts,docs/domain-model.md
- Verify: pnpm --filter api test (203) and pnpm test:e2e (214) green; api lint clean; nest build ok

## [2026-09-21T16:38:34Z] | claude | IMPROVEMENT-01b | IN_PROGRESS

- Summary: Length limits on every request DTO and a validated task-list query
- Verify: pending

## [2026-09-21T16:45:33Z] | claude | IMPROVEMENT-01b | DONE

- Summary: Every request DTO now bounds its free text and identifiers, and the task list validates its query. One table of limits in common/dto-limits.ts (names 200, task titles 300, descriptions 10000, acceptance criteria and comments 5000, paths 1024, URLs 2048, ids 100, labels 200, emails 254, passwords 128, tokens 2048, 500 permission keys) is applied with MaxLength to 53 fields across 21 DTOs, so a 90000-character title is a 400 naming the field and can no longer reach Roadmap.md, and an over-long login password is refused before bcrypt. The task list read status straight off the query string, so ?status=BOGUS reached Prisma as an invalid enum and answered 500; a ListTasksQueryDto now validates it (enum plus bounded ids) and answers 400. A unit spec walks the whole table of fields (each refuses limit+1 with a message naming the field and accepts exactly the limit) and an e2e covers the 90000-character title, the status filter and the password. Autonomous decisions: limits are generous guards sized for real use rather than style rules; ids get 100 characters rather than 36 to leave room for Roadmap ids and other formats; the existing 100 KB body limit already stops the extreme cases with 413. Left open: IMPROVEMENT-01d (pagination, activity payload, dependency removal endpoint).
- Files: apps/api/src/common/dto-limits.ts,apps/api/src/modules/tasks/dto/list-tasks-query.dto.ts,apps/api/src/modules/tasks/tasks.controller.ts,apps/api/src/common/dto-limits.spec.ts,apps/api/test/dto-limits.e2e-spec.ts,docs/api-reference.md
- Verify: pnpm --filter api test (312) and pnpm test:e2e (218) green; api lint clean; nest build ok

## [2026-09-21T16:47:26Z] | claude | TEST-01a | IN_PROGRESS

- Summary: Reset the local e2e database at the start of every run, guarded to the dedicated test database
- Verify: pending

## [2026-09-21T16:52:47Z] | claude | TEST-01a | DONE

- Summary: A local pnpm test:e2e now starts from a clean database. A vitest globalSetup (test/global-setup.ts) runs prisma migrate reset and the seed against the dedicated pmhybrid_test database before the suite, so it no longer grows by thousands of rows across runs: measured 1329 projects before the first run and 153 after it, and 153 again after a second run, at about ten seconds of cost per run. Guards: the reset only ever targets a database whose name is exactly pmhybrid_test (checked by isDedicatedTestDatabase, with a unit spec over lookalikes and unparseable values), does nothing when CI is set because CI's Postgres is a fresh container, and can be skipped with E2E_KEEP_DB=1 to inspect what a run left. The database URL now lives in one constant shared by the e2e config and the setup. Autonomous decisions: reset the whole database rather than delete throwaway rows one by one, because the schema has no cascades and a reset is deterministic; keep the manual test:e2e:db:setup for first-time setup and after a new migration. Left open: TEST-01b (coverage floor), 01c (web core specs) and 01d (a11y on every route, plan for the large services).
- Files: apps/api/test/global-setup.ts,apps/api/test/test-database.ts,apps/api/test/test-database.spec.ts,apps/api/vitest.config.e2e.ts,docs/testing.md
- Verify: pnpm --filter api test (314) and pnpm test:e2e (218, twice in a row with the project count staying at 153) green; api lint clean; nest build ok

## [2026-09-21T16:53:29Z] | claude | BUG-06c | IN_PROGRESS

- Summary: Report dependencies skipped for closing a cycle in the run summary and the project header
- Verify: pending

## [2026-09-21T16:59:35Z] | claude | BUG-06c | DONE

- Summary: A dependency cycle in the document is reported instead of dropped silently. Both places sync can skip a dependency that would close a cycle (a link refused when first read, and a dangling reference whose target appeared later) now record it in summary.skippedCycles as the row that declares it and the reference it names, once per run and bounded like the entry errors, and the run is PARTIAL while any exists; fixing the document clears the list on the next run, and an unfixed one is reported again every run. The project header lists them in Spanish. Autonomous decisions in docs/synchronization.md: no notification, because a loop is a standing fact of the document like an unchanged unreadable entry; the skipped edge is still never linked. This closes BUG-06 (a, b and c). Left open: nothing in this entry.
- Files: apps/api/src/modules/synchronization/synchronization.service.ts,apps/api/test/roadmap-dependencies.e2e-spec.ts,apps/web/src/app/features/project-dashboard/project-dashboard.ts,apps/web/src/app/core/synchronization.service.ts,docs/synchronization.md
- Verify: pnpm --filter api test (314) and pnpm test:e2e (218) green; ng test (193) green; api and web lint clean; api and web build ok

## [2026-09-21T16:59:56Z] | claude | BUG-06 | IN_PROGRESS

- Summary: Close the umbrella: BUG-06a, b and c are done
- Verify: pending

## [2026-09-21T16:59:57Z] | claude | BUG-06 | DONE

- Summary: Umbrella closed: conflicts stay honest (BUG-06a: one open conflict per task and field, closing themselves, an empty Roadmap refused), resolving writes the chosen value back to the document (BUG-06b), and a dependency loop is reported (BUG-06c). See those entries' summaries in the Agentslog for the decisions.
- Files: docs/synchronization.md
- Verify: all three slices green: api unit and e2e, web tests, lint and builds

## [2026-09-21T17:01:55Z] | claude | SECURITY-04a | IN_PROGRESS

- Summary: Constant-time uniform login, production guards for the seed and JWT secret, and a password change endpoint
- Verify: pending

## [2026-09-21T17:07:51Z] | claude | SECURITY-04a | DONE

- Summary: Login, secrets, seed and password change hardened. Login verifies one argon2 hash on every attempt, a fixed dummy one when there is no real hash (unknown email, non-human actor, no password), and answers the same 401 Invalid credentials for unknown, wrong password and inactive, with the password checked before the account's state, so neither the message nor the response time says which accounts exist or are switched off. A production start refuses a JWT_SECRET under 32 characters or a known placeholder while other environments only get a warning, so laptops, CI and the e2e suite are unaffected; .env.example says how to generate one. The seed refuses NODE_ENV=production unless SEED_ALLOW_DEMO_DATA=true, through a pure guard with a unit spec. POST /auth/change-password lets a signed-in person change their own password by proving the current one (8 to 128 characters, different), answers 204 or a 400 for a wrong current password (a 401 would sign the person out in the web client), touches only the caller's own credential and audits PASSWORD_CHANGE without either password. Autonomous decisions in docs/permissions.md: one message for every login failure at the cost of the inactive-account hint; the weak-secret rule fails only production; existing refresh tokens stay valid after a password change because tokens are stateless. Left open: SECURITY-04b (API keys, CORS, helmet, throttling, WebSocket limits) and a web form for the password change.
- Files: apps/api/src/modules/auth/auth.service.ts,apps/api/src/modules/auth/auth.controller.ts,apps/api/src/modules/auth/dto/change-password.dto.ts,apps/api/src/config/secret-strength.ts,apps/api/src/config/env.validation.ts,apps/api/src/main.ts,apps/api/prisma/seed-guard.ts,apps/api/prisma/seed.ts,apps/api/test/auth-hardening.e2e-spec.ts,.env.example,docs/permissions.md
- Verify: pnpm --filter api test (326) and pnpm test:e2e (223) green; api lint clean; nest build ok

## [2026-09-21T17:16:24Z] | claude | GAP-37a | IN_PROGRESS

- Summary: Read the latest skill's Roadmap tables: PAUSE, Pause reason, Gaps Description
- Verify: pending

## [2026-09-21T17:23:20Z] | claude | GAP-37a | DONE

- Summary: Sync now reads the latest skill's Roadmap tables: PAUSE is a valid state, a blocking Pause reason reads as blocked, the Gaps Description is the title, Plan and Gaps rows read like Active work
- Files: apps/api/src/modules/roadmap/roadmap-parser.service.ts,apps/api/src/modules/synchronization/synchronization.service.ts,apps/api/test/roadmap-skill-format.e2e-spec.ts,docs/roadmap-parser.md
- Verify: pnpm --filter api test (336) and test:e2e (225) pass; oxlint clean

## [2026-09-21T17:32:22Z] | claude | GAP-37b | IN_PROGRESS

- Summary: Write the skill's tables and ledger the way its check validates them
- Verify: pending

## [2026-09-21T17:50:22Z] | claude | GAP-37b | DONE

- Summary: Write-back into a latest-skill project: rows edited wherever they are, Status as TODO/IN_PROGRESS/DONE with PAUSE kept, ledger limited to states the skill accepts with a real Verify; the skill's own check passes after every PM Hub write
- Files: apps/api/src/modules/roadmap/roadmap-row-writer.util.ts,apps/api/src/modules/roadmap/skill-ledger.util.ts,apps/api/src/modules/roadmap/status-vocabulary.util.ts,apps/api/src/modules/synchronization/write-back.service.ts,docs/synchronization.md
- Verify: api unit 351 and e2e 227 pass; upstream project_docs.sh check OK after init, claim and every PM Hub write (a CREATED entry fails it)

## [2026-09-21T17:52:02Z] | claude | GAP-37c | IN_PROGRESS

- Summary: Read the rules document from the repository root AGENTS.md when docs/Agents.md is absent
- Verify: pending

## [2026-09-21T17:57:06Z] | claude | GAP-37c | DONE

- Summary: The rules document is read from docs/Agents.md, else from the repository-root AGENTS.md the latest skill uses, through a provider method with no path input
- Files: apps/api/src/modules/git-providers/project-repository-provider.interface.ts,apps/api/src/modules/git-providers/local-fs-git-provider.service.ts,apps/api/src/modules/git-providers/github-git-provider.service.ts,apps/api/src/modules/git-providers/read-rules-document.ts,docs/synchronization.md
- Verify: api unit 360 and e2e 230 pass; oxlint clean

## [2026-09-21T17:57:07Z] | claude | GAP-37 | IN_PROGRESS

- Summary: Close the umbrella: GAP-37a, b and c are done
- Verify: pending

## [2026-09-21T17:57:09Z] | claude | GAP-37 | DONE

- Summary: PM Hub reads and writes projects documented with the latest project-documentation skill: tables, PAUSE, Pause reason, ledger states and the root AGENTS.md; the skill's own check passes after every PM Hub write
- Files: docs/roadmap-parser.md,docs/synchronization.md,docs/architecture.md
- Verify: GAP-37a, GAP-37b and GAP-37c verified: api unit 360, e2e 230, upstream check OK after each write

## [2026-09-21T18:07:31Z] | claude | BUG-07b | IN_PROGRESS

- Summary: Task creation accepts an Idempotency-Key
- Verify: pending

## [2026-09-21T18:07:32Z] | claude | BUG-07b | DONE

- Summary: POST /projects/:id/tasks accepts an Idempotency-Key: a repeat returns the first task (per project and actor, 24 h, mismatched body is a 422); the web forms send one per form open
- Files: apps/api/prisma/schema.prisma,apps/api/prisma/migrations/20260921200000_add_idempotency_key/migration.sql,apps/api/src/modules/tasks/tasks.service.ts,apps/api/src/modules/tasks/idempotency.util.ts,apps/web/src/app/core/idempotency-key.ts,docs/domain-model.md,docs/api-reference.md
- Verify: api unit 366 and e2e 237 pass (incl. a simultaneous-request race); web unit 196 pass, eslint and ng build clean

## [2026-09-21T18:09:10Z] | claude | BUG-07c | IN_PROGRESS

- Summary: DocumentRevision retention
- Verify: pending

## [2026-09-21T18:18:59Z] | claude | BUG-07c | DONE

- Summary: A daily job keeps the newest DOCUMENT_REVISION_RETENTION revisions of each document (default 200, 0 keeps all) and deletes the rest; nothing points at a revision by foreign key
- Files: apps/api/src/modules/synchronization/revision-retention.service.ts,apps/api/src/config/env.validation.ts,apps/api/prisma/migrations/20260921210000_add_document_revision_index/migration.sql,docs/synchronization.md
- Verify: api unit 369 and e2e 241 pass (incl. a 1200-revision backlog); prisma migrate diff shows no drift

## [2026-09-21T18:19:00Z] | claude | BUG-07 | IN_PROGRESS

- Summary: Close the umbrella: BUG-07a, b and c are done
- Verify: pending

## [2026-09-21T18:19:02Z] | claude | BUG-07 | DONE

- Summary: Write-back is atomic with the change (07a), task creation is idempotent (07b) and document revisions are bounded (07c)
- Files: docs/synchronization.md,docs/domain-model.md,docs/api-reference.md
- Verify: BUG-07a, BUG-07b and BUG-07c verified: api e2e 241 pass

## [2026-09-21T18:20:33Z] | claude | UX-03a | IN_PROGRESS

- Summary: Spanish locale and a label dictionary for every enum
- Verify: pending

## [2026-09-21T18:26:32Z] | claude | UX-03a | DONE

- Summary: The document is lang=es and the app runs in es-ES with one date format per kind of date; a label dictionary and pipe name every API enum (audit operations, origins, entities, conflict kinds, resolutions, revision sources, document kinds, roadmap tables, priorities, ledger states) with a readable fallback
- Files: apps/web/src/index.html,apps/web/src/app/app.config.ts,apps/web/src/app/core/labels.ts,apps/web/src/app/shared/label.pipe.ts,apps/web/DESIGN.md
- Verify: web unit 202 pass, eslint and ng build clean, a11y 6 pass
