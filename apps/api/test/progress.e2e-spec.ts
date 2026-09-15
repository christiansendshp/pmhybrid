import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { DEMO_EMAIL, DEMO_PASSWORD } from './../prisma/demo-credentials.js';
import { createScratchDocsPath } from './helpers/scratch-docs.js';

/**
 * GAP-08 (brief §16): the Progress tree's per-node `statusCounts` and its
 * nested `subtasks`. Progress-percentage rollup math itself is covered by
 * F05 (`tasks.e2e-spec.ts`) and brief-scenarios.e2e-spec.ts #13 — this file
 * is about the two things GAP-08 added on top of the existing tree shape.
 */
describe('Progress tree — status counts and subtask nesting (e2e)', () => {
  let app: INestApplication<App>;
  let ownerToken: string;
  let projectId: string;
  let developerActorId: string;

  // Task ids, named for the fixture tree built in beforeEach:
  //   Phase P1
  //     Epic E1
  //       Task A (TERMINADA)
  //         Subtask A1 (EN_DESARROLLO)
  //           Subtask A1a (PENDIENTE)   <- two levels deep
  //     Task B, phase-direct (ASIGNADA)
  //   Epic E2, orphan (no phase)
  //     Task C (QA)
  //   Task D, orphan (PENDIENTE)
  let phaseId: string;
  let epic1Id: string;
  let epic2Id: string;
  let taskAId: string;
  let taskA1Id: string;
  let taskA1aId: string;
  let taskBId: string;
  let taskCId: string;
  let taskDId: string;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    const server = app.getHttpServer();
    const login = await request(server)
      .post('/auth/login')
      .send({ email: DEMO_EMAIL, password: DEMO_PASSWORD })
      .expect(200);
    ownerToken = login.body.accessToken;
    const auth = `Bearer ${ownerToken}`;

    const project = await request(server)
      .post('/projects')
      .set('Authorization', auth)
      .send({ name: `Progress E2E ${Date.now()}-${Math.random()}`, docsPath: createScratchDocsPath() })
      .expect(201);
    projectId = project.body.id;

    const developer = await request(server)
      .post('/users')
      .set('Authorization', auth)
      .send({
        displayName: 'Progress Dev',
        email: `progress-dev-${Date.now()}@pmhybrid.local`,
        password: 'developer123',
      })
      .expect(201);
    developerActorId = developer.body.id;
    await request(server)
      .post(`/projects/${projectId}/members`)
      .set('Authorization', auth)
      .send({ actorId: developerActorId })
      .expect(201);

    const phase = await request(server)
      .post(`/projects/${projectId}/phases`)
      .set('Authorization', auth)
      .send({ name: 'P1', order: 1 })
      .expect(201);
    phaseId = phase.body.id;

    const epic1 = await request(server)
      .post(`/projects/${projectId}/epics`)
      .set('Authorization', auth)
      .send({ name: 'E1', order: 1, phaseId })
      .expect(201);
    epic1Id = epic1.body.id;

    const epic2 = await request(server)
      .post(`/projects/${projectId}/epics`)
      .set('Authorization', auth)
      .send({ name: 'E2', order: 1 })
      .expect(201);
    epic2Id = epic2.body.id;

    async function createTask(input: Record<string, unknown>): Promise<string> {
      const res = await request(server)
        .post(`/projects/${projectId}/tasks`)
        .set('Authorization', auth)
        .send({ title: 'task', acceptanceCriteria: 'check', ...input })
        .expect(201);
      return res.body.id as string;
    }

    async function driveToStatus(taskId: string, status: string): Promise<void> {
      if (status === 'PENDIENTE') {
        return;
      }
      await request(server)
        .post(`/projects/${projectId}/tasks/${taskId}/assign`)
        .set('Authorization', auth)
        .send({ actorId: developerActorId })
        .expect(201);
      for (const next of ['EN_DESARROLLO', 'QA', 'TERMINADA']) {
        if (status === 'ASIGNADA') {
          return;
        }
        await request(server)
          .post(`/projects/${projectId}/tasks/${taskId}/transition`)
          .set('Authorization', auth)
          .send({ status: next })
          .expect(201);
        if (status === next) {
          return;
        }
      }
    }

    taskAId = await createTask({ title: 'Task A', epicId: epic1Id });
    await driveToStatus(taskAId, 'TERMINADA');
    taskA1Id = await createTask({ title: 'Task A1', parentTaskId: taskAId });
    await driveToStatus(taskA1Id, 'EN_DESARROLLO');
    taskA1aId = await createTask({ title: 'Task A1a', parentTaskId: taskA1Id });
    // PENDIENTE: leave as created.

    taskBId = await createTask({ title: 'Task B', phaseId });
    await driveToStatus(taskBId, 'ASIGNADA');

    taskCId = await createTask({ title: 'Task C', epicId: epic2Id });
    await driveToStatus(taskCId, 'QA');

    taskDId = await createTask({ title: 'Task D' });
    // PENDIENTE: leave as created.
  });

  afterEach(async () => {
    await app.close();
  });

  const server = () => app.getHttpServer();
  const auth = () => `Bearer ${ownerToken}`;

  function statusCountsOf(node: { statusCounts: Record<string, number> }) {
    return node.statusCounts;
  }

  it('nests subtasks arbitrarily deep in a task node, instead of stopping at top-level tasks', async () => {
    const res = await request(server())
      .get(`/projects/${projectId}/progress`)
      .set('Authorization', auth())
      .expect(200);

    const phaseNode = res.body.phases.find((p: { id: string }) => p.id === phaseId);
    const epic1Node = phaseNode.epics.find((e: { id: string }) => e.id === epic1Id);
    const taskANode = epic1Node.tasks.find((t: { id: string }) => t.id === taskAId);

    expect(taskANode.status).toBe('TERMINADA');
    expect(taskANode.subtasks).toHaveLength(1);
    const a1Node = taskANode.subtasks[0];
    expect(a1Node.id).toBe(taskA1Id);
    expect(a1Node.status).toBe('EN_DESARROLLO');
    expect(a1Node.subtasks).toHaveLength(1);
    expect(a1Node.subtasks[0]).toMatchObject({ id: taskA1aId, status: 'PENDIENTE', subtasks: [] });
  });

  it("sums an epic's statusCounts from its top-level tasks' full subtrees", async () => {
    const res = await request(server())
      .get(`/projects/${projectId}/progress`)
      .set('Authorization', auth())
      .expect(200);

    const phaseNode = res.body.phases.find((p: { id: string }) => p.id === phaseId);
    const epic1Node = phaseNode.epics.find((e: { id: string }) => e.id === epic1Id);
    // E1 has one top-level task (A), whose subtree is A + A1 + A1a.
    expect(statusCountsOf(epic1Node)).toEqual({
      PENDIENTE: 1,
      ASIGNADA: 0,
      EN_DESARROLLO: 1,
      QA: 0,
      TERMINADA: 1,
    });

    const epic2Node = res.body.epics.find((e: { id: string }) => e.id === epic2Id);
    expect(statusCountsOf(epic2Node)).toEqual({
      PENDIENTE: 0,
      ASIGNADA: 0,
      EN_DESARROLLO: 0,
      QA: 1,
      TERMINADA: 0,
    });
  });

  it("sums a phase's statusCounts from its epics and its own direct tasks", async () => {
    const res = await request(server())
      .get(`/projects/${projectId}/progress`)
      .set('Authorization', auth())
      .expect(200);

    const phaseNode = res.body.phases.find((p: { id: string }) => p.id === phaseId);
    // Epic E1's subtree (1 PENDIENTE, 1 EN_DESARROLLO, 1 TERMINADA) plus
    // phase-direct Task B (ASIGNADA).
    expect(statusCountsOf(phaseNode)).toEqual({
      PENDIENTE: 1,
      ASIGNADA: 1,
      EN_DESARROLLO: 1,
      QA: 0,
      TERMINADA: 1,
    });
  });

  it('sums the whole project statusCounts from every phase, orphan epic and orphan task', async () => {
    const res = await request(server())
      .get(`/projects/${projectId}/progress`)
      .set('Authorization', auth())
      .expect(200);

    // Phase P1 (1 PENDIENTE, 1 ASIGNADA, 1 EN_DESARROLLO, 1 TERMINADA)
    // + orphan Epic E2 (1 QA) + orphan Task D (1 PENDIENTE).
    expect(res.body.statusCounts).toEqual({
      PENDIENTE: 2,
      ASIGNADA: 1,
      EN_DESARROLLO: 1,
      QA: 1,
      TERMINADA: 1,
    });

    const orphanTaskNode = res.body.tasks.find((t: { id: string }) => t.id === taskDId);
    expect(orphanTaskNode).toMatchObject({ status: 'PENDIENTE', subtasks: [] });
  });
});
