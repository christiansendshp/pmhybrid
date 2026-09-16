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
