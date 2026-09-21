---
name: PM Hub
description: Dark-first Operate-mode developer console for humans and AI agents coordinating on shared project documents
colors:
  primary: 'light-dark(#006a6a, #00dddd)'
  on-primary: 'light-dark(#ffffff, #003737)'
  primary-container: 'light-dark(#00fbfb, #004f4f)'
  secondary: 'light-dark(#4a6363, #b0cccb)'
  secondary-container: 'light-dark(#cce8e7, #324b4b)'
  tertiary: 'light-dark(#964900, #ffb787)'
  tertiary-container: 'light-dark(#ffdcc7, #723600)'
  surface: 'light-dark(#f7faf9, #101414)'
  on-surface: 'light-dark(#191c1c, #e0e3e2)'
  surface-container-low: 'light-dark(#f1f4f3, #191c1c)'
  surface-container: 'light-dark(#ebefed, #1c2020)'
  surface-container-high: 'light-dark(#e6e9e7, #272b2a)'
  outline: 'light-dark(#6f7979, #889392)'
  outline-variant: 'light-dark(#bec9c8, #3f4948)'
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
  sm: '4px'
  md: '8px'
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
take quick actions many times a day, next to their IDE and terminal. This
redesign (2026-09-20, Roadmap GAP-33, decided in DEC-002) **replaces** the
2026-09-16 Material-demo-palette system rather than refining it: DEC-002
chose "replace everything" once GAP-32 (project lead assignment, human or AI
agent) closed. The prior azure/violet system is evidence of what this
product is, not authority over what it becomes — the token architecture
(`--mat-sys-*` CSS custom properties, `mat.theme()`, the shared classes
below) survives because it is sound infrastructure, but the identity it
expresses is new.

**THESIS:** A control room reads like the terminal beside it — legible state at a glance, not a demo palette wearing anyone's brand.

**OWN-WORLD:** A cooler, teal-cast graphite (not GAP-20's azure-derived one) with hairline-seam panels instead of borderless flat regions; cyan carries primary actions, focus and the current location (a syntax "keyword"/"type" hue in dark editor themes); orange is reserved exclusively for AI-agent identity, a syntax "flagged token" hue, maximally hue-distant from primary/error/secondary so it never reads as any of those.

**STORY:** A PM opens a page and reads status the way they read a diff — at a glance, unambiguous, source-of-truth first.

**FIRST VIEWPORT:** Slim seamed top bar (mark, primary nav, theme toggle, session) that persists across every route, over a max-1440px content column whose page header and tables are themselves seamed panels; project pages add a seamed tab strip under the header.

**FORM:** Operate "developer console" — top bar + content, no sidebar (kept from the incumbent shell, which already fit the brief and the audience's daily tool). Only the top bar is structurally persistent (the pre-existing `AppShell`, unchanged); page content is visually styled as seamed panels but is ordinary routed content, replaced wholesale on navigation like any Angular route — this system does not build independently-updating panes. Direction chosen via `concept-seed.mjs --scope direction --mode operate` (seed key `a6fe979b`): challenger 1, "dark-first developer console" (graphite ground, hairline seams, syntax-derived accents, panel-persistent navigation), fused against my own top-ranked grounded candidate (assigned index 4, "server rack / patch-panel inventory grammar") and won on both audience identification (this audience lives in dark IDEs/terminals daily; a rack aesthetic is a narrower ops/SRE reference) and product clarity (panels flex to PM Hub's varied content — kanban, tables, docs, forms — better than uniform rack slots). The challenger's "panel-persistent navigation" grammar was adopted only at the shell level (see FORM above), not built as independently-swapping content panes -- that would be a materially larger, out-of-scope change to the app's routing model.

## Colors

Material 3 tokens generated from `mat.$cyan-palette` (primary) and
`mat.$orange-palette` (tertiary) via `mat.theme()`, `theme-type:
color-scheme` — every `--mat-sys-*` value is a CSS `light-dark()` pair that
resolves off the _used_ value of `color-scheme` on `<html>`. Default: the
OS preference (`color-scheme: light dark` in the stylesheet).
`ThemeService` (`src/app/core/theme.service.ts`) overrides it with an
explicit inline `light`/`dark` once a person picks the `.theme-toggle` in
the app shell, persisted in `localStorage` under `pmhybrid.theme` — this
mechanism is unchanged by the redesign. The _authored_ scene is dark: a PM
or engineer glances at this hub many times a day beside a dark IDE and
terminal, often for late syncs or checking on agent-driven work after
hours — dark is the native resting state this system is designed against,
even though the light rendering (a faithfully derived companion, not an
afterthought) ships with equal support.

- **Primary (cyan)** — primary buttons, the active nav item, links, focus
  rings, the current tab. Never decoration. Chosen over GAP-20's azure
  deliberately, not kept by default: Angular Material's `mat.theme()` has
  no independent "neutral" key, so the whole surface/neutral scale is
  derived from the primary hue (`neutral: map.get($primary, neutral)` in
  its own source) — changing only the tertiary role while leaving primary
  untouched would have kept the exact same `#faf9fd`/`#121316` ground GAP-20
  shipped, which is a refinement, not the replacement DEC-002 decided.
  Rendered and read every cool-hued Material palette (`cyan`, `blue`,
  `green`, `spring-green`, `chartreuse`) before choosing: `blue`'s neutral
  was nearly indistinguishable from azure's (both blue-family); `green`/
  `spring-green`/`chartreuse` skewed the ground visibly olive and would
  have collided with the secondary-container "ACTIVE" status tone's own
  green-leaning cast. `cyan` was the one candidate that produced a
  genuinely different, cooler teal-cast graphite (`surface` resolves to
  `#f7faf9`/`#101414`) without tipping warm — the failure mode this session
  hit and rejected first was `orange`-as-primary, which produced exactly
  the "warm cream ground" the impeccable skill's own calibration section
  warns AI-generated interfaces default to.
- **Tertiary (orange)** — exclusively `.kind-badge[data-kind='AI_AGENT']`
  and the brand mark's gradient. Replaces violet (GAP-20). Do not reach for
  it anywhere else; introducing a second general-purpose accent would break
  the restrained strategy and dilute it as a reliable "this touched an
  agent" signal. Chosen for hue distance: cyan primary, red error and the
  teal-leaning secondary/status tones all sit far from orange on the hue
  wheel, so an agent badge is never mistakable for a status pill, a
  destructive action, or the current-location accent.
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
A console world does not need a monospace typeface to read as technical:
`font-variant-numeric: tabular-nums` already aligns figures in a
proportional face, so no second font family was introduced. M3's default
type scale is used as-is; do not hand-tune the ratio. `h1`–`h3` map to
`headline-small`/`title-medium`/`title-small` globally (`styles.scss`).
Table headers (`th`, global) are uppercase with `letter-spacing: 0.04em` —
the one typographic signature borrowed from the "panel headers in small
caps" system grammar, applied through a single shared selector so it
reaches every data table in the app without a per-page edit. Kanban column
headers (`.column__title`) get the same treatment — a column is a panel
too. Two narrow, accepted exceptions to "one family": `documents-viewer`'s
raw document/code pane and `team`'s inline API-key `<code>` both use a
system monospace stack — literal source content, not UI chrome, and the
category convention for both.

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

Mostly flat: tonal surface layering (see Colors) carries hierarchy instead
of shadows. Panels are told apart by a 1px `outline-variant` hairline seam
(`.page-header`, `.tab-nav`, `.table-scroll`, the app header — all global,
`styles.scss`/`app-shell.scss`) rather than by elevation; this is the one
concrete, load-bearing translation of the "dark-first developer console"
challenger's "graphite ground with panels distinguished by hairline seams"
grammar into this codebase. The two exceptions that still use a real shadow
are transient overlays that must read as floating above content — the
notifications panel and any future popover (`0 4px 16px rgb(0 0 0 / 0.15)`,
never a zero-offset colored halo). `--mat-sys-level1`/`level2` exist for
Material's own internal component elevation (raised buttons, menus) and are
not hand-applied elsewhere.

## Shapes

- `--radius-sm` (4px) — buttons, nav pills, small controls. Tightened from
  6px: a sharper corner reads more technical/console, less "soft app."
- `--radius-md` (8px) — cards, panels, the login card, `.table-scroll`.
  Tightened from 10px for the same reason.
- `999px` (pill) — status/kind/priority badges, the notifications count.
- Kanban cards, task cards and the login panel are the only bordered
  "card" surfaces in the app; everything else is a plain content region on
  the page's own surface tone, or a seamed panel (see Elevation & Depth).
  Do not wrap page sections in cards by default — that is the "same-size
  cards" scaffold this system stays away from.

## Components

- **`.page-header`** (`styles.scss`) — every feature page's title + optional
  description + right-aligned actions. Always the first element in a routed
  page's template. Now a seamed panel boundary: `border-bottom: 1px solid
var(--mat-sys-outline-variant)` under its padding, matching `.tab-nav`'s
  existing seam so every page opens on the same hairline grammar.
- **`.tab-nav`** — the project-level second-level nav (Kanban / Progress /
  Documents / Conflicts / Audit), directly under a project page's header.
- **`.kind-badge[data-kind]`** — `HUMAN` uses neutral
  `surface-container-highest`; `AI_AGENT` uses `tertiary-container`
  (orange, was violet). This is the one place tertiary appears; keep it
  that way so the color stays a reliable "this touched an agent" signal.
  The kind label text (`kindLabel()`) always accompanies the color, so the
  distinction is never color-only.
- **`.status-counts`** — compact pill row for status/permission-key lists;
  `.status-counts__alert` (error-container tones) marks a blocked/overdue
  count inside the same row.
- **`.status-badge[data-status]`** (global, `styles.scss`) — a bordered pill
  for a single entity's own status (project ACTIVE/PAUSED/ARCHIVED, actor
  ACTIVE/INACTIVE, API key ACTIVE/REVOKED). `ACTIVE` fills with
  `secondary-container`; every inactive/terminal state shares one neutral
  treatment — don't invent a new color per status name.
- **`.table-scroll` + a scoped table class** (`.projects`, `.workload`,
  `.team-table`, …) — every dense data table: `.table-scroll` (global,
  horizontal overflow only) now wraps its table in a `1px outline-variant`
  border and `--radius-md` corners, reading as one seamed console panel;
  `th` gets a `surface-container-low` band. `.num` right-aligned tabular
  columns, a `.alert` modifier for an overdue/open-conflict cell.
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

- Do reserve tertiary (orange) for AI-agent identity only; do not use it as
  a second decorative accent.
- Do keep every page's first element a `.page-header`; do not invent a new
  page-title pattern per screen.
- Don't wrap dashboard/summary content in same-size icon+heading+text cards
  — this system reads as one continuous dense page, not a KPI-tile grid.
- Don't add a shadow to a static (non-overlay) surface — tonal layering and
  hairline seams carry that hierarchy here.
- Don't introduce a new icon system (font or SVG library) for one control;
  hand-authored inline SVG matches the rest of the app.
- Don't introduce a monospace display face for the "console" feel —
  `tabular-nums` on the system sans already aligns figures; a second family
  would violate the one-family type rule for no legibility gain.
- All interface copy is Spanish, except: Kanban status values themselves
  (`PENDIENTE`/`ASIGNADA`/`EN_DESARROLLO`/`QA`/`TERMINADA`, written verbatim
  into the Roadmap per ADR-002) and proper nouns/method names (Kanban,
  Roadmap, Agentslog).
- The document is `lang="es"` and the app runs in `es-ES` (Roadmap UX-03a):
  dates are `d MMM y` or `d MMM y, HH:mm`, never a named `medium`/`short` format.
  A value the API sends as a code (an audit operation, an origin, a conflict
  kind, a priority, a ledger state) is never printed raw: it goes through
  `core/labels.ts` (`{{ value | label: 'operation' }}`), whose fallback turns an
  unnamed code into a sentence instead of SCREAMING_SNAKE.

## Rollout status (Roadmap GAP-33/GAP-34)

This redesign ships per-surface, closing and re-claiming a Roadmap entry
per surface rather than one long-lived entry (see `TECH_DEBT-02` for why).

**Landed:**

- The global token foundation (`styles.scss`) and the shared `AppShell`
  (top bar, nav, theme toggle, notifications, brand mark) — GAP-33. Every
  routed page inherits the new tokens and shared classes automatically
  through `--mat-sys-*` custom properties and the unchanged `.page-header`/
  `.tab-nav`/`.table-scroll`/`.kind-badge`/`.status-badge`/`.status-counts`
  class vocabulary, with two narrow tertiary-exclusivity leaks fixed
  (`kanban.scss`'s `.priority[data-priority='HIGH']`, `documents-viewer.scss`'s
  search `mark` highlight — both pre-existing, harmless under GAP-20's
  violet, a collision with the AI-agent badge once tertiary became orange).
- `kanban.scss` — GAP-34, first per-page slice. `.column` gained a
  hairline-seam border (columns now read as seamed panels, consistent with
  `.table-scroll`); `.column__title` gained the same uppercase/tracked
  treatment as `th` (a column header is a panel header); `.card__bar`'s
  stray `2px` radius moved onto the documented `--radius-sm` token (same
  rendered result — a 4px-tall bar fully rounds at either value — now
  detector-clean).

**Remaining:** verify and, where a page has other bespoke component-level
styling beyond the shared classes, bring it in line with the seamed-panel
grammar surface by surface. A visual/detector audit of the other ~13 pages
found most already fully consistent through the shared vocabulary alone
(confirmed for login, team, my-projects, task-detail, workload, audit-log,
dashboard, documents-viewer) — GAP-34 tracks only the surfaces that
actually need a bespoke-styling pass, not a fixed 14-page checklist.
