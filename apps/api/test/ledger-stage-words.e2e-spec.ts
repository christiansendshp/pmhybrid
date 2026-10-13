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

interface LedgerEntry {
  at: string;
  task: string;
  word: string;
  lines?: string[];
}

const ledger = (...entries: LedgerEntry[]) =>
  [
    '# Agents log',
    '',
    '## Entries',
    '',
    ...entries.flatMap((entry) => [
      `## [${entry.at}] | tester | ${entry.task} | ${entry.word}`,
      '',
      '- Summary: s',
      '- Verify: v',
      ...(entry.lines ?? []),
      '',
    ]),
  ].join('\n');

const roadmap = (...ids: string[]) =>
  [
    '# Roadmap',
    '',
    '## Active work',
    '',
    '| ID | Outcome | Acceptance check | Status | Owner | Depends on |',
    '| --- | --- | --- | --- | --- | --- |',
    ...ids.map((id) => `| ${id} | Work ${id} | check | IN PROGRESS | — | — |`),
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

/** The stage words of the ledger are read and kept, and BR-003's terminal word stays the exact DONE (Roadmap TASK-06). */
describe('Stage words of the ledger (e2e, Roadmap TASK-06)', () => {
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

  async function project(docs: { roadmap: string; entries: LedgerEntry[] }) {
    const docsPath = createScratchDocsPath();
    writeFileSync(path.join(docsPath, 'Roadmap.md'), docs.roadmap, 'utf-8');
    writeFileSync(
      path.join(docsPath, 'Agentslog.md'),
      ledger(...docs.entries),
      'utf-8',
    );
    const created = await request(server())
      .post('/projects')
      .set('Authorization', auth())
      .send({ name: unique('Stage words E2E'), docsPath })
      .expect(201);
    return { projectId: created.body.id as string, docsPath };
  }

  const sync = (projectId: string) =>
    request(server())
      .post(`/projects/${projectId}/sync`)
      .set('Authorization', auth());

  const events = async (projectId: string) =>
    Object.fromEntries(
      (await prisma.agentLogEvent.findMany({ where: { projectId } })).map(
        (event) => [
          `${event.taskExternalId}|${event.statusWord}`,
          {
            canonicalStatus: event.canonicalStatus,
            statusQualifier: event.statusQualifier,
            handoffTo: event.handoffTo,
            reviewResult: event.reviewResult,
          },
        ],
      ),
    );

  const entries: LedgerEntry[] = [
    { at: '2026-10-13T10:00:00Z', task: 'SW-1', word: 'IN_PROGRESS' },
    {
      at: '2026-10-13T10:05:00Z',
      task: 'SW-1',
      word: 'REVIEW',
      lines: ['- Handoff: qa-agent'],
    },
    {
      at: '2026-10-13T10:10:00Z',
      task: 'SW-7',
      word: 'REVIEW',
      lines: ['- Review: FAIL - the edge case'],
    },
    {
      at: '2026-10-13T10:00:00Z',
      task: 'SW-2',
      word: 'IN_PROGRESS (revisión, 3 correcciones)',
    },
    { at: '2026-10-13T10:00:00Z', task: 'SW-3', word: 'DONE (2 de 3 partes)' },
    { at: '2026-10-13T10:00:00Z', task: 'SW-4', word: 'HALLAZGO' },
  ];

  it('stores what each word says, its qualifier and the handoff and review lines, and nothing for a word it does not know', async () => {
    const { projectId } = await project({
      roadmap: roadmap('SW-1', 'SW-2', 'SW-3', 'SW-4', 'SW-7'),
      entries,
    });

    await sync(projectId).expect(201);

    expect(await events(projectId)).toEqual({
      'SW-1|IN_PROGRESS': {
        canonicalStatus: 'IN_PROGRESS',
        statusQualifier: null,
        handoffTo: null,
        reviewResult: null,
      },
      'SW-1|REVIEW': {
        canonicalStatus: 'REVIEW',
        statusQualifier: null,
        handoffTo: 'qa-agent',
        reviewResult: null,
      },
      'SW-7|REVIEW': {
        canonicalStatus: 'REVIEW',
        statusQualifier: null,
        handoffTo: null,
        reviewResult: 'FAIL',
      },
      'SW-2|IN_PROGRESS (revisión, 3 correcciones)': {
        canonicalStatus: 'IN_PROGRESS',
        statusQualifier: 'revisión, 3 correcciones',
        handoffTo: null,
        reviewResult: null,
      },
      'SW-3|DONE (2 de 3 partes)': {
        canonicalStatus: 'DONE_PARTIAL',
        statusQualifier: '2 de 3 partes',
        handoffTo: null,
        reviewResult: null,
      },
      'SW-4|HALLAZGO': {
        canonicalStatus: null,
        statusQualifier: null,
        handoffTo: null,
        reviewResult: null,
      },
    });
  });

  it('keeps the handoff and the review result of the two review entries apart', async () => {
    const { projectId } = await project({
      roadmap: roadmap('SW-1', 'SW-7'),
      entries,
    });

    await sync(projectId).expect(201);

    const reviews = await prisma.agentLogEvent.findMany({
      where: { projectId, statusWord: 'REVIEW' },
      orderBy: { timestampFromLog: 'asc' },
    });
    expect(
      reviews.map((event) => [event.handoffTo, event.reviewResult]),
    ).toEqual([
      ['qa-agent', null],
      [null, 'FAIL'],
    ]);
  });

  it('classifies the entries that were read before, on the next sync, and a third sync changes nothing', async () => {
    const { projectId } = await project({
      roadmap: roadmap('SW-1', 'SW-2', 'SW-3', 'SW-4', 'SW-7'),
      entries,
    });
    await sync(projectId).expect(201);
    const classified = await events(projectId);
    // What the events of a project read before this existed look like.
    await prisma.agentLogEvent.updateMany({
      where: { projectId },
      data: { canonicalStatus: null, statusQualifier: null },
    });

    await sync(projectId).expect(201);
    const restored = await events(projectId);
    await sync(projectId).expect(201);

    expect(restored).toEqual(classified);
    expect(await events(projectId)).toEqual(restored);
  });

  describe('BR-003: a row that disappears is completed only by the exact word DONE', () => {
    it('does not complete a task whose row went with only a partial close in the ledger, and raises the question', async () => {
      const { projectId, docsPath } = await project({
        roadmap: roadmap('SW-5', 'SW-6'),
        entries: [
          { at: '2026-10-13T10:00:00Z', task: 'SW-5', word: 'DONE parcial' },
          { at: '2026-10-13T10:00:00Z', task: 'SW-6', word: 'DONE' },
        ],
      });
      await sync(projectId).expect(201);
      writeFileSync(path.join(docsPath, 'Roadmap.md'), roadmap(), 'utf-8');

      const run = await sync(projectId).expect(201);

      expect(run.body.summary.completedViaRemoval).toBe(1);
      expect(run.body.summary.conflictsRaised).toBe(1);
      const tasks = await prisma.task.findMany({ where: { projectId } });
      const status = Object.fromEntries(
        tasks.map((task) => [task.externalId, task.status]),
      );
      expect(status['SW-6']).toBe('TERMINADA');
      expect(status['SW-5']).not.toBe('TERMINADA');
    });
  });
});
