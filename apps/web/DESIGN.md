---
name: PM Hub
description: Dense Operate-mode control room for humans and AI agents coordinating on shared project documents
colors:
  primary: 'light-dark(#005cbb, #abc7ff)'
  on-primary: 'light-dark(#ffffff, #002f65)'
  primary-container: 'light-dark(#d7e3ff, #00458f)'
  secondary: 'light-dark(#565e71, #bec6dc)'
  secondary-container: 'light-dark(#dae2f9, #3e4759)'
  tertiary: 'light-dark(#7d00fa, #d5baff)'
  tertiary-container: 'light-dark(#ecdcff, #5f00c0)'
  surface: 'light-dark(#faf9fd, #121316)'
  on-surface: 'light-dark(#1a1b1f, #e3e2e6)'
  surface-container-low: 'light-dark(#f4f3f6, #1a1b1f)'
  surface-container: 'light-dark(#efedf0, #1f2022)'
  surface-container-high: 'light-dark(#e9e7eb, #292a2c)'
  outline: 'light-dark(#74777f, #8e9099)'
  outline-variant: 'light-dark(#c4c6d0, #44474e)'
  error: 'light-dark(#ba1a1a, #ffb4ab)'
typography:
  headline-small:
    fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif'
    fontSize: '1.5rem'
    fontWeight: 600
    lineHeight: '2rem'
  title-medium:
    fontFamily: '{typography.headline-small.fontFamily}'
    fontSize: '1rem'
    fontWeight: 600
    lineHeight: '1.5rem'
  body-medium:
    fontFamily: '{typography.headline-small.fontFamily}'
    fontSize: '0.875rem'
    fontWeight: 400
    lineHeight: '1.25rem'
  label-large:
    fontFamily: '{typography.headline-small.fontFamily}'
    fontSize: '0.875rem'
    fontWeight: 500
    lineHeight: '1.25rem'
rounded:
  sm: '6px'
  md: '10px'
  pill: '999px'
spacing:
  1: '0.25rem'
  2: '0.5rem'
  3: '0.75rem'
  4: '1rem'
  6: '1.5rem'
  8: '2rem'
  12: '3rem'
components:
  button-primary:
    backgroundColor: '{colors.primary}'
    textColor: '{colors.on-primary}'
    rounded: '{rounded.pill}'
  card-surface:
    backgroundColor: '{colors.surface}'
    rounded: '{rounded.md}'
  badge-ai-agent:
    backgroundColor: '{colors.tertiary-container}'
    textColor: '{colors.tertiary}'
    rounded: '{rounded.pill}'
---

## Overview

PM Hub is an Operate surface (§30 of the brief): a coordination tool where
owners, PMs, developers and QA — human and AI agent alike — read status and
take quick actions many times a day, next to their IDE and terminal. Design
serves the task; familiarity beats novelty. The redesign (2026-09-16) kept the
app's existing token-based Angular Material 21 (M3) foundation and structural
patterns (`page-header`, `table-scroll`, `status-counts`, `kind-badge`,
`tab-nav`) — the gap it closed was that the app shipped on Material's stock,
unconfigured `violet` demo palette with several raw, unstyled screens. Full
detail lives in `apps/web/src/styles.scss`; this file records the decisions
so new screens land consistent without re-deriving them.

**THESIS:** A control room reads instantly — status, who (human or agent),
and freshness — without hunting, refusing both Material's out-of-the-box
demo look and Jira/Linear's cold sameness.
**OWN-WORLD:** Restrained neutral slate surfaces; one accent (azure) for
primary actions, current location and focus; a second accent (violet)
reserved exclusively for marking AI-agent presence.
**STORY:** A PM opens a project and immediately sees what needs attention.
**FIRST VIEWPORT:** Slim top bar (mark + primary nav + theme toggle +
session) over a max-1440px content column; project pages add a second-level
tab strip directly under the page header.
**FORM:** Operate "familiar tool" — top bar + content, no sidebar (kept from
the incumbent shell, which already fit).

## Colors

Material 3 tokens generated from `mat.$azure-palette` (primary) and
`mat.$violet-palette` (tertiary) via `mat.theme()`, `theme-type: color-scheme`
— every `--mat-sys-*` value is a CSS `light-dark()` pair that resolves off the
_used_ value of `color-scheme` on `<html>`. Default: the OS preference
(`color-scheme: light dark` in the stylesheet). `ThemeService`
(`src/app/core/theme.service.ts`) overrides it with an explicit inline
`light`/`dark` once a person picks the `.theme-toggle` in the app shell,
persisted in `localStorage` under `pmhybrid.theme`.

- **Primary (azure)** — primary buttons, the active nav item, links, focus
  rings, the current tab. Never decoration.
- **Tertiary (violet)** — exclusively `.kind-badge[data-kind='AI_AGENT']` and
  the brand mark's gradient. Do not reach for it anywhere else; introducing a
  second general-purpose accent would break the restrained strategy.
- **Secondary** — auto-derived from primary; used sparingly for the active
  primary-nav pill background (`surface-container` variants read better for
  most secondary surfaces than the secondary role itself).
- **Semantic**: `error` for destructive actions and alerts only.
  Status/priority colors (Kanban, project status, priority chips) use
  `data-*` attribute selectors against the M3 role tokens — see Components.
- **Neutral surface layers**: `surface` (page background) →
  `surface-container-low` (app header, login page ground) →
  `surface-container`/`-high`/`-highest` (nested panels, pills, hover) —
  tonal layering does the work shadows would elsewhere; elevation stays flat
  except transient overlays (dropdowns, the notifications panel).

## Typography

One family throughout (`$font-stack` in `styles.scss`): the system sans
stack, no separate display face — product UI per `impeccable/operate.md`.
M3's default type scale is used as-is (`plain-family`/`brand-family` both set
to `$font-stack`); do not hand-tune the ratio. `h1`–`h3` map to
`headline-small`/`title-medium`/`title-small` globally (`styles.scss`).
`font-variant-numeric: tabular-nums` on anything showing counts, percentages
or IDs next to each other in a column.

## Layout

- Density `-2` (`mat.theme()`'s `density` key) — table rows, form fields and
  buttons run tight; this is a deliberate "information density over
  decoration" choice (product principle in `PRODUCT.md`), not a default.
- Content column caps at 1440px, centered, `var(--space-6)` side padding
  (`.app-main` in `app-shell.scss`); pages do not set their own max-width.
- Responsive behavior is structural, not fluid type: `app-shell.scss`'s
  `@media (max-width: 720px)` wraps the primary nav to its own row and hides
  the signed-in name instead of shrinking text.
- Spacing scale is fixed rem steps (`--space-1` … `--space-12` in
  `styles.scss`), not a fluid clamp — consistent with Operate mode.

## Elevation & Depth

Mostly flat: tonal surface layering (see Colors) carries hierarchy instead of
shadows. The two exceptions are transient overlays that must read as
floating above content — the notifications panel and any future popover —
which use a real shadow (`0 4px 16px rgb(0 0 0 / 0.15)`), never a
zero-offset colored halo. `--mat-sys-level1`/`level2` exist for Material's
own internal component elevation (raised buttons, menus) and are not hand-
applied elsewhere.

## Shapes

- `--radius-sm` (6px) — buttons, nav pills, small controls.
- `--radius-md` (10px) — cards, panels, the login card.
- `999px` (pill) — status/kind/priority badges, the notifications count.
- Kanban cards, task cards and the login panel are the only bordered
  "card" surfaces in the app; everything else is a plain content region on
  the page's own surface tone. Do not wrap page sections in cards by default
  — that is the "same-size cards" scaffold this redesign moved away from.

## Components

- **`.page-header`** (`styles.scss`) — every feature page's title + optional
  description + right-aligned actions. Always the first element in a routed
  page's template.
- **`.tab-nav`** — the project-level second-level nav (Kanban / Progress /
  Documents / Conflicts / Audit), directly under a project page's header.
- **`.kind-badge[data-kind]`** — `HUMAN` uses neutral
  `surface-container-highest`; `AI_AGENT` uses `tertiary-container`. This is
  the one place tertiary appears; keep it that way so the color stays a
  reliable "this touched an agent" signal.
- **`.status-counts`** — compact pill row for status/permission-key lists.
- **`.table-scroll` + a scoped table class** (`.projects`, `.workload`, …) —
  every dense data table: sticky-free, horizontally scrollable on overflow,
  `.num` right-aligned tabular columns, a `.alert` modifier for an overdue/
  open-conflict cell.
- **`.theme-toggle`** (`app-shell.scss`) — icon-only button, inline SVG
  sun/moon (no icon font is installed in this project; do not add one for a
  single control). 36×36px, matches `.notifications__toggle`'s hit target.
- **Buttons**: `mat-flat-button` for the page's one primary action,
  `mat-stroked-button` for a secondary committed action, `mat-button` (text)
  for everything else including all "Cancel"/"Clear filters" actions. Do not
  mix a raised/elevated button in — flat is the ceiling here.
- **Empty states** name the action that fills them (e.g. "Todavía no hay
  notificaciones."), never a bare "Nothing here."

## Do's and Don'ts

- Do reserve tertiary (violet) for AI-agent identity only; do not use it as
  a second decorative accent.
- Do keep every page's first element a `.page-header`; do not invent a new
  page-title pattern per screen.
- Don't wrap dashboard/summary content in same-size icon+heading+text cards
  — this system reads as one continuous dense page, not a KPI-tile grid.
- Don't add a shadow to a static (non-overlay) surface — tonal layering
  carries that hierarchy here.
- Don't introduce a new icon system (font or SVG library) for one control;
  hand-authored inline SVG matches the rest of the app.
- All interface copy is Spanish, except: Kanban status values themselves
  (`PENDIENTE`/`ASIGNADA`/`EN_DESARROLLO`/`QA`/`TERMINADA`, written verbatim
  into the Roadmap per ADR-002) and proper nouns/method names (Kanban,
  Roadmap, Agentslog).
