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

- Archive: `docs/history/Agentslog-20261026-022.md`
- SHA-256: `bc0db70cb7577db19e98b7f8946afc28b753f273cca3ee7d251a5f2aef6cb4bb`

## Entries

## [2026-10-26T19:06:56Z] | claude-sonnet-5-5 | TASK-39 | IN_PROGRESS | Desde tu última visita at the top of the Panel
- Summary: carried forward from docs/history/Agentslog-20261026-022.md at rotation

## [2026-10-26T19:16:51Z] | claude-sonnet-5-5 | TASK-39 | DONE | Desde tu última visita at the top of the Panel
- Summary: The Panel starts with Desde tu última visita: each project with news since the person's marker as a card (counts as sentences in the order a person acts: blocked, conflicts, unblocked, done, new; the first tasks as links; from when it counts) and Marcar como visto per project or for all, updating without reloading; it reads on its own and says when it cannot
- Files: apps/web/src/app/core/since-visit.{service,}.ts, apps/web/src/app/features/dashboard/since-visit.*, dashboard.{ts,html,spec.ts}, apps/web/a11y/app-shell.a11y.spec.ts, docs/what-changed.md
- Verify: check, lint, build, unit and e2e green (since-visit specs 26 incl. Panel); looked at in the browser on a scratch API/web (desktop, mark as seen, 375 px without overflow); the a11y suite was extended but not run (needs the persistent stack stopped)
