/**
 * Documents shaped like the latest project-documentation skill
 * (christiansendshp/skillProyectDocument, templates/ and its own docs/):
 * Markdown tables only, workflow Status TODO / IN_PROGRESS / PAUSE / DONE, a
 * trailing `Pause reason` column, Plan tables under phase and epic headings,
 * and a Gaps table whose text column is `Description` (Roadmap GAP-37).
 */
export const SKILL_ROADMAP = `# Roadmap

Keep \`## Active work\` small: only tasks in progress, paused, or next to take.

## Active work

| ID | Outcome | Acceptance check | Status | Owner | Depends on | Pause reason |
|---|---|---|---|---|---|---|
| F01-E01-T01 | Ship the importer | the importer reads a CSV | IN_PROGRESS | claude@2026-09-21T10:00:00Z | — | — |
| F01-E01-T02 | Wire the exporter | the exporter writes a CSV | PAUSE | codex@2026-09-21T11:00:00Z | F01-E01-T01 | BLOQUEO - waiting for the schema review |
| F01-E01-T03 | Draft the docs | the docs page exists | PAUSE | claude@2026-09-21T12:00:00Z | — | LIMITE - usage limit reached |
| F01-E01-T04 | Confirm the format | the format is signed off | PAUSE | ana@2026-09-21T13:00:00Z | — | ESPERA_RESPUESTA - the product owner has to choose |

<!-- context:end -->

## Near term

| ID | Outcome | Acceptance check | Status | Depends on |
|---|---|---|---|---|
| F02-E01-T01 | Add SSO | a user signs in with SSO | TODO | F01-E01-T01 |

## Plan

**Vision:** a tool that imports and exports CSV files.

### F01 — Import and export

#### F01-E01 — CSV support

| ID | Outcome | Acceptance check | Status | Owner | Depends on | Pause reason |
|---|---|---|---|---|---|---|
| F01-E01-T05 | Validate headers | a bad header is reported | TODO | — | F01-E01-T01 | — |
| F01-E01-T06 | Stream large files | a 1 GB file imports | TODO | — | — | — |

## Gaps, Bugs & Technical Debt

| ID | Severity | Phase | Description | Status | Owner | Depends on | Pause reason |
|---|---|---|---|---|---|---|---|
| F01-BUG-01 | High | F01 | The importer drops the last row of a file without a trailing newline | TODO | — | — | — |
| F01-DEBT-01 | Low | F01 | The header check is duplicated in two places | IN_PROGRESS | claude@2026-09-21T14:00:00Z | F01-BUG-01 | — |

## Out of scope

- Any YAML or JSON block inside the six canonical files.
`;

export const SKILL_AGENTSLOG = `# Agents log

Recent append-only ledger.

## Entry format

\`\`\`markdown
## [YYYY-MM-DDTHH:mm:ssZ] | agent | TASK-ID | IN_PROGRESS
- Summary: what the agent will do or did
- Files: paths or component names (optional)
- Verify: command and result, or "pending" (required for DONE)
- Pause: CATEGORY - detail (required for PAUSE)
\`\`\`

## Entries

## [2026-09-21T10:00:00Z] | claude | F01-E01-T01 | IN_PROGRESS
- Summary: Start the importer
- Verify: pending

## [2026-09-21T11:00:00Z] | codex | F01-E01-T02 | PAUSE
- Summary: Stopped wiring the exporter
- Pause: BLOQUEO - waiting for the schema review

## [2026-09-21T12:00:00Z] | claude | F01-E01-T00 | DONE
- Summary: Set up the repository
- Files: package.json
- Verify: pnpm test passes
`;
