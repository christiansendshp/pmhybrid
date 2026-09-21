# ADR-013 — GitHubGitProvider is selected process-wide by GIT_PROVIDER_TYPE

- **Status:** CONFIRMED
- **Date:** 2026-09-18
- **Detailed in:** apps/api/src/modules/git-providers/{github-git-provider.service.ts,git-providers.module.ts}

## Decision

`GitHubGitProvider` (Roadmap GAP-23) is selected process-wide by `GIT_PROVIDER_TYPE` via a manual `new` in a Nest factory (not `useClass`/the `providers` array), and a GitHub-backed `Project.docsPath` holds an `"owner/repo"` or `"owner/repo/subpath"` slug instead of a local path; `Project.repoUrl` stays informational only

## Reason

`ProjectRepositoryProvider.readFile/writeFile/listRevisions` take only `(docsPath, relativePath)` — no `projectId`, no `repoUrl` — by design (brief §20's seam is meant to stay untouched), so a GitHub project's repo identity has to travel inside the one string the interface already threads through, and `docsPath` is it. Building both providers via Nest's `providers` array would eagerly construct `GitHubGitProvider` (and run its fail-fast `GITHUB_TOKEN` check) even on `local` deployments that never set the token; manual construction in the factory avoids that

---

This record is the row `ADR-013` of the decision table in [`docs/Stack_Tecnologies.md`](../Stack_Tecnologies.md), which stays the compact form; a change to the decision is made in the table and here together.
