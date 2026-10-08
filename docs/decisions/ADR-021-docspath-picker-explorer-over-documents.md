# ADR-021 — The docsPath picker is a folder explorer over the user's Documents

- **Status:** CONFIRMED
- **Date:** 2026-10-08
- **Detailed in:** apps/api/src/modules/git-providers/host-mounts.ts, apps/api/src/modules/git-providers/filesystem-browser.service.ts, apps/api/src/modules/projects/projects.service.ts, apps/web/src/app/shared/folder-browser-dialog/, docker-compose.prod.yml, docs/permissions.md, docs/deployment.md

## Decision

Roadmap UX-05 (DEC-003: the docsPath folder picker as a normal explorer over the user's Documents): the API container mounts the user's Documents folder (`DOCUMENTS_DIR`) read-write at `/data/documents`, a third allowed root next to `/data/projects` and `/data/extra-docs`; the picker browses it freely as a folder explorer (quick access to each root, the way from the root as clickable steps, a path field, a filter) with every path shown as the user knows it through a `PROJECT_DOCS_HOST_MOUNTS` map of `container|host` pairs, and a path typed the Windows way is read through the same map; the allowed roots remain the only confinement of the browser and of every stored `docsPath`, and the stored value stays the container path

## Reason

Missing definitions this ADR resolves: (1) _scope_ — chosen by the user, asked in the session, over the whole C: drive (which gives back the exposure SECURITY-01 closed and write access to the whole drive) and over improving the modal alone: Documents covers every project of the user and nothing else of the machine is mounted; (2) _read-write_ — the write-back of the Roadmap writes into the projects' folders, so a read-only mount would break it; (3) _one folder, one identity_ — a folder inside Documents that is also mounted as `/data/extra-docs` is reachable by two container paths, and the SECURITY-01 check that keeps a project off another team's folder (`docsPath is not available`) compared container paths, so a second way in would have got round it; the map gives both ways of naming one folder the same key (`folderKey`), judged on the path as the user knows it; (4) _the roots stay the safeguard_ — the map only translates: a typed path is mapped to a container path first and then confined to the roots like any other (`..` included), and the real location is checked as before, so the map adds no reach; (5) _what is stored_ — the container path, which is what the API reads and what existing projects hold (SMARTHR keeps `/data/extra-docs`); the picker shows the user's path and hands back the container one; (6) _the cost, recorded here_ — everything inside Documents is within the reach of any actor who can create a project, the caveat `docs/permissions.md` already makes for any allowed root

---

This record is the row `ADR-021` of the decision table in [`docs/Stack_Tecnologies.md`](../Stack_Tecnologies.md), which stays the compact form; a change to the decision is made in the table and here together.
