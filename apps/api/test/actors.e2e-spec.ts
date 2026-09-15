import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { DEMO_EMAIL, DEMO_PASSWORD } from './../prisma/demo-credentials.js';
import { createScratchDocsPath } from './helpers/scratch-docs.js';

describe('Administrable actors (brief §3 — e2e)', () => {
  let app: INestApplication<App>;
  let adminToken: string;

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
    adminToken = login.body.accessToken;
  });

  afterEach(async () => {
    await app.close();
  });

  const server = () => app.getHttpServer();
  const auth = (token = adminToken) => `Bearer ${token}`;
  const unique = (label: string) => `${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

  async function createUser() {
    const email = `${unique('member')}@pmhybrid.local`;
    const res = await request(server())
      .post('/users')
      .set('Authorization', auth())
      .send({ displayName: 'Team member', email, password: 'password123' })
      .expect(201);
    return { id: res.body.id as string, email };
  }

  async function loginAs(email: string) {
    const res = await request(server())
      .post('/auth/login')
      .send({ email, password: 'password123' })
      .expect(200);
    return res.body.accessToken as string;
  }

  async function createAgent(body: Record<string, unknown> = {}) {
    const res = await request(server())
      .post('/agents')
      .set('Authorization', auth())
      .send({ displayName: unique('Agent'), providerType: 'custom', ...body })
      .expect(201);
    return res.body as { id: string; displayName: string };
  }

  it("exposes the caller's global permissions on /auth/me", async () => {
    const mine = await request(server()).get('/auth/me').set('Authorization', auth()).expect(200);
    expect(mine.body.permissions).toContain('actors.manage');

    const user = await createUser();
    const theirs = await request(server())
      .get('/auth/me')
      .set('Authorization', auth(await loginAs(user.email)))
      .expect(200);
    expect(theirs.body.permissions).toEqual([]);
  });

  it('creates, lists (oldest first) and edits an AI agent with its provider and non-secret config', async () => {
    const created = await request(server())
      .post('/agents')
      .set('Authorization', auth())
      .send({
        displayName: unique('Claude QA'),
        providerType: 'claude',
        avatarUrl: 'https://example.com/claude.png',
        config: { model: 'claude-opus-5', focus: 'qa' },
      })
      .expect(201);
    expect(created.body).toMatchObject({
      kind: 'AI_AGENT',
      isActive: true,
      avatarUrl: 'https://example.com/claude.png',
      agentProfile: { providerType: 'claude', configJson: { model: 'claude-opus-5', focus: 'qa' } },
    });

    const list = await request(server()).get('/agents').set('Authorization', auth()).expect(200);
    expect(list.body.some((a: { id: string }) => a.id === created.body.id)).toBe(true);
    const createdAts = list.body.map((a: { createdAt: string }) => a.createdAt);
    expect(createdAts).toEqual([...createdAts].sort());

    const patched = await request(server())
      .patch(`/agents/${created.body.id}`)
      .set('Authorization', auth())
      .send({ displayName: 'Claude Reviewer', providerType: 'claude-code' })
      .expect(200);
    expect(patched.body).toMatchObject({
      displayName: 'Claude Reviewer',
      agentProfile: { providerType: 'claude-code' },
    });
  });

  it('refuses agent config that looks like a credential (brief §28 — secrets live in env vars)', async () => {
    await request(server())
      .post('/agents')
      .set('Authorization', auth())
      .send({ displayName: unique('Leaky'), providerType: 'custom', config: { apiKey: 'sk-123' } })
      .expect(400);
    await request(server())
      .post('/agents')
      .set('Authorization', auth())
      .send({
        displayName: unique('Leaky'),
        providerType: 'custom',
        config: { provider: { auth_token: 'abc' } },
      })
      .expect(400);
  });

  it('requires authentication to list agents', async () => {
    await request(server()).get('/agents').expect(401);
  });

  it('only lets actors.manage holders create or edit actors', async () => {
    const user = await createUser();
    const token = await loginAs(user.email);

    await request(server())
      .post('/users')
      .set('Authorization', auth(token))
      .send({ displayName: 'Nope', email: `${unique('nope')}@pmhybrid.local`, password: 'password123' })
      .expect(403);
    await request(server())
      .post('/agents')
      .set('Authorization', auth(token))
      .send({ displayName: 'Nope', providerType: 'custom' })
      .expect(403);
    await request(server())
      .patch(`/users/${user.id}`)
      .set('Authorization', auth(token))
      .send({ displayName: 'Self-promoted' })
      .expect(403);
  });

  it('deactivating a user blocks login and their already-issued access token; reactivating restores login', async () => {
    const user = await createUser();
    const token = await loginAs(user.email);
    await request(server()).get('/auth/me').set('Authorization', auth(token)).expect(200);

    const deactivated = await request(server())
      .patch(`/users/${user.id}`)
      .set('Authorization', auth())
      .send({ isActive: false })
      .expect(200);
    expect(deactivated.body.isActive).toBe(false);

    await request(server()).get('/auth/me').set('Authorization', auth(token)).expect(401);
    await request(server())
      .post('/auth/login')
      .send({ email: user.email, password: 'password123' })
      .expect(401);

    await request(server())
      .patch(`/users/${user.id}`)
      .set('Authorization', auth())
      .send({ isActive: true })
      .expect(200);
    await loginAs(user.email);
  });

  it('refuses to let an administrator deactivate themselves', async () => {
    const me = await request(server()).get('/auth/me').set('Authorization', auth()).expect(200);
    await request(server())
      .patch(`/users/${me.body.id}`)
      .set('Authorization', auth())
      .send({ isActive: false })
      .expect(400);
  });

  it('keeps inactive actors out of project membership and task assignment', async () => {
    const project = await request(server())
      .post('/projects')
      .set('Authorization', auth())
      .send({ name: unique('Actors E2E'), docsPath: createScratchDocsPath() })
      .expect(201);
    const projectId = project.body.id as string;

    const member = await createAgent();
    await request(server())
      .post(`/projects/${projectId}/members`)
      .set('Authorization', auth())
      .send({ actorId: member.id })
      .expect(201);
    const task = await request(server())
      .post(`/projects/${projectId}/tasks`)
      .set('Authorization', auth())
      .send({ title: 'Needs an active assignee', acceptanceCriteria: 'Verified by e2e' })
      .expect(201);

    await request(server())
      .patch(`/agents/${member.id}`)
      .set('Authorization', auth())
      .send({ isActive: false })
      .expect(200);
    await request(server())
      .post(`/projects/${projectId}/tasks/${task.body.id}/assign`)
      .set('Authorization', auth())
      .send({ actorId: member.id })
      .expect(400);

    const outsider = await createAgent();
    await request(server())
      .patch(`/agents/${outsider.id}`)
      .set('Authorization', auth())
      .send({ isActive: false })
      .expect(200);
    await request(server())
      .post(`/projects/${projectId}/members`)
      .set('Authorization', auth())
      .send({ actorId: outsider.id })
      .expect(400);
  });

  it('refuses to grant a global role inside a project', async () => {
    const project = await request(server())
      .post('/projects')
      .set('Authorization', auth())
      .send({ name: unique('Scope E2E'), docsPath: createScratchDocsPath() })
      .expect(201);
    const roles = await request(server()).get('/roles').set('Authorization', auth()).expect(200);
    const adminRole = roles.body.find((r: { name: string; scope: string }) => r.scope === 'GLOBAL');
    const me = await request(server()).get('/auth/me').set('Authorization', auth()).expect(200);

    await request(server())
      .post(`/projects/${project.body.id}/roles`)
      .set('Authorization', auth())
      .send({ actorId: me.body.id, roleId: adminRole.id })
      .expect(400);
  });
});
