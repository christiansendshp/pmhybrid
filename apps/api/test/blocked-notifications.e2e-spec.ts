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

const roadmap = (active: string[], blocked: string[]) =>
  [
    '# Roadmap',
    '',
    '## Active work',
    '',
    '| ID | Outcome | Acceptance check | Status | Owner | Depends on |',
    '| --- | --- | --- | --- | --- | --- |',
    ...active.map(
      (id) => `| ${id} | Work ${id} | check | IN PROGRESS | — | — |`,
    ),
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
    ...blocked.map((id) => `| ${id} | Waiting for legal | PO decision | — |`),
    '',
  ].join('\n');

const LEDGER_BEFORE = ['# Agents log', '', '## Entries', '', ''].join('\n');

/** W-6 was closed by the ledger while it sat in the Blocked table. */
const LEDGER_AFTER = [
  '# Agents log',
  '',
  '## Entries',
  '',
  '## [2026-10-20T10:00:00Z] | tester | W-6 | DONE',
  '',
  '- Summary: closed',
  '- Verify: v',
  '',
].join('\n');

interface Notified {
  type: string;
  payload: Record<string, unknown>;
}

/**
 * The assignee of a task is told when a sync puts it into the Blocked table or takes it out for another one
 * (Roadmap TASK-40), read from the audit events of the run.
 */
describe('Blocked and unblocked notifications (e2e, Roadmap TASK-40)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let ownerToken: string;
  let projectId: string;
  let docs: string;
  let member: { id: string; token: string };

  const server = () => app.getHttpServer();
  const auth = (token: string) => `Bearer ${token}`;
  const unique = (label: string) =>
    `${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

  const sync = () =>
    request(server())
      .post(`/projects/${projectId}/sync`)
      .set('Authorization', auth(ownerToken))
      .expect(201);

  /** The external id of each task of the project, by its id: what tells its notifications from other specs'. */
  const taskIds = new Map<string, string>();

  /** The notifications of a type that are about a task of this project. */
  const aboutProject = async (
    token: string,
    type: string,
  ): Promise<Notified[]> => {
    const res = await request(server())
      .get('/notifications')
      .set('Authorization', auth(token))
      .expect(200);
    return (res.body as Notified[]).filter(
      (n) => n.type === type && taskIds.has(n.payload['taskId'] as string),
    );
  };

  const externalIds = async (token: string, type: string) =>
    (await aboutProject(token, type)).map((n) => n.payload['externalId']);

  beforeAll(async () => {
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
    const owner = await prisma.actor.findFirstOrThrow({
      where: { email: DEMO_EMAIL },
    });

    docs = createScratchDocsPath();
    writeFileSync(
      path.join(docs, 'Roadmap.md'),
      roadmap(['W-1', 'W-3', 'W-4'], ['W-2', 'W-5', 'W-6']),
      'utf-8',
    );
    writeFileSync(path.join(docs, 'Agentslog.md'), LEDGER_BEFORE, 'utf-8');
    const created = await request(server())
      .post('/projects')
      .set('Authorization', auth(ownerToken))
      .send({ name: unique('Blocked E2E'), docsPath: docs })
      .expect(201);
    projectId = created.body.id as string;
    await sync();

    const email = `${unique('assignee')}@pmhybrid.local`;
    const createdMember = await request(server())
      .post('/users')
      .set('Authorization', auth(ownerToken))
      .send({
        displayName: unique('Assignee'),
        email,
        password: 'assignee12345',
      })
      .expect(201);
    await request(server())
      .post(`/projects/${projectId}/members`)
      .set('Authorization', auth(ownerToken))
      .send({ actorId: createdMember.body.id })
      .expect(201);
    const memberLogin = await request(server())
      .post('/auth/login')
      .send({ email, password: 'assignee12345' })
      .expect(200);
    member = {
      id: createdMember.body.id as string,
      token: memberLogin.body.accessToken as string,
    };

    const tasks = await prisma.task.findMany({ where: { projectId } });
    for (const task of tasks) {
      taskIds.set(task.id, task.externalId ?? '');
    }
    const hold = (externalId: string, actorId: string) =>
      prisma.task.updateMany({
        where: { projectId, externalId },
        data: { assigneeActorId: actorId, assigneeLockedAt: new Date() },
      });
    // The member holds W-1, W-2, W-5 and W-6; the person who runs the sync holds W-4; W-3 is nobody's.
    for (const id of ['W-1', 'W-2', 'W-5', 'W-6']) {
      await hold(id, member.id);
    }
    await hold('W-4', owner.id);

    // W-1, W-3 and W-4 go into Blocked, W-2 comes out into Active, W-5 vanishes and W-6 is closed in the ledger.
    writeFileSync(
      path.join(docs, 'Roadmap.md'),
      roadmap(['W-2'], ['W-1', 'W-3', 'W-4']),
      'utf-8',
    );
    writeFileSync(path.join(docs, 'Agentslog.md'), LEDGER_AFTER, 'utf-8');
    await sync();
  });

  afterAll(async () => {
    await app.close();
  });

  it('tells the assignee a sync put their task into the Blocked table, once, with why and what is needed', async () => {
    const blocked = await aboutProject(member.token, 'TASK_BLOCKED');

    expect(blocked.map((n) => n.payload)).toEqual([
      expect.objectContaining({
        externalId: 'W-1',
        title: 'Work W-1',
        reason: 'Waiting for legal',
        neededDecision: 'PO decision',
      }),
    ]);
  });

  it('tells the assignee a sync took their task out of the Blocked table for another one, once', async () => {
    const unblocked = await aboutProject(member.token, 'TASK_UNBLOCKED');

    expect(unblocked.map((n) => n.payload)).toEqual([
      expect.objectContaining({ externalId: 'W-2', title: 'Work W-2' }),
    ]);
  });

  it('tells nobody of a task that was blocked and that nobody holds', async () => {
    const everyone = [
      ...(await externalIds(member.token, 'TASK_BLOCKED')),
      ...(await externalIds(ownerToken, 'TASK_BLOCKED')),
    ];

    expect(everyone).not.toContain('W-3');
  });

  it('does not tell the person who ran the sync of their own task', async () => {
    expect(await externalIds(ownerToken, 'TASK_BLOCKED')).toEqual([]);
  });

  it('does not call a row that vanished from the Blocked table an unblocking', async () => {
    expect(await externalIds(member.token, 'TASK_UNBLOCKED')).not.toContain(
      'W-5',
    );
  });

  it('does not call a task the ledger closed an unblocking: it is done', async () => {
    expect(await externalIds(member.token, 'TASK_UNBLOCKED')).not.toContain(
      'W-6',
    );
  });

  it('sends nothing for a sync that changes nothing', async () => {
    const before = [
      (await aboutProject(member.token, 'TASK_BLOCKED')).length,
      (await aboutProject(member.token, 'TASK_UNBLOCKED')).length,
    ];

    await sync();

    expect([
      (await aboutProject(member.token, 'TASK_BLOCKED')).length,
      (await aboutProject(member.token, 'TASK_UNBLOCKED')).length,
    ]).toEqual(before);
  });
});
