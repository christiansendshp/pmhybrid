import { appendFileSync } from 'node:fs';
import path from 'node:path';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { DEMO_EMAIL, DEMO_PASSWORD } from './../prisma/demo-credentials.js';
import { createScratchDocsPath } from './helpers/scratch-docs.js';

interface AuditEventBody {
  id: string;
  projectId: string;
  entityType: string;
  entityId: string;
  operation: string;
  origin: string;
  occurredAt: string;
  previousValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
  actor: { id: string; displayName: string; kind: string } | null;
}

describe('Audit trail (brief §25 — e2e)', () => {
  let app: INestApplication<App>;
  let ownerToken: string;
  let projectId: string;
  let docsPath: string;

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

    docsPath = createScratchDocsPath();
    const project = await request(server())
      .post('/projects')
      .set('Authorization', auth())
      .send({ name: `Audit E2E ${Date.now()}`, docsPath })
      .expect(201);
    projectId = project.body.id;
  });

  afterEach(async () => {
    await app.close();
  });

  const server = () => app.getHttpServer();
  const auth = (token = ownerToken) => `Bearer ${token}`;

  async function auditTrail(query = ''): Promise<AuditEventBody[]> {
    const res = await request(server())
      .get(`/projects/${projectId}/audit?${query}`)
      .set('Authorization', auth())
      .expect(200);
    return res.body;
  }

  async function createUser(label: string) {
    const slug = label.toLowerCase().replace(/\W+/g, '-');
    const email = `${slug}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@pmhybrid.local`;
    const user = await request(server())
      .post('/users')
      .set('Authorization', auth())
      .send({ displayName: label, email, password: 'password123' })
      .expect(201);
    return { id: user.body.id as string, email };
  }

  it('records project creation, a settings update with only the changed fields, and hierarchy creation', async () => {
    await request(server())
      .patch(`/projects/${projectId}`)
      .set('Authorization', auth())
      .send({ name: 'Renamed project', syncIntervalMinutes: 5 })
      .expect(200);
    await request(server())
      .post(`/projects/${projectId}/phases`)
      .set('Authorization', auth())
      .send({ name: 'Phase A', order: 1 })
      .expect(201);

    const projectEvents = await auditTrail('entityType=Project');
    expect(projectEvents.map((e) => e.operation).sort()).toEqual(['CREATE', 'UPDATE']);
    const update = projectEvents.find((e) => e.operation === 'UPDATE')!;
    // syncIntervalMinutes was sent but unchanged (default 5) — never audited.
    expect(update.newValue).toEqual({ name: 'Renamed project' });
    expect(update.previousValue).toEqual({ name: expect.stringContaining('Audit E2E') });
    expect(update.origin).toBe('UI');
    expect(update.actor?.displayName).toBeTruthy();

    const phaseEvents = await auditTrail('entityType=Phase');
    expect(phaseEvents).toHaveLength(1);
    expect(phaseEvents[0].newValue).toEqual({ name: 'Phase A', order: 1 });
  });

  it('audits task creation, a field update, a progress-only change, and skips a no-op PATCH', async () => {
    const task = await request(server())
      .post(`/projects/${projectId}/tasks`)
      .set('Authorization', auth())
      .send({ title: 'Audited task', acceptanceCriteria: 'Verified by e2e' })
      .expect(201);
    const taskId = task.body.id as string;

    await request(server())
      .patch(`/projects/${projectId}/tasks/${taskId}`)
      .set('Authorization', auth())
      .send({ title: 'Audited task v2' })
      .expect(200);
    await request(server())
      .patch(`/projects/${projectId}/tasks/${taskId}`)
      .set('Authorization', auth())
      .send({ progressPercent: 40 })
      .expect(200);
    await request(server())
      .patch(`/projects/${projectId}/tasks/${taskId}`)
      .set('Authorization', auth())
      .send({ title: 'Audited task v2', progressPercent: 40 })
      .expect(200);

    const events = await auditTrail(`entityType=Task&entityId=${taskId}`);
    const byOperation = (operation: string) => events.filter((e) => e.operation === operation);

    expect(byOperation('CREATE')).toHaveLength(1);
    expect(byOperation('CREATE')[0].newValue).toEqual({
      title: 'Audited task',
      acceptanceCriteria: 'Verified by e2e',
    });
    // Creation and the title edit reach the Roadmap; the progress change does not.
    expect(byOperation('WRITE_BACK').map((e) => e.newValue?.trigger)).toEqual([
      'FIELD_EDIT',
      'CREATED',
    ]);
    expect(byOperation('UPDATE')).toHaveLength(1);
    expect(byOperation('UPDATE')[0].previousValue).toEqual({ title: 'Audited task' });
    expect(byOperation('UPDATE')[0].newValue).toEqual({ title: 'Audited task v2' });
    expect(byOperation('PROGRESS_CHANGE')).toHaveLength(1);
    expect(byOperation('PROGRESS_CHANGE')[0].newValue).toEqual({ progressPercent: 40 });
    // Newest first.
    expect(events[0].operation).toBe('PROGRESS_CHANGE');
  });

  it('audits membership and role changes, and treats repeated grants as no-ops', async () => {
    const user = await createUser('Audited member');
    const roles = await request(server()).get('/roles').set('Authorization', auth()).expect(200);
    const developerRole = roles.body.find((r: { name: string }) => r.name === 'DEVELOPER');

    await request(server())
      .post(`/projects/${projectId}/members`)
      .set('Authorization', auth())
      .send({ actorId: user.id })
      .expect(201);
    await request(server())
      .post(`/projects/${projectId}/members`)
      .set('Authorization', auth())
      .send({ actorId: user.id })
      .expect(201);
    const grant = await request(server())
      .post(`/projects/${projectId}/roles`)
      .set('Authorization', auth())
      .send({ actorId: user.id, roleId: developerRole.id })
      .expect(201);
    await request(server())
      .post(`/projects/${projectId}/roles`)
      .set('Authorization', auth())
      .send({ actorId: user.id, roleId: developerRole.id })
      .expect(201);
    await request(server())
      .delete(`/projects/${projectId}/roles/${grant.body.id}`)
      .set('Authorization', auth())
      .expect(200);
    await request(server())
      .delete(`/projects/${projectId}/members/${user.id}`)
      .set('Authorization', auth())
      .expect(200);

    const memberEvents = await auditTrail('entityType=ProjectMember');
    // The creator's own membership is part of project CREATE, not a MEMBER_ADD.
    expect(memberEvents.map((e) => e.operation)).toEqual(['MEMBER_REMOVE', 'MEMBER_ADD']);
    expect(memberEvents[1].newValue).toMatchObject({ actorId: user.id, kind: 'HUMAN' });

    const roleEvents = await auditTrail('entityType=ActorRole');
    expect(roleEvents.map((e) => e.operation)).toEqual(['ROLE_REVOKE', 'ROLE_ASSIGN']);
    expect(roleEvents[1].newValue).toMatchObject({ actorId: user.id, roleName: 'DEVELOPER' });
    expect(roleEvents[0].previousValue).toMatchObject({ roleName: 'DEVELOPER' });
  });

  it('rejects an unknown role instead of failing on a foreign key', async () => {
    const user = await createUser('No role');
    await request(server())
      .post(`/projects/${projectId}/roles`)
      .set('Authorization', auth())
      .send({ actorId: user.id, roleId: 'no-such-role' })
      .expect(400);
  });

  it('audits a manual sync run, surfaces an agent\'s Agentslog activity on the task, and pages with a cursor', async () => {
    const task = await request(server())
      .post(`/projects/${projectId}/tasks`)
      .set('Authorization', auth())
      .send({ title: 'Synced task', acceptanceCriteria: 'Verified by e2e' })
      .expect(201);
    // An agent working outside PM Hub logs progress against the task's Roadmap ID.
    appendFileSync(
      path.join(docsPath, 'Agentslog.md'),
      `\n## [2026-09-15T10:00:00Z] | Codex | ${task.body.externalId} | IN_PROGRESS\n\n` +
        '- Summary: Started the synced task\n- Files: src/app.ts\n- Verify: pnpm test\n- Follow-up: none\n',
      'utf-8',
    );
    await request(server())
      .post(`/projects/${projectId}/sync`)
      .set('Authorization', auth())
      .expect(201);

    // The scheduler may also have synced this fresh project — only the manual run is asserted.
    const manualRuns = (await auditTrail('entityType=SyncRun')).filter(
      (e) => e.newValue?.trigger === 'MANUAL',
    );
    expect(manualRuns).toHaveLength(1);
    expect(manualRuns[0].operation).toBe('SYNC_RUN');
    expect(manualRuns[0].origin).toBe('SYNC');
    expect(manualRuns[0].actor).not.toBeNull();

    const detail = await request(server())
      .get(`/projects/${projectId}/tasks/${task.body.id}`)
      .set('Authorization', auth())
      .expect(200);
    expect(detail.body.agentLogEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ agentName: 'Codex', statusWord: 'IN_PROGRESS' }),
      ]),
    );

    const all = await auditTrail();
    expect(all.length).toBeGreaterThan(2);
    const firstPage = await auditTrail('limit=1');
    const secondPage = await auditTrail(`limit=1&cursor=${firstPage[0].id}`);
    expect(firstPage[0].id).toBe(all[0].id);
    expect(secondPage[0].id).toBe(all[1].id);
  });

  it('records origin: API for a write authenticated with X-API-Key, and origin: UI for a person (Roadmap GAP-24)', async () => {
    const agent = await request(server())
      .post('/agents')
      .set('Authorization', auth())
      .send({ displayName: `Audit Agent ${Date.now()}`, providerType: 'custom' })
      .expect(201);
    const minted = await request(server())
      .post(`/agents/${agent.body.id}/keys`)
      .set('Authorization', auth())
      .send({})
      .expect(201);
    await request(server())
      .post(`/projects/${projectId}/members`)
      .set('Authorization', auth())
      .send({ actorId: agent.body.id })
      .expect(201);

    await request(server())
      .post(`/projects/${projectId}/tasks`)
      .set('X-API-Key', minted.body.key)
      .send({ title: 'Task via API key', acceptanceCriteria: 'Verified by e2e' })
      .expect(201);
    await request(server())
      .post(`/projects/${projectId}/tasks`)
      .set('Authorization', auth())
      .send({ title: 'Task via JWT', acceptanceCriteria: 'Verified by e2e' })
      .expect(201);

    const events = await auditTrail('entityType=Task&operation=CREATE');
    const viaKey = events.find((e) => e.newValue?.title === 'Task via API key');
    const viaJwt = events.find((e) => e.newValue?.title === 'Task via JWT');
    expect(viaKey?.origin).toBe('API');
    expect(viaJwt?.origin).toBe('UI');
  });

  it('validates filters and denies the trail to non-members', async () => {
    await request(server())
      .get(`/projects/${projectId}/audit?origin=BOGUS`)
      .set('Authorization', auth())
      .expect(400);
    await request(server())
      .get(`/projects/${projectId}/audit?limit=0`)
      .set('Authorization', auth())
      .expect(400);

    const outsider = await createUser('Outsider');
    const login = await request(server())
      .post('/auth/login')
      .send({ email: outsider.email, password: 'password123' })
      .expect(200);
    await request(server())
      .get(`/projects/${projectId}/audit`)
      .set('Authorization', auth(login.body.accessToken))
      .expect(403);
  });
});
