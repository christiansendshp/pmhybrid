import type { AddressInfo } from 'node:net';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { DEMO_EMAIL, DEMO_PASSWORD } from './../prisma/demo-credentials.js';
import { assignProjectRole } from './helpers/roles.js';
import { createScratchDocsPath } from './helpers/scratch-docs.js';

/**
 * An agent hands a task over to review and answers a review through MCP, and sees what waits for it
 * (Roadmap TASK-10): thin adapters over the same transition, permissions, audit and comments the board uses.
 */
describe('MCP tools for the QA handoff (e2e, Roadmap TASK-10)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
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
    prisma = moduleFixture.get(PrismaService);
    mcpUrl = new URL(
      `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}/mcp`,
    );
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

  async function agent(projectId: string, role: string) {
    const created = await request(server())
      .post('/agents')
      .set('Authorization', auth())
      .send({ displayName: unique('Agent'), providerType: 'custom' })
      .expect(201);
    const key = await request(server())
      .post(`/agents/${created.body.id}/keys`)
      .set('Authorization', auth())
      .send({})
      .expect(201);
    await request(server())
      .post(`/projects/${projectId}/members`)
      .set('Authorization', auth())
      .send({ actorId: created.body.id })
      .expect(201);
    await assignProjectRole(server(), auth(), projectId, created.body.id, role);
    return { id: created.body.id as string, apiKey: key.body.key as string };
  }

  async function project() {
    const created = await request(server())
      .post('/projects')
      .set('Authorization', auth())
      .send({
        name: unique('MCP review E2E'),
        docsPath: createScratchDocsPath(),
      })
      .expect(201);
    return created.body.id as string;
  }

  async function connect(apiKey: string) {
    const client = new Client({ name: 'mcp-review-e2e', version: '1.0.0' });
    await client.connect(
      new StreamableHTTPClientTransport(mcpUrl, {
        requestInit: { headers: { 'X-API-Key': apiKey } },
      }),
    );
    return client;
  }

  async function call(
    apiKey: string,
    name: string,
    args: Record<string, unknown>,
  ) {
    const client = await connect(apiKey);
    const result = (await client.callTool({
      name,
      arguments: args,
    })) as CallToolResult;
    const first = result.content[0];
    const text = first?.type === 'text' ? first.text : '';
    return { isError: result.isError === true, text };
  }

  /** A task assigned to `developerId` and in development. */
  async function developing(projectId: string, developerId: string) {
    const created = await request(server())
      .post(`/projects/${projectId}/tasks`)
      .set('Authorization', auth())
      .send({ title: unique('Review me'), acceptanceCriteria: 'Verified' })
      .expect(201);
    const taskId = created.body.id as string;
    await request(server())
      .post(`/projects/${projectId}/tasks/${taskId}/assign`)
      .set('Authorization', auth())
      .send({ actorId: developerId })
      .expect(201);
    await request(server())
      .post(`/projects/${projectId}/tasks/${taskId}/transition`)
      .set('Authorization', auth())
      .send({ status: 'EN_DESARROLLO' })
      .expect(201);
    return taskId;
  }

  const taskOf = (taskId: string) =>
    prisma.task.findUniqueOrThrow({ where: { id: taskId } });
  const commentsOf = async (taskId: string) =>
    (await prisma.taskComment.findMany({ where: { taskId } })).map(
      (comment) => comment.body,
    );

  describe('handoff_task', () => {
    it('moves the task to QA for its assignee, asks the reviewer and keeps the note as a comment', async () => {
      const projectId = await project();
      const developer = await agent(projectId, 'AI_AGENT');
      const reviewer = await agent(projectId, 'QA');
      const taskId = await developing(projectId, developer.id);

      const handed = await call(developer.apiKey, 'handoff_task', {
        projectId,
        taskId,
        note: 'importer done',
        reviewerActorId: reviewer.id,
      });

      expect(handed.isError).toBe(false);
      expect(await taskOf(taskId)).toMatchObject({
        status: 'QA',
        reviewerActorId: reviewer.id,
      });
      expect(await commentsOf(taskId)).toEqual([
        'Handed to review: importer done',
      ]);
    });

    it('hands a task over without a note or a reviewer, and writes no comment', async () => {
      const projectId = await project();
      const developer = await agent(projectId, 'AI_AGENT');
      const taskId = await developing(projectId, developer.id);

      const handed = await call(developer.apiKey, 'handoff_task', {
        projectId,
        taskId,
      });

      expect(handed.isError).toBe(false);
      expect(await commentsOf(taskId)).toEqual([]);
    });

    it('refuses a caller who is not the assignee, and leaves the task in development', async () => {
      const projectId = await project();
      const developer = await agent(projectId, 'AI_AGENT');
      const other = await agent(projectId, 'AI_AGENT');
      const taskId = await developing(projectId, developer.id);

      const refused = await call(other.apiKey, 'handoff_task', {
        projectId,
        taskId,
        note: 'not mine',
      });

      expect(refused.isError).toBe(true);
      expect(refused.text).toBe(
        'Only the assignee can hand a task over to review',
      );
      expect((await taskOf(taskId)).status).toBe('EN_DESARROLLO');
    });

    it('refuses a task that is not in development, with the rule the board gives', async () => {
      const projectId = await project();
      const developer = await agent(projectId, 'AI_AGENT');
      const created = await request(server())
        .post(`/projects/${projectId}/tasks`)
        .set('Authorization', auth())
        .send({ title: unique('Not started'), acceptanceCriteria: 'Verified' })
        .expect(201);
      await request(server())
        .post(`/projects/${projectId}/tasks/${created.body.id}/assign`)
        .set('Authorization', auth())
        .send({ actorId: developer.id })
        .expect(201);

      const refused = await call(developer.apiKey, 'handoff_task', {
        projectId,
        taskId: created.body.id,
      });

      expect(refused.isError).toBe(true);
      expect(refused.text).toContain('Cannot transition from ASIGNADA to QA');
    });
  });

  describe('review_task', () => {
    async function handedOver() {
      const projectId = await project();
      const developer = await agent(projectId, 'AI_AGENT');
      const reviewer = await agent(projectId, 'QA');
      const taskId = await developing(projectId, developer.id);
      await call(developer.apiKey, 'handoff_task', {
        projectId,
        taskId,
        reviewerActorId: reviewer.id,
      });
      return { projectId, developer, reviewer, taskId };
    }

    it('approves with PASS for whoever can approve QA, and keeps the note as a comment', async () => {
      const { projectId, reviewer, taskId } = await handedOver();

      const passed = await call(reviewer.apiKey, 'review_task', {
        projectId,
        taskId,
        result: 'PASS',
        note: 'checked the CSV edge cases',
      });

      expect(passed.isError).toBe(false);
      expect((await taskOf(taskId)).status).toBe('TERMINADA');
      expect(await commentsOf(taskId)).toEqual([
        'Review PASS: checked the CSV edge cases',
      ]);
    });

    it('returns the task to development with FAIL and the reason as a comment', async () => {
      const { projectId, reviewer, taskId } = await handedOver();

      const failed = await call(reviewer.apiKey, 'review_task', {
        projectId,
        taskId,
        result: 'FAIL',
        note: 'drops the last row',
      });

      expect(failed.isError).toBe(false);
      expect((await taskOf(taskId)).status).toBe('EN_DESARROLLO');
      expect(await commentsOf(taskId)).toEqual([
        'Review FAIL: drops the last row',
      ]);
    });

    it('does not let a developer approve, and leaves the task in QA with no comment', async () => {
      const { projectId, developer, taskId } = await handedOver();

      const refused = await call(developer.apiKey, 'review_task', {
        projectId,
        taskId,
        result: 'PASS',
        note: 'self approval',
      });

      expect(refused.isError).toBe(true);
      expect(refused.text).toBe('Missing permission: task.qa.approve');
      expect((await taskOf(taskId)).status).toBe('QA');
      expect(await commentsOf(taskId)).toEqual([]);
    });

    it('does not let a developer send it back either', async () => {
      const { projectId, developer, taskId } = await handedOver();

      const refused = await call(developer.apiKey, 'review_task', {
        projectId,
        taskId,
        result: 'FAIL',
        note: 'self return',
      });

      expect(refused.text).toBe('Missing permission: task.qa.reject');
    });

    it('requires the note', async () => {
      const { projectId, reviewer, taskId } = await handedOver();

      const empty = await call(reviewer.apiKey, 'review_task', {
        projectId,
        taskId,
        result: 'PASS',
        note: '',
      });

      expect(empty.isError).toBe(true);
      expect((await taskOf(taskId)).status).toBe('QA');
    });
  });

  describe('list_review_queue', () => {
    it('lists the tasks waiting in QA of the projects the caller belongs to, the longest waiting first', async () => {
      const projectId = await project();
      const developer = await agent(projectId, 'AI_AGENT');
      const first = await developing(projectId, developer.id);
      const second = await developing(projectId, developer.id);
      await call(developer.apiKey, 'handoff_task', {
        projectId,
        taskId: first,
      });
      await call(developer.apiKey, 'handoff_task', {
        projectId,
        taskId: second,
      });
      await developing(projectId, developer.id);

      const queue = await call(developer.apiKey, 'list_review_queue', {});

      expect(
        (JSON.parse(queue.text) as { taskId: string }[]).map(
          (entry) => entry.taskId,
        ),
      ).toEqual([first, second]);
    });

    it('keeps with reviewer = me only the tasks that asked the caller, and with an actor id those asked of that actor', async () => {
      const projectId = await project();
      const developer = await agent(projectId, 'AI_AGENT');
      const reviewer = await agent(projectId, 'QA');
      const other = await agent(projectId, 'QA');
      const mine = await developing(projectId, developer.id);
      const theirs = await developing(projectId, developer.id);
      await call(developer.apiKey, 'handoff_task', {
        projectId,
        taskId: mine,
        reviewerActorId: reviewer.id,
      });
      await call(developer.apiKey, 'handoff_task', {
        projectId,
        taskId: theirs,
        reviewerActorId: other.id,
      });

      const asked = await call(reviewer.apiKey, 'list_review_queue', {
        reviewer: 'me',
      });
      const askedOfOther = await call(reviewer.apiKey, 'list_review_queue', {
        reviewer: other.id,
      });

      const ids = (text: string) =>
        (JSON.parse(text) as { taskId: string }[]).map((entry) => entry.taskId);
      expect(ids(asked.text)).toEqual([mine]);
      expect(ids(askedOfOther.text)).toEqual([theirs]);
    });

    it('says who it waits for and since when', async () => {
      const projectId = await project();
      const developer = await agent(projectId, 'AI_AGENT');
      const reviewer = await agent(projectId, 'QA');
      const taskId = await developing(projectId, developer.id);
      await call(developer.apiKey, 'handoff_task', {
        projectId,
        taskId,
        reviewerActorId: reviewer.id,
      });

      const queue = await call(reviewer.apiKey, 'list_review_queue', {});

      const [entry] = JSON.parse(queue.text) as {
        projectId: string;
        reviewer: { id: string };
        waitingSince: string;
      }[];
      expect(entry).toMatchObject({
        projectId,
        reviewer: { id: reviewer.id },
      });
      expect(Number.isNaN(Date.parse(entry.waitingSince))).toBe(false);
    });

    it('shows nothing of a project the caller does not belong to', async () => {
      const mine = await project();
      const elsewhere = await project();
      const developer = await agent(mine, 'AI_AGENT');
      const stranger = await agent(elsewhere, 'AI_AGENT');
      const hidden = await developing(elsewhere, stranger.id);
      await call(stranger.apiKey, 'handoff_task', {
        projectId: elsewhere,
        taskId: hidden,
      });

      const queue = await call(developer.apiKey, 'list_review_queue', {});

      expect(JSON.parse(queue.text)).toEqual([]);
    });
  });
});
