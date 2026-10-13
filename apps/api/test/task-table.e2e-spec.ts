import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { DEMO_EMAIL, DEMO_PASSWORD } from './../prisma/demo-credentials.js';
import { createScratchDocsPath } from './helpers/scratch-docs.js';

const roadmap = (...ids: string[]) =>
  [
    '# Roadmap',
    '',
    '## Active work',
    '',
    '| ID | Outcome | Acceptance check | Status | Owner | Depends on |',
    '| --- | --- | --- | --- | --- | --- |',
    ...ids.map((id) => `| ${id} | Work ${id} | check | TODO | — | — |`),
    '',
    '## Near term',
    '',
    '| ID | Outcome | Acceptance check | Status | Depends on |',
    '| --- | --- | --- | --- | --- |',
    '| — | — | — | — | — |',
    '',
    '## Blocked',
    '',
    '| ID | Blocker | Needed decision or event | Owner |',
    '| --- | --- | --- | --- |',
    '| — | — | — | — |',
    '',
  ].join('\n');

/** An entry of the ledger at an exact minute, to make a task an instant close. */
const entry = (at: string, task: string, word: string) =>
  [
    `## [${at}] | tester | ${task} | ${word}`,
    '',
    '- Summary: s',
    '- Verify: v',
    '',
  ].join('\n');

const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000);

/**
 * The tasks of a project as a table: the board's filters and an order decided on the server, so a page is
 * right whatever the column (Roadmap TASK-18).
 */
describe('Task table (e2e, Roadmap TASK-18)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let ownerToken: string;

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
    ownerToken = login.body.accessToken;
  });

  afterEach(async () => {
    await app.close();
  });

  const server = () => app.getHttpServer();
  const auth = (token = ownerToken) => `Bearer ${token}`;
  const unique = (label: string) =>
    `${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

  /**
   * Six tasks, each different in what a filter or a column looks at:
   *   TT-1 HIGH, an agent, in development 10 days, the ledger says QA          (stale, divergent)
   *   TT-2 LOW, a person, in QA with a reviewer, moved now                     (reviewer)
   *   TT-3 CRITICAL, nobody, pending
   *   TT-4 finished long ago, started and closed within a minute in the ledger (instant, not stale)
   *   TT-5 MEDIUM, blocked in the Roadmap, due soonest, moved half a day ago
   *   TT-6 no priority, "Alpha" in the title, due later
   */
  async function project() {
    const docsPath = createScratchDocsPath();
    writeFileSync(
      path.join(docsPath, 'Roadmap.md'),
      roadmap('TT-1', 'TT-2', 'TT-3', 'TT-4', 'TT-5', 'TT-6'),
      'utf-8',
    );
    writeFileSync(
      path.join(docsPath, 'Agentslog.md'),
      [
        '# Agents log',
        '',
        '## Entries',
        '',
        entry('2026-10-01T10:00:00Z', 'TT-1', 'REVIEW'),
        entry('2026-10-01T10:00:00Z', 'TT-4', 'IN_PROGRESS'),
        entry('2026-10-01T10:00:30Z', 'TT-4', 'DONE'),
      ].join('\n'),
      'utf-8',
    );
    const created = await request(server())
      .post('/projects')
      .set('Authorization', auth())
      .send({ name: unique('Table E2E'), docsPath })
      .expect(201);
    const projectId = created.body.id as string;
    await request(server())
      .post(`/projects/${projectId}/sync`)
      .set('Authorization', auth())
      .expect(201);

    const person = await request(server())
      .post('/users')
      .set('Authorization', auth())
      .send({
        displayName: 'Zoe Person',
        email: `${unique('zoe')}@pmhybrid.local`,
        password: 'password123',
      })
      .expect(201);
    const agent = await request(server())
      .post('/agents')
      .set('Authorization', auth())
      .send({ displayName: 'Ana Agent', providerType: 'custom' })
      .expect(201);
    for (const actor of [person, agent]) {
      await request(server())
        .post(`/projects/${projectId}/members`)
        .set('Authorization', auth())
        .send({ actorId: actor.body.id })
        .expect(201);
    }
    const idOf = async (externalId: string) =>
      (await prisma.task.findFirstOrThrow({ where: { projectId, externalId } }))
        .id;
    // Created one day apart, in the order of their IDs, so a tie in a column is broken the same way every run.
    const set = async (externalId: string, data: Record<string, unknown>) =>
      prisma.task.update({
        where: { id: await idOf(externalId) },
        data: {
          createdAt: new Date(Date.UTC(2026, 8, Number(externalId.slice(3)))),
          ...data,
        },
      });

    await set('TT-1', {
      priority: 'HIGH',
      status: 'EN_DESARROLLO',
      assigneeActorId: agent.body.id,
      statusChangedAt: daysAgo(10),
      ledgerStage: 'QA',
    });
    await set('TT-2', {
      priority: 'LOW',
      status: 'QA',
      assigneeActorId: person.body.id,
      reviewerActorId: agent.body.id,
      statusChangedAt: new Date(),
      title: 'Second thing',
    });
    await set('TT-3', {
      priority: 'CRITICAL',
      status: 'PENDIENTE',
      statusChangedAt: daysAgo(5),
    });
    await set('TT-4', { status: 'TERMINADA', statusChangedAt: daysAgo(30) });
    await set('TT-5', {
      priority: 'MEDIUM',
      roadmapTable: 'BLOCKED',
      dueDate: new Date('2026-12-01T00:00:00Z'),
      statusChangedAt: daysAgo(0.5),
    });
    await set('TT-6', {
      title: 'Alpha release',
      dueDate: new Date('2027-01-01T00:00:00Z'),
      statusChangedAt: daysAgo(2),
    });
    return {
      projectId,
      person: person.body.id as string,
      agent: agent.body.id as string,
    };
  }

  const table = async (projectId: string, query = '') =>
    (
      await request(server())
        .get(`/projects/${projectId}/task-table${query}`)
        .set('Authorization', auth())
        .expect(200)
    ).body as {
      total: number;
      offset: number;
      limit: number;
      sort: string;
      dir: string;
      items: { externalId: string; [key: string]: unknown }[];
    };
  const idsOf = (page: { items: { externalId: string }[] }) =>
    page.items.map((item) => item.externalId);

  it('lists the cards the board shows, in creation order by default, with the total', async () => {
    const { projectId, agent } = await project();

    const page = await table(projectId);

    expect(page).toMatchObject({
      total: 6,
      offset: 0,
      limit: 50,
      sort: 'createdAt',
      dir: 'asc',
    });
    expect(idsOf(page).sort()).toEqual([
      'TT-1',
      'TT-2',
      'TT-3',
      'TT-4',
      'TT-5',
      'TT-6',
    ]);
    const first = page.items.find((item) => item.externalId === 'TT-1')!;
    expect(first).toMatchObject({
      status: 'EN_DESARROLLO',
      ledgerStage: 'QA',
      assignee: { id: agent, kind: 'AI_AGENT' },
      computedProgress: expect.any(Number),
    });
    expect(page.items.find((item) => item.externalId === 'TT-4')).toMatchObject(
      { instantClose: true },
    );
  });

  describe('the order is the same on every page, whatever the column', () => {
    it.each([
      ['priority', 'asc', ['TT-3', 'TT-1', 'TT-5', 'TT-2', 'TT-4', 'TT-6']],
      ['priority', 'desc', ['TT-2', 'TT-5', 'TT-1', 'TT-3', 'TT-4', 'TT-6']],
      ['dueDate', 'asc', ['TT-5', 'TT-6', 'TT-1', 'TT-2', 'TT-3', 'TT-4']],
      ['dueDate', 'desc', ['TT-6', 'TT-5', 'TT-1', 'TT-2', 'TT-3', 'TT-4']],
      ['status', 'asc', ['TT-3', 'TT-5', 'TT-6', 'TT-1', 'TT-2', 'TT-4']],
      ['externalId', 'desc', ['TT-6', 'TT-5', 'TT-4', 'TT-3', 'TT-2', 'TT-1']],
      ['age', 'asc', ['TT-2', 'TT-5', 'TT-6', 'TT-3', 'TT-1', 'TT-4']],
    ])(
      'by %s %s: the pages put together are the whole list',
      async (sort, dir, expected) => {
        const { projectId } = await project();

        const pages = [
          await table(projectId, `?sort=${sort}&dir=${dir}&limit=2&offset=0`),
          await table(projectId, `?sort=${sort}&dir=${dir}&limit=2&offset=2`),
          await table(projectId, `?sort=${sort}&dir=${dir}&limit=2&offset=4`),
        ];

        expect(pages.map((page) => page.total)).toEqual([6, 6, 6]);
        expect(pages.flatMap(idsOf)).toEqual(expected);
        const whole = await table(projectId, `?sort=${sort}&dir=${dir}`);
        expect(idsOf(whole)).toEqual(expected);
      },
    );

    it('orders by the name of the assignee, the tasks nobody holds last, and by title and reviewer', async () => {
      const { projectId } = await project();

      const byAssignee = await table(projectId, '?sort=assignee&dir=asc');
      const byTitle = await table(projectId, '?sort=title&dir=asc');
      const byReviewer = await table(projectId, '?sort=reviewer&dir=asc');

      expect(idsOf(byAssignee).slice(0, 2)).toEqual(['TT-1', 'TT-2']);
      expect(idsOf(byTitle)[0]).toBe('TT-6');
      expect(idsOf(byReviewer)[0]).toBe('TT-2');
    });

    it('gives an empty page past the end, and says how many there are', async () => {
      const { projectId } = await project();

      const page = await table(projectId, '?offset=100&limit=10');

      expect(page).toMatchObject({ total: 6, offset: 100, items: [] });
    });
  });

  describe('the filters of the board', () => {
    it.each([
      ['q=alpha', ['TT-6']],
      ['q=tt-2', ['TT-2']],
      ['q=thing', ['TT-2']],
      ['priority=HIGH', ['TT-1']],
      ['assignee=__unassigned__', ['TT-3', 'TT-4', 'TT-5', 'TT-6']],
      ['blocked=1', ['TT-5']],
      ['stale=72', ['TT-1', 'TT-3']],
      ['stale=24', ['TT-1', 'TT-3', 'TT-6']],
      ['divergent=1', ['TT-1']],
      ['instant=1', ['TT-4']],
    ])('%s', async (query, expected) => {
      const { projectId } = await project();

      const page = await table(projectId, `?${query}&sort=externalId&dir=asc`);

      expect(idsOf(page)).toEqual(expected);
      expect(page.total).toBe(expected.length);
    });

    it('filters by an assignee, the kind of assignee and the reviewer', async () => {
      const { projectId, person, agent } = await project();

      expect(idsOf(await table(projectId, `?assignee=${person}`))).toEqual([
        'TT-2',
      ]);
      expect(idsOf(await table(projectId, '?kind=AI_AGENT'))).toEqual(['TT-1']);
      expect(idsOf(await table(projectId, '?kind=HUMAN'))).toEqual(['TT-2']);
      expect(idsOf(await table(projectId, `?reviewer=${agent}`))).toEqual([
        'TT-2',
      ]);
    });

    it('combines them, and never counts a finished task as stale', async () => {
      const { projectId } = await project();

      const page = await table(projectId, '?stale=24&priority=HIGH');
      const stale = await table(projectId, '?stale=1&sort=externalId&dir=asc');

      expect(idsOf(page)).toEqual(['TT-1']);
      expect(idsOf(stale)).not.toContain('TT-4');
    });

    it('counts a start in the ledger as agreeing with QA, and does not list a task that agrees', async () => {
      const { projectId } = await project();
      const id = (
        await prisma.task.findFirstOrThrow({
          where: { projectId, externalId: 'TT-2' },
        })
      ).id;
      await prisma.task.update({
        where: { id },
        data: { ledgerStage: 'EN_DESARROLLO' },
      });

      const page = await table(projectId, '?divergent=1');

      expect(idsOf(page)).toEqual(['TT-1']);
    });

    it('reads a flag the way the board reads its address: only 1 or true switch it on', async () => {
      const { projectId } = await project();

      expect((await table(projectId, '?blocked=true')).total).toBe(1);
      expect((await table(projectId, '?blocked=0')).total).toBe(6);
      expect((await table(projectId, '?blocked=yes')).total).toBe(6);
    });
  });

  it('reads the first page of a project of 300 tasks without sending the rest', async () => {
    const created = await request(server())
      .post('/projects')
      .set('Authorization', auth())
      .send({
        name: unique('Big table E2E'),
        docsPath: createScratchDocsPath(),
      })
      .expect(201);
    const projectId = created.body.id as string;
    await prisma.task.createMany({
      data: Array.from({ length: 300 }, (_, index) => ({
        projectId,
        externalId: `BIG-${index + 1}`,
        title: `Task ${index + 1}`,
        acceptanceCriteria: 'Verified',
        sourceOrigin: 'UI' as const,
        createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index)),
      })),
    });

    const first = await request(server())
      .get(`/projects/${projectId}/task-table?sort=externalId&dir=asc`)
      .set('Authorization', auth())
      .expect(200);
    const last = await request(server())
      .get(
        `/projects/${projectId}/task-table?sort=externalId&dir=asc&offset=250`,
      )
      .set('Authorization', auth())
      .expect(200);

    expect(first.body.total).toBe(300);
    expect(first.body.items).toHaveLength(50);
    expect(first.body.items[0].externalId).toBe('BIG-1');
    expect(first.body.items[49].externalId).toBe('BIG-50');
    expect(
      last.body.items.map((item: { externalId: string }) => item.externalId),
    ).toEqual(Array.from({ length: 50 }, (_, index) => `BIG-${251 + index}`));
    // A page is a page: far smaller than the 300 cards the board would have read.
    expect(JSON.stringify(first.body).length).toBeLessThan(
      JSON.stringify(first.body.items[0]).length * 60,
    );
  });

  it('refuses what it cannot read, naming the field', async () => {
    const { projectId } = await project();

    for (const query of [
      'sort=mood',
      'dir=sideways',
      'limit=0',
      'limit=501',
      'offset=-1',
      'offset=x',
      'stale=0',
      'stale=9000',
      'kind=ROBOT',
      'priority=URGENT',
    ]) {
      const res = await request(server())
        .get(`/projects/${projectId}/task-table?${query}`)
        .set('Authorization', auth())
        .expect(400);
      expect(JSON.stringify(res.body.message), query).toContain(
        query.split('=')[0],
      );
    }
  });

  it('is for the members of the project only', async () => {
    const { projectId } = await project();
    const email = `${unique('outsider')}@pmhybrid.local`;
    await request(server())
      .post('/users')
      .set('Authorization', auth())
      .send({ displayName: unique('Outsider'), email, password: 'password123' })
      .expect(201);
    const outsider = await request(server())
      .post('/auth/login')
      .send({ email, password: 'password123' })
      .expect(200);

    await request(server())
      .get(`/projects/${projectId}/task-table`)
      .expect(401);
    await request(server())
      .get(`/projects/${projectId}/task-table`)
      .set('Authorization', auth(outsider.body.accessToken))
      .expect(403);
  });

  it('leaves the existing list of tasks as it was', async () => {
    const { projectId } = await project();

    const res = await request(server())
      .get(`/projects/${projectId}/tasks`)
      .set('Authorization', auth())
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(6);
  });
});
