import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { DEMO_EMAIL, DEMO_PASSWORD } from './../prisma/demo-credentials.js';
import { createScratchDocsPath } from './helpers/scratch-docs.js';

function roadmap(...rows: string[]): string {
  return [
    '# Roadmap',
    '',
    '## Active work',
    '',
    '| ID | Outcome | Acceptance check | Status | Owner | Depends on |',
    '| --- | --- | --- | --- | --- | --- |',
    ...(rows.length > 0 ? rows : ['| — | — | — | — | — | — |']),
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
}

const row = (id: string, status: string) =>
  `| ${id} | Work ${id} | check | ${status} | — | — |`;

/**
 * The brief's task completion date, and the project setting that decides how
 * progress rolls up (Roadmap GAP-36d).
 */
describe('Task completion date and the LEAF_EQUAL_WEIGHT rollup (e2e, Roadmap GAP-36d)', () => {
  let app: INestApplication<App>;
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

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: DEMO_EMAIL, password: DEMO_PASSWORD })
      .expect(200);
    ownerToken = login.body.accessToken;
    const me = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    ownerId = me.body.id;
  });

  afterEach(async () => {
    await app.close();
  });

  const server = () => app.getHttpServer();
  const auth = () => `Bearer ${ownerToken}`;
  const unique = (label: string) =>
    `${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

  async function createProject(docsPath = createScratchDocsPath()) {
    const res = await request(server())
      .post('/projects')
      .set('Authorization', auth())
      .send({ name: unique('Completion E2E'), docsPath })
      .expect(201);
    return res.body.id as string;
  }

  async function createTask(
    projectId: string,
    title: string,
    parentTaskId?: string,
  ) {
    const res = await request(server())
      .post(`/projects/${projectId}/tasks`)
      .set('Authorization', auth())
      .send({ title, acceptanceCriteria: 'Verified', parentTaskId })
      .expect(201);
    return res.body.id as string;
  }

  const transition = (projectId: string, taskId: string, status: string) =>
    request(server())
      .post(`/projects/${projectId}/tasks/${taskId}/transition`)
      .set('Authorization', auth())
      .send({ status })
      .expect(201);

  async function finish(projectId: string, taskId: string) {
    await request(server())
      .post(`/projects/${projectId}/tasks/${taskId}/assign`)
      .set('Authorization', auth())
      .send({ actorId: ownerId })
      .expect(201);
    for (const status of ['EN_DESARROLLO', 'QA', 'TERMINADA']) {
      await transition(projectId, taskId, status);
    }
  }

  async function taskById(projectId: string, taskId: string) {
    const res = await request(server())
      .get(`/projects/${projectId}/tasks/${taskId}`)
      .set('Authorization', auth())
      .expect(200);
    return res.body as { status: string; completedAt: string | null };
  }

  async function taskByExternalId(projectId: string, externalId: string) {
    const list = await request(server())
      .get(`/projects/${projectId}/tasks`)
      .set('Authorization', auth())
      .expect(200);
    return list.body.find(
      (t: { externalId: string }) => t.externalId === externalId,
    ) as { status: string; completedAt: string | null };
  }

  const sync = (projectId: string) =>
    request(server())
      .post(`/projects/${projectId}/sync`)
      .set('Authorization', auth())
      .expect(201);

  describe('the completion date', () => {
    it('is set when a task is finished, cleared when it is reopened, and set again when it is finished again', async () => {
      const projectId = await createProject();
      const taskId = await createTask(projectId, 'Ships');
      expect((await taskById(projectId, taskId)).completedAt).toBeNull();

      await request(server())
        .post(`/projects/${projectId}/tasks/${taskId}/assign`)
        .set('Authorization', auth())
        .send({ actorId: ownerId })
        .expect(201);
      await transition(projectId, taskId, 'EN_DESARROLLO');
      await transition(projectId, taskId, 'QA');
      // Every step before the last leaves it empty.
      expect((await taskById(projectId, taskId)).completedAt).toBeNull();

      const before = Date.now();
      await transition(projectId, taskId, 'TERMINADA');
      const done = await taskById(projectId, taskId);
      expect(done.completedAt).not.toBeNull();
      expect(Date.parse(done.completedAt!)).toBeGreaterThanOrEqual(
        before - 1000,
      );

      await transition(projectId, taskId, 'QA');
      expect(await taskById(projectId, taskId)).toMatchObject({
        status: 'QA',
        completedAt: null,
      });

      await transition(projectId, taskId, 'TERMINADA');
      const again = await taskById(projectId, taskId);
      expect(Date.parse(again.completedAt!)).toBeGreaterThanOrEqual(
        Date.parse(done.completedAt!),
      );
    });

    it('is set when the Roadmap says a task is done, whether the row is new or changed, and cleared when it is reopened there', async () => {
      const docsPath = createScratchDocsPath();
      const file = path.join(docsPath, 'Roadmap.md');
      writeFileSync(
        file,
        roadmap(row('CD-1', 'DONE'), row('CD-2', 'TODO')),
        'utf-8',
      );
      const projectId = await createProject(docsPath);
      await sync(projectId);

      // A row first seen already done.
      expect(await taskByExternalId(projectId, 'CD-1')).toMatchObject({
        status: 'TERMINADA',
        completedAt: expect.any(String),
      });
      expect(
        (await taskByExternalId(projectId, 'CD-2')).completedAt,
      ).toBeNull();

      writeFileSync(
        file,
        roadmap(row('CD-1', 'TODO'), row('CD-2', 'DONE')),
        'utf-8',
      );
      await sync(projectId);

      expect(await taskByExternalId(projectId, 'CD-1')).toMatchObject({
        status: 'PENDIENTE',
        completedAt: null,
      });
      expect(await taskByExternalId(projectId, 'CD-2')).toMatchObject({
        status: 'TERMINADA',
        completedAt: expect.any(String),
      });
    });

    it('is set when a row is completed by leaving the Roadmap with a DONE log entry', async () => {
      const docsPath = createScratchDocsPath();
      const file = path.join(docsPath, 'Roadmap.md');
      writeFileSync(file, roadmap(row('CD-3', 'IN_PROGRESS')), 'utf-8');
      const projectId = await createProject(docsPath);
      await sync(projectId);
      expect(
        (await taskByExternalId(projectId, 'CD-3')).completedAt,
      ).toBeNull();

      writeFileSync(file, roadmap(), 'utf-8');
      writeFileSync(
        path.join(docsPath, 'Agentslog.md'),
        `# Agents log

## Entries

## [2026-01-01T00:00:00Z] | tester | CD-3 | DONE

- Summary: s
- Files: f
- Verify: v
- Follow-up: n
`,
        'utf-8',
      );
      const run = await sync(projectId);

      expect(run.body.summary.completedViaRemoval).toBe(1);
      expect(await taskByExternalId(projectId, 'CD-3')).toMatchObject({
        status: 'TERMINADA',
        completedAt: expect.any(String),
      });
    });

    it('is set when a conflict is resolved by finishing the task', async () => {
      const docsPath = createScratchDocsPath();
      const file = path.join(docsPath, 'Roadmap.md');
      writeFileSync(file, roadmap(row('CD-4', 'IN_PROGRESS')), 'utf-8');
      const projectId = await createProject(docsPath);
      await sync(projectId);
      // The row goes, with no log entry to say why: a question for a person.
      writeFileSync(file, roadmap(), 'utf-8');
      await sync(projectId);
      const open = await request(server())
        .get(`/projects/${projectId}/conflicts?resolved=false`)
        .set('Authorization', auth())
        .expect(200);
      expect(open.body).toHaveLength(1);

      await request(server())
        .post(`/projects/${projectId}/conflicts/${open.body[0].id}/resolve`)
        .set('Authorization', auth())
        .send({ strategy: 'KEEP_EXTERNAL' })
        .expect(201);

      expect(await taskByExternalId(projectId, 'CD-4')).toMatchObject({
        status: 'TERMINADA',
        completedAt: expect.any(String),
      });
    });
  });

  describe('the LEAF_EQUAL_WEIGHT rollup', () => {
    async function progressOf(projectId: string) {
      const res = await request(server())
        .get(`/projects/${projectId}/progress`)
        .set('Authorization', auth())
        .expect(200);
      return res.body.project as number;
    }

    async function setStrategy(projectId: string, strategy: string) {
      await request(server())
        .patch(`/projects/${projectId}`)
        .set('Authorization', auth())
        .send({ progressRollupStrategy: strategy })
        .expect(200);
    }

    it('counts every leaf once, so a task split in two weighs two, and the setting can be changed back', async () => {
      const projectId = await createProject();
      // A: two subtasks, one done. B and C: unsplit, both done.
      const a = await createTask(projectId, 'A');
      const a1 = await createTask(projectId, 'A1', a);
      await createTask(projectId, 'A2', a);
      const b = await createTask(projectId, 'B');
      const c = await createTask(projectId, 'C');
      for (const id of [a1, b, c]) {
        await finish(projectId, id);
      }

      // Average of averages: (50 + 100 + 100) / 3.
      expect(await progressOf(projectId)).toBeCloseTo(83.33, 1);

      await setStrategy(projectId, 'LEAF_EQUAL_WEIGHT');
      // Four leaves, three of them done.
      expect(await progressOf(projectId)).toBe(75);

      await setStrategy(projectId, 'EQUAL_WEIGHT_AVERAGE');
      expect(await progressOf(projectId)).toBeCloseTo(83.33, 1);
    });
  });
});
