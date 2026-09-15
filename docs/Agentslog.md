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
