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
 * fix to GET /notifications (actor from the JWT, never a query param), the
 * exclusion of whoever directly triggered a run (their own "Sync now"
 * response already told them), and mark-read. Sync-failure specifically
 * also verifies the real bug this GAP fixed: a failed sync's whole
 * reconciliation transaction — including the SyncRun row itself — used to
 * roll back, so nothing was ever persisted.
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

  async function addMember(projectId: string, actorId: string) {
    await request(server())
      .post(`/projects/${projectId}/members`)
      .set('Authorization', auth())
      .send({ actorId })
      .expect(201);
  }

  it('rejects GET /notifications without a token', async () => {
    await request(server()).get('/notifications').expect(401);
  });

  it('notifies other active members of a conflict-raising sync, excludes whoever triggered it, and never reaches a non-member', async () => {
    const docsPath = createScratchDocsPath();
    writeFileSync(
      path.join(docsPath, 'Roadmap.md'),
      roadmapWithActiveRow('| PMH-N1 | Vanishes silently | check | TODO | — | — |'),
      'utf-8',
    );
    const projectId = await createProjectAt(docsPath);
    const member = await createUser();
    await addMember(projectId, member.id);

    await request(server()).post(`/projects/${projectId}/sync`).set('Authorization', auth()).expect(201);
    // The row disappears with no terminal Agentslog entry — a conflict.
    writeFileSync(path.join(docsPath, 'Roadmap.md'), roadmapWithActiveRow('| — | — | — | — | — | — |'), 'utf-8');
    const syncRun = await request(server())
      .post(`/projects/${projectId}/sync`)
      .set('Authorization', auth()) // the owner triggers it
      .expect(201);
    expect(syncRun.body.summary.conflictsRaised).toBe(1);
    const syncRunId = syncRun.body.id as string;

    // The owner triggered this run themselves — their own response already
    // told them what happened, so they get no notification for THIS run
    // (the demo owner is shared and reused across the whole e2e suite, so
    // scope by syncRunId rather than asserting an absence of the type).
    const ownerNotifications = await request(server())
      .get('/notifications')
      .set('Authorization', auth())
      .expect(200);
    expect(
      ownerNotifications.body.some((n: { payload: { syncRunId?: string } }) => n.payload?.syncRunId === syncRunId),
    ).toBe(false);

    // The other active member, who did not trigger it, does get one.
    const memberNotifications = await request(server())
      .get('/notifications')
      .set('Authorization', auth(member.token))
      .expect(200);
    const raised = memberNotifications.body.find(
      (n: { payload: { syncRunId?: string } }) => n.payload?.syncRunId === syncRunId,
    );
    expect(raised).toBeDefined();
    expect(raised.type).toBe('CONFLICTS_DETECTED');
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

  it('persists a FAILED sync run and notifies other members, where it used to vanish entirely', async () => {
    const projectId = await createProjectAt('/nonexistent/docs/path/that/cannot/be/read');
    const member = await createUser();
    await addMember(projectId, member.id);

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
    const syncRunId = runs.body[0].id as string;

    // The owner triggered this run — no notification for THIS run (the
    // demo owner is shared/reused across the e2e suite, so scope by
    // syncRunId rather than asserting an absence of the type).
    const ownerNotifications = await request(server())
      .get('/notifications')
      .set('Authorization', auth())
      .expect(200);
    expect(
      ownerNotifications.body.some((n: { payload: { syncRunId?: string } }) => n.payload?.syncRunId === syncRunId),
    ).toBe(false);

    const memberNotifications = await request(server())
      .get('/notifications')
      .set('Authorization', auth(member.token))
      .expect(200);
    const failure = memberNotifications.body.find(
      (n: { payload: { syncRunId?: string } }) => n.payload?.syncRunId === syncRunId,
    );
    expect(failure).toBeDefined();
    expect(failure.type).toBe('SYNC_FAILED');
  });

  it("marks a notification read, idempotently, and refuses to mark someone else's", async () => {
    const docsPath = createScratchDocsPath();
    writeFileSync(
      path.join(docsPath, 'Roadmap.md'),
      roadmapWithActiveRow('| PMH-N3 | Vanishes thrice | check | TODO | — | — |'),
      'utf-8',
    );
    const projectId = await createProjectAt(docsPath);
    const member = await createUser();
    await addMember(projectId, member.id);

    // The MEMBER triggers this one, so the OWNER — a non-triggering active
    // member — is the one who receives (and here marks read) a notification.
    await request(server())
      .post(`/projects/${projectId}/sync`)
      .set('Authorization', auth(member.token))
      .expect(201);
    writeFileSync(path.join(docsPath, 'Roadmap.md'), roadmapWithActiveRow('| — | — | — | — | — | — |'), 'utf-8');
    const syncRun = await request(server())
      .post(`/projects/${projectId}/sync`)
      .set('Authorization', auth(member.token))
      .expect(201);
    const syncRunId = syncRun.body.id as string;

    const before = await request(server()).get('/notifications').set('Authorization', auth()).expect(200);
    // The demo owner is shared/reused across the e2e suite, so find this
    // test's own notification by syncRunId rather than assuming body[0].
    const own = before.body.find((n: { payload: { syncRunId?: string } }) => n.payload?.syncRunId === syncRunId);
    expect(own).toBeDefined();
    const notificationId = own.id as string;

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
