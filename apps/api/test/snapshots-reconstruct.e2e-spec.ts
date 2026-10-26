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

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const dayKey = (at: Date) => at.toISOString().slice(0, 10);
const TODAY = new Date(`${dayKey(new Date())}T00:00:00.000Z`);
/** Noon of the day `back` days before today. */
const noon = (back: number) =>
  new Date(TODAY.getTime() - back * DAY + 12 * HOUR);
/** The UTC day `back` days before today. */
const dayOf = (back: number) => dayKey(new Date(TODAY.getTime() - back * DAY));

interface Day {
  day: string;
  source: string;
  total: number;
  done: number;
  byStatus: unknown;
  blocked: unknown;
  openConflicts: unknown;
  progress: unknown;
}

/**
 * The past days a project has no snapshot for, rebuilt from the dates of its tasks, approximate and labelled so
 * (Roadmap TASK-47).
 */
describe('Rebuilding past snapshots (e2e, Roadmap TASK-47)', () => {
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

  /** A project created `existedDays` days ago (its tasks come after it). */
  async function project(existedDays = 10): Promise<string> {
    const created = await request(server())
      .post('/projects')
      .set('Authorization', auth())
      .send({ name: unique('Rebuild E2E'), docsPath: createScratchDocsPath() })
      .expect(201);
    const projectId = created.body.id as string;
    await prisma.project.update({
      where: { id: projectId },
      data: { createdAt: noon(existedDays) },
    });
    return projectId;
  }

  const make = (
    projectId: string,
    title: string,
    data: Partial<Prisma.TaskUncheckedCreateInput>,
  ) =>
    prisma.task.create({
      data: {
        projectId,
        title,
        status: data.completedAt ? TaskStatus.TERMINADA : TaskStatus.PENDIENTE,
        sourceOrigin: TaskSourceOrigin.UI,
        ...data,
      },
    });

  const rebuild = (projectId: string, query = '', bearer = token) =>
    request(server())
      .post(`/projects/${projectId}/snapshots/reconstruct${query}`)
      .set('Authorization', auth(bearer));

  const history = async (projectId: string, days = 30) =>
    (
      await request(server())
        .get(`/projects/${projectId}/snapshots?days=${days}`)
        .set('Authorization', auth())
        .expect(200)
    ).body as Day[];

  /** Four tasks over a week: kept, finished, deleted and added. */
  async function week(projectId: string) {
    await make(projectId, 'Kept', { createdAt: noon(8) });
    await make(projectId, 'Finished', {
      createdAt: noon(6),
      completedAt: noon(3),
    });
    await make(projectId, 'Deleted', {
      createdAt: noon(5),
      deletedAt: noon(2),
    });
    await make(projectId, 'Added', { createdAt: noon(1) });
  }

  it('gives each missing day the tasks and the done tasks it had at its end', async () => {
    const projectId = await project();
    await week(projectId);

    await rebuild(projectId, '?days=7').expect(200);

    expect(
      (await history(projectId)).map((d) => [d.day, d.total, d.done]),
    ).toEqual([
      [dayOf(7), 1, 0],
      [dayOf(6), 2, 0],
      [dayOf(5), 3, 0],
      [dayOf(4), 3, 0],
      [dayOf(3), 3, 1],
      [dayOf(2), 2, 1],
      [dayOf(1), 3, 1],
    ]);
  });

  it('says the days are rebuilt and leaves empty what it cannot know', async () => {
    const projectId = await project();
    await week(projectId);

    await rebuild(projectId, '?days=2').expect(200);

    expect(await history(projectId)).toEqual([
      expect.objectContaining({
        source: 'RECONSTRUCTED',
        byStatus: null,
        blocked: null,
        openConflicts: null,
        progress: null,
      }),
      expect.objectContaining({ source: 'RECONSTRUCTED' }),
    ]);
  });

  it('answers how many days it wrote, and which', async () => {
    const projectId = await project();
    await week(projectId);

    const res = await rebuild(projectId, '?days=3').expect(200);

    expect(res.body).toEqual({
      written: 3,
      days: [dayOf(3), dayOf(2), dayOf(1)],
    });
  });

  it('never overwrites a day that was recorded', async () => {
    const projectId = await project();
    await week(projectId);
    await snapshots.recordDay(new Date(TODAY.getTime() - 3 * DAY + HOUR), [
      projectId,
    ]);

    const res = await rebuild(projectId, '?days=7').expect(200);

    const recorded = (await history(projectId)).filter(
      (d) => d.day === dayOf(3),
    );
    expect([
      res.body.days.includes(dayOf(3)),
      recorded.map((d) => d.source),
    ]).toEqual([false, ['RECORDED']]);
  });

  it('adds nothing when it runs twice', async () => {
    const projectId = await project();
    await week(projectId);
    await rebuild(projectId, '?days=7').expect(200);

    const again = await rebuild(projectId, '?days=7').expect(200);

    expect([again.body, (await history(projectId)).length]).toEqual([
      { written: 0, days: [] },
      7,
    ]);
  });

  it('does not write today, which is the job’s', async () => {
    const projectId = await project();
    await week(projectId);

    await rebuild(projectId, '?days=7').expect(200);

    expect((await history(projectId)).map((d) => d.day)).not.toContain(
      dayOf(0),
    );
  });

  it('does not write the days before the project existed', async () => {
    const projectId = await project(3);
    await make(projectId, 'Only', { createdAt: noon(3) });

    const res = await rebuild(projectId, '?days=7').expect(200);

    expect(res.body.days).toEqual([dayOf(3), dayOf(2), dayOf(1)]);
  });

  it('does not count the cards that are not work', async () => {
    const projectId = await project();
    await make(projectId, 'Work', { createdAt: noon(5) });
    await make(projectId, 'An epic card', {
      createdAt: noon(5),
      entryType: 'EPIC',
    });

    await rebuild(projectId, '?days=1').expect(200);

    expect((await history(projectId))[0]).toMatchObject({ total: 1 });
  });

  it('uses 30 days when none is asked for', async () => {
    const projectId = await project(40);
    await make(projectId, 'Old', { createdAt: noon(35) });

    const res = await rebuild(projectId).expect(200);

    expect(res.body.written).toBe(30);
  });

  it.each([['0'], ['366'], ['-1'], ['abc'], ['1.5']])(
    'refuses days=%s, which is outside 1 to 365',
    async (days) => {
      const projectId = await project();

      await rebuild(projectId, `?days=${days}`).expect(400);
    },
  );

  it('needs the permission to change the project: a member without it is refused and nothing is written', async () => {
    const projectId = await project();
    await week(projectId);
    const email = `${unique('member')}@pmhybrid.local`;
    const created = await request(server())
      .post('/users')
      .set('Authorization', auth())
      .send({ displayName: 'Member', email, password: 'password123' })
      .expect(201);
    await request(server())
      .post(`/projects/${projectId}/members`)
      .set('Authorization', auth())
      .send({ actorId: created.body.id })
      .expect(201);
    const login = await request(server())
      .post('/auth/login')
      .send({ email, password: 'password123' })
      .expect(200);

    await rebuild(projectId, '?days=7', login.body.accessToken).expect(403);

    expect(await history(projectId)).toEqual([]);
  });

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

    await rebuild(projectId, '', login.body.accessToken).expect(403);
  });
});
