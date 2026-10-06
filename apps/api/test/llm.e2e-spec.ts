import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { vi } from 'vitest';
import { AppModule } from './../src/app.module.js';
import { LLM_FETCH } from './../src/modules/llm/llm.types.js';
import { TitleNormalizationService } from './../src/modules/title-normalization/title-normalization.service.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { DEMO_EMAIL, DEMO_PASSWORD } from './../prisma/demo-credentials.js';
import { assignProjectRole } from './helpers/roles.js';
import { createScratchDocsPath } from './helpers/scratch-docs.js';

const KEY = 'sk-ant-api03-E2E-KEY-must-never-leave-the-server';

describe('LLM settings (Roadmap GAP-39a — e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let adminToken: string;
  // What the provider answers, set per test: the suite never reaches the network.
  let providerAnswer: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    providerAnswer = vi.fn();
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(LLM_FETCH)
      .useValue((...args: unknown[]) => providerAnswer(...args))
      .compile();
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

  describe('POST /settings/llm/test', () => {
    it('is refused without settings.manage', async () => {
      const token = await memberToken();

      await request(server()).post('/settings/llm/test').set('Authorization', auth(token)).expect(403);
      expect(providerAnswer).not.toHaveBeenCalled();
    });

    it('says there is nothing to test without a key, and calls no one', async () => {
      const res = await request(server()).post('/settings/llm/test').set('Authorization', auth()).expect(200);

      expect(res.body).toEqual({ ok: false, error: 'No readable API key is stored' });
      expect(providerAnswer).not.toHaveBeenCalled();
    });

    it('tests a stored key even while the integration is switched off', async () => {
      providerAnswer.mockResolvedValue(
        new Response(JSON.stringify({ content: [{ type: 'text', text: 'OK' }] }), { status: 200 }),
      );
      await request(server())
        .put('/settings/llm')
        .set('Authorization', auth())
        .send({ apiKey: KEY, model: 'claude-test' })
        .expect(200);

      const res = await request(server()).post('/settings/llm/test').set('Authorization', auth()).expect(200);

      expect(res.body).toEqual({ ok: true });
      const [url, init] = providerAnswer.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://api.anthropic.com/v1/messages');
      expect((init.headers as Record<string, string>)['x-api-key']).toBe(KEY);
      expect(JSON.parse(init.body as string).model).toBe('claude-test');
    });

    it("reports the provider's refusal without ever returning the key", async () => {
      providerAnswer.mockResolvedValue(
        new Response(JSON.stringify({ error: { message: `invalid x-api-key ${KEY}` } }), { status: 401 }),
      );
      await request(server()).put('/settings/llm').set('Authorization', auth()).send({ apiKey: KEY }).expect(200);

      const res = await request(server()).post('/settings/llm/test').set('Authorization', auth()).expect(200);

      expect(res.body.ok).toBe(false);
      expect(res.body.error).toContain('Anthropic answered 401');
      expect(JSON.stringify(res.body)).not.toContain(KEY);
    });

    it('reports a network failure', async () => {
      providerAnswer.mockRejectedValue(new Error('ENOTFOUND'));
      await request(server()).put('/settings/llm').set('Authorization', auth()).send({ apiKey: KEY }).expect(200);

      const res = await request(server()).post('/settings/llm/test').set('Authorization', auth()).expect(200);

      expect(res.body).toEqual({ ok: false, error: 'Anthropic could not be reached' });
    });
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

// ---------------------------------------------------------------------------
// The same file as the settings above on purpose: the configuration is one row
// per instance, and spec files run in parallel against one database, so two
// files changing it would race.
// ---------------------------------------------------------------------------

const LONG_1 =
  'Implementar sistema automático de validación y conciliación de novedades de asistencia del personal contra las fichadas registradas en SARHA';
const LONG_2 =
  'Migrar el módulo de liquidación de haberes al nuevo motor de cálculo con pruebas de regresión completas';
const LONG_3 =
  'Rediseñar el proceso de alta de agentes con validaciones de seguridad adicionales y auditoría completa';
const SHORT = 'Actualizar documentación del proyecto';

const ANSWERS: Record<string, { title: string; description: string }> = {
  [LONG_1]: {
    title: 'Validar y conciliar novedades de asistencia',
    description:
      'Implementar un sistema automático que permita validar y conciliar las novedades de asistencia del personal contra las fichadas registradas en SARHA, identificando las diferencias que requieran revisión.',
  },
  [LONG_2]: {
    title: 'Migrar módulo de liquidación al nuevo motor',
    description:
      'Migrar el módulo de liquidación de haberes al nuevo motor de cálculo, con pruebas de regresión completas que aseguren resultados equivalentes.',
  },
  [LONG_3]: {
    title: 'Rediseñar alta de agentes con validaciones',
    description:
      'Rediseñar el proceso de alta de agentes incorporando validaciones de seguridad adicionales y auditoría completa del proceso.',
  },
};

function entry(id: string, title: string, status = 'READY'): string {
  return [
    `### ${id} — Entry`,
    '',
    '```yaml',
    `id: ${id}`,
    'type: TASK',
    `title: ${title}`,
    `status: ${status}`,
    '```',
    '',
  ].join('\n');
}

const roadmapOf = (...entries: string[]) => ['# Roadmap', '', '## Plan', '', ...entries].join('\n');

describe('Title normalization of long Roadmap titles (Roadmap GAP-39d — e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let token: string;
  // What the faked provider has been asked about, and how it answers each title.
  let asked: string[];
  let requests: { url: string; headers: Record<string, string>; body: Record<string, unknown>; title: string }[];
  let behavior: Map<string, 'http500' | 'http401' | 'badjson'>;

  /** The text in the dialect of whoever was called: Anthropic's content blocks, or chat completions (OpenAI, OpenRouter). */
  const replyFor = (url: string, text: string) =>
    new Response(
      JSON.stringify(
        url.includes('anthropic.com')
          ? { content: [{ type: 'text', text }] }
          : { choices: [{ message: { content: text } }] },
      ),
      { status: 200 },
    );

  const fakeProvider = async (url: unknown, init?: RequestInit) => {
    const target = String(url);
    const body = JSON.parse(init?.body as string);
    const prompt = (body.messages as { role: string; content: string }[]).find((m) => m.role === 'user')?.content ?? '';
    const title = /^title: (.*)$/m.exec(prompt)?.[1] ?? '';
    asked.push(title);
    requests.push({ url: target, headers: { ...(init?.headers as Record<string, string>) }, body, title });
    const mode = behavior.get(title);
    if (mode === 'http500') {
      return new Response(JSON.stringify({ error: { message: `overloaded for ${KEY}` } }), {
        status: 500,
      });
    }
    if (mode === 'http401') {
      return new Response(JSON.stringify({ error: { message: `Incorrect API key provided: ${KEY}` } }), {
        status: 401,
      });
    }
    if (mode === 'badjson') {
      return replyFor(target, 'Claro, aquí tienes el resultado.');
    }
    const answer = ANSWERS[title];
    return answer ? replyFor(target, JSON.stringify(answer)) : new Response('{}', { status: 500 });
  };

  beforeEach(async () => {
    asked = [];
    requests = [];
    behavior = new Map();
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(LLM_FETCH)
      .useValue(fakeProvider)
      .compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = moduleFixture.get(PrismaService);

    const login = await request(server())
      .post('/auth/login')
      .send({ email: DEMO_EMAIL, password: DEMO_PASSWORD })
      .expect(200);
    token = login.body.accessToken;
    await configure(false);
  });

  afterEach(async () => {
    await request(server()).delete('/settings/llm/api-key').set('Authorization', auth());
    // A spec may have chosen another provider: the next one starts from the default.
    await prisma.llmSettings.updateMany({ where: { id: 'instance' }, data: { provider: 'ANTHROPIC', model: 'claude-test' } });
    await app.close();
  });

  const server = () => app.getHttpServer();
  const auth = () => `Bearer ${token}`;

  /**
   * The one row every spec shares: with a key and on, or off. Switching it on
   * works every project's queue on its own (Roadmap BUG-13), and the projects of
   * the other spec files share this database, so it waits for that pass to end
   * and forgets what it asked: what a spec asserts starts after it.
   */
  async function configure(enabled: boolean) {
    await request(server())
      .put('/settings/llm')
      .set('Authorization', auth())
      .send({ provider: 'ANTHROPIC', apiKey: KEY, model: 'claude-test', enabled })
      .expect(200);
    if (enabled) {
      await app.get(TitleNormalizationService).queueEveryProject();
      asked.length = 0;
      requests.length = 0;
    }
  }

  async function createProject(docs: string) {
    const res = await request(server())
      .post('/projects')
      .set('Authorization', auth())
      .send({ name: `Normalization E2E ${Date.now()}-${Math.random()}`, docsPath: docs })
      .expect(201);
    return res.body.id as string;
  }

  const sync = (projectId: string) =>
    request(server()).post(`/projects/${projectId}/sync`).set('Authorization', auth());

  const taskRow = (projectId: string, externalId: string) =>
    prisma.task.findFirstOrThrow({ where: { projectId, externalId } });

  async function until(condition: () => Promise<boolean>) {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      if (await condition()) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error('the condition was not reached in time');
  }

  const noPending = (projectId: string) => async () =>
    (await prisma.task.count({ where: { projectId, titleNormalization: 'PENDING' } })) === 0;

  /** A project whose Roadmap holds the given entries, synced once. */
  async function project(...entries: string[]) {
    const docs = createScratchDocsPath();
    const file = path.join(docs, 'Roadmap.md');
    writeFileSync(file, roadmapOf(...entries), 'utf-8');
    const projectId = await createProject(docs);
    return { docs, file, projectId };
  }

  it('keeps a short title without calling the LLM and normalizes a long one, leaving the document untouched', async () => {
    await configure(true);
    const { file, projectId } = await project(entry('N-1', LONG_1), entry('N-2', SHORT));
    const before = readFileSync(file, 'utf-8');

    const run = await sync(projectId).expect(201);
    await until(noPending(projectId));

    expect(run.body.status).toBe('SUCCESS');
    const long = await taskRow(projectId, 'N-1');
    expect(long).toMatchObject({
      title: 'Validar y conciliar novedades de asistencia',
      originalTitle: LONG_1,
      titleNormalization: 'DONE',
      titleNormalizationError: null,
      description: ANSWERS[LONG_1].description,
      generatedDescription: ANSWERS[LONG_1].description,
    });
    expect(long.titleNormalizedAt).not.toBeNull();
    const short = await taskRow(projectId, 'N-2');
    expect(short).toMatchObject({ title: SHORT, originalTitle: null, titleNormalization: null, description: null });
    expect(asked).toEqual([LONG_1]);
    // Roadmap.md is never written by normalization.
    expect(readFileSync(file, 'utf-8')).toBe(before);
    const events = await prisma.auditEvent.findMany({
      where: { entityId: long.id, operation: 'TITLE_NORMALIZE' },
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ origin: 'SYSTEM', projectId });
    expect(events[0].previousValue).toEqual({ title: LONG_1 });
  });

  it('does not revert a normalized title when the row changes for another reason, nor ask again', async () => {
    await configure(true);
    const { file, projectId } = await project(entry('N-1', LONG_1));
    await sync(projectId).expect(201);
    await until(noPending(projectId));

    writeFileSync(file, roadmapOf(entry('N-1', LONG_1, 'IN_PROGRESS')), 'utf-8');
    await sync(projectId).expect(201);
    await until(noPending(projectId));

    expect(await taskRow(projectId, 'N-1')).toMatchObject({
      title: 'Validar y conciliar novedades de asistencia',
      originalTitle: LONG_1,
      titleNormalization: 'DONE',
      status: 'EN_DESARROLLO',
    });
    expect(asked).toEqual([LONG_1]);
  });

  it('replaces the normalization when the document changes the title, and drops what it generated for the old one', async () => {
    await configure(true);
    const { file, projectId } = await project(entry('N-1', LONG_1));
    await sync(projectId).expect(201);
    await until(noPending(projectId));

    writeFileSync(file, roadmapOf(entry('N-1', LONG_3)), 'utf-8');
    await sync(projectId).expect(201);
    await until(noPending(projectId));
    expect(await taskRow(projectId, 'N-1')).toMatchObject({
      title: ANSWERS[LONG_3].title,
      originalTitle: LONG_3,
      description: ANSWERS[LONG_3].description,
      titleNormalization: 'DONE',
    });

    writeFileSync(file, roadmapOf(entry('N-1', SHORT)), 'utf-8');
    await sync(projectId).expect(201);
    await until(noPending(projectId));
    expect(await taskRow(projectId, 'N-1')).toMatchObject({
      title: SHORT,
      originalTitle: null,
      titleNormalization: null,
      description: null,
      generatedDescription: null,
    });
    expect(asked).toEqual([LONG_1, LONG_3]);
  });

  it('keeps the title when the LLM fails, records why without the key, and goes on with the rest', async () => {
    await configure(true);
    behavior.set(LONG_1, 'http500');
    const { projectId } = await project(entry('N-1', LONG_1), entry('N-3', LONG_2));

    const run = await sync(projectId).expect(201);
    await until(noPending(projectId));

    expect(run.body.status).toBe('SUCCESS');
    const failed = await taskRow(projectId, 'N-1');
    expect(failed).toMatchObject({ title: LONG_1, originalTitle: null, titleNormalization: 'FAILED', description: null });
    expect(failed.titleNormalizationError).toContain('Anthropic answered 500');
    expect(failed.titleNormalizationError).not.toContain(KEY);
    expect(await taskRow(projectId, 'N-3')).toMatchObject({ title: ANSWERS[LONG_2].title, titleNormalization: 'DONE' });
    expect(JSON.stringify(await prisma.task.findMany({ where: { projectId } }))).not.toContain(KEY);
  });

  it('can be retried once the provider works, one task or the whole project', async () => {
    await configure(true);
    behavior.set(LONG_1, 'http500');
    behavior.set(LONG_2, 'http500');
    const { projectId } = await project(entry('N-1', LONG_1), entry('N-3', LONG_2));
    await sync(projectId).expect(201);
    await until(noPending(projectId));
    behavior.clear();

    const one = await taskRow(projectId, 'N-1');
    const single = await request(server())
      .post(`/projects/${projectId}/tasks/${one.id}/normalize-title`)
      .set('Authorization', auth())
      .expect(200);
    expect(single.body).toEqual({ queued: true, processing: true });
    await until(async () => (await taskRow(projectId, 'N-1')).titleNormalization === 'DONE');

    const all = await request(server())
      .post(`/projects/${projectId}/titles/normalize`)
      .set('Authorization', auth())
      .expect(200);
    expect(all.body).toEqual({ retried: 1, queued: 0, processing: true });
    await until(async () => (await taskRow(projectId, 'N-3')).titleNormalization === 'DONE');
    expect(await taskRow(projectId, 'N-3')).toMatchObject({ title: ANSWERS[LONG_2].title, titleNormalizationError: null });

    // A normalized task is left as it is.
    const again = await request(server())
      .post(`/projects/${projectId}/tasks/${one.id}/normalize-title`)
      .set('Authorization', auth())
      .expect(200);
    expect(again.body).toEqual({ queued: false, processing: false });
  });

  it('leaves the task alone when the answer is not usable even after the corrective retry', async () => {
    await configure(true);
    behavior.set(LONG_1, 'badjson');
    const { projectId } = await project(entry('N-1', LONG_1));

    await sync(projectId).expect(201);
    await until(noPending(projectId));

    expect(await taskRow(projectId, 'N-1')).toMatchObject({
      title: LONG_1,
      originalTitle: null,
      titleNormalization: 'FAILED',
      titleNormalizationError: "The LLM's answer was not usable (NOT_JSON)",
    });
    // The first answer and the corrective retry.
    expect(asked).toEqual([LONG_1, LONG_1]);
  });

  it('stops at a refused key and leaves the rest of the queue waiting, so a wrong key does not fail every task (Roadmap BUG-13)', async () => {
    await configure(true);
    behavior.set(LONG_1, 'http401');
    behavior.set(LONG_2, 'http401');
    const { projectId } = await project(entry('N-1', LONG_1), entry('N-3', LONG_2));

    await sync(projectId).expect(201);
    await until(async () => (await prisma.task.count({ where: { projectId, titleNormalization: 'FAILED' } })) === 1);
    await new Promise((resolve) => setTimeout(resolve, 150));

    const states = (await prisma.task.findMany({ where: { projectId } })).map((task) => task.titleNormalization);
    expect(states.sort()).toEqual(['FAILED', 'PENDING']);
    expect(requests.filter((call) => call.title === LONG_1 || call.title === LONG_2)).toHaveLength(1);
    const failed = await prisma.task.findFirstOrThrow({ where: { projectId, titleNormalization: 'FAILED' } });
    expect(failed.titleNormalizationError).toContain('401');
    expect(failed.titleNormalizationError).not.toContain(KEY);

    // Once the key works, saving the configuration again works what was left, and the failed one too.
    behavior.clear();
    await configure(true);
    await until(async () => (await prisma.task.count({ where: { projectId, titleNormalization: 'DONE' } })) === 2);
  });

  it('waits, without calling anyone, while the LLM is not configured, and works the queue the moment it is switched on, with nobody asking', async () => {
    const { projectId } = await project(entry('N-1', LONG_1), entry('N-2', SHORT));

    const run = await sync(projectId).expect(201);

    expect(run.body.status).toBe('SUCCESS');
    expect(await taskRow(projectId, 'N-1')).toMatchObject({ title: LONG_1, titleNormalization: 'PENDING' });
    expect(asked).toEqual([]);

    // Saving it while it stays off is no reason to call anyone either.
    await configure(false);
    expect(asked).toEqual([]);
    expect(await taskRow(projectId, 'N-1')).toMatchObject({ titleNormalization: 'PENDING' });

    // No sync, no request to normalize: enabling is the only thing that happens.
    await configure(true);

    await until(noPending(projectId));
    expect(await taskRow(projectId, 'N-1')).toMatchObject({ titleNormalization: 'DONE', originalTitle: LONG_1 });
    expect(await taskRow(projectId, 'N-2')).toMatchObject({ titleNormalization: null });
  });

  it('queues the long titles read before the feature existed, on request while off and by itself once on (Roadmap BUG-13)', async () => {
    const { projectId } = await project(entry('N-1', LONG_1), entry('N-2', SHORT));
    await sync(projectId).expect(201);
    // As a task read before the feature: long, and never queued.
    await prisma.task.updateMany({ where: { projectId, externalId: 'N-1' }, data: { titleNormalization: null } });

    const res = await request(server())
      .post(`/projects/${projectId}/titles/normalize`)
      .set('Authorization', auth())
      .expect(200);
    expect(res.body).toEqual({ retried: 0, queued: 1, processing: false });
    expect(await taskRow(projectId, 'N-1')).toMatchObject({ titleNormalization: 'PENDING' });

    await configure(true);

    await until(noPending(projectId));
    expect(await taskRow(projectId, 'N-1')).toMatchObject({ titleNormalization: 'DONE' });
    expect(await taskRow(projectId, 'N-2')).toMatchObject({ titleNormalization: null });
  });

  it('on its own, enabling reaches the failed ones and the titles never queued, in a project it was never asked about', async () => {
    const { projectId } = await project(entry('N-1', LONG_1), entry('N-3', LONG_2), entry('N-2', SHORT));
    await sync(projectId).expect(201);
    // One that failed before, one read before the feature, one that is short.
    await prisma.task.updateMany({
      where: { projectId, externalId: 'N-1' },
      data: { titleNormalization: 'FAILED', titleNormalizationError: 'The provider answered 401' },
    });
    await prisma.task.updateMany({ where: { projectId, externalId: 'N-3' }, data: { titleNormalization: null } });

    await configure(true);

    await until(async () => (await taskRow(projectId, 'N-1')).titleNormalization === 'DONE');
    await until(async () => (await taskRow(projectId, 'N-3')).titleNormalization === 'DONE');
    expect(await taskRow(projectId, 'N-1')).toMatchObject({ title: ANSWERS[LONG_1].title, titleNormalizationError: null });
    expect(await taskRow(projectId, 'N-3')).toMatchObject({ title: ANSWERS[LONG_2].title, originalTitle: LONG_2 });
    expect(await taskRow(projectId, 'N-2')).toMatchObject({ title: SHORT, titleNormalization: null });
  });

  it('works through OpenRouter: its URL, the key as a bearer and nowhere else, and the model it was configured with (Roadmap BUG-13)', async () => {
    const OPENROUTER_KEY = 'sk-or-v1-E2E-OPENROUTER-KEY-must-never-leave-the-server-0123456789';
    const { projectId } = await project(entry('N-1', LONG_1), entry('N-2', SHORT));
    await sync(projectId).expect(201);

    const saved = await request(server())
      .put('/settings/llm')
      .set('Authorization', auth())
      .send({ provider: 'OPENROUTER', apiKey: OPENROUTER_KEY, enabled: true })
      .expect(200);
    expect(saved.body).toMatchObject({
      provider: 'OPENROUTER',
      model: 'anthropic/claude-haiku-4.5',
      enabled: true,
      hasApiKey: true,
      status: 'READY',
    });
    expect(JSON.stringify(saved.body)).not.toContain(OPENROUTER_KEY);

    await until(noPending(projectId));

    expect(await taskRow(projectId, 'N-1')).toMatchObject({
      title: ANSWERS[LONG_1].title,
      originalTitle: LONG_1,
      titleNormalization: 'DONE',
    });
    const calls = requests.filter((call) => call.title === LONG_1);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(calls[0].headers).toMatchObject({ authorization: `Bearer ${OPENROUTER_KEY}` });
    expect(calls[0].body).toMatchObject({ model: 'anthropic/claude-haiku-4.5', max_tokens: 1024 });
    expect(calls[0].body).not.toHaveProperty('max_completion_tokens');
    // A short title never reaches the provider.
    expect(requests.filter((call) => call.title === SHORT)).toEqual([]);

    // The key is in no row but the settings one, and there only as ciphertext.
    expect(JSON.stringify(await prisma.task.findMany({ where: { projectId } }))).not.toContain(OPENROUTER_KEY);
    expect(JSON.stringify(await prisma.auditEvent.findMany({ where: { projectId } }))).not.toContain(OPENROUTER_KEY);
    expect((await prisma.llmSettings.findUnique({ where: { id: 'instance' } }))?.apiKeyEncrypted).not.toContain(OPENROUTER_KEY);
  });

  it('never replaces a description a person wrote', async () => {
    const { projectId } = await project(entry('N-1', LONG_1));
    await sync(projectId).expect(201);
    const task = await taskRow(projectId, 'N-1');
    await request(server())
      .patch(`/projects/${projectId}/tasks/${task.id}`)
      .set('Authorization', auth())
      .send({ description: 'Escrita por una persona' })
      .expect(200);

    await configure(true);
    await until(noPending(projectId));

    expect(await taskRow(projectId, 'N-1')).toMatchObject({
      title: ANSWERS[LONG_1].title,
      description: 'Escrita por una persona',
      generatedDescription: null,
      titleNormalization: 'DONE',
    });
  });

  it("does not turn the document's long title into the short one when PM Hub writes the row for another reason", async () => {
    await configure(true);
    const { file, projectId } = await project(entry('N-1', LONG_1));
    await sync(projectId).expect(201);
    await until(noPending(projectId));
    const task = await taskRow(projectId, 'N-1');
    const me = await request(server()).get('/auth/me').set('Authorization', auth()).expect(200);

    await request(server())
      .post(`/projects/${projectId}/tasks/${task.id}/assign`)
      .set('Authorization', auth())
      .send({ actorId: me.body.id })
      .expect(201);
    await request(server())
      .post(`/projects/${projectId}/tasks/${task.id}/transition`)
      .set('Authorization', auth())
      .send({ status: 'EN_DESARROLLO' })
      .expect(201);

    const document = readFileSync(file, 'utf-8');
    expect(document).toContain(`title: ${LONG_1}`);
    expect(document).not.toContain(ANSWERS[LONG_1].title);
    expect(await taskRow(projectId, 'N-1')).toMatchObject({
      title: ANSWERS[LONG_1].title,
      originalTitle: LONG_1,
      status: 'EN_DESARROLLO',
    });
    // And the next sync sees nothing to contest.
    const run = await sync(projectId).expect(201);
    expect(run.body.summary.conflictsRaised).toBe(0);
    expect(await taskRow(projectId, 'N-1')).toMatchObject({ title: ANSWERS[LONG_1].title, originalTitle: LONG_1 });
  });

  it("a person's title edit stands: it ends the normalization and reaches the document without a conflict", async () => {
    await configure(true);
    const { file, projectId } = await project(entry('N-1', LONG_1));
    await sync(projectId).expect(201);
    await until(noPending(projectId));
    const task = await taskRow(projectId, 'N-1');

    await request(server())
      .patch(`/projects/${projectId}/tasks/${task.id}`)
      .set('Authorization', auth())
      .send({ title: 'Conciliar asistencia con fichadas' })
      .expect(200);

    expect(await taskRow(projectId, 'N-1')).toMatchObject({
      title: 'Conciliar asistencia con fichadas',
      originalTitle: null,
      titleNormalization: null,
    });
    expect(readFileSync(file, 'utf-8')).toContain('title: Conciliar asistencia con fichadas');
    const run = await sync(projectId).expect(201);
    expect(run.body.summary.conflictsRaised).toBe(0);
    expect(await taskRow(projectId, 'N-1')).toMatchObject({ title: 'Conciliar asistencia con fichadas', titleNormalization: null });
    expect(asked).toEqual([LONG_1]);
  });

  it('is refused to anyone who may not spend the LLM on the project, and to non-members', async () => {
    await configure(true);
    const { projectId } = await project(entry('N-1', LONG_1));
    await sync(projectId).expect(201);
    await until(noPending(projectId));
    const task = await taskRow(projectId, 'N-1');

    const email = `dev-${Date.now()}-${Math.floor(Math.random() * 1e6)}@pmhybrid.local`;
    const user = await request(server())
      .post('/users')
      .set('Authorization', auth())
      .send({ displayName: 'Developer', email, password: 'password123' })
      .expect(201);
    const outsider = await request(server()).post('/auth/login').send({ email, password: 'password123' }).expect(200);
    const outsiderAuth = `Bearer ${outsider.body.accessToken}`;
    await request(server())
      .post(`/projects/${projectId}/titles/normalize`)
      .set('Authorization', outsiderAuth)
      .expect(403);

    await request(server())
      .post(`/projects/${projectId}/members`)
      .set('Authorization', auth())
      .send({ actorId: user.body.id })
      .expect(201);
    await assignProjectRole(app.getHttpServer(), auth(), projectId, user.body.id, 'DEVELOPER');

    // A developer writes tasks (task.write) but does not administer the project (project.update).
    await request(server())
      .post(`/projects/${projectId}/titles/normalize`)
      .set('Authorization', outsiderAuth)
      .expect(403);
    await request(server())
      .post(`/projects/${projectId}/tasks/${task.id}/normalize-title`)
      .set('Authorization', outsiderAuth)
      .expect(200);
  });
});
