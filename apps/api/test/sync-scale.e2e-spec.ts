import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { DEMO_EMAIL, DEMO_PASSWORD } from './../prisma/demo-credentials.js';
import { createScratchDocsPath } from './helpers/scratch-docs.js';

function chainOf(length: number): string {
  const entries = Array.from({ length }, (_, index) => {
    const id = `CH-${index}`;
    return [
      `### ${id} — Entry`,
      '',
      '```yaml',
      `id: ${id}`,
      'type: TASK',
      `title: Link ${index}`,
      'status: READY',
      ...(index > 0 ? ['depends_on:', `  - CH-${index - 1}`] : []),
      '```',
      '',
    ].join('\n');
  });
  return ['# Roadmap', '', '## Plan', '', ...entries].join('\n');
}

/**
 * Sync checked every dependency for a cycle with one query per hop: a chain of
 * 150 entries took 15 s and 500 outlasted the 20 s transaction, so a large real
 * project could not sync at all (Roadmap IMPROVEMENT-01a).
 */
describe('Sync at scale (e2e, Roadmap IMPROVEMENT-01a)', () => {
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

  it('syncs a 500-entry dependency chain well inside the transaction timeout, every edge linked', async () => {
    const docsPath = createScratchDocsPath();
    writeFileSync(path.join(docsPath, 'Roadmap.md'), chainOf(500), 'utf-8');
    const project = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: `Scale E2E ${Date.now()}-${Math.random()}`, docsPath })
      .expect(201);

    const started = Date.now();
    const run = await request(app.getHttpServer())
      .post(`/projects/${project.body.id}/sync`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(201);
    const elapsed = Date.now() - started;

    expect(run.body.status).toBe('SUCCESS');
    expect(run.body.summary.tasksCreated).toBe(500);
    expect(run.body.summary.dependenciesLinked).toBe(499);
    // The transaction times out at 20 s; the per-hop version could not finish a chain this long.
    expect(elapsed).toBeLessThan(15_000);
  }, 60_000);
});
