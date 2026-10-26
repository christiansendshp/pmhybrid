import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma, TaskSourceOrigin, TaskStatus } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { DEMO_EMAIL, DEMO_PASSWORD } from './../prisma/demo-credentials.js';
import { createScratchDocsPath } from './helpers/scratch-docs.js';

const DAY = 24 * 60 * 60 * 1000;
/** Days before now. */
const ago = (days: number) => new Date(Date.now() - days * DAY);

interface Kind {
  count: number;
  tasks: { id: string; externalId: string | null; title: string }[];
}
interface News {
  projectId: string;
  name: string;
  since: string;
  done: Kind;
  blocked: Kind;
  unblocked: Kind;
  newScope: Kind;
  conflicts: number;
}

/**
 * What changed in each of a person's projects since they last marked it as seen, from a marker only they move
 * (Roadmap TASK-38).
 */
describe('Since the last visit (e2e, Roadmap TASK-38)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let token: string;
  let demoActorId: string;

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
    demoActorId = (
      await prisma.actor.findFirstOrThrow({ where: { email: DEMO_EMAIL } })
    ).id;
  });

  afterEach(async () => {
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
      .send({ name: unique('Visit E2E'), docsPath: createScratchDocsPath() })
      .expect(201);
    return created.body.id as string;
  }

  /** A project the demo person last saw 3 days ago. */
  async function seenThreeDaysAgo(): Promise<string> {
    const projectId = await project();
    await prisma.projectSeen.create({
      data: { actorId: demoActorId, projectId, seenAt: ago(3) },
    });
    return projectId;
  }

  const make = (
    projectId: string,
    title: string,
    data: Partial<Prisma.TaskUncheckedCreateInput> = {},
  ) =>
    prisma.task.create({
      data: {
        projectId,
        title,
        sourceOrigin: TaskSourceOrigin.UI,
        // Created long before the marker unless a test says otherwise, so only what it names is new scope.
        createdAt: ago(30),
        ...data,
      },
    });

  const done = (projectId: string, title: string, completedAt: Date) =>
    make(projectId, title, {
      status: TaskStatus.TERMINADA,
      completedAt,
    });

  const read = async (bearer = token) =>
    (
      await request(server())
        .get('/dashboard/since-last-visit')
        .set('Authorization', auth(bearer))
        .expect(200)
    ).body as { generatedAt: string; projects: News[] };

  const newsOf = async (projectId: string, bearer = token) =>
    (await read(bearer)).projects.find(
      (entry) => entry.projectId === projectId,
    );

  const titles = (kind: Kind | undefined) => kind?.tasks.map((t) => t.title);

  it('lists the tasks completed after the marker, and not the ones completed before it', async () => {
    const projectId = await seenThreeDaysAgo();
    await done(projectId, 'Done after', ago(1));
    await done(projectId, 'Done before', ago(5));

    const news = await newsOf(projectId);

    expect([news?.done.count, titles(news?.done)]).toEqual([1, ['Done after']]);
  });

  it('lists the tasks put in the Blocked table after the marker, and not the ones put there before it', async () => {
    const projectId = await seenThreeDaysAgo();
    await make(projectId, 'Blocked after', {
      roadmapTable: 'BLOCKED',
      blockedSince: ago(1),
    });
    await make(projectId, 'Blocked before', {
      roadmapTable: 'BLOCKED',
      blockedSince: ago(5),
    });

    const news = await newsOf(projectId);

    expect([news?.blocked.count, titles(news?.blocked)]).toEqual([
      1,
      ['Blocked after'],
    ]);
  });

  it('lists the tasks the audit shows taken out of the Blocked table, but not the ones blocked again or completed', async () => {
    const projectId = await seenThreeDaysAgo();
    const freed = await make(projectId, 'Freed');
    const blockedAgain = await make(projectId, 'Blocked again', {
      roadmapTable: 'BLOCKED',
      blockedSince: ago(1),
    });
    const finished = await done(projectId, 'Finished while blocked', ago(1));
    const event = (
      entityId: string,
      newValue: Prisma.InputJsonValue,
      occurredAt = ago(1),
    ) =>
      prisma.auditEvent.create({
        data: {
          projectId,
          entityType: 'Task',
          entityId,
          operation: 'UPDATE',
          previousValue: { roadmapTable: 'BLOCKED' },
          newValue,
          origin: 'SYNC',
          occurredAt,
        },
      });
    await event(freed.id, { roadmapTable: 'ACTIVE' });
    await event(blockedAgain.id, { roadmapTable: 'ACTIVE' });
    await event(finished.id, { status: 'TERMINADA', roadmapTable: null });

    const news = await newsOf(projectId);

    expect([news?.unblocked.count, titles(news?.unblocked)]).toEqual([
      1,
      ['Freed'],
    ]);
  });

  it('does not list a move out of the Blocked table that happened before the marker', async () => {
    const projectId = await seenThreeDaysAgo();
    const freed = await make(projectId, 'Freed long ago', {
      // Something else is new, so the project is listed and the answer is about the unblocked ones only.
      createdAt: ago(1),
    });
    await prisma.auditEvent.create({
      data: {
        projectId,
        entityType: 'Task',
        entityId: freed.id,
        operation: 'UPDATE',
        previousValue: { roadmapTable: 'BLOCKED' },
        newValue: { roadmapTable: 'ACTIVE' },
        origin: 'SYNC',
        occurredAt: ago(5),
      },
    });

    const news = await newsOf(projectId);

    expect(news?.unblocked.count).toBe(0);
  });

  it('lists the tasks that appeared after the marker as new scope', async () => {
    const projectId = await seenThreeDaysAgo();
    await make(projectId, 'New', { createdAt: ago(1) });
    await make(projectId, 'Old', { createdAt: ago(5) });

    const news = await newsOf(projectId);

    expect([news?.newScope.count, titles(news?.newScope)]).toEqual([
      1,
      ['New'],
    ]);
  });

  it('counts the conflicts opened after the marker that are still open', async () => {
    const projectId = await seenThreeDaysAgo();
    const conflict = (detectedAt: Date, resolvedAt: Date | null = null) =>
      prisma.conflict.create({
        data: {
          projectId,
          kind: 'CONCURRENT_FIELD_EDIT',
          entityType: 'Task',
          entityId: 'x',
          localVersion: {},
          detectedAt,
          resolvedAt,
        },
      });
    await conflict(ago(1));
    await conflict(ago(2));
    await conflict(ago(1), ago(0.5));
    await conflict(ago(5));

    const news = await newsOf(projectId);

    expect(news?.conflicts).toBe(2);
  });

  it('counts from the last 7 days when the person has never marked the project', async () => {
    const projectId = await project();
    await done(projectId, 'Done 3 days ago', ago(3));
    await done(projectId, 'Done 10 days ago', ago(10));

    const news = await newsOf(projectId);

    expect([titles(news?.done), Date.parse(news?.since ?? '') / DAY]).toEqual([
      ['Done 3 days ago'],
      expect.closeTo(ago(7).getTime() / DAY, 1),
    ]);
  });

  it('names the first ten tasks of a kind and counts all of them', async () => {
    const projectId = await seenThreeDaysAgo();
    for (let index = 0; index < 12; index += 1) {
      await done(projectId, `Done ${index}`, ago(1));
    }

    const news = await newsOf(projectId);

    expect([news?.done.count, news?.done.tasks.length]).toEqual([12, 10]);
  });

  it('does not list a project with nothing new', async () => {
    const projectId = await seenThreeDaysAgo();
    await done(projectId, 'Done before', ago(5));

    expect(await newsOf(projectId)).toBeUndefined();
  });

  it('does not count the cards that are not work nor the deleted tasks', async () => {
    const projectId = await seenThreeDaysAgo();
    await make(projectId, 'An epic card', {
      entryType: 'EPIC',
      createdAt: ago(1),
    });
    await make(projectId, 'Deleted', {
      createdAt: ago(1),
      deletedAt: ago(0.5),
    });

    expect(await newsOf(projectId)).toBeUndefined();
  });

  describe('marking a project as seen', () => {
    it('moves the marker, so the next read has nothing new for it', async () => {
      const projectId = await seenThreeDaysAgo();
      await done(projectId, 'Done after', ago(1));

      const marked = await request(server())
        .post('/dashboard/since-last-visit/seen')
        .set('Authorization', auth())
        .send({ projectIds: [projectId] })
        .expect(200);

      expect([marked.body, await newsOf(projectId)]).toEqual([
        { projectIds: [projectId] },
        undefined,
      ]);
    });

    it('marks every project of the person when none is named', async () => {
      const first = await seenThreeDaysAgo();
      const second = await seenThreeDaysAgo();
      await done(first, 'Done after', ago(1));
      await done(second, 'Done after', ago(1));

      await request(server())
        .post('/dashboard/since-last-visit/seen')
        .set('Authorization', auth())
        .send({})
        .expect(200);

      const listed = (await read()).projects.map((entry) => entry.projectId);
      expect([listed.includes(first), listed.includes(second)]).toEqual([
        false,
        false,
      ]);
    });

    it('leaves every other member where they were: they still have the news', async () => {
      const projectId = await seenThreeDaysAgo();
      await done(projectId, 'Done after', ago(1));
      const email = `${unique('member')}@pmhybrid.local`;
      const created = await request(server())
        .post('/users')
        .set('Authorization', auth())
        .send({ displayName: unique('Member'), email, password: 'password123' })
        .expect(201);
      await request(server())
        .post(`/projects/${projectId}/members`)
        .set('Authorization', auth())
        .send({ actorId: created.body.id })
        .expect(201);
      const other = await request(server())
        .post('/auth/login')
        .send({ email, password: 'password123' })
        .expect(200);

      await request(server())
        .post('/dashboard/since-last-visit/seen')
        .set('Authorization', auth())
        .send({ projectIds: [projectId] })
        .expect(200);

      const theirs = await newsOf(projectId, other.body.accessToken);
      expect(titles(theirs?.done)).toEqual(['Done after']);
    });

    it('leaves alone a project the person does not belong to', async () => {
      const projectId = await project();
      await prisma.projectMember.updateMany({
        where: { projectId, actorId: demoActorId },
        data: { isActive: false },
      });

      const marked = await request(server())
        .post('/dashboard/since-last-visit/seen')
        .set('Authorization', auth())
        .send({ projectIds: [projectId] })
        .expect(200);

      expect([
        marked.body,
        await prisma.projectSeen.count({ where: { projectId } }),
      ]).toEqual([{ projectIds: [] }, 0]);
    });

    it('refuses a list that is not a list of ids', async () => {
      await request(server())
        .post('/dashboard/since-last-visit/seen')
        .set('Authorization', auth())
        .send({ projectIds: 'all' })
        .expect(400);
    });
  });

  it('never lists a project the person does not belong to', async () => {
    const projectId = await project();
    await done(projectId, 'Done after', ago(1));
    await prisma.projectMember.updateMany({
      where: { projectId, actorId: demoActorId },
      data: { isActive: false },
    });

    expect(await newsOf(projectId)).toBeUndefined();
  });

  it('asks for a sign-in', async () => {
    await request(server()).get('/dashboard/since-last-visit').expect(401);
  });
});
