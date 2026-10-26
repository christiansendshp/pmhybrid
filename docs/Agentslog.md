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

- Archive: `docs/history/Agentslog-20261026-028.md`
- SHA-256: `4ba1b19097479da2397da03296fae2f4b6f9dbd5c10e92c024680adfedf72a8f`

## Entries

## [2026-10-26T20:06:42Z] | claude-sonnet-5-5 | TASK-44 | IN_PROGRESS | Risks endpoint and the stale threshold setting
- Summary: carried forward from docs/history/Agentslog-20261026-028.md at rotation

## [2026-10-26T20:16:21Z] | claude-sonnet-5-5 | TASK-44 | DONE | Risks endpoint and the stale threshold setting
- Summary: GET /projects/:id/risks, for any member: TASK-43's signals, critical path and semaphores over the open tasks that count towards the progress, with every phase and epic named (a phase with nothing open has no light); a task's last activity is its status change, its ledger entries and its comments; Project.staleAfterHours (72 by default, 1 to 8760) is changed through the project update
- Files: apps/api/prisma/schema.prisma, apps/api/prisma/migrations/20261026190000_add_project_stale_after_hours, apps/api/src/modules/risks/*, apps/api/src/modules/projects/dto/update-project.dto.ts, apps/api/src/app.module.ts, apps/api/test/risks.e2e-spec.ts, docs/risks.md, docs/api-reference.md, docs/domain-model.md
- Verify: check, lint, build, unit and e2e green (risks 18 e2e: each signal, ledger and comments as activity, the threshold and its 400s, critical path, phases and epics, member-only; holdsTask unit); migration applied to the dev DB
