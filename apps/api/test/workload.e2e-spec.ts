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
      (r: { task: { id: string } }) => r.task.id === task.body.id,
    );
    expect(row).toBeDefined();
    expect(row.actor.id).toBe(agentId);
    expect(row.actor.kind).toBe('AI_AGENT');
    expect(row.status).toBe('ASIGNADA');

    const byProject = await request(server())
      .get(`/workload?projectId=${projectId}`)
      .set('Authorization', auth())
      .expect(200);
    expect(byProject.body.every((r: { project: { id: string } }) => r.project.id === projectId)).toBe(
      true,
    );

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
});
