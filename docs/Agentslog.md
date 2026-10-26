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

- Archive: `docs/history/Agentslog-20261026-012.md`
- SHA-256: `eee41bd562d2e174f8b83b21c38a4b6da09e8e970e781e31c6079778e19e9681`

## Entries

## [2026-10-26T16:13:27Z] | claude-sonnet-5-5 | TASK-30 | IN_PROGRESS | List the ledger's status words and what they map to
- Summary: carried forward from docs/history/Agentslog-20261026-012.md at rotation

## [2026-10-26T16:25:39Z] | claude-sonnet-5-5 | TASK-30 | DONE | List the ledger's status words and what they map to
- Summary: GET /projects/:id/documents/agentslog/words lists the ledger's distinct status words with the status each is read as, its entries and an example qualifier, unknown words first; the structured Agentslog view says how many words are in use and how many it does not know (path kept under /documents with the other ledger views)
- Files: apps/api/src/modules/roadmap/ledger-words.util.ts, apps/api/src/modules/roadmap/roadmap.controller.ts, apps/web/src/app/features/documents-viewer, docs/roadmap-parser.md
- Verify: VALIDAR green: check, lint, build, api unit 802, web 568, e2e 551
