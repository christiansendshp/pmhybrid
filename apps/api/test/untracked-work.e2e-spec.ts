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
    ...ids.map((id) => `| ${id} | Work ${id} | check | IN PROGRESS | — | — |`),
    '',
  ].join('\n');

const entry = (at: string, agent: string, task: string, word: string) =>
  [
    `## [${at}] | ${agent} | ${task} | ${word}`,
    '',
    '- Summary: s',
    '- Verify: v',
    '',
  ].join('\n');

const ledger = (...entries: string[]) =>
  ['# Agents log', '', '## Entries', '', ...entries].join('\n');

/**
 * The work the ledger carries that is no task of the project, listed before anything counts it (Roadmap TASK-33,
 * DEC-004 D1).
 */
describe('Ledger work with no task (e2e, Roadmap TASK-33)', () => {
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

  async function project(rows: string[], entries: string[]) {
    const docs = createScratchDocsPath();
    writeFileSync(path.join(docs, 'Roadmap.md'), roadmap(...rows), 'utf-8');
    writeFileSync(path.join(docs, 'Agentslog.md'), ledger(...entries), 'utf-8');
    const created = await request(server())
      .post('/projects')
      .set('Authorization', auth())
      .send({ name: unique('Untracked E2E'), docsPath: docs })
      .expect(201);
    const projectId = created.body.id as string;
    await sync(projectId);
    return { projectId, docs };
  }

  const sync = (projectId: string) =>
    request(server())
      .post(`/projects/${projectId}/sync`)
      .set('Authorization', auth())
      .expect(201);

  const untracked = (projectId: string, bearer = auth()) =>
    request(server())
      .get(`/projects/${projectId}/documents/agentslog/untracked`)
      .set('Authorization', bearer);

  interface Row {
    externalId: string;
    entries: number;
    agents: string[];
    firstSeen: string;
    lastSeen: string;
    lastWord: string;
    closed: boolean;
  }
  const rowsOf = async (projectId: string) =>
    (await untracked(projectId).expect(200)).body as Row[];

  const LEDGER = [
    entry('2026-10-01T10:00:00Z', 'codex', 'X-1', 'IN_PROGRESS'),
    entry('2026-10-02T10:00:00Z', 'claude', 'X-1', 'PAUSE'),
    entry('2026-10-03T10:00:00Z', 'codex', 'X-2', 'IN_PROGRESS'),
    entry('2026-10-04T10:00:00Z', 'codex', 'X-2', 'DONE'),
    entry('2026-10-05T10:00:00Z', 'claude', 'T-1', 'DONE'),
  ];

  it('lists each ID with entries and no task, with its counts, agents, dates and last word', async () => {
    const { projectId } = await project(['T-1'], LEDGER);

    const rows = await rowsOf(projectId);

    expect(rows).toEqual([
      {
        externalId: 'X-1',
        entries: 2,
        agents: ['claude', 'codex'],
        firstSeen: '2026-10-01T10:00:00.000Z',
        lastSeen: '2026-10-02T10:00:00.000Z',
        lastWord: 'PAUSE',
        closed: false,
      },
      {
        externalId: 'X-2',
        entries: 2,
        agents: ['codex'],
        firstSeen: '2026-10-03T10:00:00.000Z',
        lastSeen: '2026-10-04T10:00:00.000Z',
        lastWord: 'DONE',
        closed: true,
      },
    ]);
  });

  it('leaves out an ID that is a task of the project', async () => {
    const { projectId } = await project(['T-1'], LEDGER);

    expect(
      (await rowsOf(projectId)).map((row) => row.externalId),
    ).not.toContain('T-1');
  });

  it('leaves out an ID whose task was deleted: it is no work nobody knows of', async () => {
    const { projectId } = await project(
      ['T-1', 'D-1'],
      [...LEDGER, entry('2026-10-06T10:00:00Z', 'claude', 'D-1', 'DONE')],
    );
    await prisma.task.updateMany({
      where: { projectId, externalId: 'D-1' },
      data: { deletedAt: new Date() },
    });

    expect(
      (await rowsOf(projectId)).map((row) => row.externalId),
    ).not.toContain('D-1');
  });

  it('stops listing an ID once its row appears in the Roadmap, though its entries were read before the task existed', async () => {
    const { projectId, docs } = await project(['T-1'], LEDGER);
    expect((await rowsOf(projectId)).map((row) => row.externalId)).toContain(
      'X-1',
    );
    writeFileSync(
      path.join(docs, 'Roadmap.md'),
      roadmap('T-1', 'X-1'),
      'utf-8',
    );

    await sync(projectId);

    expect((await rowsOf(projectId)).map((row) => row.externalId)).toEqual([
      'X-2',
    ]);
  });

  it('is empty when every ID of the ledger is a task, or the ledger has none', async () => {
    const { projectId } = await project(['T-1'], [LEDGER[4]]);

    expect(await rowsOf(projectId)).toEqual([]);
  });

  it('is refused to someone who is not a member of the project', async () => {
    const { projectId } = await project(['T-1'], LEDGER);
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

    await untracked(projectId, `Bearer ${login.body.accessToken}`).expect(403);
  });
});
