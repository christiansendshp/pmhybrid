import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { DEMO_EMAIL, DEMO_PASSWORD } from './../prisma/demo-credentials.js';
import { PrismaService } from './../src/prisma/prisma.service.js';

/**
 * A leaked API key stayed valid and fully powerful until somebody noticed and
 * revoked it: it never expired, could not be limited to reading and recorded no
 * last use (Roadmap SECURITY-04b2).
 */
describe('API key expiry, scope and last use (e2e, Roadmap SECURITY-04b2)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let adminToken: string;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
    prisma = moduleFixture.get(PrismaService);

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: DEMO_EMAIL, password: DEMO_PASSWORD })
      .expect(200);
    adminToken = login.body.accessToken;
  });

  afterEach(async () => {
    await app.close();
  });

  const server = () => app.getHttpServer();
  const auth = () => `Bearer ${adminToken}`;
  const unique = (label: string) =>
    `${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

  async function createAgent() {
    const res = await request(server())
      .post('/agents')
      .set('Authorization', auth())
      .send({ displayName: unique('Limits Agent'), providerType: 'custom' })
      .expect(201);
    return res.body as { id: string };
  }

  async function mintKey(agentId: string, body: object = {}) {
    const res = await request(server())
      .post(`/agents/${agentId}/keys`)
      .set('Authorization', auth())
      .send(body)
      .expect(201);
    return res.body as {
      id: string;
      key: string;
      scope: string;
      expiresAt: string | null;
      lastUsedAt: string | null;
    };
  }

  it('mints a READ_WRITE key that never expires by default, as every key was', async () => {
    const agent = await createAgent();

    const minted = await mintKey(agent.id);

    expect(minted).toMatchObject({
      scope: 'READ_WRITE',
      expiresAt: null,
      lastUsedAt: null,
    });
  });

  it('gives a key an expiry, and stops it working once that time has passed', async () => {
    const agent = await createAgent();
    const minted = await mintKey(agent.id, { expiresInDays: 30 });
    const inThirtyDays = Date.now() + 30 * 24 * 60 * 60 * 1000;
    expect(
      Math.abs(new Date(minted.expiresAt!).getTime() - inThirtyDays),
    ).toBeLessThan(60_000);
    await request(server())
      .get('/auth/me')
      .set('X-API-Key', minted.key)
      .expect(200);

    await prisma.apiKey.update({
      where: { id: minted.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const res = await request(server())
      .get('/auth/me')
      .set('X-API-Key', minted.key)
      .expect(401);
    expect(res.body.message).toBe('Invalid, expired or revoked API key');
  });

  it('lets a READ_ONLY key read and refuses it every write', async () => {
    const agent = await createAgent();
    const minted = await mintKey(agent.id, { scope: 'READ_ONLY' });

    await request(server())
      .get('/auth/me')
      .set('X-API-Key', minted.key)
      .expect(200);
    await request(server())
      .get('/projects')
      .set('X-API-Key', minted.key)
      .expect(200);

    for (const attempt of [
      () =>
        request(server())
          .post('/projects')
          .set('X-API-Key', minted.key)
          .send({ name: 'Nope', docsPath: '/tmp/nope' }),
      () =>
        request(server())
          .patch('/agents/someone')
          .set('X-API-Key', minted.key)
          .send({ displayName: 'x' }),
      () =>
        request(server())
          .delete('/projects/anything/tasks/anything')
          .set('X-API-Key', minted.key),
    ]) {
      const res = await attempt();
      expect(res.status).toBe(403);
      expect(res.body.message).toBe('This API key is read-only');
    }
  });

  it('records when a key was last used, at most once a minute', async () => {
    const agent = await createAgent();
    const minted = await mintKey(agent.id);
    expect(minted.lastUsedAt).toBeNull();

    await request(server())
      .get('/auth/me')
      .set('X-API-Key', minted.key)
      .expect(200);
    const first = (await prisma.apiKey.findUniqueOrThrow({
      where: { id: minted.id },
    }))!.lastUsedAt;
    expect(first).not.toBeNull();

    // A second request inside the minute does not write again.
    await request(server())
      .get('/auth/me')
      .set('X-API-Key', minted.key)
      .expect(200);
    const second = (await prisma.apiKey.findUniqueOrThrow({
      where: { id: minted.id },
    }))!.lastUsedAt;
    expect(second!.getTime()).toBe(first!.getTime());

    // Once the record is a minute old, the next request refreshes it.
    await prisma.apiKey.update({
      where: { id: minted.id },
      data: { lastUsedAt: new Date(Date.now() - 5 * 60_000) },
    });
    await request(server())
      .get('/auth/me')
      .set('X-API-Key', minted.key)
      .expect(200);
    const third = (await prisma.apiKey.findUniqueOrThrow({
      where: { id: minted.id },
    }))!.lastUsedAt;
    expect(third!.getTime()).toBeGreaterThan(Date.now() - 60_000);

    // The list shows it to whoever manages the agent.
    const listed = await request(server())
      .get(`/agents/${agent.id}/keys`)
      .set('Authorization', auth())
      .expect(200);
    expect(listed.body[0]).toMatchObject({
      id: minted.id,
      scope: 'READ_WRITE',
      expiresAt: null,
    });
    expect(listed.body[0].lastUsedAt).not.toBeNull();
    expect(JSON.stringify(listed.body)).not.toContain(minted.key);
  });

  it('refuses an expiry or a scope it does not understand', async () => {
    const agent = await createAgent();

    for (const body of [
      { expiresInDays: 0 },
      { expiresInDays: 4000 },
      { expiresInDays: 1.5 },
      { scope: 'ADMIN' },
    ]) {
      await request(server())
        .post(`/agents/${agent.id}/keys`)
        .set('Authorization', auth())
        .send(body)
        .expect(400);
    }
  });
});
