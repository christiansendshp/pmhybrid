import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { DEMO_EMAIL, DEMO_PASSWORD } from './../prisma/demo-credentials.js';
import { createScratchDocsPath } from './helpers/scratch-docs.js';

/**
 * One sequential run through every brief §33 E2E scenario, in order,
 * against a single project — a single traceable artifact mapping 1:1 onto
 * the brief's own numbered list. The per-module spec files (projects,
 * tasks, synchronization, dashboard, workload) already exercise these
 * paths in more depth and isolation; this file is the "yes, all 14 pass,
 * in the order a real session would hit them" check FASE-12 asks for.
 */
describe('Brief §33 — all 14 E2E scenarios, sequentially', () => {
  let app: INestApplication<App>;
  let ownerToken: string;
  let docsPath: string;
  let projectId: string;
  let humanMemberId: string;
  let agentId: string;
  let parentTaskId: string;
  let subtaskId: string;

  const server = () => app.getHttpServer();
  const owner = () => `Bearer ${ownerToken}`;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    const login = await request(server())
      .post('/auth/login')
      .send({ email: DEMO_EMAIL, password: DEMO_PASSWORD })
      .expect(200);
    ownerToken = login.body.accessToken;
    docsPath = createScratchDocsPath();
  });

  afterAll(async () => {
    await app.close();
  });

  it('1. crear proyecto', async () => {
    const res = await request(server())
      .post('/projects')
      .set('Authorization', owner())
      .send({ name: `Brief Scenarios ${Date.now()}`, docsPath })
      .expect(201);
    projectId = res.body.id;

    const mine = await request(server()).get('/projects').set('Authorization', owner()).expect(200);
    expect(mine.body.some((p: { id: string }) => p.id === projectId)).toBe(true);
  });

  it('2. agregar usuario', async () => {
    const email = `brief-human-${Date.now()}@pmhybrid.local`;
    const user = await request(server())
      .post('/users')
      .set('Authorization', owner())
      .send({ displayName: 'Brief Human', email, password: 'briefhuman123' })
      .expect(201);
    humanMemberId = user.body.id;

    await request(server())
      .post(`/projects/${projectId}/members`)
      .set('Authorization', owner())
      .send({ actorId: humanMemberId })
      .expect(201);

    const members = await request(server())
      .get(`/projects/${projectId}/members`)
      .set('Authorization', owner())
      .expect(200);
    expect(members.body.some((m: { actorId: string }) => m.actorId === humanMemberId)).toBe(true);
  });

  it('3. agregar agente', async () => {
    const agents = await request(server()).get('/agents').set('Authorization', owner()).expect(200);
    agentId = agents.body[0].id;

    await request(server())
      .post(`/projects/${projectId}/members`)
      .set('Authorization', owner())
      .send({ actorId: agentId })
      .expect(201);

    const members = await request(server())
      .get(`/projects/${projectId}/members`)
      .set('Authorization', owner())
      .expect(200);
    const agentMember = members.body.find((m: { actorId: string }) => m.actorId === agentId);
    expect(agentMember.actor.kind).toBe('AI_AGENT');
  });

  it('4. crear tarea', async () => {
    const task = await request(server())
      .post(`/projects/${projectId}/tasks`)
      .set('Authorization', owner())
      .send({ title: 'Parent task for the brief walkthrough' })
      .expect(201);
    parentTaskId = task.body.id;
    expect(task.body.status).toBe('PENDIENTE');
  });

  it('5. asignar tarea', async () => {
    const assigned = await request(server())
      .post(`/projects/${projectId}/tasks/${parentTaskId}/assign`)
      .set('Authorization', owner())
      .send({ actorId: agentId })
      .expect(201);
    expect(assigned.body.status).toBe('ASIGNADA');
    expect(assigned.body.assigneeActorId).toBe(agentId);
  });

  it('6. crear subtarea', async () => {
    const subtask = await request(server())
      .post(`/projects/${projectId}/tasks`)
      .set('Authorization', owner())
      .send({ title: 'Subtask for the brief walkthrough', parentTaskId })
      .expect(201);
    subtaskId = subtask.body.id;

    const parent = await request(server())
      .get(`/projects/${projectId}/tasks/${parentTaskId}`)
      .set('Authorization', owner())
      .expect(200);
    expect(parent.body.subtasks.some((s: { id: string }) => s.id === subtaskId)).toBe(true);
  });

  it('7. cambiar estado', async () => {
    const transitioned = await request(server())
      .post(`/projects/${projectId}/tasks/${parentTaskId}/transition`)
      .set('Authorization', owner())
      .send({ status: 'EN_DESARROLLO' })
      .expect(201);
    expect(transitioned.body.status).toBe('EN_DESARROLLO');
  });

  it('8. cambiar avance', async () => {
    await request(server())
      .patch(`/projects/${projectId}/tasks/${subtaskId}`)
      .set('Authorization', owner())
      .send({ progressPercent: 60 })
      .expect(200);

    const parent = await request(server())
      .get(`/projects/${projectId}/tasks/${parentTaskId}`)
      .set('Authorization', owner())
      .expect(200);
    // The parent's progress is derived from its one subtask (docs/domain-model.md).
    expect(parent.body.computedProgress).toBe(60);
  });

  it('9. intentar reasignar tarea en desarrollo', async () => {
    const email = `brief-dev-${Date.now()}@pmhybrid.local`;
    await request(server())
      .post('/users')
      .set('Authorization', owner())
      .send({ displayName: 'Brief Dev', email, password: 'briefdev12345' })
      .expect(201);
    const login = await request(server())
      .post('/auth/login')
      .send({ email, password: 'briefdev12345' })
      .expect(200);
    const devToken = login.body.accessToken;
    const devUsers = await request(server()).get('/users').set('Authorization', owner()).expect(200);
    const devId = devUsers.body.find((u: { email: string }) => u.email === email).id;

    await request(server())
      .post(`/projects/${projectId}/members`)
      .set('Authorization', owner())
      .send({ actorId: devId })
      .expect(201);
    const roles = await request(server()).get('/roles').set('Authorization', owner()).expect(200);
    const developerRole = roles.body.find((r: { name: string }) => r.name === 'DEVELOPER');
    await request(server())
      .post(`/projects/${projectId}/roles`)
      .set('Authorization', owner())
      .send({ actorId: devId, roleId: developerRole.id })
      .expect(201);

    // DEVELOPER lacks task.reassign.locked -> denied while EN_DESARROLLO.
    await request(server())
      .post(`/projects/${projectId}/tasks/${parentTaskId}/assign`)
      .set('Authorization', `Bearer ${devToken}`)
      .send({ actorId: devId })
      .expect(403);

    // OWNER holds it -> allowed.
    const reassigned = await request(server())
      .post(`/projects/${projectId}/tasks/${parentTaskId}/assign`)
      .set('Authorization', owner())
      .send({ actorId: devId })
      .expect(201);
    expect(reassigned.body.status).toBe('EN_DESARROLLO');
  });

  it('10. sincronizar ROADMAP', async () => {
    const syncRun = await request(server())
      .post(`/projects/${projectId}/sync`)
      .set('Authorization', owner())
      .expect(201);
    expect(syncRun.body.status).toBe('SUCCESS');

    // Write-back already put the parent task's row into the Active table
    // (its externalId was minted on the earlier transition) — a sync must
    // read it back without creating a duplicate Task.
    const roadmap = readFileSync(path.join(docsPath, 'Roadmap.md'), 'utf-8');
    expect(roadmap).toContain('Parent task for the brief walkthrough');
  });

  it('11. detectar cambio externo', async () => {
    // An external hand (not the app) marks the row TERMINADA and edits the
    // acceptance check — simulating a human/agent editing Roadmap.md
    // directly via the skill, with no competing UI edit since the last
    // sync (that contested case — CONCURRENT_FIELD_EDIT — is covered by
    // synchronization.e2e-spec.ts). An uncontested external change should
    // be detected and applied, not ignored.
    const before = readFileSync(path.join(docsPath, 'Roadmap.md'), 'utf-8');
    const externallyEdited = before.replace(
      /\| Parent task for the brief walkthrough \|[^|]*\|[^|]*\|/,
      '| Parent task for the brief walkthrough | edited externally | TERMINADA |',
    );
    expect(externallyEdited).not.toBe(before);
    writeFileSync(path.join(docsPath, 'Roadmap.md'), externallyEdited, 'utf-8');

    const syncRun = await request(server())
      .post(`/projects/${projectId}/sync`)
      .set('Authorization', owner())
      .expect(201);
    expect(syncRun.body.status).toBe('SUCCESS');
    expect(syncRun.body.summary.tasksUpdated).toBeGreaterThanOrEqual(1);

    const parent = await request(server())
      .get(`/projects/${projectId}/tasks/${parentTaskId}`)
      .set('Authorization', owner())
      .expect(200);
    expect(parent.body.status).toBe('TERMINADA');
    expect(parent.body.acceptanceCriteria).toBe('edited externally');
  });

  it('12. visualizar Kanban', async () => {
    const tasks = await request(server())
      .get(`/projects/${projectId}/tasks`)
      .set('Authorization', owner())
      .expect(200);
    expect(tasks.body.length).toBeGreaterThanOrEqual(2); // parent + subtask
    for (const task of tasks.body) {
      expect(task).toHaveProperty('id');
      expect(task).toHaveProperty('title');
      expect(['PENDIENTE', 'ASIGNADA', 'EN_DESARROLLO', 'QA', 'TERMINADA']).toContain(task.status);
    }
  });

  it('13. visualizar avance', async () => {
    const progress = await request(server())
      .get(`/projects/${projectId}/progress`)
      .set('Authorization', owner())
      .expect(200);
    expect(progress.body).toHaveProperty('project');
    expect(Array.isArray(progress.body.tasks)).toBe(true);
    const parentNode = progress.body.tasks.find((t: { id: string }) => t.id === parentTaskId);
    expect(parentNode).toBeDefined();
    expect(parentNode.progress).toBe(60); // still driven by the one subtask
  });

  it('14. visualizar workload', async () => {
    const workload = await request(server())
      .get(`/workload?projectId=${projectId}`)
      .set('Authorization', owner())
      .expect(200);
    const row = workload.body.find((r: { task: { id: string } }) => r.task.id === parentTaskId);
    expect(row).toBeDefined();
    // TERMINADA per scenario 11's external change — workload still lists
    // it, since status is a filter here, not an always-applied one.
    expect(row.status).toBe('TERMINADA');
    expect(typeof row.progress).toBe('number');
  });
});
