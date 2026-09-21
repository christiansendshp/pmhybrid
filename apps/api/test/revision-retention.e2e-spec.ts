import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { DEMO_EMAIL, DEMO_PASSWORD } from './../prisma/demo-credentials.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { RevisionRetentionService } from './../src/modules/synchronization/revision-retention.service.js';
import { createScratchDocsPath } from './helpers/scratch-docs.js';

/**
 * Every write-back and every changed sync stored a full copy of the document,
 * forever (Roadmap BUG-07c).
 */
describe('Document revision retention (e2e, Roadmap BUG-07c)', () => {
  let app: INestApplication<App>;
  let ownerToken: string;
  let prisma: PrismaService;
  let retention: RevisionRetentionService;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
    prisma = app.get(PrismaService);
    retention = app.get(RevisionRetentionService);

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
    const res = await request(server())
      .post('/projects')
      .set('Authorization', auth())
      .send({
        name: `Retention E2E ${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
        docsPath: createScratchDocsPath(),
      })
      .expect(201);
    return res.body.id as string;
  }

  /** `count` revisions of one document, oldest first, one minute apart. */
  async function seedRevisions(
    projectId: string,
    kind: 'ROADMAP' | 'AGENTSLOG',
    count: number,
  ) {
    const document = await prisma.document.upsert({
      where: { projectId_kind: { projectId, kind } },
      update: {},
      create: { projectId, kind, filePath: `${kind}.md` },
    });
    const start = Date.now() - count * 60_000;
    for (let i = 0; i < count; i++) {
      await prisma.documentRevision.create({
        data: {
          documentId: document.id,
          contentHash: `${kind}-${i}`,
          rawContent: `# ${kind} ${i}`,
          source: 'SYNC',
          capturedAt: new Date(start + i * 60_000),
        },
      });
    }
    return document.id;
  }

  const hashes = async (documentId: string) =>
    (
      await prisma.documentRevision.findMany({
        where: { documentId },
        orderBy: { capturedAt: 'asc' },
        select: { contentHash: true },
      })
    ).map((revision) => revision.contentHash);

  it('keeps the newest revisions of each document and deletes the older ones', async () => {
    const projectId = await createProject();
    const roadmap = await seedRevisions(projectId, 'ROADMAP', 6);
    const agentslog = await seedRevisions(projectId, 'AGENTSLOG', 2);

    const result = await retention.prune({ keep: 3, projectId });

    expect(await hashes(roadmap)).toEqual([
      'ROADMAP-3',
      'ROADMAP-4',
      'ROADMAP-5',
    ]);
    // A document already under the limit is untouched.
    expect(await hashes(agentslog)).toEqual(['AGENTSLOG-0', 'AGENTSLOG-1']);
    expect(result.deleted).toBeGreaterThanOrEqual(3);
  });

  it('is a no-op the second time, and keeps everything when the count is 0', async () => {
    const projectId = await createProject();
    const roadmap = await seedRevisions(projectId, 'ROADMAP', 4);

    expect((await retention.prune({ keep: 0, projectId })).deleted).toBe(0);
    expect(await hashes(roadmap)).toHaveLength(4);

    await retention.prune({ keep: 2, projectId });
    await retention.prune({ keep: 2, projectId });
    expect(await hashes(roadmap)).toEqual(['ROADMAP-2', 'ROADMAP-3']);
  });

  it('leaves the revision list, a kept revision and the dashboard working, and answers 404 for a deleted one', async () => {
    const projectId = await createProject();
    const roadmap = await seedRevisions(projectId, 'ROADMAP', 5);
    const before = await prisma.documentRevision.findMany({
      where: { documentId: roadmap },
      orderBy: { capturedAt: 'asc' },
    });
    await retention.prune({ keep: 2, projectId });

    const list = await request(server())
      .get(`/projects/${projectId}/documents/roadmap/revisions`)
      .set('Authorization', auth())
      .expect(200);
    expect(list.body).toHaveLength(2);
    await request(server())
      .get(`/projects/${projectId}/documents/roadmap/revisions/${before[4].id}`)
      .set('Authorization', auth())
      .expect(200);
    await request(server())
      .get(`/projects/${projectId}/documents/roadmap/revisions/${before[0].id}`)
      .set('Authorization', auth())
      .expect(404);
    await request(server())
      .get('/dashboard/activity')
      .set('Authorization', auth())
      .expect(200);
  });

  it('trims a backlog larger than one batch', async () => {
    const projectId = await createProject();
    const document = await prisma.document.create({
      data: { projectId, kind: 'ROADMAP', filePath: 'Roadmap.md' },
    });
    const now = Date.now();
    await prisma.documentRevision.createMany({
      data: Array.from({ length: 1200 }, (_, i) => ({
        documentId: document.id,
        contentHash: `bulk-${i}`,
        rawContent: 'x',
        source: 'SYNC' as const,
        capturedAt: new Date(now - (1200 - i) * 1000),
      })),
    });

    const result = await retention.prune({ keep: 100, projectId });

    expect(result.deleted).toBeGreaterThanOrEqual(1100);
    expect(
      await prisma.documentRevision.count({
        where: { documentId: document.id },
      }),
    ).toBe(100);
  });
});
