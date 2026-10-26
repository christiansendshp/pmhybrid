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

- Archive: `docs/history/Agentslog-20261026-024.md`
- SHA-256: `2b7c4e56363642aa0bda4a9bfa269255afcfc6d6f1a00310171127c80697d82e`

## Entries

## [2026-10-26T19:29:49Z] | claude-sonnet-5-5 | TASK-41 | IN_PROGRESS | Notification when every task of a phase is done
- Summary: carried forward from docs/history/Agentslog-20261026-024.md at rotation

## [2026-10-26T19:39:29Z] | claude-sonnet-5-5 | TASK-41 | DONE | Notification when every task of a phase is done
- Summary: PHASE_COMPLETED goes once to every active member when the last open work task of a phase is done, by a sync or by any write in the app (WriteBackService.inTransaction emits project.tasks-written after the commit); Phase.completionNotifiedAt keeps it from repeating, is cleared when the phase has an open task again, and the migration marks the phases already complete so deploying does not announce them
- Files: apps/api/prisma/schema.prisma, apps/api/prisma/migrations/20261026170000_add_phase_completion_notified, apps/api/src/common/events.ts, apps/api/src/modules/notifications/phase-completion.{util,service}.ts, apps/api/src/modules/notifications/notifications.{module,service}.ts, apps/api/src/modules/synchronization/write-back.service.ts, apps/api/test/phase-completion.e2e-spec.ts, apps/web/src/app/core/notification-format.ts, docs/what-changed.md, docs/domain-model.md
- Verify: check, lint, build, unit and e2e green (phase-completion 10 e2e incl. the app write path, a sync and two checks at once; util unit; web sentence); migration applied to the dev DB
