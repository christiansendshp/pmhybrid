# ADR-015 — Live notifications are pushed over WebSockets

- **Status:** CONFIRMED
- **Date:** 2026-09-18
- **Detailed in:** apps/api/src/modules/realtime/, apps/web/src/app/core/realtime.service.ts, docs/permissions.md

## Decision

Roadmap GAP-26 picks **WebSockets for live notification push** as the first of the three brief-§27/§29 subsystems (over GitHub webhook ingestion or an MCP server); `NotificationsGateway` (`apps/api/src/modules/realtime/`) is wired with the plain `ws` package via `onApplicationBootstrap`/`HttpAdapterHost`, not `@nestjs/websockets`' `@WebSocketGateway()` decorator; the WS handshake authenticates with a short-lived single-use ticket minted over a normal `JwtAuthGuard` REST call, not a raw token in the query string

## Reason

Two independent in-repo signals already pointed at WebSockets specifically: `docs/architecture.md` already named "a future WebSocket gateway" as the reason `@nestjs/event-emitter` was wired up, and `docs/Features.md` already listed "notifications have no push" as a known limitation — webhooks and MCP have no equivalent existing groundwork or documented gap, so this is a "most coherent with the system" pick under AGENTS.md's missing-definition rule, not an arbitrary one; webhooks and MCP become their own future GAPs (GAP-29, GAP-30). `@WebSocketGateway()` makes Nest probe for a default adapter (socket.io) during _every_ app's `.init()` — including all 21 pre-existing e2e specs' in-memory `TestingModule` apps, which never call `.listen()` or set an adapter — and `process.exit(1)`s the whole test process when socket.io isn't installed (confirmed by trying it first); a hand-wired `ws.WebSocketServer` attached only to the app's own HTTP server sidesteps that scanning entirely. A raw access token in a WS query string would land in ordinary server/proxy access logs; a 15-second single-use ticket minted just before connecting is worthless once logged

---

This record is the row `ADR-015` of the decision table in [`docs/Stack_Tecnologies.md`](../Stack_Tecnologies.md), which stays the compact form; a change to the decision is made in the table and here together.
