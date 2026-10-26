import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  Prisma,
  SummaryFrequency,
  TaskSourceOrigin,
  TaskStatus,
} from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { PeriodSummaryService } from './../src/modules/dashboard/period-summary.service.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { DEMO_EMAIL, DEMO_PASSWORD } from './../prisma/demo-credentials.js';
import { createScratchDocsPath } from './helpers/scratch-docs.js';

// 2026-11-02 is a Monday. The summaries are made "at" these moments, whatever day the suite runs.
const MONDAY = new Date('2026-11-02T07:00:00Z');
const TUESDAY = new Date('2026-11-03T07:00:00Z');
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

interface Notified {
  type: string;
  projectId: string;
  payload: Record<string, unknown>;
}

/**
 * The summary of what changed, in the app only, once per person and day (Roadmap TASK-42, DEC-004 D3).
 */
describe('Periodic summary (e2e, Roadmap TASK-42)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let summary: PeriodSummaryService;
  let ownerToken: string;

  const server = () => app.getHttpServer();
  const auth = (token: string) => `Bearer ${token}`;
  const unique = (label: string) =>
    `${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

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
    summary = moduleFixture.get(PeriodSummaryService);
    const login = await request(server())
      .post('/auth/login')
      .send({ email: DEMO_EMAIL, password: DEMO_PASSWORD })
      .expect(200);
    ownerToken = login.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  async function project(name = 'Summary E2E'): Promise<string> {
    const created = await request(server())
      .post('/projects')
      .set('Authorization', auth(ownerToken))
      .send({ name: unique(name), docsPath: createScratchDocsPath() })
      .expect(201);
    return created.body.id as string;
  }

  /** A person (or an agent) who belongs to the projects given, with the frequency given. */
  async function member(
    projectIds: string[],
    frequency?: SummaryFrequency,
    kind: 'HUMAN' | 'AI_AGENT' = 'HUMAN',
  ) {
    let id: string;
    let token = '';
    if (kind === 'HUMAN') {
      const email = `${unique('person')}@pmhybrid.local`;
      const created = await request(server())
        .post('/users')
        .set('Authorization', auth(ownerToken))
        .send({ displayName: unique('Person'), email, password: 'password123' })
        .expect(201);
      id = created.body.id as string;
      const login = await request(server())
        .post('/auth/login')
        .send({ email, password: 'password123' })
        .expect(200);
      token = login.body.accessToken as string;
    } else {
      id = (
        await prisma.actor.create({
          data: { kind: 'AI_AGENT', displayName: unique('Agent') },
        })
      ).id;
    }
    if (frequency) {
      await prisma.actor.update({
        where: { id },
        data: { summaryFrequency: frequency },
      });
    }
    for (const projectId of projectIds) {
      await request(server())
        .post(`/projects/${projectId}/members`)
        .set('Authorization', auth(ownerToken))
        .send({ actorId: id })
        .expect(201);
    }
    return { id, token };
  }

  const task = (
    projectId: string,
    title: string,
    data: Partial<Prisma.TaskUncheckedCreateInput> = {},
  ) =>
    prisma.task.create({
      data: {
        projectId,
        title,
        sourceOrigin: TaskSourceOrigin.UI,
        // Long before every period, so only what a test names is new scope.
        createdAt: new Date('2026-01-01T00:00:00Z'),
        ...data,
      },
    });

  const finishedAt = (projectId: string, title: string, at: Date) =>
    task(projectId, title, { status: TaskStatus.TERMINADA, completedAt: at });

  const summaries = async (token: string): Promise<Notified[]> => {
    const res = await request(server())
      .get('/notifications')
      .set('Authorization', auth(token))
      .expect(200);
    return (res.body as Notified[]).filter((n) => n.type === 'PERIOD_SUMMARY');
  };

  it('sends a person on DAILY the summary of the last day, with its counts, for a project with news', async () => {
    const projectId = await project();
    const person = await member([projectId], 'DAILY');
    await finishedAt(
      projectId,
      'Done 1',
      new Date(MONDAY.getTime() - 2 * HOUR),
    );
    await finishedAt(
      projectId,
      'Done 2',
      new Date(MONDAY.getTime() - 3 * HOUR),
    );
    await task(projectId, 'Blocked', {
      roadmapTable: 'BLOCKED',
      blockedSince: new Date(MONDAY.getTime() - HOUR),
    });
    await task(projectId, 'New', {
      createdAt: new Date(MONDAY.getTime() - 4 * HOUR),
    });

    await summary.sendDue(MONDAY, [person.id]);

    expect(
      (await summaries(person.token)).map((n) => [n.projectId, n.payload]),
    ).toEqual([
      [
        projectId,
        expect.objectContaining({
          period: 'DAILY',
          done: 2,
          blocked: 1,
          unblocked: 0,
          newScope: 1,
          conflicts: 0,
        }),
      ],
    ]);
  });

  it('counts only the last day in a daily summary', async () => {
    const projectId = await project();
    const person = await member([projectId], 'DAILY');
    await finishedAt(
      projectId,
      'Done 3 days ago',
      new Date(MONDAY.getTime() - 3 * DAY),
    );

    await summary.sendDue(MONDAY, [person.id]);

    expect(await summaries(person.token)).toEqual([]);
  });

  it('sends a person on WEEKLY, on Monday, the summary of the last 7 days', async () => {
    const projectId = await project();
    const person = await member([projectId], 'WEEKLY');
    await finishedAt(
      projectId,
      'Done 5 days ago',
      new Date(MONDAY.getTime() - 5 * DAY),
    );

    await summary.sendDue(MONDAY, [person.id]);

    expect((await summaries(person.token)).map((n) => n.payload)).toEqual([
      expect.objectContaining({ period: 'WEEKLY', done: 1 }),
    ]);
  });

  it('sends nothing to a person on WEEKLY on any other day', async () => {
    const projectId = await project();
    const person = await member([projectId], 'WEEKLY');
    await finishedAt(projectId, 'Done', new Date(TUESDAY.getTime() - HOUR));

    await summary.sendDue(TUESDAY, [person.id]);

    expect(await summaries(person.token)).toEqual([]);
  });

  it('is on WEEKLY for a person who never chose', async () => {
    const projectId = await project();
    const person = await member([projectId]);
    await finishedAt(projectId, 'Done', new Date(MONDAY.getTime() - HOUR));

    await summary.sendDue(MONDAY, [person.id]);

    expect(await summaries(person.token)).toHaveLength(1);
  });

  it('sends nothing to a person who chose none', async () => {
    const projectId = await project();
    const person = await member([projectId], 'NONE');
    await finishedAt(projectId, 'Done', new Date(MONDAY.getTime() - HOUR));

    await summary.sendDue(MONDAY, [person.id]);

    expect(await summaries(person.token)).toEqual([]);
  });

  it('never sends one to an agent, whatever it says', async () => {
    const projectId = await project();
    const agent = await member([projectId], 'DAILY', 'AI_AGENT');
    await finishedAt(projectId, 'Done', new Date(MONDAY.getTime() - HOUR));

    const result = await summary.sendDue(MONDAY, [agent.id]);

    expect(result).toEqual({ summaries: 0 });
  });

  it('sends nothing for a project with nothing new, and one summary for the one that has news', async () => {
    const quiet = await project();
    const busy = await project();
    const person = await member([quiet, busy], 'DAILY');
    await finishedAt(busy, 'Done', new Date(MONDAY.getTime() - HOUR));

    await summary.sendDue(MONDAY, [person.id]);

    expect((await summaries(person.token)).map((n) => n.projectId)).toEqual([
      busy,
    ]);
  });

  it('sends once when it runs twice the same day', async () => {
    const projectId = await project();
    const person = await member([projectId], 'DAILY');
    await finishedAt(projectId, 'Done', new Date(MONDAY.getTime() - HOUR));

    await summary.sendDue(MONDAY, [person.id]);
    const again = await summary.sendDue(new Date(MONDAY.getTime() + 3 * HOUR), [
      person.id,
    ]);

    expect([again.summaries, (await summaries(person.token)).length]).toEqual([
      0, 1,
    ]);
  });

  it('sends again the next day', async () => {
    const projectId = await project();
    const person = await member([projectId], 'DAILY');
    await finishedAt(
      projectId,
      'Done Monday',
      new Date(MONDAY.getTime() - HOUR),
    );
    await finishedAt(
      projectId,
      'Done Tuesday',
      new Date(TUESDAY.getTime() - HOUR),
    );

    await summary.sendDue(MONDAY, [person.id]);
    await summary.sendDue(TUESDAY, [person.id]);

    expect(await summaries(person.token)).toHaveLength(2);
  });

  it('sends once when two runs happen at the same time', async () => {
    const projectId = await project();
    const person = await member([projectId], 'DAILY');
    await finishedAt(projectId, 'Done', new Date(MONDAY.getTime() - HOUR));

    await Promise.all([
      summary.sendDue(MONDAY, [person.id]),
      summary.sendDue(MONDAY, [person.id]),
    ]);

    expect(await summaries(person.token)).toHaveLength(1);
  });

  describe('the preference', () => {
    const preferences = (token: string) =>
      request(server())
        .get('/notifications/preferences')
        .set('Authorization', auth(token));
    const choose = (token: string, summaryFrequency: unknown) =>
      request(server())
        .patch('/notifications/preferences')
        .set('Authorization', auth(token))
        .send({ summaryFrequency });

    it('is WEEKLY until the person chooses', async () => {
      const person = await member([]);

      expect((await preferences(person.token).expect(200)).body).toEqual({
        summaryFrequency: 'WEEKLY',
      });
    });

    it('keeps what the person chooses', async () => {
      const person = await member([]);

      await choose(person.token, 'DAILY').expect(200);

      expect((await preferences(person.token).expect(200)).body).toEqual({
        summaryFrequency: 'DAILY',
      });
    });

    it('changes only the caller’s own', async () => {
      const first = await member([]);
      const second = await member([]);

      await choose(first.token, 'NONE').expect(200);

      expect((await preferences(second.token).expect(200)).body).toEqual({
        summaryFrequency: 'WEEKLY',
      });
    });

    it.each([['HOURLY'], [''], [7], [null]])(
      'refuses %j, which is not a frequency',
      async (value) => {
        const person = await member([]);

        await choose(person.token, value).expect(400);
      },
    );

    it('asks for a sign-in', async () => {
      await request(server()).get('/notifications/preferences').expect(401);
    });
  });
});
