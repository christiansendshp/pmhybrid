import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { DEMO_EMAIL, DEMO_PASSWORD } from './../prisma/demo-credentials.js';
import { createScratchDocsPath } from './helpers/scratch-docs.js';

const yamlEntry = (id: string, status: string, agent: string) =>
  [
    `### ${id} — Entry`,
    '',
    '```yaml',
    `id: ${id}`,
    'type: TASK',
    `title: Title of ${id}`,
    `status: ${status}`,
    'executor: AI',
    `assigned_agent: ${agent}`,
    '```',
    '',
  ].join('\n');

const yamlRoadmap = (...entries: string[]) =>
  ['# Roadmap', '', '## Plan', '', ...entries].join('\n');

const tableRoadmap = (...rows: string[]) =>
  [
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

const ledger = (...entries: { agent: string; task: string; word: string }[]) =>
  [
    '# Agents log',
    '',
    '## Entries',
    '',
    ...entries.flatMap((entry, index) => [
      `## [2026-10-13T10:0${index}:00Z] | ${entry.agent} | ${entry.task} | ${entry.word}`,
      '',
      '- Summary: s',
      '- Files: f',
      '- Verify: v',
      '- Follow-up: n',
      '',
    ]),
  ].join('\n');

/**
 * The owner of a Roadmap entry and the agent a ledger entry names resolve through the
 * ledger name and the aliases of the registered agents, never by a guess (Roadmap TASK-02).
 */
describe('Owners and ledger names through the aliases (e2e, Roadmap TASK-02)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
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
    prisma = moduleFixture.get(PrismaService);

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
  const unique = (label: string) =>
    `${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

  async function createProject(docsPath: string) {
    const res = await request(server())
      .post('/projects')
      .set('Authorization', auth())
      .send({ name: unique('Ledger link E2E'), docsPath })
      .expect(201);
    return res.body.id as string;
  }

  /** An agent that answers to a ledger name and an alias nobody else has. */
  async function createAgent(
    projectId: string | null,
    extra: Record<string, unknown> = {},
  ) {
    const ledgerName = unique('ledger');
    const alias = unique('alias');
    const created = await request(server())
      .post('/agents')
      .set('Authorization', auth())
      .send({
        displayName: unique('Agent'),
        providerType: 'custom',
        ledgerName,
        aliases: [alias],
        ...extra,
      })
      .expect(201);
    if (projectId) {
      await request(server())
        .post(`/projects/${projectId}/members`)
        .set('Authorization', auth())
        .send({ actorId: created.body.id })
        .expect(201);
    }
    return { id: created.body.id as string, ledgerName, alias };
  }

  const sync = (projectId: string) =>
    request(server())
      .post(`/projects/${projectId}/sync`)
      .set('Authorization', auth());

  const taskOf = (projectId: string, externalId: string) =>
    prisma.task.findFirstOrThrow({ where: { projectId, externalId } });

  const unresolved = async (projectId: string) =>
    (
      await request(server())
        .get(`/projects/${projectId}/unresolved-names`)
        .set('Authorization', auth())
        .expect(200)
    ).body as {
      ledgerNames: { name: string; events: number; reason: string }[];
      ownerNames: { name: string; tasks: number; reason: string }[];
    };

  describe('the owner of a Roadmap entry', () => {
    it('resolves through the ledger name and the alias, never picks for an unknown name, and writes nothing to the document', async () => {
      const docsPath = createScratchDocsPath();
      const file = path.join(docsPath, 'Roadmap.md');
      const projectId = await createProject(docsPath);
      const sonnet = await createAgent(projectId);
      const document = yamlRoadmap(
        yamlEntry('AL-1', 'READY', sonnet.alias.toUpperCase()),
        yamlEntry('AL-2', 'READY', ` ${sonnet.ledgerName} `),
        yamlEntry('AL-3', 'READY', 'Nobody At All'),
      );
      writeFileSync(file, document, 'utf-8');

      const run = await sync(projectId).expect(201);

      expect((await taskOf(projectId, 'AL-1')).assigneeActorId).toBe(sonnet.id);
      expect((await taskOf(projectId, 'AL-2')).assigneeActorId).toBe(sonnet.id);
      expect((await taskOf(projectId, 'AL-3')).assigneeActorId).toBeNull();
      expect(run.body.summary.assigneesUpdated).toBe(2);
      expect(run.body.status).toBe('SUCCESS');
      expect(readFileSync(file, 'utf-8')).toBe(document);
    });

    it('still applies a change of owner made in the document to a task in development, as it did before the aliases', async () => {
      const docsPath = createScratchDocsPath();
      const file = path.join(docsPath, 'Roadmap.md');
      const projectId = await createProject(docsPath);
      const first = await createAgent(projectId);
      const second = await createAgent(projectId);
      writeFileSync(
        file,
        yamlRoadmap(yamlEntry('AL-4', 'IN_PROGRESS', first.alias)),
        'utf-8',
      );
      await sync(projectId).expect(201);
      const started = await taskOf(projectId, 'AL-4');
      expect(started).toMatchObject({
        status: 'EN_DESARROLLO',
        assigneeActorId: first.id,
      });

      writeFileSync(
        file,
        yamlRoadmap(yamlEntry('AL-4', 'IN_PROGRESS', second.alias)),
        'utf-8',
      );
      const run = await sync(projectId).expect(201);

      expect(await taskOf(projectId, 'AL-4')).toMatchObject({
        status: 'EN_DESARROLLO',
        assigneeActorId: second.id,
      });
      expect(run.body.summary.conflictsRaised).toBe(0);
    });

    it('lists the owners no member answers to, with a count, and says so when two members answer to one', async () => {
      const docsPath = createScratchDocsPath();
      const file = path.join(docsPath, 'Roadmap.md');
      const projectId = await createProject(docsPath);
      const twin = unique('Twin');
      for (let copy = 0; copy < 2; copy += 1) {
        const person = await request(server())
          .post('/users')
          .set('Authorization', auth())
          .send({
            displayName: twin,
            email: `${unique('twin')}@pmhybrid.local`,
            password: 'password123',
          })
          .expect(201);
        await request(server())
          .post(`/projects/${projectId}/members`)
          .set('Authorization', auth())
          .send({ actorId: person.body.id })
          .expect(201);
      }
      const ghost = unique('ghost');
      writeFileSync(
        file,
        tableRoadmap(
          `| AL-5 | Work | check | TODO | ${ghost}@2026-10-13T10:00:00Z | — |`,
          `| AL-6 | Work | check | TODO | ${ghost} | — |`,
          `| AL-7 | Work | check | TODO | ${twin} | — |`,
        ),
        'utf-8',
      );
      await sync(projectId).expect(201);

      const gaps = await unresolved(projectId);

      expect(gaps.ownerNames).toEqual([
        { name: ghost, tasks: 2, reason: 'UNKNOWN' },
        { name: twin, tasks: 1, reason: 'AMBIGUOUS' },
      ]);
    });

    it('moves the claim time with the owner cell, and leaves a row whose owner did not change alone', async () => {
      const docsPath = createScratchDocsPath();
      const file = path.join(docsPath, 'Roadmap.md');
      const projectId = await createProject(docsPath);
      const name = unique('claimant');
      const row = (owner: string) =>
        tableRoadmap(`| AL-8 | Work | check | IN PROGRESS | ${owner} | — |`);
      writeFileSync(file, row(`${name}@2026-10-13T10:00:00Z`), 'utf-8');
      await sync(projectId).expect(201);
      const taskId = (await taskOf(projectId, 'AL-8')).id;
      const claimed = () =>
        prisma.task.findUniqueOrThrow({ where: { id: taskId } });
      const audited = () =>
        prisma.auditEvent.count({
          where: {
            entityType: 'Task',
            entityId: taskId,
            operation: 'ROADMAP_FIELD_UPDATE',
          },
        });
      expect((await claimed()).ownerClaimedAt?.toISOString()).toBe(
        '2026-10-13T10:00:00.000Z',
      );
      const before = await audited();

      await sync(projectId).expect(201);
      expect((await claimed()).ownerClaimedAt?.toISOString()).toBe(
        '2026-10-13T10:00:00.000Z',
      );
      expect(await audited()).toBe(before);

      writeFileSync(file, row(`${name}@2026-10-13T12:30:00Z`), 'utf-8');
      await sync(projectId).expect(201);
      expect(await claimed()).toMatchObject({
        rawOwner: `${name}@2026-10-13T12:30:00Z`,
      });
      expect((await claimed()).ownerClaimedAt?.toISOString()).toBe(
        '2026-10-13T12:30:00.000Z',
      );
      expect(await audited()).toBe(before + 1);

      const change = await prisma.auditEvent.findFirstOrThrow({
        where: {
          entityType: 'Task',
          entityId: taskId,
          operation: 'ROADMAP_FIELD_UPDATE',
        },
        orderBy: { occurredAt: 'desc' },
      });
      expect(JSON.stringify(change.newValue)).toContain('ownerClaimedAt');

      writeFileSync(file, row(unique('another')), 'utf-8');
      await sync(projectId).expect(201);
      expect((await claimed()).ownerClaimedAt).toBeNull();
    });
  });

  describe('the agent a ledger entry names', () => {
    const events = (projectId: string) =>
      prisma.agentLogEvent.findMany({
        where: { projectId },
        orderBy: { agentName: 'asc' },
      });

    it('links each entry to the agent it names, leaves a stranger unlinked, and does not change on a second sync', async () => {
      const docsPath = createScratchDocsPath();
      const projectId = await createProject(docsPath);
      const sonnet = await createAgent(projectId);
      const codex = await createAgent(projectId);
      const stranger = unique('stranger');
      writeFileSync(
        path.join(docsPath, 'Agentslog.md'),
        ledger(
          { agent: sonnet.ledgerName, task: 'LL-1', word: 'IN_PROGRESS' },
          { agent: codex.alias.toUpperCase(), task: 'LL-1', word: 'PAUSE' },
          { agent: stranger, task: 'LL-2', word: 'IN_PROGRESS' },
        ),
        'utf-8',
      );

      await sync(projectId).expect(201);
      const first = await events(projectId);
      await sync(projectId).expect(201);
      const second = await events(projectId);

      const linked = Object.fromEntries(
        first.map((event) => [event.agentName, event.agentActorId]),
      );
      expect(linked[sonnet.ledgerName]).toBe(sonnet.id);
      expect(linked[codex.alias.toUpperCase()]).toBe(codex.id);
      expect(linked[stranger]).toBeNull();
      expect(second.map((event) => [event.id, event.agentActorId])).toEqual(
        first.map((event) => [event.id, event.agentActorId]),
      );
      expect((await unresolved(projectId)).ledgerNames).toEqual([
        {
          name: stranger,
          events: 1,
          tasks: 1,
          firstSeen: expect.any(String),
          lastSeen: expect.any(String),
          reason: 'UNKNOWN',
        },
      ]);
    });

    it('links, on the next sync, the entries that were read before agents were linked, and a second sync changes nothing', async () => {
      const docsPath = createScratchDocsPath();
      const projectId = await createProject(docsPath);
      const sonnet = await createAgent(projectId);
      writeFileSync(
        path.join(docsPath, 'Agentslog.md'),
        ledger(
          { agent: sonnet.ledgerName, task: 'LL-4', word: 'IN_PROGRESS' },
          { agent: unique('stranger'), task: 'LL-4', word: 'PAUSE' },
        ),
        'utf-8',
      );
      await sync(projectId).expect(201);
      // What the 978 events of a project read before this existed look like.
      await prisma.agentLogEvent.updateMany({
        where: { projectId },
        data: { agentActorId: null },
      });

      await sync(projectId).expect(201);
      const first = (await events(projectId)).map(
        (event) => event.agentActorId,
      );
      await sync(projectId).expect(201);
      const second = (await events(projectId)).map(
        (event) => event.agentActorId,
      );

      expect(first).toHaveLength(2);
      expect(first).toEqual(expect.arrayContaining([null, sonnet.id]));
      expect(second).toEqual(first);
    });

    it('links the entries of an agent registered after them, and unlinks them when the name is freed', async () => {
      const docsPath = createScratchDocsPath();
      const projectId = await createProject(docsPath);
      const late = unique('latecomer');
      writeFileSync(
        path.join(docsPath, 'Agentslog.md'),
        ledger({ agent: late, task: 'LL-3', word: 'IN_PROGRESS' }),
        'utf-8',
      );
      await sync(projectId).expect(201);
      expect((await events(projectId))[0].agentActorId).toBeNull();

      const agent = await createAgent(null, { aliases: [late] });
      expect((await events(projectId))[0].agentActorId).toBe(agent.id);
      expect((await unresolved(projectId)).ledgerNames).toEqual([]);

      await request(server())
        .patch(`/agents/${agent.id}`)
        .set('Authorization', auth())
        .send({ aliases: [unique('other')] })
        .expect(200);
      expect((await events(projectId))[0].agentActorId).toBeNull();
      expect((await unresolved(projectId)).ledgerNames).toEqual([
        {
          name: late,
          events: 1,
          tasks: 1,
          firstSeen: expect.any(String),
          lastSeen: expect.any(String),
          reason: 'UNKNOWN',
        },
      ]);

      await request(server())
        .patch(`/agents/${agent.id}`)
        .set('Authorization', auth())
        .send({ aliases: [late] })
        .expect(200);
      expect((await events(projectId))[0].agentActorId).toBe(agent.id);
    });

    it('shows the unresolved names to the members of the project only', async () => {
      const projectId = await createProject(createScratchDocsPath());
      const email = `${unique('outsider')}@pmhybrid.local`;
      await request(server())
        .post('/users')
        .set('Authorization', auth())
        .send({
          displayName: unique('Outsider'),
          email,
          password: 'password123',
        })
        .expect(201);
      const outsider = await request(server())
        .post('/auth/login')
        .send({ email, password: 'password123' })
        .expect(200);

      await request(server())
        .get(`/projects/${projectId}/unresolved-names`)
        .expect(401);
      await request(server())
        .get(`/projects/${projectId}/unresolved-names`)
        .set('Authorization', `Bearer ${outsider.body.accessToken}`)
        .expect(403);
    });
  });
});
