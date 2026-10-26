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

- Archive: `docs/history/Agentslog-20261026-023.md`
- SHA-256: `34e756048dec675e6008de6d37143e79f5a70f9239281be030e6eb6e0c82a420`

## Entries

## [2026-10-26T19:17:48Z] | claude-sonnet-5-5 | TASK-40 | IN_PROGRESS | Notifications for blocked and unblocked tasks
- Summary: carried forward from docs/history/Agentslog-20261026-023.md at rotation

## [2026-10-26T19:28:52Z] | claude-sonnet-5-5 | TASK-40 | DONE | Notifications for blocked and unblocked tasks
- Summary: TASK_BLOCKED and TASK_UNBLOCKED go to a task's assignee after a sync whose audit events show it entered the Blocked table (with why and what is needed) or left it for another table; one hook on sync.completed using the net move per task; a vanished row, a completion, an unassigned task and the person who ran the sync tell nobody; blockedMove is now the one rule for the notifications and for the Panel's unblocked (a vanished row no longer counts there)
- Files: apps/api/src/modules/tasks/blocked-since.util.ts, apps/api/src/modules/notifications/notifications.service.ts, apps/api/src/modules/dashboard/since-visit.{util,service}.ts, apps/api/test/blocked-notifications.e2e-spec.ts, apps/web/src/app/core/notification-format.ts, docs/what-changed.md, docs/domain-model.md
- Verify: check, lint, build, unit and e2e green (blocked-notifications 7 e2e, blockedMove and netBlockedMoves unit, web sentences); TASK-38's unblockedIds tests were rewritten on purpose for the stricter shared rule
