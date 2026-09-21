import { readFileSync } from 'node:fs';
import path from 'node:path';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { DEMO_EMAIL, DEMO_PASSWORD } from './../prisma/demo-credentials.js';
import { createScratchDocsPath } from './helpers/scratch-docs.js';

/**
 * No DTO had a length limit (a 90,000-character title made Roadmap.md 96 KB)
 * and `?status=BOGUS` reached Prisma as an invalid enum and answered 500
 * (Roadmap IMPROVEMENT-01b).
 */
describe('Request limits and validation (e2e, Roadmap IMPROVEMENT-01b)', () => {
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

  async function createProject() {
    const docsPath = createScratchDocsPath();
    const res = await request(server())
      .post('/projects')
      .set('Authorization', auth())
      .send({ name: `Limits E2E ${Date.now()}-${Math.random()}`, docsPath })
      .expect(201);
    return { projectId: res.body.id as string, docsPath };
  }

  it('refuses a 90,000-character title with a 400 that names the field, and writes nothing to the document', async () => {
    const { projectId, docsPath } = await createProject();

    const res = await request(server())
      .post(`/projects/${projectId}/tasks`)
      .set('Authorization', auth())
      .send({
        title: 'x'.repeat(90_000),
        acceptanceCriteria: 'Verified by e2e',
      })
      .expect(400);

    expect(JSON.stringify(res.body.message)).toContain(
      'title must be shorter than or equal to 300',
    );
    expect(
      readFileSync(path.join(docsPath, 'Roadmap.md'), 'utf-8').length,
    ).toBeLessThan(2_000);
  });

  it('accepts a title at the limit', async () => {
    const { projectId } = await createProject();

    await request(server())
      .post(`/projects/${projectId}/tasks`)
      .set('Authorization', auth())
      .send({ title: 'x'.repeat(300), acceptanceCriteria: 'Verified by e2e' })
      .expect(201);
  });

  it('answers 400, not 500, for an invalid status filter on the task list', async () => {
    const { projectId } = await createProject();

    const res = await request(server())
      .get(`/projects/${projectId}/tasks?status=BOGUS`)
      .set('Authorization', auth())
      .expect(400);

    expect(JSON.stringify(res.body.message)).toContain('status');
    await request(server())
      .get(`/projects/${projectId}/tasks?status=QA`)
      .set('Authorization', auth())
      .expect(200);
  });

  it('refuses an over-long login password before it is hashed (400, not a slow bcrypt)', async () => {
    await request(server())
      .post('/auth/login')
      .send({ email: DEMO_EMAIL, password: 'p'.repeat(500) })
      .expect(400);
  });
});
