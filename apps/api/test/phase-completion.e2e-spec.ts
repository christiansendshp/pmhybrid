import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma, TaskSourceOrigin, TaskStatus } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { PhaseCompletionService } from './../src/modules/notifications/phase-completion.service.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { DEMO_EMAIL, DEMO_PASSWORD } from './../prisma/demo-credentials.js';
import { createScratchDocsPath } from './helpers/scratch-docs.js';

interface Notified {
  type: string;
  payload: Record<string, unknown>;
}

/**
 * The members are told, once, when the last open work task of a phase is done (Roadmap TASK-41), and again only
 * after the phase had an open task and was finished once more.
 */
describe('Phase completed notifications (e2e, Roadmap TASK-41)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let phases: PhaseCompletionService;
  let ownerToken: string;
  let ownerId: string;
  let member: { id: string; token: string };

  const server = () => app.getHttpServer();
  const auth = (token: string) => `Bearer ${token}`;
  const unique = (label: string) =>
    `${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

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
    phases = moduleFixture.get(PhaseCompletionService);
    const login = await request(server())
      .post('/auth/login')
      .send({ email: DEMO_EMAIL, password: DEMO_PASSWORD })
      .expect(200);
    ownerToken = login.body.accessToken;
    ownerId = (
      await prisma.actor.findFirstOrThrow({ where: { email: DEMO_EMAIL } })
    ).id;
    const email = `${unique('member')}@pmhybrid.local`;
    const created = await request(server())
      .post('/users')
      .set('Authorization', auth(ownerToken))
      .send({ displayName: unique('Member'), email, password: 'password123' })
      .expect(201);
    const memberLogin = await request(server())
      .post('/auth/login')
      .send({ email, password: 'password123' })
      .expect(200);
    member = {
      id: created.body.id as string,
      token: memberLogin.body.accessToken as string,
    };
  });

  afterAll(async () => {
    await app.close();
  });

  /** A project with a phase, the member of the suite in it, and the owner. */
  async function scenario() {
    const created = await request(server())
      .post('/projects')
      .set('Authorization', auth(ownerToken))
      .send({ name: unique('Phase E2E'), docsPath: createScratchDocsPath() })
      .expect(201);
    const projectId = created.body.id as string;
    await request(server())
      .post(`/projects/${projectId}/members`)
      .set('Authorization', auth(ownerToken))
      .send({ actorId: member.id })
      .expect(201);
    const phase = await prisma.phase.create({
      data: { projectId, name: unique('Fase'), order: 1 },
    });
    const task = (
      title: string,
      status: TaskStatus,
      extra: Partial<Prisma.TaskUncheckedCreateInput> = {},
    ) =>
      prisma.task.create({
        data: {
          projectId,
          phaseId: phase.id,
          title,
          status,
          completedAt: status === TaskStatus.TERMINADA ? new Date() : null,
          sourceOrigin: TaskSourceOrigin.UI,
          ...extra,
        },
      });
    const finish = (taskId: string) =>
      prisma.task.update({
        where: { id: taskId },
        data: { status: TaskStatus.TERMINADA, completedAt: new Date() },
      });
    return { projectId, phase, task, finish };
  }

  /** The announcements of a phase that a person has. */
  const announced = async (token: string, phaseId: string) => {
    const res = await request(server())
      .get('/notifications')
      .set('Authorization', auth(token))
      .expect(200);
    return (res.body as Notified[]).filter(
      (n) => n.type === 'PHASE_COMPLETED' && n.payload['phaseId'] === phaseId,
    );
  };

  it('tells every member the phase is complete, naming it, when its last open task is done', async () => {
    const { projectId, phase, task, finish } = await scenario();
    await task('Done already', TaskStatus.TERMINADA);
    const last = await task('Last one', TaskStatus.QA);

    await finish(last.id);
    await phases.check(projectId);

    expect([
      (await announced(member.token, phase.id)).map((n) => n.payload['name']),
      (await announced(ownerToken, phase.id)).length,
    ]).toEqual([[phase.name], 1]);
  });

  it('tells nobody while the phase has an open task', async () => {
    const { projectId, phase, task } = await scenario();
    await task('Done', TaskStatus.TERMINADA);
    await task('Open', TaskStatus.EN_DESARROLLO);

    await phases.check(projectId);

    expect(await announced(member.token, phase.id)).toEqual([]);
  });

  it('does not repeat it when checked again', async () => {
    const { projectId, phase, task } = await scenario();
    await task('Done', TaskStatus.TERMINADA);

    await phases.check(projectId);
    await phases.check(projectId);

    expect(await announced(member.token, phase.id)).toHaveLength(1);
  });

  it('announces the phase again after a task was added to it and finished', async () => {
    const { projectId, phase, task, finish } = await scenario();
    await task('Done', TaskStatus.TERMINADA);
    await phases.check(projectId);
    const added = await task('Added later', TaskStatus.PENDIENTE);

    await phases.check(projectId);
    await finish(added.id);
    await phases.check(projectId);

    expect(await announced(member.token, phase.id)).toHaveLength(2);
  });

  it('forgets the announcement while the phase is open again, so the marker is clear', async () => {
    const { projectId, phase, task } = await scenario();
    await task('Done', TaskStatus.TERMINADA);
    await phases.check(projectId);
    await task('Added later', TaskStatus.PENDIENTE);

    await phases.check(projectId);

    expect(
      (await prisma.phase.findUniqueOrThrow({ where: { id: phase.id } }))
        .completionNotifiedAt,
    ).toBeNull();
  });

  it('does not count the cards that are not work nor the deleted tasks', async () => {
    const { projectId, phase, task } = await scenario();
    await task('Done', TaskStatus.TERMINADA);
    await task('An open epic card', TaskStatus.PENDIENTE, {
      entryType: 'EPIC',
    });
    await task('A deleted open task', TaskStatus.PENDIENTE, {
      deletedAt: new Date(),
    });

    await phases.check(projectId);

    expect(await announced(member.token, phase.id)).toHaveLength(1);
  });

  it('never announces a phase with no tasks', async () => {
    const { projectId, phase } = await scenario();

    await phases.check(projectId);

    expect(await announced(member.token, phase.id)).toEqual([]);
  });

  it('announces once when two checks run at the same time', async () => {
    const { projectId, phase, task } = await scenario();
    await task('Done', TaskStatus.TERMINADA);

    await Promise.all([phases.check(projectId), phases.check(projectId)]);

    expect(await announced(member.token, phase.id)).toHaveLength(1);
  });

  it('is announced by the write that completes the last task in the app', async () => {
    const { projectId, phase } = await scenario();
    const created = await request(server())
      .post(`/projects/${projectId}/tasks`)
      .set('Authorization', auth(ownerToken))
      .send({
        title: 'Only task',
        acceptanceCriteria: 'Verified',
        phaseId: phase.id,
      })
      .expect(201);
    const taskId = created.body.id as string;
    await request(server())
      .post(`/projects/${projectId}/tasks/${taskId}/assign`)
      .set('Authorization', auth(ownerToken))
      .send({ actorId: ownerId })
      .expect(201);
    expect(await announced(member.token, phase.id)).toEqual([]);

    for (const status of ['EN_DESARROLLO', 'QA', 'TERMINADA']) {
      await request(server())
        .post(`/projects/${projectId}/tasks/${taskId}/transition`)
        .set('Authorization', auth(ownerToken))
        .send({ status })
        .expect(201);
    }

    expect(await announced(member.token, phase.id)).toHaveLength(1);
  });

  it('is announced after a synchronization when the tasks were finished some other way', async () => {
    const { projectId, phase, task } = await scenario();
    await task('Done', TaskStatus.TERMINADA);

    await request(server())
      .post(`/projects/${projectId}/sync`)
      .set('Authorization', auth(ownerToken))
      .expect(201);

    expect(await announced(member.token, phase.id)).toHaveLength(1);
  });
});
