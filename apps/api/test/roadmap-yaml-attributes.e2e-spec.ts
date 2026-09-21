import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { DEMO_EMAIL, DEMO_PASSWORD } from './../prisma/demo-credentials.js';
import { createScratchDocsPath } from './helpers/scratch-docs.js';

function entry(
  id: string,
  type: string,
  lines: string[] = [],
  status = 'READY',
): string {
  return [
    `### ${id} — Entry`,
    '',
    '```yaml',
    `id: ${id}`,
    `type: ${type}`,
    `title: Title of ${id}`,
    `status: ${status}`,
    ...lines,
    '```',
    '',
  ].join('\n');
}

function roadmap(...entries: string[]): string {
  return ['# Roadmap', '', '## Plan', '', ...entries].join('\n');
}

/**
 * A YAML entry's type, priority and progress used to be dropped on the way in
 * (so PHASE, EPIC and DECISION entries counted as work and the global progress
 * was wrong), and a change of priority or progress in PM Hub never reached the
 * document (Roadmap GAP-35c).
 */
describe('Entry type, priority and progress (e2e, Roadmap GAP-35c)', () => {
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
    `${label} ${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

  async function createProject(docsPath: string) {
    const res = await request(server())
      .post('/projects')
      .set('Authorization', auth())
      .send({ name: unique('Attributes E2E'), docsPath })
      .expect(201);
    return res.body.id as string;
  }

  const sync = (projectId: string) =>
    request(server())
      .post(`/projects/${projectId}/sync`)
      .set('Authorization', auth())
      .expect(201);

  interface TaskView {
    id: string;
    entryType: string | null;
    priority: string | null;
    progressPercent: number | null;
  }

  async function taskOf(projectId: string, externalId: string) {
    const list = await request(server())
      .get(`/projects/${projectId}/tasks`)
      .set('Authorization', auth())
      .expect(200);
    return list.body.find(
      (t: { externalId: string }) => t.externalId === externalId,
    ) as TaskView;
  }

  const patch = (projectId: string, taskId: string, body: object) =>
    request(server())
      .patch(`/projects/${projectId}/tasks/${taskId}`)
      .set('Authorization', auth())
      .send(body);

  async function progressOf(projectId: string) {
    const res = await request(server())
      .get(`/projects/${projectId}/progress`)
      .set('Authorization', auth())
      .expect(200);
    return res.body.project as number | null;
  }

  describe('reading', () => {
    it('keeps the type, and reads priority (P0-P3 or a word) and progress', async () => {
      const docsPath = createScratchDocsPath();
      writeFileSync(
        path.join(docsPath, 'Roadmap.md'),
        roadmap(
          entry('AT-1', 'TASK', ['priority: P1', 'progress: 40']),
          entry('AT-2', 'GAP', ['priority: low']),
          entry('AT-3', 'BUG', ['priority: P9', 'progress: 140']),
        ),
        'utf-8',
      );
      const projectId = await createProject(docsPath);

      await sync(projectId);

      expect(await taskOf(projectId, 'AT-1')).toMatchObject({
        entryType: 'TASK',
        priority: 'HIGH',
        progressPercent: 40,
      });
      expect(await taskOf(projectId, 'AT-2')).toMatchObject({
        entryType: 'GAP',
        priority: 'LOW',
        progressPercent: null,
      });
      // Values the app has no place for are left out, not guessed at.
      expect(await taskOf(projectId, 'AT-3')).toMatchObject({
        entryType: 'BUG',
        priority: null,
        progressPercent: null,
      });
    });

    it('sees a document edit that changes only the priority, or only the progress', async () => {
      const docsPath = createScratchDocsPath();
      const file = path.join(docsPath, 'Roadmap.md');
      writeFileSync(
        file,
        roadmap(entry('AT-4', 'TASK', ['priority: P2', 'progress: 10'])),
        'utf-8',
      );
      const projectId = await createProject(docsPath);
      await sync(projectId);

      writeFileSync(
        file,
        roadmap(entry('AT-4', 'TASK', ['priority: P0', 'progress: 10'])),
        'utf-8',
      );
      await sync(projectId);
      expect(await taskOf(projectId, 'AT-4')).toMatchObject({
        priority: 'CRITICAL',
        progressPercent: 10,
      });

      writeFileSync(
        file,
        roadmap(entry('AT-4', 'TASK', ['priority: P0', 'progress: 55'])),
        'utf-8',
      );
      await sync(projectId);
      expect(await taskOf(projectId, 'AT-4')).toMatchObject({
        priority: 'CRITICAL',
        progressPercent: 55,
      });
    });

    it('does not store a progress figure for a task that has subtasks', async () => {
      const docsPath = createScratchDocsPath();
      const file = path.join(docsPath, 'Roadmap.md');
      writeFileSync(
        file,
        roadmap(entry('AT-5', 'TASK', ['progress: 30'])),
        'utf-8',
      );
      const projectId = await createProject(docsPath);
      await sync(projectId);
      const parent = await taskOf(projectId, 'AT-5');
      await request(server())
        .post(`/projects/${projectId}/tasks`)
        .set('Authorization', auth())
        .send({
          title: 'A step',
          acceptanceCriteria: 'Done',
          parentTaskId: parent.id,
        })
        .expect(201);

      writeFileSync(
        file,
        readFileSync(file, 'utf-8').replace('progress: 30', 'progress: 60'),
        'utf-8',
      );
      await sync(projectId);

      // Its progress comes from the subtasks (rollup rule 2), as the API
      // already insists for an edit made in the app.
      expect((await taskOf(projectId, 'AT-5')).progressPercent).toBe(30);
    });

    it('leaves what is not work out of the progress, however many such entries there are', async () => {
      const docsPath = createScratchDocsPath();
      writeFileSync(
        path.join(docsPath, 'Roadmap.md'),
        roadmap(
          entry('AT-6', 'TASK', ['progress: 100'], 'DONE'),
          entry('AT-7', 'PHASE'),
          entry('AT-8', 'EPIC'),
          entry('AT-9', 'DECISION', [], 'PENDING'),
        ),
        'utf-8',
      );
      const projectId = await createProject(docsPath);

      await sync(projectId);

      // One task, done: the phase, the epic and the open decision are not
      // shares of the project (they used to bring it to 25).
      expect(await progressOf(projectId)).toBe(100);
      // They are still cards, told apart by their type.
      expect(await taskOf(projectId, 'AT-9')).toMatchObject({
        entryType: 'DECISION',
      });
    });
  });

  describe('writing', () => {
    it('writes a priority and a progress edited in PM Hub into the entry, and takes a cleared one out', async () => {
      const docsPath = createScratchDocsPath();
      const file = path.join(docsPath, 'Roadmap.md');
      writeFileSync(
        file,
        roadmap(entry('AT-10', 'TASK', ['priority: P2', 'progress: 10'])),
        'utf-8',
      );
      const projectId = await createProject(docsPath);
      await sync(projectId);
      const task = await taskOf(projectId, 'AT-10');

      await patch(projectId, task.id, {
        priority: 'CRITICAL',
        progressPercent: 75,
      }).expect(200);
      const written = readFileSync(file, 'utf-8');
      expect(written).toContain('priority: P0');
      expect(written).toContain('progress: 75');

      await patch(projectId, task.id, {
        priority: null,
        progressPercent: null,
      }).expect(200);
      const cleared = readFileSync(file, 'utf-8');
      expect(cleared).not.toContain('priority:');
      expect(cleared).not.toContain('progress:');

      // What was written is what sync now reads: nothing is undone or raised.
      const run = await sync(projectId);
      expect(run.body.summary.conflictsRaised).toBe(0);
      expect(await taskOf(projectId, 'AT-10')).toMatchObject({
        priority: null,
        progressPercent: null,
      });
    });

    it('keeps the words a document uses for its priorities', async () => {
      const docsPath = createScratchDocsPath();
      const file = path.join(docsPath, 'Roadmap.md');
      writeFileSync(
        file,
        roadmap(entry('AT-11', 'TASK', ['priority: MEDIUM'])),
        'utf-8',
      );
      const projectId = await createProject(docsPath);
      await sync(projectId);
      const task = await taskOf(projectId, 'AT-11');

      await patch(projectId, task.id, { priority: 'HIGH' }).expect(200);

      expect(readFileSync(file, 'utf-8')).toContain('priority: HIGH');
    });

    it('writes them into the entry of a task created in PM Hub', async () => {
      const docsPath = createScratchDocsPath();
      const file = path.join(docsPath, 'Roadmap.md');
      writeFileSync(file, roadmap(entry('AT-12', 'TASK')), 'utf-8');
      const projectId = await createProject(docsPath);
      await sync(projectId);

      const created = await request(server())
        .post(`/projects/${projectId}/tasks`)
        .set('Authorization', auth())
        .send({
          title: 'From the app',
          acceptanceCriteria: 'Verified',
          priority: 'HIGH',
          progressPercent: 20,
        })
        .expect(201);

      const written = readFileSync(file, 'utf-8');
      expect(written).toContain(`### ${created.body.externalId} —`);
      expect(written).toContain('priority: P1');
      expect(written).toContain('progress: 20');
    });

    it('does not touch, or raise anything about, a document in a table format', async () => {
      const docsPath = createScratchDocsPath();
      const file = path.join(docsPath, 'Roadmap.md');
      const projectId = await createProject(docsPath);
      const created = await request(server())
        .post(`/projects/${projectId}/tasks`)
        .set('Authorization', auth())
        .send({ title: 'In a table', acceptanceCriteria: 'Verified' })
        .expect(201);
      const before = readFileSync(file, 'utf-8');

      await patch(projectId, created.body.id, {
        priority: 'HIGH',
        progressPercent: 50,
      }).expect(200);

      // There is no column for either, so the document stays as it is.
      expect(readFileSync(file, 'utf-8')).toBe(before);
      const audit = await request(server())
        .get(`/projects/${projectId}/audit?entityType=Task`)
        .set('Authorization', auth())
        .expect(200);
      expect(
        audit.body.filter(
          (event: { operation: string }) =>
            event.operation === 'WRITE_BACK_DEFERRED',
        ),
      ).toEqual([]);
      expect(await taskOf(projectId, created.body.externalId)).toMatchObject({
        priority: 'HIGH',
        progressPercent: 50,
      });
    });
  });

  describe('when both sides changed the same field', () => {
    it('raises a conflict, and PM Hub winning writes its value into the entry', async () => {
      const docsPath = createScratchDocsPath();
      const file = path.join(docsPath, 'Roadmap.md');
      writeFileSync(
        file,
        roadmap(entry('AT-13', 'TASK', ['priority: P1'])),
        'utf-8',
      );
      const projectId = await createProject(docsPath);
      await sync(projectId);
      const task = await taskOf(projectId, 'AT-13');

      // The document moves on, unseen; then PM Hub edits the same field, which
      // it will not write over a document change it has not read.
      writeFileSync(
        file,
        readFileSync(file, 'utf-8').replace('priority: P1', 'priority: P0'),
        'utf-8',
      );
      await patch(projectId, task.id, { priority: 'LOW' }).expect(200);
      expect(readFileSync(file, 'utf-8')).toContain('priority: P0');

      const run = await sync(projectId);
      expect(run.body.summary.conflictsRaised).toBe(1);
      const open = await request(server())
        .get(`/projects/${projectId}/conflicts?resolved=false`)
        .set('Authorization', auth())
        .expect(200);
      expect(open.body).toHaveLength(1);
      expect(open.body[0]).toMatchObject({
        kind: 'CONCURRENT_FIELD_EDIT',
        localVersion: { priority: 'LOW' },
        externalVersion: { priority: 'CRITICAL' },
      });

      await request(server())
        .post(`/projects/${projectId}/conflicts/${open.body[0].id}/resolve`)
        .set('Authorization', auth())
        .send({ strategy: 'KEEP_LOCAL' })
        .expect(201);

      expect(readFileSync(file, 'utf-8')).toContain('priority: P3');
      expect((await taskOf(projectId, 'AT-13')).priority).toBe('LOW');
      const after = await sync(projectId);
      expect(after.body.summary.conflictsRaised).toBe(0);
    });
  });
});
