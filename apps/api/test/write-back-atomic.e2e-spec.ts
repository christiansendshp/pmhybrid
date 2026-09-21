import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { DEMO_EMAIL, DEMO_PASSWORD } from './../prisma/demo-credentials.js';
import { createScratchDocsPath } from './helpers/scratch-docs.js';

const SKELETON = `# Roadmap

## Active work

| ID | Outcome | Acceptance check | Status | Owner | Depends on |
| --- | --- | --- | --- | --- | --- |
| — | — | — | — | — | — |

## Near term

| ID | Outcome | Acceptance check | Status | Depends on |
| --- | --- | --- | --- | --- |
| — | — | — | — | — |

## Blocked

| ID | Blocker | Needed decision or event | Owner |
| --- | --- | --- | --- |
| — | — | — | — |
`;

/**
 * A task change used to commit to PostgreSQL first and write the document
 * afterwards, so a document that could not be written returned a 500 with the
 * change already saved — and retrying a creation made a duplicate that sync
 * could not repair (Roadmap BUG-07). Now the change and the document write are
 * one transaction.
 */
describe('Task changes and their document write are one unit (e2e, Roadmap BUG-07)', () => {
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
      .send({ name: `Atomic E2E ${Date.now()}-${Math.random()}`, docsPath })
      .expect(201);
    return res.body.id as string;
  }

  const createTask = (projectId: string, title: string) =>
    request(server())
      .post(`/projects/${projectId}/tasks`)
      .set('Authorization', auth())
      .send({ title, acceptanceCriteria: 'Verified by e2e' });

  async function listTasks(projectId: string) {
    const res = await request(server())
      .get(`/projects/${projectId}/tasks`)
      .set('Authorization', auth())
      .expect(200);
    return res.body as {
      id: string;
      title: string;
      status: string;
      externalId: string | null;
    }[];
  }

  /** The docs folder disappears (unmounted, deleted, renamed) under a live project. */
  function loseDocs(docsPath: string) {
    rmSync(docsPath, { recursive: true, force: true });
  }

  function restoreDocs(docsPath: string) {
    mkdirSync(docsPath, { recursive: true });
    writeFileSync(path.join(docsPath, 'Roadmap.md'), SKELETON, 'utf-8');
    writeFileSync(
      path.join(docsPath, 'Agentslog.md'),
      '# Agents log\n\n## Entries\n',
      'utf-8',
    );
  }

  it('answers a clean 422 and saves nothing when the document cannot be written, so a retry creates exactly one task', async () => {
    const docsPath = createScratchDocsPath();
    const projectId = await createProject(docsPath);
    loseDocs(docsPath);

    const failed = await createTask(
      projectId,
      'Created while the docs are gone',
    ).expect(422);

    expect(failed.body.message).toMatch(/^Not saved: /);
    expect(failed.body.message).not.toContain(docsPath);
    expect(await listTasks(projectId)).toEqual([]);

    restoreDocs(docsPath);
    const retried = await createTask(
      projectId,
      'Created while the docs are gone',
    ).expect(201);

    expect(retried.body.externalId).toMatch(/^PMH-/);
    expect(await listTasks(projectId)).toHaveLength(1);
  });

  it('leaves the task exactly as it was when a move, an edit, an assignment or a removal cannot be written', async () => {
    const docsPath = createScratchDocsPath();
    const projectId = await createProject(docsPath);
    const created = await createTask(projectId, 'Stays put').expect(201);
    const taskId = created.body.id as string;
    const before = (await listTasks(projectId))[0];
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

    loseDocs(docsPath);
    // Built one at a time: supertest closes the shared server after each request.
    const attempts = [
      () =>
        request(server())
          .post(`/projects/${projectId}/tasks/${taskId}/assign`)
          .set('Authorization', auth())
          .send({ actorId: agentId }),
      () =>
        request(server())
          .patch(`/projects/${projectId}/tasks/${taskId}`)
          .set('Authorization', auth())
          .send({ title: 'Renamed while the docs are gone' }),
      () =>
        request(server())
          .post(`/projects/${projectId}/tasks/${taskId}/dependencies`)
          .set('Authorization', auth())
          .send({ rawExternalRef: 'SOMEWHERE-1' }),
      () =>
        request(server())
          .delete(`/projects/${projectId}/tasks/${taskId}`)
          .set('Authorization', auth()),
    ];
    for (const attempt of attempts) {
      const res = await attempt();
      expect(res.status).toBe(422);
      expect(res.body.message).toMatch(/^Not saved: /);
    }

    // Nothing of any of it was kept.
    expect(await listTasks(projectId)).toEqual([before]);
    const detail = await request(server())
      .get(`/projects/${projectId}/tasks/${taskId}`)
      .set('Authorization', auth())
      .expect(200);
    expect(detail.body.assigneeActorId).toBeNull();
    expect(detail.body.dependencies).toEqual([]);
  });

  it('keeps the change and the document together when the document can be written', async () => {
    const docsPath = createScratchDocsPath();
    const projectId = await createProject(docsPath);
    const created = await createTask(projectId, 'Round trip').expect(201);
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
    await request(server())
      .post(`/projects/${projectId}/tasks/${created.body.id}/assign`)
      .set('Authorization', auth())
      .send({ actorId: agentId })
      .expect(201);

    await request(server())
      .post(`/projects/${projectId}/tasks/${created.body.id}/transition`)
      .set('Authorization', auth())
      .send({ status: 'EN_DESARROLLO' })
      .expect(201);

    expect((await listTasks(projectId))[0].status).toBe('EN_DESARROLLO');
    // The document was written too: a sync reads the row back as the same task, not a new one.
    const run = await request(server())
      .post(`/projects/${projectId}/sync`)
      .set('Authorization', auth())
      .expect(201);
    expect(run.body.summary.tasksCreated).toBe(0);
    expect(await listTasks(projectId)).toHaveLength(1);
  });
});
