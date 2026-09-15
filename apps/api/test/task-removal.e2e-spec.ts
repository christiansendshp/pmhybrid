import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { DEMO_EMAIL, DEMO_PASSWORD } from './../prisma/demo-credentials.js';
import { createScratchDocsPath } from './helpers/scratch-docs.js';

const NEAR_TERM_ROADMAP = `# Roadmap

## Active work

| ID | Outcome | Acceptance check | Status | Owner | Depends on |
| --- | --- | --- | --- | --- | --- |
| — | — | — | — | — | — |

## Near term

| ID | Outcome | Acceptance check | Status | Depends on |
| --- | --- | --- | --- | --- |
| DOC-1 | Document task | reviewed | TODO | — |

## Blocked

| ID | Blocker | Needed decision or event | Owner |
| --- | --- | --- | --- |
| — | — | — | — |
`;

describe('Task removal (brief §25, §31 — e2e)', () => {
  let app: INestApplication<App>;
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

    const login = await request(app.getHttpServer())
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

  async function createProject(docsPath = createScratchDocsPath()) {
    const project = await request(server())
      .post('/projects')
      .set('Authorization', auth())
      .send({ name: `Removal E2E ${Date.now()}-${Math.random()}`, docsPath })
      .expect(201);
    return { projectId: project.body.id as string, docsPath };
  }
  const createTask = (projectId: string, body: object = {}) =>
    request(server())
      .post(`/projects/${projectId}/tasks`)
      .set('Authorization', auth())
      .send({
        title: 'Task to remove',
        acceptanceCriteria: 'Removed cleanly',
        ...body,
      })
      .expect(201);
  const removeTask = (projectId: string, taskId: string, bearer = auth()) =>
    request(server())
      .delete(`/projects/${projectId}/tasks/${taskId}`)
      .set('Authorization', bearer);
  const sync = (projectId: string) =>
    request(server())
      .post(`/projects/${projectId}/sync`)
      .set('Authorization', auth())
      .expect(201);
  const listTasks = async (projectId: string) =>
    (
      await request(server())
        .get(`/projects/${projectId}/tasks`)
        .set('Authorization', auth())
        .expect(200)
    ).body as { id: string; externalId: string }[];

  it('removes a task: its Roadmap row goes, a REMOVED Agentslog entry stays, and sync neither conflicts nor brings it back', async () => {
    const { projectId, docsPath } = await createProject();
    const task = await createTask(projectId);
    const externalId = task.body.externalId as string;
    await sync(projectId);

    await removeTask(projectId, task.body.id).expect(200);

    const roadmap = readFileSync(path.join(docsPath, 'Roadmap.md'), 'utf-8');
    const agentslog = readFileSync(
      path.join(docsPath, 'Agentslog.md'),
      'utf-8',
    );
    expect(roadmap).not.toContain(`| ${externalId} |`);
    expect(agentslog).toContain(`| ${externalId} | CREATED`);
    expect(agentslog).toContain(`| ${externalId} | REMOVED`);

    await request(server())
      .get(`/projects/${projectId}/tasks/${task.body.id}`)
      .set('Authorization', auth())
      .expect(404);
    expect(await listTasks(projectId)).toHaveLength(0);

    const syncRun = await sync(projectId);
    expect(syncRun.body.summary).toMatchObject({
      conflictsRaised: 0,
      tasksCreated: 0,
    });
    expect(await listTasks(projectId)).toHaveLength(0);

    const audit = await request(server())
      .get(
        `/projects/${projectId}/audit?entityType=Task&entityId=${task.body.id}&operation=DELETE`,
      )
      .set('Authorization', auth())
      .expect(200);
    expect(audit.body).toHaveLength(1);
    expect(audit.body[0].previousValue).toMatchObject({
      externalId,
      title: 'Task to remove',
    });
  });

  it('removes a document-sourced Near term task in place and keeps the emptied table well formed', async () => {
    const docsPath = createScratchDocsPath();
    writeFileSync(
      path.join(docsPath, 'Roadmap.md'),
      NEAR_TERM_ROADMAP,
      'utf-8',
    );
    const { projectId } = await createProject(docsPath);
    await sync(projectId);
    const [task] = await listTasks(projectId);
    expect(task.externalId).toBe('DOC-1');

    await removeTask(projectId, task.id).expect(200);

    const roadmap = readFileSync(path.join(docsPath, 'Roadmap.md'), 'utf-8');
    expect(roadmap).not.toContain('DOC-1');
    expect(roadmap).toContain(
      '| ID | Outcome | Acceptance check | Status | Depends on |\n| --- | --- | --- | --- | --- |\n| — | — | — | — | — |',
    );

    const syncRun = await sync(projectId);
    expect(syncRun.body.summary).toMatchObject({
      conflictsRaised: 0,
      tasksCreated: 0,
    });
    expect(await listTasks(projectId)).toHaveLength(0);
  });

  it('refuses to remove a task with subtasks or without task.delete, and drops a removed subtask from progress', async () => {
    const { projectId } = await createProject();
    const parent = await createTask(projectId, { title: 'Parent' });
    const kept = await createTask(projectId, {
      title: 'Kept subtask',
      parentTaskId: parent.body.id,
      progressPercent: 80,
    });
    const dropped = await createTask(projectId, {
      title: 'Dropped subtask',
      parentTaskId: parent.body.id,
      progressPercent: 20,
    });

    await removeTask(projectId, parent.body.id).expect(400);

    // A DEVELOPER moves work across the board but cannot remove it.
    const email = `remover-${Date.now()}@pmhybrid.local`;
    const developer = await request(server())
      .post('/users')
      .set('Authorization', auth())
      .send({ displayName: 'Dev', email, password: 'developer123' })
      .expect(201);
    await request(server())
      .post(`/projects/${projectId}/members`)
      .set('Authorization', auth())
      .send({ actorId: developer.body.id })
      .expect(201);
    const roles = await request(server())
      .get('/roles')
      .set('Authorization', auth())
      .expect(200);
    const developerRole = roles.body.find(
      (r: { name: string }) => r.name === 'DEVELOPER',
    );
    await request(server())
      .post(`/projects/${projectId}/roles`)
      .set('Authorization', auth())
      .send({ actorId: developer.body.id, roleId: developerRole.id })
      .expect(201);
    const developerLogin = await request(server())
      .post('/auth/login')
      .send({ email, password: 'developer123' })
      .expect(200);
    await removeTask(
      projectId,
      dropped.body.id,
      `Bearer ${developerLogin.body.accessToken}`,
    ).expect(403);

    await removeTask(projectId, dropped.body.id).expect(200);
    await removeTask(projectId, dropped.body.id).expect(404);

    const detail = await request(server())
      .get(`/projects/${projectId}/tasks/${parent.body.id}`)
      .set('Authorization', auth())
      .expect(200);
    expect(
      detail.body.subtasks.map((subtask: { id: string }) => subtask.id),
    ).toEqual([kept.body.id]);
    expect(detail.body.computedProgress).toBe(80);
  });

  it('drops a removed task from the workload', async () => {
    const { projectId } = await createProject();
    const task = await createTask(projectId);
    const me = await request(server())
      .get('/auth/me')
      .set('Authorization', auth())
      .expect(200);
    await request(server())
      .post(`/projects/${projectId}/tasks/${task.body.id}/assign`)
      .set('Authorization', auth())
      .send({ actorId: me.body.id })
      .expect(201);
    const workloadTaskIds = async () =>
      (
        await request(server())
          .get(`/workload?projectId=${projectId}`)
          .set('Authorization', auth())
          .expect(200)
      ).body.map((row: { task: { id: string } | null }) => row.task?.id ?? null);
    expect(await workloadTaskIds()).toEqual([task.body.id]);

    await removeTask(projectId, task.body.id).expect(200);

    // Still an active member, the assignee now shows up idle.
    expect(await workloadTaskIds()).toEqual([null]);
  });
});
