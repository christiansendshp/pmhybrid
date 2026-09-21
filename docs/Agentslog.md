# Agents log

Append-only ledger and the source of truth for task ownership. Older
segments live in `docs/history/`.

## Entry format

```markdown
## [YYYY-MM-DDTHH:mm:ssZ] | agent | TASK-ID | IN_PROGRESS

- Summary: what the agent will do or did
- Files: paths or component names (optional)
- Verify: command and result, or "pending" (required for DONE)
- Pause: CATEGORY - detail (required for PAUSE)
```

## Previous segment

- Archive: `docs/history/Agentslog-20260921-001.md`
- SHA-256: `84367303778b51b1edbfc4c4cfedeb8a02d7622d90ff0e75073dd9dbadd6ac86`

## Entries

## [2026-09-16T11:56:43Z] | claude-sonnet-5 | GAP-20 foundation | IN_PROGRESS

- Summary: carried forward from docs/history/Agentslog-20260921-001.md at rotation

## [2026-09-16T12:01:23Z] | claude-sonnet-5 | GAP-20 dashboard | IN_PROGRESS

- Summary: carried forward from docs/history/Agentslog-20260921-001.md at rotation

## [2026-09-16T12:06:40Z] | claude-sonnet-5 | GAP-20 team | IN_PROGRESS

- Summary: carried forward from docs/history/Agentslog-20260921-001.md at rotation

## [2026-09-16T12:12:43Z] | claude-sonnet-5 | GAP-20 roles/audit/progress | IN_PROGRESS

- Summary: carried forward from docs/history/Agentslog-20260921-001.md at rotation

## [2026-09-16T12:16:08Z] | claude-sonnet-5 | GAP-20 copy pass 1 | IN_PROGRESS

- Summary: carried forward from docs/history/Agentslog-20260921-001.md at rotation

## [2026-09-16T12:20:30Z] | claude-sonnet-5 | GAP-20 kanban/task-form | IN_PROGRESS

- Summary: carried forward from docs/history/Agentslog-20260921-001.md at rotation

## [2026-09-16T12:22:55Z] | claude-sonnet-5 | GAP-20 task-detail | IN_PROGRESS

- Summary: carried forward from docs/history/Agentslog-20260921-001.md at rotation

## [2026-09-16T12:29:31Z] | claude-sonnet-5 | GAP-20 copy pass 2 | IN_PROGRESS

- Summary: carried forward from docs/history/Agentslog-20260921-001.md at rotation

## [2026-09-21T21:00:05Z] | claude | UX-02a | IN_PROGRESS

- Summary: The shell and the page overflow at 390 px: one-row header, scroll cues for the navigation and tables, no horizontal page scroll, Spanish nav label, layout check in the Playwright suite
- Verify: pending

## [2026-09-21T21:09:00Z] | claude | UX-02a | DONE

- Summary: The shell and the page overflow at 390 px: the header is two rows and 85 px instead of three and 105 (brand and actions, then the navigation), a bell with the unread count stands in for the word Notificaciones (still its accessible name), the signed-in name is dropped on a phone; the primary and project navs and every data table fade where they scroll on (ScrollCue writes data-scroll-more, a mask does the rest) and the navs scroll the active link into view; the add-member row wraps and the conflict diff wraps, so no route scrolls the page sideways at 360 or 390 px, which the Playwright suite now checks; the primary nav label is Spanish.
- Files: apps/web/src/app/shared/scroll-cue.ts,apps/web/src/app/layout/app-shell/app-shell.html,apps/web/src/app/layout/app-shell/app-shell.scss,apps/web/src/app/features/project-dashboard/project-dashboard.scss,apps/web/src/styles.scss,apps/web/a11y/mobile-layout.a11y.spec.ts,apps/web/DESIGN.md
- Verify: web unit 248 and eslint clean; Playwright a11y 41 pass (axe on every route, layout at 360 and 390 px); web build ok

## [2026-09-21T21:09:57Z] | claude | BUG-09 | IN_PROGRESS

- Summary: Read a rotated ledger whose pointer is relative to the repository root
- Verify: pending

## [2026-09-21T21:17:45Z] | claude | BUG-09 | DONE

- Summary: A rotated ledger is read whichever way its pointer is written: the archive path is tried as written and then without a leading docs/, because the latest skill's rotate writes docs/history/... from the repository root while files are read from the docs folder. The hash is still verified. Before, a DONE entry that had rotated out was never seen and a task completed before the rotation and taken out of the Roadmap raised a false 'row disappeared' conflict (GAP-38 did in this repository's own project).
- Files: apps/api/src/modules/synchronization/agentslog-ingestion.service.ts,apps/api/src/modules/synchronization/agentslog-ingestion.service.spec.ts,apps/api/test/synchronization.e2e-spec.ts,docs/synchronization.md
- Verify: api unit 455 and e2e 300 pass (coverage 88.0); api lint and nest build ok
