import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { DEMO_EMAIL, DEMO_PASSWORD } from './../prisma/demo-credentials.js';
import { createScratchDocsPath } from './helpers/scratch-docs.js';

describe('Dashboard (cross-project summary + activity, e2e — brief §14)', () => {
  let app: INestApplication<App>;
  let ownerToken: string;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
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

  it('reflects a newly created task in the summary counts and the activity feed', async () => {
    // A dedicated fresh actor, not demo-human: other e2e spec files run
    // concurrently against demo-human's own shared project set, which
    // would otherwise pollute a before/after diff on its dashboard totals.
    const uniqueEmail = `dashboard-${Date.now()}@pmhybrid.local`;
    await request(server())
      .post('/users')
      .set('Authorization', auth())
      .send({
        displayName: 'Dashboard Owner',
        email: uniqueEmail,
        password: 'dashboard12345',
      })
      .expect(201);
    const login = await request(server())
      .post('/auth/login')
      .send({ email: uniqueEmail, password: 'dashboard12345' })
      .expect(200);
    const ownToken = `Bearer ${login.body.accessToken}`;

    const summaryBefore = await request(server())
      .get('/dashboard/summary')
      .set('Authorization', ownToken)
      .expect(200);
    expect(summaryBefore.body.totalTasks).toBe(0);

    const project = await request(server())
      .post('/projects')
      .set('Authorization', ownToken)
      .send({
        name: `Dashboard E2E ${Date.now()}`,
        docsPath: createScratchDocsPath(),
      })
      .expect(201);
    const task = await request(server())
      .post(`/projects/${project.body.id}/tasks`)
      .set('Authorization', ownToken)
      .send({
        title: 'Dashboard visible task',
        acceptanceCriteria: 'Verified by e2e',
      })
      .expect(201);

    const summaryAfter = await request(server())
      .get('/dashboard/summary')
      .set('Authorization', ownToken)
      .expect(200);
    expect(summaryAfter.body.totalTasks).toBe(1);
    expect(summaryAfter.body.pendiente).toBe(1);
    expect(summaryAfter.body.activeProjects).toBe(1);

    const activity = await request(server())
      .get('/dashboard/activity')
      .set('Authorization', ownToken)
      .expect(200);
    expect(
      activity.body.recentlyModifiedTasks.some(
        (t: { id: string }) => t.id === task.body.id,
      ),
    ).toBe(true);
  });

  it('says which task a status change or an assignment is about, and where it lives, so the feed can link to it (Roadmap UX-03c2)', async () => {
    const email = `dashboard-links-${Date.now()}@pmhybrid.local`;
    await request(server())
      .post('/users')
      .set('Authorization', auth())
      .send({
        displayName: 'Dashboard Links',
        email,
        password: 'dashboard12345',
      })
      .expect(201);
    const login = await request(server())
      .post('/auth/login')
      .send({ email, password: 'dashboard12345' })
      .expect(200);
    const own = `Bearer ${login.body.accessToken}`;
    const project = await request(server())
      .post('/projects')
      .set('Authorization', own)
      .send({
        name: `Dashboard links ${Date.now()}`,
        docsPath: createScratchDocsPath(),
      })
      .expect(201);
    const agents = await request(server())
      .get('/agents')
      .set('Authorization', auth())
      .expect(200);
    const agentId = agents.body[0].id as string;
    await request(server())
      .post(`/projects/${project.body.id}/members`)
      .set('Authorization', own)
      .send({ actorId: agentId })
      .expect(201);
    const task = await request(server())
      .post(`/projects/${project.body.id}/tasks`)
      .set('Authorization', own)
      .send({
        title: 'A task to link to',
        acceptanceCriteria: 'Verified by e2e',
      })
      .expect(201);
    await request(server())
      .post(`/projects/${project.body.id}/tasks/${task.body.id}/assign`)
      .set('Authorization', own)
      .send({ actorId: agentId })
      .expect(201);
    await request(server())
      .post(`/projects/${project.body.id}/tasks/${task.body.id}/transition`)
      .set('Authorization', own)
      .send({ status: 'EN_DESARROLLO' })
      .expect(201);

    const activity = await request(server())
      .get('/dashboard/activity')
      .set('Authorization', own)
      .expect(200);

    expect(activity.body.recentStatusChanges).toHaveLength(1);
    expect(activity.body.recentStatusChanges[0].task).toMatchObject({
      id: task.body.id,
      title: 'A task to link to',
      projectId: project.body.id,
    });
    expect(activity.body.recentAssignments[0].task).toMatchObject({
      id: task.body.id,
      projectId: project.body.id,
    });

    // A removed task drops out of the feed instead of leaving a change nobody can open.
    await request(server())
      .delete(`/projects/${project.body.id}/tasks/${task.body.id}`)
      .set('Authorization', own)
      .expect(200);
    const after = await request(server())
      .get('/dashboard/activity')
      .set('Authorization', own)
      .expect(200);
    expect(after.body.recentStatusChanges).toEqual([]);
  });

  it('reports zeroed-out summary and empty activity for an actor with no project memberships', async () => {
    const uniqueEmail = `lonely-${Date.now()}@pmhybrid.local`;
    await request(server())
      .post('/users')
      .set('Authorization', auth())
      .send({
        displayName: 'Lonely',
        email: uniqueEmail,
        password: 'lonely12345',
      })
      .expect(201);
    const login = await request(server())
      .post('/auth/login')
      .send({ email: uniqueEmail, password: 'lonely12345' })
      .expect(200);

    const summary = await request(server())
      .get('/dashboard/summary')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .expect(200);
    expect(summary.body).toEqual({
      activeProjects: 0,
      totalTasks: 0,
      pendiente: 0,
      asignada: 0,
      enDesarrollo: 0,
      qa: 0,
      terminada: 0,
      blocked: 0,
      globalProgress: null,
    });
  });
});
