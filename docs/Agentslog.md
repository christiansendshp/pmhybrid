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

- Archive: `docs/history/Agentslog-20261026-006.md`
- SHA-256: `98000f833ebd7560b916c63be2e18c677ded8356ff25b1c780354ce39c95b84c`

## Entries

## [2026-10-26T14:33:00Z] | claude-sonnet-5-5 | TASK-08 | IN_PROGRESS | Write the QA handoff in the ledger, opt in
- Summary: Write the QA handoff in the ledger behind a per-project switch (closes GAP-40)
- Verify: pending

## [2026-10-26T14:56:39Z] | claude-sonnet-5-5 | GAP-40 | IN_PROGRESS | Moving a task to QA leaves no trace in documents
- Summary: Closed by TASK-08: the QA handoff reaches the ledger behind a project switch
- Verify: pending

## [2026-10-26T14:56:44Z] | claude-sonnet-5-5 | TASK-08 | DONE | Write the QA handoff in the ledger, opt in
- Summary: Project switch ledgerQaHandoff (off by default): a move to QA, its approval and its return append the skill's REVIEW, PASS/FAIL and IN_PROGRESS entries in the same transaction, only in skill-table Roadmaps; optional transition note; settings checkbox; BR-014
- Files: apps/api/src/modules/roadmap/skill-ledger.util.ts, apps/api/src/modules/synchronization/write-back.service.ts, apps/api/src/modules/tasks/tasks.service.ts, apps/api/test/ledger-qa-handoff.e2e-spec.ts, apps/web/src/app/features/project-settings, docs/synchronization.md
- Verify: VALIDAR green: check, lint, build, api unit 761, web 525, e2e 523 incl. the skill check and status on the ledger written

## [2026-10-26T14:56:46Z] | claude-sonnet-5-5 | GAP-40 | DONE | Moving a task to QA leaves no trace in documents
- Summary: A move to QA now leaves its trace in the ledger when the project turns on ledgerQaHandoff (TASK-08)
- Files: docs/synchronization.md
- Verify: ledger-qa-handoff.e2e-spec.ts: handoff, approval and return pass the skill check
