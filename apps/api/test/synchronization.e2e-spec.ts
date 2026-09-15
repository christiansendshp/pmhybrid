import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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

function agentslogWith(entries: string): string {
  return `# Agents log

## Entries

${entries}`;
}

function entryBlock(taskId: string, statusWord: string, iso = '2026-01-01T00:00:00Z'): string {
  return `## [${iso}] | tester | ${taskId} | ${statusWord}

- Summary: s
- Files: f
- Verify: v
- Follow-up: n
`;
}

describe('Synchronization (read path, disappeared rows, archive-following, conflicts — e2e)', () => {
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
      .send({ name: `Sync E2E ${Date.now()}-${Math.random()}`, docsPath })
      .expect(201);
    return res.body.id as string;
  }

  it('creates a Task from a new Roadmap row on sync (scenario 10)', async () => {
    const docsPath = createScratchDocsPath();
    writeFileSync(
      path.join(docsPath, 'Roadmap.md'),
      roadmapWithActiveRow('| PMH-1 | New from doc | check it | TODO | — | — |'),
      'utf-8',
    );
    const projectId = await createProjectAt(docsPath);

    const syncRun = await request(server())
      .post(`/projects/${projectId}/sync`)
      .set('Authorization', auth())
      .expect(201);
    expect(syncRun.body.status).toBe('SUCCESS');

    const tasks = await request(server())
      .get(`/projects/${projectId}/tasks`)
      .set('Authorization', auth())
      .expect(200);
    const created = tasks.body.find((t: { externalId: string }) => t.externalId === 'PMH-1');
    expect(created).toBeDefined();
    expect(created.status).toBe('PENDIENTE');
    expect(created.title).toBe('New from doc');
  });

  it('marks a disappeared row TERMINADA when a matching DONE Agentslog entry exists (scenario 11)', async () => {
    const docsPath = createScratchDocsPath();
    writeFileSync(
      path.join(docsPath, 'Roadmap.md'),
      roadmapWithActiveRow('| PMH-2 | Will vanish | check | IN_PROGRESS | — | — |'),
      'utf-8',
    );
    const projectId = await createProjectAt(docsPath);
    await request(server()).post(`/projects/${projectId}/sync`).set('Authorization', auth()).expect(201);

    // The row disappears (completed, per the skill's own convention) and a
    // DONE entry is logged for it.
    writeFileSync(path.join(docsPath, 'Roadmap.md'), roadmapWithActiveRow('| — | — | — | — | — | — |'), 'utf-8');
    writeFileSync(path.join(docsPath, 'Agentslog.md'), agentslogWith(entryBlock('PMH-2', 'DONE')), 'utf-8');

    const syncRun = await request(server())
      .post(`/projects/${projectId}/sync`)
      .set('Authorization', auth())
      .expect(201);
    expect(syncRun.body.summary.completedViaRemoval).toBe(1);

    const tasks = await request(server())
      .get(`/projects/${projectId}/tasks`)
      .set('Authorization', auth())
      .expect(200);
    const task = tasks.body.find((t: { externalId: string }) => t.externalId === 'PMH-2');
    expect(task.status).toBe('TERMINADA');
  });

  it('raises a conflict (never deletes) when a row disappears with no terminal log entry', async () => {
    const docsPath = createScratchDocsPath();
    writeFileSync(
      path.join(docsPath, 'Roadmap.md'),
      roadmapWithActiveRow('| PMH-3 | Vanishes silently | check | TODO | — | — |'),
      'utf-8',
    );
    const projectId = await createProjectAt(docsPath);
    await request(server()).post(`/projects/${projectId}/sync`).set('Authorization', auth()).expect(201);

    writeFileSync(path.join(docsPath, 'Roadmap.md'), roadmapWithActiveRow('| — | — | — | — | — | — |'), 'utf-8');
    const syncRun = await request(server())
      .post(`/projects/${projectId}/sync`)
      .set('Authorization', auth())
      .expect(201);
    expect(syncRun.body.summary.conflictsRaised).toBe(1);

    const tasks = await request(server())
      .get(`/projects/${projectId}/tasks`)
      .set('Authorization', auth())
      .expect(200);
    const task = tasks.body.find((t: { externalId: string }) => t.externalId === 'PMH-3');
    expect(task).toBeDefined();
    expect(task.status).toBe('PENDIENTE'); // untouched

    const conflicts = await request(server())
      .get(`/projects/${projectId}/conflicts`)
      .set('Authorization', auth())
      .expect(200);
    expect(
      conflicts.body.some(
        (c: { kind: string; entityId: string }) =>
          c.kind === 'ROADMAP_ROW_DISAPPEARED_NO_TERMINAL_LOG' && c.entityId === task.id,
      ),
    ).toBe(true);
  });

  it('still finds a DONE entry after it has rotated into the archived segment (the disappeared-row hazard, docs/synchronization.md step 6)', async () => {
    const docsPath = createScratchDocsPath();
    writeFileSync(
      path.join(docsPath, 'Roadmap.md'),
      roadmapWithActiveRow('| PMH-4 | Rotates out | check | IN_PROGRESS | — | — |'),
      'utf-8',
    );
    const projectId = await createProjectAt(docsPath);
    await request(server()).post(`/projects/${projectId}/sync`).set('Authorization', auth()).expect(201);

    // Simulate the skill's own `rotate`: the DONE entry moves to
    // docs/history/, and the hot log is left with only a pointer.
    const archiveContent = agentslogWith(entryBlock('PMH-4', 'DONE'));
    mkdirSync(path.join(docsPath, 'history'), { recursive: true });
    writeFileSync(path.join(docsPath, 'history', 'Agentslog-archive.md'), archiveContent, 'utf-8');

    const archiveHash = createHash('sha256').update(archiveContent).digest('hex');
    const hotLog = `# Agents log

## Previous segment

- Archive: \`history/Agentslog-archive.md\`
- SHA-256: \`${archiveHash}\`

## Entries
`;
    writeFileSync(path.join(docsPath, 'Agentslog.md'), hotLog, 'utf-8');
    writeFileSync(path.join(docsPath, 'Roadmap.md'), roadmapWithActiveRow('| — | — | — | — | — | — |'), 'utf-8');

    const syncRun = await request(server())
      .post(`/projects/${projectId}/sync`)
      .set('Authorization', auth())
      .expect(201);
    expect(syncRun.body.summary.completedViaRemoval).toBe(1);
    expect(syncRun.body.summary.conflictsRaised).toBe(0);

    const tasks = await request(server())
      .get(`/projects/${projectId}/tasks`)
      .set('Authorization', auth())
      .expect(200);
    const task = tasks.body.find((t: { externalId: string }) => t.externalId === 'PMH-4');
    expect(task.status).toBe('TERMINADA');
  });

  it('raises CONCURRENT_FIELD_EDIT when a UI edit and a document edit touch the same field, and still applies non-contested fields', async () => {
    const docsPath = createScratchDocsPath();
    writeFileSync(
      path.join(docsPath, 'Roadmap.md'),
      roadmapWithActiveRow('| PMH-5 | Original title | check | TODO | — | — |'),
      'utf-8',
    );
    const projectId = await createProjectAt(docsPath);
    await request(server()).post(`/projects/${projectId}/sync`).set('Authorization', auth()).expect(201);

    const tasksBefore = await request(server())
      .get(`/projects/${projectId}/tasks`)
      .set('Authorization', auth())
      .expect(200);
    const task = tasksBefore.body.find((t: { externalId: string }) => t.externalId === 'PMH-5');

    // A UI-origin transition changes `status` — the one field the document
    // is about to change too, on the same task.
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

    // The document independently changes both status AND acceptanceCheck.
    writeFileSync(
      path.join(docsPath, 'Roadmap.md'),
      roadmapWithActiveRow('| PMH-5 | Original title | updated acceptance | IN_PROGRESS | — | — |'),
      'utf-8',
    );

    const syncRun = await request(server())
      .post(`/projects/${projectId}/sync`)
      .set('Authorization', auth())
      .expect(201);
    expect(syncRun.body.summary.conflictsRaised).toBe(1);

    const after = await request(server())
      .get(`/projects/${projectId}/tasks/${task.id}`)
      .set('Authorization', auth())
      .expect(200);
    // status was contested — the UI's ASIGNADA wins, not overwritten silently.
    expect(after.body.status).toBe('ASIGNADA');
    // acceptanceCriteria was NOT contested — applied normally.
    expect(after.body.acceptanceCriteria).toBe('updated acceptance');
  });

  it('keeps a UI title edit (no overwrite, no conflict) while the Roadmap row itself is unchanged', async () => {
    const docsPath = createScratchDocsPath();
    writeFileSync(
      path.join(docsPath, 'Roadmap.md'),
      roadmapWithActiveRow('| PMH-6 | Doc title | check | TODO | — | — |'),
      'utf-8',
    );
    const projectId = await createProjectAt(docsPath);
    await request(server()).post(`/projects/${projectId}/sync`).set('Authorization', auth()).expect(201);
    const tasks = await request(server())
      .get(`/projects/${projectId}/tasks`)
      .set('Authorization', auth())
      .expect(200);
    const task = tasks.body.find((t: { externalId: string }) => t.externalId === 'PMH-6');

    await request(server())
      .patch(`/projects/${projectId}/tasks/${task.id}`)
      .set('Authorization', auth())
      .send({ title: 'UI title' })
      .expect(200);

    // The document never changed since the last sync, so there is nothing
    // external to reconcile — the local edit must simply stand.
    const syncRun = await request(server())
      .post(`/projects/${projectId}/sync`)
      .set('Authorization', auth())
      .expect(201);
    expect(syncRun.body.summary.conflictsRaised).toBe(0);

    const after = await request(server())
      .get(`/projects/${projectId}/tasks/${task.id}`)
      .set('Authorization', auth())
      .expect(200);
    expect(after.body.title).toBe('UI title');
  });

  it('raises CONCURRENT_FIELD_EDIT exactly once when a UI PATCH and a document edit touch the same field', async () => {
    const docsPath = createScratchDocsPath();
    writeFileSync(
      path.join(docsPath, 'Roadmap.md'),
      roadmapWithActiveRow('| PMH-7 | Doc title | check | TODO | — | — |'),
      'utf-8',
    );
    const projectId = await createProjectAt(docsPath);
    await request(server()).post(`/projects/${projectId}/sync`).set('Authorization', auth()).expect(201);
    const tasks = await request(server())
      .get(`/projects/${projectId}/tasks`)
      .set('Authorization', auth())
      .expect(200);
    const task = tasks.body.find((t: { externalId: string }) => t.externalId === 'PMH-7');

    await request(server())
      .patch(`/projects/${projectId}/tasks/${task.id}`)
      .set('Authorization', auth())
      .send({ title: 'UI title' })
      .expect(200);
    writeFileSync(
      path.join(docsPath, 'Roadmap.md'),
      roadmapWithActiveRow('| PMH-7 | Doc title v2 | check | TODO | — | — |'),
      'utf-8',
    );

    const firstSync = await request(server())
      .post(`/projects/${projectId}/sync`)
      .set('Authorization', auth())
      .expect(201);
    expect(firstSync.body.summary.conflictsRaised).toBe(1);

    const after = await request(server())
      .get(`/projects/${projectId}/tasks/${task.id}`)
      .set('Authorization', auth())
      .expect(200);
    expect(after.body.title).toBe('UI title');

    // Same document, same contested edit — already surfaced, not re-raised.
    const secondSync = await request(server())
      .post(`/projects/${projectId}/sync`)
      .set('Authorization', auth())
      .expect(201);
    expect(secondSync.body.summary.conflictsRaised).toBe(0);
  });

  it('records a real write-back: creating a task appends a CREATED Agentslog entry and a Roadmap row', async () => {
    const docsPath = createScratchDocsPath();
    const projectId = await createProjectAt(docsPath);

    const task = await request(server())
      .post(`/projects/${projectId}/tasks`)
      .set('Authorization', auth())
      .send({ title: 'Written back task' })
      .expect(201);
    expect(task.body.externalId).toMatch(/^PMH-\d+$/);

    const roadmap = readFileSync(path.join(docsPath, 'Roadmap.md'), 'utf-8');
    const agentslog = readFileSync(path.join(docsPath, 'Agentslog.md'), 'utf-8');
    expect(roadmap).toContain(task.body.externalId);
    expect(roadmap).toContain('Written back task');
    expect(agentslog).toContain(`| ${task.body.externalId} | CREATED`);
  });
});
