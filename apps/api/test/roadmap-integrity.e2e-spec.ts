import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { DEMO_EMAIL, DEMO_PASSWORD } from './../prisma/demo-credentials.js';
import { createScratchDocsPath } from './helpers/scratch-docs.js';

function entry(
  id: string,
  title: string,
  status: string,
  extra: string[] = [],
): string {
  return [
    `### ${id} — Entry`,
    '',
    '```yaml',
    `id: ${id}`,
    'type: TASK',
    `title: ${title}`,
    `status: ${status}`,
    ...extra,
    '```',
    '',
  ].join('\n');
}

function roadmap(...entries: string[]): string {
  return ['# Roadmap', '', '## Plan', '', ...entries].join('\n');
}

/**
 * Sync used to swallow a status token nobody knows (a new task silently
 * became PENDIENTE), keep the last of two entries with one id, lose a
 * BLOCKED entry's title, and never advance a Blocked row's recorded owner
 * (Roadmap GAP-35b).
 */
describe('Sync integrity of statuses, duplicate ids and blocked entries (e2e, Roadmap GAP-35b)', () => {
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
      .send({ name: unique('Integrity E2E'), docsPath })
      .expect(201);
    return res.body.id as string;
  }

  const sync = (projectId: string) =>
    request(server())
      .post(`/projects/${projectId}/sync`)
      .set('Authorization', auth());

  async function tasks(projectId: string) {
    const res = await request(server())
      .get(`/projects/${projectId}/tasks`)
      .set('Authorization', auth())
      .expect(200);
    return new Map<
      string,
      {
        id: string;
        title: string;
        status: string;
        assigneeActorId: string | null;
      }
    >(res.body.map((task: { externalId: string }) => [task.externalId, task]));
  }

  async function openConflicts(projectId: string) {
    const res = await request(server())
      .get(`/projects/${projectId}/conflicts?resolved=false`)
      .set('Authorization', auth())
      .expect(200);
    return res.body as {
      id: string;
      kind: string;
      localVersion: object;
      externalVersion: object;
    }[];
  }

  it('leaves the status alone and asks once when the document gives a status nobody knows', async () => {
    const docsPath = createScratchDocsPath();
    const file = path.join(docsPath, 'Roadmap.md');
    writeFileSync(
      file,
      roadmap(
        entry('ST-1', 'Odd from the start', 'WIP'),
        entry('ST-2', 'Fine', 'IN_PROGRESS'),
      ),
      'utf-8',
    );
    const projectId = await createProject(docsPath);

    const first = await sync(projectId).expect(201);

    // Created PENDIENTE — not a guess from the token — and the person is asked.
    expect((await tasks(projectId)).get('ST-1')?.status).toBe('PENDIENTE');
    expect(first.body.summary.conflictsRaised).toBe(1);
    expect(first.body.status).toBe('PARTIAL');
    const [conflict] = await openConflicts(projectId);
    expect(conflict.kind).toBe('UNRECOGNIZED_STATUS');
    expect(conflict.externalVersion).toEqual({ statusRaw: 'WIP' });

    // Neither the same row again nor an unrelated edit of it asks a second time.
    await sync(projectId).expect(201);
    writeFileSync(
      file,
      roadmap(
        entry('ST-1', 'Renamed', 'WIP'),
        entry('ST-2', 'Fine', 'IN_PROGRESS'),
      ),
      'utf-8',
    );
    const edited = await sync(projectId).expect(201);
    expect(edited.body.summary.conflictsRaised).toBe(0);
    expect(await openConflicts(projectId)).toHaveLength(1);

    // "Keep the document's version" has nothing to keep; choosing a status works.
    await request(server())
      .post(`/projects/${projectId}/conflicts/${conflict.id}/resolve`)
      .set('Authorization', auth())
      .send({ strategy: 'KEEP_EXTERNAL' })
      .expect(400);
    await request(server())
      .post(`/projects/${projectId}/conflicts/${conflict.id}/resolve`)
      .set('Authorization', auth())
      .send({ strategy: 'MANUAL_EDIT', manualValue: { status: 'QA' } })
      .expect(201);
    expect((await tasks(projectId)).get('ST-1')?.status).toBe('QA');
    expect(await openConflicts(projectId)).toHaveLength(0);
  });

  it('keeps an existing task’s status when its row changes to an unknown token, and ignores valid states with no Kanban column', async () => {
    const docsPath = createScratchDocsPath();
    const file = path.join(docsPath, 'Roadmap.md');
    writeFileSync(
      file,
      roadmap(
        entry('ST-1', 'Working', 'IN_PROGRESS'),
        entry('ST-2', 'An idea', 'READY'),
      ),
      'utf-8',
    );
    const projectId = await createProject(docsPath);
    await sync(projectId).expect(201);
    expect((await tasks(projectId)).get('ST-1')?.status).toBe('EN_DESARROLLO');

    // ST-1 becomes a typo, ST-2 a valid state PM Hub has no column for.
    writeFileSync(
      file,
      roadmap(
        entry('ST-1', 'Working', 'IN_PROGES'),
        entry('ST-2', 'An idea', 'IDEA'),
      ),
      'utf-8',
    );
    const run = await sync(projectId).expect(201);

    expect((await tasks(projectId)).get('ST-1')?.status).toBe('EN_DESARROLLO');
    expect(run.body.summary.conflictsRaised).toBe(1);
    const conflicts = await openConflicts(projectId);
    expect(conflicts.map((c) => c.kind)).toEqual(['UNRECOGNIZED_STATUS']);
    expect(conflicts[0].externalVersion).toEqual({ statusRaw: 'IN_PROGES' });
  });

  it('closes an unrecognized-status conflict once the row says a status the sync knows, even if the row did not change (Roadmap BUG-08)', async () => {
    const docsPath = createScratchDocsPath();
    writeFileSync(
      path.join(docsPath, 'Roadmap.md'),
      roadmap(
        entry('DEC-1', 'A decision', 'DECIDED'),
        entry('OK-1', 'Fine', 'READY'),
      ),
      'utf-8',
    );
    const projectId = await createProject(docsPath);
    // DECIDED is a DECISION entry's own state: read without any conflict.
    const first = await sync(projectId).expect(201);
    expect(first.body.summary.conflictsRaised).toBe(0);
    expect(await openConflicts(projectId)).toEqual([]);

    // A conflict raised while the sync did not know the word (an older build)
    // is still open; nothing in the document changes to make it stale.
    const task = (await tasks(projectId)).get('DEC-1')!;
    await app.get(PrismaService).conflict.create({
      data: {
        projectId,
        kind: 'UNRECOGNIZED_STATUS',
        entityType: 'Task',
        entityId: task.id,
        localVersion: { status: task.status },
        externalVersion: { statusRaw: 'DECIDED' },
      },
    });
    expect(await openConflicts(projectId)).toHaveLength(1);

    const run = await sync(projectId).expect(201);

    expect(run.body.summary.conflictsClosed).toBe(1);
    expect(await openConflicts(projectId)).toEqual([]);
  });

  it('imports none of the copies of a duplicated id, and protects the task that has it', async () => {
    const docsPath = createScratchDocsPath();
    const file = path.join(docsPath, 'Roadmap.md');
    writeFileSync(
      file,
      roadmap(
        entry('DUP-1', 'Only one', 'READY'),
        entry('OK-1', 'Fine', 'READY'),
      ),
      'utf-8',
    );
    const projectId = await createProject(docsPath);
    await sync(projectId).expect(201);
    const before = (await tasks(projectId)).get('DUP-1')!;

    writeFileSync(
      file,
      roadmap(
        entry('DUP-1', 'First copy', 'DONE'),
        entry('OK-1', 'Fine', 'READY'),
        entry('DUP-1', 'Second copy', 'READY'),
      ),
      'utf-8',
    );
    const run = await sync(projectId).expect(201);

    expect(run.body.status).toBe('PARTIAL');
    expect(
      run.body.summary.entryErrors.map((error: { id: string }) => error.id),
    ).toEqual(['DUP-1', 'DUP-1']);
    expect(run.body.summary.entryErrors[0].reason).toMatch(
      /^duplicate id, also defined at line \d+$/,
    );
    // Not swept, not completed by the DONE copy, not renamed by either.
    const after = (await tasks(projectId)).get('DUP-1')!;
    expect(after).toMatchObject({
      id: before.id,
      title: before.title,
      status: before.status,
    });
    expect(run.body.summary.completedViaRemoval).toBe(0);
    expect(await openConflicts(projectId)).toEqual([]);
  });

  it('keeps and updates the title of a blocked entry', async () => {
    const docsPath = createScratchDocsPath();
    const file = path.join(docsPath, 'Roadmap.md');
    const blocked = (title: string) =>
      entry('BLK-1', title, 'BLOCKED', ['blocked_by:', '  - DEC-7']);
    writeFileSync(file, roadmap(blocked('Waiting on legal')), 'utf-8');
    const projectId = await createProject(docsPath);

    await sync(projectId).expect(201);
    expect((await tasks(projectId)).get('BLK-1')?.title).toBe(
      'Waiting on legal',
    );

    writeFileSync(
      file,
      roadmap(blocked('Waiting on legal and finance')),
      'utf-8',
    );
    await sync(projectId).expect(201);
    expect((await tasks(projectId)).get('BLK-1')?.title).toBe(
      'Waiting on legal and finance',
    );
  });

  it('records a blocked row’s owner, so a contested assignee is not raised again on every sync', async () => {
    const docsPath = createScratchDocsPath();
    const file = path.join(docsPath, 'Roadmap.md');
    const projectId = await createProject(docsPath);
    const person = async (name: string) => {
      const created = await request(server())
        .post('/users')
        .set('Authorization', auth())
        .send({
          displayName: name,
          email: `${unique('blk').replace(/\s/g, '')}@pmhybrid.local`,
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
    const blockedTo = (name: string) =>
      roadmap(
        entry('BLK-1', 'Blocked', 'BLOCKED', [
          'blocked_by:',
          '  - DEC-7',
          'owner:',
          '  type: HUMAN',
          `  name: ${name}`,
        ]),
      );
    writeFileSync(file, blockedTo(aName), 'utf-8');
    await sync(projectId).expect(201);
    const task = (await tasks(projectId)).get('BLK-1')!;

    // The document hands the blocked task to Carla while PM Hub hands it to Berta.
    writeFileSync(file, blockedTo(cName), 'utf-8');
    await request(server())
      .post(`/projects/${projectId}/tasks/${task.id}/assign`)
      .set('Authorization', auth())
      .send({ actorId: bId })
      .expect(201);

    const first = await sync(projectId).expect(201);
    const second = await sync(projectId).expect(201);

    expect(first.body.summary.conflictsRaised).toBe(1);
    expect(second.body.summary.conflictsRaised).toBe(0);
    expect(await openConflicts(projectId)).toHaveLength(1);
  });
});
