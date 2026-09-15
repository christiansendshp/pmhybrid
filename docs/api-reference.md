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
  - `X-API-Key: pmh_<64 hex chars>` — an AI agent's own key, minted under
    `/agents/:agentId/keys` (Roadmap GAP-15). `JwtAuthGuard` checks this
    header first: if present, it authenticates the request and any
    `Authorization: Bearer` header sent alongside is ignored, not rejected.
- Request bodies are validated by a global `ValidationPipe({ whitelist: true,
transform: true })` — unknown fields are stripped, not rejected; typed
  fields are coerced (e.g. a numeric string body field becomes a number).
- Error responses follow Nest's default `HttpException` JSON shape:
  `{ statusCode, message, error }`, where `message` is a string for a
  hand-thrown exception or an array of strings for `class-validator`
  failures. No custom global exception filter changes this shape.
- Global rate limit: 100 requests / 60s per client (`@nestjs/throttler`,
  `ThrottlerGuard` as `APP_GUARD`) — applies ahead of auth, to every route.
- CORS is open (`app.enableCors()` with no origin restriction) — acceptable
  for this MVP's single first-party web client; revisit before a second,
  less-trusted origin needs to call this API.
- No pagination on any list endpoint except `GET /notifications` (`take: 50`,
  newest first, no cursor) and `GET /projects/:id/audit` (cursor-paginated,
  the one endpoint brief §25/§31 asked to page). Every other list returns
  its full result set — acceptable at this project's data scale. A few
  sub-resources carry their own fixed, non-configurable cap regardless (the
  Dashboard's five activity feeds at 10 each; a task detail's own
  `agentLogEvents` at 20) — not pagination, just a display ceiling.

## Modules and their route prefixes

| Prefix                                    | Module                | Notes                                                                   |
| ----------------------------------------- | --------------------- | ----------------------------------------------------------------------- |
| `/auth`                                   | auth                  | `login`, `refresh` unauthenticated; `me` requires `JwtAuthGuard`        |
| `/health`                                 | health                | Terminus healthcheck (DB connectivity)                                  |
| `/users`                                  | users                 | Human actors (`Actor.kind = HUMAN`)                                     |
| `/agents`                                 | agents                | AI agents (`Actor.kind = AI_AGENT`)                                     |
| `/agents/:agentId/keys`                   | agents (api-keys)     | Hashed API keys for one agent (Roadmap GAP-15)                          |
| `/roles`                                  | roles                 | Global role/permission catalog, `PATCH :id/permissions`                 |
| `/projects`                               | projects              | Create/list/update; membership decides per-project read access          |
| `/projects/:projectId/members`            | project-members       |                                                                         |
| `/projects/:projectId/roles`              | roles (project-roles) | Per-project role assignment (distinct from the global catalog above)    |
| `/projects/:projectId/phases`             | phases                |                                                                         |
| `/projects/:projectId/epics`              | epics                 |                                                                         |
| `/projects/:projectId/templates`          | templates             | The brief's Epic→Task hierarchy rung, unrelated to doc "templates"      |
| `/projects/:projectId/tasks`              | tasks                 | Includes `:taskId/assign`, `:taskId/transition`, `:taskId/dependencies` |
| `/projects/:projectId/progress`           | tasks (progress)      | `statusCounts` tree, brief §16                                          |
| `/projects/:projectId/documents`          | roadmap               | Raw + structured Roadmap/Agentslog views, revision history              |
| `/projects/:projectId/conflicts`          | conflicts             | `:id/resolve`                                                           |
| `/projects/:projectId/audit`              | audit                 | Cursor-paginated change history                                         |
| `/projects/:projectId/sync`, `/sync-runs` | synchronization       | Manual sync trigger + run history                                       |
| `/dashboard`                              | dashboard             | Cross-project summary + activity feeds                                  |
| `/workload`                               | workload              | Cross-project per-actor task view                                       |
| `/notifications`                          | notifications         | `:id/read`                                                              |

Every `/projects/:projectId/...` route (except `/projects` itself) sits
behind `ProjectMemberGuard`: a non-member is refused before any handler runs,
regardless of what permission the route would otherwise require.

## Where the real contract lives

- Request/response shapes: each module's `dto/` folder.
- Behavior and edge cases: the matching `apps/api/test/*.e2e-spec.ts` file —
  these run in CI (`.github/workflows/ci.yml`, Roadmap GAP-17) and are the
  actual source of truth this document must never contradict.
- Domain model and field meaning: `docs/domain-model.md`.
- Sync/write-back mechanics: `docs/synchronization.md`.
