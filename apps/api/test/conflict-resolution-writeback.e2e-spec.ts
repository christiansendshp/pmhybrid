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
    ...rows,
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

const row = (id: string, outcome: string, status = 'TODO', owner = '—') =>
  `| ${id} | ${outcome} | check | ${status} | ${owner} | — |`;

/**
 * Resolving a conflict in favour of PM Hub used to change only PostgreSQL:
 * the document kept the value that lost, and the stored hash already said
 * everything was in sync, so no later sync repaired it (Roadmap BUG-06b).
 */
describe('Conflict resolution writes back to the document (e2e, Roadmap BUG-06b)', () => {
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
      .send({ name: unique('Resolution E2E'), docsPath })
      .expect(201);
    return res.body.id as string;
  }

  const sync = (projectId: string) =>
    request(server())
      .post(`/projects/${projectId}/sync`)
      .set('Authorization', auth());

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
      status: string;
      assigneeActorId: string | null;
    };
  }

  async function openConflict(projectId: string) {
    const res = await request(server())
      .get(`/projects/${projectId}/conflicts?resolved=false`)
      .set('Authorization', auth())
      .expect(200);
    expect(res.body).toHaveLength(1);
    return res.body[0] as { id: string };
  }

  const resolve = (projectId: string, conflictId: string, body: object) =>
    request(server())
      .post(`/projects/${projectId}/conflicts/${conflictId}/resolve`)
      .set('Authorization', auth())
      .send(body)
      .expect(201);

  /** The document and PM Hub both retitle B-1; returns everything a test needs. */
  async function titleConflict() {
    const docsPath = createScratchDocsPath();
    const file = path.join(docsPath, 'Roadmap.md');
    writeFileSync(file, roadmap(row('B-1', 'Original')), 'utf-8');
    const projectId = await createProject(docsPath);
    await sync(projectId).expect(201);
    const task = await taskOf(projectId, 'B-1');
    writeFileSync(file, roadmap(row('B-1', 'Doc title')), 'utf-8');
    await request(server())
      .patch(`/projects/${projectId}/tasks/${task.id}`)
      .set('Authorization', auth())
      .send({ title: 'Local title' })
      .expect(200);
    expect(
      (await sync(projectId).expect(201)).body.summary.conflictsRaised,
    ).toBe(1);
    return { file, projectId, task, conflict: await openConflict(projectId) };
  }

  it('KEEP_LOCAL puts PM Hub’s value into the document, and the next sync finds nothing to do', async () => {
    const { file, projectId, conflict } = await titleConflict();

    await resolve(projectId, conflict.id, { strategy: 'KEEP_LOCAL' });

    expect(readFileSync(file, 'utf-8')).toContain('| B-1 | Local title |');
    const next = await sync(projectId).expect(201);
    expect(next.body.status).toBe('SUCCESS');
    expect(next.body.summary.conflictsRaised).toBe(0);
    expect((await taskOf(projectId, 'B-1')).title).toBe('Local title');
  });

  it('MANUAL_EDIT writes the person’s value', async () => {
    const { file, projectId, conflict } = await titleConflict();

    await resolve(projectId, conflict.id, {
      strategy: 'MANUAL_EDIT',
      manualValue: { title: 'Merged title' },
    });

    expect(readFileSync(file, 'utf-8')).toContain('| B-1 | Merged title |');
    expect((await taskOf(projectId, 'B-1')).title).toBe('Merged title');
    expect(
      (await sync(projectId).expect(201)).body.summary.conflictsRaised,
    ).toBe(0);
  });

  it('KEEP_EXTERNAL and DISMISSED leave the document exactly as it is', async () => {
    for (const strategy of ['KEEP_EXTERNAL', 'DISMISSED']) {
      const { file, projectId, conflict } = await titleConflict();
      const before = readFileSync(file, 'utf-8');

      await resolve(projectId, conflict.id, { strategy });

      expect(readFileSync(file, 'utf-8')).toBe(before);
    }
  });

  it('leaves a document edit the person has not seen, and lets the next sync raise it', async () => {
    const { file, projectId, conflict } = await titleConflict();
    // The document changed again after the conflict was raised.
    writeFileSync(file, roadmap(row('B-1', 'Newer document title')), 'utf-8');

    await resolve(projectId, conflict.id, { strategy: 'KEEP_LOCAL' });

    expect(readFileSync(file, 'utf-8')).toContain(
      '| B-1 | Newer document title |',
    );
    expect(
      (await sync(projectId).expect(201)).body.summary.conflictsRaised,
    ).toBe(1);
  });

  it('writes the status PM Hub kept, so the document stops saying the other one', async () => {
    const docsPath = createScratchDocsPath();
    const file = path.join(docsPath, 'Roadmap.md');
    writeFileSync(file, roadmap(row('B-1', 'Title')), 'utf-8');
    const projectId = await createProject(docsPath);
    await sync(projectId).expect(201);
    const task = await taskOf(projectId, 'B-1');
    const agents = await request(server())
      .get('/agents')
      .set('Authorization', auth())
      .expect(200);
    const agentId = agents.body[0].id as string;
    await request(server())
      .post(`/projects/${projectId}/members`)
      .set('Authorization', auth())
      .send({ actorId: agentId })
      .expect(201);
    // PM Hub assigns (moving it to ASIGNADA); the document independently says IN_PROGRESS.
    await request(server())
      .post(`/projects/${projectId}/tasks/${task.id}/assign`)
      .set('Authorization', auth())
      .send({ actorId: agentId })
      .expect(201);
    writeFileSync(file, roadmap(row('B-1', 'Title', 'IN_PROGRESS')), 'utf-8');
    expect(
      (await sync(projectId).expect(201)).body.summary.conflictsRaised,
    ).toBe(1);
    const conflict = await openConflict(projectId);

    await resolve(projectId, conflict.id, { strategy: 'KEEP_LOCAL' });

    expect(readFileSync(file, 'utf-8')).toMatch(
      /\| B-1 \| Title \| check \| ASIGNADA \|/,
    );
    const next = await sync(projectId).expect(201);
    expect(next.body.summary.conflictsRaised).toBe(0);
    expect((await taskOf(projectId, 'B-1')).status).toBe('ASIGNADA');
  });

  it('writes the assignee PM Hub kept into the owner', async () => {
    const docsPath = createScratchDocsPath();
    const file = path.join(docsPath, 'Roadmap.md');
    const projectId = await createProject(docsPath);
    const person = async (name: string) => {
      const created = await request(server())
        .post('/users')
        .set('Authorization', auth())
        .send({
          displayName: name,
          email: `${unique('own').replace(/\s/g, '')}@pmhybrid.local`,
          password: 'password123',
        })
        .expect(201);
      await request(server())
        .post(`/projects/${projectId}/members`)
        .set('Authorization', auth())
        .send({ actorId: created.body.id })
        .expect(201);
      return created.body.id as string;
    };
    const aName = unique('Ana');
    const bName = unique('Berta');
    const cName = unique('Carla');
    await person(aName);
    const bId = await person(bName);
    await person(cName);
    writeFileSync(
      file,
      roadmap(row('B-1', 'Title', 'ASIGNADA', aName)),
      'utf-8',
    );
    await sync(projectId).expect(201);
    const task = await taskOf(projectId, 'B-1');

    // The document hands it to Carla while PM Hub hands it to Berta.
    writeFileSync(
      file,
      roadmap(row('B-1', 'Title', 'ASIGNADA', cName)),
      'utf-8',
    );
    await request(server())
      .post(`/projects/${projectId}/tasks/${task.id}/assign`)
      .set('Authorization', auth())
      .send({ actorId: bId })
      .expect(201);
    expect(
      (await sync(projectId).expect(201)).body.summary.conflictsRaised,
    ).toBe(1);
    const conflict = await openConflict(projectId);

    await resolve(projectId, conflict.id, { strategy: 'KEEP_LOCAL' });

    expect(readFileSync(file, 'utf-8')).toContain(`| ${bName} |`);
    expect(readFileSync(file, 'utf-8')).not.toContain(cName);
    expect(
      (await sync(projectId).expect(201)).body.summary.conflictsRaised,
    ).toBe(0);
    expect((await taskOf(projectId, 'B-1')).assigneeActorId).toBe(bId);
  });
});
