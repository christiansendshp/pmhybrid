# Known limitations

Moved out of the hot summary of `docs/Features.md` so that the context stays within its budget
(Roadmap TASK-26). Each one is as it was recorded; check it against the code before relying on it.

- no refresh-token revocation (ADR-005).
- PM Hub's own write-back Agentslog entries are ingested only after an external file change.
- Workload's filter bar calls `GET /projects` to list the user's projects, which recomputes each project's full progress rollup just to populate a dropdown — fine at demo scale, worth a dedicated lightweight endpoint before real data.
- `ProjectContext` is DI-scoped to `ProjectDashboard`'s routed children (kanban/progress/conflicts/settings/...) and throws if one is ever routed outside that parent.
- `prisma/seed.ts`'s role-permission upsert only adds, never removes — a `prisma db seed` reseed silently re-grants any permission an admin had stripped from a system role via `PATCH /roles/:id/permissions`, and never removes one an admin added, so a reseed leaves the union of both rather than the seeded set.
- task comments (GAP-31) have a REST endpoint and an MCP tool but no Angular view yet — `task-detail` renders everything else (assignee, subtasks, dependencies, agent activity, history) but not comments.
