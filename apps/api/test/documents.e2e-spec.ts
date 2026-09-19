import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { DEMO_EMAIL, DEMO_PASSWORD } from './../prisma/demo-credentials.js';
import { createScratchDocsPath } from './helpers/scratch-docs.js';

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
    // docs/Roadmap.md converted to the new per-entry schema (Roadmap
    // GAP-28) -- '## Cross-cutting' is a stable structural heading the
    // schema always has, unlike specific entry content that comes and goes.
    expect(res.body.content).toContain('## Cross-cutting');
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

  describe('revision history (brief §10)', () => {
    const server = () => app.getHttpServer();
    const auth = () => `Bearer ${ownerToken}`;

    async function createProjectAt(docsPath: string) {
      const res = await request(server())
        .post('/projects')
        .set('Authorization', auth())
        .send({ name: `Documents E2E ${Date.now()}-${Math.random()}`, docsPath })
        .expect(201);
      return res.body.id as string;
    }

    it('is empty for a project that has never synced', async () => {
      const projectId = await createProjectAt(createScratchDocsPath());

      const res = await request(server())
        .get(`/projects/${projectId}/documents/roadmap/revisions`)
        .set('Authorization', auth())
        .expect(200);
      expect(res.body).toEqual([]);
    });

    it('records one revision per synced, content-bearing document, newest first', async () => {
      const projectId = await createProjectAt(createScratchDocsPath());
      await request(server()).post(`/projects/${projectId}/sync`).set('Authorization', auth()).expect(201);

      const roadmapRevisions = await request(server())
        .get(`/projects/${projectId}/documents/roadmap/revisions`)
        .set('Authorization', auth())
        .expect(200);
      expect(roadmapRevisions.body).toHaveLength(1);
      expect(roadmapRevisions.body[0]).toMatchObject({ source: 'SYNC' });
      expect(roadmapRevisions.body[0].rawContent).toBeUndefined(); // list omits full content

      // The scratch docs dir has no ProductDescription.md — nothing to revise.
      const missingKindRevisions = await request(server())
        .get(`/projects/${projectId}/documents/product-description/revisions`)
        .set('Authorization', auth())
        .expect(200);
      expect(missingKindRevisions.body).toEqual([]);
    });

    it('fetches one revision by id with its full content, and 404s for a revision from a different document', async () => {
      const projectId = await createProjectAt(createScratchDocsPath());
      await request(server()).post(`/projects/${projectId}/sync`).set('Authorization', auth()).expect(201);

      const list = await request(server())
        .get(`/projects/${projectId}/documents/roadmap/revisions`)
        .set('Authorization', auth())
        .expect(200);
      const revisionId = list.body[0].id as string;

      const one = await request(server())
        .get(`/projects/${projectId}/documents/roadmap/revisions/${revisionId}`)
        .set('Authorization', auth())
        .expect(200);
      expect(one.body.rawContent).toContain('## Active work');

      // Same id, wrong kind segment — must not leak the roadmap revision's content.
      await request(server())
        .get(`/projects/${projectId}/documents/agentslog/revisions/${revisionId}`)
        .set('Authorization', auth())
        .expect(404);
    });

    it('404s for an unknown revision id', async () => {
      const projectId = await createProjectAt(createScratchDocsPath());
      await request(server())
        .get(`/projects/${projectId}/documents/roadmap/revisions/00000000-0000-0000-0000-000000000000`)
        .set('Authorization', auth())
        .expect(404);
    });
  });
});
