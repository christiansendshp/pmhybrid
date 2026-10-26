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

- Archive: `docs/history/Agentslog-20261026-027.md`
- SHA-256: `617f07a38b1dc90523a90cf4bfa0484e661e4287a3d1552cd3db83b37ff919fc`

## Entries
