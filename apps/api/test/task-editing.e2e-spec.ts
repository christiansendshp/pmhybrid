import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { DEMO_EMAIL, DEMO_PASSWORD } from './../prisma/demo-credentials.js';
import { createScratchDocsPath } from './helpers/scratch-docs.js';

const VALID_TASK = { title: 'Valid task', acceptanceCriteria: 'Reviewed and merged' };

describe('Task create/edit validation (brief §6, §9, §17 — e2e)', () => {
  let app: INestApplication<App>;
  let token: string;
  let projectId: string;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: DEMO_EMAIL, password: DEMO_PASSWORD })
      .expect(200);
    token = login.body.accessToken;

    const project = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: `Task editing E2E ${Date.now()}`, docsPath: createScratchDocsPath() })
      .expect(201);
    projectId = project.body.id;
  });

  afterEach(async () => {
    await app.close();
  });

  const post = (resource: string, body: object) =>
    request(app.getHttpServer())
      .post(`/projects/${projectId}/${resource}`)
      .set('Authorization', `Bearer ${token}`)
      .send(body);
  const patchTask = (taskId: string, body: object) =>
    request(app.getHttpServer())
      .patch(`/projects/${projectId}/tasks/${taskId}`)
      .set('Authorization', `Bearer ${token}`)
      .send(body);

  it('refuses an incomplete task: acceptance criteria are required and required text cannot be blank', async () => {
    await post('tasks', { title: 'No acceptance criteria' }).expect(400);
    await post('tasks', { title: '   ', acceptanceCriteria: 'Reviewed' }).expect(400);
    await post('tasks', { title: 'Blank acceptance', acceptanceCriteria: ' ' }).expect(400);

    const created = await post('tasks', VALID_TASK).expect(201);
    expect(created.body.acceptanceCriteria).toBe('Reviewed and merged');
  });

  it('rejects an unknown priority and dates out of order, and stores valid ones', async () => {
    await post('tasks', { ...VALID_TASK, priority: 'URGENT' }).expect(400);
    await post('tasks', { ...VALID_TASK, startDate: '2026-10-10', dueDate: '2026-10-01' }).expect(400);
    await post('tasks', { ...VALID_TASK, startDate: '2026-10-10', estimatedDate: '2026-10-09' }).expect(400);

    const created = await post('tasks', {
      ...VALID_TASK,
      priority: 'HIGH',
      startDate: '2026-10-01',
      estimatedDate: '2026-10-05',
      dueDate: '2026-10-10',
    }).expect(201);
    expect(created.body).toMatchObject({
      priority: 'HIGH',
      startDate: '2026-10-01T00:00:00.000Z',
      dueDate: '2026-10-10T00:00:00.000Z',
    });
  });

  it('validates the hierarchy structure: an epic must sit in the chosen phase and a template in the chosen epic', async () => {
    const phaseA = await post('phases', { name: 'Phase A', order: 1 }).expect(201);
    const phaseB = await post('phases', { name: 'Phase B', order: 2 }).expect(201);
    const epicInB = await post('epics', { name: 'Epic in B', order: 1, phaseId: phaseB.body.id }).expect(201);
    const looseEpic = await post('epics', { name: 'Loose epic', order: 2 }).expect(201);
    const template = await post('templates', { name: 'Template', order: 1, epicId: epicInB.body.id }).expect(201);

    await post('tasks', { ...VALID_TASK, phaseId: phaseA.body.id, epicId: epicInB.body.id }).expect(400);
    await post('tasks', { ...VALID_TASK, epicId: looseEpic.body.id, templateId: template.body.id }).expect(400);

    const placed = await post('tasks', {
      ...VALID_TASK,
      phaseId: phaseB.body.id,
      epicId: epicInB.body.id,
      templateId: template.body.id,
    }).expect(201);
    expect(placed.body).toMatchObject({
      phaseId: phaseB.body.id,
      epicId: epicInB.body.id,
      templateId: template.body.id,
    });

    // An epic outside any phase fits under any phase.
    await post('tasks', { ...VALID_TASK, phaseId: phaseA.body.id, epicId: looseEpic.body.id }).expect(201);

    // Moving the task checks the links it keeps: its epic still sits in Phase B.
    await patchTask(placed.body.id, { phaseId: phaseA.body.id }).expect(400);
    const moved = await patchTask(placed.body.id, {
      phaseId: phaseA.body.id,
      epicId: null,
      templateId: null,
    }).expect(200);
    expect(moved.body).toMatchObject({ phaseId: phaseA.body.id, epicId: null, templateId: null });
  });

  it('edits priority, progress and dates, clears optional fields with null, and never clears required ones', async () => {
    const task = await post('tasks', { ...VALID_TASK, description: 'Initial description' }).expect(201);
    const taskId = task.body.id as string;

    const edited = await patchTask(taskId, {
      priority: 'CRITICAL',
      progressPercent: 35,
      startDate: '2026-11-01',
      estimatedDate: '2026-11-15',
      dueDate: '2026-11-20',
    }).expect(200);
    expect(edited.body).toMatchObject({
      priority: 'CRITICAL',
      progressPercent: 35,
      dueDate: '2026-11-20T00:00:00.000Z',
    });

    // A new start date is checked against the stored estimated and due dates.
    await patchTask(taskId, { startDate: '2026-12-01' }).expect(400);

    const cleared = await patchTask(taskId, {
      priority: null,
      dueDate: null,
      description: null,
      progressPercent: null,
    }).expect(200);
    expect(cleared.body).toMatchObject({
      priority: null,
      dueDate: null,
      description: null,
      progressPercent: null,
      startDate: '2026-11-01T00:00:00.000Z',
    });

    await patchTask(taskId, { title: null }).expect(400);
    await patchTask(taskId, { acceptanceCriteria: '   ' }).expect(400);
    await patchTask(taskId, { progressPercent: 101 }).expect(400);
  });

  it("keeps a parent task's progress derived from its subtasks (brief §17)", async () => {
    const parent = await post('tasks', VALID_TASK).expect(201);
    const subtask = await post('tasks', {
      ...VALID_TASK,
      title: 'Subtask',
      parentTaskId: parent.body.id,
    }).expect(201);

    await patchTask(parent.body.id, { progressPercent: 50 }).expect(400);
    await patchTask(subtask.body.id, { progressPercent: 70 }).expect(200);

    const detail = await request(app.getHttpServer())
      .get(`/projects/${projectId}/tasks/${parent.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(detail.body.computedProgress).toBe(70);
  });
});
