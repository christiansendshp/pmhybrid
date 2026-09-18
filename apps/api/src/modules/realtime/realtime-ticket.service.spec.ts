import { describe, expect, it, vi } from 'vitest';
import {
  RealtimeTicketService,
  TICKET_TTL_MS,
} from './realtime-ticket.service.js';

describe('RealtimeTicketService', () => {
  it('mints a ticket that consumes back to the actor id exactly once', () => {
    const service = new RealtimeTicketService();
    const ticket = service.mint('actor-1');

    expect(service.consume(ticket)).toBe('actor-1');
    expect(service.consume(ticket)).toBeNull();
  });

  it('rejects an unknown ticket', () => {
    const service = new RealtimeTicketService();
    expect(service.consume('never-minted')).toBeNull();
  });

  it('rejects a ticket past its TTL', () => {
    vi.useFakeTimers();
    const service = new RealtimeTicketService();
    const ticket = service.mint('actor-1');

    vi.advanceTimersByTime(TICKET_TTL_MS + 1);

    expect(service.consume(ticket)).toBeNull();
    vi.useRealTimers();
  });

  it('mints distinct tickets for distinct actors, independently consumable', () => {
    const service = new RealtimeTicketService();
    const ticketA = service.mint('actor-a');
    const ticketB = service.mint('actor-b');

    expect(service.consume(ticketB)).toBe('actor-b');
    expect(service.consume(ticketA)).toBe('actor-a');
  });
});
