# Roadmap

Keep active and near-term work only. Verified completed capability belongs in
`Features.md`; history belongs in `Agentslog.md`.

## Active work

| ID     | Outcome                                                                            | Acceptance check                          | Status      | Owner                            | Depends on |
| ------ | ---------------------------------------------------------------------------------- | ----------------------------------------- | ----------- | -------------------------------- | ---------- |
| GAP-09 | Documents view search, highlight, section navigation, revision history (brief §10) | e2e for revisions endpoint; browser check | IN_PROGRESS | claude-code@2026-09-15T14:47:00Z | GAP-03     |

<!-- context:end -->

Post-MVP gap backlog derived from a brief-vs-code review on 2026-09-15 (the
12-phase plan is complete; these close the gaps it left). Ordered frontend
first, per the user's direction on 2026-09-15.

## Near term

| ID     | Outcome                                                                                                          | Acceptance check                                                          | Status | Depends on |
| ------ | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------ | ---------- |
| GAP-08 | Phase progress counts by state + subtasks in the tree (brief §16)                                                | e2e on progress tree counts                                               | TODO   | —          |
| GAP-12 | Roles UI: assign/revoke project roles; configurable role permissions (brief §4)                                  | e2e for role-permission edits; browser check                              | TODO   | GAP-02     |
| GAP-16 | Frontend component tests for main views (brief §33)                                                              | `pnpm --filter web test` covers kanban/task-detail/workload/conflicts     | TODO   | GAP-06     |
| GAP-13 | Internal notifications (brief §29): generated on events, list/mark-read API, UI indicator; failed sync persisted | e2e per notification event                                                | TODO   | GAP-01     |
| GAP-14 | Roadmap `Depends on` reconciled into TaskDependency rows                                                         | sync e2e with a dependency cell                                           | TODO   | —          |
| GAP-15 | Controlled API access for AI agents via hashed API keys (brief §27, §28)                                         | e2e: key auth works, revoked key rejected, key never stored in plain text | TODO   | GAP-02     |
| GAP-19 | Lifecycle write-back (created/status/locked reassign) keeps a Near term or Blocked row in its own table          | sync e2e: EN_DESARROLLO on a Near term task leaves exactly one row        | TODO   | GAP-04     |
| GAP-17 | CI pipeline running lint, build, unit and e2e tests                                                              | workflow file validated locally; green on push                            | TODO   | —          |
| GAP-18 | Documentation gaps (brief §35): permissions, API, testing docs; stale Stack/Agents facts                         | project-documentation `check` green; links resolve                        | TODO   | —          |

## Blocked

| ID  | Blocker | Needed decision or event | Owner |
| --- | ------- | ------------------------ | ----- |
| —   | —       | —                        | —     |
