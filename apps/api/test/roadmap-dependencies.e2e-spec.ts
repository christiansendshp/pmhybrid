import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { DEMO_EMAIL, DEMO_PASSWORD } from './../prisma/demo-credentials.js';
import { createScratchDocsPath } from './helpers/scratch-docs.js';

const ACTIVE_HEADER = `| ID | Outcome | Acceptance check | Status | Owner | Depends on |
| --- | --- | --- | --- | --- | --- |`;

/** One or more Active-work rows, each a full pipe-delimited row string (including the "Depends on" cell). */
function roadmapWithActiveRows(...rows: string[]): string {
  return `# Roadmap

## Active work

${ACTIVE_HEADER}
${rows.join('\n')}

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

/**
 * Roadmap "Depends on" reconciliation (Roadmap GAP-14, docs/domain-model.md
 * TaskDependency). Additive-only by design (see synchronization.service.ts
 * reconcileDependencies) — never removes a link sync didn't create, since
 * write-back doesn't reflect dependencies into the document, so there is no
 * document trace to compare a removal decision against.
 */
describe('Roadmap "Depends on" reconciliation (e2e)', () => {
  let app: INestApplication<App>;
  let ownerToken: string;

  beforeEach(async () => {
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
      .send({ name: `Dep E2E ${Date.now()}-${Math.random()}`, docsPath })
      .expect(201);
    return res.body.id as string;
  }

  async function sync(projectId: string) {
    return request(server()).post(`/projects/${projectId}/sync`).set('Authorization', auth()).expect(201);
  }

  async function getTaskByExternalId(projectId: string, externalId: string) {
    const tasks = await request(server())
      .get(`/projects/${projectId}/tasks`)
      .set('Authorization', auth())
      .expect(200);
    const summary = tasks.body.find((t: { externalId: string }) => t.externalId === externalId);
    const full = await request(server())
      .get(`/projects/${projectId}/tasks/${summary.id}`)
      .set('Authorization', auth())
      .expect(200);
    return full.body;
  }

  it('resolves a "Depends on" cell to an already-known task, in a single sync', async () => {
    const docsPath = createScratchDocsPath();
    writeFileSync(
      path.join(docsPath, 'Roadmap.md'),
      // PMH-BASE is listed first, so it already exists when PMH-A's row is reconciled.
      roadmapWithActiveRows(
        '| PMH-BASE | Base outcome | check | TODO | — | — |',
        '| PMH-A | Depends on base | check | TODO | — | PMH-BASE |',
      ),
      'utf-8',
    );
    const projectId = await createProjectAt(docsPath);
    const syncRun = await sync(projectId);
    expect(syncRun.body.summary.dependenciesLinked).toBe(1);

    const base = await getTaskByExternalId(projectId, 'PMH-BASE');
    const a = await getTaskByExternalId(projectId, 'PMH-A');
    expect(a.dependencies).toHaveLength(1);
    expect(a.dependencies[0].dependsOnTaskId).toBe(base.id);
    expect(a.dependencies[0].dependsOnTask.status).toBe('PENDIENTE');
  });

  it('links multiple comma-separated dependencies from one cell', async () => {
    const docsPath = createScratchDocsPath();
    writeFileSync(
      path.join(docsPath, 'Roadmap.md'),
      roadmapWithActiveRows(
        '| PMH-X | Outcome X | check | TODO | — | — |',
        '| PMH-Y | Outcome Y | check | TODO | — | — |',
        '| PMH-Z | Depends on both | check | TODO | — | PMH-X, PMH-Y |',
      ),
      'utf-8',
    );
    const projectId = await createProjectAt(docsPath);
    await sync(projectId);

    const z = await getTaskByExternalId(projectId, 'PMH-Z');
    expect(z.dependencies).toHaveLength(2);
  });

  it('stores an unresolvable reference as dangling, then resolves it once the target appears on a later sync', async () => {
    const docsPath = createScratchDocsPath();
    writeFileSync(
      path.join(docsPath, 'Roadmap.md'),
      roadmapWithActiveRows('| PMH-C | Depends on a row not yet written | check | TODO | — | PMH-D |'),
      'utf-8',
    );
    const projectId = await createProjectAt(docsPath);
    await sync(projectId);

    let c = await getTaskByExternalId(projectId, 'PMH-C');
    expect(c.dependencies).toHaveLength(1);
    expect(c.dependencies[0].dependsOnTaskId).toBeNull();
    expect(c.dependencies[0].rawExternalRef).toBe('PMH-D');

    // PMH-D now shows up in the document.
    writeFileSync(
      path.join(docsPath, 'Roadmap.md'),
      roadmapWithActiveRows(
        '| PMH-C | Depends on a row not yet written | check | TODO | — | PMH-D |',
        '| PMH-D | Now exists | check | TODO | — | — |',
      ),
      'utf-8',
    );
    await sync(projectId);

    c = await getTaskByExternalId(projectId, 'PMH-C');
    const d = await getTaskByExternalId(projectId, 'PMH-D');
    expect(c.dependencies).toHaveLength(1); // upgraded in place, not duplicated
    expect(c.dependencies[0].dependsOnTaskId).toBe(d.id);
    expect(c.dependencies[0].rawExternalRef).toBe('PMH-D');
  });

  it('is idempotent across repeated syncs and never removes a dependency added through the UI', async () => {
    const docsPath = createScratchDocsPath();
    writeFileSync(
      path.join(docsPath, 'Roadmap.md'),
      roadmapWithActiveRows(
        '| PMH-BASE2 | Base | check | TODO | — | — |',
        '| PMH-E | Depends on base | check | TODO | — | PMH-BASE2 |',
      ),
      'utf-8',
    );
    const projectId = await createProjectAt(docsPath);
    await sync(projectId);
    await sync(projectId); // same content, second run

    let e = await getTaskByExternalId(projectId, 'PMH-E');
    expect(e.dependencies).toHaveLength(1); // not duplicated

    // A UI-added dependency the document says nothing about.
    const base = await getTaskByExternalId(projectId, 'PMH-BASE2');
    await request(server())
      .post(`/projects/${projectId}/tasks/${base.id}/dependencies`)
      .set('Authorization', auth())
      .send({ rawExternalRef: 'EXTERNAL-TICKET-9' })
      .expect(201);

    await sync(projectId); // the document still doesn't mention this dependency

    const baseAfter = await getTaskByExternalId(projectId, 'PMH-BASE2');
    expect(
      baseAfter.dependencies.some((d: { rawExternalRef: string | null }) => d.rawExternalRef === 'EXTERNAL-TICKET-9'),
    ).toBe(true); // sync never removed it

    e = await getTaskByExternalId(projectId, 'PMH-E');
    expect(e.dependencies).toHaveLength(1); // still not duplicated after a third sync
  });

  it('does not duplicate a UI-added dependency (rawExternalRef null) when the document later names the same target by external ID', async () => {
    const docsPath = createScratchDocsPath();
    writeFileSync(
      path.join(docsPath, 'Roadmap.md'),
      roadmapWithActiveRows(
        '| PMH-BASE3 | Base | check | TODO | — | — |',
        '| PMH-I | Will later depend on base too | check | TODO | — | — |',
      ),
      'utf-8',
    );
    const projectId = await createProjectAt(docsPath);
    await sync(projectId);

    // Added through the UI: dependsOnTaskId set, rawExternalRef left null —
    // the same shape TasksService.addDependency writes from the task-detail
    // page, distinct from a document-sourced link (rawExternalRef set).
    const base = await getTaskByExternalId(projectId, 'PMH-BASE3');
    const i = await getTaskByExternalId(projectId, 'PMH-I');
    await request(server())
      .post(`/projects/${projectId}/tasks/${i.id}/dependencies`)
      .set('Authorization', auth())
      .send({ dependsOnTaskId: base.id })
      .expect(201);

    // The document now declares the very same fact.
    writeFileSync(
      path.join(docsPath, 'Roadmap.md'),
      roadmapWithActiveRows(
        '| PMH-BASE3 | Base | check | TODO | — | — |',
        '| PMH-I | Will later depend on base too | check | TODO | — | PMH-BASE3 |',
      ),
      'utf-8',
    );
    await sync(projectId);

    const iAfter = await getTaskByExternalId(projectId, 'PMH-I');
    expect(iAfter.dependencies).toHaveLength(1); // still one row, not two
    expect(iAfter.dependencies[0].dependsOnTaskId).toBe(base.id);
  });

  it('ignores a self-reference, without failing the sync', async () => {
    const docsPath = createScratchDocsPath();
    writeFileSync(
      path.join(docsPath, 'Roadmap.md'),
      roadmapWithActiveRows('| PMH-F | Depends on itself | check | TODO | — | PMH-F |'),
      'utf-8',
    );
    const projectId = await createProjectAt(docsPath);
    const syncRun = await sync(projectId);
    expect(syncRun.body.status).not.toBe('FAILED');

    const f = await getTaskByExternalId(projectId, 'PMH-F');
    expect(f.dependencies).toHaveLength(0);
  });

  it('skips a document-declared link that would close a dependency cycle, rather than corrupting the graph', async () => {
    const docsPath = createScratchDocsPath();
    // Sync #1: both exist yet, neither declares a dependency — deterministic
    // starting point, so which row the parser sees first doesn't matter.
    writeFileSync(
      path.join(docsPath, 'Roadmap.md'),
      roadmapWithActiveRows(
        '| PMH-G | Will depend on H | check | TODO | — | — |',
        '| PMH-H | Will depend on G too | check | TODO | — | — |',
      ),
      'utf-8',
    );
    const projectId = await createProjectAt(docsPath);
    await sync(projectId);

    // Sync #2: the document now declares both directions at once.
    writeFileSync(
      path.join(docsPath, 'Roadmap.md'),
      roadmapWithActiveRows(
        '| PMH-G | Will depend on H | check | TODO | — | PMH-H |',
        '| PMH-H | Will depend on G too | check | TODO | — | PMH-G |',
      ),
      'utf-8',
    );
    const syncRun = await sync(projectId);
    expect(syncRun.body.status).not.toBe('FAILED');

    const g = await getTaskByExternalId(projectId, 'PMH-G');
    const h = await getTaskByExternalId(projectId, 'PMH-H');
    // G -> H is reconciled first (file order) and links cleanly; H -> G
    // would close the cycle and is skipped.
    expect(g.dependencies).toHaveLength(1);
    expect(g.dependencies[0].dependsOnTaskId).toBe(h.id);
    expect(h.dependencies).toHaveLength(0);
  });
});
