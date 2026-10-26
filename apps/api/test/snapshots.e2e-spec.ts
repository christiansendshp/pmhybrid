import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma, TaskSourceOrigin, TaskStatus } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { SnapshotService } from './../src/modules/snapshots/snapshot.service.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { DEMO_EMAIL, DEMO_PASSWORD } from './../prisma/demo-credentials.js';
import { createScratchDocsPath } from './helpers/scratch-docs.js';

const DAY = 24 * 60 * 60 * 1000;
const dayKey = (at: Date) => at.toISOString().slice(0, 10);

interface Day {
  day: string;
  source: string;
  total: number;
  done: number;
  byStatus: Record<string, number> | null;
  blocked: number | null;
  openConflicts: number | null;
  progress: number | null;
}

/**
 * One row a day of the state of each active project, and the history of it (Roadmap TASK-46).
 */
describe('Project snapshots (e2e, Roadmap TASK-46)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let snapshots: SnapshotService;
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
    snapshots = moduleFixture.get(SnapshotService);
    const login = await request(server())
      .post('/auth/login')
      .send({ email: DEMO_EMAIL, password: DEMO_PASSWORD })
      .expect(200);
    token = login.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  const server = () => app.getHttpServer();
  const auth = (bearer = token) => `Bearer ${bearer}`;
  const unique = (label: string) =>
    `${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

  async function project(): Promise<string> {
    const created = await request(server())
      .post('/projects')
      .set('Authorization', auth())
      .send({ name: unique('Snapshot E2E'), docsPath: createScratchDocsPath() })
      .expect(201);
    return created.body.id as string;
  }

  const make = (
    projectId: string,
    title: string,
    status: TaskStatus,
    data: Partial<Prisma.TaskUncheckedCreateInput> = {},
  ) =>
    prisma.task.create({
      data: {
        projectId,
        title,
        status,
        completedAt: status === TaskStatus.TERMINADA ? new Date() : null,
        sourceOrigin: TaskSourceOrigin.UI,
        ...data,
      },
    });

  const history = async (projectId: string, query = '', bearer = token) =>
    (
      await request(server())
        .get(`/projects/${projectId}/snapshots${query}`)
        .set('Authorization', auth(bearer))
        .expect(200)
    ).body as Day[];

  it('records the counts a project has, by status, with its blocked tasks and open conflicts', async () => {
    const projectId = await project();
    await make(projectId, 'A', TaskStatus.PENDIENTE);
    await make(projectId, 'B', TaskStatus.EN_DESARROLLO);
    await make(projectId, 'C', TaskStatus.TERMINADA);
    await make(projectId, 'D', TaskStatus.TERMINADA);
    await make(projectId, 'Blocked', TaskStatus.PENDIENTE, {
      roadmapTable: 'BLOCKED',
    });
    await prisma.conflict.create({
      data: {
        projectId,
        kind: 'CONCURRENT_FIELD_EDIT',
        entityType: 'Task',
        entityId: 'x',
        localVersion: {},
      },
    });
    await prisma.conflict.create({
      data: {
        projectId,
        kind: 'CONCURRENT_FIELD_EDIT',
        entityType: 'Task',
        entityId: 'y',
        localVersion: {},
        resolvedAt: new Date(),
      },
    });
    const now = new Date();

    await snapshots.recordDay(now, [projectId]);

    expect(await history(projectId)).toEqual([
      {
        day: dayKey(now),
        source: 'RECORDED',
        total: 5,
        done: 2,
        byStatus: {
          PENDIENTE: 2,
          ASIGNADA: 0,
          EN_DESARROLLO: 1,
          QA: 0,
          TERMINADA: 2,
        },
        blocked: 1,
        openConflicts: 1,
        progress: expect.any(Number),
      },
    ]);
  });

  it('does not count deleted tasks nor the cards that are not work', async () => {
    const projectId = await project();
    await make(projectId, 'Alive', TaskStatus.PENDIENTE);
    await make(projectId, 'Deleted', TaskStatus.PENDIENTE, {
      deletedAt: new Date(),
    });
    await make(projectId, 'An epic card', TaskStatus.PENDIENTE, {
      entryType: 'EPIC',
    });

    await snapshots.recordDay(new Date(), [projectId]);

    expect((await history(projectId))[0]).toMatchObject({ total: 1, done: 0 });
  });

  it('records a project with no tasks as zeros', async () => {
    const projectId = await project();

    await snapshots.recordDay(new Date(), [projectId]);

    expect((await history(projectId))[0]).toMatchObject({
      total: 0,
      done: 0,
      blocked: 0,
    });
  });

  it('writes one row when it runs twice the same day, and keeps the first', async () => {
    const projectId = await project();
    await make(projectId, 'A', TaskStatus.PENDIENTE);
    await snapshots.recordDay(new Date(), [projectId]);
    await make(projectId, 'B', TaskStatus.PENDIENTE);

    const second = await snapshots.recordDay(new Date(), [projectId]);

    expect([
      second.recorded,
      (await history(projectId)).map((d) => d.total),
    ]).toEqual([0, [1]]);
  });

  it('writes one row when two runs happen at the same time', async () => {
    const projectId = await project();

    await Promise.all([
      snapshots.recordDay(new Date(), [projectId]),
      snapshots.recordDay(new Date(), [projectId]),
    ]);

    expect(await history(projectId)).toHaveLength(1);
  });

  it('records a paused or an archived project as nothing', async () => {
    const paused = await project();
    await request(server())
      .patch(`/projects/${paused}`)
      .set('Authorization', auth())
      .send({ status: 'PAUSED' })
      .expect(200);

    const result = await snapshots.recordDay(new Date(), [paused]);

    expect([result.recorded, await history(paused)]).toEqual([0, []]);
  });

  describe('the history', () => {
    async function threeDays() {
      const projectId = await project();
      const today = new Date();
      for (const back of [2, 1, 0]) {
        await make(projectId, `Task ${back}`, TaskStatus.PENDIENTE);
        await snapshots.recordDay(new Date(today.getTime() - back * DAY), [
          projectId,
        ]);
      }
      return { projectId, today };
    }

    it('gives the days oldest first', async () => {
      const { projectId, today } = await threeDays();

      expect((await history(projectId)).map((d) => d.day)).toEqual([
        dayKey(new Date(today.getTime() - 2 * DAY)),
        dayKey(new Date(today.getTime() - DAY)),
        dayKey(today),
      ]);
    });

    it('gives only the last N days, today included', async () => {
      const { projectId, today } = await threeDays();

      expect((await history(projectId, '?days=2')).map((d) => d.day)).toEqual([
        dayKey(new Date(today.getTime() - DAY)),
        dayKey(today),
      ]);
    });

    it.each([['0'], ['366'], ['-1'], ['abc'], ['1.5']])(
      'refuses days=%s, which is outside 1 to 365',
      async (days) => {
        const { projectId } = await threeDays();

        await request(server())
          .get(`/projects/${projectId}/snapshots?days=${days}`)
          .set('Authorization', auth())
          .expect(400);
      },
    );

    it('is refused to someone who is not a member of the project', async () => {
      const projectId = await project();
      const email = `${unique('outsider')}@pmhybrid.local`;
      await request(server())
        .post('/users')
        .set('Authorization', auth())
        .send({ displayName: 'Outsider', email, password: 'password123' })
        .expect(201);
      const login = await request(server())
        .post('/auth/login')
        .send({ email, password: 'password123' })
        .expect(200);

      await request(server())
        .get(`/projects/${projectId}/snapshots`)
        .set('Authorization', auth(login.body.accessToken))
        .expect(403);
    });
  });
});
