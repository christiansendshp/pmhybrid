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

- Archive: `docs/history/Agentslog-20261026-018.md`
- SHA-256: `6298df8b4775631da732ac51552dcba345e03ff88d753d9f783ad507490d70cd`

## Entries

## [2026-10-26T18:16:33Z] | claude-sonnet-5-5 | TASK-35 | IN_PROGRESS | Pace and forecast calculator
- Summary: Pace and forecast calculator
- Verify: pending

## [2026-10-26T18:25:41Z] | claude-sonnet-5-5 | TASK-35 | DONE | Pace and forecast calculator
- Summary: Pure pace calculator: UTC Monday weeks, cumulative scope/done, burn-up per phase and a forecast range from the 2- and 4-week paces that declines (NOT_ENOUGH_HISTORY, NOTHING_OPEN, NO_RECENT_COMPLETIONS, NOT_CONVERGING); BR-016, docs/metrics.md
- Files: apps/api/src/modules/metrics/pace.util.ts, apps/api/src/modules/metrics/pace.util.spec.ts, apps/api/test/pace-weeks.e2e-spec.ts, docs/metrics.md, docs/ProductDescription.md
- Verify: check, lint, build, unit (pace.util.spec 22 tests) and e2e (pace-weeks vs date_trunc) green
