import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma, TaskSourceOrigin, TaskStatus } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { DEMO_EMAIL, DEMO_PASSWORD } from './../prisma/demo-credentials.js';
import { createScratchDocsPath } from './helpers/scratch-docs.js';

const HOUR = 60 * 60 * 1000;
const hoursAgo = (hours: number) => new Date(Date.now() - hours * HOUR);

interface Semaphore {
  light: string | null;
  open: number;
  blocked: number;
  counts: Record<string, number>;
}
interface Risks {
  staleAfterHours: number;
  signals: {
    kind: string;
    task: { id: string; externalId: string | null };
    blockedBy?: { externalId: string | null }[];
    idleHours?: number;
  }[];
  criticalPath: { task: { externalId: string | null }; status: string }[];
  project: Semaphore;
  phases: { phaseId: string; name: string; semaphore: Semaphore }[];
  epics: { epicId: string; name: string; semaphore: Semaphore }[];
}

/**
 * The risks of a project: the signals, the critical path and the semaphores, over its open tasks (Roadmap TASK-44).
 */
describe('Risks (e2e, Roadmap TASK-44)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let token: string;
  let demoActorId: string;

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
    const login = await request(server())
      .post('/auth/login')
      .send({ email: DEMO_EMAIL, password: DEMO_PASSWORD })
      .expect(200);
    token = login.body.accessToken;
    demoActorId = (
      await prisma.actor.findFirstOrThrow({ where: { email: DEMO_EMAIL } })
    ).id;
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
      .send({ name: unique('Risks E2E'), docsPath: createScratchDocsPath() })
      .expect(201);
    return created.body.id as string;
  }

  /** A task the project holds, owned (so only what a test names is a risk) and in development unless said otherwise. */
  const make = (
    projectId: string,
    externalId: string,
    data: Partial<Prisma.TaskUncheckedCreateInput> = {},
  ) =>
    prisma.task.create({
      data: {
        projectId,
        externalId,
        title: `Work ${externalId}`,
        status: TaskStatus.PENDIENTE,
        rawOwner: 'Someone',
        sourceOrigin: TaskSourceOrigin.UI,
        ...data,
      },
    });

  const developing = (
    projectId: string,
    externalId: string,
    data: Partial<Prisma.TaskUncheckedCreateInput> = {},
  ) =>
    make(projectId, externalId, {
      status: TaskStatus.EN_DESARROLLO,
      statusChangedAt: new Date(),
      ...data,
    });

  const dependsOn = (taskId: string, dependsOnTaskId: string) =>
    prisma.taskDependency.create({ data: { taskId, dependsOnTaskId } });

  const risks = async (projectId: string, bearer = token): Promise<Risks> =>
    (
      await request(server())
        .get(`/projects/${projectId}/risks`)
        .set('Authorization', auth(bearer))
        .expect(200)
    ).body;

  const of = (data: Risks, kind: string) =>
    data.signals
      .filter((signal) => signal.kind === kind)
      .map((signal) => signal.task.externalId);

  it('lists a task in development that nobody holds, and not the ones somebody holds', async () => {
    const projectId = await project();
    await developing(projectId, 'NOBODY', { rawOwner: null });
    await developing(projectId, 'PLACEHOLDER', { rawOwner: '—' });
    await developing(projectId, 'AGENT', {
      rawOwner: 'Agent@2026-10-01T10:00:00Z',
    });
    await developing(projectId, 'ASSIGNED', {
      rawOwner: null,
      assigneeActorId: demoActorId,
    });

    expect(of(await risks(projectId), 'UNOWNED_IN_DEVELOPMENT').sort()).toEqual(
      ['NOBODY', 'PLACEHOLDER'],
    );
  });

  it('lists a task that depends on a blocked one, naming the blocker', async () => {
    const projectId = await project();
    const blocker = await make(projectId, 'BLOCKER', {
      roadmapTable: 'BLOCKED',
    });
    const waiting = await make(projectId, 'WAITING');
    await dependsOn(waiting.id, blocker.id);

    const { signals } = await risks(projectId);

    expect(
      signals.map((s) => [
        s.kind,
        s.task.externalId,
        s.blockedBy?.map((b) => b.externalId),
      ]),
    ).toEqual([['BLOCKED_BY_BLOCKED', 'WAITING', ['BLOCKER']]]);
  });

  it('does not list a task whose blocked dependency is finished', async () => {
    const projectId = await project();
    const blocker = await make(projectId, 'BLOCKER', {
      roadmapTable: 'BLOCKED',
      status: TaskStatus.TERMINADA,
      completedAt: new Date(),
    });
    const waiting = await make(projectId, 'WAITING');
    await dependsOn(waiting.id, blocker.id);

    expect(of(await risks(projectId), 'BLOCKED_BY_BLOCKED')).toEqual([]);
  });

  describe('a task in development with no activity', () => {
    it('is stale after 72 hours by default, and the answer says the threshold', async () => {
      const projectId = await project();
      await developing(projectId, 'OLD', { statusChangedAt: hoursAgo(100) });
      await developing(projectId, 'FRESH', { statusChangedAt: hoursAgo(10) });

      const data = await risks(projectId);

      expect([data.staleAfterHours, of(data, 'STALE_IN_DEVELOPMENT')]).toEqual([
        72,
        ['OLD'],
      ]);
    });

    it('is not stale when the ledger has an entry about it since', async () => {
      const projectId = await project();
      const task = await developing(projectId, 'LEDGER', {
        statusChangedAt: hoursAgo(300),
      });
      await prisma.agentLogEvent.create({
        data: {
          projectId,
          taskId: task.id,
          taskExternalId: 'LEDGER',
          agentName: 'tester',
          timestampFromLog: hoursAgo(1),
          statusWord: 'IN_PROGRESS',
          summary: 's',
          files: '',
          verify: 'v',
          followUp: '',
          rawEntryHash: unique('hash'),
          sourceDocumentRevisionId: 'none',
        },
      });

      expect(of(await risks(projectId), 'STALE_IN_DEVELOPMENT')).toEqual([]);
    });

    it('is not stale when somebody commented on it since', async () => {
      const projectId = await project();
      const task = await developing(projectId, 'COMMENT', {
        statusChangedAt: hoursAgo(300),
      });
      await prisma.taskComment.create({
        data: {
          taskId: task.id,
          authorActorId: demoActorId,
          body: 'Still on it',
        },
      });

      expect(of(await risks(projectId), 'STALE_IN_DEVELOPMENT')).toEqual([]);
    });

    it('is stale by the threshold the project sets, which is validated', async () => {
      const projectId = await project();
      await developing(projectId, 'OLD', { statusChangedAt: hoursAgo(100) });
      await request(server())
        .patch(`/projects/${projectId}`)
        .set('Authorization', auth())
        .send({ staleAfterHours: 500 })
        .expect(200);

      const data = await risks(projectId);

      expect([data.staleAfterHours, of(data, 'STALE_IN_DEVELOPMENT')]).toEqual([
        500,
        [],
      ]);
    });

    it.each([[0], [8761], [1.5], ['often']])(
      'refuses a threshold of %j',
      async (staleAfterHours) => {
        const projectId = await project();

        await request(server())
          .patch(`/projects/${projectId}`)
          .set('Authorization', auth())
          .send({ staleAfterHours })
          .expect(400);
      },
    );
  });

  it('lists an open task past its due date, and not a finished one', async () => {
    const projectId = await project();
    await make(projectId, 'LATE', { dueDate: hoursAgo(30) });
    await make(projectId, 'FUTURE', {
      dueDate: new Date(Date.now() + 30 * HOUR),
    });
    await make(projectId, 'DONE-LATE', {
      dueDate: hoursAgo(30),
      status: TaskStatus.TERMINADA,
      completedAt: new Date(),
    });

    expect(of(await risks(projectId), 'OVERDUE')).toEqual(['LATE']);
  });

  it('gives the longest open dependency chain, in the order the work has to be done', async () => {
    const projectId = await project();
    const first = await make(projectId, 'C1');
    const second = await make(projectId, 'C2');
    const third = await make(projectId, 'C3');
    const other = await make(projectId, 'X1');
    const another = await make(projectId, 'X2');
    await dependsOn(second.id, first.id);
    await dependsOn(third.id, second.id);
    await dependsOn(another.id, other.id);

    const { criticalPath } = await risks(projectId);

    expect(criticalPath.map((step) => step.task.externalId)).toEqual([
      'C1',
      'C2',
      'C3',
    ]);
  });

  it('answers empty lists and green for a project with open work and nothing wrong', async () => {
    const projectId = await project();
    await developing(projectId, 'FINE');

    const data = await risks(projectId);

    expect([data.signals, data.criticalPath, data.project.light]).toEqual([
      [],
      [],
      'GREEN',
    ]);
  });

  it('answers no light for a project with nothing open', async () => {
    const projectId = await project();

    expect((await risks(projectId)).project).toMatchObject({
      light: null,
      open: 0,
    });
  });

  it('gives each phase and epic its light with the counts, in the phases’ own order, and none for a phase with nothing open', async () => {
    const projectId = await project();
    const [first, second, finished] = await Promise.all([
      prisma.phase.create({ data: { projectId, name: 'Build', order: 2 } }),
      prisma.phase.create({ data: { projectId, name: 'Plan', order: 1 } }),
      prisma.phase.create({ data: { projectId, name: 'Ship', order: 3 } }),
    ]);
    const epic = await prisma.epic.create({
      data: { projectId, name: 'Onboarding', order: 1, phaseId: first.id },
    });
    await make(projectId, 'LATE', {
      phaseId: first.id,
      epicId: epic.id,
      dueDate: hoursAgo(5),
    });
    await make(projectId, 'OK', { phaseId: second.id });
    await make(projectId, 'DONE', {
      phaseId: finished.id,
      status: TaskStatus.TERMINADA,
      completedAt: new Date(),
    });

    const data = await risks(projectId);

    expect([
      data.phases.map((phase) => [
        phase.name,
        phase.semaphore.light,
        phase.semaphore.open,
      ]),
      data.epics.map((e) => [
        e.name,
        e.semaphore.light,
        e.semaphore.counts['OVERDUE'],
      ]),
    ]).toEqual([
      [
        ['Plan', 'GREEN', 1],
        ['Build', 'RED', 1],
        ['Ship', null, 0],
      ],
      [['Onboarding', 'RED', 1]],
    ]);
  });

  it('does not count the cards that are not work nor the deleted tasks', async () => {
    const projectId = await project();
    await developing(projectId, 'CARD', { rawOwner: null, entryType: 'EPIC' });
    await developing(projectId, 'GONE', {
      rawOwner: null,
      deletedAt: new Date(),
    });

    expect((await risks(projectId)).signals).toEqual([]);
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

    await request(server())
      .get(`/projects/${projectId}/risks`)
      .set('Authorization', auth(login.body.accessToken))
      .expect(403);
  });
});
