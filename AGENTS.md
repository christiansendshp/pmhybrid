<!-- project-documentation:start -->

## Repository rules

- Scope: all AI agents and contributors in this repository.
- Work branch: `develop` — commits push directly; no PR workflow yet.
- Approval boundaries: follow the active runtime and repository instructions.
- Never expose secrets or real environment values in documentation.
- Treat `UNKNOWN` and `HYPOTHESIS` as unresolved, not as facts.
- Every new task or action requested by the user is added to `docs/Roadmap.md`
  with an ID before it is executed. No agent works on anything without an ID.
- This file is the single rules source. Other agent files in this repository
  (`CLAUDE.md`, `.cursorrules`, etc.) only point here; on conflict this file
  prevails.

## Startup

1. Run the project-documentation `init` command, then `link`.
2. Run `context`; keep its output at or below 8 KiB.
3. Read this file completely, the computed `## Active work` summary (every
   Roadmap entry not `IDEA`/`BACKLOG`/`DONE`/`CANCELLED`/`DEFERRED`), and
   every open task (`IN_PROGRESS` or `PAUSE`) plus the five latest log
   entries — `context` includes all of these.
4. Read full Product, Stack, `Roadmap.md#Plan`, or Features only when relevant
   to the task.

## Taking a task

1. Pick a `docs/Roadmap.md` entry with status `READY` (`BACKLOG` first needs
   refining to `READY`) whose `depends_on` are all `DONE` and `blocked_by` is
   empty, unless the user names a different task. Prefer `TASK`/`SUBTASK`
   under the highest-priority open `EPIC` over the `EPIC`/`FEATURE` itself.
2. New user-requested work with no ID: add it to `docs/Roadmap.md` first
   (`## Plan` for hierarchical work, `## Cross-cutting` for a GAP/BUG/
   DECISION/etc.) per `references/roadmap-schema.md`.
3. `claim <agent> <task-id> <summary>` fails if another agent owns the task;
   it sets `executor`/`assigned_agent`, never `owner` (accountability, often
   human — tooling never overwrites it).
4. To stop before finishing: `pause <agent> <task-id> <category> "<detail>"`
   (`LIMITE`, `ESPERA_RESPUESTA`, `BLOQUEO`, `OTRO`), after updating the
   entry's `next_action` by hand so another agent can resume cold.
5. Close only once every `acceptance_criteria` item and `definition_of_done`
   step is actually met — not merely `progress: 100` — with `done <agent>
<task-id> <summary> <files> <verify>`.

## Decisions and blockers

- A `DECISION` (`status: PENDING`): read `question`/`options`. Decide it
  yourself only if the choice is reversible and scoped to implementation
  detail; record `decision`, `decision_reason`, `decision_owner: {type: AI,
name: <agent>}`, `decision_date`, `status: DECIDED`.
- Escalate to the human when the choice affects product behavior, cost,
  security, or external commitments — ask, then record the same way with
  `decision_owner: {type: HUMAN, ...}`.
- Never work around a `BLOCKER`/`DECISION` a task's `blocked_by` names;
  resolve it or `pause` (`BLOQUEO`/`ESPERA_RESPUESTA`).

## Close

1. Update only the affected project truths (`ProductDescription.md`,
   `Stack_Tecnologies.md`) for the current change.
2. Use `claim`/`pause`/`done` to record task state; use `append-log` only for
   entries outside the task lifecycle.
3. Run `rotate`, then `check`. Do not report completion while `check` fails.

## Multi-agent coordination

- `docs/Agentslog.md` is the source of truth for who currently holds a task;
  the Roadmap entry's `status`/`executor`/`assigned_agent` fields are kept in
  sync with its latest state, but the log wins on conflict.
- Do not modify work actively owned by another agent without coordinating.
- Record durable technical/architectural decisions in `Stack_Tecnologies.md`;
  record durable product/scope decisions as `DECISION` entries in
  `Roadmap.md`. Link either from the log entry that acted on them.

## Project conventions

- Code style: Prettier repo-wide; `oxlint` (api), ESLint (web). Enforced via
  Husky + lint-staged; commitlint for messages.
- Test command: `pnpm -r test` (unit), `pnpm test:e2e` (api e2e) — see
  `docs/testing.md`. CI runs the same (`.github/workflows/ci.yml`, GAP-17).
- Documentation language: match the project unless the user specifies one.

<!-- project-documentation:end -->

## Migration status (2026-09-17)

`docs/Roadmap.md` is intentionally still in the pre-rewrite table format
(`## Active work` / `## Near term` / `## Blocked`), not yet the per-entry
YAML schema this skill version defines (`references/roadmap-schema.md`).
Converting it now would make it unreadable by PM Hub's own
`RoadmapParserService` — this repository is itself a project managed by the
PM Hub app being built here (`docsPath` = this repo's `docs/`), synced on a
5-minute schedule by the running dev server. `check` fails on this until the
app's parser/writer is rewritten for the new schema (tracked as its own
future task; see `docs/Agentslog.md`'s 2026-09-17 entry) — that failure is
expected and documented, not a bug to silence.
