# ADR-019 — Task comments

- **Status:** CONFIRMED
- **Date:** 2026-09-18
- **Detailed in:** apps/api/prisma/schema.prisma (`TaskComment`), apps/api/src/modules/tasks/{task-comments.controller.ts,task-comments.service.ts}, apps/api/src/modules/mcp/mcp-tools.ts, apps/api/test/task-comments.e2e-spec.ts, apps/api/test/mcp.e2e-spec.ts

## Decision

Roadmap GAP-31 (task comments, GAP-30's deferred "comment" verb): a `TaskComment` model (`taskId`, `authorActorId` → `Actor`, `body`, `createdAt`, append-only) with `GET`/`POST /projects/:projectId/tasks/:taskId/comments` (`TaskCommentsController`/`Service`, inside the existing `tasks` module) and two new MCP tools, `list_comments`/`add_comment`, reusing the same service

## Reason

Missing definitions this ADR resolves: (1) _distinct from `AgentLogEvent`_ — that model is a one-way, read-only mirror of `Agentslog.md` entries populated by document ingestion (`agentName` is a denormalized string, not an `Actor` FK, since a log's author need not be a registered actor); `TaskComment` is a direct interactive write path authored by a real `Actor`, with no document counterpart, checked before building anything (advisor flagged this as the one finding that could have invalidated the whole model). (2) _no write-back_ — a comment is DB+audit only, never read from or written into `Roadmap.md`/`Agentslog.md`: neither document schema has a comment concept, and wiring write-back in would be adding scope the ticket never asked for, not a default to fall into by copying `TasksService`'s other methods uncritically. (3) _REST `GET`+`POST`, not just `GET`_ — the ticket's literal minimum is MCP-write, REST-read only; `POST` is a deliberate symmetry choice, not required scope, because a thread only an agent could write to is the same asymmetry that got GAP-30's "comment" verb escalated (`docs/Roadmap.md`) in the first place, and REST `POST` closes the human side at the API layer. (4) _no permission beyond membership_ — matches the ticket's own "any authenticated member can read them" wording and the "any member can edit" call `TasksController` already makes for create/update/dependency declaration; no new `Permission` enum value. (5) _no notifications, no Angular view_ — neither is asked for by the acceptance check; skipping both is a decision, not an oversight, recorded in `docs/architecture.md`/`Features.md` (known limitation) rather than left implicit

---

This record is the row `ADR-019` of the decision table in [`docs/Stack_Tecnologies.md`](../Stack_Tecnologies.md), which stays the compact form; a change to the decision is made in the table and here together.
