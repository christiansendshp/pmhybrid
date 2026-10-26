import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { DEMO_EMAIL, DEMO_PASSWORD } from './../prisma/demo-credentials.js';
import { assignProjectRole } from './helpers/roles.js';
import { createScratchDocsPath } from './helpers/scratch-docs.js';

/**
 * A project that requires approval asks three things of a move to QA: a reviewer, who can approve QA in
 * the project, and who is not the person who developed the task. A project that does not is asked nothing
 * (Roadmap SUBTASK-09.2, DEC-006).
 */
describe('The reviewer rules of a move to QA (e2e, Roadmap SUBTASK-09.2)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let ownerToken: string;
  let ownerId: string;

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
    ownerId = (
      await request(server())
        .get('/auth/me')
        .set('Authorization', auth())
        .expect(200)
    ).body.id;
  });

  afterEach(async () => {
    await app.close();
  });

  const server = () => app.getHttpServer();
  const auth = () => `Bearer ${ownerToken}`;
  const unique = (label: string) =>
    `${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

  async function project(qaApprovalRequired: boolean) {
    const created = await request(server())
      .post('/projects')
      .set('Authorization', auth())
      .send({ name: unique('QA rules E2E'), docsPath: createScratchDocsPath() })
      .expect(201);
    const projectId = created.body.id as string;
    if (qaApprovalRequired) {
      await request(server())
        .patch(`/projects/${projectId}`)
        .set('Authorization', auth())
        .send({ qaApprovalRequired: true })
        .expect(200);
    }
    return projectId;
  }

  /** A person to name as reviewer, who never signs in: no password, so no hash. */
  async function reviewer(projectId: string, role: string | null) {
    const actor = await prisma.actor.create({
      data: {
        kind: 'HUMAN',
        displayName: unique('Reviewer'),
        email: `${unique('r')}@pmhybrid.local`,
      },
    });
    await request(server())
      .post(`/projects/${projectId}/members`)
      .set('Authorization', auth())
      .send({ actorId: actor.id })
      .expect(201);
    if (role) {
      await assignProjectRole(server(), auth(), projectId, actor.id, role);
    }
    return actor.id;
  }

  /** A task the owner developed: assigned to them and in development. */
  async function developing(projectId: string) {
    const task = await request(server())
      .post(`/projects/${projectId}/tasks`)
      .set('Authorization', auth())
      .send({ title: 'Review me', acceptanceCriteria: 'Verified' })
      .expect(201);
    const taskId = task.body.id as string;
    await request(server())
      .post(`/projects/${projectId}/tasks/${taskId}/assign`)
      .set('Authorization', auth())
      .send({ actorId: ownerId })
      .expect(201);
    await request(server())
      .post(`/projects/${projectId}/tasks/${taskId}/transition`)
      .set('Authorization', auth())
      .send({ status: 'EN_DESARROLLO' })
      .expect(201);
    return taskId;
  }

  const toQa = (projectId: string, taskId: string, reviewerActorId?: string) =>
    request(server())
      .post(`/projects/${projectId}/tasks/${taskId}/transition`)
      .set('Authorization', auth())
      .send({
        status: 'QA',
        ...(reviewerActorId ? { reviewerActorId } : {}),
      });

  const statusOf = async (taskId: string) =>
    (await prisma.task.findUniqueOrThrow({ where: { id: taskId } })).status;

  it('starts off for every project, and is turned on and off with the project settings', async () => {
    const projectId = await project(false);
    const fresh = await request(server())
      .get(`/projects/${projectId}`)
      .set('Authorization', auth())
      .expect(200);
    const on = await request(server())
      .patch(`/projects/${projectId}`)
      .set('Authorization', auth())
      .send({ qaApprovalRequired: true })
      .expect(200);
    const off = await request(server())
      .patch(`/projects/${projectId}`)
      .set('Authorization', auth())
      .send({ qaApprovalRequired: false })
      .expect(200);

    expect([
      fresh.body.qaApprovalRequired,
      on.body.qaApprovalRequired,
      off.body.qaApprovalRequired,
    ]).toEqual([false, true, false]);
  });

  it.each(['yes', 1, null])(
    'refuses %j as the value of the switch',
    async (value) => {
      const projectId = await project(false);

      await request(server())
        .patch(`/projects/${projectId}`)
        .set('Authorization', auth())
        .send({ qaApprovalRequired: value })
        .expect(400);
    },
  );

  describe('with the switch on', () => {
    it('refuses a move to QA with no reviewer, and leaves the task where it was', async () => {
      const projectId = await project(true);
      const taskId = await developing(projectId);

      const res = await toQa(projectId, taskId).expect(400);

      expect(res.body.message).toBe(
        'This project requires a reviewer to move a task to QA',
      );
      expect(await statusOf(taskId)).toBe('EN_DESARROLLO');
    });

    it('refuses the person who developed the task as its reviewer', async () => {
      const projectId = await project(true);
      const taskId = await developing(projectId);

      const res = await toQa(projectId, taskId, ownerId).expect(400);

      expect(res.body.message).toBe(
        'The reviewer must not be the person who developed the task',
      );
    });

    it('refuses a reviewer who cannot approve QA in the project', async () => {
      const projectId = await project(true);
      const taskId = await developing(projectId);
      const noRole = await reviewer(projectId, null);

      const res = await toQa(projectId, taskId, noRole).expect(400);

      expect(res.body.message).toBe(
        'The reviewer must be able to approve QA in this project',
      );
    });

    it('moves the task to QA with another member who can approve, and keeps them as its reviewer', async () => {
      const projectId = await project(true);
      const taskId = await developing(projectId);
      const qa = await reviewer(projectId, 'QA');

      await toQa(projectId, taskId, qa).expect(201);

      const task = await prisma.task.findUniqueOrThrow({
        where: { id: taskId },
      });
      expect(task).toMatchObject({ status: 'QA', reviewerActorId: qa });
    });

    it('leaves every other move alone: a task goes back to waiting with no reviewer', async () => {
      const projectId = await project(true);
      const taskId = await developing(projectId);

      await request(server())
        .post(`/projects/${projectId}/tasks/${taskId}/transition`)
        .set('Authorization', auth())
        .send({ status: 'ASIGNADA' })
        .expect(201);

      expect(await statusOf(taskId)).toBe('ASIGNADA');
    });
  });

  describe('with the switch off', () => {
    it('moves a task to QA with no reviewer, as before', async () => {
      const projectId = await project(false);
      const taskId = await developing(projectId);

      await toQa(projectId, taskId).expect(201);

      expect(await statusOf(taskId)).toBe('QA');
    });

    it('accepts the person who developed the task as its reviewer, as before', async () => {
      const projectId = await project(false);
      const taskId = await developing(projectId);

      await toQa(projectId, taskId, ownerId).expect(201);

      expect(
        (await prisma.task.findUniqueOrThrow({ where: { id: taskId } }))
          .reviewerActorId,
      ).toBe(ownerId);
    });
  });
});
