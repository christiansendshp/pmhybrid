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

- Archive: `docs/history/Agentslog-20261026-035.md`
- SHA-256: `57c0d95edd5bca9fe3b107bd84851fe0d715cb77b1db98e1c15a994f2f1be38f`

## Entries

## [2026-10-26T21:52:28Z] | claude-sonnet-5-5 | TASK-51 | IN_PROGRESS | Retention for read notifications
- Summary: carried forward from docs/history/Agentslog-20261026-035.md at rotation

## [2026-10-26T22:01:49Z] | claude-sonnet-5-5 | TASK-51 | DONE | Retention for read notifications
- Summary: NOTIFICATION_RETENTION_DAYS (default 90, 0 keeps all, invalid stops the start) and a daily job at 03:40 UTC that deletes the notifications read more than that many days ago, counted from readAt, and never an unread one
- Files: apps/api/src/config/env.validation.ts, apps/api/src/modules/notifications/notification-retention.service.ts, apps/api/src/modules/notifications/notifications.module.ts, apps/api/test/notification-retention.e2e-spec.ts, apps/api/src/config/env.validation.spec.ts, docs/Stack_Tecnologies.md, docs/domain-model.md, .env.example
- Verify: check, lint, build, unit and e2e green (notification-retention 8 e2e: past the limit, within it, unread never, from readAt, the boundary, 0, only the named; env validation unit)
