import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { DEMO_EMAIL, DEMO_PASSWORD } from './../prisma/demo-credentials.js';
import { createScratchDocsPath } from './helpers/scratch-docs.js';

/** A Roadmap with the given rows in its Active work and Blocked tables. */
const roadmap = (active: string[], blocked: string[]) =>
  [
    '# Roadmap',
    '',
    '## Active work',
    '',
    '| ID | Outcome | Acceptance check | Status | Owner | Depends on |',
    '| --- | --- | --- | --- | --- | --- |',
    ...(active.length
      ? active.map(
          (id) => `| ${id} | Work ${id} | check | IN PROGRESS | — | — |`,
        )
      : ['| — | — | — | — | — | — |']),
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
    ...(blocked.length
      ? blocked.map((id) => `| ${id} | Waiting for legal | PO decision | — |`)
      : ['| — | — | — | — |']),
    '',
  ].join('\n');

/** The statement the migration runs on the tasks that are blocked when it is applied. */
const BACKFILL = (() => {
  const sql = readFileSync(
    path.resolve(
      process.cwd(),
      'prisma/migrations/20261026140000_add_task_blocked_since/migration.sql',
    ),
    'utf-8',
  );
  const at = sql.indexOf('UPDATE "Task"');
  return sql.slice(at).trim().replace(/;$/, '');
})();

/**
 * Since when a task is in the Blocked table (Roadmap TASK-31): the time a sync read its row into it, kept
 * while it stays, cleared when it leaves, and filled for the tasks blocked before the column existed.
 */
describe('Task.blockedSince (e2e, Roadmap TASK-31)', () => {
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

  async function project(active: string[], blocked: string[]) {
    const docs = createScratchDocsPath();
    const file = path.join(docs, 'Roadmap.md');
    writeFileSync(file, roadmap(active, blocked), 'utf-8');
    const created = await request(server())
      .post('/projects')
      .set('Authorization', auth())
      .send({ name: unique('Blocked since E2E'), docsPath: docs })
      .expect(201);
    return { projectId: created.body.id as string, file };
  }

  const sync = (projectId: string) =>
    request(server())
      .post(`/projects/${projectId}/sync`)
      .set('Authorization', auth())
      .expect(201);

  const taskOf = (projectId: string, externalId: string) =>
    prisma.task.findFirstOrThrow({ where: { projectId, externalId } });

  it('stamps a task created in the Blocked table, and nothing else', async () => {
    const { projectId } = await project(['BS-1'], ['BS-2']);

    await sync(projectId);

    expect((await taskOf(projectId, 'BS-2')).blockedSince).toBeInstanceOf(Date);
    expect((await taskOf(projectId, 'BS-1')).blockedSince).toBeNull();
  });

  it('keeps the time of a task that stays blocked through later syncs and edits of its row', async () => {
    const { projectId, file } = await project([], ['BS-1']);
    await sync(projectId);
    const first = (await taskOf(projectId, 'BS-1')).blockedSince;
    writeFileSync(
      file,
      roadmap([], ['BS-1']).replace('PO decision', 'Legal answer'),
      'utf-8',
    );

    await sync(projectId);

    const task = await taskOf(projectId, 'BS-1');
    expect(task.neededDecision).toBe('Legal answer');
    expect(task.blockedSince).toEqual(first);
  });

  it('clears the time when the row leaves the Blocked table, and starts a later one when it returns', async () => {
    const { projectId, file } = await project([], ['BS-1']);
    await sync(projectId);
    const first = (await taskOf(projectId, 'BS-1')).blockedSince as Date;
    writeFileSync(file, roadmap(['BS-1'], []), 'utf-8');
    await sync(projectId);
    const whileActive = (await taskOf(projectId, 'BS-1')).blockedSince;
    writeFileSync(file, roadmap([], ['BS-1']), 'utf-8');

    await sync(projectId);

    const again = (await taskOf(projectId, 'BS-1')).blockedSince as Date;
    expect(whileActive).toBeNull();
    expect(again.getTime()).toBeGreaterThan(first.getTime());
  });

  it('clears the time of a blocked task whose row is gone from the Roadmap and whose ledger says it is done', async () => {
    const { projectId, file } = await project([], ['BS-1']);
    await sync(projectId);
    writeFileSync(file, roadmap([], []), 'utf-8');
    writeFileSync(
      path.join(path.dirname(file), 'Agentslog.md'),
      [
        '# Agents log',
        '',
        '## Entries',
        '',
        '## [2026-10-26T10:00:00Z] | tester | BS-1 | DONE',
        '',
        '- Summary: s',
        '- Verify: v',
        '',
      ].join('\n'),
      'utf-8',
    );

    await sync(projectId);

    const task = await taskOf(projectId, 'BS-1');
    expect(task.roadmapTable).toBeNull();
    expect(task.blockedSince).toBeNull();
  });

  it('keeps the time of a blocked task whose row is gone with nothing in the ledger to say why, until someone decides', async () => {
    const { projectId, file } = await project([], ['BS-1']);
    await sync(projectId);
    const first = (await taskOf(projectId, 'BS-1')).blockedSince;
    writeFileSync(file, roadmap([], []), 'utf-8');

    await sync(projectId);

    expect((await taskOf(projectId, 'BS-1')).blockedSince).toEqual(first);
  });

  describe('the migration, for the tasks blocked before the column', () => {
    async function blockedWithoutTime(projectId: string, externalId: string) {
      return prisma.task.create({
        data: {
          projectId,
          externalId,
          title: `Old ${externalId}`,
          status: 'PENDIENTE',
          sourceOrigin: 'ROADMAP',
          roadmapTable: 'BLOCKED',
          blockedSince: null,
          createdAt: new Date('2026-09-01T10:00:00Z'),
        },
      });
    }

    it('gives a task the time of the last sync that read its row into the Blocked table', async () => {
      const { projectId } = await project([], []);
      const task = await blockedWithoutTime(projectId, 'OLD-1');
      for (const [at, table] of [
        ['2026-09-10T10:00:00Z', 'BLOCKED'],
        ['2026-09-12T10:00:00Z', 'ACTIVE'],
        ['2026-09-20T10:00:00Z', 'BLOCKED'],
      ] as const) {
        await prisma.auditEvent.create({
          data: {
            projectId,
            entityType: 'Task',
            entityId: task.id,
            operation: 'ROADMAP_TABLE_CHANGE',
            origin: 'SYNC',
            newValue: { roadmapTable: table },
            occurredAt: new Date(at),
          },
        });
      }

      await prisma.$executeRawUnsafe(BACKFILL);

      expect((await taskOf(projectId, 'OLD-1')).blockedSince).toEqual(
        new Date('2026-09-20T10:00:00Z'),
      );
    });

    it('gives a task no audit trail knows about the time it was created', async () => {
      const { projectId } = await project([], []);
      await blockedWithoutTime(projectId, 'OLD-2');

      await prisma.$executeRawUnsafe(BACKFILL);

      expect((await taskOf(projectId, 'OLD-2')).blockedSince).toEqual(
        new Date('2026-09-01T10:00:00Z'),
      );
    });

    it('leaves a task that is not blocked without a time', async () => {
      const { projectId } = await project([], []);
      await prisma.task.create({
        data: {
          projectId,
          externalId: 'OLD-3',
          title: 'Not blocked',
          status: 'PENDIENTE',
          sourceOrigin: 'ROADMAP',
          roadmapTable: 'ACTIVE',
        },
      });

      await prisma.$executeRawUnsafe(BACKFILL);

      expect((await taskOf(projectId, 'OLD-3')).blockedSince).toBeNull();
    });
  });
});
