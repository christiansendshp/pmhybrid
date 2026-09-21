import { readFileSync, writeFileSync } from 'node:fs';
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

const row = (id: string, outcome: string, status = 'TODO') =>
  `| ${id} | ${outcome} | check | ${status} | — | — |`;

/**
 * Conflicts used to pile up (a missing row raised a new one on every run, a
 * contested field a new one on every document change), stay open after the
 * cause was gone, and an empty Roadmap.md was read as "every row disappeared"
 * (Roadmap BUG-06a).
 */
describe('Conflict hygiene and the empty-document guard (e2e, Roadmap BUG-06a)', () => {
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

  async function createProject(docsPath: string) {
    const res = await request(server())
      .post('/projects')
      .set('Authorization', auth())
      .send({ name: `Hygiene E2E ${Date.now()}-${Math.random()}`, docsPath })
      .expect(201);
    return res.body.id as string;
  }

  const sync = (projectId: string) =>
    request(server())
      .post(`/projects/${projectId}/sync`)
      .set('Authorization', auth());

  async function conflicts(projectId: string, resolved: boolean) {
    const res = await request(server())
      .get(`/projects/${projectId}/conflicts?resolved=${resolved}`)
      .set('Authorization', auth())
      .expect(200);
    return res.body as {
      id: string;
      kind: string;
      localVersion: Record<string, unknown>;
      externalVersion: Record<string, unknown> | null;
      resolutionStrategy: string | null;
      resolvedByActorId: string | null;
    }[];
  }

  async function taskOf(projectId: string, externalId: string) {
    const list = await request(server())
      .get(`/projects/${projectId}/tasks`)
      .set('Authorization', auth())
      .expect(200);
    return list.body.find(
      (t: { externalId: string }) => t.externalId === externalId,
    ) as {
      id: string;
      title: string;
    };
  }

  it('asks about a missing row once, and closes the question when the row comes back', async () => {
    const docsPath = createScratchDocsPath();
    const file = path.join(docsPath, 'Roadmap.md');
    writeFileSync(
      file,
      roadmap(row('H-1', 'Vanishing'), row('H-2', 'Stays')),
      'utf-8',
    );
    const projectId = await createProject(docsPath);
    await sync(projectId).expect(201);

    writeFileSync(file, roadmap(row('H-2', 'Stays')), 'utf-8');
    const first = await sync(projectId).expect(201);
    const second = await sync(projectId).expect(201);
    const third = await sync(projectId).expect(201);

    expect(
      [first, second, third].map((run) => run.body.summary.conflictsRaised),
    ).toEqual([1, 0, 0]);
    expect(await conflicts(projectId, false)).toHaveLength(1);

    writeFileSync(
      file,
      roadmap(row('H-1', 'Vanishing'), row('H-2', 'Stays')),
      'utf-8',
    );
    const back = await sync(projectId).expect(201);

    expect(back.body.summary.conflictsClosed).toBe(1);
    expect(await conflicts(projectId, false)).toHaveLength(0);
    const [closed] = await conflicts(projectId, true);
    expect(closed).toMatchObject({
      resolutionStrategy: 'DISMISSED',
      resolvedByActorId: null,
    });

    // Gone again: that is new news.
    writeFileSync(file, roadmap(row('H-2', 'Stays')), 'utf-8');
    expect(
      (await sync(projectId).expect(201)).body.summary.conflictsRaised,
    ).toBe(1);
  });

  it('does not ask again after the conflict was settled by keeping the task, until the row returns and goes again', async () => {
    const docsPath = createScratchDocsPath();
    const file = path.join(docsPath, 'Roadmap.md');
    writeFileSync(
      file,
      roadmap(row('H-1', 'Kept anyway'), row('H-2', 'Stays')),
      'utf-8',
    );
    const projectId = await createProject(docsPath);
    await sync(projectId).expect(201);

    writeFileSync(file, roadmap(row('H-2', 'Stays')), 'utf-8');
    await sync(projectId).expect(201);
    const [open] = await conflicts(projectId, false);
    await request(server())
      .post(`/projects/${projectId}/conflicts/${open.id}/resolve`)
      .set('Authorization', auth())
      .send({ strategy: 'KEEP_LOCAL' })
      .expect(201);

    // Still missing, already answered: no new conflict.
    expect(
      (await sync(projectId).expect(201)).body.summary.conflictsRaised,
    ).toBe(0);
    expect(await conflicts(projectId, false)).toHaveLength(0);

    // The row returns and later goes again.
    writeFileSync(
      file,
      roadmap(row('H-1', 'Kept anyway'), row('H-2', 'Stays')),
      'utf-8',
    );
    await sync(projectId).expect(201);
    writeFileSync(file, roadmap(row('H-2', 'Stays')), 'utf-8');
    expect(
      (await sync(projectId).expect(201)).body.summary.conflictsRaised,
    ).toBe(1);
  });

  it('keeps one open conflict per contested field, follows the document, and closes it when the two agree', async () => {
    const docsPath = createScratchDocsPath();
    const file = path.join(docsPath, 'Roadmap.md');
    writeFileSync(file, roadmap(row('H-1', 'Original')), 'utf-8');
    const projectId = await createProject(docsPath);
    await sync(projectId).expect(201);
    const task = await taskOf(projectId, 'H-1');

    // The document and PM Hub both retitle it.
    writeFileSync(file, roadmap(row('H-1', 'Doc one')), 'utf-8');
    await request(server())
      .patch(`/projects/${projectId}/tasks/${task.id}`)
      .set('Authorization', auth())
      .send({ title: 'Local title' })
      .expect(200);
    expect(
      (await sync(projectId).expect(201)).body.summary.conflictsRaised,
    ).toBe(1);

    // The document changes its mind twice more: the same conflict follows it.
    writeFileSync(file, roadmap(row('H-1', 'Doc two')), 'utf-8');
    const again = await sync(projectId).expect(201);
    expect(again.body.summary.conflictsRaised).toBe(0);
    const open = await conflicts(projectId, false);
    expect(open).toHaveLength(1);
    expect(open[0].externalVersion).toEqual({ title: 'Doc two' });
    expect(open[0].localVersion).toEqual({ title: 'Local title' });

    // The document ends up agreeing with PM Hub: nothing left to decide.
    writeFileSync(file, roadmap(row('H-1', 'Local title')), 'utf-8');
    const agreed = await sync(projectId).expect(201);
    expect(agreed.body.summary.conflictsClosed).toBe(1);
    expect(await conflicts(projectId, false)).toHaveLength(0);
    expect((await taskOf(projectId, 'H-1')).title).toBe('Local title');
  });

  it('refuses an empty Roadmap.md in a project that has tasks from it, and changes nothing', async () => {
    const docsPath = createScratchDocsPath();
    const file = path.join(docsPath, 'Roadmap.md');
    const original = roadmap(
      row('H-1', 'One'),
      row('H-2', 'Two'),
      row('H-3', 'Three'),
    );
    writeFileSync(file, original, 'utf-8');
    const projectId = await createProject(docsPath);
    await sync(projectId).expect(201);

    writeFileSync(file, '  \n', 'utf-8');
    const refused = await sync(projectId).expect(422);
    expect(refused.body.message).toMatch(/Roadmap\.md is empty, but 3 task/);
    expect(await conflicts(projectId, false)).toHaveLength(0);

    // Restoring the file syncs as if nothing had happened.
    writeFileSync(file, original, 'utf-8');
    const restored = await sync(projectId).expect(201);
    expect(restored.body.status).toBe('SUCCESS');
    expect(restored.body.summary.tasksUpdated).toBe(0);
    expect(readFileSync(file, 'utf-8')).toBe(original);
  });

  it('accepts an empty Roadmap.md in a project with no tasks from it yet', async () => {
    const docsPath = createScratchDocsPath();
    writeFileSync(path.join(docsPath, 'Roadmap.md'), '', 'utf-8');
    const projectId = await createProject(docsPath);

    const run = await sync(projectId).expect(201);

    expect(run.body.status).toBe('SUCCESS');
  });
});
