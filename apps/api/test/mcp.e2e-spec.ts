import type { AddressInfo } from 'node:net';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { DEMO_EMAIL, DEMO_PASSWORD } from './../prisma/demo-credentials.js';
import { assignProjectRole } from './helpers/roles.js';
import { createScratchDocsPath } from './helpers/scratch-docs.js';

/**
 * Roadmap GAP-30: an MCP-capable agent client drives list_tasks/get_task/
 * update_task/transition_task over a real Streamable HTTP round-trip,
 * using the SDK's own Client — not hand-built JSON-RPC bodies — so the
 * `initialize` handshake through Nest's global ValidationPipe/body-parser
 * is exercised for real, not assumed safe from reading the SDK's docs.
 */
describe('MCP server for agent task operations (e2e)', () => {
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
    const port = (app.getHttpServer().address() as AddressInfo).port;
    mcpUrl = new URL(`http://127.0.0.1:${port}/mcp`);

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

  async function createAgentWithKey() {
    const agent = await request(server())
      .post('/agents')
      .set('Authorization', auth())
      .send({ displayName: unique('MCP Agent'), providerType: 'custom' })
      .expect(201);
    const key = await request(server())
      .post(`/agents/${agent.body.id}/keys`)
      .set('Authorization', auth())
      .send({})
      .expect(201);
    return { agentId: agent.body.id as string, apiKey: key.body.key as string };
  }

  async function createProjectWithMember(agentId: string) {
    const project = await request(server())
      .post('/projects')
      .set('Authorization', auth())
      .send({ name: unique('MCP E2E'), docsPath: createScratchDocsPath() })
      .expect(201);
    await request(server())
      .post(`/projects/${project.body.id}/members`)
      .set('Authorization', auth())
      .send({ actorId: agentId })
      .expect(201);
    return project.body.id as string;
  }

  async function createTask(projectId: string, title: string) {
    const task = await request(server())
      .post(`/projects/${projectId}/tasks`)
      .set('Authorization', auth())
      .send({ title, acceptanceCriteria: 'Verified by e2e' })
      .expect(201);
    return task.body.id as string;
  }

  async function connectedClient(apiKey: string): Promise<Client> {
    const client = new Client({ name: 'mcp-e2e-client', version: '1.0.0' });
    const transport = new StreamableHTTPClientTransport(mcpUrl, {
      requestInit: { headers: { 'X-API-Key': apiKey } },
    });
    await client.connect(transport);
    return client;
  }

  function text(result: CallToolResult): string {
    const first = result.content[0];
    return first?.type === 'text' ? first.text : '';
  }

  it('rejects a request with no API key before the MCP layer ever sees it', async () => {
    await request(server()).post('/mcp').send({}).expect(401);
  });

  it('rejects GET and DELETE with a JSON-RPC 405, per the SDK stateless-mode example', async () => {
    const { apiKey } = await createAgentWithKey();
    await request(server()).get('/mcp').set('X-API-Key', apiKey).expect(405);
    await request(server()).delete('/mcp').set('X-API-Key', apiKey).expect(405);
  });

  it('completes the initialize handshake and lists the task tools and the workflow tools', async () => {
    const { apiKey } = await createAgentWithKey();
    const client = await connectedClient(apiKey);

    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      'add_comment',
      'claim_task',
      'create_task',
      'get_context',
      'get_task',
      'list_comments',
      'list_conflicts',
      'list_notifications',
      'list_projects',
      'list_tasks',
      'mark_notifications_read',
      'read_document',
      'transition_task',
      'update_task',
    ]);
  });

  it('reads a task via get_task and lists it via list_tasks', async () => {
    const { agentId, apiKey } = await createAgentWithKey();
    const projectId = await createProjectWithMember(agentId);
    const taskId = await createTask(projectId, 'Read via MCP');
    const client = await connectedClient(apiKey);

    const got = await client.callTool({
      name: 'get_task',
      arguments: { projectId, taskId },
    });
    expect(got.isError).not.toBe(true);
    expect(JSON.parse(text(got as CallToolResult)).title).toBe('Read via MCP');

    const listed = await client.callTool({
      name: 'list_tasks',
      arguments: { projectId },
    });
    const tasks = JSON.parse(text(listed as CallToolResult)) as {
      id: string;
    }[];
    expect(tasks.some((t) => t.id === taskId)).toBe(true);
  });

  it('adds a comment via add_comment and reads it back via list_comments', async () => {
    const { agentId, apiKey } = await createAgentWithKey();
    const projectId = await createProjectWithMember(agentId);
    const taskId = await createTask(projectId, 'Needs a comment');
    const client = await connectedClient(apiKey);

    const added = await client.callTool({
      name: 'add_comment',
      arguments: { projectId, taskId, body: 'Started investigating.' },
    });
    expect(added.isError).not.toBe(true);
    expect(JSON.parse(text(added as CallToolResult)).body).toBe(
      'Started investigating.',
    );

    const listed = await client.callTool({
      name: 'list_comments',
      arguments: { projectId, taskId },
    });
    const comments = JSON.parse(text(listed as CallToolResult)) as {
      body: string;
    }[];
    expect(comments.map((c) => c.body)).toEqual(['Started investigating.']);
  });

  it('updates a task via update_task, reusing TasksService.update unchanged', async () => {
    const { agentId, apiKey } = await createAgentWithKey();
    const projectId = await createProjectWithMember(agentId);
    await assignProjectRole(server(), auth(), projectId, agentId, 'AI_AGENT');
    const taskId = await createTask(projectId, 'Original title');
    const client = await connectedClient(apiKey);

    const updated = await client.callTool({
      name: 'update_task',
      arguments: {
        projectId,
        taskId,
        title: 'Updated via MCP',
        progressPercent: 40,
      },
    });
    expect(updated.isError).not.toBe(true);

    const after = await request(server())
      .get(`/projects/${projectId}/tasks/${taskId}`)
      .set('Authorization', auth())
      .expect(200);
    expect(after.body).toMatchObject({
      title: 'Updated via MCP',
      progressPercent: 40,
    });
  });

  it('refuses update_task with an isError result for an agent member holding no task.write (Roadmap SECURITY-02)', async () => {
    const { agentId, apiKey } = await createAgentWithKey();
    const projectId = await createProjectWithMember(agentId);
    const taskId = await createTask(projectId, 'Must stay untouched');
    const client = await connectedClient(apiKey);

    const result = await client.callTool({
      name: 'update_task',
      arguments: { projectId, taskId, title: 'Hijacked via MCP' },
    });
    expect(result.isError).toBe(true);
    expect(text(result as CallToolResult)).toContain('task.write');

    const after = await request(server())
      .get(`/projects/${projectId}/tasks/${taskId}`)
      .set('Authorization', auth())
      .expect(200);
    expect(after.body.title).toBe('Must stay untouched');
  });

  it('returns a protocol-level isError result (not a transport failure) when the agent lacks the transition permission', async () => {
    const { agentId, apiKey } = await createAgentWithKey();
    const projectId = await createProjectWithMember(agentId);
    const taskId = await createTask(projectId, 'Needs assign permission');
    const client = await connectedClient(apiKey);

    const result = await client.callTool({
      name: 'transition_task',
      arguments: { projectId, taskId, status: 'ASIGNADA' },
    });
    expect(result.isError).toBe(true);
    expect(text(result as CallToolResult)).toMatch(/Missing permission/);
  });

  describe('workflow tools (Roadmap GAP-36b)', () => {
    async function callJson(
      client: Client,
      name: string,
      args: Record<string, unknown>,
    ) {
      const result = (await client.callTool({
        name,
        arguments: args,
      })) as CallToolResult;
      return {
        result,
        body: result.isError ? text(result) : JSON.parse(text(result)),
      };
    }

    it('lists the projects the agent belongs to, and no other', async () => {
      const { agentId, apiKey } = await createAgentWithKey();
      const projectId = await createProjectWithMember(agentId);
      await createProjectWithMember((await createAgentWithKey()).agentId);
      const client = await connectedClient(apiKey);

      const { body } = await callJson(client, 'list_projects', {});

      expect((body as { id: string }[]).map((project) => project.id)).toEqual([
        projectId,
      ]);
      expect(body[0]).toMatchObject({ status: 'ACTIVE' });
      expect(body[0].summary).toBeDefined();
    });

    it('tells an agent it was assigned work, and lets it acknowledge (Roadmap GAP-36c)', async () => {
      const { agentId, apiKey } = await createAgentWithKey();
      const projectId = await createProjectWithMember(agentId);
      const taskId = await createTask(projectId, 'Work for the agent');
      await request(server())
        .post(`/projects/${projectId}/tasks/${taskId}/assign`)
        .set('Authorization', auth())
        .send({ actorId: agentId })
        .expect(201);
      const client = await connectedClient(apiKey);

      const unread = await callJson(client, 'list_notifications', {
        unreadOnly: true,
      });
      expect(unread.body).toHaveLength(1);
      expect(unread.body[0]).toMatchObject({
        type: 'TASK_ASSIGNED',
        projectId,
        payload: { taskId, title: 'Work for the agent' },
      });

      const marked = await callJson(client, 'mark_notifications_read', {});
      expect(marked.body).toEqual({ count: 1 });
      expect(
        (await callJson(client, 'list_notifications', { unreadOnly: true }))
          .body,
      ).toEqual([]);
      // Still there once read, for whoever wants the history.
      expect(
        (await callJson(client, 'list_notifications', {})).body,
      ).toHaveLength(1);
    });

    it("gives the state of a project in one call: figures, the agent's own open tasks and what is blocked", async () => {
      const { agentId, apiKey } = await createAgentWithKey();
      const projectId = await createProjectWithMember(agentId);
      await assignProjectRole(server(), auth(), projectId, agentId, 'AI_AGENT');
      const mine = await createTask(projectId, 'Mine to do');
      await createTask(projectId, 'Nobody has it');
      await request(server())
        .post(`/projects/${projectId}/tasks/${mine}/assign`)
        .set('Authorization', auth())
        .send({ actorId: agentId })
        .expect(201);
      const client = await connectedClient(apiKey);

      const { body } = await callJson(client, 'get_context', { projectId });

      expect(body.project.id).toBe(projectId);
      expect(body.totalTasks).toBe(2);
      expect(body.statusCounts).toMatchObject({ PENDIENTE: 1, ASIGNADA: 1 });
      expect(
        body.myOpenTasks.map((task: { title: string }) => task.title),
      ).toEqual(['Mine to do']);
      expect(body.blocked).toEqual([]);
      expect(body.openConflicts).toBe(0);
    });

    it('claims a task for the agent, and with start moves it to EN_DESARROLLO', async () => {
      const { agentId, apiKey } = await createAgentWithKey();
      const projectId = await createProjectWithMember(agentId);
      await assignProjectRole(server(), auth(), projectId, agentId, 'AI_AGENT');
      const taskId = await createTask(projectId, 'To be claimed');
      const client = await connectedClient(apiKey);

      const claimed = await callJson(client, 'claim_task', {
        projectId,
        taskId,
      });
      expect(claimed.result.isError).not.toBe(true);
      expect(claimed.body).toMatchObject({
        assigneeActorId: agentId,
        status: 'ASIGNADA',
      });

      const started = await callJson(client, 'claim_task', {
        projectId,
        taskId,
        start: true,
      });
      expect(started.body.status).toBe('EN_DESARROLLO');
      const after = await request(server())
        .get(`/projects/${projectId}/tasks/${taskId}`)
        .set('Authorization', auth())
        .expect(200);
      expect(after.body).toMatchObject({
        assigneeActorId: agentId,
        status: 'EN_DESARROLLO',
      });
    });

    it('refuses claim_task, as an isError result, to an agent that may not take work', async () => {
      const { agentId, apiKey } = await createAgentWithKey();
      const projectId = await createProjectWithMember(agentId);
      const taskId = await createTask(projectId, 'Not for this agent');
      const client = await connectedClient(apiKey);

      const { result, body } = await callJson(client, 'claim_task', {
        projectId,
        taskId,
      });

      expect(result.isError).toBe(true);
      expect(String(body)).toMatch(/Missing permission|not allowed|cannot/i);
    });

    it('creates a task and a subtask, and never a second copy when it retries with the same key', async () => {
      const { agentId, apiKey } = await createAgentWithKey();
      const projectId = await createProjectWithMember(agentId);
      await assignProjectRole(server(), auth(), projectId, agentId, 'AI_AGENT');
      const client = await connectedClient(apiKey);
      const args = {
        projectId,
        title: 'Created by an agent',
        acceptanceCriteria: 'It exists',
        idempotencyKey: unique('agent-retry'),
      };

      const first = await callJson(client, 'create_task', args);
      const again = await callJson(client, 'create_task', args);
      expect(first.result.isError).not.toBe(true);
      expect(again.body.id).toBe(first.body.id);

      const sub = await callJson(client, 'create_task', {
        projectId,
        title: 'A subtask',
        acceptanceCriteria: 'Also exists',
        parentTaskId: first.body.id,
      });
      expect(sub.body.parentTaskId).toBe(first.body.id);
      const listed = await request(server())
        .get(`/projects/${projectId}/tasks`)
        .set('Authorization', auth())
        .expect(200);
      expect(listed.body).toHaveLength(2);
    });

    it('refuses create_task to an agent without task.write, and creates nothing', async () => {
      const { agentId, apiKey } = await createAgentWithKey();
      const projectId = await createProjectWithMember(agentId);
      const client = await connectedClient(apiKey);

      const { result, body } = await callJson(client, 'create_task', {
        projectId,
        title: 'Nope',
        acceptanceCriteria: 'Nope',
      });

      expect(result.isError).toBe(true);
      expect(String(body)).toContain('task.write');
      const listed = await request(server())
        .get(`/projects/${projectId}/tasks`)
        .set('Authorization', auth())
        .expect(200);
      expect(listed.body).toEqual([]);
    });

    it('lists the conflicts of a project, and reads its documents', async () => {
      const { agentId, apiKey } = await createAgentWithKey();
      const projectId = await createProjectWithMember(agentId);
      const client = await connectedClient(apiKey);

      const conflicts = await callJson(client, 'list_conflicts', { projectId });
      expect(conflicts.body).toEqual([]);

      const roadmap = await callJson(client, 'read_document', {
        projectId,
        kind: 'roadmap',
      });
      expect(roadmap.result.isError).not.toBe(true);
      expect(text(roadmap.result)).toContain('Active work');
      const log = await callJson(client, 'read_document', {
        projectId,
        kind: 'agentslog',
      });
      expect(text(log.result)).toContain('# Agents log');
      const missing = await callJson(client, 'read_document', {
        projectId,
        kind: 'features',
      });
      expect(missing.result.isError).toBe(true);
    });

    it('answers a project the agent is not a member of with an isError result for every project tool', async () => {
      const { apiKey } = await createAgentWithKey();
      const { agentId: otherAgent } = await createAgentWithKey();
      const projectId = await createProjectWithMember(otherAgent);
      const client = await connectedClient(apiKey);

      for (const call of [
        ['get_context', { projectId }],
        ['list_conflicts', { projectId }],
        ['read_document', { projectId, kind: 'roadmap' }],
        ['create_task', { projectId, title: 't', acceptanceCriteria: 'a' }],
        ['claim_task', { projectId, taskId: 'x' }],
      ] as const) {
        const { result, body } = await callJson(client, call[0], call[1]);
        expect(result.isError, call[0]).toBe(true);
        expect(String(body), call[0]).toMatch(/not a member/i);
      }
    });
  });

  it('closes the per-request McpServer/transport pair once the response completes (no leak)', async () => {
    const { apiKey } = await createAgentWithKey();
    const serverCloseSpy = vi.spyOn(McpServer.prototype, 'close');
    const transportCloseSpy = vi.spyOn(
      StreamableHTTPServerTransport.prototype,
      'close',
    );
    const client = await connectedClient(apiKey);

    await client.listTools();
    // res.on('close', ...) fires asynchronously after the HTTP response
    // itself has fully completed -- give the event loop one more tick.
    await new Promise((resolve) => setImmediate(resolve));

    expect(serverCloseSpy).toHaveBeenCalled();
    expect(transportCloseSpy).toHaveBeenCalled();
    serverCloseSpy.mockRestore();
    transportCloseSpy.mockRestore();
  });

  it('applies the raised per-route throttle (300/min) rather than the global 100/min default', async () => {
    const { apiKey } = await createAgentWithKey();
    const body = JSON.stringify({
      jsonrpc: '2.0',
      method: 'ping',
      id: 1,
    });

    const responses = await Promise.all(
      Array.from({ length: 120 }, () =>
        request(server())
          .post('/mcp')
          .set('X-API-Key', apiKey)
          .set('Content-Type', 'application/json')
          .set('Accept', 'application/json, text/event-stream')
          .send(body),
      ),
    );
    expect(responses.some((res) => res.status === 429)).toBe(false);
  });

  it('returns a protocol-level isError result when the caller is not a member of the project', async () => {
    const { apiKey } = await createAgentWithKey();
    // A second, unrelated project the agent was never added to.
    const otherProject = await request(server())
      .post('/projects')
      .set('Authorization', auth())
      .send({
        name: unique('MCP E2E Other'),
        docsPath: createScratchDocsPath(),
      })
      .expect(201);
    const otherTaskId = await createTask(
      otherProject.body.id,
      'Not visible to the agent',
    );
    const client = await connectedClient(apiKey);

    const result = await client.callTool({
      name: 'get_task',
      arguments: { projectId: otherProject.body.id, taskId: otherTaskId },
    });
    expect(result.isError).toBe(true);
    expect(text(result as CallToolResult)).toMatch(/[Nn]ot a member/);
  });
});
