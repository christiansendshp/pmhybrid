import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { TaskPriority, TaskStatus } from '@pmhybrid/shared-types';
import { z } from 'zod';
import { assertProjectMember } from '../../common/guards/project-member.guard.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { TaskCommentsService } from '../tasks/task-comments.service.js';
import { TasksService } from '../tasks/tasks.service.js';

export interface McpToolContext {
  prisma: PrismaService;
  tasksService: TasksService;
  taskCommentsService: TaskCommentsService;
  actorId: string;
}

function textResult(value: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] };
}

/**
 * Every tool call is `guarded`: no route params means no `ProjectMemberGuard`
 * to enforce membership, and no global `ValidationPipe`/`HttpExceptionFilter`
 * to turn a thrown `HttpException` into an HTTP status. Both are done here
 * instead, ending in a normal `CallToolResult` (`isError: true`, never a
 * thrown error) so an MCP client sees a usable protocol-level error rather
 * than an opaque transport failure.
 */
export async function guarded(
  ctx: McpToolContext,
  projectId: string,
  action: () => Promise<unknown>,
): Promise<CallToolResult> {
  try {
    await assertProjectMember(ctx.prisma, projectId, ctx.actorId);
    return textResult(await action());
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { content: [{ type: 'text', text: message }], isError: true };
  }
}

/**
 * Task tools for an MCP-capable agent client (Roadmap GAP-30, brief
 * §27/§29). Thin adapters over `TasksService`'s existing methods — same
 * permission checks, same audit trail, same `origin: 'API'` GAP-24 already
 * gives an agent's `X-API-Key` REST call — this is a new transport onto
 * behavior that already exists, not a new authorization model.
 *
 * `add_comment`/`list_comments` (Roadmap GAP-31) are the ticket's third
 * named verb, adapted over `TaskCommentsService` the same way -- built with
 * a REST surface (`TaskCommentsController`) from the start, so a human can
 * always read what an agent writes here, not an MCP-only capability.
 */
export function registerTaskTools(
  server: McpServer,
  ctx: McpToolContext,
): void {
  server.registerTool(
    'list_tasks',
    {
      description:
        'List tasks in a project the caller is a member of, with optional filters.',
      inputSchema: {
        projectId: z.string(),
        phaseId: z.string().optional(),
        epicId: z.string().optional(),
        status: z.enum(TaskStatus).optional(),
        assigneeActorId: z.string().optional(),
      },
    },
    ({ projectId, phaseId, epicId, status, assigneeActorId }) =>
      guarded(ctx, projectId, () =>
        ctx.tasksService.findAllForProject(projectId, {
          phaseId,
          epicId,
          status,
          assigneeActorId,
        }),
      ),
  );

  server.registerTool(
    'get_task',
    {
      description: 'Read a single task by id.',
      inputSchema: { projectId: z.string(), taskId: z.string() },
    },
    ({ projectId, taskId }) =>
      guarded(ctx, projectId, () =>
        ctx.tasksService.findById(projectId, taskId),
      ),
  );

  server.registerTool(
    'update_task',
    {
      description:
        "Update a task's editable fields. Status and assignee are not included here -- use transition_task for status.",
      inputSchema: {
        projectId: z.string(),
        taskId: z.string(),
        title: z.string().min(1).optional(),
        description: z.string().optional(),
        acceptanceCriteria: z.string().min(1).optional(),
        priority: z.enum(TaskPriority).optional(),
        progressPercent: z.number().int().min(0).max(100).optional(),
        dueDate: z.string().optional(),
      },
    },
    ({ projectId, taskId, ...patch }) =>
      guarded(ctx, projectId, () =>
        ctx.tasksService.update(projectId, taskId, patch, ctx.actorId, 'API'),
      ),
  );

  server.registerTool(
    'transition_task',
    {
      description:
        'Move a task to a new Kanban status, subject to the same permission rules the UI enforces.',
      inputSchema: {
        projectId: z.string(),
        taskId: z.string(),
        status: z.enum(TaskStatus),
      },
    },
    ({ projectId, taskId, status }) =>
      guarded(ctx, projectId, () =>
        ctx.tasksService.transition(
          projectId,
          taskId,
          status,
          ctx.actorId,
          'API',
        ),
      ),
  );

  server.registerTool(
    'list_comments',
    {
      description: "List a task's comments, oldest first.",
      inputSchema: { projectId: z.string(), taskId: z.string() },
    },
    ({ projectId, taskId }) =>
      guarded(ctx, projectId, () =>
        ctx.taskCommentsService.list(projectId, taskId),
      ),
  );

  server.registerTool(
    'add_comment',
    {
      description: 'Add a comment to a task.',
      inputSchema: {
        projectId: z.string(),
        taskId: z.string(),
        body: z.string().min(1),
      },
    },
    ({ projectId, taskId, body }) =>
      guarded(ctx, projectId, () =>
        ctx.taskCommentsService.add(
          projectId,
          taskId,
          { body },
          ctx.actorId,
          'API',
        ),
      ),
  );
}
