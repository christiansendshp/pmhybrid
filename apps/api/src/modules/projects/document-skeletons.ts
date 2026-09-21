/**
 * The two documents PM Hub reads and writes, as an empty project needs them
 * (Roadmap GAP-36a). They follow the latest project-documentation skill's
 * tables — the `Pause reason` column is what makes write-back write the
 * skill's own words (`docs/synchronization.md`) — and hold no task, so a
 * sync of a new project finds nothing and a task created in the app has an
 * Active work table to land in. The skill's own `init` is idempotent and adds
 * the rest of its files around these without touching them.
 */
export const ROADMAP_SKELETON = `# Roadmap

Keep \`## Active work\` small: only tasks in progress, paused, or next to take.
Full pending work lives in \`## Plan\`. Verified completed capability belongs in
\`Features.md\`; history belongs in \`Agentslog.md\`.

Status here is workflow state: exactly one of \`TODO\`, \`IN_PROGRESS\`, \`PAUSE\`,
\`DONE\`.

## Active work

| ID | Outcome | Acceptance check | Status | Owner | Depends on | Pause reason |
|---|---|---|---|---|---|---|
| — | — | — | — | — | — | — |

<!-- context:end -->

## Near term

| ID | Outcome | Acceptance check | Status | Depends on |
|---|---|---|---|---|
| — | — | — | — | — |

## Plan

**Vision:** \`UNKNOWN\`

## Gaps, Bugs & Technical Debt

| ID | Severity | Phase | Description | Status | Owner | Depends on | Pause reason |
|---|---|---|---|---|---|---|---|
| — | — | — | — | — | — | — | — |

## Out of scope

- \`UNKNOWN\`
`;

export const AGENTSLOG_SKELETON = `# Agents log

Append-only ledger and the source of truth for task ownership. The current
state of a \`TASK-ID\` is whatever its latest entry says. Never edit a past
entry; record a state change as a new entry.

## Entry format

\`\`\`markdown
## [YYYY-MM-DDTHH:mm:ssZ] | agent | TASK-ID | IN_PROGRESS
- Summary: what the agent will do or did
- Files: paths or component names (optional)
- Verify: command and result, or "pending" (required for DONE)
- Pause: CATEGORY - detail (required for PAUSE)
\`\`\`

## Entries
`;

/** File name -> content, as the provider's \`ensureDocuments\` takes them. */
export const DOCUMENT_SKELETONS: Record<string, string> = {
  'Roadmap.md': ROADMAP_SKELETON,
  'Agentslog.md': AGENTSLOG_SKELETON,
};
