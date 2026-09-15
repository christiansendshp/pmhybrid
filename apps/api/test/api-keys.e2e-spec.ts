import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { DEMO_EMAIL, DEMO_PASSWORD } from './../prisma/demo-credentials.js';

/**
 * Controlled API access for AI agents (brief §27, §28, Roadmap GAP-15):
 * hashed API keys authenticate as the owning agent Actor, composed into the
 * same JwtAuthGuard every route already uses (X-API-Key header instead of
 * a Bearer token) so RBAC applies unchanged.
 */
describe('Agent API keys (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let adminToken: string;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = moduleFixture.get(PrismaService);

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

  async function createAgent() {
    const res = await request(server())
      .post('/agents')
      .set('Authorization', auth())
      .send({ displayName: unique('Key Agent'), providerType: 'custom' })
      .expect(201);
    return res.body as { id: string; displayName: string };
  }

  async function mintKey(agentId: string, name?: string) {
    const res = await request(server())
      .post(`/agents/${agentId}/keys`)
      .set('Authorization', auth())
      .send(name ? { name } : {})
      .expect(201);
    return res.body as { id: string; key: string; prefix: string; name: string | null };
  }

  it('authenticates a request with a freshly minted key, as the owning agent', async () => {
    const agent = await createAgent();
    const minted = await mintKey(agent.id, 'CI pipeline');
    expect(minted.key).toMatch(/^pmh_[0-9a-f]{64}$/);

    const me = await request(server())
      .get('/auth/me')
      .set('X-API-Key', minted.key)
      .expect(200);
    expect(me.body.id).toBe(agent.id);
  });

  it('rejects a garbage or malformed key', async () => {
    await request(server()).get('/auth/me').set('X-API-Key', 'not-a-real-key').expect(401);
    await request(server())
      .get('/auth/me')
      .set('X-API-Key', 'pmh_0000000000000000000000000000000000000000000000000000000000000000')
      .expect(401);
  });

  it('rejects a revoked key immediately, without needing a fresh token', async () => {
    const agent = await createAgent();
    const minted = await mintKey(agent.id);
    await request(server()).get('/auth/me').set('X-API-Key', minted.key).expect(200);

    await request(server())
      .delete(`/agents/${agent.id}/keys/${minted.id}`)
      .set('Authorization', auth())
      .expect(200);

    await request(server()).get('/auth/me').set('X-API-Key', minted.key).expect(401);
  });

  it('revoke is idempotent', async () => {
    const agent = await createAgent();
    const minted = await mintKey(agent.id);
    await request(server())
      .delete(`/agents/${agent.id}/keys/${minted.id}`)
      .set('Authorization', auth())
      .expect(200);
    await request(server())
      .delete(`/agents/${agent.id}/keys/${minted.id}`)
      .set('Authorization', auth())
      .expect(200);
  });

  it("rejects a key whose agent was deactivated, same as F15's other auth surfaces", async () => {
    const agent = await createAgent();
    const minted = await mintKey(agent.id);
    await request(server())
      .patch(`/agents/${agent.id}`)
      .set('Authorization', auth())
      .send({ isActive: false })
      .expect(200);

    await request(server()).get('/auth/me').set('X-API-Key', minted.key).expect(401);
  });

  it('a key-authenticated request is still subject to RBAC: 403 without the permission, not a free pass', async () => {
    const agent = await createAgent(); // no roles granted — holds no permissions
    const minted = await mintKey(agent.id);

    await request(server())
      .post('/agents')
      .set('X-API-Key', minted.key)
      .send({ displayName: unique('Should be forbidden'), providerType: 'custom' })
      .expect(403);
  });

  it('never returns or stores the secret in plain text', async () => {
    const agent = await createAgent();
    const minted = await mintKey(agent.id, 'audit-name');

    // Returned exactly once, at creation.
    expect(minted.key).toContain(minted.prefix);

    // The list view never carries it.
    const list = await request(server())
      .get(`/agents/${agent.id}/keys`)
      .set('Authorization', auth())
      .expect(200);
    expect(list.body).toHaveLength(1);
    expect(JSON.stringify(list.body)).not.toContain(minted.key);
    expect(list.body[0]).not.toHaveProperty('key');
    expect(list.body[0]).not.toHaveProperty('secretHash');

    // Nor does any column in the row itself.
    const row = await prisma.apiKey.findUniqueOrThrow({ where: { id: minted.id } });
    const secret = minted.key.replace(/^pmh_/, '');
    expect(JSON.stringify(row)).not.toContain(minted.key);
    expect(JSON.stringify(row)).not.toContain(secret);
    expect(row.secretHash).not.toBe(secret);
    expect(row.secretHash).toHaveLength(64); // sha256 hex digest, not the raw secret
  });

  it('refuses to mint or list keys for a non-agent (unknown or human) actor id', async () => {
    await request(server())
      .post('/agents/00000000-0000-0000-0000-000000000000/keys')
      .set('Authorization', auth())
      .send({})
      .expect(404);

    const humanMe = await request(server()).get('/auth/me').set('Authorization', auth()).expect(200);
    await request(server())
      .post(`/agents/${humanMe.body.id}/keys`)
      .set('Authorization', auth())
      .send({})
      .expect(404);
  });

  it('refuses key management to a caller without actors.manage', async () => {
    const email = `${unique('member')}@pmhybrid.local`;
    await request(server())
      .post('/users')
      .set('Authorization', auth())
      .send({ displayName: 'No permissions', email, password: 'password123' })
      .expect(201);
    const memberLogin = await request(server())
      .post('/auth/login')
      .send({ email, password: 'password123' })
      .expect(200);

    const agent = await createAgent();
    await request(server())
      .post(`/agents/${agent.id}/keys`)
      .set('Authorization', auth(memberLogin.body.accessToken))
      .send({})
      .expect(403);
  });
});
