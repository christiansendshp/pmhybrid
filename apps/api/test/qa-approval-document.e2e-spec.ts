import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { DEMO_EMAIL, DEMO_PASSWORD } from './../prisma/demo-credentials.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { createScratchDocsPath } from './helpers/scratch-docs.js';

const row = (id: string, status: string) =>
  `| ${id} | Work ${id} | Work to do on ${id}. | It works. | ${status} | — | — | — |`;

const roadmap = (...rows: [string, string][]) =>
  [
    '# Roadmap',
    '',
    '## Active work',
    '',
    '| ID | Name | Description | Acceptance check | Status | Owner | Depends on | Pause reason |',
    '|---|---|---|---|---|---|---|---|',
    ...(rows.length > 0
      ? rows.map(([id, status]) => row(id, status))
      : ['| — | — | — | — | — | — | — | — |']),
    '',
    '<!-- context:end -->',
    '',
    '## Near term',
    '',
    '| ID | Name | Acceptance check | Status | Depends on |',
    '|---|---|---|---|---|',
    '| — | — | — | TODO | — |',
    '',
  ].join('\n');

const started = (id: string) =>
  [
    '',
    `## [2026-10-20T10:00:00Z] | tester | ${id} | IN_PROGRESS | Work ${id}`,
    '- Summary: started',
    '- Verify: pending',
    '',
  ].join('\n');

const handedOver = (id: string) =>
  [
    '',
    `## [2026-10-20T10:30:00Z] | tester | ${id} | REVIEW | Work ${id}`,
    '- Summary: ready for review',
    '- Verify: pnpm test',
    '',
  ].join('\n');

const closed = (id: string) =>
  [
    '',
    `## [2026-10-20T11:00:00Z] | tester | ${id} | DONE | Work ${id}`,
    '- Summary: done',
    '- Verify: v',
    '',
  ].join('\n');

const LEDGER = `# Agents log

## Entries
${started('Q-1')}${started('Q-2')}${started('Q-3')}${handedOver('Q-1')}${handedOver('Q-2')}`;

/**
 * In a project that requires QA approval a file cannot do what the QA role does: a document that closes a
 * task that is in QA, by its row or by a row that left with a DONE entry, raises a conflict for someone who
 * can approve (Roadmap GAP-41, DEC-006). A project that does not require it is read as it always was.
 */
describe('A document that closes a task in QA (e2e, Roadmap GAP-41)', () => {
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

  const server = () => app.getHttpServer();
  const auth = () => `Bearer ${ownerToken}`;

  const sync = async (projectId: string) =>
    (
      await request(server())
        .post(`/projects/${projectId}/sync`)
        .set('Authorization', auth())
        .expect(201)
    ).body as { summary: Record<string, number> };

  /** Q-1 and Q-2 in QA, by the ledger, Q-3 in development, all synced; the switch is set as asked, after they got there. */
  async function project(qaApprovalRequired: boolean) {
    const docsPath = createScratchDocsPath();
    writeFileSync(
      path.join(docsPath, 'Roadmap.md'),
      roadmap(
        ['Q-1', 'IN_PROGRESS'],
        ['Q-2', 'IN_PROGRESS'],
        ['Q-3', 'IN_PROGRESS'],
      ),
      'utf-8',
    );
    writeFileSync(path.join(docsPath, 'Agentslog.md'), LEDGER, 'utf-8');
    const created = await request(server())
      .post('/projects')
      .set('Authorization', auth())
      .send({
        name: `QA document E2E ${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
        docsPath,
      })
      .expect(201);
    const projectId = created.body.id as string;
    // The ledger says Q-1 and Q-2 were handed over for review: the sync derives QA from it (Roadmap TASK-07).
    await sync(projectId);
    if (qaApprovalRequired) {
      await request(server())
        .patch(`/projects/${projectId}`)
        .set('Authorization', auth())
        .send({ qaApprovalRequired: true })
        .expect(200);
    }
    return { projectId, docsPath };
  }

  const taskOf = (projectId: string, externalId: string) =>
    prisma.task.findFirstOrThrow({ where: { projectId, externalId } });

  const openConflicts = async (projectId: string, externalId: string) =>
    prisma.conflict.findMany({
      where: {
        projectId,
        resolvedAt: null,
        entityId: (await taskOf(projectId, externalId)).id,
      },
    });

  const resolve = (projectId: string, conflictId: string, strategy: string) =>
    request(server())
      .post(`/projects/${projectId}/conflicts/${conflictId}/resolve`)
      .set('Authorization', auth())
      .send({ strategy });

  const setRoadmap = (docsPath: string, ...rows: [string, string][]) =>
    writeFileSync(path.join(docsPath, 'Roadmap.md'), roadmap(...rows), 'utf-8');

  const rowStatus = (docsPath: string, id: string) =>
    readFileSync(path.join(docsPath, 'Roadmap.md'), 'utf-8')
      .split('\n')
      .find((line) => line.startsWith(`| ${id} |`))
      ?.split('|')
      .map((cell) => cell.trim())[5];

  describe('when its row says DONE', () => {
    it('does not close the task, and asks someone who can approve to decide', async () => {
      const { projectId, docsPath } = await project(true);
      setRoadmap(
        docsPath,
        ['Q-1', 'DONE'],
        ['Q-2', 'IN_PROGRESS'],
        ['Q-3', 'IN_PROGRESS'],
      );

      const run = await sync(projectId);

      expect((await taskOf(projectId, 'Q-1')).status).toBe('QA');
      const [conflict] = await openConflicts(projectId, 'Q-1');
      expect(conflict).toMatchObject({
        kind: 'QA_APPROVAL_REQUIRED',
        localVersion: { status: 'QA' },
        externalVersion: { status: 'TERMINADA' },
      });
      expect(run.summary.conflictsRaised).toBe(1);
    });

    it('closes it as it always did when the project does not require approval', async () => {
      const { projectId, docsPath } = await project(false);
      setRoadmap(
        docsPath,
        ['Q-1', 'DONE'],
        ['Q-2', 'IN_PROGRESS'],
        ['Q-3', 'IN_PROGRESS'],
      );

      await sync(projectId);

      expect((await taskOf(projectId, 'Q-1')).status).toBe('TERMINADA');
      expect(await openConflicts(projectId, 'Q-1')).toEqual([]);
    });

    it('asks once: the next sync, with the row as it was, raises nothing new', async () => {
      const { projectId, docsPath } = await project(true);
      setRoadmap(
        docsPath,
        ['Q-1', 'DONE'],
        ['Q-2', 'IN_PROGRESS'],
        ['Q-3', 'IN_PROGRESS'],
      );
      await sync(projectId);

      const run = await sync(projectId);

      expect(run.summary.conflictsRaised).toBe(0);
      expect(await openConflicts(projectId, 'Q-1')).toHaveLength(1);
    });

    it('closes the task when someone who can approve keeps the document’s side', async () => {
      const { projectId, docsPath } = await project(true);
      setRoadmap(
        docsPath,
        ['Q-1', 'DONE'],
        ['Q-2', 'IN_PROGRESS'],
        ['Q-3', 'IN_PROGRESS'],
      );
      await sync(projectId);
      const [conflict] = await openConflicts(projectId, 'Q-1');

      await resolve(projectId, conflict.id, 'KEEP_EXTERNAL').expect(201);

      expect((await taskOf(projectId, 'Q-1')).status).toBe('TERMINADA');
      expect(await openConflicts(projectId, 'Q-1')).toEqual([]);
    });

    it('leaves it in QA and writes that into the document when PM Hub’s side is kept', async () => {
      const { projectId, docsPath } = await project(true);
      setRoadmap(
        docsPath,
        ['Q-1', 'DONE'],
        ['Q-2', 'IN_PROGRESS'],
        ['Q-3', 'IN_PROGRESS'],
      );
      await sync(projectId);
      const [conflict] = await openConflicts(projectId, 'Q-1');

      await resolve(projectId, conflict.id, 'KEEP_LOCAL').expect(201);

      expect((await taskOf(projectId, 'Q-1')).status).toBe('QA');
      expect(rowStatus(docsPath, 'Q-1')).toBe('IN_PROGRESS');
      expect((await sync(projectId)).summary.conflictsRaised).toBe(0);
    });

    it('closes the conflict by itself when the document stops saying it is done', async () => {
      const { projectId, docsPath } = await project(true);
      setRoadmap(
        docsPath,
        ['Q-1', 'DONE'],
        ['Q-2', 'IN_PROGRESS'],
        ['Q-3', 'IN_PROGRESS'],
      );
      await sync(projectId);
      setRoadmap(
        docsPath,
        ['Q-1', 'IN_PROGRESS'],
        ['Q-2', 'IN_PROGRESS'],
        ['Q-3', 'IN_PROGRESS'],
      );

      const run = await sync(projectId);

      expect(await openConflicts(projectId, 'Q-1')).toEqual([]);
      expect(run.summary.conflictsClosed).toBe(1);
      expect((await taskOf(projectId, 'Q-1')).status).toBe('QA');
    });
  });

  describe('when its row left the Roadmap with a DONE entry', () => {
    it('does not close the task either, and asks', async () => {
      const { projectId, docsPath } = await project(true);
      setRoadmap(docsPath, ['Q-1', 'IN_PROGRESS'], ['Q-3', 'IN_PROGRESS']);
      appendFileSync(path.join(docsPath, 'Agentslog.md'), closed('Q-2'));

      await sync(projectId);

      expect((await taskOf(projectId, 'Q-2')).status).toBe('QA');
      const [conflict] = await openConflicts(projectId, 'Q-2');
      expect(conflict.kind).toBe('QA_APPROVAL_REQUIRED');
    });

    it('closes it when approved, and nothing is asked afterwards', async () => {
      const { projectId, docsPath } = await project(true);
      setRoadmap(docsPath, ['Q-1', 'IN_PROGRESS'], ['Q-3', 'IN_PROGRESS']);
      appendFileSync(path.join(docsPath, 'Agentslog.md'), closed('Q-2'));
      await sync(projectId);
      const [conflict] = await openConflicts(projectId, 'Q-2');
      await resolve(projectId, conflict.id, 'KEEP_EXTERNAL').expect(201);

      const run = await sync(projectId);

      expect((await taskOf(projectId, 'Q-2')).status).toBe('TERMINADA');
      expect(run.summary.conflictsRaised).toBe(0);
      expect(await openConflicts(projectId, 'Q-2')).toEqual([]);
    });

    it('keeps it in QA without a row when PM Hub’s side is kept, and does not ask again', async () => {
      const { projectId, docsPath } = await project(true);
      setRoadmap(docsPath, ['Q-1', 'IN_PROGRESS'], ['Q-3', 'IN_PROGRESS']);
      appendFileSync(path.join(docsPath, 'Agentslog.md'), closed('Q-2'));
      await sync(projectId);
      const [conflict] = await openConflicts(projectId, 'Q-2');
      await resolve(projectId, conflict.id, 'KEEP_LOCAL').expect(201);

      const run = await sync(projectId);

      expect(run.summary.conflictsRaised).toBe(0);
      expect(await openConflicts(projectId, 'Q-2')).toEqual([]);
      expect(await taskOf(projectId, 'Q-2')).toMatchObject({
        status: 'QA',
        roadmapTable: null,
      });
    });

    it('closes it as it always did when the project does not require approval', async () => {
      const { projectId, docsPath } = await project(false);
      setRoadmap(docsPath, ['Q-1', 'IN_PROGRESS'], ['Q-3', 'IN_PROGRESS']);
      appendFileSync(path.join(docsPath, 'Agentslog.md'), closed('Q-2'));

      await sync(projectId);

      expect((await taskOf(projectId, 'Q-2')).status).toBe('TERMINADA');
    });

    it('closes a task that is not in QA as usual, whatever the project requires', async () => {
      const { projectId, docsPath } = await project(true);
      setRoadmap(docsPath, ['Q-1', 'IN_PROGRESS'], ['Q-2', 'IN_PROGRESS']);
      appendFileSync(path.join(docsPath, 'Agentslog.md'), closed('Q-3'));

      await sync(projectId);

      expect((await taskOf(projectId, 'Q-3')).status).toBe('TERMINADA');
    });
  });
});
