import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { DEMO_EMAIL, DEMO_PASSWORD } from './../prisma/demo-credentials.js';
import { createScratchDocsPath } from './helpers/scratch-docs.js';

/**
 * Nothing told a person or an agent it was given a task, or that one was taken
 * from it (Roadmap GAP-36c).
 */
describe('Assignment and comment notifications (e2e, Roadmap GAP-36c)', () => {
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
  const auth = (token = ownerToken) => `Bearer ${token}`;
  const unique = (label: string) =>
    `${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

  async function createMember(projectId: string) {
    const email = `${unique('assignee')}@pmhybrid.local`;
    const password = 'assignee12345';
    const created = await request(server())
      .post('/users')
      .set('Authorization', auth())
      .send({ displayName: unique('Assignee'), email, password })
      .expect(201);
    await request(server())
      .post(`/projects/${projectId}/members`)
      .set('Authorization', auth())
      .send({ actorId: created.body.id })
      .expect(201);
    const login = await request(server())
      .post('/auth/login')
      .send({ email, password })
      .expect(200);
    return {
      id: created.body.id as string,
      token: login.body.accessToken as string,
    };
  }

  async function setup() {
    const project = await request(server())
      .post('/projects')
      .set('Authorization', auth())
      .send({ name: unique('Assign E2E'), docsPath: createScratchDocsPath() })
      .expect(201);
    const projectId = project.body.id as string;
    const task = await request(server())
      .post(`/projects/${projectId}/tasks`)
      .set('Authorization', auth())
      .send({ title: 'Assigned work', acceptanceCriteria: 'Verified' })
      .expect(201);
    return { projectId, taskId: task.body.id as string };
  }

  const assign = (projectId: string, taskId: string, actorId: string) =>
    request(server())
      .post(`/projects/${projectId}/tasks/${taskId}/assign`)
      .set('Authorization', auth())
      .send({ actorId });

  async function notificationsOf(token: string, type: string) {
    const res = await request(server())
      .get('/notifications')
      .set('Authorization', auth(token))
      .expect(200);
    return (
      res.body as { type: string; payload: Record<string, unknown> }[]
    ).filter((n) => n.type === type);
  }

  it('tells the new assignee, and says which task, but not whoever assigned it', async () => {
    const { projectId, taskId } = await setup();
    const member = await createMember(projectId);

    await assign(projectId, taskId, member.id).expect(201);

    const told = await notificationsOf(member.token, 'TASK_ASSIGNED');
    expect(told).toHaveLength(1);
    expect(told[0].payload).toMatchObject({ taskId, title: 'Assigned work' });
    // The owner did this: nothing about it for them (scoped to this task —
    // the demo owner is shared across the suite).
    const owners = await notificationsOf(ownerToken, 'TASK_ASSIGNED');
    expect(owners.some((n) => n.payload.taskId === taskId)).toBe(false);
  });

  it('tells the previous assignee the task was taken from them, and the new one it was given', async () => {
    const { projectId, taskId } = await setup();
    const first = await createMember(projectId);
    const second = await createMember(projectId);
    await assign(projectId, taskId, first.id).expect(201);

    await assign(projectId, taskId, second.id).expect(201);

    expect(await notificationsOf(first.token, 'TASK_REASSIGNED')).toHaveLength(
      1,
    );
    expect(await notificationsOf(second.token, 'TASK_ASSIGNED')).toHaveLength(
      1,
    );
    // Not told twice, and not told what did not happen to them.
    expect(await notificationsOf(second.token, 'TASK_REASSIGNED')).toHaveLength(
      0,
    );
    expect(await notificationsOf(first.token, 'TASK_ASSIGNED')).toHaveLength(1);
  });

  it('does not tell a person about their own action', async () => {
    const { projectId, taskId } = await setup();
    const me = await request(server())
      .get('/auth/me')
      .set('Authorization', auth())
      .expect(200);

    await assign(projectId, taskId, me.body.id).expect(201);

    const owners = await notificationsOf(ownerToken, 'TASK_ASSIGNED');
    expect(owners.some((n) => n.payload.taskId === taskId)).toBe(false);
  });

  it('tells whoever holds a task about a comment on it, unless they wrote it', async () => {
    const { projectId, taskId } = await setup();
    const member = await createMember(projectId);
    await assign(projectId, taskId, member.id).expect(201);
    const comment = (token: string, body: string) =>
      request(server())
        .post(`/projects/${projectId}/tasks/${taskId}/comments`)
        .set('Authorization', auth(token))
        .send({ body })
        .expect(201);

    await comment(ownerToken, 'Any news on this?');
    expect(await notificationsOf(member.token, 'TASK_COMMENTED')).toHaveLength(
      1,
    );

    // The assignee answering their own task tells nobody new.
    await comment(member.token, 'Working on it.');
    expect(await notificationsOf(member.token, 'TASK_COMMENTED')).toHaveLength(
      1,
    );
  });

  it('notifies nobody, and changes nothing, for an assignment that is refused', async () => {
    const { projectId, taskId } = await setup();
    const member = await createMember(projectId);
    await request(server())
      .patch(`/users/${member.id}`)
      .set('Authorization', auth())
      .send({ isActive: false })
      .expect(200);

    // An inactive person cannot be assigned at all (400), which is the existing rule;
    // the notification code is never reached and nothing is left half done.
    await assign(projectId, taskId, member.id).expect(400);
    expect(
      await notificationsOf(ownerToken, 'TASK_ASSIGNED'),
    ).not.toContainEqual(
      expect.objectContaining({ payload: expect.objectContaining({ taskId }) }),
    );
  });
});
