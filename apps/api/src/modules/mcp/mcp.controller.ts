import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  Controller,
  Delete,
  Get,
  Inject,
  Logger,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { ApiKeyGuard } from '../auth/guards/api-key.guard.js';
import { JwtPayload } from '../auth/jwt-payload.interface.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ConflictsService } from '../conflicts/conflicts.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PROJECT_REPOSITORY_PROVIDER } from '../git-providers/project-repository-provider.interface.js';
import type { ProjectRepositoryProvider } from '../git-providers/project-repository-provider.interface.js';
import { ProjectsService } from '../projects/projects.service.js';
import { registerTaskTools } from './mcp-tools.js';
import { registerWorkflowTools } from './mcp-workflow-tools.js';
import { TaskCommentsService } from '../tasks/task-comments.service.js';
import { TasksService } from '../tasks/tasks.service.js';

const METHOD_NOT_ALLOWED_BODY = {
  jsonrpc: '2.0',
  error: { code: -32000, message: 'Method not allowed.' },
  id: null,
};

/**
 * MCP server for agent task operations (Roadmap GAP-30/GAP-31, brief
 * §27/§29): lets an MCP-capable agent client call `list_tasks`/`get_task`/
 * `update_task`/`transition_task`/`list_comments`/`add_comment` directly,
 * instead of only via the REST API + API keys (GAP-15), and — since Roadmap
 * GAP-36b — the workflow tools around them (`list_projects`, `get_context`,
 * `claim_task`, `create_task`, `list_conflicts`, `read_document`).
 *
 * `ApiKeyGuard` alone, not `JwtAuthGuard`: this endpoint exists specifically
 * for agent clients (the ticket's own wording), and `ApiKeyGuard` already
 * restricts to `AI_AGENT` actors, so there is no reason to also accept a
 * person's JWT here. Raised per-route throttle: the global default
 * (100 req/min/IP, `app.module.ts`) is sized for a person clicking through
 * the UI, not an agent looping over several tool calls in a session.
 *
 * Stateless Streamable HTTP (`sessionIdGenerator: undefined`): a fresh
 * `McpServer` + transport pair per request. None of these tools need a
 * multi-turn session or a server-initiated notification stream, so
 * statelessness avoids an in-memory session store this app would
 * otherwise need to size and expire. GET/DELETE are the SDK's own
 * documented stateless-mode shape (`examples/server/
 * simpleStatelessStreamableHttp.ts`): both are meaningless without a
 * session and are rejected the same way that example rejects them.
 */
@UseGuards(ApiKeyGuard)
@Throttle({ default: { limit: 300, ttl: 60000 } })
@Controller('mcp')
export class McpController {
  private readonly logger = new Logger(McpController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tasksService: TasksService,
    private readonly taskCommentsService: TaskCommentsService,
    private readonly projectsService: ProjectsService,
    private readonly conflictsService: ConflictsService,
    private readonly notificationsService: NotificationsService,
    @Inject(PROJECT_REPOSITORY_PROVIDER)
    private readonly repositoryProvider: ProjectRepositoryProvider,
  ) {}

  @Post()
  async handlePost(@Req() req: Request, @Res() res: Response): Promise<void> {
    const actorId = (req as Request & { user: JwtPayload }).user.sub;
    const server = new McpServer({ name: 'pmhybrid', version: '1.0.0' });
    const context = {
      prisma: this.prisma,
      tasksService: this.tasksService,
      taskCommentsService: this.taskCommentsService,
      actorId,
    };
    registerTaskTools(server, context);
    registerWorkflowTools(server, {
      ...context,
      projectsService: this.projectsService,
      conflictsService: this.conflictsService,
      notificationsService: this.notificationsService,
      repositoryProvider: this.repositoryProvider,
      docsPathOf: async (projectId) =>
        (
          await this.prisma.project.findUniqueOrThrow({
            where: { id: projectId },
            select: { docsPath: true },
          })
        ).docsPath,
    });
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    try {
      // Registered before handleRequest, not after: for a non-streaming
      // JSON reply, `handleRequest` resolves only once the response is
      // already written, and 'close' can already have fired by then — a
      // listener attached afterward attaches to an already-closed
      // response and never runs, leaking this server/transport pair.
      res.on('close', () => {
        void transport.close();
        void server.close();
      });
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      this.logger.error(`MCP request handling failed: ${String(error)}`);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal error' },
          id: null,
        });
      }
    }
  }

  @Get()
  handleGet(@Res() res: Response): void {
    res.writeHead(405).end(JSON.stringify(METHOD_NOT_ALLOWED_BODY));
  }

  @Delete()
  handleDelete(@Res() res: Response): void {
    res.writeHead(405).end(JSON.stringify(METHOD_NOT_ALLOWED_BODY));
  }
}
