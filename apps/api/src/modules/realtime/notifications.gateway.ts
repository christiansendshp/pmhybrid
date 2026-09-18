import type { IncomingMessage } from 'node:http';
import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import type { RealtimeMessage } from '@pmhybrid/shared-types';
import { WebSocket, WebSocketServer } from 'ws';
import { PrismaService } from '../../prisma/prisma.service.js';
import { RealtimeTicketService } from './realtime-ticket.service.js';

const CLOSE_INVALID_TICKET = 4001;
const CLOSE_INACTIVE_ACTOR = 4003;

/**
 * Push side of the notifications flow (Roadmap GAP-26, docs/architecture.md
 * "side effects that may lag... hang off event-emitter events"). Recipient
 * selection and payload shape stay in `NotificationsService` — this only
 * forwards a lightweight "go refetch" signal to that actor's open sockets,
 * so the REST list endpoint (`GET /notifications`) stays the one source of
 * truth for notification content; no parallel payload path to keep in sync.
 *
 * Wired with the plain `ws` package via `onApplicationBootstrap` rather than
 * `@nestjs/websockets`' `@WebSocketGateway()`: that decorator makes Nest
 * probe for a default adapter (socket.io) during *every* app's `.init()`,
 * including every existing e2e spec's in-memory `TestingModule` app that
 * never calls `.listen()` and never set one — and `process.exit(1)`s the
 * whole test process when socket.io isn't installed. Attaching our own
 * `WebSocketServer` here shares the app's existing HTTP server (via
 * `HttpAdapterHost`, same as `main.ts`'s real server) without touching
 * Nest's gateway-scanning machinery at all, so every unrelated e2e spec
 * stays unaffected.
 */
@Injectable()
export class NotificationsGateway
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(NotificationsGateway.name);
  private readonly socketsByActor = new Map<string, Set<WebSocket>>();
  private readonly actorBySocket = new Map<WebSocket, string>();
  private wss: WebSocketServer | null = null;

  constructor(
    private readonly ticketService: RealtimeTicketService,
    private readonly prisma: PrismaService,
    private readonly httpAdapterHost: HttpAdapterHost,
  ) {}

  onApplicationBootstrap(): void {
    const httpServer = this.httpAdapterHost.httpAdapter?.getHttpServer();
    if (!httpServer) {
      return;
    }
    this.wss = new WebSocketServer({ server: httpServer, path: '/realtime' });
    this.wss.on('connection', (client: WebSocket, request: IncomingMessage) => {
      void this.handleConnection(client, request);
      client.on('close', () => this.handleDisconnect(client));
    });
  }

  onModuleDestroy(): void {
    this.wss?.close();
  }

  async handleConnection(
    client: WebSocket,
    request: IncomingMessage,
  ): Promise<void> {
    const ticket = new URL(request.url ?? '', 'ws://realtime').searchParams.get(
      'ticket',
    );
    const actorId = ticket ? this.ticketService.consume(ticket) : null;
    if (!actorId) {
      this.logger.warn(
        'Rejected a WS connection with an invalid or expired ticket',
      );
      client.close(CLOSE_INVALID_TICKET, 'invalid or expired ticket');
      return;
    }
    const actor = await this.prisma.actor.findUnique({
      where: { id: actorId },
    });
    if (!actor?.isActive) {
      this.logger.warn(
        `Rejected a WS connection for inactive actor ${actorId}`,
      );
      client.close(CLOSE_INACTIVE_ACTOR, 'actor is not active');
      return;
    }

    this.actorBySocket.set(client, actorId);
    const sockets = this.socketsByActor.get(actorId) ?? new Set<WebSocket>();
    sockets.add(client);
    this.socketsByActor.set(actorId, sockets);
  }

  handleDisconnect(client: WebSocket): void {
    const actorId = this.actorBySocket.get(client);
    this.actorBySocket.delete(client);
    if (!actorId) {
      return;
    }
    const sockets = this.socketsByActor.get(actorId);
    if (!sockets) {
      return;
    }
    sockets.delete(client);
    if (sockets.size === 0) {
      this.socketsByActor.delete(actorId);
    }
  }

  /** Re-checks isActive on every push (ADR-008's per-request re-check, adapted for a socket that can outlive a deactivation) rather than trusting the connect-time check indefinitely. */
  async pushToActor(actorId: string, message: RealtimeMessage): Promise<void> {
    const sockets = this.socketsByActor.get(actorId);
    if (!sockets || sockets.size === 0) {
      return;
    }
    const actor = await this.prisma.actor.findUnique({
      where: { id: actorId },
    });
    if (!actor?.isActive) {
      return;
    }
    const payload = JSON.stringify(message);
    for (const socket of sockets) {
      if (socket.readyState === socket.OPEN) {
        socket.send(payload);
      }
    }
  }
}
