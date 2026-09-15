# Roadmap

Keep active and near-term work only. Verified completed capability belongs in
`Features.md`; history belongs in `Agentslog.md`.

## Active work

| ID     | Outcome                                                                        | Acceptance check                                                      | Status      | Owner                            | Depends on |
| ------ | ------------------------------------------------------------------------------ | --------------------------------------------------------------------- | ----------- | -------------------------------- | ---------- |
| GAP-05 | Task removal (brief §25, §31 CRUD) without tripping the disappeared-row hazard | e2e: removed task leaves Roadmap/Agentslog consistent and no conflict | IN_PROGRESS | claude-code@2026-09-15T14:10:00Z | GAP-04     |

<!-- context:end -->

Post-MVP gap backlog derived from a brief-vs-code review on 2026-09-15 (the
12-phase plan is complete; these close the gaps it left).

## Near term

| ID     | Outcome                                                                                                          | Acceptance check                                                          | Status | Depends on |
| ------ | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------ | ---------- |
| GAP-06 | Kanban cards with all §15 fields + search, grouping, sorting                                                     | web unit tests for grouping/sorting; browser check                        | TODO   | GAP-03     |
| GAP-07 | My Projects summary (brief §19) + project settings edit                                                          | e2e for summary endpoint; browser check                                   | TODO   | GAP-03     |
| GAP-08 | Phase progress counts by state + subtasks in the tree (brief §16)                                                | e2e on progress tree counts                                               | TODO   | —          |
| GAP-09 | Documents view search, highlight, section navigation, revision history (brief §10)                               | e2e for revisions endpoint; browser check                                 | TODO   | GAP-03     |
| GAP-10 | Conflict field diff + MANUAL_EDIT resolution in UI (brief §26)                                                   | web unit test for diff; browser check                                     | TODO   | GAP-03     |
| GAP-11 | Workload phase/epic filters in UI + idle active actors listed (brief §18)                                        | e2e + browser check                                                       | TODO   | GAP-03     |
| GAP-12 | Roles UI: assign/revoke project roles; configurable role permissions (brief §4)                                  | e2e for role-permission edits; browser check                              | TODO   | GAP-02     |
| GAP-13 | Internal notifications (brief §29): generated on events, list/mark-read API, UI indicator; failed sync persisted | e2e per notification event                                                | TODO   | GAP-01     |
| GAP-14 | Roadmap `Depends on` reconciled into TaskDependency rows                                                         | sync e2e with a dependency cell                                           | TODO   | —          |
| GAP-15 | Controlled API access for AI agents via hashed API keys (brief §27, §28)                                         | e2e: key auth works, revoked key rejected, key never stored in plain text | TODO   | GAP-02     |
| GAP-16 | Frontend component tests for main views (brief §33)                                                              | `pnpm --filter web test` covers kanban/task-detail/workload/conflicts     | TODO   | GAP-06     |
| GAP-17 | CI pipeline running lint, build, unit and e2e tests                                                              | workflow file validated locally; green on push                            | TODO   | —          |
| GAP-18 | Documentation gaps (brief §35): permissions, API, testing docs; stale Stack/Agents facts                         | project-documentation `check` green; links resolve                        | TODO   | —          |
| GAP-19 | Lifecycle write-back (created/status/locked reassign) keeps a Near term or Blocked row in its own table          | sync e2e: EN_DESARROLLO on a Near term task leaves exactly one row        | TODO   | GAP-04     |

## Blocked

| ID  | Blocker | Needed decision or event | Owner |
| --- | ------- | ------------------------ | ----- |
| —   | —       | —                        | —     |
