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

### The latest skill's tables (Roadmap GAP-37a)

The current project-documentation skill went back to Markdown tables only
(no YAML), with a fixed set of shapes the same column-signature rule reads:

| Section                          | Columns                                                                                   |
| -------------------------------- | ----------------------------------------------------------------------------------------- |
| `## Active work`                 | `ID \| Outcome \| Acceptance check \| Status \| Owner \| Depends on \| Pause reason`      |
| `## Near term`                   | `ID \| Outcome \| Acceptance check \| Status \| Depends on`                               |
| `## Plan` (one per epic)         | the Active work columns, under `### F01 —` / `#### F01-E01 —` headings                    |
| `## Gaps, Bugs & Technical Debt` | `ID \| Severity \| Phase \| Description \| Status \| Owner \| Depends on \| Pause reason` |

- **Every table with `Status` + `Owner` + `Depends on` is read the same way**,
  wherever it is, so a Plan or Gaps row is a row like an Active work one.
  `roadmapTable` keeps only the shapes that change behaviour (blocked, near
  term, anything else); a `PLAN` or `GAPS` value would cost a migration and
  every consumer with no behavioural difference.
- **The title of a row is its `Name`** where the table has one (Roadmap TASK-26,
  GAP-43). The skill's version of 2026-10 gave every row a `Name` of at most
  10 words, with the detail in a `Description`: the tables are then `ID | Name |
Description | Acceptance check | Status | Owner | Depends on | Pause reason`
  (Active work and Plan), `ID | Name | Acceptance check | Status | Depends on`
  (Near term) and `ID | Name | Severity | Phase | Description | Status | Owner |
Depends on | Pause reason` (Gaps). The title is `Outcome`, else `Name`, else
  `Description` (the Gaps table of the version before it had no `Name`). A `Name` is
  at most 10 words, so such a row is never queued for title normalization
  (`docs/title-normalization.md`), and the `Description` is not read into the task:
  it stays in the document, which is the truth for it.
- `Severity` is not imported (the task model has no field it maps to);
  `Phase` places a Gaps row (see below).
- `Status` is `TODO`, `IN_PROGRESS`, `PAUSE` or `DONE`. `PAUSE` is a valid
  state with no Kanban column: the task keeps the column it has and no
  `UNRECOGNIZED_STATUS` conflict is raised.
- `Pause reason` is `CATEGORY - detail` (`LIMITE`, `ESPERA_RESPUESTA`,
  `BLOQUEO`, `OTRO`) and only counts on a `PAUSE` row. `BLOQUEO` and
  `ESPERA_RESPUESTA` (somebody else has to act) read the row as **blocked**:
  `table` is `BLOCKED` and the reason is the `blocker`, because the skill has
  no Blocked table — it writes a paused row instead. `LIMITE` and `OTRO` are a
  plain stop. The row still has a `Depends on` cell (`carriesDependsOn`), so
  emptying it removes the dependencies the document listed.
- **The hierarchy is in the headings of `## Plan`** (Roadmap GAP-38). Inside that
  section a `###` heading of the shape `ID — Title` names a phase and a `####`
  heading an epic (`ParsedRoadmap.structure`); a new `##` section leaves the Plan,
  a heading of another shape names nothing, and a code fence is not read. A row
  of a table under an epic heading has that epic as its `parentRef`, one under
  a phase heading that phase, and a Gaps row the phase its own `Phase` column
  names. A row outside the Plan is placed by nothing — its id is never parsed
  for a prefix (ADR-001), so `F01-E01-T01` in Active work is not in `F01-E01`.
  The `Vision` line and `<!-- context:end -->` are prose.

## What a YAML entry adds to a row (Roadmap GAP-35c)

Besides the fields every format has, an entry of the YAML format is read for
`type` (`ParsedRoadmapRow.entryType`, upper-cased), `priority` (`priority`, the
app's level: `P0`-`P3` or a word) and `progress` (`progress`, a whole percent 0-100).
A value the app cannot hold is left off the row instead of guessed at, and a
row of a table carries none of the three. Its `parent` (`parentRef`; else the
nearest of `feature`, `epic`, `theme`, `phase`) is read too, for the hierarchy. `docs/synchronization.md` ("Type,
priority and progress") says what sync does with them.

## Unreadable entries (new per-entry YAML format)

An entry whose block cannot be read — invalid YAML, a block that is not a
mapping, or a missing/empty `id`/`type`/`status` — is **isolated to itself**
(Roadmap BUG-05). `RoadmapParserService.parseTolerant()` returns
`{ rows, errors }`: every entry that could be read, and separately one
`{ id, line, reason }` per entry that could not. `id` is the heading's id
(the YAML itself is what failed), `line` the 1-based line of the offending
YAML line, `reason` one readable line — `yaml`'s code frame and its
block-relative "at line N" are dropped, and the common cause (an unquoted
`: ` in a value, e.g. `title: Foo: bar`) says to quote it.

An unreadable entry is **present but not understood**, never absent: a caller
reconciling against `rows` alone must not read its absence as a removal
(sync counts its id as seen — see `docs/synchronization.md`). The
all-or-nothing `parse()` and `extractRoadmapYamlEntries()` still throw for
callers that would otherwise act on a silently-shortened list. A document
malformed as a whole — an unterminated ` ```yaml ` fence, after which nothing
can be trusted to belong where it looks like it does — throws
`RoadmapFormatError` from every form.

Write-back locates its target with `extractRoadmapYamlEntriesForWrite`: a
broken _sibling_ does not block an edit (its lines are untouched), but if the
entry being written is itself unreadable the write is refused rather than
letting "no entry with this id" append a duplicate.

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

What PM Hub writes into the cell depends on the document. In the old tables it writes the
Kanban word, `QA` and `EN_DESARROLLO` among them (BR-002). In the tables of the latest skill (the
ones with a `Pause reason` column) and in the per-entry format it writes the skill's word: `TODO`
for `PENDIENTE` and `ASIGNADA`, `IN_PROGRESS` for `EN_DESARROLLO` **and** `QA`, `DONE` for
`TERMINADA` (ADR-022). The word cannot say QA from development, so the stage is read from the
ledger (`docs/synchronization.md`), and a row that says its word while the task sits in the column
that projects to it counts as agreeing (`rowStatusDiffers`): reading back what PM Hub wrote moves
no card.

**Any other token → leave `Task.status` unchanged, raise a `Conflict`** (kind
`UNRECOGNIZED_STATUS`, Roadmap GAP-35b; the parser marks the row
`statusUnrecognized`). In the per-entry format only a token outside the
document's own vocabulary counts; `IDEA`, `REVIEW`, `CANCELLED` and `DEFERRED`
(and `PAUSE` in the skill's tables) are valid states with no Kanban column and
stay unmapped without a conflict.
Never default an unrecognized token to `PENDIENTE` — that would silently
overwrite a known-good local status, which brief §12 explicitly forbids
("no sobrescribir silenciosamente cambios externos").

## The ledger's Name

The same skill writes the task's Name after the status in a ledger entry:
`## [timestamp] | agent | TASK-ID | DONE | Name`. The status word is what comes
before the Name (`AgentslogParserService`), so a `DONE | Name` is the terminal
word BR-003 looks for; the Name itself is not stored. An entry with no Name (every
entry PM Hub writes, and every entry of an older skill) reads as before.

## Owner cell parsing

The skill's multi-agent coordination convention (analysis §13) writes a
claimed Owner cell as `<agent>@<timestamp>` when a task might be worked by
more than one agent concurrently; a plain name is also valid.

- Split the cell on the **last** `@` (agent display names/emails could
  theoretically contain `@`, though in practice they won't for this field —
  splitting on the last occurrence is the safer choice either way).
- Left side → name to resolve against `Actor.displayName`, or an agent's ledger name
  or alias (case-insensitive match within the project's members).
- Right side, if present → parsed as a timestamp into `Task.ownerClaimedAt`;
  one that does not parse is dropped and the name still counts. A later change of the
  cell moves `ownerClaimedAt` with it (Roadmap TASK-02).
- An empty cell, `—` or `-` names nobody.
- **Always** store the raw, unparsed cell value in `Task.rawOwner`,
  regardless of whether name resolution succeeds — an unresolved owner name
  (e.g. an agent not yet registered as an `Actor`) must not be lost.

In the per-entry format the owner is derived instead (Roadmap GAP-35a): `executor:
AI` + `assigned_agent` names an agent (`ownerKind: AI_AGENT`) and wins over
`owner`, which is the accountable person; without an agent, `owner.name` is the
owner and `owner.type` gives the kind (`HUMAN`, or `AI`/`AI_AGENT`; absent means
unknown). Resolution against `Actor` uses name **and** kind and is described in
`docs/synchronization.md` "Owner and assignee".

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

The format of the skill's first version (verbatim,
`docs/skillProyectDocument-analysis.md` §7), which is also what PM Hub writes to
a document of the older format:

```markdown
## [YYYY-MM-DDTHH:mm:ssZ] | agent | TASK-ID | status-word

- Summary: ...
- Files: ...
- Verify: ...
- Follow-up: ...
```

Regex-anchored on the header line. An entry is accepted once it has a
`Summary` bullet; `Files`, `Verify`, `Follow-up`, `Pause` and, for a handoff to
review, `Handoff` (who the work goes to) and `Review` (`PASS|FAIL - detail`; only
the result is kept, and only when it is one of the two; Roadmap TASK-06) are read when
present, in any subset, each at most once (a bullet name that repeats ends the
entry, so a malformed neighbour is not swallowed), with one optional blank line
allowed between the header and the bullets. The latest skill's shape is the
same with `Files` optional, `Verify` required only on `DONE`, `Pause` only on
`PAUSE` (`CATEGORY - detail`) and no `Follow-up`. Fields are already sanitized
at write time by the skill's own `clean_field()` (pipe/CR/LF stripped to
spaces/slashes), so the parser does not need to re-sanitize on read, only split
on `|`.

- **The status word is read, not replaced** (Roadmap TASK-06). `statusWord` stays as
  written; `canonicalStatus` and `statusQualifier` say what it means in the skill's
  vocabulary, read from the start of the word: `IN_PROGRESS`, `REVIEW` (also `TESTING` and
  `QA_REVIEW`), `ASSIGNED` (also `READY`), `PAUSE`, `DONE`, `TODO`, and `DONE_PARTIAL` for a
  `DONE` whose qualifier says it is a part (`parcial`, `2 de 3 partes`, `chunk 1/2`). The
  qualifier is what follows the word, without its parentheses or separator
  (`IN_PROGRESS (revisión, 3 correcciones)` gives `IN_PROGRESS` and `revisión, 3
correcciones`). The words real ledgers use besides the skill's are read too (Roadmap TASK-29), in
  Spanish and in English: `BLOCKED` (`BLOQUEADO`, `BLOQUEADA`, `BLOQUEADO_PO`, whose qualifier is `PO`),
  `DROPPED` (`DESCARTADO`, `DESCARTADA`), `SUPERSEDED` (`SUPERADO`, `SUPERADA`) and `FINDING`
  (`HALLAZGO`). A word that starts with none of them (`EN CURSO — …`, `N/A`) is `OTHER`, with no
  qualifier: it is listed so the table can grow (Roadmap TASK-30), and nothing reads it differently
  from before. Only an empty word has no canonical status. **BR-003's terminal check is still the
  exact word `DONE`**: a `DONE parcial`, or any `DONE (…)`, never closes a task whose row left, and
  none of the new statuses has a stage.
- `timestampFromLog` is parsed but **never trusted** as an ordering signal
  for reconciliation (it's agent-authored and can be wrong or backdated) —
  only used for display. The parser's own ingestion time (`createdAt`) is
  what `docs/synchronization.md` relies on.
- `TASK-ID` is the correlation key to `Task.externalId`, matched within the
  same project.
- Idempotency: compute `rawEntryHash` over the full raw entry text (the header
  and the bullet lines it has); this is a unique constraint on `AgentLogEvent`, scoped
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
