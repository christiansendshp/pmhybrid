import { readFileSync } from 'node:fs';
import path from 'node:path';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { DEMO_EMAIL, DEMO_PASSWORD } from './../prisma/demo-credentials.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { createScratchDocsPath } from './helpers/scratch-docs.js';

/**
 * A client that timed out after the server created a task could not tell, and
 * retrying created a second one (Roadmap BUG-07b).
 */
describe('Idempotent task creation (e2e, Roadmap BUG-07b)', () => {
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
  const unique = (label: string) =>
    `${label} ${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

  /** A key has no spaces, unlike the names `unique` makes. */
  const uniqueKey = (label: string) =>
    `${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

  async function createProject() {
    const docsPath = createScratchDocsPath();
    const res = await request(server())
      .post('/projects')
      .set('Authorization', auth())
      .send({ name: unique('Idempotency E2E'), docsPath })
      .expect(201);
    return { projectId: res.body.id as string, docsPath };
  }

  const body = { title: 'Created once', acceptanceCriteria: 'Verified' };

  const create = (
    projectId: string,
    key: string | null,
    payload: object = body,
  ) => {
    const req = request(server())
      .post(`/projects/${projectId}/tasks`)
      .set('Authorization', auth());
    return (key === null ? req : req.set('Idempotency-Key', key)).send(payload);
  };

  async function taskCount(projectId: string) {
    const res = await request(server())
      .get(`/projects/${projectId}/tasks`)
      .set('Authorization', auth())
      .expect(200);
    return (res.body as unknown[]).length;
  }

  it('answers a repeat of the same request with the task the first one created', async () => {
    const { projectId, docsPath } = await createProject();
    const key = uniqueKey('retry');

    const first = await create(projectId, key).expect(201);
    const second = await create(projectId, key).expect(201);

    expect(second.body.id).toBe(first.body.id);
    expect(second.body.externalId).toBe(first.body.externalId);
    expect(await taskCount(projectId)).toBe(1);
    // The document was written once, not twice.
    const roadmap = readFileSync(path.join(docsPath, 'Roadmap.md'), 'utf-8');
    expect(roadmap.split(first.body.externalId)).toHaveLength(2);
  });

  it('keeps creating a task per request when there is no key, as before', async () => {
    const { projectId } = await createProject();

    await create(projectId, null).expect(201);
    await create(projectId, null).expect(201);

    expect(await taskCount(projectId)).toBe(2);
  });

  it('refuses a key reused for a different request, and creates nothing for it', async () => {
    const { projectId } = await createProject();
    const key = uniqueKey('reused');
    await create(projectId, key).expect(201);

    const res = await create(projectId, key, {
      ...body,
      title: 'Something else',
    }).expect(422);

    expect(res.body.message).toMatch(/different request/);
    expect(await taskCount(projectId)).toBe(1);
  });

  it('refuses a malformed key with a 400', async () => {
    const { projectId } = await createProject();

    await create(projectId, 'has a space').expect(400);
    await create(projectId, 'k'.repeat(129)).expect(400);
    expect(await taskCount(projectId)).toBe(0);
  });

  it('does not share a key between projects', async () => {
    const one = await createProject();
    const other = await createProject();
    const key = uniqueKey('shared');

    const first = await create(one.projectId, key).expect(201);
    const second = await create(other.projectId, key).expect(201);

    expect(second.body.id).not.toBe(first.body.id);
  });

  it('releases the key when its task has been removed, and forgets it after the retention window', async () => {
    const { projectId } = await createProject();
    const prisma = app.get(PrismaService);
    const key = uniqueKey('lifecycle');

    const first = await create(projectId, key).expect(201);
    await request(server())
      .delete(`/projects/${projectId}/tasks/${first.body.id}`)
      .set('Authorization', auth())
      .expect(200);
    const afterRemoval = await create(projectId, key).expect(201);
    expect(afterRemoval.body.id).not.toBe(first.body.id);

    // Older than the window: the key no longer stands for the task.
    await prisma.idempotencyKey.updateMany({
      where: { projectId, key },
      data: { createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000) },
    });
    const afterWindow = await create(projectId, key).expect(201);
    expect(afterWindow.body.id).not.toBe(afterRemoval.body.id);
    expect(await prisma.idempotencyKey.count({ where: { projectId } })).toBe(1);
  });

  it('answers two simultaneous requests with one key with one task', async () => {
    const { projectId } = await createProject();
    const key = uniqueKey('race');

    const [a, b] = await Promise.all([
      create(projectId, key),
      create(projectId, key),
    ]);

    expect([a.status, b.status]).toEqual([201, 201]);
    expect(a.body.id).toBe(b.body.id);
    expect(await taskCount(projectId)).toBe(1);
  });
});
