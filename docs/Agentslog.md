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
