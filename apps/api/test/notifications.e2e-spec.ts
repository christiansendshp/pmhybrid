import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
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

/**
 * Internal notifications (brief §29, Roadmap GAP-13). Covers both events
 * (a conflict-raising sync, and a sync that fails outright), the security
 * fix to GET /notifications (actor from the JWT, never a query param), and
 * mark-read. Sync-failure specifically also verifies the real bug this GAP
 * fixed: a failed sync's whole reconciliation transaction — including the
 * SyncRun row itself — used to roll back, so nothing was ever persisted.
 */
describe('Internal notifications (e2e)', () => {
  let app: INestApplication<App>;
  let ownerToken: string;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    const login = await request(server())
      .post('/auth/login')
      .send({ email: DEMO_EMAIL, password: DEMO_PASSWORD })
      .expect(200);
    ownerToken = login.body.accessToken;
  });

  afterEach(async () => {
    await app.close();
  });

  const server = () => app.getHttpServer();
  const auth = (token = ownerToken) => `Bearer ${token}`;
  const unique = (label: string) => `${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

  async function createProjectAt(docsPath: string) {
    const res = await request(server())
      .post('/projects')
      .set('Authorization', auth())
      .send({ name: unique('Notif E2E'), docsPath })
      .expect(201);
    return res.body.id as string;
  }

  async function createUser() {
    const email = `${unique('notif-member')}@pmhybrid.local`;
    const res = await request(server())
      .post('/users')
      .set('Authorization', auth())
      .send({ displayName: 'Notif tester', email, password: 'password123' })
      .expect(201);
    const login = await request(server())
      .post('/auth/login')
      .send({ email, password: 'password123' })
      .expect(200);
    return { id: res.body.id as string, token: login.body.accessToken as string };
  }

  it('rejects GET /notifications without a token, and each actor only ever sees their own', async () => {
    await request(server()).get('/notifications').expect(401);

    const docsPath = createScratchDocsPath();
    writeFileSync(
      path.join(docsPath, 'Roadmap.md'),
      roadmapWithActiveRow('| PMH-N1 | Vanishes silently | check | TODO | — | — |'),
      'utf-8',
    );
    const projectId = await createProjectAt(docsPath);
    await request(server()).post(`/projects/${projectId}/sync`).set('Authorization', auth()).expect(201);

    // The row disappears with no terminal Agentslog entry — a conflict.
    writeFileSync(path.join(docsPath, 'Roadmap.md'), roadmapWithActiveRow('| — | — | — | — | — | — |'), 'utf-8');
    const syncRun = await request(server())
      .post(`/projects/${projectId}/sync`)
      .set('Authorization', auth())
      .expect(201);
    expect(syncRun.body.summary.conflictsRaised).toBe(1);

    const ownerNotifications = await request(server())
      .get('/notifications')
      .set('Authorization', auth())
      .expect(200);
    const raised = ownerNotifications.body.find((n: { type: string }) => n.type === 'CONFLICTS_DETECTED');
    expect(raised).toBeDefined();
    expect(raised.payload.conflictsRaised).toBe(1);
    expect(raised.readAt).toBeNull();

    // A non-member's own list never contains this project's notification.
    const stranger = await createUser();
    const strangerNotifications = await request(server())
      .get('/notifications')
      .set('Authorization', auth(stranger.token))
      .expect(200);
    expect(strangerNotifications.body).toEqual([]);
  });

  it('notifies every active project member, not just the requester', async () => {
    const docsPath = createScratchDocsPath();
    writeFileSync(
      path.join(docsPath, 'Roadmap.md'),
      roadmapWithActiveRow('| PMH-N2 | Vanishes too | check | TODO | — | — |'),
      'utf-8',
    );
    const projectId = await createProjectAt(docsPath);
    const member = await createUser();
    await request(server())
      .post(`/projects/${projectId}/members`)
      .set('Authorization', auth())
      .send({ actorId: member.id })
      .expect(201);

    await request(server()).post(`/projects/${projectId}/sync`).set('Authorization', auth()).expect(201);
    writeFileSync(path.join(docsPath, 'Roadmap.md'), roadmapWithActiveRow('| — | — | — | — | — | — |'), 'utf-8');
    await request(server()).post(`/projects/${projectId}/sync`).set('Authorization', auth()).expect(201);

    const memberNotifications = await request(server())
      .get('/notifications')
      .set('Authorization', auth(member.token))
      .expect(200);
    expect(
      memberNotifications.body.some((n: { type: string }) => n.type === 'CONFLICTS_DETECTED'),
    ).toBe(true);
  });

  it('persists a FAILED sync run and notifies members, where it used to vanish entirely', async () => {
    const projectId = await createProjectAt('/nonexistent/docs/path/that/cannot/be/read');

    await request(server()).post(`/projects/${projectId}/sync`).set('Authorization', auth()).expect(500);

    const runs = await request(server())
      .get(`/projects/${projectId}/sync-runs`)
      .set('Authorization', auth())
      .expect(200);
    expect(runs.body).toHaveLength(1);
    expect(runs.body[0].status).toBe('FAILED');
    expect(runs.body[0].summary.error).toBeTruthy();
    // Never leaks a stack trace or raw error object into a Json column any member can read.
    expect(typeof runs.body[0].summary.error).toBe('string');

    const notifications = await request(server())
      .get('/notifications')
      .set('Authorization', auth())
      .expect(200);
    const failure = notifications.body.find((n: { type: string }) => n.type === 'SYNC_FAILED');
    expect(failure).toBeDefined();
    expect(failure.payload.syncRunId).toBe(runs.body[0].id);
  });

  it('marks a notification read, idempotently, and refuses to mark someone else\'s', async () => {
    const docsPath = createScratchDocsPath();
    writeFileSync(
      path.join(docsPath, 'Roadmap.md'),
      roadmapWithActiveRow('| PMH-N3 | Vanishes thrice | check | TODO | — | — |'),
      'utf-8',
    );
    const projectId = await createProjectAt(docsPath);
    await request(server()).post(`/projects/${projectId}/sync`).set('Authorization', auth()).expect(201);
    writeFileSync(path.join(docsPath, 'Roadmap.md'), roadmapWithActiveRow('| — | — | — | — | — | — |'), 'utf-8');
    await request(server()).post(`/projects/${projectId}/sync`).set('Authorization', auth()).expect(201);

    const before = await request(server()).get('/notifications').set('Authorization', auth()).expect(200);
    const notificationId = before.body[0].id as string;

    const marked = await request(server())
      .patch(`/notifications/${notificationId}/read`)
      .set('Authorization', auth())
      .expect(200);
    expect(marked.body.readAt).not.toBeNull();

    // Idempotent — marking again doesn't error or clear it.
    const markedAgain = await request(server())
      .patch(`/notifications/${notificationId}/read`)
      .set('Authorization', auth())
      .expect(200);
    expect(markedAgain.body.readAt).not.toBeNull();

    const stranger = await createUser();
    await request(server())
      .patch(`/notifications/${notificationId}/read`)
      .set('Authorization', auth(stranger.token))
      .expect(404);
  });

  it('404s marking an unknown notification id read', async () => {
    await request(server())
      .patch('/notifications/00000000-0000-0000-0000-000000000000/read')
      .set('Authorization', auth())
      .expect(404);
  });
});
