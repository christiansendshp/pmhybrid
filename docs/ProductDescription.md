# Product description

## Operational summary

- Product: `PM Hub — Project Management Hub for Human + AI Agent teams`
- Primary user: `OWNER/PROJECT_ADMIN/PROJECT_MANAGER coordinating humans and AI agents across multiple software projects`
- Core outcome: `Centralized, auditable view of what needs doing, who's doing it (human or AI agent), its state, progress, dependencies, and what changed — kept in sync with each managed project's own Markdown documents`
- Critical invariant: `The app never contradicts or silently overwrites a managed project's own documents; conflicts are surfaced for human resolution, never auto-resolved`

<!-- context:end -->

## Users and outcomes

| User or role | Needed outcome | Status | Source |
|---|---|---|---|
| ADMIN (global) | Create, edit and deactivate the humans and AI agents of the instance | CONFIRMED | brief §3, §4 |
| ADMIN (global) | Configure the LLM (provider, model, API key) the instance uses to summarize long Roadmap titles | CONFIRMED | Roadmap GAP-39 |
| OWNER / PROJECT_ADMIN | Full control of a project's members, roles, and settings | CONFIRMED | brief §4 |
| PROJECT_MANAGER | Create/assign/track tasks, resolve conflicts, monitor progress | CONFIRMED | brief §3, §26 |
| DEVELOPER / QA (human) | Work assigned tasks through Kanban, update status/progress | CONFIRMED | brief §7, §17 |
| AI_AGENT (Codex/Claude/Gemini/custom) | Be assigned tasks and tracked identically to a human actor | CONFIRMED | brief §3 |
| VIEWER | Read-only visibility into a project | CONFIRMED | brief §4 |

## Business rules

| ID | Rule | Status | Source or verification |
|---|---|---|---|
| BR-001 | A task's assignee is locked once status = EN_DESARROLLO: changing it in PM Hub requires a special permission and is always audited. The lock binds changes made in PM Hub, not the document: an owner changed in the Roadmap (an agent claiming a row) is applied by the next sync, audited with origin ROADMAP, unless the assignee was also changed in PM Hub since the last sync, which is a conflict | CONFIRMED | brief §7 |
| BR-002 | Kanban status is written verbatim into the Roadmap.md Status cell of a managed project with the old tables — the raw Prisma enum string, underscore included (PENDIENTE/ASIGNADA/EN_DESARROLLO/QA/TERMINADA). That is the rule of the old tables only: in the tables of the latest skill and in the per-entry YAML format the cell holds the skill's word (TODO/IN_PROGRESS/DONE), translated at the boundary (ADR-022) | CONFIRMED | `apps/api/test/synchronization.e2e-spec.ts` GAP-19 case |
| BR-003 | A Roadmap row that disappears is never treated as deleted by default — completion must be confirmed via a terminal Agentslog entry, else it is raised as a Conflict; the conflict closes itself when that entry is written afterwards, and a task already done raises none | CONFIRMED | brief §12, `docs/synchronization.md`, `apps/api/test/late-terminal-entry.e2e-spec.ts` |
| BR-004 | A task cannot be created without indicating which higher-level instance (Phase/Epic/Template/parent Task) it depends on, when applicable | CONFIRMED | brief §9 |
| BR-005 | Progress of a Phase/Epic/Task-with-subtasks is derived from its descendants via a documented strategy, not just a manually entered number, when descendants exist | CONFIRMED | brief §16-17 |
| BR-006 | Hierarchy levels (Phase/Epic/Template/Subtask) are optional per task, not mandatory | CONFIRMED | brief §5 |
| BR-007 | An inactive actor cannot sign in, use an already-issued token, join a project, or be assigned a task; an admin cannot deactivate themselves | CONFIRMED | brief §3, `apps/api/test/actors.e2e-spec.ts` |
| BR-008 | AI agent configuration never stores credentials; secrets come from environment variables | CONFIRMED | brief §28, `agent-config.util.ts` |
| BR-009 | An app-created task needs a title and acceptance criteria, which can change but never be cleared; edits to either reach the task's own Roadmap row without moving it between tables | CONFIRMED | brief §9, §12, `apps/api/test/task-editing.e2e-spec.ts` |
| BR-010 | Removing a task needs task.delete and is a soft delete: it leaves every view, its Roadmap row is taken out after a REMOVED Agentslog entry, and sync never brings it back or raises a conflict for it | CONFIRMED | brief §25, §31, `apps/api/test/task-removal.e2e-spec.ts` |
| BR-011 | A task read from `Roadmap.md` whose title has more than 10 words is summarized by the instance's configured LLM (Anthropic, OpenAI or OpenRouter, chosen in the app) into a title of at most 10 words plus an extended description; a title of 10 words or fewer is kept and never sent to the LLM. The document's own title is kept in `Task.originalTitle` and `Roadmap.md` is never written by this; an LLM failure leaves the task as it was and never stops the Roadmap's processing | CONFIRMED | Roadmap GAP-39, ADR-020, `docs/title-normalization.md`, `apps/api/test/llm.e2e-spec.ts` |
| BR-012 | The LLM API key is configured only from the app, lives encrypted in the database (not in `.env` or any variable, unlike the agents' credentials of BR-008), and is never returned, logged, audited or shown again: the API says only that one exists | CONFIRMED | Roadmap GAP-39a, ADR-020, `apps/api/test/llm.e2e-spec.ts` |
| BR-013 | A project can require QA approval (off by default): a move to QA then needs a reviewer who holds `task.qa.approve` and is not the task's assignee, and a document cannot close a task that is in QA: sync raises a conflict for someone who can approve | CONFIRMED | DEC-006, `apps/api/test/qa-approval-required.e2e-spec.ts`, `apps/api/test/qa-approval-document.e2e-spec.ts`, `docs/permissions.md` |
| BR-014 | A project can have the QA handoff written into its ledger (off by default): a move to QA, its approval and its return then append the skill's REVIEW entries in the same transaction as the move, only in a Roadmap of the skill's tables, and a project that did not ask for it is written exactly as before | CONFIRMED | Roadmap TASK-08, GAP-40, `apps/api/test/ledger-qa-handoff.e2e-spec.ts`, `docs/synchronization.md` |
| BR-015 | Work the ledger closed that the Roadmap does not carry is shown first and counted only when a person with `task.write` imports it: each ID whose latest entry is the exact `DONE` becomes a done task (`sourceOrigin AGENTSLOG`, no Roadmap row), open work is never imported, and importing twice adds nothing | CONFIRMED | DEC-004 D1, Roadmap TASK-33, TASK-34, `apps/api/test/untracked-import.e2e-spec.ts` |

## Main flows

| Flow | Start -> outcome | Status |
|---|---|---|
| Create project | User registers a project (name, repo, docsPath) -> project appears in My Projects, docs are read | CONFIRMED |
| Sync roadmap | Scheduled tick or manual "Sincronizar ahora" -> Roadmap.md/Agentslog.md parsed, tasks/log events reconciled into Postgres | CONFIRMED |
| Assign & work a task | Task created/assigned -> moves PENDIENTE -> ASIGNADA -> EN_DESARROLLO -> QA -> TERMINADA on the Kanban | CONFIRMED |
| Normalize a long title | The sync reads a task whose title has more than 10 words -> it is queued; after the sync commits the configured LLM writes a short title and a description, the original is kept and shown on the task -> a failure is shown on the task with a retry; enabling the LLM (or saving a corrected key or model) does the same by itself for the titles that were waiting, in every project; every sync also tries a failed task again, up to three failures in a row, so the Roadmap ends adapted in the system with `Roadmap.md` untouched; the Kanban board shows a card with a title of more than 10 words as its first 10 followed by an ellipsis, with the whole title as a tooltip, as soon as the sync has read it and whether or not the LLM has answered | CONFIRMED |
| Conflict resolution | Sync or write-back detects contested/ambiguous state -> Conflict entity created, shown to an authorized user for resolution | CONFIRMED |

## Glossary

| Term | Meaning | Status |
|---|---|---|
| Actor | Polymorphic HUMAN or AI_AGENT participant assignable to tasks | CONFIRMED |
| Roadmap row | A line in a managed project's `Roadmap.md` (Active work / Near term / Blocked), correlated to a `Task` by opaque `externalId` | CONFIRMED |
| Agentslog entry | One append-only ledger entry in `Agentslog.md`, correlated to a Roadmap row via `TASK-ID` | CONFIRMED |
| SyncRun | One execution of the synchronization/reconciliation algorithm against a project's documents | CONFIRMED |
| Conflict | First-class record of a state PM Hub could not reconcile automatically, awaiting human resolution | CONFIRMED |

## Out of scope

- `Multi-tenant billing / paid plans`
- `OAuth sign-in to GitHub/GitLab/Bitbucket, and GitLab/Bitbucket Project Repository Providers (a local-filesystem provider and a token-based GitHub provider exist; brief §20)`
- `Real-time push of anything other than notifications (the notification push exists, Features.md GAP-26)`
