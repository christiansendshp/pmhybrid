import { writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import WebSocket from 'ws';
import { AppModule } from './../src/app.module.js';
import { MAX_CLIENT_MESSAGE_BYTES } from './../src/modules/realtime/notifications.gateway.js';
import { DEMO_EMAIL, DEMO_PASSWORD } from './../prisma/demo-credentials.js';
import { createScratchDocsPath } from './helpers/scratch-docs.js';

const ACTIVE_HEADER = `| ID | Outcome | Acceptance check | Status | Owner | Depends on |
| --- | --- | --- | --- | --- | --- |`;

function roadmapWithActiveRow(row: string): string {
  return `# Roadmap

## Active work

${ACTIVE_HEADER}
${row}

## Near term

| ID | Outcome | Acceptance check | Status | Depends on |
| --- | --- | --- | --- | --- |
| — | — | — | — | — |

## Blocked

| ID | Blocker | Needed decision or event | Owner |
| --- | --- | --- | --- |
| — | — | — | — |
`;
}

function onceMessage(client: WebSocket, timeoutMs = 5000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('Timed out waiting for a WS message')),
      timeoutMs,
    );
    client.once('message', (data) => {
      clearTimeout(timer);
      resolve(JSON.parse(data.toString()));
    });
  });
}

function onceClose(client: WebSocket, timeoutMs = 5000): Promise<number> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('Timed out waiting for a close event')),
      timeoutMs,
    );
    client.once('close', (code) => {
      clearTimeout(timer);
      resolve(code);
    });
  });
}

function onceOpen(client: WebSocket, timeoutMs = 5000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('Timed out waiting to open')),
      timeoutMs,
    );
    client.once('open', () => {
      clearTimeout(timer);
      resolve();
    });
    client.once('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

/**
 * Push side of the notifications flow (Roadmap GAP-26): a real `ws` client
 * against a real bound port (unlike every other e2e spec here, which stays
 * in-process via supertest — a WebSocket upgrade needs an actual listening
 * server), covering the ticket handshake and the end-to-end push triggered
 * by a real conflict-raising sync.
 */
describe('Realtime notifications gateway (e2e)', () => {
  let app: INestApplication<App>;
  let ownerToken: string;
  let wsUrl: string;
  const openSockets: WebSocket[] = [];

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
    await app.listen(0);
    const port = (app.getHttpServer().address() as AddressInfo).port;
    wsUrl = `ws://127.0.0.1:${port}/realtime`;

    const login = await request(server())
      .post('/auth/login')
      .send({ email: DEMO_EMAIL, password: DEMO_PASSWORD })
      .expect(200);
    ownerToken = login.body.accessToken;
  });

  afterEach(async () => {
    for (const socket of openSockets) {
      socket.terminate();
    }
    openSockets.length = 0;
    await app.close();
  });

  const server = () => app.getHttpServer();
  const auth = (token = ownerToken) => `Bearer ${token}`;
  const unique = (label: string) =>
    `${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

  async function mintTicket(token: string): Promise<string> {
    const res = await request(server())
      .post('/realtime/ticket')
      .set('Authorization', `Bearer ${token}`)
      .expect(201);
    return res.body.ticket as string;
  }

  function connect(ticket: string): WebSocket {
    const socket = new WebSocket(`${wsUrl}?ticket=${ticket}`);
    openSockets.push(socket);
    return socket;
  }

  it('rejects a connection with no ticket', async () => {
    const socket = connect('');
    await expect(onceClose(socket)).resolves.toBe(4001);
  });

  it('rejects a connection with a garbage ticket', async () => {
    const socket = connect('not-a-real-ticket');
    await expect(onceClose(socket)).resolves.toBe(4001);
  });

  it('closes a connection that sends a frame larger than the limit (Roadmap SECURITY-04b1)', async () => {
    const socket = connect(await mintTicket(ownerToken));
    await onceOpen(socket);

    socket.send('x'.repeat(MAX_CLIENT_MESSAGE_BYTES + 1));

    // 1009: message too big.
    await expect(onceClose(socket)).resolves.toBe(1009);
  });

  it('rejects a ticket that was already redeemed once', async () => {
    const ticket = await mintTicket(ownerToken);
    const first = connect(ticket);
    await onceOpen(first);

    const second = connect(ticket);
    await expect(onceClose(second)).resolves.toBe(4001);
  });

  it('accepts a connection opened with a freshly minted ticket', async () => {
    const ticket = await mintTicket(ownerToken);
    const socket = connect(ticket);
    await expect(onceOpen(socket)).resolves.toBeUndefined();
  });

  it('pushes a notifications.changed message to a connected member when a sync raises a conflict', async () => {
    const docsPath = createScratchDocsPath();
    writeFileSync(
      path.join(docsPath, 'Roadmap.md'),
      roadmapWithActiveRow(
        '| PMH-WS1 | Vanishes silently | check | TODO | — | — |',
      ),
      'utf-8',
    );
    const project = await request(server())
      .post('/projects')
      .set('Authorization', auth())
      .send({ name: unique('Realtime E2E'), docsPath })
      .expect(201);
    const projectId = project.body.id as string;

    const memberEmail = `${unique('ws-member')}@pmhybrid.local`;
    const memberRes = await request(server())
      .post('/users')
      .set('Authorization', auth())
      .send({
        displayName: 'WS member',
        email: memberEmail,
        password: 'password123',
      })
      .expect(201);
    const memberLogin = await request(server())
      .post('/auth/login')
      .send({ email: memberEmail, password: 'password123' })
      .expect(200);
    const memberToken = memberLogin.body.accessToken as string;
    await request(server())
      .post(`/projects/${projectId}/members`)
      .set('Authorization', auth())
      .send({ actorId: memberRes.body.id })
      .expect(201);

    const ticket = await mintTicket(memberToken);
    const memberSocket = connect(ticket);
    await onceOpen(memberSocket);
    const nextMessage = onceMessage(memberSocket);

    // Owner triggers both sync runs, so only the member (who did not) gets notified.
    await request(server())
      .post(`/projects/${projectId}/sync`)
      .set('Authorization', auth())
      .expect(201);
    writeFileSync(
      path.join(docsPath, 'Roadmap.md'),
      roadmapWithActiveRow('| — | — | — | — | — | — |'),
      'utf-8',
    );
    await request(server())
      .post(`/projects/${projectId}/sync`)
      .set('Authorization', auth())
      .expect(201);

    await expect(nextMessage).resolves.toEqual({
      type: 'notifications.changed',
    });
  });
});
