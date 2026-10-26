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

- Archive: `docs/history/Agentslog-20261026-037.md`
- SHA-256: `938618d5a26c77a0b90f091cb398b7dcef4fb1640c3e9f21000ce3a2931f694b`

## Entries

## [2026-10-26T22:36:12Z] | claude-sonnet-5-5 | EPIC-01 | IN_PROGRESS | Project tracking: from a snapshot to a time axis
- Summary: 
- Verify: pending

## [2026-10-26T22:36:14Z] | claude-sonnet-5-5 | EPIC-01 | DONE | Project tracking: from a snapshot to a time axis
- Summary: Project tracking: pace and forecast, work logged without a task, agents as responsible actors, normalized log status, what is waiting and on whom, what changed since the last visit and a periodic summary, risk signals, a shareable report with a daily history, and operational hygiene of the data that grows
- Files: docs/Roadmap.md, docs/Features.md
- Verify: FEATURE-01 to FEATURE-09 are in Features.md with VALIDAR green; the last, TASK-52, on 369c450
