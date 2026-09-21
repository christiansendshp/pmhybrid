import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { DEMO_EMAIL, DEMO_PASSWORD } from './../prisma/demo-credentials.js';
import { assignProjectRole } from './helpers/roles.js';
import { createScratchDocsPath } from './helpers/scratch-docs.js';

/**
 * Removing a member only flipped a flag, so re-adding them restored every
 * role they had held and their tasks stayed assigned to someone who could no
 * longer act on them (Roadmap BUG-08).
 */
describe('Removing a project member (e2e, Roadmap BUG-08)', () => {
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

  async function setup() {
    const project = await request(server())
      .post('/projects')
      .set('Authorization', auth())
      .send({
        name: `Member removal E2E ${Date.now()}-${Math.random()}`,
        docsPath: createScratchDocsPath(),
      })
      .expect(201);
    const projectId = project.body.id as string;
    const person = await request(server())
      .post('/users')
      .set('Authorization', auth())
      .send({
        displayName: 'Leaving Person',
        email: `leaving-${Date.now()}-${Math.floor(Math.random() * 1e6)}@pmhybrid.local`,
        password: 'password123',
      })
      .expect(201);
    const actorId = person.body.id as string;
    await request(server())
      .post(`/projects/${projectId}/members`)
      .set('Authorization', auth())
      .send({ actorId })
      .expect(201);
    await assignProjectRole(server(), auth(), projectId, actorId, 'DEVELOPER');
    return { projectId, actorId };
  }

  const createTask = async (projectId: string, title: string) =>
    (
      await request(server())
        .post(`/projects/${projectId}/tasks`)
        .set('Authorization', auth())
        .send({ title, acceptanceCriteria: 'Verified by e2e' })
        .expect(201)
    ).body.id as string;

  const assign = (projectId: string, taskId: string, actorId: string) =>
    request(server())
      .post(`/projects/${projectId}/tasks/${taskId}/assign`)
      .set('Authorization', auth())
      .send({ actorId })
      .expect(201);

  const transition = (projectId: string, taskId: string, status: string) =>
    request(server())
      .post(`/projects/${projectId}/tasks/${taskId}/transition`)
      .set('Authorization', auth())
      .send({ status })
      .expect(201);

  const taskOf = async (projectId: string, taskId: string) =>
    (
      await request(server())
        .get(`/projects/${projectId}/tasks/${taskId}`)
        .set('Authorization', auth())
        .expect(200)
    ).body as { status: string; assigneeActorId: string | null };

  it('revokes their project roles, so re-adding them does not give every role back', async () => {
    const { projectId, actorId } = await setup();
    const rolesOf = async () =>
      (
        await request(server())
          .get(`/projects/${projectId}/roles`)
          .set('Authorization', auth())
          .expect(200)
      ).body.filter(
        (assignment: { actorId: string }) => assignment.actorId === actorId,
      );
    expect(await rolesOf()).toHaveLength(1);

    await request(server())
      .delete(`/projects/${projectId}/members/${actorId}`)
      .set('Authorization', auth())
      .expect(200);
    expect(await rolesOf()).toEqual([]);

    await request(server())
      .post(`/projects/${projectId}/members`)
      .set('Authorization', auth())
      .send({ actorId })
      .expect(201);
    expect(await rolesOf()).toEqual([]);

    const audit = await request(server())
      .get(`/projects/${projectId}/audit?entityType=ActorRole`)
      .set('Authorization', auth())
      .expect(200);
    expect(
      audit.body.filter(
        (event: { operation: string }) => event.operation === 'ROLE_REVOKE',
      ),
    ).toHaveLength(1);
  });

  it('unassigns their open tasks with an audit event each, and leaves finished work alone', async () => {
    const { projectId, actorId } = await setup();
    const assigned = await createTask(projectId, 'Only assigned');
    const inProgress = await createTask(projectId, 'In development');
    const done = await createTask(projectId, 'Finished');
    for (const id of [assigned, inProgress, done]) {
      await assign(projectId, id, actorId);
    }
    await transition(projectId, inProgress, 'EN_DESARROLLO');
    await transition(projectId, done, 'EN_DESARROLLO');
    await transition(projectId, done, 'QA');
    await transition(projectId, done, 'TERMINADA');

    await request(server())
      .delete(`/projects/${projectId}/members/${actorId}`)
      .set('Authorization', auth())
      .expect(200);

    // ASIGNADA means "has an assignee": it goes back to PENDIENTE.
    expect(await taskOf(projectId, assigned)).toEqual(
      expect.objectContaining({ status: 'PENDIENTE', assigneeActorId: null }),
    );
    // Work already under way keeps its status, waiting for someone to pick it up.
    expect(await taskOf(projectId, inProgress)).toEqual(
      expect.objectContaining({
        status: 'EN_DESARROLLO',
        assigneeActorId: null,
      }),
    );
    // Finished work stays credited to who did it.
    expect(await taskOf(projectId, done)).toEqual(
      expect.objectContaining({
        status: 'TERMINADA',
        assigneeActorId: actorId,
      }),
    );

    const audit = await request(server())
      .get(`/projects/${projectId}/audit?entityType=Task`)
      .set('Authorization', auth())
      .expect(200);
    const unassigned = audit.body.filter(
      (event: { operation: string }) => event.operation === 'UNASSIGN',
    );
    expect(
      unassigned.map((event: { entityId: string }) => event.entityId).sort(),
    ).toEqual([assigned, inProgress].sort());
  });

  it('stops a removed member being the project lead', async () => {
    const { projectId, actorId } = await setup();
    await request(server())
      .patch(`/projects/${projectId}`)
      .set('Authorization', auth())
      .send({ leadActorId: actorId })
      .expect(200);

    await request(server())
      .delete(`/projects/${projectId}/members/${actorId}`)
      .set('Authorization', auth())
      .expect(200);

    const project = await request(server())
      .get(`/projects/${projectId}`)
      .set('Authorization', auth())
      .expect(200);
    expect(project.body.lead ?? null).toBeNull();
  });

  it('removing an already removed member changes nothing and audits nothing', async () => {
    const { projectId, actorId } = await setup();
    await request(server())
      .delete(`/projects/${projectId}/members/${actorId}`)
      .set('Authorization', auth())
      .expect(200);
    const before = await request(server())
      .get(`/projects/${projectId}/audit?entityType=ProjectMember`)
      .set('Authorization', auth())
      .expect(200);

    await request(server())
      .delete(`/projects/${projectId}/members/${actorId}`)
      .set('Authorization', auth())
      .expect(200);

    const after = await request(server())
      .get(`/projects/${projectId}/audit?entityType=ProjectMember`)
      .set('Authorization', auth())
      .expect(200);
    expect(after.body).toHaveLength(before.body.length);
  });
});
