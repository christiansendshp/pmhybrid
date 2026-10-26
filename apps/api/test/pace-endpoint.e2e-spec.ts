import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma, TaskSourceOrigin, TaskStatus } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { weekStartOf } from './../src/modules/metrics/pace.util.js';
import { NON_WORK_ENTRY_TYPES } from './../src/modules/roadmap/roadmap-attributes.util.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { DEMO_EMAIL, DEMO_PASSWORD } from './../prisma/demo-credentials.js';
import { createScratchDocsPath } from './helpers/scratch-docs.js';

const DAY = 24 * 60 * 60 * 1000;
const MONDAY = weekStartOf(new Date());
/** A Wednesday, `weeks` weeks before the week in progress (the weeks are drawn from the real clock). */
const ago = (weeks: number, days = 2) =>
  new Date(MONDAY.getTime() - weeks * 7 * DAY + days * DAY);

interface Week {
  weekStart: string;
  completed: number;
  created: number;
  scope: number;
  done: number;
  partial: boolean;
}
interface PhaseLine {
  phaseId: string | null;
  name: string | null;
  weeks: { scope: number; done: number }[];
}

/**
 * The pace, the burn-up and the forecast of a project over the tasks that count towards its progress
 * (Roadmap TASK-36).
 */
describe('Project pace (e2e, Roadmap TASK-36)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let token: string;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
    prisma = moduleFixture.get(PrismaService);
    const login = await request(server())
      .post('/auth/login')
      .send({ email: DEMO_EMAIL, password: DEMO_PASSWORD })
      .expect(200);
    token = login.body.accessToken;
  });

  afterEach(async () => {
    await app.close();
  });

  const server = () => app.getHttpServer();
  const auth = () => `Bearer ${token}`;
  const unique = (label: string) =>
    `${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

  async function emptyProject(): Promise<string> {
    const created = await request(server())
      .post('/projects')
      .set('Authorization', auth())
      .send({ name: unique('Pace E2E'), docsPath: createScratchDocsPath() })
      .expect(201);
    return created.body.id as string;
  }

  /**
   * Seven tasks over five weeks: five count (A1, A2, B1, B2 and a task of no phase) and two do not (a deleted one
   * and an epic card).
   */
  async function projectWithTasks(): Promise<string> {
    const projectId = await emptyProject();
    const [phaseA, phaseB] = await Promise.all([
      prisma.phase.create({ data: { projectId, name: 'Fase A', order: 1 } }),
      prisma.phase.create({ data: { projectId, name: 'Fase B', order: 2 } }),
    ]);
    const make = (
      title: string,
      createdAt: Date,
      completedAt: Date | null,
      extra: Partial<Prisma.TaskUncheckedCreateInput> = {},
    ) =>
      prisma.task.create({
        data: {
          projectId,
          title,
          createdAt,
          completedAt,
          status: completedAt ? TaskStatus.TERMINADA : TaskStatus.PENDIENTE,
          sourceOrigin: TaskSourceOrigin.UI,
          ...extra,
        },
      });
    await make('A1', ago(5), ago(3), { phaseId: phaseA.id });
    await make('A2', ago(3), ago(3, 3), { phaseId: phaseA.id });
    await make('B1', ago(3), null, { phaseId: phaseB.id });
    await make('B2', ago(1), null, { phaseId: phaseB.id });
    await make('No phase', ago(2), ago(1));
    await make('Deleted', ago(2), ago(1), { deletedAt: ago(0) });
    await make('An epic card', ago(2), null, { entryType: 'EPIC' });
    return projectId;
  }

  const pace = (projectId: string, query = '', bearer = auth()) =>
    request(server())
      .get(`/projects/${projectId}/metrics/pace${query}`)
      .set('Authorization', bearer);

  /** The appendix SQL of docs/tracking-improvement-plan.md (#7, #8), with the filter of the progress. */
  const weeklyBySql = async (
    projectId: string,
    column: 'completedAt' | 'createdAt',
  ): Promise<Record<string, number>> => {
    const rows = await prisma.$queryRaw<{ wk: Date; n: number }[]>`
      select date_trunc('week', ${Prisma.raw(`"${column}"`)}) as wk, count(*)::int as n
      from "Task"
      where "projectId" = ${projectId}
        and ${Prisma.raw(`"${column}"`)} is not null
        and "deletedAt" is null
        and ("entryType" is null or "entryType" not in (${Prisma.join([...NON_WORK_ENTRY_TYPES])}))
      group by 1`;
    return Object.fromEntries(
      rows.map((row) => [row.wk.toISOString().slice(0, 10), row.n]),
    );
  };

  const nonEmpty = (weeks: Week[], key: 'completed' | 'created') =>
    Object.fromEntries(
      weeks.filter((week) => week[key] > 0).map((w) => [w.weekStart, w[key]]),
    );

  it('gives the weekly completed tasks the appendix SQL gives over the same tasks', async () => {
    const projectId = await projectWithTasks();

    const res = await pace(projectId).expect(200);

    expect(nonEmpty(res.body.weeks as Week[], 'completed')).toEqual(
      await weeklyBySql(projectId, 'completedAt'),
    );
  });

  it('gives the weekly created tasks the appendix SQL gives over the same tasks', async () => {
    const projectId = await projectWithTasks();

    const res = await pace(projectId).expect(200);

    expect(nonEmpty(res.body.weeks as Week[], 'created')).toEqual(
      await weeklyBySql(projectId, 'createdAt'),
    );
  });

  it('counts neither the deleted tasks nor the cards that are not work', async () => {
    const projectId = await projectWithTasks();

    const res = await pace(projectId).expect(200);

    const last = (res.body.weeks as Week[]).at(-1);
    expect([last?.scope, last?.done]).toEqual([5, 3]);
  });

  it('draws 12 weeks by default, the last being the week in progress', async () => {
    const projectId = await emptyProject();

    const res = await pace(projectId).expect(200);

    const weeks = res.body.weeks as Week[];
    expect([
      weeks.length,
      weeks.at(-1)?.weekStart,
      weeks.at(-1)?.partial,
    ]).toEqual([12, MONDAY.toISOString().slice(0, 10), true]);
  });

  it('draws the number of weeks asked for', async () => {
    const projectId = await emptyProject();

    const res = await pace(projectId, '?weeks=4').expect(200);

    expect(res.body.weeks).toHaveLength(4);
  });

  it.each(['1', '53', '0', '-3', 'abc', '2.5'])(
    'refuses weeks=%s, which is outside 2 to 52',
    async (weeks) => {
      const projectId = await emptyProject();

      await pace(projectId, `?weeks=${weeks}`).expect(400);
    },
  );

  it('gives the forecast the whole history reads whatever the weeks drawn', async () => {
    const projectId = await projectWithTasks();

    const narrow = await pace(projectId, '?weeks=2').expect(200);
    const wide = await pace(projectId, '?weeks=52').expect(200);

    expect(narrow.body.forecast).toEqual(wide.body.forecast);
  });

  it('carries the forecast of the calculator: this project closes less than it opens, so it does not converge', async () => {
    const projectId = await projectWithTasks();

    const res = await pace(projectId).expect(200);

    expect(res.body.forecast).toMatchObject({
      status: 'NOT_CONVERGING',
      openTasks: 2,
      range: null,
    });
  });

  it('names the phases in their order, and puts the tasks of none last, in the burn-up', async () => {
    const projectId = await projectWithTasks();

    const res = await pace(projectId).expect(200);

    expect((res.body.byPhase as PhaseLine[]).map((line) => line.name)).toEqual([
      'Fase A',
      'Fase B',
      null,
    ]);
  });

  it('adds the burn-up of the phases up to the project at the end of every week', async () => {
    const projectId = await projectWithTasks();

    const res = await pace(projectId).expect(200);

    const weeks = res.body.weeks as Week[];
    const lines = res.body.byPhase as PhaseLine[];
    expect(
      weeks.map((_, index) => [
        lines.reduce((sum, line) => sum + line.weeks[index].scope, 0),
        lines.reduce((sum, line) => sum + line.weeks[index].done, 0),
      ]),
    ).toEqual(weeks.map((week) => [week.scope, week.done]));
  });

  it('says there is not enough history, and gives no date, for a project with no tasks', async () => {
    const projectId = await emptyProject();

    const res = await pace(projectId).expect(200);

    expect(res.body.forecast).toEqual({
      status: 'NOT_ENOUGH_HISTORY',
      openTasks: 0,
      windows: [],
      range: null,
    });
  });

  it('is refused to someone who is not a member of the project', async () => {
    const projectId = await emptyProject();
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

    await pace(projectId, '', `Bearer ${login.body.accessToken}`).expect(403);
  });
});
