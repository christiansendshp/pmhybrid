import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { DEMO_EMAIL, DEMO_PASSWORD } from './../prisma/demo-credentials.js';

// pmhybrid-self, seeded by prisma/seed.ts, points docsPath at this repo's
// own docs/ — real content, not synthetic fixtures (see seed.ts comment).
const SELF_PROJECT_ID = 'pmhybrid-self';

describe('Documents (roadmap parser, e2e)', () => {
  let app: INestApplication<App>;
  let ownerToken: string;

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
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns the raw Roadmap.md content for the documental view', async () => {
    const res = await request(app.getHttpServer())
      .get(`/projects/${SELF_PROJECT_ID}/documents/roadmap/raw`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    expect(res.body.kind).toBe('roadmap');
    expect(res.body.content).toContain('## Active work');
  });

  it('returns 404 for an unknown document kind', () => {
    return request(app.getHttpServer())
      .get(`/projects/${SELF_PROJECT_ID}/documents/bogus/raw`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(404);
  });

  it('parses the real Roadmap.md into structured rows, discriminated by column signature', async () => {
    const res = await request(app.getHttpServer())
      .get(`/projects/${SELF_PROJECT_ID}/documents/roadmap/structured`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    // pmhybrid-self dogfoods this repo's own live docs/Roadmap.md — as of
    // FASE-12 (the last phase) its Active/Near-term/Blocked tables are all
    // placeholder ("—") rows, which the parser correctly treats as empty
    // (roadmap-parser.service.ts). An empty result here is therefore valid,
    // real behavior, not a parsing failure — so this only asserts the shape
    // of whatever rows do come back, rather than requiring a nonzero count.
    expect(Array.isArray(res.body)).toBe(true);
    for (const row of res.body) {
      expect(['ACTIVE', 'NEAR_TERM', 'BLOCKED']).toContain(row.table);
      expect(typeof row.externalId).toBe('string');
    }
  });

  it('parses a project with active/near-term/blocked rows into all three discriminated tables', async () => {
    const res = await request(app.getHttpServer())
      .get('/projects/demo-website-relaunch/documents/roadmap/structured')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    const tables = new Set(res.body.map((row: { table: string }) => row.table));
    expect(tables).toEqual(new Set(['ACTIVE', 'NEAR_TERM', 'BLOCKED']));
    for (const row of res.body) {
      expect(typeof row.externalId).toBe('string');
    }
  });

  it('parses the real Agentslog.md without matching the fenced format example', async () => {
    const res = await request(app.getHttpServer())
      .get(`/projects/${SELF_PROJECT_ID}/documents/agentslog/structured`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    expect(res.body.entries.length).toBeGreaterThan(0);
    expect(res.body.entries.some((e: { taskExternalId: string }) => e.taskExternalId === 'TASK-ID')).toBe(
      false,
    );
  });

  it('denies an unauthenticated request', () => {
    return request(app.getHttpServer())
      .get(`/projects/${SELF_PROJECT_ID}/documents/roadmap/raw`)
      .expect(401);
  });
});
