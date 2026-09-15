# Roadmap

Keep active and near-term work only. Verified completed capability belongs in
`Features.md`; history belongs in `Agentslog.md`.

## Active work

| ID     | Outcome                                                                                                 | Acceptance check                                                   | Status      | Owner                            | Depends on |
| ------ | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ----------- | -------------------------------- | ---------- |
| GAP-19 | Lifecycle write-back (created/status/locked reassign) keeps a Near term or Blocked row in its own table | sync e2e: EN_DESARROLLO on a Near term task leaves exactly one row | IN_PROGRESS | claude-code@2026-09-15T17:02:57Z | GAP-04     |

<!-- context:end -->

Post-MVP gap backlog derived from a brief-vs-code review on 2026-09-15 (the
12-phase plan is complete; these close the gaps it left). Ordered frontend
first, per the user's direction on 2026-09-15.

## Near term

| ID     | Outcome                                                                                  | Acceptance check                                   | Status | Depends on |
| ------ | ---------------------------------------------------------------------------------------- | -------------------------------------------------- | ------ | ---------- |
| GAP-17 | CI pipeline running lint, build, unit and e2e tests                                      | workflow file validated locally; green on push     | TODO   | —          |
| GAP-18 | Documentation gaps (brief §35): permissions, API, testing docs; stale Stack/Agents facts | project-documentation `check` green; links resolve | TODO   | —          |

## Blocked

| ID  | Blocker | Needed decision or event | Owner |
| --- | ------- | ------------------------ | ----- |
| —   | —       | —                        | —     |
