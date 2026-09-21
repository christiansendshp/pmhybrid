# Decisions

One file per architecture decision record, each the long form of a row of the
decision table in [`docs/Stack_Tecnologies.md`](../Stack_Tecnologies.md). Code
and documents cite them by id (`ADR-002`).

| ID                                                                       | Date       | Status    | Decision                                                                                |
| ------------------------------------------------------------------------ | ---------- | --------- | --------------------------------------------------------------------------------------- |
| [ADR-001](ADR-001-managed-projects-documents-stay-the-write-target.md)   | 2026-09-14 | CONFIRMED | Managed projects' documents stay the write target; the richer model lives in PostgreSQL |
| [ADR-002](ADR-002-kanban-status-is-written-verbatim-into.md)             | 2026-09-14 | CONFIRMED | Kanban status is written verbatim into the Roadmap Status cell                          |
| [ADR-003](ADR-003-api-test-tooling-swc-under-vitest.md)                  | 2026-09-14 | CONFIRMED | API test tooling: swc under Vitest, and CI mode for the migrate script                  |
| [ADR-004](ADR-004-passwords-are-hashed-with-argon2id.md)                 | 2026-09-14 | CONFIRMED | Passwords are hashed with argon2id                                                      |
| [ADR-005](ADR-005-refresh-tokens-are-stateless-jwts.md)                  | 2026-09-14 | CONFIRMED | Refresh tokens are stateless JWTs                                                       |
| [ADR-006](ADR-006-the-web-keeps-the-access-token.md)                     | 2026-09-14 | CONFIRMED | The web keeps the access token in memory and the refresh token in localStorage          |
| [ADR-007](ADR-007-actor-administration-is-gated-by-a-global.md)          | 2026-09-15 | CONFIRMED | Actor administration is gated by a global actors.manage permission                      |
| [ADR-008](ADR-008-jwtstrategy-re-reads-actor-isactive-on-every.md)       | 2026-09-15 | CONFIRMED | JwtStrategy re-reads Actor.isActive on every request                                    |
| [ADR-009](ADR-009-agent-api-keys-are-hashed-with-sha.md)                 | 2026-09-15 | CONFIRMED | Agent API keys are hashed with SHA-256                                                  |
| [ADR-010](ADR-010-themeservice-switches-light-and-dark-through-color.md) | 2026-09-16 | CONFIRMED | ThemeService switches light and dark through color-scheme                               |
| [ADR-011](ADR-011-local-e2e-runs-against-a-separate-pmhybrid.md)         | 2026-09-16 | CONFIRMED | Local e2e runs against a separate pmhybrid_test database                                |
| [ADR-012](ADR-012-the-api-dev-scripts-compile-through-tsconfig.md)       | 2026-09-17 | CONFIRMED | The API dev scripts compile through tsconfig.watch.json                                 |
| [ADR-013](ADR-013-githubgitprovider-is-selected-process-wide-by-git.md)  | 2026-09-18 | CONFIRMED | GitHubGitProvider is selected process-wide by GIT_PROVIDER_TYPE                         |
| [ADR-014](ADR-014-the-accessibility-check-is-a-playwright.md)            | 2026-09-18 | CONFIRMED | The accessibility check is a Playwright and axe suite                                   |
| [ADR-015](ADR-015-live-notifications-are-pushed-over-websockets.md)      | 2026-09-18 | CONFIRMED | Live notifications are pushed over WebSockets                                           |
| [ADR-016](ADR-016-github-webhook-ingestion.md)                           | 2026-09-18 | CONFIRMED | GitHub webhook ingestion                                                                |
| [ADR-017](ADR-017-an-mcp-server-for-agent-task-operations.md)            | 2026-09-18 | CONFIRMED | An MCP server for agent task operations                                                 |
| [ADR-018](ADR-018-investigation-before-rewriting-the-parsers.md)         | 2026-09-18 | CONFIRMED | Investigation before rewriting the parsers for the skill's v2 schema                    |
| [ADR-019](ADR-019-task-comments.md)                                      | 2026-09-18 | CONFIRMED | Task comments                                                                           |
