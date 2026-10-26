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

- Archive: `docs/history/Agentslog-20261026-036.md`
- SHA-256: `5337a7c54f374e82bc9e2d8d9e1f1ff88eef2448fdcf3ed604af6714028118e5`

## Entries

## [2026-10-26T22:04:22Z] | claude-sonnet-5-5 | TASK-52 | IN_PROGRESS | Documented Postgres backup with a restore test
- Summary: carried forward from docs/history/Agentslog-20261026-036.md at rotation

## [2026-10-26T22:31:41Z] | claude-sonnet-5-5 | TASK-52 | DONE | Documented Postgres backup with a restore test
- Summary: deploy/backup/backup-postgres.sh (pg_dump -Fc inside a named container over its socket, no password, read back with pg_restore --list before it is kept, keeps the newest N, a failed run deletes nothing) and restore-check.sh (restores the newest dump into a scratch database, compares the rows of every table with the live one, --strict, drops the scratch database and looks for it again); docs/deployment.md Backups section (what is irreplaceable, schedule, restore, how it was tested)
- Files: deploy/backup/backup-postgres.sh, deploy/backup/restore-check.sh, deploy/backup/test.sh, docs/deployment.md, docs/testing.md, docs/Stack_Tecnologies.md, .github/workflows/ci.yml, package.json
- Verify: check, lint, build, unit green; e2e 746 green (one run under a concurrent run failed on timing, alone it passes in 165 s); pnpm test:backup 47 cases on a throwaway container, two mutations caught; run by hand on pmhybrid_test: 30 tables, 15208 rows equal under --strict, scratch database gone
