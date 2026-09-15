# Agents

## Repository rules

- Scope: all AI agents and contributors in this repository.
- Work branch: `develop` — commits push directly; no PR workflow yet.
- Approval boundaries: follow the active runtime and repository instructions.
- Never expose secrets or real environment values in documentation.
- Treat `UNKNOWN` and `HYPOTHESIS` as unresolved, not as facts.

## Startup

1. Run the project-documentation `init` command.
2. Run `context`; keep its output at or below 8 KiB.
3. Read this file completely, active Roadmap rows, and the five latest log
   entries.
4. Read full Product, Stack, or Features only when relevant to the task.

## Close

1. Update only the affected project truths.
2. Append one compact log entry per logical change.
3. Run `rotate`, then `check`.

## Multi-agent coordination

- Claim overlapping work in Roadmap as `IN_PROGRESS` with `agent@timestamp`.
- Do not modify work actively owned by another agent without coordination.
- Record durable decisions in Stack and link them from the log.

## Project conventions

- Code style: Prettier repo-wide; `oxlint` (api), ESLint (web). Enforced via
  Husky + lint-staged; commitlint for messages.
- Test command: `pnpm -r test` (unit), `pnpm test:e2e` (api e2e) — see
  `docs/testing.md`. CI runs the same (`.github/workflows/ci.yml`, GAP-17).
- Documentation language: match the project unless the user specifies one.
