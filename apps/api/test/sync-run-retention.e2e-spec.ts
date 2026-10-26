import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { SyncStatus, SyncTrigger } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { SyncRunRetentionService } from './../src/modules/synchronization/sync-run-retention.service.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { DEMO_EMAIL, DEMO_PASSWORD } from './../prisma/demo-credentials.js';
import { createScratchDocsPath } from './helpers/scratch-docs.js';

const DAY = 24 * 60 * 60 * 1000;

/**
 * The old sync runs of each project are trimmed to the newest N, every failed one staying (Roadmap TASK-50).
 */
describe('Sync run retention (e2e, Roadmap TASK-50)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let retention: SyncRunRetentionService;
  let token: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
    prisma = moduleFixture.get(PrismaService);
    retention = moduleFixture.get(SyncRunRetentionService);
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: DEMO_EMAIL, password: DEMO_PASSWORD })
      .expect(200);
    token = login.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  async function project(): Promise<string> {
    const created = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: `Retention E2E-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
        docsPath: createScratchDocsPath(),
      })
      .expect(201);
    return created.body.id as string;
  }

  /** A run that started `daysAgo` days ago, with the status given. */
  const run = (
    projectId: string,
    daysAgo: number,
    status: SyncStatus = 'SUCCESS',
  ) =>
    prisma.syncRun.create({
      data: {
        projectId,
        startedAt: new Date(Date.now() - daysAgo * DAY),
        trigger: SyncTrigger.SCHEDULED,
        status,
      },
    });

  const daysOf = async (projectId: string) =>
    (
      await prisma.syncRun.findMany({
        where: { projectId },
        orderBy: { startedAt: 'desc' },
        select: { startedAt: true, status: true },
      })
    ).map((entry) => [
      Math.round((Date.now() - entry.startedAt.getTime()) / DAY),
      entry.status,
    ]);

  it('keeps the newest runs and deletes the older ones', async () => {
    const projectId = await project();
    for (const days of [1, 2, 3, 4, 5, 6]) {
      await run(projectId, days);
    }

    const result = await retention.prune({ keep: 3, projectIds: [projectId] });

    expect([result, await daysOf(projectId)]).toEqual([
      { projects: 1, deleted: 3 },
      [
        [1, 'SUCCESS'],
        [2, 'SUCCESS'],
        [3, 'SUCCESS'],
      ],
    ]);
  });

  it('keeps a failed run however old it is, and deletes the other old ones', async () => {
    const projectId = await project();
    await run(projectId, 1);
    await run(projectId, 2);
    await run(projectId, 30, 'FAILED');
    await run(projectId, 40);
    await run(projectId, 50, 'PARTIAL');

    await retention.prune({ keep: 2, projectIds: [projectId] });

    expect(await daysOf(projectId)).toEqual([
      [1, 'SUCCESS'],
      [2, 'SUCCESS'],
      [30, 'FAILED'],
    ]);
  });

  it('deletes nothing from a project with no more runs than the limit', async () => {
    const projectId = await project();
    await run(projectId, 1);
    await run(projectId, 2);

    const result = await retention.prune({ keep: 2, projectIds: [projectId] });

    expect([result.deleted, (await daysOf(projectId)).length]).toEqual([0, 2]);
  });

  it('keeps everything when the limit is 0', async () => {
    const projectId = await project();
    for (const days of [1, 2, 3]) {
      await run(projectId, days);
    }

    const result = await retention.prune({ keep: 0, projectIds: [projectId] });

    expect([result, (await daysOf(projectId)).length]).toEqual([
      { projects: 0, deleted: 0 },
      3,
    ]);
  });

  it('counts the runs of each project apart', async () => {
    const busy = await project();
    const quiet = await project();
    for (const days of [1, 2, 3, 4]) {
      await run(busy, days);
    }
    await run(quiet, 10);

    await retention.prune({ keep: 2, projectIds: [busy, quiet] });

    expect([(await daysOf(busy)).length, (await daysOf(quiet)).length]).toEqual(
      [2, 1],
    );
  });

  it('leaves the projects it was not asked about alone', async () => {
    const named = await project();
    const other = await project();
    for (const days of [1, 2, 3]) {
      await run(named, days);
      await run(other, days);
    }

    await retention.prune({ keep: 1, projectIds: [named] });

    expect([
      (await daysOf(named)).length,
      (await daysOf(other)).length,
    ]).toEqual([1, 3]);
  });

  it('keeps the runs that share the start time of the last one it keeps', async () => {
    const projectId = await project();
    const startedAt = new Date(Date.now() - 3 * DAY);
    await run(projectId, 1);
    for (let n = 0; n < 2; n += 1) {
      await prisma.syncRun.create({
        data: {
          projectId,
          startedAt,
          trigger: SyncTrigger.SCHEDULED,
          status: 'SUCCESS',
        },
      });
    }
    await run(projectId, 9);

    await retention.prune({ keep: 2, projectIds: [projectId] });

    expect((await daysOf(projectId)).length).toBe(3);
  });

  it('uses the configured limit when none is given, and deletes nothing for a project far under it', async () => {
    const projectId = await project();
    await run(projectId, 1);
    await run(projectId, 2);

    const result = await retention.prune({ projectIds: [projectId] });

    expect(result.deleted).toBe(0);
  });
});
