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

- Archive: `docs/history/Agentslog-20261026-033.md`
- SHA-256: `620b39a94f97fade4083bb1646b25b0695fbbaf1abaabf08377b768b00f868da`

## Entries

## [2026-10-26T21:25:09Z] | claude-sonnet-5-5 | TASK-49 | IN_PROGRESS | Informe tab: read, copy, download, print and history
- Summary: 
- Verify: pending

## [2026-10-26T21:36:34Z] | claude-sonnet-5-5 | TASK-49 | DONE | Informe tab: read, copy, download, print and history
- Summary: The Informe tab (/projects/:id/report): the weekly report cut into its sections, shown as the text the API wrote, with Copiar Markdown, Descargar .md (informe-<project>-<day>.md) and Imprimir o guardar como PDF (window.print with a print stylesheet that leaves only the report; no rendering library added), and the history of the last 30 snapshot days as a table where a rebuilt day says Aproximado and shows a dash for what it cannot know; each failure says so without hiding the other part
- Files: apps/web/src/app/core/report.{service,}.ts, apps/web/src/app/features/report/*, apps/web/src/styles.scss, apps/web/src/app/app.routes.ts, apps/web/src/app/features/project-dashboard/project-dashboard.ts, apps/web/a11y/*.a11y.spec.ts, docs/status-report.md
- Verify: check, lint, build, unit and e2e green (web report page and core/report specs 30); looked at in the browser on a scratch API/web (report, history with an approximate day, print class on beforeprint and removed on afterprint); the a11y suites were extended but not run (they need the persistent stack stopped)
