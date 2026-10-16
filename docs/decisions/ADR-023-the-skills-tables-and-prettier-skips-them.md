# ADR-023 — This repo's own documents follow the latest skill's tables

- **Status:** CONFIRMED
- **Date:** 2026-10-16
- **Detailed in:** .prettierignore, AGENTS.md, docs/Roadmap.md, docs/history/Roadmap-yaml-20261016.md, .claude/skills/project-documentation/

## Decision

This repo's own documents follow the latest skill's Markdown tables (Name and Description columns, ledger Name), not the per-entry YAML fork, and prettier skips the six contract files

## Reason

The user asked on 2026-10-16 to adopt upstream 9302b58 and use it from then on (DEC-005, its second option). The skill's check matches table headers as plain text and its commands write rows unpadded, so prettier's column padding fails the check and rewrites every row (Features.md went from 441 KB to 120 KB, this file from 183 KB to 36 KB once unpadded). The fields the tables have no column for (acceptance criteria, next action, decision options) went into the cells' text, and the YAML Roadmap is kept whole in docs/history/Roadmap-yaml-20261016.md; the skill's own references/roadmap-schema.md is in this repo's history at cc86178. PM Hub still reads and writes the per-entry YAML format for the projects that use it

---

This record is the row `ADR-023` of the decision table in [`docs/Stack_Tecnologies.md`](../Stack_Tecnologies.md), which stays the compact form; a change to the decision is made in the table and here together.
