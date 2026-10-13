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

interface LedgerEntry {
  task: string;
  word: string;
  lines?: string[];
}

/** The entries in the order they are written; the clock in the header is the agent's own and never orders them. */
const ledger = (...entries: LedgerEntry[]) =>
  [
    '# Agents log',
    '',
    '## Entries',
    '',
    ...entries.flatMap((entry, index) => [
      `## [2026-10-13T10:${String(index).padStart(2, '0')}:00Z] | tester | ${entry.task} | ${entry.word}`,
      '',
      '- Summary: s',
      '- Verify: v',
      ...(entry.lines ?? []),
      '',
    ]),
  ].join('\n');

/** The latest skill's table: a row says TODO, IN_PROGRESS, PAUSE or DONE. */
const roadmap = (rows: Record<string, string>, outcome = 'Work') =>
  [
    '# Roadmap',
    '',
    '## Active work',
    '',
    '| ID | Outcome | Acceptance check | Status | Owner | Depends on | Pause reason |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...Object.entries(rows).map(
      ([id, status]) =>
        `| ${id} | ${outcome} ${id} | check | ${status} | — | — | — |`,
    ),
    '',
    '## Near term',
    '',
    '| ID | Outcome | Acceptance check | Status | Depends on |',
    '| --- | --- | --- | --- | --- |',
    '| — | — | — | — | — |',
    '',
    '## Gaps, Bugs & Technical Debt',
    '',
    '| ID | Severity | Phase | Description | Status | Owner | Depends on | Pause reason |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
    '| — | — | — | — | — | — | — | — |',
    '',
  ].join('\n');

const yamlEntry = (id: string, status: string) =>
  [
    `### ${id} — Entry`,
    '',
    '```yaml',
    `id: ${id}`,
    'type: TASK',
    `title: Title of ${id}`,
    `status: ${status}`,
    '```',
    '',
  ].join('\n');

/**
 * A row that says IN_PROGRESS or TODO is coarse; the ledger's latest entry says whether the task is in
 * QA, back in development or assigned. Read only: no document is written, no conflict is raised, and a
 * change made in PM Hub after the entry stands (Roadmap TASK-07).
 */
describe('Stage derived from the ledger (e2e, Roadmap TASK-07)', () => {
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
  const auth = () => `Bearer ${ownerToken}`;
  const unique = (label: string) =>
    `${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const pause = (ms: number) =>
    new Promise((resolve) => setTimeout(resolve, ms));

  async function createProject(docsPath: string) {
    const created = await request(server())
      .post('/projects')
      .set('Authorization', auth())
      .send({ name: unique('Stage derivation E2E'), docsPath })
      .expect(201);
    return created.body.id as string;
  }

  const write = (docsPath: string, file: string, content: string) =>
    writeFileSync(path.join(docsPath, file), content, 'utf-8');

  const sync = (projectId: string) =>
    request(server())
      .post(`/projects/${projectId}/sync`)
      .set('Authorization', auth())
      .expect(201);

  const statuses = async (projectId: string) =>
    Object.fromEntries(
      (await prisma.task.findMany({ where: { projectId } })).map((task) => [
        task.externalId,
        task.status,
      ]),
    );

  const taskId = async (projectId: string, externalId: string) =>
    (await prisma.task.findFirstOrThrow({ where: { projectId, externalId } }))
      .id;

  describe('what a row and the latest entry of its task give', () => {
    it('is QA for a review, development for a failed review or a start, ASIGNADA for an assignment, and what the row says otherwise', async () => {
      const docsPath = createScratchDocsPath();
      write(
        docsPath,
        'Roadmap.md',
        roadmap({
          'DS-1': 'IN_PROGRESS',
          'DS-2': 'IN_PROGRESS',
          'DS-3': 'IN_PROGRESS',
          'DS-4': 'DONE',
          'DS-5': 'TODO',
          'DS-6': 'TODO',
          'DS-7': 'IN_PROGRESS',
        }),
      );
      write(
        docsPath,
        'Agentslog.md',
        ledger(
          { task: 'DS-1', word: 'IN_PROGRESS' },
          { task: 'DS-1', word: 'REVIEW', lines: ['- Handoff: qa-agent'] },
          { task: 'DS-2', word: 'IN_PROGRESS' },
          { task: 'DS-2', word: 'REVIEW', lines: ['- Handoff: qa-agent'] },
          {
            task: 'DS-2',
            word: 'REVIEW',
            lines: ['- Review: FAIL - the edge case'],
          },
          { task: 'DS-3', word: 'IN_PROGRESS' },
          // A row that says DONE is the document's word, whatever the ledger says last.
          { task: 'DS-4', word: 'REVIEW' },
          // A row that says TODO and a ledger with nothing about the stage.
          { task: 'DS-5', word: 'PAUSE', lines: ['- Pause: OTRO - x'] },
          { task: 'DS-6', word: 'ASSIGNED' },
          { task: 'DS-7', word: 'REVIEW', lines: ['- Review: PASS - good'] },
        ),
      );
      const projectId = await createProject(docsPath);

      const run = await sync(projectId);

      expect(await statuses(projectId)).toEqual({
        'DS-1': 'QA',
        'DS-2': 'EN_DESARROLLO',
        'DS-3': 'EN_DESARROLLO',
        'DS-4': 'TERMINADA',
        'DS-5': 'PENDIENTE',
        'DS-6': 'ASIGNADA',
        'DS-7': 'QA',
      });
      expect(run.body.summary.stagesDerived).toBe(3);
      expect(run.body.summary.conflictsRaised).toBe(0);
    });

    it('reads a YAML entry the same way, and leaves the documents as they were', async () => {
      const docsPath = createScratchDocsPath();
      const roadmapText = [
        '# Roadmap',
        '',
        '## Plan',
        '',
        yamlEntry('DS-8', 'IN_PROGRESS'),
        yamlEntry('DS-9', 'READY'),
        '## Cross-cutting',
        '',
      ].join('\n');
      const ledgerText = ledger(
        { task: 'DS-8', word: 'REVIEW' },
        { task: 'DS-9', word: 'ASSIGNED' },
      );
      write(docsPath, 'Roadmap.md', roadmapText);
      write(docsPath, 'Agentslog.md', ledgerText);
      const projectId = await createProject(docsPath);

      await sync(projectId);

      expect(await statuses(projectId)).toEqual({
        'DS-8': 'QA',
        'DS-9': 'ASIGNADA',
      });
      expect(readFileSync(path.join(docsPath, 'Roadmap.md'), 'utf-8')).toBe(
        roadmapText,
      );
      expect(readFileSync(path.join(docsPath, 'Agentslog.md'), 'utf-8')).toBe(
        ledgerText,
      );
    });
  });

  describe('over time', () => {
    it('follows the ledger when a newer entry arrives, is idempotent, and audits each change as the sync', async () => {
      const docsPath = createScratchDocsPath();
      write(docsPath, 'Roadmap.md', roadmap({ 'DS-1': 'IN_PROGRESS' }));
      write(
        docsPath,
        'Agentslog.md',
        ledger({ task: 'DS-1', word: 'IN_PROGRESS' }),
      );
      const projectId = await createProject(docsPath);
      await sync(projectId);
      expect(await statuses(projectId)).toEqual({ 'DS-1': 'EN_DESARROLLO' });
      await pause(20);

      write(
        docsPath,
        'Agentslog.md',
        ledger(
          { task: 'DS-1', word: 'IN_PROGRESS' },
          { task: 'DS-1', word: 'REVIEW' },
        ),
      );
      const handedOver = await sync(projectId);
      const again = await sync(projectId);
      expect(await statuses(projectId)).toEqual({ 'DS-1': 'QA' });
      expect(handedOver.body.summary.stagesDerived).toBe(1);
      expect(again.body.summary.stagesDerived).toBe(0);
      await pause(20);

      write(
        docsPath,
        'Agentslog.md',
        ledger(
          { task: 'DS-1', word: 'IN_PROGRESS' },
          { task: 'DS-1', word: 'REVIEW' },
          { task: 'DS-1', word: 'REVIEW', lines: ['- Review: FAIL - not yet'] },
        ),
      );
      await sync(projectId);
      expect(await statuses(projectId)).toEqual({ 'DS-1': 'EN_DESARROLLO' });

      const changes = await prisma.auditEvent.findMany({
        where: {
          entityType: 'Task',
          entityId: await taskId(projectId, 'DS-1'),
          operation: 'STATUS_CHANGE',
        },
        orderBy: { occurredAt: 'asc' },
      });
      expect(changes.map((event) => [event.origin, event.newValue])).toEqual([
        ['SYNC', { status: 'QA' }],
        ['SYNC', { status: 'EN_DESARROLLO' }],
      ]);
    });

    it('does not undo a change made in PM Hub after the entry, and follows the next entry', async () => {
      const docsPath = createScratchDocsPath();
      write(docsPath, 'Roadmap.md', roadmap({ 'DS-1': 'IN_PROGRESS' }));
      write(
        docsPath,
        'Agentslog.md',
        ledger({ task: 'DS-1', word: 'IN_PROGRESS' }),
      );
      const projectId = await createProject(docsPath);
      await sync(projectId);
      const id = await taskId(projectId, 'DS-1');
      write(
        docsPath,
        'Agentslog.md',
        ledger(
          { task: 'DS-1', word: 'IN_PROGRESS' },
          { task: 'DS-1', word: 'REVIEW' },
        ),
      );
      await sync(projectId);
      expect(await statuses(projectId)).toEqual({ 'DS-1': 'QA' });
      await pause(20);

      // A person sends it back to development in PM Hub; the entry that said QA is older than that.
      await request(server())
        .post(`/projects/${projectId}/tasks/${id}/transition`)
        .set('Authorization', auth())
        .send({ status: 'EN_DESARROLLO' })
        .expect(201);
      const unchanged = await sync(projectId);
      expect(await statuses(projectId)).toEqual({ 'DS-1': 'EN_DESARROLLO' });
      expect(unchanged.body.summary.stagesDerived).toBe(0);
      expect(unchanged.body.summary.conflictsRaised).toBe(0);
      await pause(20);

      write(
        docsPath,
        'Agentslog.md',
        ledger(
          { task: 'DS-1', word: 'IN_PROGRESS' },
          { task: 'DS-1', word: 'REVIEW' },
          { task: 'DS-1', word: 'REVIEW', lines: ['- Handoff: qa-agent'] },
        ),
      );
      await sync(projectId);
      expect(await statuses(projectId)).toEqual({ 'DS-1': 'QA' });
    });

    it('raises no conflict when another field of the row changes while the task is in QA', async () => {
      const docsPath = createScratchDocsPath();
      write(docsPath, 'Roadmap.md', roadmap({ 'DS-1': 'IN_PROGRESS' }));
      write(
        docsPath,
        'Agentslog.md',
        ledger(
          { task: 'DS-1', word: 'IN_PROGRESS' },
          { task: 'DS-1', word: 'REVIEW' },
        ),
      );
      const projectId = await createProject(docsPath);
      await sync(projectId);
      expect(await statuses(projectId)).toEqual({ 'DS-1': 'QA' });
      await pause(20);

      write(
        docsPath,
        'Roadmap.md',
        roadmap({ 'DS-1': 'IN_PROGRESS' }, 'Reworded'),
      );
      const run = await sync(projectId);

      expect(run.body.summary.tasksUpdated).toBe(1);
      expect(run.body.summary.conflictsRaised).toBe(0);
      expect(await statuses(projectId)).toEqual({ 'DS-1': 'QA' });
    });

    it('takes a review that arrives in the same sync as the row that starts the task', async () => {
      const docsPath = createScratchDocsPath();
      write(docsPath, 'Roadmap.md', roadmap({ 'DS-1': 'TODO' }));
      write(docsPath, 'Agentslog.md', ledger());
      const projectId = await createProject(docsPath);
      await sync(projectId);
      expect(await statuses(projectId)).toEqual({ 'DS-1': 'PENDIENTE' });
      await pause(20);

      // The agent claimed, handed over and the row moved, all before the next sync.
      write(docsPath, 'Roadmap.md', roadmap({ 'DS-1': 'IN_PROGRESS' }));
      write(
        docsPath,
        'Agentslog.md',
        ledger(
          { task: 'DS-1', word: 'IN_PROGRESS' },
          { task: 'DS-1', word: 'REVIEW' },
        ),
      );
      await sync(projectId);

      expect(await statuses(projectId)).toEqual({ 'DS-1': 'QA' });
    });

    it('never moves a finished task', async () => {
      const docsPath = createScratchDocsPath();
      write(docsPath, 'Roadmap.md', roadmap({ 'DS-1': 'IN_PROGRESS' }));
      write(
        docsPath,
        'Agentslog.md',
        ledger({ task: 'DS-1', word: 'IN_PROGRESS' }),
      );
      const projectId = await createProject(docsPath);
      await sync(projectId);
      const id = await taskId(projectId, 'DS-1');
      await prisma.task.update({
        where: { id },
        data: {
          status: 'TERMINADA',
          statusChangedAt: new Date(Date.now() - 60_000),
        },
      });
      write(
        docsPath,
        'Agentslog.md',
        ledger(
          { task: 'DS-1', word: 'IN_PROGRESS' },
          { task: 'DS-1', word: 'REVIEW' },
        ),
      );

      const run = await sync(projectId);

      expect(await statuses(projectId)).toEqual({ 'DS-1': 'TERMINADA' });
      expect(run.body.summary.stagesDerived).toBe(0);
    });
  });
});

/** What the ledger says about a task is kept on it, to show when the board disagrees (Roadmap TASK-14). */
describe('Ledger stage of a task (e2e, Roadmap TASK-14)', () => {
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
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: DEMO_EMAIL, password: DEMO_PASSWORD })
      .expect(200);
    ownerToken = login.body.accessToken;
  });

  afterEach(async () => {
    await app.close();
  });

  const auth = () => `Bearer ${ownerToken}`;

  async function syncedProject() {
    const docsPath = createScratchDocsPath();
    writeFileSync(
      path.join(docsPath, 'Roadmap.md'),
      roadmap({
        'LS-1': 'IN_PROGRESS',
        'LS-2': 'IN_PROGRESS',
        'LS-3': 'IN_PROGRESS',
        'LS-4': 'TODO',
        'LS-5': 'TODO',
      }),
      'utf-8',
    );
    writeFileSync(
      path.join(docsPath, 'Agentslog.md'),
      ledger(
        { task: 'LS-1', word: 'IN_PROGRESS' },
        { task: 'LS-2', word: 'REVIEW' },
        // The ledger closed it; the row still says it is open.
        { task: 'LS-3', word: 'DONE' },
        { task: 'LS-4', word: 'ASSIGNED' },
        { task: 'LS-5', word: 'PAUSE', lines: ['- Pause: OTRO - x'] },
      ),
      'utf-8',
    );
    const created = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', auth())
      .send({
        name: `Ledger stage E2E ${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
        docsPath,
      })
      .expect(201);
    const projectId = created.body.id as string;
    await request(app.getHttpServer())
      .post(`/projects/${projectId}/sync`)
      .set('Authorization', auth())
      .expect(201);
    return projectId;
  }

  const cards = async (projectId: string) =>
    Object.fromEntries(
      (
        (
          await request(app.getHttpServer())
            .get(`/projects/${projectId}/tasks`)
            .set('Authorization', auth())
            .expect(200)
        ).body as {
          externalId: string;
          status: string;
          ledgerStage: string | null;
        }[]
      ).map((card) => [card.externalId, [card.status, card.ledgerStage]]),
    );

  it('puts the stage of the latest entry on the card, next to the status, and null when it says nothing', async () => {
    const projectId = await syncedProject();

    expect(await cards(projectId)).toEqual({
      'LS-1': ['EN_DESARROLLO', 'EN_DESARROLLO'],
      'LS-2': ['QA', 'QA'],
      'LS-3': ['EN_DESARROLLO', 'TERMINADA'],
      'LS-4': ['ASIGNADA', 'ASIGNADA'],
      'LS-5': ['PENDIENTE', null],
    });
  });

  it('is on the task page too, and follows the ledger on the next sync without touching updatedAt', async () => {
    const projectId = await syncedProject();
    const before = await prisma.task.findFirstOrThrow({
      where: { projectId, externalId: 'LS-1' },
    });
    await prisma.task.updateMany({
      where: { projectId },
      data: { ledgerStage: null },
    });
    const cleared = await prisma.task.findFirstOrThrow({
      where: { projectId, externalId: 'LS-1' },
    });

    await request(app.getHttpServer())
      .post(`/projects/${projectId}/sync`)
      .set('Authorization', auth())
      .expect(201);

    const after = await prisma.task.findFirstOrThrow({
      where: { projectId, externalId: 'LS-1' },
    });
    expect(after.ledgerStage).toBe('EN_DESARROLLO');
    // Derived data, written without moving the time the board sorts "recently updated" by.
    expect(after.updatedAt.getTime()).toBe(cleared.updatedAt.getTime());
    expect(before.ledgerStage).toBe('EN_DESARROLLO');
    const detail = await request(app.getHttpServer())
      .get(`/projects/${projectId}/tasks/${after.id}`)
      .set('Authorization', auth())
      .expect(200);
    expect(detail.body.ledgerStage).toBe('EN_DESARROLLO');
  });
});
