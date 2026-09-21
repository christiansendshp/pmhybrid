# ADR-014 — The accessibility check is a Playwright and axe suite

- **Status:** CONFIRMED
- **Date:** 2026-09-18
- **Detailed in:** apps/web/playwright.config.a11y.mts, apps/web/a11y/

## Decision

Roadmap GAP-25's a11y check is a real-Chromium Playwright suite (`apps/web/playwright.config.a11y.mts`) using `@axe-core/playwright`, run against the app shell + 5 representative pages, gated by a per-page known-violation allowlist rather than either a bare pass/fail or a manual audit

## Reason

The ticket itself names "axe-core via Playwright" as the expected tool, and axe-core needs real layout/paint to score rules like color-contrast — running it under `apps/web`'s existing jsdom-based Vitest unit tests would silently skip or misjudge those rules, so a real browser (new to this repo — no Playwright/e2e-browser tooling existed before) is the only faithful option; a manual audit (the ticket's other named alternative) doesn't repeat automatically in CI, which the ticket's own "automated" wording asks for. Missing definition this ADR resolves: which exact pages count as "one per surface mode" (decided: login=auth/form, dashboard=default landing/shell, my-projects=list/table, kanban=dense interactive, documents=read-heavy) and the fix-vs-log policy for a violation found (decided: fix when small and clear per rule 4's "evitar hacks", allowlist by axe rule id + page only when triaged as a real known limitation, never a blanket suppression)

---

This record is the row `ADR-014` of the decision table in [`docs/Stack_Tecnologies.md`](../Stack_Tecnologies.md), which stays the compact form; a change to the decision is made in the table and here together.
