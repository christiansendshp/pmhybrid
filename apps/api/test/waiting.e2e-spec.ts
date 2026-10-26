import { rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { DEMO_EMAIL, DEMO_PASSWORD } from './../prisma/demo-credentials.js';
import { createScratchDocsPath } from './helpers/scratch-docs.js';

const ROADMAP = [
  '# Roadmap',
  '',
  '## Active work',
  '',
  '| ID | Outcome | Acceptance check | Status | Owner | Depends on |',
  '| --- | --- | --- | --- | --- | --- |',
  '| W-2 | Work two | check | IN PROGRESS | — | — |',
  '| W-4 | Work four, behind W-3 | check | IN PROGRESS | — | W-3 |',
  '| W-5 | Work five | check | IN PROGRESS | — | — |',
  '| W-8 | Work eight | check | IN PROGRESS | — | — |',
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
  '| W-3 | Waiting for legal | PO decision | — |',
  '| W-7 | Waiting for a vendor | Vendor reply | — |',
  '',
].join('\n');

const entry = (at: string, task: string, word: string) =>
  [
    `## [${at}] | tester | ${task} | ${word}`,
    '',
    '- Summary: s',
    '- Verify: v',
    '',
  ].join('\n');

/** W-5 waits for the PO, W-8 did wait and went on, W-3 is blocked in the table and in the ledger. */
const LEDGER = [
  '# Agents log',
  '',
  '## Entries',
  '',
  entry('2026-10-01T10:00:00Z', 'W-5', 'BLOQUEADO_PO'),
  entry('2026-10-02T10:00:00Z', 'W-8', 'BLOQUEADO_PO'),
  entry('2026-10-03T10:00:00Z', 'W-8', 'IN_PROGRESS'),
].join('\n');

/**
 * One list of what a project is waiting for, the longest waiting first (Roadmap TASK-32): the blocked tasks
 * with their age, the decisions the ledger says wait on a person, and the open conflicts.
 */
describe('What is waiting (e2e, Roadmap TASK-32)', () => {
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

  async function project() {
    const docs = createScratchDocsPath();
    writeFileSync(path.join(docs, 'Roadmap.md'), ROADMAP, 'utf-8');
    writeFileSync(path.join(docs, 'Agentslog.md'), LEDGER, 'utf-8');
    const created = await request(server())
      .post('/projects')
      .set('Authorization', auth())
      .send({ name: unique('Waiting E2E'), docsPath: docs })
      .expect(201);
    const projectId = created.body.id as string;
    await request(server())
      .post(`/projects/${projectId}/sync`)
      .set('Authorization', auth())
      .expect(201);
    return { projectId, docs };
  }

  const waiting = (projectId: string, bearer = auth()) =>
    request(server())
      .get(`/projects/${projectId}/waiting`)
      .set('Authorization', bearer);

  interface Item {
    kind: string;
    externalId: string | null;
    holds?: number;
    from?: string | null;
    reason?: string | null;
    neededDecision?: string | null;
    conflictKind?: string;
  }
  const itemsOf = async (projectId: string) =>
    (await waiting(projectId).expect(200)).body.items as Item[];
  const summary = (items: Item[]) =>
    items.map((item) => `${item.kind} ${item.externalId}`);

  it('lists the blocked task, the decision the ledger waits on, and the conflict, the longest waiting first', async () => {
    const { projectId } = await project();
    const w2 = await prisma.task.findFirstOrThrow({
      where: { projectId, externalId: 'W-2' },
    });
    await prisma.conflict.create({
      data: {
        projectId,
        kind: 'CONCURRENT_FIELD_EDIT',
        entityType: 'Task',
        entityId: w2.id,
        localVersion: {},
      },
    });

    const items = await itemsOf(projectId);

    expect(summary(items)).toEqual([
      'DECISION W-5',
      'BLOCKED W-3',
      'BLOCKED W-7',
      'CONFLICT W-2',
    ]);
  });

  it('says why a task is blocked, what it needs, and how many unfinished tasks wait behind it', async () => {
    const { projectId } = await project();

    const blocked = (await itemsOf(projectId)).find(
      (item) => item.externalId === 'W-3',
    );

    expect(blocked).toMatchObject({
      reason: 'Waiting for legal',
      neededDecision: 'PO decision',
      holds: 1,
    });
  });

  it('says whom a task waits for when the ledger says it', async () => {
    const { projectId } = await project();

    const decision = (await itemsOf(projectId)).find(
      (item) => item.externalId === 'W-5',
    );

    expect(decision).toMatchObject({ kind: 'DECISION', from: 'PO' });
  });

  it('leaves out a task whose ledger block was followed by another entry', async () => {
    const { projectId } = await project();

    expect(summary(await itemsOf(projectId))).not.toContain('DECISION W-8');
  });

  it('leaves out a task that is finished, blocked or not', async () => {
    const { projectId } = await project();
    await prisma.task.updateMany({
      where: { projectId, externalId: 'W-7' },
      data: { status: 'TERMINADA' },
    });

    expect(summary(await itemsOf(projectId))).not.toContain('BLOCKED W-7');
  });

  it('leaves out a conflict that was resolved', async () => {
    const { projectId } = await project();
    const w2 = await prisma.task.findFirstOrThrow({
      where: { projectId, externalId: 'W-2' },
    });
    await prisma.conflict.create({
      data: {
        projectId,
        kind: 'CONCURRENT_FIELD_EDIT',
        entityType: 'Task',
        entityId: w2.id,
        localVersion: {},
        resolvedAt: new Date(),
      },
    });

    expect(summary(await itemsOf(projectId))).not.toContain('CONFLICT W-2');
  });

  it('counts the blocked tasks in the groups they belong to, adding up to all of them', async () => {
    const { projectId } = await project();

    const res = await waiting(projectId).expect(200);

    expect(res.body.byPhase).toEqual([{ id: null, name: null, blocked: 2 }]);
    expect(res.body.byEpic).toEqual([{ id: null, name: null, blocked: 2 }]);
  });

  it('still lists the blocked tasks and the conflicts, and says so, when the ledger cannot be read', async () => {
    const { projectId, docs } = await project();
    rmSync(path.join(docs, 'Agentslog.md'));

    const res = await waiting(projectId).expect(200);

    expect(res.body.ledgerUnreadable).toBe(true);
    expect(summary(res.body.items as Item[])).toEqual([
      'BLOCKED W-3',
      'BLOCKED W-7',
    ]);
  });

  it('is empty for a project with nothing waiting', async () => {
    const created = await request(server())
      .post('/projects')
      .set('Authorization', auth())
      .send({
        name: unique('Nothing waiting'),
        docsPath: createScratchDocsPath(),
      })
      .expect(201);

    const res = await waiting(created.body.id).expect(200);

    expect(res.body).toEqual({
      items: [],
      byPhase: [],
      byEpic: [],
      ledgerUnreadable: false,
    });
  });

  it('is refused to someone who is not a member of the project', async () => {
    const { projectId } = await project();
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

    await waiting(projectId, `Bearer ${login.body.accessToken}`).expect(403);
  });
});
