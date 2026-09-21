import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { DEMO_EMAIL, DEMO_PASSWORD } from './../prisma/demo-credentials.js';
import { createScratchDocsPath } from './helpers/scratch-docs.js';

function entry(id: string, status: string, extra: string[] = []): string {
  return [
    `### ${id} — Entry`,
    '',
    '```yaml',
    `id: ${id}`,
    'type: TASK',
    `title: Title of ${id}`,
    `status: ${status}`,
    ...extra,
    '```',
    '',
  ].join('\n');
}

function roadmap(...entries: string[]): string {
  return ['# Roadmap', '', '## Plan', '', ...entries].join('\n');
}

const dependsOn = (...ids: string[]) => [
  'depends_on:',
  ...ids.map((id) => `  - ${id}`),
];

/**
 * Sync only ever added dependencies, so one the document dropped stayed
 * forever, and every write-back rewrote a CRLF file as LF (Roadmap GAP-35e).
 */
describe('Dependency removal and line endings (e2e, Roadmap GAP-35e)', () => {
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
      .send({
        name: `Dep removal E2E ${Date.now()}-${Math.random()}`,
        docsPath,
      })
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
    const summary = list.body.find(
      (t: { externalId: string }) => t.externalId === externalId,
    );
    const full = await request(server())
      .get(`/projects/${projectId}/tasks/${summary.id}`)
      .set('Authorization', auth())
      .expect(200);
    return full.body as {
      id: string;
      dependencies: { dependsOnTaskId: string | null }[];
    };
  }

  it('removes a dependency the document listed and then dropped, and keeps the ones still listed', async () => {
    const docsPath = createScratchDocsPath();
    const file = path.join(docsPath, 'Roadmap.md');
    const both = roadmap(
      entry('DEP-B', 'READY'),
      entry('DEP-C', 'READY'),
      entry('DEP-A', 'READY', dependsOn('DEP-B', 'DEP-C')),
    );
    writeFileSync(file, both, 'utf-8');
    const projectId = await createProject(docsPath);
    await sync(projectId).expect(201);
    expect((await taskOf(projectId, 'DEP-A')).dependencies).toHaveLength(2);

    writeFileSync(
      file,
      roadmap(
        entry('DEP-B', 'READY'),
        entry('DEP-C', 'READY'),
        entry('DEP-A', 'READY', dependsOn('DEP-C')),
      ),
      'utf-8',
    );
    const run = await sync(projectId).expect(201);

    expect(run.body.summary.dependenciesRemoved).toBe(1);
    const c = await taskOf(projectId, 'DEP-C');
    expect(
      (await taskOf(projectId, 'DEP-A')).dependencies.map(
        (d) => d.dependsOnTaskId,
      ),
    ).toEqual([c.id]);

    // All of them dropped.
    writeFileSync(
      file,
      roadmap(
        entry('DEP-B', 'READY'),
        entry('DEP-C', 'READY'),
        entry('DEP-A', 'READY'),
      ),
      'utf-8',
    );
    const last = await sync(projectId).expect(201);
    expect(last.body.summary.dependenciesRemoved).toBe(1);
    expect((await taskOf(projectId, 'DEP-A')).dependencies).toEqual([]);
  });

  it('also removes a dependency added in PM Hub once the document has listed it', async () => {
    const docsPath = createScratchDocsPath();
    const file = path.join(docsPath, 'Roadmap.md');
    writeFileSync(
      file,
      roadmap(entry('DEP-B', 'READY'), entry('DEP-A', 'READY')),
      'utf-8',
    );
    const projectId = await createProject(docsPath);
    await sync(projectId).expect(201);
    const a = await taskOf(projectId, 'DEP-A');
    const b = await taskOf(projectId, 'DEP-B');

    await request(server())
      .post(`/projects/${projectId}/tasks/${a.id}/dependencies`)
      .set('Authorization', auth())
      .send({ dependsOnTaskId: b.id })
      .expect(201);
    // The write-back put it in the document...
    expect(readFileSync(file, 'utf-8')).toContain('- DEP-B');
    // ...so when someone takes it out of the document, it goes here too.
    writeFileSync(
      file,
      readFileSync(file, 'utf-8').replace(/depends_on:\n\s+- DEP-B\n/, ''),
      'utf-8',
    );
    const run = await sync(projectId).expect(201);

    expect(run.body.summary.dependenciesRemoved).toBe(1);
    expect((await taskOf(projectId, 'DEP-A')).dependencies).toEqual([]);
  });

  it('never removes a dependency the document never listed: a Blocked row has no Depends on cell', async () => {
    const docsPath = createScratchDocsPath();
    const file = path.join(docsPath, 'Roadmap.md');
    const oldFormat = (blockedRow: string, activeRows: string[]) =>
      [
        '# Roadmap',
        '',
        '## Active work',
        '',
        '| ID | Outcome | Acceptance check | Status | Owner | Depends on |',
        '| --- | --- | --- | --- | --- | --- |',
        ...activeRows,
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
        blockedRow,
        '',
      ].join('\n');
    writeFileSync(
      file,
      oldFormat('| PMH-A | waiting | a decision | — |', [
        '| PMH-B | Base | check | TODO | — | — |',
      ]),
      'utf-8',
    );
    const projectId = await createProject(docsPath);
    await sync(projectId).expect(201);
    const a = await taskOf(projectId, 'PMH-A');
    const b = await taskOf(projectId, 'PMH-B');

    // Added while the row sits in the Blocked table: there is nowhere to write it.
    await request(server())
      .post(`/projects/${projectId}/tasks/${a.id}/dependencies`)
      .set('Authorization', auth())
      .send({ dependsOnTaskId: b.id })
      .expect(201);
    expect(
      (await sync(projectId).expect(201)).body.summary.dependenciesRemoved,
    ).toBe(0);

    // The row moves to Active work listing nothing: the document never listed it, so it stays.
    writeFileSync(
      file,
      oldFormat('| — | — | — | — |', [
        '| PMH-A | Now active | check | TODO | — | — |',
        '| PMH-B | Base | check | TODO | — | — |',
      ]),
      'utf-8',
    );
    const run = await sync(projectId).expect(201);

    expect(run.body.summary.dependenciesRemoved).toBe(0);
    expect((await taskOf(projectId, 'PMH-A')).dependencies).toHaveLength(1);
  });

  it('never removes what an unreadable entry depended on', async () => {
    const docsPath = createScratchDocsPath();
    const file = path.join(docsPath, 'Roadmap.md');
    writeFileSync(
      file,
      roadmap(
        entry('DEP-B', 'READY'),
        entry('DEP-Z', 'READY', dependsOn('DEP-B')),
      ),
      'utf-8',
    );
    const projectId = await createProject(docsPath);
    await sync(projectId).expect(201);
    expect((await taskOf(projectId, 'DEP-Z')).dependencies).toHaveLength(1);

    // DEP-Z's entry breaks (an unquoted colon): present but unreadable, so it says nothing about its dependencies.
    writeFileSync(
      file,
      roadmap(
        entry('DEP-B', 'READY'),
        entry('DEP-Z', 'READY', ['note: Broken: colon']),
      ),
      'utf-8',
    );
    const run = await sync(projectId).expect(201);

    expect(
      run.body.summary.entryErrors.map((e: { id: string }) => e.id),
    ).toEqual(['DEP-Z']);
    expect(run.body.summary.dependenciesRemoved).toBe(0);
    expect((await taskOf(projectId, 'DEP-Z')).dependencies).toHaveLength(1);
  });

  it('keeps a CRLF document CRLF through a write-back, changing only what was edited', async () => {
    const docsPath = createScratchDocsPath();
    const file = path.join(docsPath, 'Roadmap.md');
    const log = path.join(docsPath, 'Agentslog.md');
    const crlf = (text: string) => text.replace(/\r?\n/g, '\r\n');
    const original = crlf(
      roadmap(entry('EOL-1', 'READY'), entry('EOL-2', 'READY')),
    );
    writeFileSync(file, original, 'utf-8');
    writeFileSync(log, crlf('# Agents log\n\n## Entries\n'), 'utf-8');
    const projectId = await createProject(docsPath);
    await sync(projectId).expect(201);
    const task = await taskOf(projectId, 'EOL-1');

    // A lifecycle write-back (Roadmap + Agentslog) and a field edit.
    await request(server())
      .post(`/projects/${projectId}/tasks/${task.id}/transition`)
      .set('Authorization', auth())
      .send({ status: 'EN_DESARROLLO' })
      .expect((res) => {
        if (res.status >= 500)
          throw new Error(`transition failed: ${res.status}`);
      });
    await request(server())
      .patch(`/projects/${projectId}/tasks/${task.id}`)
      .set('Authorization', auth())
      .send({ title: 'Edited in PM Hub' })
      .expect(200);

    for (const written of [
      readFileSync(file, 'utf-8'),
      readFileSync(log, 'utf-8'),
    ]) {
      expect(/(?<!\r)\n/.test(written)).toBe(false);
    }
    // EOL-2's whole entry is byte-for-byte what it was.
    const untouched = crlf(entry('EOL-2', 'READY'));
    expect(readFileSync(file, 'utf-8')).toContain(untouched);
  });
});
