import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { DEMO_EMAIL, DEMO_PASSWORD } from './../prisma/demo-credentials.js';
import { assignProjectRole } from './helpers/roles.js';
import { createScratchDocsPath } from './helpers/scratch-docs.js';

/** Who was asked to review a task, set on the way into QA and cleared when it leaves (Roadmap SUBTASK-09.1). */
describe('Task reviewer (e2e, Roadmap SUBTASK-09.1)', () => {
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

  async function project() {
    const created = await request(server())
      .post('/projects')
      .set('Authorization', auth())
      .send({ name: unique('Reviewer E2E'), docsPath: createScratchDocsPath() })
      .expect(201);
    return created.body.id as string;
  }

  async function member(
    projectId: string,
    kind: 'person' | 'agent' = 'person',
  ) {
    const created =
      kind === 'person'
        ? await request(server())
            .post('/users')
            .set('Authorization', auth())
            .send({
              displayName: unique('Reviewer'),
              email: `${unique('reviewer')}@pmhybrid.local`,
              password: 'password123',
            })
            .expect(201)
        : await request(server())
            .post('/agents')
            .set('Authorization', auth())
            .send({
              displayName: unique('Review Agent'),
              providerType: 'custom',
            })
            .expect(201);
    await request(server())
      .post(`/projects/${projectId}/members`)
      .set('Authorization', auth())
      .send({ actorId: created.body.id })
      .expect(201);
    return {
      id: created.body.id as string,
      displayName: created.body.displayName as string,
    };
  }

  /** A task the owner has assigned to themself and is developing. */
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
    await transition(projectId, taskId, 'EN_DESARROLLO').expect(201);
    return taskId;
  }

  const transition = (
    projectId: string,
    taskId: string,
    status: string,
    reviewerActorId?: string | null,
  ) =>
    request(server())
      .post(`/projects/${projectId}/tasks/${taskId}/transition`)
      .set('Authorization', auth())
      .send({
        status,
        ...(reviewerActorId !== undefined ? { reviewerActorId } : {}),
      });

  const detail = async (projectId: string, taskId: string) =>
    (
      await request(server())
        .get(`/projects/${projectId}/tasks/${taskId}`)
        .set('Authorization', auth())
        .expect(200)
    ).body;

  const card = async (projectId: string, taskId: string) =>
    (
      (
        await request(server())
          .get(`/projects/${projectId}/tasks`)
          .set('Authorization', auth())
          .expect(200)
      ).body as { id: string }[]
    ).find((item) => item.id === taskId) as Record<string, unknown>;

  it('stores who was asked and since when on the way into QA, and shows them on the task and its card', async () => {
    const projectId = await project();
    const reviewer = await member(projectId);
    const taskId = await developing(projectId);
    const before = Date.now();

    await transition(projectId, taskId, 'QA', reviewer.id).expect(201);

    const task = await detail(projectId, taskId);
    expect(task).toMatchObject({
      status: 'QA',
      reviewerActorId: reviewer.id,
      reviewer: {
        id: reviewer.id,
        displayName: reviewer.displayName,
        kind: 'HUMAN',
      },
    });
    expect(new Date(task.reviewRequestedAt).getTime()).toBeGreaterThanOrEqual(
      before - 1000,
    );
    expect(await card(projectId, taskId)).toMatchObject({
      reviewerActorId: reviewer.id,
      reviewer: { id: reviewer.id },
    });
  });

  it('can be an agent, and is audited with the move', async () => {
    const projectId = await project();
    const reviewer = await member(projectId, 'agent');
    const taskId = await developing(projectId);

    await transition(projectId, taskId, 'QA', reviewer.id).expect(201);

    expect((await detail(projectId, taskId)).reviewer).toMatchObject({
      id: reviewer.id,
      kind: 'AI_AGENT',
    });
    const event = await prisma.auditEvent.findFirstOrThrow({
      where: {
        entityType: 'Task',
        entityId: taskId,
        operation: 'STATUS_CHANGE',
      },
      orderBy: { occurredAt: 'desc' },
    });
    expect(event.newValue).toEqual({
      status: 'QA',
      reviewerActorId: reviewer.id,
    });
    expect(event.previousValue).toEqual({ status: 'EN_DESARROLLO' });
  });

  it('clears both when the task leaves QA, whichever way', async () => {
    const projectId = await project();
    const reviewer = await member(projectId);
    for (const next of ['EN_DESARROLLO', 'TERMINADA']) {
      const taskId = await developing(projectId);
      await transition(projectId, taskId, 'QA', reviewer.id).expect(201);

      await transition(projectId, taskId, next).expect(201);

      expect(await detail(projectId, taskId), next).toMatchObject({
        status: next,
        reviewerActorId: null,
        reviewer: null,
        reviewRequestedAt: null,
      });
    }
  });

  it('behaves as before for a move to QA that names nobody: one step, no reviewer', async () => {
    const projectId = await project();
    const taskId = await developing(projectId);

    await transition(projectId, taskId, 'QA').expect(201);

    expect(await detail(projectId, taskId)).toMatchObject({
      status: 'QA',
      reviewerActorId: null,
      reviewer: null,
      reviewRequestedAt: null,
    });
    // An explicit null is the same as nobody.
    const other = await developing(projectId);
    await transition(projectId, other, 'QA', null).expect(201);
    expect((await detail(projectId, other)).reviewerActorId).toBeNull();
  });

  it('changes neither the assignee nor the lock', async () => {
    const projectId = await project();
    const reviewer = await member(projectId);
    const taskId = await developing(projectId);
    const before = await detail(projectId, taskId);

    await transition(projectId, taskId, 'QA', reviewer.id).expect(201);

    const after = await detail(projectId, taskId);
    expect(after.assigneeActorId).toBe(ownerId);
    expect(after.assigneeActorId).toBe(before.assigneeActorId);
    expect(after.assignee).toEqual(before.assignee);
  });

  it('refuses a reviewer who is not an active member of the project, or who is inactive', async () => {
    const projectId = await project();
    const taskId = await developing(projectId);
    const outsider = await request(server())
      .post('/users')
      .set('Authorization', auth())
      .send({
        displayName: unique('Outsider'),
        email: `${unique('outsider')}@pmhybrid.local`,
        password: 'password123',
      })
      .expect(201);
    const gone = await member(projectId);
    await prisma.actor.update({
      where: { id: gone.id },
      data: { isActive: false },
    });

    const notMember = await transition(
      projectId,
      taskId,
      'QA',
      outsider.body.id,
    ).expect(400);
    const inactive = await transition(projectId, taskId, 'QA', gone.id).expect(
      400,
    );

    expect(notMember.body.message).toBe(
      'The reviewer must be a project member',
    );
    expect(inactive.body.message).toBe('The reviewer is inactive');
    expect((await detail(projectId, taskId)).status).toBe('EN_DESARROLLO');
  });

  it('refuses a reviewer with any move that is not the one into QA', async () => {
    const projectId = await project();
    const reviewer = await member(projectId);
    const taskId = await developing(projectId);
    await transition(projectId, taskId, 'QA').expect(201);

    const res = await transition(
      projectId,
      taskId,
      'TERMINADA',
      reviewer.id,
    ).expect(400);

    expect(res.body.message).toBe(
      'A reviewer can only be asked for with the move to QA',
    );
    expect((await detail(projectId, taskId)).status).toBe('QA');
  });
});

describe('Reviewers of a project and the agent on a card (e2e, Roadmap SUBTASK-09.3, TASK-13)', () => {
  let app: INestApplication<App>;
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
  const unique = (label: string) =>
    `${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

  it('lists the active members who may approve QA, and not the others', async () => {
    const created = await request(server())
      .post('/projects')
      .set('Authorization', auth())
      .send({
        name: unique('Reviewers E2E'),
        docsPath: createScratchDocsPath(),
      })
      .expect(201);
    const projectId = created.body.id as string;
    const member = async (roleName: string | null) => {
      const user = await request(server())
        .post('/users')
        .set('Authorization', auth())
        .send({
          displayName: unique(roleName ?? 'No role'),
          email: `${unique('member')}@pmhybrid.local`,
          password: 'password123',
        })
        .expect(201);
      await request(server())
        .post(`/projects/${projectId}/members`)
        .set('Authorization', auth())
        .send({ actorId: user.body.id })
        .expect(201);
      if (roleName) {
        await assignProjectRole(
          server(),
          auth(),
          projectId,
          user.body.id,
          roleName,
        );
      }
      return user.body.id as string;
    };
    const qa = await member('QA');
    const manager = await member('PROJECT_MANAGER');
    const developer = await member('DEVELOPER');
    const none = await member(null);

    const res = await request(server())
      .get(`/projects/${projectId}/reviewers`)
      .set('Authorization', auth())
      .expect(200);

    const ids = (res.body as { id: string }[]).map((actor) => actor.id);
    expect(ids).toEqual(expect.arrayContaining([qa, manager]));
    expect(ids).not.toContain(developer);
    expect(ids).not.toContain(none);
    expect(res.body[0]).toEqual({
      id: expect.any(String),
      displayName: expect.any(String),
      kind: expect.stringMatching(/^(HUMAN|AI_AGENT)$/),
    });
    await request(server()).get(`/projects/${projectId}/reviewers`).expect(401);
  });

  it("names the agent's model on its card and its page, and a person has none", async () => {
    const created = await request(server())
      .post('/projects')
      .set('Authorization', auth())
      .send({ name: unique('Model E2E'), docsPath: createScratchDocsPath() })
      .expect(201);
    const projectId = created.body.id as string;
    const agent = await request(server())
      .post('/agents')
      .set('Authorization', auth())
      .send({
        displayName: unique('Model Agent'),
        providerType: 'custom',
        model: 'Claude Sonnet 5.5',
      })
      .expect(201);
    await request(server())
      .post(`/projects/${projectId}/members`)
      .set('Authorization', auth())
      .send({ actorId: agent.body.id })
      .expect(201);
    const task = await request(server())
      .post(`/projects/${projectId}/tasks`)
      .set('Authorization', auth())
      .send({ title: 'Who works on it', acceptanceCriteria: 'Verified' })
      .expect(201);
    await request(server())
      .post(`/projects/${projectId}/tasks/${task.body.id}/assign`)
      .set('Authorization', auth())
      .send({ actorId: agent.body.id })
      .expect(201);

    const list = await request(server())
      .get(`/projects/${projectId}/tasks`)
      .set('Authorization', auth())
      .expect(200);
    const page = await request(server())
      .get(`/projects/${projectId}/tasks/${task.body.id}`)
      .set('Authorization', auth())
      .expect(200);

    const expected = {
      id: agent.body.id,
      kind: 'AI_AGENT',
      model: 'Claude Sonnet 5.5',
    };
    expect(list.body[0].assignee).toMatchObject(expected);
    expect(page.body.assignee).toMatchObject(expected);
    expect(JSON.stringify(list.body[0].assignee)).not.toContain('agentProfile');
  });
});
