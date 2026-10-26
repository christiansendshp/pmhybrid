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

- Archive: `docs/history/Agentslog-20261026-015.md`
- SHA-256: `8ddb18e698dec2671f8812de0aca130932e0836265066d8639719c4c25d8d968`

## Entries

## [2026-10-26T17:32:33Z] | claude-sonnet-5-5 | TASK-32 | IN_PROGRESS | One list of what is waiting, oldest first
- Summary: carried forward from docs/history/Agentslog-20261026-015.md at rotation

## [2026-10-26T17:41:21Z] | claude-sonnet-5-5 | TASK-32 | DONE | One list of what is waiting, oldest first
- Summary: GET /projects/:id/waiting gives one list, the longest waiting first, of the blocked tasks (reason, needed decision, whom the ledger says, tasks behind, since when), the decisions the ledger says wait on someone and the open conflicts, with the blocked count per phase and epic; ledgerUnreadable when the ledger cannot be read; any member
- Files: apps/api/src/modules/waiting, apps/api/test/waiting.e2e-spec.ts, docs/board-views.md, docs/api-reference.md
- Verify: VALIDAR green in 233 s: api unit 829, web 572, e2e 569
