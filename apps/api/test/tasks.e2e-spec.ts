import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { DEMO_EMAIL, DEMO_PASSWORD } from './../prisma/demo-credentials.js';
import { createScratchDocsPath } from './helpers/scratch-docs.js';

describe('Tasks (hierarchy, assignment, transitions, dependencies, progress — e2e)', () => {
  let app: INestApplication<App>;
  let ownerToken: string;
  let projectId: string;
  let developerActorId: string;
  let developerEmail: string;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    const server = app.getHttpServer();

    const login = await request(server)
      .post('/auth/login')
      .send({ email: DEMO_EMAIL, password: DEMO_PASSWORD })
      .expect(200);
    ownerToken = login.body.accessToken;

    const project = await request(server)
      .post('/projects')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: `Tasks E2E ${Date.now()}`, docsPath: createScratchDocsPath() })
      .expect(201);
    projectId = project.body.id;

    // A member with a role that does NOT carry task.reassign.locked, to
    // exercise the EN_DESARROLLO lock's negative case (brief §7 / scenario 9).
    developerEmail = `developer-${Date.now()}@pmhybrid.local`;
    const developer = await request(server)
      .post('/users')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ displayName: 'Dev', email: developerEmail, password: 'developer123' })
      .expect(201);
    developerActorId = developer.body.id;

    await request(server)
      .post(`/projects/${projectId}/members`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ actorId: developerActorId })
      .expect(201);

    const roles = await request(server)
      .get('/roles')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    const developerRole = roles.body.find((r: { name: string }) => r.name === 'DEVELOPER');

    await request(server)
      .post(`/projects/${projectId}/roles`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ actorId: developerActorId, roleId: developerRole.id })
      .expect(201);
  });

  afterEach(async () => {
    await app.close();
  });

  const server = () => app.getHttpServer();
  const auth = (token: string) => `Bearer ${token}`;

  it('creates a task, a subtask, assigns it (PENDIENTE -> ASIGNADA), and progresses it through the Kanban', async () => {
    const task = await request(server())
      .post(`/projects/${projectId}/tasks`)
      .set('Authorization', auth(ownerToken))
      .send({ title: 'Parent task' })
      .expect(201);
    expect(task.body.status).toBe('PENDIENTE');

    const subtask = await request(server())
      .post(`/projects/${projectId}/tasks`)
      .set('Authorization', auth(ownerToken))
      .send({ title: 'Subtask', parentTaskId: task.body.id, progressPercent: 40 })
      .expect(201);

    const assigned = await request(server())
      .post(`/projects/${projectId}/tasks/${task.body.id}/assign`)
      .set('Authorization', auth(ownerToken))
      .send({ actorId: developerActorId })
      .expect(201);
    expect(assigned.body.status).toBe('ASIGNADA');
    expect(assigned.body.assigneeActorId).toBe(developerActorId);

    await request(server())
      .post(`/projects/${projectId}/tasks/${task.body.id}/transition`)
      .set('Authorization', auth(ownerToken))
      .send({ status: 'EN_DESARROLLO' })
      .expect(201);

    const detail = await request(server())
      .get(`/projects/${projectId}/tasks/${task.body.id}`)
      .set('Authorization', auth(ownerToken))
      .expect(200);
    expect(detail.body.status).toBe('EN_DESARROLLO');
    // Parent has one subtask at 40% and no explicit progressPercent of its own -> rollup = 40.
    expect(detail.body.computedProgress).toBe(40);
    expect(detail.body.subtasks).toHaveLength(1);
    expect(detail.body.subtasks[0].id).toBe(subtask.body.id);
  });

  it('rejects an illegal status transition', async () => {
    const task = await request(server())
      .post(`/projects/${projectId}/tasks`)
      .set('Authorization', auth(ownerToken))
      .send({ title: 'Illegal jump' })
      .expect(201);

    await request(server())
      .post(`/projects/${projectId}/tasks/${task.body.id}/transition`)
      .set('Authorization', auth(ownerToken))
      .send({ status: 'TERMINADA' })
      .expect(400);
  });

  it('locks the assignee once EN_DESARROLLO — a DEVELOPER cannot reassign, an OWNER can (brief §7 / scenario 9)', async () => {
    const server_ = server();
    const task = await request(server_)
      .post(`/projects/${projectId}/tasks`)
      .set('Authorization', auth(ownerToken))
      .send({ title: 'Locked task' })
      .expect(201);

    await request(server_)
      .post(`/projects/${projectId}/tasks/${task.body.id}/assign`)
      .set('Authorization', auth(ownerToken))
      .send({ actorId: developerActorId })
      .expect(201);
    await request(server_)
      .post(`/projects/${projectId}/tasks/${task.body.id}/transition`)
      .set('Authorization', auth(ownerToken))
      .send({ status: 'EN_DESARROLLO' })
      .expect(201);

    const developerLogin = await request(server_)
      .post('/auth/login')
      .send({ email: developerEmail, password: 'developer123' })
      .expect(200);
    const developerToken = developerLogin.body.accessToken as string;

    await request(server_)
      .post(`/projects/${projectId}/tasks/${task.body.id}/assign`)
      .set('Authorization', auth(developerToken))
      .send({ actorId: developerActorId })
      .expect(403);

    const reassigned = await request(server_)
      .post(`/projects/${projectId}/tasks/${task.body.id}/assign`)
      .set('Authorization', auth(ownerToken))
      .send({ actorId: developerActorId })
      .expect(201);
    expect(reassigned.body.status).toBe('EN_DESARROLLO');
  });

  it('detects a dependency cycle and rejects it', async () => {
    const taskA = await request(server())
      .post(`/projects/${projectId}/tasks`)
      .set('Authorization', auth(ownerToken))
      .send({ title: 'A' })
      .expect(201);
    const taskB = await request(server())
      .post(`/projects/${projectId}/tasks`)
      .set('Authorization', auth(ownerToken))
      .send({ title: 'B' })
      .expect(201);

    // B depends on A
    await request(server())
      .post(`/projects/${projectId}/tasks/${taskB.body.id}/dependencies`)
      .set('Authorization', auth(ownerToken))
      .send({ dependsOnTaskId: taskA.body.id })
      .expect(201);

    // A depends on B would close the cycle A -> B -> A
    await request(server())
      .post(`/projects/${projectId}/tasks/${taskA.body.id}/dependencies`)
      .set('Authorization', auth(ownerToken))
      .send({ dependsOnTaskId: taskB.body.id })
      .expect(400);
  });

  it('rejects hierarchy references that belong to a different project', async () => {
    const otherProject = await request(server())
      .post('/projects')
      .set('Authorization', auth(ownerToken))
      .send({ name: `Other ${Date.now()}`, docsPath: './other-docs' })
      .expect(201);
    const foreignPhase = await request(server())
      .post(`/projects/${otherProject.body.id}/phases`)
      .set('Authorization', auth(ownerToken))
      .send({ name: 'Foreign phase', order: 1 })
      .expect(201);

    await request(server())
      .post(`/projects/${projectId}/tasks`)
      .set('Authorization', auth(ownerToken))
      .send({ title: 'Cross-project', phaseId: foreignPhase.body.id })
      .expect(400);
  });
});
