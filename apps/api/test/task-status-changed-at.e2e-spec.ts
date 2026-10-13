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

const roadmap = (...rows: string[]) =>
  [
    '# Roadmap',
    '',
    '## Active work',
    '',
    '| ID | Outcome | Acceptance check | Status | Owner | Depends on |',
    '| --- | --- | --- | --- | --- | --- |',
    ...rows,
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

/** When a task entered its current state (Roadmap TASK-11). */
describe('Task.statusChangedAt (e2e, Roadmap TASK-11)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let ownerToken: string;
  let ownerId: string;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = moduleFixture.get(PrismaService);

    const login = await request(server())
      .post('/auth/login')
      .send({ email: DEMO_EMAIL, password: DEMO_PASSWORD })
      .expect(200);
    ownerToken = login.body.accessToken;
    ownerId = (await request(server()).get('/auth/me').set('Authorization', auth()).expect(200)).body.id;
  });

  afterEach(async () => {
    await app.close();
  });

  const server = () => app.getHttpServer();
  const auth = () => `Bearer ${ownerToken}`;
  const unique = (label: string) => `${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  async function createProject(docsPath = createScratchDocsPath()) {
    const res = await request(server())
      .post('/projects')
      .set('Authorization', auth())
      .send({ name: unique('Status stamp E2E'), docsPath })
      .expect(201);
    return res.body.id as string;
  }

  async function createTask(projectId: string, title = 'Stamped') {
    const res = await request(server())
      .post(`/projects/${projectId}/tasks`)
      .set('Authorization', auth())
      .send({ title, acceptanceCriteria: 'Verified' })
      .expect(201);
    return res.body.id as string;
  }

  const assign = (projectId: string, taskId: string, actorId: string) =>
    request(server())
      .post(`/projects/${projectId}/tasks/${taskId}/assign`)
      .set('Authorization', auth())
      .send({ actorId })
      .expect(201);

  const transition = (projectId: string, taskId: string, status: string) =>
    request(server())
      .post(`/projects/${projectId}/tasks/${taskId}/transition`)
      .set('Authorization', auth())
      .send({ status })
      .expect(201);

  const stamp = async (taskId: string) =>
    (await prisma.task.findUniqueOrThrow({ where: { id: taskId }, select: { statusChangedAt: true } }))
      .statusChangedAt;

  it('is when the task was created, for a task that has not moved, and it is on the task and on the card', async () => {
    const projectId = await createProject();
    const taskId = await createTask(projectId);

    const row = await prisma.task.findUniqueOrThrow({ where: { id: taskId } });
    expect(Math.abs(row.statusChangedAt.getTime() - row.createdAt.getTime())).toBeLessThan(2000);

    const detail = await request(server())
      .get(`/projects/${projectId}/tasks/${taskId}`)
      .set('Authorization', auth())
      .expect(200);
    const list = await request(server()).get(`/projects/${projectId}/tasks`).set('Authorization', auth()).expect(200);
    const card = (list.body as { id: string; statusChangedAt: string }[]).find((item) => item.id === taskId);
    expect(detail.body.statusChangedAt).toBe(row.statusChangedAt.toISOString());
    expect(card?.statusChangedAt).toBe(row.statusChangedAt.toISOString());
  });

  it('moves forward with every change of status: an assignment that promotes the task and each transition', async () => {
    const projectId = await createProject();
    const taskId = await createTask(projectId);
    let previous = await stamp(taskId);

    for (const step of ['assign', 'EN_DESARROLLO', 'QA', 'TERMINADA', 'QA'] as const) {
      await pause(15);
      if (step === 'assign') {
        await assign(projectId, taskId, ownerId);
      } else {
        await transition(projectId, taskId, step);
      }
      const next = await stamp(taskId);
      expect(next.getTime(), `after ${step}`).toBeGreaterThan(previous.getTime());
      previous = next;
    }
  });

  it('does not move when the task stays in its state: an edit, a comment or a reassignment', async () => {
    const projectId = await createProject();
    const taskId = await createTask(projectId);
    await assign(projectId, taskId, ownerId);
    const stamped = await stamp(taskId);
    await pause(15);

    await request(server())
      .patch(`/projects/${projectId}/tasks/${taskId}`)
      .set('Authorization', auth())
      .send({ description: 'More detail' })
      .expect(200);
    await request(server())
      .post(`/projects/${projectId}/tasks/${taskId}/comments`)
      .set('Authorization', auth())
      .send({ body: 'A note' })
      .expect(201);
    await assign(projectId, taskId, ownerId);

    expect((await stamp(taskId)).getTime()).toBe(stamped.getTime());
  });

  it('moves when the task goes back to PENDIENTE because its assignee left the project', async () => {
    const projectId = await createProject();
    const person = await request(server())
      .post('/users')
      .set('Authorization', auth())
      .send({
        displayName: 'Leaving Person',
        email: `leaving-${Date.now()}-${Math.floor(Math.random() * 1e6)}@pmhybrid.local`,
        password: 'password123',
      })
      .expect(201);
    const actorId = person.body.id as string;
    await request(server()).post(`/projects/${projectId}/members`).set('Authorization', auth()).send({ actorId }).expect(201);
    await assignProjectRole(server(), auth(), projectId, actorId, 'DEVELOPER');
    const taskId = await createTask(projectId);
    await assign(projectId, taskId, actorId);
    const assigned = await stamp(taskId);
    await pause(15);

    await request(server()).delete(`/projects/${projectId}/members/${actorId}`).set('Authorization', auth()).expect(200);

    expect((await prisma.task.findUniqueOrThrow({ where: { id: taskId } })).status).toBe('PENDIENTE');
    expect((await stamp(taskId)).getTime()).toBeGreaterThan(assigned.getTime());
  });

  it('moves when a document changes the status in a sync, and not when the sync finds nothing new', async () => {
    const docs = createScratchDocsPath();
    const file = path.join(docs, 'Roadmap.md');
    writeFileSync(file, roadmap('| ST-1 | Work | check | TODO | — | — |'), 'utf-8');
    const projectId = await createProject(docs);
    const sync = () => request(server()).post(`/projects/${projectId}/sync`).set('Authorization', auth()).expect(201);
    await sync();
    const taskId = (await prisma.task.findFirstOrThrow({ where: { projectId, externalId: 'ST-1' } })).id;
    const created = await stamp(taskId);
    await pause(15);

    await sync();
    expect((await stamp(taskId)).getTime()).toBe(created.getTime());

    writeFileSync(file, roadmap('| ST-1 | Work | check | IN PROGRESS | — | — |'), 'utf-8');
    await sync();
    expect((await prisma.task.findUniqueOrThrow({ where: { id: taskId } })).status).toBe('EN_DESARROLLO');
    expect((await stamp(taskId)).getTime()).toBeGreaterThan(created.getTime());
  });

  describe('the backfill of the migration', () => {
    /** The UPDATE of the migration itself, so the test cannot drift from what ran. */
    const backfill = readFileSync(
      path.join(process.cwd(), 'prisma/migrations/20261013140000_add_task_status_changed_at/migration.sql'),
      'utf-8',
    )
      .split(';')
      .map((statement) => statement.trim())
      .find((statement) => /^UPDATE "Task"/m.test(statement.replace(/^(--.*\n)+/gm, '')))!
      .replace(/^(--.*\n)+/gm, '');

    it('takes the latest status change of the audit trail, else the creation time, and is the same when run twice', async () => {
      const projectId = await createProject();
      const moved = await createTask(projectId, 'Moved');
      const untouched = await createTask(projectId, 'Untouched');
      await assign(projectId, moved, ownerId);
      await transition(projectId, moved, 'EN_DESARROLLO');
      const lastChange = await prisma.auditEvent.findFirstOrThrow({
        where: { entityType: 'Task', entityId: moved, operation: 'STATUS_CHANGE' },
        orderBy: { occurredAt: 'desc' },
      });
      const old = new Date('2020-01-01T00:00:00Z');
      await prisma.task.updateMany({ where: { id: { in: [moved, untouched] } }, data: { statusChangedAt: old } });

      await prisma.$executeRawUnsafe(backfill);
      const afterOnce = [await stamp(moved), await stamp(untouched)];
      await prisma.$executeRawUnsafe(backfill);

      expect(afterOnce[0].getTime()).toBe(lastChange.occurredAt.getTime());
      expect(afterOnce[1].getTime()).toBe(
        (await prisma.task.findUniqueOrThrow({ where: { id: untouched } })).createdAt.getTime(),
      );
      expect([await stamp(moved), await stamp(untouched)].map((date) => date.getTime())).toEqual(
        afterOnce.map((date) => date.getTime()),
      );
    });
  });
});
