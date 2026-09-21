# ADR-012 — The API dev scripts compile through tsconfig.watch.json

- **Status:** CONFIRMED
- **Date:** 2026-09-17
- **Detailed in:** apps/api/tsconfig.watch.json, apps/api/package.json, .gitignore

## Decision

`apps/api dev`/`start:dev`/`start:debug` compile via a dedicated `tsconfig.watch.json` (outDir `dist-watch`), separate from `nest build`'s `dist`

## Reason

`nest-cli.json`'s `deleteOutDir: true` wipes the whole output directory at the start of every `nest`/`build` invocation; `nest build` (e.g. `pnpm -r build`, run routinely by this project's own tooling and CI-adjacent checks) run while `nest start --watch` was live repeatedly deleted the live process's own `dist/main.js` out from under it mid-restart, crashing the dev server with `MODULE_NOT_FOUND` — happened 3 times this session, reported by the user as the app "falling over often." Separate output directories make the two commands structurally unable to collide; stress-tested by running `pnpm -r build` against a live dev server, which now survives

---

This record is the row `ADR-012` of the decision table in [`docs/Stack_Tecnologies.md`](../Stack_Tecnologies.md), which stays the compact form; a change to the decision is made in the table and here together.
