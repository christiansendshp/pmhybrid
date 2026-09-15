import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { DEMO_EMAIL, DEMO_PASSWORD } from './../prisma/demo-credentials.js';
import { createScratchDocsPath } from './helpers/scratch-docs.js';

describe('Workload ("¿quién está haciendo qué?", e2e — brief §18)', () => {
  let app: INestApplication<App>;
  let ownerToken: string;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: DEMO_EMAIL, password: DEMO_PASSWORD })
      .expect(200);
    ownerToken = login.body.accessToken;
  });

  afterEach(async () => {
    await app.close();
  });

  const server = () => app.getHttpServer();
  const auth = () => `Bearer ${ownerToken}`;

  it('lists an assigned task as a workload row and supports project/status/actor filters', async () => {
    const project = await request(server())
      .post('/projects')
      .set('Authorization', auth())
      .send({ name: `Workload E2E ${Date.now()}`, docsPath: createScratchDocsPath() })
      .expect(201);
    const projectId = project.body.id;

    const agents = await request(server()).get('/agents').set('Authorization', auth()).expect(200);
    const agentId = agents.body[0].id;
    await request(server())
      .post(`/projects/${projectId}/members`)
      .set('Authorization', auth())
      .send({ actorId: agentId })
      .expect(201);

    const task = await request(server())
      .post(`/projects/${projectId}/tasks`)
      .set('Authorization', auth())
      .send({ title: 'Workload visible task', acceptanceCriteria: 'Verified by e2e' })
      .expect(201);
    await request(server())
      .post(`/projects/${projectId}/tasks/${task.body.id}/assign`)
      .set('Authorization', auth())
      .send({ actorId: agentId })
      .expect(201);

    const unfiltered = await request(server())
      .get('/workload')
      .set('Authorization', auth())
      .expect(200);
    const row = unfiltered.body.find(
      (r: { task: { id: string } | null }) => r.task?.id === task.body.id,
    );
    expect(row).toBeDefined();
    expect(row.actor.id).toBe(agentId);
    expect(row.actor.kind).toBe('AI_AGENT');
    expect(row.status).toBe('ASIGNADA');

    const byProject = await request(server())
      .get(`/workload?projectId=${projectId}`)
      .set('Authorization', auth())
      .expect(200);
    // Idle rows (an active member with nothing assigned) carry no project.
    expect(
      byProject.body.every(
        (r: { project: { id: string } | null }) => r.project === null || r.project.id === projectId,
      ),
    ).toBe(true);

    const byWrongStatus = await request(server())
      .get(`/workload?projectId=${projectId}&status=QA`)
      .set('Authorization', auth())
      .expect(200);
    expect(byWrongStatus.body.some((r: { task: { id: string } }) => r.task.id === task.body.id)).toBe(
      false,
    );

    const byActor = await request(server())
      .get(`/workload?actorId=${agentId}`)
      .set('Authorization', auth())
      .expect(200);
    expect(byActor.body.every((r: { actor: { id: string } }) => r.actor.id === agentId)).toBe(true);
  });

  it('denies filtering by a project the actor is not a member of', async () => {
    const foreignProject = await request(server())
      .post('/projects')
      .set('Authorization', auth())
      .send({ name: `Foreign ${Date.now()}`, docsPath: createScratchDocsPath() })
      .expect(201);

    const uniqueEmail = `outsider-workload-${Date.now()}@pmhybrid.local`;
    await request(server())
      .post('/users')
      .set('Authorization', auth())
      .send({ displayName: 'Outsider', email: uniqueEmail, password: 'outsider12345' })
      .expect(201);
    const login = await request(server())
      .post('/auth/login')
      .send({ email: uniqueEmail, password: 'outsider12345' })
      .expect(200);

    await request(server())
      .get(`/workload?projectId=${foreignProject.body.id}`)
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .expect(403);
  });

  it('lists every active member, idle ones included, and filters by phase, epic and actor kind', async () => {
    const project = await request(server())
      .post('/projects')
      .set('Authorization', auth())
      .send({ name: `Workload filters ${Date.now()}`, docsPath: createScratchDocsPath() })
      .expect(201);
    const projectId = project.body.id as string;
    const post = (path: string, body: object) =>
      request(server()).post(`/projects/${projectId}/${path}`).set('Authorization', auth()).send(body);
    const workload = async (query: string) =>
      (
        await request(server())
          .get(`/workload?projectId=${projectId}${query ? `&${query}` : ''}`)
          .set('Authorization', auth())
          .expect(200)
      ).body as {
        actor: { id: string; kind: string };
        task: { id: string } | null;
        status: string | null;
      }[];

    const agents = await request(server()).get('/agents').set('Authorization', auth()).expect(200);
    const agentId = agents.body[0].id as string;
    const idle = await request(server())
      .post('/users')
      .set('Authorization', auth())
      .send({
        displayName: 'Idle Human',
        email: `idle-${Date.now()}@pmhybrid.local`,
        password: 'idlehuman12345',
      })
      .expect(201);
    await post('members', { actorId: agentId }).expect(201);
    await post('members', { actorId: idle.body.id }).expect(201);

    const phase = await post('phases', { name: 'Build', order: 1 }).expect(201);
    const epic = await post('epics', { name: 'API', order: 1, phaseId: phase.body.id }).expect(201);
    const otherEpic = await post('epics', { name: 'Docs', order: 2 }).expect(201);
    const task = await post('tasks', {
      title: 'Agent work in Build',
      acceptanceCriteria: 'Reviewed',
      phaseId: phase.body.id,
      epicId: epic.body.id,
    }).expect(201);
    await post(`tasks/${task.body.id}/assign`, { actorId: agentId }).expect(201);

    const everyone = await workload('');
    expect(everyone.some((row) => row.task?.id === task.body.id)).toBe(true);
    expect(everyone).toContainEqual(
      expect.objectContaining({ actor: expect.objectContaining({ id: idle.body.id }), task: null, status: null }),
    );
    // A busy actor gets no idle row.
    expect(everyone.some((row) => row.actor.id === agentId && row.task === null)).toBe(false);

    // Task filters narrow the view to tasks, so idle rows drop out.
    const inPhase = await workload(`phaseId=${phase.body.id}`);
    expect(inPhase.map((row) => row.task?.id)).toEqual([task.body.id]);
    expect(await workload(`epicId=${otherEpic.body.id}`)).toEqual([]);

    const agentsOnly = await workload('kind=AI_AGENT');
    expect(agentsOnly.length).toBeGreaterThan(0);
    expect(agentsOnly.every((row) => row.actor.kind === 'AI_AGENT')).toBe(true);
    const humansOnly = await workload('kind=HUMAN');
    expect(humansOnly.some((row) => row.actor.id === idle.body.id)).toBe(true);
    expect(humansOnly.every((row) => row.actor.kind === 'HUMAN')).toBe(true);
    await request(server())
      .get(`/workload?kind=ROBOT`)
      .set('Authorization', auth())
      .expect(400);

    // Only active actors are listed as idle.
    await request(server())
      .patch(`/users/${idle.body.id}`)
      .set('Authorization', auth())
      .send({ isActive: false })
      .expect(200);
    expect((await workload('')).some((row) => row.actor.id === idle.body.id)).toBe(false);
  });
});
