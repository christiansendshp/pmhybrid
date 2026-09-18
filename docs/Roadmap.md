# Roadmap

Keep active and near-term work only. Verified completed capability belongs in
`Features.md`; history belongs in `Agentslog.md`.

## Active work

| ID     | Outcome                                                                                                                                                                                                                                                                                                     | Acceptance check                                                                                                                                                                                                                                                                                           | Status        | Owner  | Depends on |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | ------ | ---------- |
| GAP-28 | `RoadmapParserService`/`AgentslogParserService` and their writers only understand the old table/4-bullet format. The project-documentation skill v2 (installed 2026-09-17) defines a new YAML-per-entry Roadmap schema and a `Pause` Agentslog bullet the current parser silently drops instead of erroring | Dual-format read+write lands for both `Roadmap.md` and `Agentslog.md` (old and new formats both parse/write correctly, regression-tested); `docs/Roadmap.md` itself converts to the new schema once the app can round-trip it; Features/log cross-reference retrofit tracked separately, out of scope here | EN_DESARROLLO | Claude | —          |

<!-- context:end -->

Post-MVP gap backlog derived from a brief-vs-code review on 2026-09-15
(GAP-12–GAP-19), the 2026-09-16 frontend redesign (GAP-20), and a
2026-09-16 user-requested docsPath folder picker (GAP-27) are all DONE
— see `Agentslog.md`/`Features.md` (F31 for GAP-27). GAP-21–GAP-26 were
a fresh brief-vs-code review done 2026-09-16 against the original brief
(`Prompt — Desarrollo de Project Management Hub Humano + IA.md`), covering
what the brief asks for that the app does not yet do. GAP-21 is DONE (see
`Features.md` F32); GAP-22 is DONE (see `Features.md` F33); GAP-24 is DONE (see `Features.md` F34); GAP-23 is DONE (see `Features.md` F35); GAP-25 is DONE (see `Features.md` F36); GAP-26 is DONE for its WebSockets slice (see `Features.md` F37); the GitHub-webhooks and MCP-server slices it named split off below as GAP-29/GAP-30. GAP-29 is DONE (see `Features.md` F38); GAP-30 is DONE for its `list_tasks`/`get_task`/`update_task`/`transition_task` slice (see `Features.md` F39, ADR-017) — its "comment" verb has no existing model anywhere in this app to adapt and split off as its own entry, GAP-31.

## Near term

| ID     | Outcome                                                                                        | Acceptance check                                                                                                                                                                                                                              | Status | Depends on |
| ------ | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ---------- |
| GAP-31 | Task comments — GAP-30's "comment" verb, deferred rather than built MCP-only (see prose below) | A `TaskComment` model with a REST endpoint (`JwtAuthGuard`+`ProjectMemberGuard`, same as every other task sub-resource) so any authenticated member can read them, plus an MCP tool; docs updated on whether an Angular view renders them yet | TODO   | —          |

GAP-29 and GAP-30 are the two GAP-26 named but did not build: GAP-26 itself
picked WebSockets first because two independent in-repo signals already
pointed at it (`docs/architecture.md`'s already-wired event-emitter, and
Features.md's already-documented "no push" limitation) — ADR-015,
`docs/Stack_Tecnologies.md`. Between the remaining two, GAP-29 was picked
next rather than left for a human to prioritize: it depended on and
directly extended the already-built `GitHubGitProvider` (GAP-23), and its
acceptance check was concrete — verify GitHub's signature, map the payload
to a project, trigger the existing sync path — where GAP-30's MCP-server
surface is a materially larger, less-scoped new protocol with no existing
groundwork to build from. GAP-29 is DONE (`Features.md` F38, ADR-016).

GAP-30 is DONE for `list_tasks`/`get_task`/`update_task`/`transition_task` —
four thin MCP adapters over `TasksService`'s existing methods, zero new
domain concepts (`Features.md` F39, ADR-017). Its acceptance check's third
verb, "comment," is the one exception: there is no comment concept
anywhere in this app yet (no model, no REST endpoint, no UI), so
satisfying it would have meant inventing a whole new capability whose only
consumer is an MCP agent — data a human member could never see or read
back. That crosses from "missing implementation detail" into "affects
product behavior" (AGENTS.md's escalation line), so rather than silently
skipping the verb or quietly building an MCP-only comment feature, it is
named explicitly and split off as GAP-31 above, scoped to include the REST
surface a real feature needs, not just the MCP one.

## Blocked

| ID  | Blocker | Needed decision or event | Owner |
| --- | ------- | ------------------------ | ----- |
| —   | —       | —                        | —     |
