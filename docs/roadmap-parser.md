# Roadmap / Agentslog parser

Parsing rules for the two structured documents a managed project's
`project-documentation` skill maintains. This is a description of parsing
mechanics only — what happens to the parsed output (reconciliation,
conflicts, write-back) is `docs/synchronization.md`.

## Source format reference

Exact templates and validation rules are catalogued in
`docs/skillProyectDocument-analysis.md` §4, §7, §12. This document restates
only what the parser needs, with the actual discrimination/mapping rules
resolved (no open TODOs carried forward).

## Roadmap.md — table discrimination

`Roadmap.md` has three tables under fixed headings (`## Active work`, `##
Near term`, `## Blocked`), each with a **different column set**:

| Table       | Header row columns                                                   |
| ----------- | -------------------------------------------------------------------- |
| Active work | `ID \| Outcome \| Acceptance check \| Status \| Owner \| Depends on` |
| Near term   | `ID \| Outcome \| Acceptance check \| Status \| Depends on`          |
| Blocked     | `ID \| Blocker \| Needed decision or event \| Owner`                 |

**Discriminate by column signature, not heading text**: a block whose header
row contains `Status` + `Owner` + `Depends on` is ACTIVE; `Status` + `Depends
on` without `Owner` is NEAR_TERM; `Blocker` + `Needed decision or event` is
BLOCKED. The three `## Active work`/`## Near term`/`## Blocked` headings
(guaranteed present by `check_docs()`) are used only as a secondary anchor for
where each table block starts — the column signature is the authoritative
discriminator, so a parser is not broken by heading-text drift.

## Row ID handling

The `ID` column holds an opaque string (e.g. `F01-S01-T01`, or PM Hub's own
minted `PMH-<n>` once written back — see `docs/domain-model.md`). **No
grammar is assumed or parsed out of it.** The two `F01-S01-T01`-style
examples in the upstream skill's templates are unexplained placeholder seed
data, not a documented ID scheme — treating a prefix as meaningful (e.g.
"F" = Feature) would be inventing structure the source repo never defines.
Store the ID raw; if a prefix convention emerges in real project data, it may
be used as a display grouping _hint_ only, never as a schema constraint.

## Status token mapping

Bidirectional and closed, to avoid a revert loop against verbatim write-back
(`docs/synchronization.md` write-back step 4):

| Roadmap cell (normalized: uppercase, trim, `_`/space equivalent) | App status                 |
| ---------------------------------------------------------------- | -------------------------- |
| `TODO`                                                           | `PENDIENTE`                |
| `IN_PROGRESS` / `IN PROGRESS`                                    | `EN_DESARROLLO`            |
| `DONE`                                                           | `TERMINADA`                |
| `PENDIENTE`                                                      | `PENDIENTE` (identity)     |
| `ASIGNADA`                                                       | `ASIGNADA` (identity)      |
| `EN DESARROLLO` / `EN_DESARROLLO`                                | `EN_DESARROLLO` (identity) |
| `QA`                                                             | `QA` (identity)            |
| `TERMINADA`                                                      | `TERMINADA` (identity)     |

The identity entries exist because the app writes the five Kanban states
verbatim into this same cell (ADR-002); without them, reading back a
previously-written `QA` or `EN DESARROLLO` would have no mapping and would be
mishandled.

**Any other token → leave `Task.status` unchanged, raise a `Conflict`.**
Never default an unrecognized token to `PENDIENTE` — that would silently
overwrite a known-good local status, which brief §12 explicitly forbids
("no sobrescribir silenciosamente cambios externos").

## Owner cell parsing

The skill's multi-agent coordination convention (analysis §13) writes a
claimed Owner cell as `<agent>@<timestamp>` when a task might be worked by
more than one agent concurrently; a plain name is also valid.

- Split the cell on the **last** `@` (agent display names/emails could
  theoretically contain `@`, though in practice they won't for this field —
  splitting on the last occurrence is the safer choice either way).
- Left side → name to resolve against `Actor.displayName` (case-insensitive
  match within the project's members).
- Right side, if present → parsed as an ISO-8601 timestamp into
  `Task.ownerClaimedAt`.
- **Always** store the raw, unparsed cell value in `Task.rawOwner`,
  regardless of whether name resolution succeeds — an unresolved owner name
  (e.g. an agent not yet registered as an `Actor`) must not be lost.

## Blocked table field retention

The Blocked table's column set (`ID | Blocker | Needed decision or event |
Owner`) does not include `Status`, `Depends on`, or an acceptance-check
equivalent. When a row is read from the Blocked table, the parser only
produces values for the columns that exist there (`blockedReason`,
`neededDecision`, `rawOwner`) — it does not infer or clear the other fields.
What happens to the task's previously-known status/dependencies while
blocked is a reconciliation decision, not a parsing one; see
`docs/synchronization.md`'s "field retention across the Blocked table"
handling.

## Agentslog.md — entry parsing

Fixed format (verbatim, `docs/skillProyectDocument-analysis.md` §7):

```markdown
## [YYYY-MM-DDTHH:mm:ssZ] | agent | TASK-ID | status-word

- Summary: ...
- Files: ...
- Verify: ...
- Follow-up: ...
```

Regex-anchored on the header line, requiring exactly the four fixed bullets
in order. Fields are already sanitized at write time by the skill's own
`clean_field()` (pipe/CR/LF stripped to spaces/slashes), so the parser does
not need to re-sanitize on read, only split on `|`.

- `timestampFromLog` is parsed but **never trusted** as an ordering signal
  for reconciliation (it's agent-authored and can be wrong or backdated) —
  only used for display. The parser's own ingestion time (`createdAt`) is
  what `docs/synchronization.md` relies on.
- `TASK-ID` is the correlation key to `Task.externalId`, matched within the
  same project.
- Idempotency: compute `rawEntryHash` over the full raw entry text (header +
  four bullet lines); this is a unique constraint on `AgentLogEvent`, scoped
  **per project** (`@@unique([projectId, rawEntryHash])`, not a bare global
  unique) — re-parsing the same entry after a ledger rotation or a re-sync of
  an overlapping revision is a no-op rather than a duplicate, and two
  unrelated projects whose agents happen to log byte-identical entry text
  don't collide with each other.
- Fenced code blocks are skipped entirely: a line starting with ` ``` `
  toggles an `inFence` flag, and no header/bullet matching happens while it's
  set. This exists because the skill's own documentation shows the entry
  format as a fenced ` ```markdown ` example inside `Agentslog.md` itself
  (see the block above) — without the skip, that example is indistinguishable
  from a real entry and gets ingested as one.

## Ledger rotation awareness

When the hot `Agentslog.md` contains a `## Previous segment` section (written
by the skill's own `rotate` command) with an `Archive:` path and a `SHA-256:`
hash, the parser follows that pointer and ingests the referenced file under
`docs/history/` **once**, verifying its hash before trusting its content.
This closes a blind spot for the "disappeared row" reconciliation check in
`docs/synchronization.md`: a `DONE` entry that rotated out of the hot log
_before_ its corresponding Roadmap row was removed must still be found.
