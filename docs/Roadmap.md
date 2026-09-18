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
`Features.md` F32); GAP-22 is DONE (see `Features.md` F33); GAP-24 is DONE (see `Features.md` F34); GAP-23 is DONE (see `Features.md` F35); GAP-25 is DONE (see `Features.md` F36); GAP-26 is DONE for its WebSockets slice (see `Features.md` F37); the GitHub-webhooks and MCP-server slices it named split off below as GAP-29/GAP-30. GAP-29 is now also DONE (see `Features.md` F38); GAP-30 (MCP server) remains.

## Near term

| ID     | Outcome                                                                                                                                                                                                              | Acceptance check                                                                                                                                                   | Status | Depends on |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ | ---------- |
| GAP-30 | An MCP server exposing agent task operations (brief §27, §29) — currently zero code; would let an MCP-capable agent client call PM Hub task operations directly instead of only via the REST API + API keys (GAP-15) | An MCP server (stdio or HTTP transport) exposes at least task read/update/comment operations, authenticated via the existing agent API key mechanism; docs updated | TODO   | —          |

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
groundwork to build from. GAP-29 is now DONE (`Features.md` F38, ADR-016).
GAP-30 stays `TODO`, unblocked, for whenever it is picked up next.

## Blocked

| ID  | Blocker | Needed decision or event | Owner |
| --- | ------- | ------------------------ | ----- |
| —   | —       | —                        | —     |
