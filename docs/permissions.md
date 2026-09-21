# Permissions reference

Authoritative source: `packages/shared-types/src/permissions.ts` (the
`PERMISSIONS` map and `GLOBAL_PERMISSION_KEYS`) and `apps/api/prisma/seed.ts`
(the default role → permission grants below). See `docs/domain-model.md`
"RBAC" for the `Role`/`Permission`/`RolePermission`/`ActorRole` schema and how
`PermissionGuard` resolves global ∪ the route's `:projectId` grants.

## Permission keys

| Key                      | Scope   | Grants                                                                         |
| ------------------------ | ------- | ------------------------------------------------------------------------------ |
| `task.assign`            | Project | Assign or unassign a task while not `EN_DESARROLLO`                            |
| `task.status.transition` | Project | Move a task between ordinary Kanban states                                     |
| `task.qa.approve`        | Project | Approve `QA` → `TERMINADA`                                                     |
| `task.qa.reject`         | Project | Reject `QA` → `EN_DESARROLLO`                                                  |
| `task.reopen`            | Project | Reopen a `TERMINADA` task                                                      |
| `task.reassign.locked`   | Project | Reassign a task locked by `EN_DESARROLLO`                                      |
| `task.delete`            | Project | Remove a task (soft delete; its Roadmap row is taken out)                      |
| `task.write`             | Project | Create and edit a task's own fields and declare its dependencies               |
| `conflict.resolve`       | Project | Resolve a sync conflict (applying a status change still needs that move's key) |
| `project.update`         | Project | Update project settings, and create/edit phases/epics/templates                |
| `project.members.manage` | Project | Add or remove project members                                                  |
| `project.roles.manage`   | Project | Assign or revoke project-scoped roles                                          |
| `actors.manage`          | Global  | Create, edit and deactivate users and AI agents; mint/revoke agent API keys    |
| `roles.manage`           | Global  | Edit any role's permission set (the catalog, not one project's assignments)    |

A **Global**-scope key can only ever be granted via a `GLOBAL` role
(`ActorRole.projectId = null`) — `RolesService.updateRolePermissions` refuses
to add one to a `PROJECT`-scope role's set (it could never be resolved there;
`PermissionGuard` only checks global grants ∪ the current route's project).

## Seeded roles and their default grants

One `GLOBAL` role and seven `PROJECT` roles ship in `prisma/seed.ts`. A
`prisma db seed` reseed only **adds** missing grants — it never removes one an
admin stripped via `PATCH /roles/:id/permissions` (known limitation,
`Features.md`).

| Role              | Scope   | Default permissions                                                                                                                                                                            |
| ----------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ADMIN`           | Global  | `actors.manage`, `roles.manage` (every global key)                                                                                                                                             |
| `OWNER`           | Project | Every project key (all twelve rows above)                                                                                                                                                      |
| `PROJECT_ADMIN`   | Project | Every project key (identical to `OWNER` — `isSystem` protects a role's identity, not its permission set)                                                                                       |
| `PROJECT_MANAGER` | Project | `task.assign`, `task.status.transition`, `task.qa.approve`, `task.qa.reject`, `task.reopen`, `task.reassign.locked`, `task.delete`, `task.write`, `conflict.resolve`, `project.members.manage` |
| `DEVELOPER`       | Project | `task.write`, `task.assign`, `task.status.transition`                                                                                                                                          |
| `QA`              | Project | `task.write`, `task.qa.approve`, `task.qa.reject`                                                                                                                                              |
| `VIEWER`          | Project | None — read-only via every project's default JWT-authenticated GET routes (and it may still comment)                                                                                           |
| `AI_AGENT`        | Project | `task.write`, `task.assign`, `task.status.transition`                                                                                                                                          |

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
3. `PermissionGuard` + `@RequirePermission(key)` — applied per-handler or
   per-controller (a handler-level key overrides a class-level one; before
   Roadmap SECURITY-02 a class-level key was silently ignored).
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

## Filesystem browser and docsPath trust boundary (Roadmap GAP-27, SECURITY-01)

`GET /filesystem-browser/browse` (backs the `docsPath` folder picker on
create-project and Project Settings) requires only `JwtAuthGuard` — no
`RequirePermission`, since `POST /projects` itself needs no permission beyond
being authenticated (any human or agent actor may create a project; the
creator becomes its OWNER), and this endpoint only supports that same flow.
It returns directory **names** (never file content).

The safeguard is the **allowed roots**: `PROJECT_DOCS_BROWSE_ROOT` (defaults to
the API process's home directory; several roots may be listed, separated by
the platform path delimiter — `;` on Windows, `:` elsewhere). Since Roadmap
SECURITY-01 the same roots confine the _stored_ `docsPath`, not just the
picker. Before that, any authenticated actor could point a project at any
folder the API process could read — another team's docs or a system folder —
and have its `Roadmap.md`/`Agentslog.md` read, and written back to, with no
permission.

- **Create and update** (`local` provider): `docsPath` must resolve inside an
  allowed root, judged on the real location too (a symlink or junction inside
  a root cannot lead out of it). UNC and device paths (a leading `\\` or
  `//`, which covers `\\server\share`, `\\?\` and `\\.\`) and NUL bytes are
  rejected with 400. The stored value is the normalized absolute path. A
  `github` provider slug only has to be free of `..` segments and NUL.
- **No aliasing another team's folder**: a project may not use the folder of
  a project the requester is not an active member of (409
  `docsPath is not available`, deliberately not naming the other project);
  reusing a folder that only the requester's own projects use is fine.
- **Update** validates `docsPath` only when it actually changes, so a project
  stored before the confinement stays editable for its other settings.
- **Every read, write and `git log`** goes through `LocalFsGitProvider`, which
  re-checks the path against the roots each time, so an old row (or a root
  later narrowed) can no longer be used to touch a folder outside them.

Not covered: everything _inside_ an allowed root is still reachable by any
actor who creates a project there, so the roots must contain only project
documentation folders — do not point them at a directory that also holds
unrelated secrets.

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

## The workflow tools (Roadmap GAP-36b)

Six more MCP tools let an agent run its whole loop without the REST API:
`list_projects` (the projects it belongs to, with a summary each — the place to
start), `get_context` (one call for a project: figures by status, the agent's own
open tasks, what is blocked, how many conflicts are open), `claim_task` (assign the
task to the caller, and with `start` also move it to `EN_DESARROLLO`),
`create_task` (a task or a subtask, with an optional `idempotencyKey` so a retry
cannot create two), `list_conflicts` (open by default) and `read_document` (the
Roadmap, the Agentslog, the rules, the other three documents). They follow the
same rule as the first six and add no way in: `guarded()` checks membership
(`isError: Not a member of this project` otherwise, except `list_projects`, which
has no project to check), and every write goes through `TasksService`'s own
method with `origin: 'API'`, so `claim_task` needs the assign permission and
`create_task` needs `task.write` exactly as the REST call does — a refusal is an
`isError` result with the service's message. Resolving a conflict stays with a
person: there is deliberately no tool for it.

## Task comments (Roadmap GAP-31)

`TaskCommentsController` (`GET`/`POST /projects/:projectId/tasks/:taskId/
comments`) sits behind `JwtAuthGuard`+`ProjectMemberGuard` only, same as
`TasksController`'s create/update/dependency routes — no `@RequirePermission`
gate, since the ticket's own wording is "any authenticated member can read
them" and this app makes the same "any member can edit" call for every
other task sub-resource that isn't assign/transition/delete. `add_comment`/
`list_comments` (the MCP tools, `mcp-tools.ts`) go through the same
`assertProjectMember`+`guarded()` pattern GAP-30's tools use, calling the
same `TaskCommentsService` a REST request would. `AuditOrigin` follows the
same rule as every other write: `UI` for a person's JWT, `API` for an
agent's key (MCP tools hardcode `'API'`, matching `update_task`/
`transition_task`).

## Who may write, and what a resolution may apply (Roadmap SECURITY-02)

Before this change any project member — including one holding no role at all
or the read-only `VIEWER` role — could create and edit tasks, declare
dependencies and resolve conflicts, because only membership was checked.
Now:

- **Create / edit / declare dependencies** need `task.write`. It is checked
  inside `TasksService`, so the MCP `update_task` tool (which calls the
  service directly) is held to the same rule as REST. Moving and assigning
  keep their own keys. **A member added without a role can therefore only
  read** (and comment); give them a role such as `DEVELOPER` or `AI_AGENT`.
- **Commenting** stays open to any member (the comments ticket, GAP-31,
  specifies it) — the one write a `VIEWER` keeps.
- **`POST /projects/:id/conflicts/:id/resolve`** needs `conflict.resolve`
  (seeded for `OWNER`, `PROJECT_ADMIN`, `PROJECT_MANAGER`). On top of that, what
  the resolution _applies_ is held to the same rules as doing it by hand: a
  status change needs the key that move needs (a legal single step keeps its
  rule's key; a jump into `TERMINADA` needs `task.qa.approve`, out of
  `TERMINADA` needs `task.reopen`, any other jump `task.status.transition`),
  and any other field needs `task.write`. A resolution that moves a task is
  audited as `STATUS_CHANGE` as well as `CONFLICT_RESOLVED`.
- Existing databases pick the new keys up by re-running `prisma db seed`
  (it only adds); roles edited via `PATCH /roles/:id/permissions` are not
  touched, so grant `task.write`/`conflict.resolve` to any custom-edited role
  that should keep them.

## What leaves with a removed member (Roadmap BUG-08)

`ProjectMember` removal is a soft delete, and `ProjectMemberGuard` already stops
a removed member acting. What they hold in the project goes with them, in the
same transaction, so re-adding them starts clean and nothing stays assigned to
someone who cannot act on it:

- **Project-scoped roles are revoked**, each audited as `ROLE_REVOKE`. Global
  roles are the actor's own, not the project's, and are untouched. Re-adding the
  member gives them no role: the roles are granted again on purpose.
- **Open tasks are unassigned** — everything they are assigned that is not
  `TERMINADA` or removed — with one `UNASSIGN` audit event each and the
  assignment history closed. An `ASIGNADA` task goes back to `PENDIENTE` (it
  means "has an assignee"); one already in progress keeps its status and waits
  for someone to pick it up. Finished work stays credited to who did it.
- **Unassign, not refuse.** Refusing the removal until every task is reassigned
  would make off-boarding impossible while a locked `EN_DESARROLLO` task is open,
  since only `task.reassign.locked` can move it. The Roadmap document keeps naming
  the person in its owner field; sync cannot resolve that name to a member any
  more, so it leaves the assignee empty rather than assigning it back.
- **A removed project lead stops being the lead** (an audited `UPDATE` of the
  project); the project has none until one is set.

## Login, secrets, the seed and password change (Roadmap SECURITY-04a)

- **Login is uniform.** It verifies one password hash on every attempt — the real
  one, or a fixed dummy hash for an unknown email, a non-human actor or an account
  with no password — and answers `401 Invalid credentials` for unknown, wrong
  password and inactive alike, with the password checked before the account's
  state. It used to answer "Actor is inactive" before looking at the password and
  to skip the hash for an unknown account, so both the message and the response
  time (157-370 ms against 11-14 ms) said which accounts exist and which are off.
- **`JWT_SECRET` is checked at start.** With `NODE_ENV=production` it must be at
  least 32 characters and not a known placeholder (`change-me`, `secret`, …), or
  the API refuses to start; elsewhere a weak one only logs a warning, so a laptop,
  CI and the e2e suite keep working. `.env.example` says how to generate one
  (`openssl rand -base64 48`).
- **The seed refuses production.** It plants a global ADMIN with a documented
  password (`demo1234`) and demo projects; with `NODE_ENV=production` it stops with
  an explanation unless `SEED_ALLOW_DEMO_DATA=true` says this really is a
  disposable demo environment.
- **`POST /auth/change-password`** lets a signed-in person change their own
  password by giving the current one and a new one (8 to 128 characters, different
  from the current). It answers `204`; a wrong current password is a `400`, not a
  `401` — a 401 makes the web client try to refresh the session and sign the person
  out. Only the caller's own credential is touched, and the `PASSWORD_CHANGE` audit
  event records that it happened and never either password. Existing refresh tokens
  stay valid until they expire (tokens are stateless); revoking them is left to
  SECURITY-04b's API-key and session work. The web app has no form for it yet.
