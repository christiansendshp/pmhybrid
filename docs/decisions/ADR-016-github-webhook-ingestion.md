# ADR-016 — GitHub webhook ingestion

- **Status:** CONFIRMED
- **Date:** 2026-09-18
- **Detailed in:** apps/api/src/modules/github-webhook/, apps/api/test/github-webhook.e2e-spec.ts, docs/permissions.md

## Decision

Roadmap GAP-29 (**GitHub webhook ingestion**, picked next after GAP-26 over GAP-30's MCP server — see `docs/Roadmap.md`) adds `POST /webhooks/github`, authenticated only by an `X-Hub-Signature-256` HMAC over `req.rawBody` (`rawBody: true` in `main.ts`), with a single combined precondition — reject (503) if `GITHUB_WEBHOOK_SECRET` is unset — rather than an added `GIT_PROVIDER_TYPE=github` guard; a matched `push` calls `SynchronizationService.runSync(projectId, 'WEBHOOK')` (new `SyncTrigger` enum value) per project whose `docsPath` names the pushed repo, without awaiting it, catching and logging each project's failure independently (mirrors `SyncSchedulerService.tick()`) instead of failing the whole delivery

## Reason

Missing definitions this ADR resolves: (1) _why no provider-mode guard_ — a `local`-provider project's `docsPath` is a filesystem path, which can never equal or prefix a GitHub `owner/repo` full name, so an unmatched repository already triggers zero syncs without a second check; one precondition is simpler than two that mostly overlap. (2) _how a repo maps to a project_ — prefix-matched against `docsPath` in JS, not a Prisma `startsWith` (`LIKE 'value%'`): Postgres treats `\` as the default LIKE escape character, so a `full_name`/docsPath containing `\`, `%`, or `_` (all valid in a GitHub org/repo name, and in this repo's own Windows-path e2e fixtures) silently mismatched — caught by `github-webhook.e2e-spec.ts` returning 0 matches against an exact-string docsPath before the fix. (3) _response semantics on a matched project's sync failure_ — logged, not thrown, so one bad project can't turn a webhook 200 into a 500 (which would make GitHub retry-storm a delivery whose failure is already durably recorded as its own `SyncRun`) and can't block a sibling matched project in the same delivery. (4) _why the response doesn't await the sync_ — under `GIT_PROVIDER_TYPE=github`, `runLocked` makes 8+ sequential `api.github.com` calls per project and can block on a `pg_advisory_xact_lock` a concurrent scheduled tick already holds; awaiting that (times every matched project) risked exceeding GitHub's ~10s delivery timeout and showing a failed delivery for a sync that actually succeeded. The response reports only how many projects matched; each sync's real outcome is its own `SyncRun`, checked the same way a scheduled/manual run's is (`docs/synchronization.md` "Trigger")

---

This record is the row `ADR-016` of the decision table in [`docs/Stack_Tecnologies.md`](../Stack_Tecnologies.md), which stays the compact form; a change to the decision is made in the table and here together.
