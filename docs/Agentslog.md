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

- Archive: `docs/history/Agentslog-20261026-017.md`
- SHA-256: `ea1177cd15c74a605f764aecc6b45385df9afa4609d1410515f5e5af079721fa`

## Entries

## [2026-10-26T18:03:28Z] | claude-sonnet-5-5 | TASK-34 | IN_PROGRESS | Import closed ledger work as done tasks, on request
- Summary: carried forward from docs/history/Agentslog-20261026-017.md at rotation

## [2026-10-26T18:13:22Z] | claude-sonnet-5-5 | TASK-34 | DONE | Import closed ledger work as done tasks, on request
- Summary: POST /projects/:id/documents/agentslog/untracked/import (task.write) turns the listed IDs whose latest entry is the exact DONE into done tasks (sourceOrigin AGENTSLOG, titled by the closing entry, dated by the ledger, no Roadmap row, entries linked, audited), skipping open work and unlisted IDs, once; the Documents page asks first with the count it adds
- Files: apps/api/src/modules/untracked-work, apps/api/prisma/migrations/20261026150000_add_task_source_origin_agentslog, apps/api/test/untracked-import.e2e-spec.ts, apps/web/src/app/features/documents-viewer, docs/roadmap-parser.md
- Verify: VALIDAR green in 229 s: api unit 842, web 604, e2e 589
