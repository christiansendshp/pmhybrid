import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { DEMO_EMAIL, DEMO_PASSWORD } from './../prisma/demo-credentials.js';
import { assignProjectRole } from './helpers/roles.js';
import { createScratchDocsPath } from './helpers/scratch-docs.js';

const ROADMAP = [
  '# Roadmap',
  '',
  '## Active work',
  '',
  '| ID | Outcome | Acceptance check | Status | Owner | Depends on |',
  '| --- | --- | --- | --- | --- | --- |',
  '| T-1 | Work one | check | IN PROGRESS | — | — |',
  '',
].join('\n');

const entry = (
  at: string,
  agent: string,
  task: string,
  word: string,
  summary = 's',
) =>
  [
    `## [${at}] | ${agent} | ${task} | ${word}`,
    '',
    `- Summary: ${summary}`,
    '- Verify: v',
    '',
  ].join('\n');

const LEDGER = [
  '# Agents log',
  '',
  '## Entries',
  '',
  entry(
    '2026-10-01T10:00:00Z',
    'codex',
    'X-1',
    'IN_PROGRESS',
    'Started the open one',
  ),
  entry(
    '2026-10-02T10:00:00Z',
    'codex',
    'X-2',
    'IN_PROGRESS',
    'Started the closed one',
  ),
  entry('2026-10-04T10:00:00Z', 'codex', 'X-2', 'DONE', 'Fixed   the importer'),
  entry('2026-10-05T10:00:00Z', 'claude', 'X-3', 'DONE', 'Wrote the docs'),
].join('\n');

/**
 * The work the ledger closed and the Roadmap does not carry becomes done tasks only when a person asks for it
 * (Roadmap TASK-34, DEC-004 D1).
 */
describe('Importing closed ledger work as done tasks (e2e, Roadmap TASK-34)', () => {
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
  const auth = (bearer = token) => `Bearer ${bearer}`;
  const unique = (label: string) =>
    `${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

  async function project() {
    const docs = createScratchDocsPath();
    writeFileSync(path.join(docs, 'Roadmap.md'), ROADMAP, 'utf-8');
    writeFileSync(path.join(docs, 'Agentslog.md'), LEDGER, 'utf-8');
    const created = await request(server())
      .post('/projects')
      .set('Authorization', auth())
      .send({ name: unique('Import E2E'), docsPath: docs })
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

  const importIds = (projectId: string, ids: string[], bearer = token) =>
    request(server())
      .post(`/projects/${projectId}/documents/agentslog/untracked/import`)
      .set('Authorization', auth(bearer))
      .send({ ids });

  const untrackedIds = async (projectId: string) =>
    (
      (
        await request(server())
          .get(`/projects/${projectId}/documents/agentslog/untracked`)
          .set('Authorization', auth())
          .expect(200)
      ).body as { externalId: string }[]
    ).map((row) => row.externalId);

  const taskOf = (projectId: string, externalId: string) =>
    prisma.task.findFirstOrThrow({ where: { projectId, externalId } });

  async function memberWith(projectId: string, role: string) {
    const email = `${unique('member')}@pmhybrid.local`;
    const user = await request(server())
      .post('/users')
      .set('Authorization', auth())
      .send({ displayName: 'Member', email, password: 'password123' })
      .expect(201);
    await request(server())
      .post(`/projects/${projectId}/members`)
      .set('Authorization', auth())
      .send({ actorId: user.body.id })
      .expect(201);
    await assignProjectRole(server(), auth(), projectId, user.body.id, role);
    const login = await request(server())
      .post('/auth/login')
      .send({ email, password: 'password123' })
      .expect(200);
    return login.body.accessToken as string;
  }

  it('lists the closed ones and the open one before it asks for anything, so what is imported is chosen', async () => {
    const { projectId } = await project();

    expect(await untrackedIds(projectId)).toEqual(['X-1', 'X-3', 'X-2']);
  });

  it('makes a done task of a closed ID: titled by what its closing entry says, done and created when the ledger says', async () => {
    const { projectId } = await project();

    const res = await importIds(projectId, ['X-2']).expect(201);

    const task = await taskOf(projectId, 'X-2');
    expect(res.body.imported).toEqual([
      { externalId: 'X-2', taskId: task.id, title: 'Fixed the importer' },
    ]);
    expect(task).toMatchObject({
      title: 'Fixed the importer',
      status: 'TERMINADA',
      sourceOrigin: 'AGENTSLOG',
      roadmapTable: null,
    });
    expect(task.completedAt).toEqual(new Date('2026-10-04T10:00:00Z'));
    expect(task.createdAt).toEqual(new Date('2026-10-02T10:00:00Z'));
  });

  it('links the entries of the ID to the task, and stops listing the ID', async () => {
    const { projectId } = await project();

    await importIds(projectId, ['X-2']).expect(201);

    const task = await taskOf(projectId, 'X-2');
    expect(
      await prisma.agentLogEvent.count({
        where: { projectId, taskExternalId: 'X-2', taskId: task.id },
      }),
    ).toBe(2);
    expect(await untrackedIds(projectId)).toEqual(['X-1', 'X-3']);
  });

  it('never imports open work: it is skipped, and stays listed', async () => {
    const { projectId } = await project();

    const res = await importIds(projectId, ['X-1']).expect(201);

    expect(res.body).toEqual({
      imported: [],
      skipped: [{ externalId: 'X-1', reason: 'OPEN' }],
    });
    expect(
      await prisma.task.count({ where: { projectId, externalId: 'X-1' } }),
    ).toBe(0);
  });

  it('skips an ID that is no work without a task: one that is a task already, and one the ledger never named', async () => {
    const { projectId } = await project();

    const res = await importIds(projectId, ['T-1', 'Z-9']).expect(201);

    expect(res.body.skipped).toEqual([
      { externalId: 'T-1', reason: 'NOT_LISTED' },
      { externalId: 'Z-9', reason: 'NOT_LISTED' },
    ]);
  });

  it('imports once: asking again for the same ID adds nothing', async () => {
    const { projectId } = await project();
    await importIds(projectId, ['X-2']).expect(201);

    const again = await importIds(projectId, ['X-2', 'X-2']).expect(201);

    expect(again.body.imported).toEqual([]);
    expect(
      await prisma.task.count({ where: { projectId, externalId: 'X-2' } }),
    ).toBe(1);
  });

  it('imports the closed ones among several in one go, and says what it left', async () => {
    const { projectId } = await project();

    const res = await importIds(projectId, ['X-1', 'X-2', 'X-3']).expect(201);

    expect(
      res.body.imported.map((task: { externalId: string }) => task.externalId),
    ).toEqual(['X-2', 'X-3']);
    expect(res.body.skipped).toEqual([{ externalId: 'X-1', reason: 'OPEN' }]);
  });

  it('counts in the progress of the project, and shows on its board', async () => {
    const { projectId } = await project();
    const progress = async () =>
      (
        (
          await request(server())
            .get('/projects')
            .set('Authorization', auth())
            .expect(200)
        ).body as { id: string; summary: { progress: number | null } }[]
      ).find((item) => item.id === projectId)?.summary.progress ?? 0;
    const before = await progress();

    await importIds(projectId, ['X-2', 'X-3']).expect(201);

    expect(await progress()).toBeGreaterThan(before);
    const board = await request(server())
      .get(`/projects/${projectId}/tasks`)
      .set('Authorization', auth())
      .expect(200);
    expect(
      (board.body as { externalId: string; status: string }[])
        .filter((task) => ['X-2', 'X-3'].includes(task.externalId))
        .map((task) => task.status),
    ).toEqual(['TERMINADA', 'TERMINADA']);
  });

  it('survives the next sync: no second task, no row written to the Roadmap', async () => {
    const { projectId, docs } = await project();
    await importIds(projectId, ['X-2']).expect(201);
    const roadmapBefore = readFileSync(path.join(docs, 'Roadmap.md'), 'utf-8');

    await sync(projectId);

    expect(
      await prisma.task.count({ where: { projectId, externalId: 'X-2' } }),
    ).toBe(1);
    expect(readFileSync(path.join(docs, 'Roadmap.md'), 'utf-8')).toBe(
      roadmapBefore,
    );
    expect((await taskOf(projectId, 'X-2')).roadmapTable).toBeNull();
  });

  it('is audited as the creation of the task, saying it came from the ledger', async () => {
    const { projectId } = await project();

    await importIds(projectId, ['X-2']).expect(201);

    const task = await taskOf(projectId, 'X-2');
    const audit = await prisma.auditEvent.findFirstOrThrow({
      where: { entityId: task.id, operation: 'CREATE' },
    });
    expect(audit.newValue).toMatchObject({
      sourceOrigin: 'AGENTSLOG',
      importedFromLedger: true,
    });
  });

  it('is refused to a member who cannot write tasks, and creates nothing', async () => {
    const { projectId } = await project();
    const viewer = await memberWith(projectId, 'VIEWER');

    await importIds(projectId, ['X-2'], viewer).expect(403);

    expect(
      await prisma.task.count({ where: { projectId, externalId: 'X-2' } }),
    ).toBe(0);
  });

  it('is allowed to a member who can write tasks', async () => {
    const { projectId } = await project();
    const developer = await memberWith(projectId, 'DEVELOPER');

    await importIds(projectId, ['X-2'], developer).expect(201);
  });

  it('is refused to someone who is not a member of the project', async () => {
    const { projectId } = await project();
    const elsewhere = await project();
    const outsider = await memberWith(elsewhere.projectId, 'PROJECT_ADMIN');

    await importIds(projectId, ['X-2'], outsider).expect(403);
  });

  it('refuses a request with no IDs', async () => {
    const { projectId } = await project();

    await importIds(projectId, []).expect(400);
  });
});
