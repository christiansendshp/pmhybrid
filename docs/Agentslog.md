# Agents log

Append-only ledger and the source of truth for task ownership. Older
segments live in `docs/history/`.

## Entry format

```markdown
## [YYYY-MM-DDTHH:mm:ssZ] | agent | TASK-ID | IN_PROGRESS | Name
- Summary: what the agent will do or did
- Files: paths or component names (optional)
- Verify: command and result, or "pending" (required for DONE and REVIEW)
- Pause: CATEGORY - detail (required for PAUSE)
- Handoff: reviewer agent or role (optional, REVIEW)
- Review: PASS|FAIL - detail (optional, REVIEW)
- Assign: agent (required for ASSIGNED)
```

## Previous segment

- Archive: `docs/history/Agentslog-20261026-031.md`
- SHA-256: `b57275dcbee8a29b9f875e6d1f7877d31ff29f2f8291a85afcd1baaeab63a65e`

## Entries

## [2026-10-26T20:49:50Z] | claude-sonnet-5-5 | TASK-46 | IN_PROGRESS | Daily project snapshot: table, job and history endpoint
- Summary: 
- Verify: pending

## [2026-10-26T21:00:45Z] | claude-sonnet-5-5 | TASK-46 | DONE | Daily project snapshot: table, job and history endpoint
- Summary: ProjectSnapshot (one row a project and UTC day: total, done, count by status, blocked, open conflicts, progress; source RECORDED or RECONSTRUCTED) written by a job at 00:10 UTC for the active projects, never twice a day, and GET /projects/:id/snapshots?days= (1 to 365, default 30, member-only) oldest first
- Files: apps/api/prisma/schema.prisma, apps/api/prisma/migrations/20261026200000_add_project_snapshot, apps/api/src/modules/snapshots/*, apps/api/src/app.module.ts, apps/api/test/snapshots.e2e-spec.ts, docs/status-report.md, docs/domain-model.md, docs/api-reference.md
- Verify: check, lint, build, unit and e2e green (snapshots 14 e2e: counts, exclusions, twice and concurrent, paused, history order and window, 400s, member-only; tally unit); migration applied to the dev DB; VALIDAR took 313 s, registered as GAP-44
