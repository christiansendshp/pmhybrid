import type { IncomingMessage } from 'node:http';
import { describe, expect, it, vi } from 'vitest';
import { NotificationsGateway } from './notifications.gateway.js';
import { RealtimeTicketService } from './realtime-ticket.service.js';

function fakeSocket() {
  return {
    readyState: 1,
    OPEN: 1,
    close: vi.fn(),
    send: vi.fn(),
  };
}

function fakeRequest(url: string): IncomingMessage {
  return { url } as unknown as IncomingMessage;
}

function fakePrisma(activeActorIds: Set<string>) {
  return {
    actor: {
      findUnique: vi.fn(({ where: { id } }: { where: { id: string } }) =>
        Promise.resolve(activeActorIds.has(id) ? { id, isActive: true } : null),
      ),
    },
  };
}

/** None of these tests call onApplicationBootstrap(), so the real HttpAdapterHost is never touched. */
function createGateway(ticketService: RealtimeTicketService, prisma: unknown) {
  return new NotificationsGateway(ticketService, prisma as never, {} as never);
}

describe('NotificationsGateway (Roadmap GAP-26)', () => {
  it('closes the connection when the ticket is missing or invalid', async () => {
    const ticketService = new RealtimeTicketService();
    const gateway = createGateway(ticketService, fakePrisma(new Set()));
    const socket = fakeSocket();

    await gateway.handleConnection(socket as never, fakeRequest('/realtime'));

    expect(socket.close).toHaveBeenCalledWith(4001, expect.any(String));
  });

  it('closes the connection when the actor behind a valid ticket is inactive', async () => {
    const ticketService = new RealtimeTicketService();
    const ticket = ticketService.mint('actor-1');
    const gateway = createGateway(ticketService, fakePrisma(new Set()));
    const socket = fakeSocket();

    await gateway.handleConnection(
      socket as never,
      fakeRequest(`/realtime?ticket=${ticket}`),
    );

    expect(socket.close).toHaveBeenCalledWith(4003, expect.any(String));
  });

  it('registers the socket for an active actor and pushes to it', async () => {
    const ticketService = new RealtimeTicketService();
    const ticket = ticketService.mint('actor-1');
    const gateway = createGateway(
      ticketService,
      fakePrisma(new Set(['actor-1'])),
    );
    const socket = fakeSocket();

    await gateway.handleConnection(
      socket as never,
      fakeRequest(`/realtime?ticket=${ticket}`),
    );
    await gateway.pushToActor('actor-1', { type: 'notifications.changed' });

    expect(socket.send).toHaveBeenCalledWith(
      JSON.stringify({ type: 'notifications.changed' }),
    );
  });

  it('never sends to an actor with no open socket', async () => {
    const ticketService = new RealtimeTicketService();
    const gateway = createGateway(
      ticketService,
      fakePrisma(new Set(['actor-1'])),
    );

    await expect(
      gateway.pushToActor('actor-1', { type: 'notifications.changed' }),
    ).resolves.toBeUndefined();
  });

  it('stops pushing to a socket after it disconnects', async () => {
    const ticketService = new RealtimeTicketService();
    const ticket = ticketService.mint('actor-1');
    const prisma = fakePrisma(new Set(['actor-1']));
    const gateway = createGateway(ticketService, prisma);
    const socket = fakeSocket();

    await gateway.handleConnection(
      socket as never,
      fakeRequest(`/realtime?ticket=${ticket}`),
    );
    gateway.handleDisconnect(socket as never);
    await gateway.pushToActor('actor-1', { type: 'notifications.changed' });

    expect(socket.send).not.toHaveBeenCalled();
  });

  it('skips a socket that is no longer OPEN rather than sending into a closing connection', async () => {
    const ticketService = new RealtimeTicketService();
    const ticket = ticketService.mint('actor-1');
    const gateway = createGateway(
      ticketService,
      fakePrisma(new Set(['actor-1'])),
    );
    const socket = fakeSocket();
    socket.readyState = 3; // CLOSED

    await gateway.handleConnection(
      socket as never,
      fakeRequest(`/realtime?ticket=${ticket}`),
    );
    await gateway.pushToActor('actor-1', { type: 'notifications.changed' });

    expect(socket.send).not.toHaveBeenCalled();
  });
});
