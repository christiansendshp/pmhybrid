# API reference

Structural facts about the REST surface (`apps/api`). Not an exhaustive
per-field contract — that lives in each module's DTOs and e2e specs, which
this doc links to rather than duplicates, so this file doesn't drift the way
a hand-copied route list would.

## Conventions

- No global path prefix — routes are mounted at the app root
  (`http://localhost:3000/auth/login`, not `/api/auth/login`).
- Two ways to authenticate, both landing on the same `JwtAuthGuard` and
  therefore the same downstream RBAC (`docs/permissions.md`):
  - `Authorization: Bearer <accessToken>` — human or agent login
    (`POST /auth/login`), or a refreshed token (`POST /auth/refresh`).
  - `X-API-Key: pmh_<64 hex chars>` — an AI agent's own key (optionally with an
    expiry and a read-only scope, Roadmap SECURITY-04b2; `docs/domain-model.md`), minted under
    `/agents/:agentId/keys` (Roadmap GAP-15). `JwtAuthGuard` checks this
    header first: if present, it authenticates the request and any
    `Authorization: Bearer` header sent alongside is ignored, not rejected.
- Request bodies are validated by a global `ValidationPipe({ whitelist: true,
transform: true })` — unknown fields are stripped, not rejected; typed
  fields are coerced (e.g. a numeric string body field becomes a number).
- **Limits** (Roadmap IMPROVEMENT-01b). Every request field that carries free
  text or an identifier has a maximum length, from one table
  (`apps/api/src/common/dto-limits.ts`): names 200, task titles 300, descriptions
  10,000, acceptance criteria and comments 5,000, paths 1,024, URLs 2,048, ids
  100, labels 200, emails 254, passwords 128, tokens 2,048, and at most 500
  permission keys per request. An over-long value is a `400` whose message names
  the field and the limit; so is an invalid enum in a query string
  (`?status=BOGUS` on the task list). A request body larger than 100 KB is
  refused with a `413` before any of this.
- Error responses follow Nest's default `HttpException` JSON shape:
  `{ statusCode, message, error }`, where `message` is a string for a
  hand-thrown exception or an array of strings for `class-validator`
  failures. No custom global exception filter changes this shape.
- Global rate limit: 100 requests / 60s per client (`@nestjs/throttler`,
  `ThrottlerGuard` as `APP_GUARD`) — applies ahead of auth, to every route.
- **HTTP hardening** (Roadmap SECURITY-04b1, `apps/api/src/security/http-hardening.ts`):
  `helmet` sets the security headers and drops `X-Powered-By`; CORS is an
  allowlist read from `CORS_ORIGINS` (comma-separated, `*` to allow every
  origin on purpose). Unset, development allows the web app's own origins
  (`http://localhost:4200`, `http://127.0.0.1:4200`) and production allows none, so
  a deployment must name the origin it serves the web app from. A request with
  no `Origin` header (a script, an agent, `curl`) is never affected. The
  realtime WebSocket closes a connection that sends a frame over 1 KiB
  (clients only listen), and its socket errors are logged, not thrown.
- **Pagination** (Roadmap IMPROVEMENT-01d3). `GET /projects/:id/tasks`, the one list
  that grows with a project (95 tasks were 89 KB), takes `limit` (1-500, default
  and maximum 500) and `cursor`. Its body is still the array it was, so no client had
  to change; a page that is not the last says where the next starts in the
  `X-Next-Cursor` response header (exposed to browsers by CORS), to be sent back
  as `cursor`. The list is in creation order with the id as tie-break, so a page
  boundary never repeats or skips a task, and the filters (`status`, `phaseId`,
  `epicId`, `assigneeActorId`) hold across pages. A malformed `limit` or `cursor`
  is a 400. The web reads every page, so a board is never silently cut; the MCP
  tool `list_tasks` still returns the whole list. The other lists are bounded
  another way: `GET /notifications` (`take: 50`, newest first),
  `GET /projects/:id/audit` (`limit` and a cursor of its own), and everything else
  is a list of members, roles, projects or conflicts that does not grow with the
  work. A few sub-resources carry their own fixed cap (the Dashboard's five
  activity feeds at 10 each; a task detail's own `agentLogEvents` at 20) — a
  display ceiling.

## Modules and their route prefixes

| Prefix                                    | Module                | Notes                                                                                                                                                                                                                                                                                                         |
| ----------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/auth`                                   | auth                  | `login`, `refresh` unauthenticated; `me` requires `JwtAuthGuard`                                                                                                                                                                                                                                              |
| `/health`                                 | health                | Terminus healthcheck (DB connectivity)                                                                                                                                                                                                                                                                        |
| `/users`                                  | users                 | Human actors (`Actor.kind = HUMAN`)                                                                                                                                                                                                                                                                           |
| `/agents`                                 | agents                | AI agents (`Actor.kind = AI_AGENT`)                                                                                                                                                                                                                                                                           |
| `/agents/:agentId/keys`                   | agents (api-keys)     | Hashed API keys for one agent (Roadmap GAP-15)                                                                                                                                                                                                                                                                |
| `/roles`                                  | roles                 | Global role/permission catalog, `PATCH :id/permissions`                                                                                                                                                                                                                                                       |
| `/projects`                               | projects              | Create/list/update; membership decides per-project read access. Creating one on a local folder that is empty or missing creates the folder and whichever of `Roadmap.md` and `Agentslog.md` is absent (latest skill format, never overwriting) and answers `scaffolded`, the names it wrote (Roadmap GAP-36a) |
| `/projects/:projectId/members`            | project-members       |                                                                                                                                                                                                                                                                                                               |
| `/projects/:projectId/roles`              | roles (project-roles) | Per-project role assignment (distinct from the global catalog above)                                                                                                                                                                                                                                          |
| `/projects/:projectId/phases`             | phases                |                                                                                                                                                                                                                                                                                                               |
| `/projects/:projectId/epics`              | epics                 |                                                                                                                                                                                                                                                                                                               |
| `/projects/:projectId/templates`          | templates             | The brief's Epic→Task hierarchy rung, unrelated to doc "templates"                                                                                                                                                                                                                                            |
| `/projects/:projectId/tasks`              | tasks                 | Includes `:taskId/assign`, `:taskId/transition`, `:taskId/dependencies` (`POST` adds, `DELETE :dependencyId` removes; the same one twice is a 409)                                                                                                                                                            |
| `/projects/:projectId/progress`           | tasks (progress)      | `statusCounts` tree, brief §16                                                                                                                                                                                                                                                                                |
| `/projects/:projectId/documents`          | roadmap               | Raw + structured Roadmap/Agentslog views, unreadable Roadmap entries (`roadmap/issues`), revision history                                                                                                                                                                                                     |
| `/projects/:projectId/conflicts`          | conflicts             | `:id/resolve`                                                                                                                                                                                                                                                                                                 |
| `/projects/:projectId/audit`              | audit                 | Cursor-paginated change history                                                                                                                                                                                                                                                                               |
| `/projects/:projectId/sync`, `/sync-runs` | synchronization       | Manual sync trigger + run history                                                                                                                                                                                                                                                                             |
| `/dashboard`                              | dashboard             | Cross-project summary + activity feeds; a status change and an assignment carry their `task` (id, projectId, externalId, title) and a changed task that was removed is not listed (Roadmap UX-03c2)                                                                                                           |
| `/workload`                               | workload              | Cross-project per-actor task view                                                                                                                                                                                                                                                                             |
| `/notifications`                          | notifications         | `:id/read`, `read-all`                                                                                                                                                                                                                                                                                        |
| `/filesystem-browser`                     | git-providers         | `browse` — server-side folder picker for `docsPath` (Roadmap GAP-27)                                                                                                                                                                                                                                          |

Every `/projects/:projectId/...` route (except `/projects` itself) sits
behind `ProjectMemberGuard`: a non-member is refused before any handler runs,
regardless of what permission the route would otherwise require.

## Retrying a task creation

`POST /projects/:projectId/tasks` accepts an optional `Idempotency-Key` header.
Send the same key (and the same body) again after a timeout and the response is
the task the first request created, not a second task; the same key with a
different body is a `422`, a malformed key a `400`. Keys are per project and
caller and are remembered for 24 hours (`docs/domain-model.md`,
`IdempotencyKey`). Other endpoints ignore the header.

## Where the real contract lives

- Request/response shapes: each module's `dto/` folder.
- Behavior and edge cases: the matching `apps/api/test/*.e2e-spec.ts` file —
  these run in CI (`.github/workflows/ci.yml`, Roadmap GAP-17) and are the
  actual source of truth this document must never contradict.
- Domain model and field meaning: `docs/domain-model.md`.
- Sync/write-back mechanics: `docs/synchronization.md`.
