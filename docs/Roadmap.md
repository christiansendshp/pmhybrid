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
`Features.md` F32); GAP-22 is DONE (see `Features.md` F33); GAP-24 is DONE (see `Features.md` F34); GAP-23 is DONE (see `Features.md` F35); GAP-25 is DONE (see `Features.md` F36); GAP-26 is not started — see the note below the table for why it stays for a human pick.

## Near term

| ID     | Outcome                                                                                                                                                                                                                                                                                     | Acceptance check                                                                                                                         | Status | Depends on |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------ | ---------- |
| GAP-26 | Real-time push (WebSockets), GitHub webhook ingestion, and an MCP server for agent task operations are all explicitly "prepare the architecture, build later" in the brief (§27, §29) — currently zero code for any of the three; **relative priority among them is UNKNOWN, not inferred** | User or product decision picks which of the three to build first; that one gets its own GAP with a concrete acceptance check once chosen | TODO   | —          |

GAP-26 is deliberately not picked up autonomously even though nothing
formally blocks it: its own acceptance check already names the missing
input as a "user or product decision" among three independent subsystems
with no shared code — there is no single "most coherent" default among
them the way there was for GAP-23's docsPath encoding or GAP-25's page/tool
choices. It is one human go-ahead away from TODO → IN_PROGRESS.

## Blocked

| ID  | Blocker | Needed decision or event | Owner |
| --- | ------- | ------------------------ | ----- |
| —   | —       | —                        | —     |
