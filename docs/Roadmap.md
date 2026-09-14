# Roadmap

Keep active and near-term work only. Verified completed capability belongs in
`Features.md`; history belongs in `Agentslog.md`.

## Active work

| ID      | Outcome               | Acceptance check                                            | Status      | Owner       | Depends on |
| ------- | --------------------- | ----------------------------------------------------------- | ----------- | ----------- | ---------- |
| FASE-05 | Projects + Roles/RBAC | E2E scenario 3 passes; My Projects view lists real projects | IN_PROGRESS | claude-code | FASE-04    |

<!-- context:end -->

## Near term

| ID      | Outcome                                                            | Acceptance check                                                   | Status | Depends on |
| ------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ | ------ | ---------- |
| FASE-06 | Roadmap/Agentslog parser (read-only)                               | Structured + documental views render a real managed project's docs | TODO   | FASE-05    |
| FASE-07 | Tasks + hierarchy + dependencies + progress rollup                 | E2E scenarios 4-8 pass                                             | TODO   | FASE-06    |
| FASE-08 | Synchronization (scheduler, reconciliation, write-back, conflicts) | E2E scenarios 9-11 pass                                            | TODO   | FASE-07    |
| FASE-09 | Kanban (drag & drop, filters)                                      | E2E scenario 12 passes                                             | TODO   | FASE-08    |
| FASE-10 | Dashboard + metrics                                                | Dashboard shows required summary/activity per brief §14            | TODO   | FASE-09    |
| FASE-11 | Workload view                                                      | E2E scenario 14 passes                                             | TODO   | FASE-10    |
| FASE-12 | Testing + stabilization + full demo dataset                        | All brief §33 E2E scenarios green; `docs/` complete                | TODO   | FASE-11    |

## Blocked

| ID  | Blocker | Needed decision or event | Owner |
| --- | ------- | ------------------------ | ----- |
| —   | —       | —                        | —     |
