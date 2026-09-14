import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { DEMO_EMAIL, DEMO_PASSWORD } from './../prisma/demo-credentials.js';

describe('Projects / RBAC (e2e)', () => {
  let app: INestApplication<App>;
  let ownerToken: string;
  let outsiderToken: string;
  let outsiderId: string;
  let agentActorId: string;

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

    const uniqueEmail = `outsider-${Date.now()}-${Math.random().toString(36).slice(2)}@pmhybrid.local`;
    const createOutsider = await request(app.getHttpServer())
      .post('/users')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ displayName: 'Outsider', email: uniqueEmail, password: 'outsider123' })
      .expect(201);
    outsiderId = createOutsider.body.id;

    const outsiderLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: uniqueEmail, password: 'outsider123' })
      .expect(200);
    outsiderToken = outsiderLogin.body.accessToken;

    const agents = await request(app.getHttpServer())
      .get('/agents')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    agentActorId = agents.body[0].id;
  });

  afterEach(async () => {
    await app.close();
  });

  it('creates a project, makes the creator OWNER, and lists it under My Projects', async () => {
    const created = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'E2E Project', docsPath: './e2e-project-docs' })
      .expect(201);

    expect(created.body.name).toBe('E2E Project');
    const projectId = created.body.id;

    const mine = await request(app.getHttpServer())
      .get('/projects')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(mine.body.some((p: { id: string }) => p.id === projectId)).toBe(true);

    const permissions = await request(app.getHttpServer())
      .get(`/projects/${projectId}/roles/my-permissions`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(permissions.body).toEqual(
      expect.arrayContaining(['project.update', 'project.members.manage', 'project.roles.manage']),
    );
  });

  it('denies a non-member from reading the project (ProjectMemberGuard)', async () => {
    const created = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Private Project', docsPath: './private-docs' })
      .expect(201);

    await request(app.getHttpServer())
      .get(`/projects/${created.body.id}`)
      .set('Authorization', `Bearer ${outsiderToken}`)
      .expect(403);
  });

  it('adds an AI_AGENT actor as a project member the same way as a human (brief §3/§18)', async () => {
    const created = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Agent Project', docsPath: './agent-docs' })
      .expect(201);
    const projectId = created.body.id;

    await request(app.getHttpServer())
      .post(`/projects/${projectId}/members`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ actorId: agentActorId })
      .expect(201);

    const members = await request(app.getHttpServer())
      .get(`/projects/${projectId}/members`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    const agentMember = members.body.find(
      (m: { actor: { id: string; kind: string } }) => m.actor.id === agentActorId,
    );
    expect(agentMember).toBeDefined();
    expect(agentMember.actor.kind).toBe('AI_AGENT');
  });

  it('denies a plain member with no role from adding other members (PermissionGuard)', async () => {
    const created = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Guarded Project', docsPath: './guarded-docs' })
      .expect(201);
    const projectId = created.body.id;

    // Membership alone grants no permissions — ActorRole is separate.
    await request(app.getHttpServer())
      .post(`/projects/${projectId}/members`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ actorId: outsiderId })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/projects/${projectId}/members`)
      .set('Authorization', `Bearer ${outsiderToken}`)
      .send({ actorId: agentActorId })
      .expect(403);
  });

  it('lets the OWNER update project settings via PermissionGuard(project.update)', async () => {
    const created = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Updatable Project', docsPath: './updatable-docs' })
      .expect(201);

    const updated = await request(app.getHttpServer())
      .patch(`/projects/${created.body.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ description: 'updated via e2e' })
      .expect(200);

    expect(updated.body.description).toBe('updated via e2e');
  });
});
