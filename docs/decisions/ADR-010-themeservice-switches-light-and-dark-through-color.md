# ADR-010 — ThemeService switches light and dark through color-scheme

- **Status:** CONFIRMED
- **Date:** 2026-09-16
- **Detailed in:** apps/web/src/app/core/theme.service.ts, apps/web/DESIGN.md

## Decision

`ThemeService` toggles light/dark by writing `document.documentElement.style.colorScheme` (persisted in `localStorage`), instead of a second `mat.theme()` mixin call behind a CSS class

## Reason

`styles.scss` already themes every `--mat-sys-*` token with `theme-type: color-scheme`, which the M3 mixin compiles to `light-dark(lightVal, darkVal)` — a value that resolves off the _used_ `color-scheme` property, not only the `prefers-color-scheme` media feature. Setting it inline overrides the stylesheet's `light dark` (system) default for free, with zero duplicated CSS

---

This record is the row `ADR-010` of the decision table in [`docs/Stack_Tecnologies.md`](../Stack_Tecnologies.md), which stays the compact form; a change to the decision is made in the table and here together.
