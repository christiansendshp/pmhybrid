import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { DEMO_EMAIL, DEMO_PASSWORD } from './../prisma/demo-credentials.js';
import { createScratchDocsPath } from './helpers/scratch-docs.js';

function entry(id: string, title: string, status = 'READY'): string {
  return [
    `### ${id} — Entry`,
    '',
    '```yaml',
    `id: ${id}`,
    'type: TASK',
    `title: ${title}`,
    `status: ${status}`,
    '```',
    '',
  ].join('\n');
}

function roadmap(...entries: string[]): string {
  return ['# Roadmap', '', '## Plan', '', ...entries].join('\n');
}

/** The real failure: an unquoted ": " inside a title makes the entry's YAML invalid. */
const BROKEN_TITLE = 'Contradicción SuperAdmin: código vs. spec';
const FIXED_TITLE = '"Contradicción SuperAdmin: código vs. spec"';

/**
 * One invalid Roadmap entry used to fail the whole sync — every run of the
 * user's real project failed for one unquoted colon — and the error was a
 * multi-line yaml code frame behind a bare 500 (Roadmap BUG-05). Now the
 * entry is isolated: everything else still reconciles, its own task is left
 * alone, and the run says which entry to fix.
 */
describe('Roadmap entries that cannot be read (e2e, Roadmap BUG-05)', () => {
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
  const auth = (token = ownerToken) => `Bearer ${token}`;
  const unique = (label: string) =>
    `${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

  async function createProject(docsPath: string) {
    const res = await request(server())
      .post('/projects')
      .set('Authorization', auth())
      .send({ name: unique('Entry errors E2E'), docsPath })
      .expect(201);
    return res.body.id as string;
  }

  async function createMember(projectId: string) {
    const email = `${unique('entry-member')}@pmhybrid.local`;
    const created = await request(server())
      .post('/users')
      .set('Authorization', auth())
      .send({ displayName: 'Entry tester', email, password: 'password123' })
      .expect(201);
    await request(server())
      .post(`/projects/${projectId}/members`)
      .set('Authorization', auth())
      .send({ actorId: created.body.id })
      .expect(201);
    const login = await request(server())
      .post('/auth/login')
      .send({ email, password: 'password123' })
      .expect(200);
    return login.body.accessToken as string;
  }

  const sync = (projectId: string) =>
    request(server())
      .post(`/projects/${projectId}/sync`)
      .set('Authorization', auth());

  async function tasksByExternalId(projectId: string) {
    const res = await request(server())
      .get(`/projects/${projectId}/tasks`)
      .set('Authorization', auth())
      .expect(200);
    return new Map<string, { id: string; title: string; status: string }>(
      res.body.map((task: { externalId: string }) => [task.externalId, task]),
    );
  }

  async function notificationsOf(token: string, type: string) {
    const res = await request(server())
      .get('/notifications')
      .set('Authorization', auth(token))
      .expect(200);
    return res.body.filter((n: { type: string }) => n.type === type);
  }

  it('reconciles everything else, leaves the unreadable entry’s task alone, and names the entry', async () => {
    const docsPath = createScratchDocsPath();
    const file = path.join(docsPath, 'Roadmap.md');
    writeFileSync(
      file,
      roadmap(
        entry('ENT-1', 'First'),
        entry('F1-T104', FIXED_TITLE),
        entry('ENT-3', 'Third'),
      ),
      'utf-8',
    );
    const projectId = await createProject(docsPath);
    const first = await sync(projectId).expect(201);
    expect(first.body.status).toBe('SUCCESS');
    expect(first.body.summary.entryErrors).toEqual([]);

    const beforeBreak = (await tasksByExternalId(projectId)).get('F1-T104')!;

    // The entry breaks; the others change in the same edit.
    writeFileSync(
      file,
      roadmap(
        entry('ENT-1', 'First, renamed'),
        entry('F1-T104', BROKEN_TITLE),
        entry('ENT-3', 'Third', 'IN_PROGRESS'),
      ),
      'utf-8',
    );
    const second = await sync(projectId).expect(201);

    expect(second.body.status).toBe('PARTIAL');
    expect(second.body.summary.entryErrors).toHaveLength(1);
    const [error] = second.body.summary.entryErrors;
    expect(error.id).toBe('F1-T104');
    expect(error.reason).toMatch(/Nested mappings/);
    expect(error.reason).not.toContain('\n');
    // The line points at the offending title line in the file.
    expect(readFileSync(file, 'utf-8').split('\n')[error.line - 1]).toContain(
      'title: Contradicción SuperAdmin:',
    );

    // Not swept as a disappeared row: nothing completed, no conflict.
    expect(second.body.summary.completedViaRemoval).toBe(0);
    expect(second.body.summary.conflictsRaised).toBe(0);
    const conflicts = await request(server())
      .get(`/projects/${projectId}/conflicts`)
      .set('Authorization', auth())
      .expect(200);
    expect(conflicts.body).toEqual([]);

    const tasks = await tasksByExternalId(projectId);
    expect(tasks.get('F1-T104')).toMatchObject({
      id: beforeBreak.id,
      title: 'Contradicción SuperAdmin: código vs. spec',
      status: beforeBreak.status,
    });
    expect(beforeBreak.status).not.toBe('TERMINADA');
    // The rest of the document did reconcile.
    expect(tasks.get('ENT-1')?.title).toBe('First, renamed');
    expect(tasks.get('ENT-3')?.status).toBe('EN_DESARROLLO');

    // The document read endpoints are tolerant too, and name the entry.
    const issues = await request(server())
      .get(`/projects/${projectId}/documents/roadmap/issues`)
      .set('Authorization', auth())
      .expect(200);
    expect(issues.body).toEqual([
      { id: 'F1-T104', line: error.line, reason: error.reason },
    ]);
    const structured = await request(server())
      .get(`/projects/${projectId}/documents/roadmap/structured`)
      .set('Authorization', auth())
      .expect(200);
    expect(
      structured.body.map((row: { externalId: string }) => row.externalId),
    ).toEqual(['ENT-1', 'ENT-3']);

    // Fixing the entry clears it: the next run is SUCCESS again.
    writeFileSync(
      file,
      roadmap(
        entry('ENT-1', 'First, renamed'),
        entry('F1-T104', FIXED_TITLE),
        entry('ENT-3', 'Third', 'IN_PROGRESS'),
      ),
      'utf-8',
    );
    const third = await sync(projectId).expect(201);
    expect(third.body.status).toBe('SUCCESS');
    expect(third.body.summary.entryErrors).toEqual([]);
  });

  it('tells the other members once per change, not on every run', async () => {
    const docsPath = createScratchDocsPath();
    const file = path.join(docsPath, 'Roadmap.md');
    writeFileSync(
      file,
      roadmap(entry('ENT-1', 'First'), entry('F1-T104', BROKEN_TITLE)),
      'utf-8',
    );
    const projectId = await createProject(docsPath);
    const member = await createMember(projectId);

    const firstRun = await sync(projectId).expect(201);
    const notified = await notificationsOf(member, 'ROADMAP_ENTRIES_INVALID');
    expect(notified).toHaveLength(1);
    expect(notified[0].payload).toMatchObject({
      syncRunId: firstRun.body.id,
      count: 1,
    });
    expect(notified[0].payload.entries[0].id).toBe('F1-T104');

    // The same entry, still broken for the same reason: no second notification.
    await sync(projectId).expect(201);
    await sync(projectId).expect(201);
    expect(
      await notificationsOf(member, 'ROADMAP_ENTRIES_INVALID'),
    ).toHaveLength(1);

    // Fixed, then broken again: that is news.
    writeFileSync(
      file,
      roadmap(entry('ENT-1', 'First'), entry('F1-T104', FIXED_TITLE)),
      'utf-8',
    );
    await sync(projectId).expect(201);
    writeFileSync(
      file,
      roadmap(entry('ENT-1', 'First'), entry('F1-T104', BROKEN_TITLE)),
      'utf-8',
    );
    await sync(projectId).expect(201);
    expect(
      await notificationsOf(member, 'ROADMAP_ENTRIES_INVALID'),
    ).toHaveLength(2);
  });

  it('still lets a write-back edit another task while one entry is unreadable', async () => {
    const docsPath = createScratchDocsPath();
    const file = path.join(docsPath, 'Roadmap.md');
    writeFileSync(
      file,
      roadmap(entry('ENT-1', 'First'), entry('F1-T104', FIXED_TITLE)),
      'utf-8',
    );
    const projectId = await createProject(docsPath);
    await sync(projectId).expect(201);
    writeFileSync(
      file,
      roadmap(entry('ENT-1', 'First'), entry('F1-T104', BROKEN_TITLE)),
      'utf-8',
    );
    await sync(projectId).expect(201);

    const tasks = await tasksByExternalId(projectId);
    await request(server())
      .patch(`/projects/${projectId}/tasks/${tasks.get('ENT-1')!.id}`)
      .set('Authorization', auth())
      .send({ title: 'First, edited in PM Hub' })
      .expect(200);

    const written = readFileSync(file, 'utf-8');
    expect(written).toContain('title: First, edited in PM Hub');
    // The unreadable entry is byte-for-byte what it was.
    expect(written).toContain(`title: ${BROKEN_TITLE}`);
  });

  it('answers a malformed document with a readable 422, persists the failure, and does not repeat the notification', async () => {
    const docsPath = createScratchDocsPath();
    writeFileSync(
      path.join(docsPath, 'Roadmap.md'),
      '### ENT-1 — Broken\n\n```yaml\nid: ENT-1\ntype: TASK\nstatus: READY\n',
      'utf-8',
    );
    const projectId = await createProject(docsPath);
    const member = await createMember(projectId);

    const failed = await sync(projectId).expect(422);
    expect(failed.body.message).toMatch(/unterminated/);
    expect(failed.body.message).not.toContain(docsPath);
    await sync(projectId).expect(422);

    const runs = await request(server())
      .get(`/projects/${projectId}/sync-runs`)
      .set('Authorization', auth())
      .expect(200);
    expect(runs.body).toHaveLength(2);
    for (const run of runs.body) {
      expect(run.status).toBe('FAILED');
      expect(run.summary.error).toMatch(/unterminated/);
      expect(run.summary.error).not.toContain('\n');
    }

    // The same failure twice is one piece of news.
    expect(await notificationsOf(member, 'SYNC_FAILED')).toHaveLength(1);

    // The read endpoints refuse it the same readable way rather than crashing.
    await request(server())
      .get(`/projects/${projectId}/documents/roadmap/structured`)
      .set('Authorization', auth())
      .expect(422);
  });
});
