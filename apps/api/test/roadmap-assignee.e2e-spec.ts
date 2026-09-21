import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { DEMO_EMAIL, DEMO_PASSWORD } from './../prisma/demo-credentials.js';
import { createScratchDocsPath } from './helpers/scratch-docs.js';

function entry(id: string, lines: string[]): string {
  return [
    `### ${id} — Entry`,
    '',
    '```yaml',
    `id: ${id}`,
    'type: TASK',
    `title: Title of ${id}`,
    ...lines,
    '```',
    '',
  ].join('\n');
}

function roadmap(...entries: string[]): string {
  return ['# Roadmap', '', '## Plan', '', ...entries].join('\n');
}

const agentOf = (name: string) => [
  'status: READY',
  'executor: AI',
  `assigned_agent: ${name}`,
];
const humanOf = (name: string) => [
  'status: READY',
  'owner:',
  '  type: HUMAN',
  `  name: ${name}`,
];

/**
 * The document's owner used to be stored as raw text only, so Kanban and
 * Workload never saw what an agent claims in the document, and an assignment
 * made in PM Hub never reached it (Roadmap GAP-35a). Now the owner resolves
 * to a project member, and every assignment is written back as one owner form.
 */
describe('Owner and assignee round trip (e2e, Roadmap GAP-35a)', () => {
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
      .send({ name: unique('Assignee E2E'), docsPath })
      .expect(201);
    return res.body.id as string;
  }

  async function addMember(projectId: string, actorId: string) {
    await request(server())
      .post(`/projects/${projectId}/members`)
      .set('Authorization', auth())
      .send({ actorId })
      .expect(201);
  }

  async function createPerson(projectId: string | null, displayName: string) {
    const created = await request(server())
      .post('/users')
      .set('Authorization', auth())
      .send({
        displayName,
        email: `${unique('assignee').replace(/\s/g, '')}@pmhybrid.local`,
        password: 'password123',
      })
      .expect(201);
    if (projectId) {
      await addMember(projectId, created.body.id);
    }
    return created.body.id as string;
  }

  async function createAgent(projectId: string, displayName: string) {
    const created = await request(server())
      .post('/agents')
      .set('Authorization', auth())
      .send({ displayName, providerType: 'custom' })
      .expect(201);
    await addMember(projectId, created.body.id);
    return created.body.id as string;
  }

  const sync = (projectId: string) =>
    request(server())
      .post(`/projects/${projectId}/sync`)
      .set('Authorization', auth());

  async function taskOf(projectId: string, externalId: string) {
    const res = await request(server())
      .get(`/projects/${projectId}/tasks`)
      .set('Authorization', auth())
      .expect(200);
    const task = res.body.find(
      (candidate: { externalId: string }) =>
        candidate.externalId === externalId,
    );
    if (!task) {
      throw new Error(`No task ${externalId}`);
    }
    return task as {
      id: string;
      assigneeActorId: string | null;
      status: string;
    };
  }

  async function assign(projectId: string, taskId: string, actorId: string) {
    return request(server())
      .post(`/projects/${projectId}/tasks/${taskId}/assign`)
      .set('Authorization', auth())
      .send({ actorId });
  }

  function entryData(file: string, id: string): Record<string, unknown> {
    const text = readFileSync(file, 'utf-8');
    const start = text.indexOf(`id: ${id}\n`);
    const end = text.indexOf('```', start);
    // A tiny reader is enough here: the block's own lines, keyed by their first-level key.
    const data: Record<string, unknown> = {};
    for (const line of text.slice(start, end).split('\n')) {
      const match = /^(\w+): ?(.*)$/.exec(line);
      if (match) {
        data[match[1]] = match[2];
      }
    }
    return data;
  }

  it('resolves the document owner to a member, on create and once the member exists, and never picks among several', async () => {
    const docsPath = createScratchDocsPath();
    const file = path.join(docsPath, 'Roadmap.md');
    const projectId = await createProject(docsPath);
    const agentName = unique('Agent');
    const anaName = unique('Ana');
    const twinName = unique('Twin');
    const latecomerName = unique('Latecomer');
    const agentId = await createAgent(projectId, agentName);
    const anaId = await createPerson(projectId, anaName);
    await createPerson(projectId, twinName);
    await createPerson(projectId, twinName);
    writeFileSync(
      file,
      roadmap(
        entry('OWN-1', agentOf(agentName.toLowerCase())),
        entry('OWN-2', humanOf(anaName)),
        entry('OWN-3', humanOf('Nobody At All')),
        entry('OWN-4', humanOf(twinName)),
        entry('OWN-5', humanOf(latecomerName)),
      ),
      'utf-8',
    );

    const first = await sync(projectId).expect(201);

    expect((await taskOf(projectId, 'OWN-1')).assigneeActorId).toBe(agentId);
    expect((await taskOf(projectId, 'OWN-2')).assigneeActorId).toBe(anaId);
    // No match, or two matches: nobody is picked, and the run is not failed for it.
    expect((await taskOf(projectId, 'OWN-3')).assigneeActorId).toBeNull();
    expect((await taskOf(projectId, 'OWN-4')).assigneeActorId).toBeNull();
    expect(first.body.summary.assigneesUpdated).toBe(2);
    expect(first.body.status).toBe('SUCCESS');

    // The member the document already names joins later: the next sync picks
    // it up although the row itself did not change.
    const latecomerId = await createPerson(projectId, latecomerName);
    const second = await sync(projectId).expect(201);
    expect((await taskOf(projectId, 'OWN-5')).assigneeActorId).toBe(
      latecomerId,
    );
    expect(second.body.summary.assigneesUpdated).toBe(1);
  });

  it('writes an assignment made in PM Hub to the document as one owner form, without an Agentslog entry', async () => {
    const docsPath = createScratchDocsPath();
    const file = path.join(docsPath, 'Roadmap.md');
    const log = path.join(docsPath, 'Agentslog.md');
    const projectId = await createProject(docsPath);
    const agentName = unique('Agent');
    const anaName = unique('Ana');
    const agentId = await createAgent(projectId, agentName);
    const anaId = await createPerson(projectId, anaName);
    writeFileSync(file, roadmap(entry('OWN-1', agentOf(agentName))), 'utf-8');
    await sync(projectId).expect(201);
    const task = await taskOf(projectId, 'OWN-1');
    expect(task.assigneeActorId).toBe(agentId);
    const logBefore = readFileSync(log, 'utf-8');

    // Agent -> person: the agent form must go, or the next read hands the task back.
    await assign(projectId, task.id, anaId).then((res) =>
      expect(res.status).toBe(201),
    );
    let data = entryData(file, 'OWN-1');
    expect(data.executor).toBe('HUMAN');
    expect(data.assigned_agent).toBeUndefined();
    expect(readFileSync(file, 'utf-8')).toContain(`name: ${anaName}`);
    expect(readFileSync(log, 'utf-8')).toBe(logBefore);

    // An unrelated edit of the same entry afterwards is no conflict and no reassignment.
    writeFileSync(
      file,
      readFileSync(file, 'utf-8').replace(
        'title: Title of OWN-1',
        'title: Renamed in the document',
      ),
      'utf-8',
    );
    const unrelated = await sync(projectId).expect(201);
    expect(unrelated.body.summary.conflictsRaised).toBe(0);
    expect((await taskOf(projectId, 'OWN-1')).assigneeActorId).toBe(anaId);

    // Person -> agent again.
    await assign(projectId, task.id, agentId).then((res) =>
      expect(res.status).toBe(201),
    );
    data = entryData(file, 'OWN-1');
    expect(data.executor).toBe('AI');
    expect(data.assigned_agent).toBe(agentName);
    const settled = await sync(projectId).expect(201);
    expect(settled.body.summary.conflictsRaised).toBe(0);
    expect((await taskOf(projectId, 'OWN-1')).assigneeActorId).toBe(agentId);
  });

  it('applies a document-side owner change, even to a task that is EN_DESARROLLO', async () => {
    const docsPath = createScratchDocsPath();
    const file = path.join(docsPath, 'Roadmap.md');
    const projectId = await createProject(docsPath);
    const firstName = unique('Agent');
    const secondName = unique('Agent');
    await createAgent(projectId, firstName);
    const secondId = await createAgent(projectId, secondName);
    const inProgress = (name: string) => [
      'status: IN_PROGRESS',
      'executor: AI',
      `assigned_agent: ${name}`,
    ];
    writeFileSync(
      file,
      roadmap(entry('OWN-1', inProgress(firstName))),
      'utf-8',
    );
    await sync(projectId).expect(201);
    expect((await taskOf(projectId, 'OWN-1')).status).toBe('EN_DESARROLLO');

    writeFileSync(
      file,
      roadmap(entry('OWN-1', inProgress(secondName))),
      'utf-8',
    );
    const run = await sync(projectId).expect(201);

    expect((await taskOf(projectId, 'OWN-1')).assigneeActorId).toBe(secondId);
    expect(run.body.summary.assigneesUpdated).toBe(1);
    expect(run.body.summary.conflictsRaised).toBe(0);
  });

  it('lets an agent take over in the document a task that was assigned in PM Hub, without a conflict', async () => {
    const docsPath = createScratchDocsPath();
    const file = path.join(docsPath, 'Roadmap.md');
    const projectId = await createProject(docsPath);
    const aName = unique('Ana');
    const bName = unique('Berta');
    const agentName = unique('Agent');
    await createPerson(projectId, aName);
    const bId = await createPerson(projectId, bName);
    const agentId = await createAgent(projectId, agentName);
    writeFileSync(file, roadmap(entry('OWN-1', humanOf(aName))), 'utf-8');
    await sync(projectId).expect(201);
    const task = await taskOf(projectId, 'OWN-1');

    // PM Hub assigns Berta and the document reflects it...
    await assign(projectId, task.id, bId).then((res) =>
      expect(res.status).toBe(201),
    );
    expect(readFileSync(file, 'utf-8')).toContain(`name: ${bName}`);
    // ...then an agent claims the task by editing the document.
    writeFileSync(
      file,
      readFileSync(file, 'utf-8').replace(
        'executor: HUMAN',
        `executor: AI
assigned_agent: ${agentName}`,
      ),
      'utf-8',
    );
    const run = await sync(projectId).expect(201);

    expect(run.body.summary.conflictsRaised).toBe(0);
    expect(run.body.summary.assigneesUpdated).toBe(1);
    expect((await taskOf(projectId, 'OWN-1')).assigneeActorId).toBe(agentId);
  });

  it('raises a conflict when the document and PM Hub both changed the assignee, and resolving it assigns properly', async () => {
    const docsPath = createScratchDocsPath();
    const file = path.join(docsPath, 'Roadmap.md');
    const projectId = await createProject(docsPath);
    const aName = unique('Ana');
    const bName = unique('Berta');
    const cName = unique('Carla');
    await createPerson(projectId, aName);
    const bId = await createPerson(projectId, bName);
    const cId = await createPerson(projectId, cName);
    writeFileSync(file, roadmap(entry('OWN-1', humanOf(aName))), 'utf-8');
    await sync(projectId).expect(201);
    const task = await taskOf(projectId, 'OWN-1');

    // The document hands the task to Carla while PM Hub hands it to Berta.
    writeFileSync(file, roadmap(entry('OWN-1', humanOf(cName))), 'utf-8');
    await assign(projectId, task.id, bId).then((res) =>
      expect(res.status).toBe(201),
    );
    // The document had drifted, so PM Hub did not overwrite Carla in it.
    expect(readFileSync(file, 'utf-8')).toContain(`name: ${cName}`);

    const run = await sync(projectId).expect(201);
    expect(run.body.summary.conflictsRaised).toBe(1);
    expect(run.body.status).toBe('PARTIAL');
    expect((await taskOf(projectId, 'OWN-1')).assigneeActorId).toBe(bId);

    const conflicts = await request(server())
      .get(`/projects/${projectId}/conflicts?resolved=false`)
      .set('Authorization', auth())
      .expect(200);
    expect(conflicts.body).toHaveLength(1);
    expect(conflicts.body[0].externalVersion).toEqual({ assigneeActorId: cId });

    await request(server())
      .post(`/projects/${projectId}/conflicts/${conflicts.body[0].id}/resolve`)
      .set('Authorization', auth())
      .send({ strategy: 'KEEP_EXTERNAL' })
      .expect(201);
    expect((await taskOf(projectId, 'OWN-1')).assigneeActorId).toBe(cId);

    // The same document owner on the next sync is not a new conflict.
    const again = await sync(projectId).expect(201);
    expect(again.body.summary.conflictsRaised).toBe(0);
  });
});
