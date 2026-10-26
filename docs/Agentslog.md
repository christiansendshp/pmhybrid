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

- Archive: `docs/history/Agentslog-20261026-032.md`
- SHA-256: `45063d22c17facfd161bb8868f8b885abde96e2ca2834279a8b697a001db43ad`

## Entries

## [2026-10-26T21:02:40Z] | claude-sonnet-5-5 | TASK-47 | IN_PROGRESS | Rebuild past snapshots from the tasks' dates, labelled approximate
- Summary: carried forward from docs/history/Agentslog-20261026-032.md at rotation

## [2026-10-26T21:12:35Z] | claude-sonnet-5-5 | TASK-47 | DONE | Rebuild past snapshots from the tasks' dates, labelled approximate
- Summary: POST /projects/:id/snapshots/reconstruct?days= (needs project.update; 1 to 365, default 30) rebuilds the days before today that have no snapshot, from the tasks' createdAt, completedAt and deletedAt: total and done at the end of each day, RECONSTRUCTED, with the count by status, blocked, conflicts and progress null; it never overwrites a recorded day, writes nothing twice, skips today and the days before the project existed (BR-020)
- Files: apps/api/src/modules/snapshots/{snapshot.util,snapshot.service,snapshot.controller}.ts, apps/api/test/snapshots-reconstruct.e2e-spec.ts, docs/status-report.md, docs/api-reference.md, docs/ProductDescription.md
- Verify: check, lint, build, unit and e2e green (reconstruct 16 e2e: each missing day, labelling, recorded day kept, twice, today, before creation, cards, default, 400s, permission; totalsAtEndOf and daysToReconstruct unit)
