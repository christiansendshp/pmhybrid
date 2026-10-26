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

- Archive: `docs/history/Agentslog-20261026-025.md`
- SHA-256: `ea31670d23837bb17733e9d5fe12fc8145a5164a3a0221bb41e8caafdcc8c18c`

## Entries

## [2026-10-26T19:40:41Z] | claude-sonnet-5-5 | TASK-42 | IN_PROGRESS | Daily or weekly summary per person, in the app
- Summary: carried forward from docs/history/Agentslog-20261026-025.md at rotation

## [2026-10-26T19:52:25Z] | claude-sonnet-5-5 | TASK-42 | DONE | Daily or weekly summary per person, in the app
- Summary: In-app periodic summary (DEC-004 D3): Actor.summaryFrequency (NONE, DAILY, WEEKLY by default) and summaryLastSentAt; a job at 07:00 UTC makes one PERIOD_SUMMARY per project with news for each person due one (daily: last day; weekly: Mondays, last 7 days), never for an agent, once per day (claimed with a conditional update); GET/PATCH /notifications/preferences are the caller's own and the notifications panel has the selector (BR-018)
- Files: apps/api/prisma/schema.prisma, apps/api/prisma/migrations/20261026180000_add_actor_summary_frequency, apps/api/src/modules/dashboard/period-summary.{util,service}.ts, dashboard.module.ts, since-visit.service.ts, apps/api/src/modules/notifications/{notifications.service,notifications.controller}.ts, dto/update-preferences.dto.ts, apps/api/test/period-summary.e2e-spec.ts, apps/web/src/app/layout/app-shell/notification-preferences.*, app-shell.*, apps/web/src/app/core/notification{s.service,-format}.ts, docs/what-changed.md, docs/domain-model.md, docs/api-reference.md, docs/ProductDescription.md
- Verify: check, lint, build, unit and e2e green (period-summary 19 e2e: due day, window, agent, none, quiet project, twice a day, concurrent runs, preferences own-only; util and web unit); looked at in the browser (selector saves, stored server-side); migration applied to the dev DB
