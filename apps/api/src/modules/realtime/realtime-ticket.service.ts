import { randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';

interface TicketRecord {
  actorId: string;
  expiresAt: number;
}

/** Long enough for the client to open the socket after minting, short enough that a leaked ticket is worthless. */
export const TICKET_TTL_MS = 15_000;

/**
 * Short-lived, single-use tickets bridge JWT auth to the notifications
 * gateway's WS handshake (Roadmap GAP-26): a browser's WebSocket upgrade
 * request can't carry an `Authorization` header the way `JwtAuthGuard`
 * expects, so the client mints a ticket over a normal authenticated REST
 * call first, then redeems it once on connect. Never the access token
 * itself — a ticket leaking into a query-string log reveals nothing
 * reusable, unlike a bearer token would.
 */
@Injectable()
export class RealtimeTicketService {
  private readonly tickets = new Map<string, TicketRecord>();

  mint(actorId: string): string {
    this.pruneExpired();
    const ticket = randomBytes(32).toString('hex');
    this.tickets.set(ticket, {
      actorId,
      expiresAt: Date.now() + TICKET_TTL_MS,
    });
    return ticket;
  }

  /** Single-use: consuming deletes the record whether or not it was still valid. */
  consume(ticket: string): string | null {
    const record = this.tickets.get(ticket);
    this.tickets.delete(ticket);
    if (!record || record.expiresAt < Date.now()) {
      return null;
    }
    return record.actorId;
  }

  private pruneExpired(): void {
    const now = Date.now();
    for (const [ticket, record] of this.tickets) {
      if (record.expiresAt < now) {
        this.tickets.delete(ticket);
      }
    }
  }
}
