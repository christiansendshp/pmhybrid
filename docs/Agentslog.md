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

- Archive: `docs/history/Agentslog-20261026-029.md`
- SHA-256: `f933f42c096575a0b13ae2836c5fe7fe2fd720dcc2d5c75e71d9fd4aa655fb77`

## Entries

## [2026-10-26T20:17:18Z] | claude-sonnet-5-5 | TASK-45 | IN_PROGRESS | Riesgos page: semaphore, signals and critical path
- Summary: carried forward from docs/history/Agentslog-20261026-029.md at rotation

## [2026-10-26T20:28:51Z] | claude-sonnet-5-5 | TASK-45 | DONE | Riesgos page: semaphore, signals and critical path
- Summary: The Riesgos tab (/projects/:id/risks), reading GET /risks once per visit: a semaphore table for the project, each phase and each epic with the light as a word and a shape and the counts that explain it, the signals grouped by kind (late and stuck first) with the reason and the task as a link, and the critical path in order with each status; the project settings have the stale threshold (hours, 1 to 8760)
- Files: apps/web/src/app/core/risks.{service,}.ts, apps/web/src/app/features/risks/*, apps/web/src/app/features/project-settings/*, apps/web/src/app/core/projects.service.ts, apps/web/src/app/app.routes.ts, apps/web/src/app/features/project-dashboard/project-dashboard.ts, apps/web/a11y/*.a11y.spec.ts, docs/risks.md
- Verify: check, lint, build, unit and e2e green (web risks, core/risks and settings specs 68); looked at in the browser on a scratch API/web (desktop, 375 px without overflow); the a11y suites were extended but not run (they need the persistent stack stopped)
