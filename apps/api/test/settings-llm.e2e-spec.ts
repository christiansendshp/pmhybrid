import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { vi } from 'vitest';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { DEMO_EMAIL, DEMO_PASSWORD } from './../prisma/demo-credentials.js';

const KEY = 'sk-ant-api03-E2E-KEY-must-never-leave-the-server';

describe('LLM settings (Roadmap GAP-39a — e2e)', () => {
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
    // The configuration is one row per instance and outlives a test: start clean.
    await request(server()).delete('/settings/llm/api-key').set('Authorization', auth()).expect(200);
  });

  afterEach(async () => {
    await app.close();
  });

  const server = () => app.getHttpServer();
  const auth = (token = adminToken) => `Bearer ${token}`;

  async function memberToken() {
    const email = `member-${Date.now()}-${Math.floor(Math.random() * 1e6)}@pmhybrid.local`;
    await request(server())
      .post('/users')
      .set('Authorization', auth())
      .send({ displayName: 'Plain member', email, password: 'password123' })
      .expect(201);
    const login = await request(server())
      .post('/auth/login')
      .send({ email, password: 'password123' })
      .expect(200);
    return login.body.accessToken as string;
  }

  it('requires authentication', async () => {
    await request(server()).get('/settings/llm').expect(401);
    await request(server()).put('/settings/llm').send({ model: 'x' }).expect(401);
    await request(server()).delete('/settings/llm/api-key').expect(401);
  });

  it('refuses everyone without the global settings.manage permission', async () => {
    const token = await memberToken();

    await request(server()).get('/settings/llm').set('Authorization', auth(token)).expect(403);
    await request(server())
      .put('/settings/llm')
      .set('Authorization', auth(token))
      .send({ apiKey: KEY })
      .expect(403);
    await request(server())
      .delete('/settings/llm/api-key')
      .set('Authorization', auth(token))
      .expect(403);
    // Nothing was stored by the refused attempt.
    expect((await prisma.llmSettings.findUnique({ where: { id: 'instance' } }))?.apiKeyEncrypted ?? null).toBeNull();
  });

  it('holds the key encrypted, answers only that one exists, and never echoes it', async () => {
    const put = await request(server())
      .put('/settings/llm')
      .set('Authorization', auth())
      .send({ provider: 'ANTHROPIC', model: 'claude-test', apiKey: KEY, enabled: true })
      .expect(200);
    const get = await request(server()).get('/settings/llm').set('Authorization', auth()).expect(200);

    for (const body of [put.body, get.body]) {
      expect(body).toMatchObject({
        provider: 'ANTHROPIC',
        model: 'claude-test',
        enabled: true,
        hasApiKey: true,
        status: 'READY',
      });
      expect(JSON.stringify(body)).not.toContain(KEY);
      expect(body).not.toHaveProperty('apiKey');
      expect(body).not.toHaveProperty('apiKeyEncrypted');
    }
    const row = await prisma.llmSettings.findUnique({ where: { id: 'instance' } });
    expect(row?.apiKeyEncrypted).toBeTruthy();
    expect(row?.apiKeyEncrypted).not.toContain(KEY);
  });

  it('keeps the key out of the audit trail and out of the logs', async () => {
    const written: string[] = [];
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      written.push(String(chunk));
      return true;
    });
    try {
      await request(server())
        .put('/settings/llm')
        .set('Authorization', auth())
        .send({ apiKey: KEY, model: 'claude-audited' })
        .expect(200);
    } finally {
      spy.mockRestore();
    }

    expect(written.join('')).not.toContain(KEY);
    const events = await prisma.auditEvent.findMany({
      where: { entityType: 'LlmSettings', entityId: 'instance' },
      orderBy: { occurredAt: 'desc' },
    });
    expect(events[0]).toMatchObject({ operation: 'UPDATE', projectId: null, origin: 'UI' });
    expect(events[0].newValue).toMatchObject({ model: 'claude-audited', apiKeyChanged: true });
    expect(JSON.stringify(events)).not.toContain(KEY);
  });

  it('refuses a malformed key without echoing it back', async () => {
    const bad = 'not a key, it has spaces';
    const res = await request(server())
      .put('/settings/llm')
      .set('Authorization', auth())
      .send({ apiKey: bad })
      .expect(400);
    expect(JSON.stringify(res.body)).not.toContain(bad);

    await request(server()).put('/settings/llm').set('Authorization', auth()).send({ apiKey: 'short' }).expect(400);
    await request(server()).put('/settings/llm').set('Authorization', auth()).send({ provider: 'NOPE' }).expect(400);
    await request(server()).put('/settings/llm').set('Authorization', auth()).send({ timeoutMs: 5 }).expect(400);
    await request(server()).put('/settings/llm').set('Authorization', auth()).send({ temperature: 3 }).expect(400);
  });

  it('refuses to enable without a key', async () => {
    await request(server())
      .put('/settings/llm')
      .set('Authorization', auth())
      .send({ enabled: true })
      .expect(400);
  });

  it('replaces the key on request and keeps it when the field is absent', async () => {
    await request(server()).put('/settings/llm').set('Authorization', auth()).send({ apiKey: KEY }).expect(200);
    const before = (await prisma.llmSettings.findUnique({ where: { id: 'instance' } }))?.apiKeyEncrypted;

    await request(server()).put('/settings/llm').set('Authorization', auth()).send({ model: 'other-model' }).expect(200);
    expect((await prisma.llmSettings.findUnique({ where: { id: 'instance' } }))?.apiKeyEncrypted).toBe(before);

    await request(server())
      .put('/settings/llm')
      .set('Authorization', auth())
      .send({ apiKey: `${KEY}-replacement` })
      .expect(200);
    const after = (await prisma.llmSettings.findUnique({ where: { id: 'instance' } }))?.apiKeyEncrypted;
    expect(after).toBeTruthy();
    expect(after).not.toBe(before);
  });

  it('forgets the key and switches the integration off', async () => {
    await request(server())
      .put('/settings/llm')
      .set('Authorization', auth())
      .send({ apiKey: KEY, enabled: true })
      .expect(200);

    const res = await request(server())
      .delete('/settings/llm/api-key')
      .set('Authorization', auth())
      .expect(200);

    expect(res.body).toMatchObject({ hasApiKey: false, enabled: false, status: 'NOT_CONFIGURED' });
    expect((await prisma.llmSettings.findUnique({ where: { id: 'instance' } }))?.apiKeyEncrypted).toBeNull();
  });
});
