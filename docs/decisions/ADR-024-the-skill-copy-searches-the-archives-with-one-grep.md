# ADR-024 — This repo's copy of the skill searches the archives with one grep

- **Status:** CONFIRMED
- **Date:** 2026-10-26
- **Detailed in:** .claude/skills/project-documentation/scripts/project_docs.sh (`history_has_done`, `epic_history_done`), docs/Roadmap.md (GAP-44)

## Decision

This repo's copy of the skill is upstream 9302b58 plus one performance-only change: `history_has_done` and `epic_history_done` in `scripts/project_docs.sh` search every archive of `docs/history` with one `grep`, not one process per archive

## Reason

`check` asks, for each Features ID with no DONE entry in the hot log (about 210 of them), whether an archive holds it, one `grep` per archive: 1327 processes for 209 IDs with 41 archives, 45 of the 59 s `check` took on Windows (Roadmap GAP-44), and a longer wait with every ID and every archive a rotation adds. One `grep` over all the archives answers the same question (it stops at the first match, and no archive is no match): `check` took 25 s, and the same four scenarios (no archive, the DONE in an archive, another ID there, an entry that is not DONE) gave the same verdicts with both scripts. It is a deviation from the user's choice of ADR-023 to use upstream as it is, kept to these two functions: the upstream repo has the same loop, so the change is to be offered there and dropped from this copy when upstream has it or when the copy is next replaced by upstream

---

This record is the row `ADR-024` of the decision table in [`docs/Stack_Tecnologies.md`](../Stack_Tecnologies.md), which stays the compact form; a change to the decision is made in the table and here together.
