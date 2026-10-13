import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { DEMO_EMAIL, DEMO_PASSWORD } from './../prisma/demo-credentials.js';
import { assignProjectRole } from './helpers/roles.js';
import { createScratchDocsPath } from './helpers/scratch-docs.js';

/** The repository's own copy of the skill: the commands an agent runs. */
const SKILL = path
  .resolve(
    process.cwd(),
    '../../.claude/skills/project-documentation/scripts/project_docs.sh',
  )
  .replace(/\\/g, '/');
const HAS_SH = spawnSync('sh', ['-c', 'true']).status === 0;

const ROADMAP = (id: string) => `# Roadmap

## Plan

### ${id} — Work

\`\`\`yaml
id: ${id}
type: TASK
title: Work
status: READY
description: >
  Work to do.
acceptance_criteria:
  - id: AC-1
    description: It works.
    status: pending
created_at: 2026-10-13T00:00:00Z
updated_at: 2026-10-13T00:00:00Z
\`\`\`

## Cross-cutting
`;

const LEDGER = `# Agents log

## Entries
`;

/**
 * An agent is one string, and PM Hub writes that string, not another (Roadmap TASK-04): the
 * skill decides who holds a task by comparing the agent it is given with the ledger's, exactly.
 */
describe('The ledger name and whoami (e2e, Roadmap TASK-04)', () => {
  let app: INestApplication<App>;
  let ownerToken: string;
  let mcpUrl: URL;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.listen(0);
    mcpUrl = new URL(
      `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}/mcp`,
    );
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
    `${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

  async function createAgent(body: Record<string, unknown> = {}) {
    const created = await request(server())
      .post('/agents')
      .set('Authorization', auth())
      .send({ displayName: unique('Agent'), providerType: 'custom', ...body })
      .expect(201);
    const key = await request(server())
      .post(`/agents/${created.body.id}/keys`)
      .set('Authorization', auth())
      .send({})
      .expect(201);
    return {
      id: created.body.id as string,
      displayName: created.body.displayName as string,
      apiKey: key.body.key as string,
    };
  }

  async function createProject(docsPath: string) {
    const res = await request(server())
      .post('/projects')
      .set('Authorization', auth())
      .send({ name: unique('Ledger name E2E'), docsPath })
      .expect(201);
    return res.body.id as string;
  }

  async function addMember(
    projectId: string,
    actorId: string,
    role = 'DEVELOPER',
  ) {
    await request(server())
      .post(`/projects/${projectId}/members`)
      .set('Authorization', auth())
      .send({ actorId })
      .expect(201);
    await assignProjectRole(server(), auth(), projectId, actorId, role);
  }

  async function whoami(apiKey: string) {
    const client = new Client({ name: 'whoami-e2e', version: '1.0.0' });
    await client.connect(
      new StreamableHTTPClientTransport(mcpUrl, {
        requestInit: { headers: { 'X-API-Key': apiKey } },
      }),
    );
    const result = (await client.callTool({
      name: 'whoami',
      arguments: {},
    })) as CallToolResult;
    const first = result.content[0];
    return JSON.parse(first?.type === 'text' ? first.text : '{}');
  }

  describe('whoami', () => {
    it('tells an agent its ledger name, aliases, model, stage role and what it may do in each project it belongs to', async () => {
      const ledgerName = unique('claude-sonnet-5-5');
      const alias = unique('claude');
      const agent = await createAgent({
        ledgerName,
        aliases: [alias],
        model: 'Claude Sonnet 5.5',
        stageRole: 'QA',
      });
      const member = await createProject(createScratchDocsPath());
      const other = await createProject(createScratchDocsPath());
      await addMember(member, agent.id);

      const me = await whoami(agent.apiKey);

      expect(me).toMatchObject({
        id: agent.id,
        kind: 'AI_AGENT',
        displayName: agent.displayName,
        ledgerName,
        aliases: [alias],
        model: 'Claude Sonnet 5.5',
        stageRole: 'QA',
      });
      expect(me.projects).toHaveLength(1);
      expect(me.projects[0]).toMatchObject({ id: member });
      expect(me.projects[0].permissions).toEqual(
        expect.arrayContaining(['task.write']),
      );
      expect(me.projects[0].permissions).toEqual(
        [...me.projects[0].permissions].sort(),
      );
      // Not a member of the other project: nothing of it.
      expect(JSON.stringify(me)).not.toContain(other);
    });

    it('says the display name is the ledger name when none was chosen, and shows no project to an agent that has none', async () => {
      const agent = await createAgent();

      const me = await whoami(agent.apiKey);

      expect(me).toMatchObject({
        id: agent.id,
        ledgerName: agent.displayName,
        aliases: [],
        model: null,
        stageRole: 'BOTH',
        projects: [],
      });
    });

    it('shows nothing of any other actor, and needs a valid key', async () => {
      const first = await createAgent({ aliases: [unique('first-alias')] });
      const second = await createAgent({ aliases: [unique('second-alias')] });

      const me = await whoami(first.apiKey);

      expect(me.id).toBe(first.id);
      expect(JSON.stringify(me)).not.toContain(second.id);
      expect(JSON.stringify(me)).not.toContain(second.displayName);
      await request(server())
        .post('/mcp')
        .set('X-API-Key', 'pmh_not-a-real-key-at-all')
        .send({})
        .expect(401);
    });
  });

  describe('the ledger entries PM Hub writes', () => {
    const run = (...args: string[]) =>
      spawnSync('sh', [SKILL, ...args], { encoding: 'utf-8' });

    /** <tmp>/repo/{AGENTS.md, docs/...}: the layout the skill makes, with one task ready to take. */
    function createRepo(taskId: string) {
      const repo = mkdtempSync(path.join(tmpdir(), 'pmhybrid-e2e-repo-'));
      const docs = path.join(repo, 'docs');
      mkdirSync(docs);
      writeFileSync(path.join(docs, 'Roadmap.md'), ROADMAP(taskId), 'utf-8');
      const repoPath = repo.replace(/\\/g, '/');
      if (HAS_SH) {
        // The skill's own init makes the ledger and the rest of its files around the Roadmap.
        expect(run('init', repoPath).status).toBe(0);
      } else {
        writeFileSync(path.join(docs, 'Agentslog.md'), LEDGER, 'utf-8');
      }
      return { repo: repoPath, docs };
    }

    const ledgerOf = (docs: string) =>
      readFileSync(path.join(docs, 'Agentslog.md'), 'utf-8');

    async function startedByPmHub(ledgerName: string | null) {
      const taskId = 'TASK-01';
      const { repo, docs } = createRepo(taskId);
      const agent = await createAgent(ledgerName ? { ledgerName } : {});
      const projectId = await createProject(docs);
      await addMember(projectId, agent.id);
      await request(server())
        .post(`/projects/${projectId}/sync`)
        .set('Authorization', auth())
        .expect(201);
      const task = await request(server())
        .get(`/projects/${projectId}/tasks`)
        .set('Authorization', auth())
        .expect(200);
      const id = (task.body as { id: string }[])[0].id;
      await request(server())
        .post(`/projects/${projectId}/tasks/${id}/assign`)
        .set('Authorization', auth())
        .send({ actorId: agent.id })
        .expect(201);
      await request(server())
        .post(`/projects/${projectId}/tasks/${id}/transition`)
        .set('Authorization', auth())
        .send({ status: 'EN_DESARROLLO' })
        .expect(201);
      return { repo, docs, agent, taskId };
    }

    it("is signed with the agent's ledger name when it differs from its display name, never the display name", async () => {
      const ledgerName = unique('claude-sonnet-5-5');
      const { docs, agent, taskId } = await startedByPmHub(ledgerName);

      const ledger = ledgerOf(docs);

      expect(ledger).toContain(`| ${ledgerName} | ${taskId} | IN_PROGRESS`);
      expect(ledger).not.toContain(agent.displayName);
    });

    it('is signed with the display name when the agent has no other ledger name', async () => {
      const { docs, agent, taskId } = await startedByPmHub(null);

      expect(ledgerOf(docs)).toContain(
        `| ${agent.displayName} | ${taskId} | IN_PROGRESS`,
      );
    });

    it.skipIf(!HAS_SH)(
      'lets the agent pause, resume and finish what PM Hub started for it with the skill, and its check passes; the display name would have been refused',
      async () => {
        const ledgerName = unique('claude-sonnet-5-5');
        const { repo, docs, agent, taskId } = await startedByPmHub(ledgerName);

        // What the old behaviour would have left: the agent cannot act as the name PM Hub wrote then.
        const refused = run(
          'pause',
          repo,
          agent.displayName,
          taskId,
          'OTRO',
          'by display name',
        );
        expect(refused.status).not.toBe(0);
        expect(`${refused.stdout}${refused.stderr}`).toContain(
          `owned by ${ledgerName}`,
        );

        for (const args of [
          ['pause', repo, ledgerName, taskId, 'OTRO', 'taking a break'],
          ['claim', repo, ledgerName, taskId, 'back to it'],
          ['done', repo, ledgerName, taskId, 'finished', 'f', 'verified'],
        ]) {
          const step = run(...args);
          expect(step.status, `${args[0]}: ${step.stdout}${step.stderr}`).toBe(
            0,
          );
        }
        const check = run('check', repo);
        expect(check.status, `${check.stdout}${check.stderr}`).toBe(0);
        const ledger = ledgerOf(docs);
        // PM Hub's start and the agent's own claim after its pause: one holder at a time.
        expect(
          ledger.match(new RegExp(`\\| ${taskId} \\| IN_PROGRESS`, 'g')),
        ).toHaveLength(2);
        expect(ledger).toContain(`| ${ledgerName} | ${taskId} | DONE`);
      },
      120_000,
    );
  });
});
