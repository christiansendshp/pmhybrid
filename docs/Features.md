# Features

## Operational summary

- Verified capabilities: 12
- Latest verification: `2026-09-14` — `pnpm -r lint && pnpm -r build && pnpm -r test` green; 46 api e2e + 19 api unit + 12 web unit; browser-verified across all 12 phases
- Known limitation: refresh tokens are stateless JWTs with no server-side revocation (ADR-005); Roadmap's `Depends on` cell is read/written as text but not reconciled into `TaskDependency` rows

<!-- context:end -->

## Verified capabilities

Use one row per stable capability. Link long specifications or runbooks from
`docs/features/`.

| ID  | Capability                                                         | Verification                                                               | Source or detail                                | Updated    |
| --- | ------------------------------------------------------------------ | -------------------------------------------------------------------------- | ----------------------------------------------- | ---------- |
| F01 | Auth: JWT login + stateless refresh, argon2id hashing              | `apps/api/test/auth.e2e-spec.ts`                                           | brief §3, ADR-004, ADR-005                      | 2026-09-14 |
| F02 | Projects + RBAC (roles, permissions, membership)                   | `apps/api/test/projects.e2e-spec.ts`                                       | brief §2, §4                                    | 2026-09-14 |
| F03 | Hierarchy: Phase/Epic/Task/Subtask + dependencies                  | `apps/api/test/tasks.e2e-spec.ts`                                          | brief §5-9, `docs/domain-model.md`              | 2026-09-14 |
| F04 | Kanban status transitions + locked-reassignment guard              | `apps/api/test/tasks.e2e-spec.ts`                                          | brief §8-9, `task-status-policy.ts`             | 2026-09-14 |
| F05 | Progress rollup (`EQUAL_WEIGHT_AVERAGE`, recursive)                | `apps/api/test/tasks.e2e-spec.ts`                                          | brief §17                                       | 2026-09-14 |
| F06 | Roadmap.md / Agentslog.md parsing                                  | `apps/api/test/documents.e2e-spec.ts`                                      | brief §10-11, `docs/roadmap-parser.md`          | 2026-09-14 |
| F07 | Synchronization: reconciliation, disappeared-row hazard, conflicts | `apps/api/test/synchronization.e2e-spec.ts`                                | brief §12-13, §25-26, `docs/synchronization.md` | 2026-09-14 |
| F08 | Write-back: Postgres → Documents on curated task events            | `apps/api/test/synchronization.e2e-spec.ts`, `brief-scenarios.e2e-spec.ts` | `docs/synchronization.md`                       | 2026-09-14 |
| F09 | Kanban UI: drag-and-drop, legal-transition-only drops              | web unit tests + browser verification                                      | brief §8, §29                                   | 2026-09-14 |
| F10 | Dashboard: cross-project summary + 5 activity feeds                | `apps/api/test/dashboard.e2e-spec.ts`                                      | brief §14                                       | 2026-09-14 |
| F11 | Workload: cross-project per-actor task view                        | `apps/api/test/workload.e2e-spec.ts`                                       | brief §18-19                                    | 2026-09-14 |
| F12 | Full brief §33 14-scenario E2E coverage, sequential                | `apps/api/test/brief-scenarios.e2e-spec.ts`                                | brief §33                                       | 2026-09-14 |
