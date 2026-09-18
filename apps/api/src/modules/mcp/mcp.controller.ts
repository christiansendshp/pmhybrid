import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  Controller,
  Delete,
  Get,
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
import { registerTaskTools } from './mcp-tools.js';
import { TasksService } from '../tasks/tasks.service.js';

const METHOD_NOT_ALLOWED_BODY = {
  jsonrpc: '2.0',
  error: { code: -32000, message: 'Method not allowed.' },
  id: null,
};

/**
 * MCP server for agent task operations (Roadmap GAP-30, brief §27/§29):
 * lets an MCP-capable agent client call `list_tasks`/`get_task`/
 * `update_task`/`transition_task` directly, instead of only via the REST
 * API + API keys (GAP-15). See `mcp-tools.ts` for why "comment" (this
 * ticket's third named verb) is deferred to GAP-31.
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
  ) {}

  @Post()
  async handlePost(@Req() req: Request, @Res() res: Response): Promise<void> {
    const actorId = (req as Request & { user: JwtPayload }).user.sub;
    const server = new McpServer({ name: 'pmhybrid', version: '1.0.0' });
    registerTaskTools(server, {
      prisma: this.prisma,
      tasksService: this.tasksService,
      actorId,
    });
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
      res.on('close', () => {
        void transport.close();
        void server.close();
      });
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
