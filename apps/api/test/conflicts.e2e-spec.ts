import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { DEMO_EMAIL, DEMO_PASSWORD } from './../prisma/demo-credentials.js';
import { assignProjectRole } from './helpers/roles.js';
import { createScratchDocsPath } from './helpers/scratch-docs.js';

const ACTIVE_HEADER = `| ID | Outcome | Acceptance check | Status | Owner | Depends on |
| --- | --- | --- | --- | --- | --- |`;

function roadmapWithActiveRow(row: string): string {
  return `# Roadmap

## Active work

${ACTIVE_HEADER}
${row}

## Near term

| ID | Outcome | Acceptance check | Status | Depends on |
| --- | --- | --- | --- | --- |
| — | — | — | — | — |

## Blocked

| ID | Blocker | Needed decision or event | Owner |
| --- | --- | --- | --- |
| — | — | — | — |
`;
}

describe('Conflicts (resolve — e2e, brief §26)', () => {
  let app: INestApplication<App>;
  let ownerToken: string;

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
    ownerToken = login.body.accessToken;
  });

  afterEach(async () => {
    await app.close();
  });

  const server = () => app.getHttpServer();
  const auth = () => `Bearer ${ownerToken}`;

  async function createProjectAt(docsPath: string) {
    const res = await request(server())
      .post('/projects')
      .set('Authorization', auth())
      .send({ name: `Conflicts E2E ${Date.now()}-${Math.random()}`, docsPath })
      .expect(201);
    return res.body.id as string;
  }

  /**
   * A CONCURRENT_FIELD_EDIT conflict that contests only `status`: assigning
   * the task (UI) moves it to ASIGNADA, and the document independently moves
   * the same row to IN_PROGRESS before a sync sees the assignment.
   */
  async function concurrentStatusConflict() {
    const docsPath = createScratchDocsPath();
    writeFileSync(
      path.join(docsPath, 'Roadmap.md'),
      roadmapWithActiveRow('| PMH-1 | Title | check | TODO | — | — |'),
      'utf-8',
    );
    const projectId = await createProjectAt(docsPath);
    await request(server()).post(`/projects/${projectId}/sync`).set('Authorization', auth()).expect(201);

    const tasks = await request(server())
      .get(`/projects/${projectId}/tasks`)
      .set('Authorization', auth())
      .expect(200);
    const task = tasks.body.find((t: { externalId: string }) => t.externalId === 'PMH-1');

    const agents = await request(server()).get('/agents').set('Authorization', auth()).expect(200);
    const agentId = agents.body[0].id;
    await request(server())
      .post(`/projects/${projectId}/members`)
      .set('Authorization', auth())
      .send({ actorId: agentId })
      .expect(201);
    await request(server())
      .post(`/projects/${projectId}/tasks/${task.id}/assign`)
      .set('Authorization', auth())
      .send({ actorId: agentId })
      .expect(201);

    writeFileSync(
      path.join(docsPath, 'Roadmap.md'),
      roadmapWithActiveRow('| PMH-1 | Title | check | IN_PROGRESS | — | — |'),
      'utf-8',
    );
    const syncRun = await request(server())
      .post(`/projects/${projectId}/sync`)
      .set('Authorization', auth())
      .expect(201);
    expect(syncRun.body.summary.conflictsRaised).toBe(1);

    const conflicts = await request(server())
      .get(`/projects/${projectId}/conflicts`)
      .set('Authorization', auth())
      .expect(200);
    const conflict = conflicts.body.find((c: { kind: string }) => c.kind === 'CONCURRENT_FIELD_EDIT');
    return { projectId, taskId: task.id as string, conflictId: conflict.id as string };
  }

  it('lists a conflict while open and excludes it once resolved (?resolved filter)', async () => {
    const { projectId, conflictId } = await concurrentStatusConflict();

    const open = await request(server())
      .get(`/projects/${projectId}/conflicts?resolved=false`)
      .set('Authorization', auth())
      .expect(200);
    expect(open.body.some((c: { id: string }) => c.id === conflictId)).toBe(true);

    await request(server())
      .post(`/projects/${projectId}/conflicts/${conflictId}/resolve`)
      .set('Authorization', auth())
      .send({ strategy: 'DISMISSED' })
      .expect(201);

    const stillOpen = await request(server())
      .get(`/projects/${projectId}/conflicts?resolved=false`)
      .set('Authorization', auth())
      .expect(200);
    expect(stillOpen.body.some((c: { id: string }) => c.id === conflictId)).toBe(false);

    const resolved = await request(server())
      .get(`/projects/${projectId}/conflicts?resolved=true`)
      .set('Authorization', auth())
      .expect(200);
    expect(resolved.body.some((c: { id: string }) => c.id === conflictId)).toBe(true);
  });

  it('KEEP_LOCAL leaves the task exactly as it stood', async () => {
    const { projectId, taskId, conflictId } = await concurrentStatusConflict();

    await request(server())
      .post(`/projects/${projectId}/conflicts/${conflictId}/resolve`)
      .set('Authorization', auth())
      .send({ strategy: 'KEEP_LOCAL' })
      .expect(201);

    const task = await request(server())
      .get(`/projects/${projectId}/tasks/${taskId}`)
      .set('Authorization', auth())
      .expect(200);
    expect(task.body.status).toBe('ASIGNADA');
  });

  it('KEEP_EXTERNAL applies the document side of the contested field', async () => {
    const { projectId, taskId, conflictId } = await concurrentStatusConflict();

    await request(server())
      .post(`/projects/${projectId}/conflicts/${conflictId}/resolve`)
      .set('Authorization', auth())
      .send({ strategy: 'KEEP_EXTERNAL' })
      .expect(201);

    const task = await request(server())
      .get(`/projects/${projectId}/tasks/${taskId}`)
      .set('Authorization', auth())
      .expect(200);
    expect(task.body.status).toBe('EN_DESARROLLO');
  });

  it('MANUAL_EDIT applies a valid value for the contested field', async () => {
    const { projectId, taskId, conflictId } = await concurrentStatusConflict();

    await request(server())
      .post(`/projects/${projectId}/conflicts/${conflictId}/resolve`)
      .set('Authorization', auth())
      .send({ strategy: 'MANUAL_EDIT', manualValue: { status: 'QA' } })
      .expect(201);

    const task = await request(server())
      .get(`/projects/${projectId}/tasks/${taskId}`)
      .set('Authorization', auth())
      .expect(200);
    expect(task.body.status).toBe('QA');
  });

  it('MANUAL_EDIT is rejected as 400 (not a 500) for a field the conflict never contested', async () => {
    const { projectId, conflictId } = await concurrentStatusConflict();

    await request(server())
      .post(`/projects/${projectId}/conflicts/${conflictId}/resolve`)
      .set('Authorization', auth())
      .send({ strategy: 'MANUAL_EDIT', manualValue: { title: 'Hijacked title' } })
      .expect(400);
  });

  it('MANUAL_EDIT rejects an invalid value for a contested field', async () => {
    const { projectId, conflictId } = await concurrentStatusConflict();

    await request(server())
      .post(`/projects/${projectId}/conflicts/${conflictId}/resolve`)
      .set('Authorization', auth())
      .send({ strategy: 'MANUAL_EDIT', manualValue: { status: 'NOT_A_STATUS' } })
      .expect(400);
  });

  it('rejects resolving an already-resolved conflict', async () => {
    const { projectId, conflictId } = await concurrentStatusConflict();

    await request(server())
      .post(`/projects/${projectId}/conflicts/${conflictId}/resolve`)
      .set('Authorization', auth())
      .send({ strategy: 'DISMISSED' })
      .expect(201);

    await request(server())
      .post(`/projects/${projectId}/conflicts/${conflictId}/resolve`)
      .set('Authorization', auth())
      .send({ strategy: 'DISMISSED' })
      .expect(400);
  });

  it('restricts MANUAL_EDIT on a disappeared-row conflict to its own contested fields — externalId is shown but never editable', async () => {
    const docsPath = createScratchDocsPath();
    writeFileSync(
      path.join(docsPath, 'Roadmap.md'),
      roadmapWithActiveRow('| PMH-2 | Vanishes silently | check | TODO | — | — |'),
      'utf-8',
    );
    const projectId = await createProjectAt(docsPath);
    await request(server()).post(`/projects/${projectId}/sync`).set('Authorization', auth()).expect(201);
    writeFileSync(path.join(docsPath, 'Roadmap.md'), roadmapWithActiveRow('| — | — | — | — | — | — |'), 'utf-8');
    await request(server()).post(`/projects/${projectId}/sync`).set('Authorization', auth()).expect(201);

    const conflicts = await request(server())
      .get(`/projects/${projectId}/conflicts`)
      .set('Authorization', auth())
      .expect(200);
    const conflict = conflicts.body.find(
      (c: { kind: string }) => c.kind === 'ROADMAP_ROW_DISAPPEARED_NO_TERMINAL_LOG',
    );
    expect(conflict.localVersion.externalId).toBe('PMH-2');

    // externalId is in localVersion (shown for context) but has no
    // validator — must still be rejected, never silently written.
    await request(server())
      .post(`/projects/${projectId}/conflicts/${conflict.id}/resolve`)
      .set('Authorization', auth())
      .send({ strategy: 'MANUAL_EDIT', manualValue: { externalId: 'PMH-999' } })
      .expect(400);

    // status and roadmapTable are contested here and have validators.
    await request(server())
      .post(`/projects/${projectId}/conflicts/${conflict.id}/resolve`)
      .set('Authorization', auth())
      .send({ strategy: 'MANUAL_EDIT', manualValue: { status: 'TERMINADA', roadmapTable: null } })
      .expect(201);

    const task = await request(server())
      .get(`/projects/${projectId}/tasks/${conflict.entityId}`)
      .set('Authorization', auth())
      .expect(200);
    expect(task.body).toMatchObject({ status: 'TERMINADA', roadmapTable: null });
  });

  describe('who may resolve, and what a resolution may apply (Roadmap SECURITY-02)', () => {
    async function memberToken(projectId: string, roleName?: string) {
      const email = `conflict-member-${Date.now()}-${Math.random().toString(36).slice(2)}@pmhybrid.local`;
      const created = await request(server())
        .post('/users')
        .set('Authorization', auth())
        .send({ displayName: 'Conflict member', email, password: 'member1234' })
        .expect(201);
      await request(server())
        .post(`/projects/${projectId}/members`)
        .set('Authorization', auth())
        .send({ actorId: created.body.id })
        .expect(201);
      if (roleName) {
        await assignProjectRole(server(), auth(), projectId, created.body.id, roleName);
      }
      const login = await request(server())
        .post('/auth/login')
        .send({ email, password: 'member1234' })
        .expect(200);
      return `Bearer ${login.body.accessToken}`;
    }

    it('refuses a member without conflict.resolve, whether they hold no role or only DEVELOPER', async () => {
      const { projectId, conflictId } = await concurrentStatusConflict();
      const roleless = await memberToken(projectId);
      const developer = await memberToken(projectId, 'DEVELOPER');

      for (const token of [roleless, developer]) {
        const denied = await request(server())
          .post(`/projects/${projectId}/conflicts/${conflictId}/resolve`)
          .set('Authorization', token)
          .send({ strategy: 'KEEP_EXTERNAL' })
          .expect(403);
        expect(denied.body.message).toContain('conflict.resolve');
      }

      const stillOpen = await request(server())
        .get(`/projects/${projectId}/conflicts?resolved=false`)
        .set('Authorization', auth())
        .expect(200);
      expect(stillOpen.body.some((c: { id: string }) => c.id === conflictId)).toBe(true);
    });

    it('lets a PROJECT_MANAGER resolve and audits the status it applied as a STATUS_CHANGE', async () => {
      const { projectId, taskId, conflictId } = await concurrentStatusConflict();
      const manager = await memberToken(projectId, 'PROJECT_MANAGER');

      await request(server())
        .post(`/projects/${projectId}/conflicts/${conflictId}/resolve`)
        .set('Authorization', manager)
        .send({ strategy: 'KEEP_EXTERNAL' })
        .expect(201);

      const audit = await request(server())
        .get(`/projects/${projectId}/audit?entityType=Task&operation=STATUS_CHANGE`)
        .set('Authorization', auth())
        .expect(200);
      const change = audit.body.find(
        (event: { entityId: string; newValue?: { status?: string } }) =>
          event.entityId === taskId && event.newValue?.status === 'EN_DESARROLLO',
      );
      expect(change).toBeDefined();
      expect(change.previousValue).toMatchObject({ status: 'ASIGNADA' });
    });
  });
});
