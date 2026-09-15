# Product description

## Operational summary

- Product: `PM Hub — Project Management Hub for Human + AI Agent teams`
- Primary user: `OWNER/PROJECT_ADMIN/PROJECT_MANAGER coordinating humans and AI agents across multiple software projects`
- Core outcome: `Centralized, auditable view of what needs doing, who's doing it (human or AI agent), its state, progress, dependencies, and what changed — kept in sync with each managed project's own Markdown documents`
- Critical invariant: `The app never contradicts or silently overwrites a managed project's own documents; conflicts are surfaced for human resolution, never auto-resolved`

<!-- context:end -->

## Users and outcomes

| User or role                          | Needed outcome                                                       | Status    | Source        |
| ------------------------------------- | -------------------------------------------------------------------- | --------- | ------------- |
| ADMIN (global)                        | Create, edit and deactivate the humans and AI agents of the instance | CONFIRMED | brief §3, §4  |
| OWNER / PROJECT_ADMIN                 | Full control of a project's members, roles, and settings             | CONFIRMED | brief §4      |
| PROJECT_MANAGER                       | Create/assign/track tasks, resolve conflicts, monitor progress       | CONFIRMED | brief §3, §26 |
| DEVELOPER / QA (human)                | Work assigned tasks through Kanban, update status/progress           | CONFIRMED | brief §7, §17 |
| AI_AGENT (Codex/Claude/Gemini/custom) | Be assigned tasks and tracked identically to a human actor           | CONFIRMED | brief §3      |
| VIEWER                                | Read-only visibility into a project                                  | CONFIRMED | brief §4      |

## Business rules

| ID     | Rule                                                                                                                                                                                | Status    | Source or verification                                     |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ---------------------------------------------------------- |
| BR-001 | A task's assignee is locked once status = EN_DESARROLLO; changing it requires a special permission and is always audited                                                            | CONFIRMED | brief §7                                                   |
| BR-002 | Kanban status is written verbatim into a managed project's Roadmap.md Status cell (PENDIENTE/ASIGNADA/EN DESARROLLO/QA/TERMINADA)                                                   | CONFIRMED | user decision, `docs/skillProyectDocument-analysis.md` §12 |
| BR-003 | A Roadmap row that disappears is never treated as deleted by default — completion must be confirmed via a terminal Agentslog entry, else it is raised as a Conflict                 | CONFIRMED | brief §12, `docs/synchronization.md`                       |
| BR-004 | A task cannot be created without indicating which higher-level instance (Phase/Epic/Template/parent Task) it depends on, when applicable                                            | CONFIRMED | brief §9                                                   |
| BR-005 | Progress of a Phase/Epic/Task-with-subtasks is derived from its descendants via a documented strategy, not just a manually entered number, when descendants exist                   | CONFIRMED | brief §16-17                                               |
| BR-006 | Hierarchy levels (Phase/Epic/Template/Subtask) are optional per task, not mandatory                                                                                                 | CONFIRMED | brief §5                                                   |
| BR-007 | An inactive actor cannot sign in, use an already-issued token, join a project, or be assigned a task; an admin cannot deactivate themselves                                         | CONFIRMED | brief §3, `apps/api/test/actors.e2e-spec.ts`               |
| BR-008 | AI agent configuration never stores credentials; secrets come from environment variables                                                                                            | CONFIRMED | brief §28, `agent-config.util.ts`                          |
| BR-009 | An app-created task needs a title and acceptance criteria, which can change but never be cleared; edits to either reach the task's own Roadmap row without moving it between tables | CONFIRMED | brief §9, §12, `apps/api/test/task-editing.e2e-spec.ts`    |

## Main flows

| Flow                 | Start -> outcome                                                                                                            | Status    |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------- | --------- |
| Create project       | User registers a project (name, repo, docsPath) -> project appears in My Projects, docs are read                            | CONFIRMED |
| Sync roadmap         | Scheduled tick or manual "Sincronizar ahora" -> Roadmap.md/Agentslog.md parsed, tasks/log events reconciled into Postgres   | CONFIRMED |
| Assign & work a task | Task created/assigned -> moves PENDIENTE -> ASIGNADA -> EN_DESARROLLO -> QA -> TERMINADA on the Kanban                      | CONFIRMED |
| Conflict resolution  | Sync or write-back detects contested/ambiguous state -> Conflict entity created, shown to an authorized user for resolution | CONFIRMED |

## Glossary

| Term            | Meaning                                                                                                                       | Status    |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------- | --------- |
| Actor           | Polymorphic HUMAN or AI_AGENT participant assignable to tasks                                                                 | CONFIRMED |
| Roadmap row     | A line in a managed project's `Roadmap.md` (Active work / Near term / Blocked), correlated to a `Task` by opaque `externalId` | CONFIRMED |
| Agentslog entry | One append-only ledger entry in `Agentslog.md`, correlated to a Roadmap row via `TASK-ID`                                     | CONFIRMED |
| SyncRun         | One execution of the synchronization/reconciliation algorithm against a project's documents                                   | CONFIRMED |
| Conflict        | First-class record of a state PM Hub could not reconcile automatically, awaiting human resolution                             | CONFIRMED |

## Out of scope

- `Multi-tenant billing / paid plans`
- `GitHub/GitLab/Bitbucket OAuth integration (MVP ships a local-filesystem Project Repository Provider only; brief §20)`
- `Real-time WebSocket push (infra is prepared per brief §27/§29 but not built in MVP)`
