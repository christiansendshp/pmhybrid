# Permissions reference

Authoritative source: `packages/shared-types/src/permissions.ts` (the
`PERMISSIONS` map and `GLOBAL_PERMISSION_KEYS`) and `apps/api/prisma/seed.ts`
(the default role → permission grants below). See `docs/domain-model.md`
"RBAC" for the `Role`/`Permission`/`RolePermission`/`ActorRole` schema and how
`PermissionGuard` resolves global ∪ the route's `:projectId` grants.

## Permission keys

| Key                      | Scope   | Grants                                                                      |
| ------------------------ | ------- | --------------------------------------------------------------------------- |
| `task.assign`            | Project | Assign or unassign a task while not `EN_DESARROLLO`                         |
| `task.status.transition` | Project | Move a task between ordinary Kanban states                                  |
| `task.qa.approve`        | Project | Approve `QA` → `TERMINADA`                                                  |
| `task.qa.reject`         | Project | Reject `QA` → `EN_DESARROLLO`                                               |
| `task.reopen`            | Project | Reopen a `TERMINADA` task                                                   |
| `task.reassign.locked`   | Project | Reassign a task locked by `EN_DESARROLLO`                                   |
| `task.delete`            | Project | Remove a task (soft delete; its Roadmap row is taken out)                   |
| `project.update`         | Project | Update project settings, and create/edit phases/epics/templates             |
| `project.members.manage` | Project | Add or remove project members                                               |
| `project.roles.manage`   | Project | Assign or revoke project-scoped roles                                       |
| `actors.manage`          | Global  | Create, edit and deactivate users and AI agents; mint/revoke agent API keys |
| `roles.manage`           | Global  | Edit any role's permission set (the catalog, not one project's assignments) |

A **Global**-scope key can only ever be granted via a `GLOBAL` role
(`ActorRole.projectId = null`) — `RolesService.updateRolePermissions` refuses
to add one to a `PROJECT`-scope role's set (it could never be resolved there;
`PermissionGuard` only checks global grants ∪ the current route's project).

## Seeded roles and their default grants

One `GLOBAL` role and seven `PROJECT` roles ship in `prisma/seed.ts`. A
`prisma db seed` reseed only **adds** missing grants — it never removes one an
admin stripped via `PATCH /roles/:id/permissions` (known limitation,
`Features.md`).

| Role              | Scope   | Default permissions                                                                                                                                          |
| ----------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ADMIN`           | Global  | `actors.manage`, `roles.manage` (every global key)                                                                                                           |
| `OWNER`           | Project | Every project key (all ten rows above)                                                                                                                       |
| `PROJECT_ADMIN`   | Project | Every project key (identical to `OWNER` — `isSystem` protects a role's identity, not its permission set)                                                     |
| `PROJECT_MANAGER` | Project | `task.assign`, `task.status.transition`, `task.qa.approve`, `task.qa.reject`, `task.reopen`, `task.reassign.locked`, `task.delete`, `project.members.manage` |
| `DEVELOPER`       | Project | `task.assign`, `task.status.transition`                                                                                                                      |
| `QA`              | Project | `task.qa.approve`, `task.qa.reject`                                                                                                                          |
| `VIEWER`          | Project | None — read-only via every project's default JWT-authenticated GET routes                                                                                    |
| `AI_AGENT`        | Project | `task.assign`, `task.status.transition`                                                                                                                      |

Any of these (`OWNER` included) can have its own permission set edited later
via `PATCH /roles/:id/permissions` — the table above is only the seed
default, not a fixed ceiling. `updateRolePermissions` refuses an edit that
would leave no actor holding `roles.manage` instance-wide, so the catalog can
never lock every admin out of managing it.

## Enforcement layers

1. `JwtAuthGuard` (composed with `ApiKeyGuard` for `X-API-Key`, Roadmap
   GAP-15) — proves who is calling. No permission check.
2. `ProjectMemberGuard` — on every `projects/:projectId/...` route: refuses a
   non-member outright, before any permission is even considered.
3. `PermissionGuard` + `@RequirePermission(key)` — applied per-handler (a
   class-level `@RequirePermission` is silently ignored: `PermissionGuard`
   reads metadata off `context.getHandler()`, never the controller class).
   Resolves the caller's global grants ∪ the route's `:projectId` grants (if
   the route has that param) via `PermissionsResolverService`, which does no
   caching — a permission edit takes effect on the very next request.

A route with none of `@RequirePermission` still requires the guards above it
in the chain (`JwtAuthGuard`, and `ProjectMemberGuard` where present) — "no
permission required" means any authenticated member, never "no auth
required."

## Audit origin by auth method (Roadmap GAP-24)

`JwtStrategy` and `ApiKeyGuard` both set `JwtPayload.authMethod` (`'JWT'` for
a person's `Authorization: Bearer` login, `'API_KEY'` for an agent's
`X-API-Key`) — see "Enforcement layers" above. Every HTTP-triggered mutation
now reads it via the `@CurrentAuditOrigin()` param decorator
(`apps/api/src/common/decorators/current-audit-origin.decorator.ts`) and
records the matching `AuditEvent.origin`: `UI` for a person, `API` for an
agent's key. This is separate from the `ROADMAP`/`SYNC`/`SYSTEM` origins
`SynchronizationService`/`WriteBackService` record for document-triggered or
internal changes — those never go through an HTTP request, so they have no
`authMethod` to read and are unaffected by this.

Per-field conflict detection (`docs/synchronization.md` step 5) treats `UI`
and `API` identically — both are "a local edit that must contest a document
change," as opposed to `ROADMAP`/`SYNC`, which are the document's own side.

An API key management write (`API_KEY_CREATE`/`API_KEY_REVOKE`,
`agent-api-keys.service.ts`) records the key's own id as `entityId` — not the
owning agent `Actor`'s id, which the key's id previously sat behind, only
visible inside the event's `newValue` blob.

## Filesystem browser trust boundary (Roadmap GAP-27)

`GET /filesystem-browser/browse` (backs the `docsPath` folder picker on
create-project and Project Settings) requires only `JwtAuthGuard` — no
`RequirePermission`, since `POST /projects` itself needs no permission beyond
being authenticated, and this endpoint only supports that same flow. It
returns directory **names** (never file content) confined to
`PROJECT_DOCS_BROWSE_ROOT` (defaults to the API process's home directory) —
that root confinement, not a permission check, is the actual safeguard
against using it to enumerate the whole disk. Any authenticated actor can
already point `docsPath` at an arbitrary folder the API process can read and
have its `Roadmap.md`/`Agentslog.md` content synced and displayed back to
project members with zero extra permission — this endpoint adds no new
content exposure, only a bounded, read-only directory listing.

## Realtime WebSocket handshake (Roadmap GAP-26)

A third auth path alongside JWT (UI) and API keys (agents, GAP-24): a
WebSocket upgrade request can't carry an `Authorization` header, so
`JwtAuthGuard` can't protect `notifications.gateway.ts`'s connection
directly. `POST /realtime/ticket` (behind `JwtAuthGuard`, same as any other
endpoint) mints a random single-use ticket good for 15s, scoped to the
caller's own actor id; the gateway redeems it once on connect and closes the
socket (code 4001) if it's missing, unknown, already redeemed, or expired.
`isActive` is re-checked both at connect time and again before every push
(closes with code 4003 if inactive) — the same guarantee `JwtStrategy`
gives per-request (ADR-008), adapted for a connection that can outlive a
deactivation. A push only ever reaches the actor id the ticket was minted
for; there is no broadcast, so this can never leak another actor's
notification activity.

## GitHub webhook trust boundary (Roadmap GAP-29)

`POST /webhooks/github` carries neither a JWT nor an API key — GitHub can't
attach either — so it is the one endpoint in this app with no
`JwtAuthGuard`/`ApiKeyGuard` at all. Its authentication is
`X-Hub-Signature-256`: an HMAC-SHA256 over the exact request bytes, keyed
with `GITHUB_WEBHOOK_SECRET`, checked with `crypto.timingSafeEqual`. A
request with a missing, malformed, or wrong-key signature is rejected (401)
before its payload is ever read; if `GITHUB_WEBHOOK_SECRET` itself is unset,
every request is rejected (503) rather than silently accepted unsigned. Once
verified, the only side effect is calling `SynchronizationService.runSync`
for whichever project's `docsPath` names the pushed repository — the exact
same reconciliation a member's own "Sincronizar ahora" click runs, so this
endpoint grants no capability beyond what an authenticated project member
already has; it only removes the wait for the next scheduled poll.

## MCP server auth and project scoping (Roadmap GAP-30)

`POST /mcp` is guarded by `ApiKeyGuard` alone, not `JwtAuthGuard` — this
endpoint exists specifically for MCP-capable agent clients (the ticket's own
wording), and `ApiKeyGuard` already restricts to `AI_AGENT` actors, so a
person's JWT is never accepted here. Each of the four tools
(`list_tasks`/`get_task`/`update_task`/`transition_task`) calls
`assertProjectMember` with the same actor id and the tool call's own
`projectId` argument before touching `TasksService` — the equivalent of
`ProjectMemberGuard`, done by hand because a JSON-RPC tool call has no
`:projectId` route param for a `CanActivate` guard to read. A tool call
against a project the caller isn't a member of returns a normal
`CallToolResult` with `isError: true` ("Not a member of this project"),
never a 403 or a thrown exception — an MCP transport failure would look
like a bug to the calling agent, where this is expected, actionable
feedback. Every write goes through `TasksService`'s own methods unchanged,
so `update_task`/`transition_task` get the exact same audit trail and
(for `transition_task`) the exact same per-transition permission check
(`task.status.transition` etc.) a person's REST call would — MCP is a new
transport onto existing authorization, not a second one.
