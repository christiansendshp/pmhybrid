import { appendFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { DEMO_EMAIL, DEMO_PASSWORD } from './../prisma/demo-credentials.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { createScratchDocsPath } from './helpers/scratch-docs.js';

const row = (id: string) =>
  `| ${id} | Work ${id} | Work to do on ${id}. | It works. | IN_PROGRESS | — | — | — |`;

const roadmap = (...ids: string[]) =>
  [
    '# Roadmap',
    '',
    '## Active work',
    '',
    '| ID | Name | Description | Acceptance check | Status | Owner | Depends on | Pause reason |',
    '|---|---|---|---|---|---|---|---|',
    ...(ids.length > 0 ? ids.map(row) : ['| — | — | — | — | — | — | — | — |']),
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

const entry = (at: string, id: string, status: string, name = '') =>
  [
    '',
    `## [${at}] | tester | ${id} | ${status}${name ? ` | ${name}` : ''}`,
    '- Summary: s',
    '- Verify: v',
    '',
  ].join('\n');

const LEDGER = `# Agents log

## Entries
${entry('2026-10-20T10:00:00Z', 'L-1', 'IN_PROGRESS', 'Work L-1')}${entry('2026-10-20T10:00:00Z', 'L-2', 'IN_PROGRESS', 'Work L-2')}`;

/**
 * A task whose row left the Roadmap is completed by a terminal entry of the ledger; when the row goes
 * first and the entry follows (the skill's `done` writes both), the conflict the first sync raised no
 * longer holds and closes itself; and an entry stored before the parser read the Name after its status
 * is read as the word it says (Roadmap BUG-18).
 */
describe('A closing entry that comes after the row left (e2e, Roadmap BUG-18)', () => {
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

  /** Two tasks in development, synced; then both rows are taken out of the Roadmap and synced again. */
  async function rowsGone() {
    const docsPath = createScratchDocsPath();
    writeFileSync(
      path.join(docsPath, 'Roadmap.md'),
      roadmap('L-1', 'L-2'),
      'utf-8',
    );
    writeFileSync(path.join(docsPath, 'Agentslog.md'), LEDGER, 'utf-8');
    const created = await request(server())
      .post('/projects')
      .set('Authorization', auth())
      .send({
        name: `Late entry E2E ${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
        docsPath,
      })
      .expect(201);
    const projectId = created.body.id as string;
    await sync(projectId);
    writeFileSync(path.join(docsPath, 'Roadmap.md'), roadmap(), 'utf-8');
    const run = await sync(projectId);
    expect(run.summary.conflictsRaised).toBe(2);
    return { projectId, docsPath };
  }

  const sync = async (projectId: string) =>
    (
      await request(server())
        .post(`/projects/${projectId}/sync`)
        .set('Authorization', auth())
        .expect(201)
    ).body as { summary: Record<string, number> };

  const taskOf = (projectId: string, externalId: string) =>
    prisma.task.findFirstOrThrow({ where: { projectId, externalId } });

  const openConflicts = (projectId: string, entityId: string) =>
    prisma.conflict.findMany({
      where: { projectId, entityId, resolvedAt: null },
    });

  it('asks about a task whose row left with nothing in the ledger to say why, and keeps it in development', async () => {
    const { projectId } = await rowsGone();

    const task = await taskOf(projectId, 'L-1');

    expect(task.status).toBe('EN_DESARROLLO');
    expect(await openConflicts(projectId, task.id)).toHaveLength(1);
  });

  it('completes the task and closes the conflict by itself once the closing entry is written, and leaves the other one asking', async () => {
    const { projectId, docsPath } = await rowsGone();
    appendFileSync(
      path.join(docsPath, 'Agentslog.md'),
      entry('2026-10-20T11:00:00Z', 'L-1', 'DONE', 'Work L-1'),
    );

    const run = await sync(projectId);

    const done = await taskOf(projectId, 'L-1');
    expect(done.status).toBe('TERMINADA');
    expect(await openConflicts(projectId, done.id)).toEqual([]);
    expect(run.summary.completedViaRemoval).toBe(1);
    expect(run.summary.conflictsClosed).toBeGreaterThanOrEqual(1);
    const other = await taskOf(projectId, 'L-2');
    expect(other.status).toBe('EN_DESARROLLO');
    expect(await openConflicts(projectId, other.id)).toHaveLength(1);
  });

  it('reads an entry stored with its Name as the word it says: the task closes and the stored word is clean', async () => {
    const { projectId } = await rowsGone();
    const revision = await prisma.documentRevision.findFirstOrThrow({
      where: { document: { projectId, kind: 'AGENTSLOG' } },
    });
    // What the parser used to store for `DONE | Work L-2`: the whole of it.
    await prisma.agentLogEvent.create({
      data: {
        projectId,
        taskExternalId: 'L-2',
        agentName: 'tester',
        timestampFromLog: new Date('2026-10-20T11:00:00Z'),
        statusWord: 'DONE | Work L-2',
        summary: 's',
        files: '',
        verify: 'v',
        followUp: '',
        canonicalStatus: 'DONE',
        statusQualifier: '| Work L-2',
        rawEntryHash: `late-entry-${Date.now()}-${Math.random()}`,
        sourceDocumentRevisionId: revision.id,
      },
    });

    await sync(projectId);

    const done = await taskOf(projectId, 'L-2');
    expect(done.status).toBe('TERMINADA');
    expect(await openConflicts(projectId, done.id)).toEqual([]);
    const stored = await prisma.agentLogEvent.findFirstOrThrow({
      where: { projectId, taskExternalId: 'L-2', canonicalStatus: 'DONE' },
    });
    expect(stored).toMatchObject({
      statusWord: 'DONE',
      statusQualifier: null,
    });
  });

  it('does not ask about a task that was already done in the document when its row is taken out afterwards', async () => {
    const docsPath = createScratchDocsPath();
    const finished = roadmap('F-1').replace('IN_PROGRESS', 'DONE');
    writeFileSync(path.join(docsPath, 'Roadmap.md'), finished, 'utf-8');
    writeFileSync(path.join(docsPath, 'Agentslog.md'), LEDGER, 'utf-8');
    const created = await request(server())
      .post('/projects')
      .set('Authorization', auth())
      .send({
        name: `Finished row E2E ${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
        docsPath,
      })
      .expect(201);
    const projectId = created.body.id as string;
    await sync(projectId);
    expect((await taskOf(projectId, 'F-1')).status).toBe('TERMINADA');

    writeFileSync(path.join(docsPath, 'Roadmap.md'), roadmap(), 'utf-8');
    const run = await sync(projectId);

    const task = await taskOf(projectId, 'F-1');
    expect(run.summary.conflictsRaised).toBe(0);
    expect(task).toMatchObject({ status: 'TERMINADA', roadmapTable: null });
    expect(await openConflicts(projectId, task.id)).toEqual([]);
  });

  it('leaves nothing to normalize on a second run', async () => {
    const { projectId } = await rowsGone();

    await sync(projectId);
    await sync(projectId);

    expect(
      await prisma.agentLogEvent.count({
        where: { projectId, statusWord: { contains: ' | ' } },
      }),
    ).toBe(0);
  });
});
