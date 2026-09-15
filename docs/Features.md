# Features

## Operational summary

- Verified capabilities: 14
- Latest verification: `2026-09-15` — lint, build, unit, e2e green (55 api e2e, 19 api unit, 23 web)
- Known limitations: no refresh-token revocation (ADR-005); Roadmap `Depends on` not reconciled into `TaskDependency`; PM Hub's own write-back Agentslog entries are ingested only after an external file change

<!-- context:end -->

## Verified capabilities

Use one row per stable capability. Link long specifications or runbooks from
`docs/features/`.

| ID  | Capability                                                                                                                                                    | Verification                                                               | Source or detail                                 | Updated    |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------ | ---------- |
| F01 | Auth: JWT login + stateless refresh, argon2id hashing                                                                                                         | `apps/api/test/auth.e2e-spec.ts`                                           | brief §3, ADR-004, ADR-005                       | 2026-09-14 |
| F02 | Projects + RBAC (roles, permissions, membership)                                                                                                              | `apps/api/test/projects.e2e-spec.ts`                                       | brief §2, §4                                     | 2026-09-14 |
| F03 | Hierarchy: Phase/Epic/Task/Subtask + dependencies                                                                                                             | `apps/api/test/tasks.e2e-spec.ts`                                          | brief §5-9, `docs/domain-model.md`               | 2026-09-14 |
| F04 | Kanban status transitions + locked-reassignment guard                                                                                                         | `apps/api/test/tasks.e2e-spec.ts`                                          | brief §8-9, `task-status-policy.ts`              | 2026-09-14 |
| F05 | Progress rollup (`EQUAL_WEIGHT_AVERAGE`, recursive)                                                                                                           | `apps/api/test/tasks.e2e-spec.ts`                                          | brief §17                                        | 2026-09-14 |
| F06 | Roadmap.md / Agentslog.md parsing                                                                                                                             | `apps/api/test/documents.e2e-spec.ts`                                      | brief §10-11, `docs/roadmap-parser.md`           | 2026-09-14 |
| F07 | Synchronization: reconciliation, disappeared-row hazard, conflicts                                                                                            | `apps/api/test/synchronization.e2e-spec.ts`                                | brief §12-13, §25-26, `docs/synchronization.md`  | 2026-09-14 |
| F08 | Write-back: Postgres → Documents on curated task events                                                                                                       | `apps/api/test/synchronization.e2e-spec.ts`, `brief-scenarios.e2e-spec.ts` | `docs/synchronization.md`                        | 2026-09-14 |
| F09 | Kanban UI: drag-and-drop, legal-transition-only drops                                                                                                         | web unit tests + browser verification                                      | brief §8, §29                                    | 2026-09-14 |
| F10 | Dashboard: cross-project summary + 5 activity feeds                                                                                                           | `apps/api/test/dashboard.e2e-spec.ts`                                      | brief §14                                        | 2026-09-14 |
| F11 | Workload: cross-project per-actor task view                                                                                                                   | `apps/api/test/workload.e2e-spec.ts`                                       | brief §18-19                                     | 2026-09-14 |
| F12 | Full brief §33 14-scenario E2E coverage, sequential                                                                                                           | `apps/api/test/brief-scenarios.e2e-spec.ts`                                | brief §33                                        | 2026-09-14 |
| F13 | Audit trail: in-transaction changed-field audit for projects/tasks/members/roles/hierarchy/sync/conflicts; project audit view + task history & agent activity | `apps/api/test/audit.e2e-spec.ts`, `core/audit-format.spec.ts`             | brief §17, §25, §31, `docs/domain-model.md`      | 2026-09-15 |
| F14 | Sync never overwrites or re-conflicts a UI edit while its Roadmap row is unchanged (row-hash baseline)                                                        | `apps/api/test/synchronization.e2e-spec.ts`                                | brief §12, §26, `docs/synchronization.md` step 5 | 2026-09-15 |
