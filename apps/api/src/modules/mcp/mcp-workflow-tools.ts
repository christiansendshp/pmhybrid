import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ForbiddenException } from '@nestjs/common';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { TaskPriority, TaskStatus } from '@pmhybrid/shared-types';
import { z } from 'zod';
import { LIMITS } from '../../common/dto-limits.js';
import type { ProjectRepositoryProvider } from '../git-providers/project-repository-provider.interface.js';
import { readRulesDocument } from '../git-providers/read-rules-document.js';
import { resolveDocumentFilename } from '../roadmap/document-kind.util.js';
import { guarded, type McpToolContext } from './mcp-tools.js';

/** What the workflow tools need on top of the task tools' context. */
export interface McpWorkflowContext extends McpToolContext {
  projectsService: {
    findAllForActor(actorId: string): Promise<
      {
        id: string;
        name: string;
        description: string | null;
        status: string;
        summary: unknown;
      }[]
    >;
    findById(id: string): Promise<{
      id: string;
      name: string;
      description: string | null;
      status: string;
    }>;
  };
  conflictsService: {
    findAllForProject(
      projectId: string,
      resolved?: boolean,
    ): Promise<unknown[]>;
  };
  notificationsService: {
    findAllForActor(actorId: string): Promise<{ readAt: Date | null }[]>;
    markAllRead(actorId: string): Promise<{ count: number }>;
  };
  repositoryProvider: ProjectRepositoryProvider;
  /** Who the caller is, as PM Hub knows it (Roadmap TASK-04). */
  identity: { whoami(actorId: string): Promise<unknown> };
  /** Where each project's documents live, so a document can be read by project id. */
  docsPathOf(projectId: string): Promise<string>;
}

export const DOCUMENT_KINDS = [
  'roadmap',
  'agentslog',
  'product-description',
  'stack-tech',
  'features',
  'agents-rules',
] as const;

interface ContextCard {
  id: string;
  externalId: string | null;
  title: string;
  status: string;
  roadmapTable: string | null;
  blockedReason?: string | null;
  assigneeActorId: string | null;
  computedProgress: number;
}

/**
 * What an agent needs to start working on a project, in one call (Roadmap
 * GAP-36b): where the project stands, what is assigned to the caller, and what
 * is blocked — without listing every task and doing the arithmetic itself.
 */
export function buildProjectContext(
  project: {
    id: string;
    name: string;
    description: string | null;
    status: string;
  },
  cards: readonly ContextCard[],
  actorId: string,
  openConflicts: number,
) {
  const statusCounts: Record<string, number> = {
    PENDIENTE: 0,
    ASIGNADA: 0,
    EN_DESARROLLO: 0,
    QA: 0,
    TERMINADA: 0,
  };
  for (const card of cards) {
    statusCounts[card.status] = (statusCounts[card.status] ?? 0) + 1;
  }
  const brief = (card: ContextCard) => ({
    id: card.id,
    externalId: card.externalId,
    title: card.title,
    status: card.status,
    ...(card.blockedReason ? { blockedReason: card.blockedReason } : {}),
  });
  const total = cards.length;
  return {
    project: {
      id: project.id,
      name: project.name,
      description: project.description,
      status: project.status,
    },
    totalTasks: total,
    statusCounts,
    openConflicts,
    // Assigned to the caller and not finished: what to pick up next.
    myOpenTasks: cards
      .filter(
        (card) =>
          card.assigneeActorId === actorId && card.status !== 'TERMINADA',
      )
      .map(brief),
    blocked: cards.filter((card) => card.roadmapTable === 'BLOCKED').map(brief),
  };
}

/** A QA card as the review queue reads it: what the service gives a board card. */
export interface ReviewQueueCard {
  id: string;
  externalId: string | null;
  title: string;
  assignee: { displayName: string } | null;
  reviewerActorId: string | null;
  reviewer: { id: string; displayName: string } | null;
  reviewRequestedAt: Date | null;
  statusChangedAt: Date | null;
}

/**
 * The tasks waiting in QA across the projects the caller belongs to, the longest waiting first
 * (Roadmap TASK-10). It counts from when a reviewer was asked for, else from when the task entered QA.
 * `reviewer` keeps those asked of one actor: an id, or `me` for the caller; absent keeps every one.
 */
export function buildReviewQueue(
  projects: readonly { id: string; name: string }[],
  qaCardsByProject: ReadonlyMap<string, readonly ReviewQueueCard[]>,
  actorId: string,
  reviewer?: string,
) {
  const wanted = reviewer === 'me' ? actorId : reviewer;
  return projects
    .flatMap((project) =>
      (qaCardsByProject.get(project.id) ?? []).map((card) => ({
        projectId: project.id,
        projectName: project.name,
        taskId: card.id,
        externalId: card.externalId,
        title: card.title,
        assignee: card.assignee?.displayName ?? null,
        reviewer: card.reviewer
          ? { id: card.reviewer.id, displayName: card.reviewer.displayName }
          : null,
        waitingSince: card.reviewRequestedAt ?? card.statusChangedAt,
        reviewerActorId: card.reviewerActorId,
      })),
    )
    .filter((entry) => !wanted || entry.reviewerActorId === wanted)
    .sort(
      (a, b) =>
        (a.waitingSince?.getTime() ?? Infinity) -
        (b.waitingSince?.getTime() ?? Infinity),
    )
    .map(({ reviewerActorId: _reviewerActorId, ...entry }) => entry);
}

function fail(error: unknown): CallToolResult {
  const message = error instanceof Error ? error.message : String(error);
  return { content: [{ type: 'text', text: message }], isError: true };
}

function textResult(value: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] };
}

/**
 * The tools that turn the task tools into a workflow an agent can run alone
 * (Roadmap GAP-36b): find its projects, get the picture, claim work, create
 * work, see the conflicts, read a document. Every one is a thin adapter over the
 * service REST calls — the same membership check, the same permissions, the same
 * audit trail (`origin: 'API'`) — so nothing here is a new way in.
 */
export function registerWorkflowTools(
  server: McpServer,
  ctx: McpWorkflowContext,
): void {
  server.registerTool(
    'list_projects',
    {
      description:
        'List the projects the caller is a member of, with a short summary each. Start here.',
      inputSchema: {},
    },
    async () => {
      try {
        const projects = await ctx.projectsService.findAllForActor(ctx.actorId);
        return textResult(
          projects.map((project) => ({
            id: project.id,
            name: project.name,
            description: project.description,
            status: project.status,
            summary: project.summary,
          })),
        );
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    'whoami',
    {
      description:
        'Who the caller is in PM Hub: its id, display name, kind, model and stage role, the exact ledger name to pass to the skill as <agent> (use it as it is, every time), its aliases, and the projects it is a member of with what it may do in each. Nothing of any other actor.',
      inputSchema: {},
    },
    async () => {
      try {
        return textResult(await ctx.identity.whoami(ctx.actorId));
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    'list_notifications',
    {
      description:
        "The caller's notifications, newest first: a task assigned to it or taken from it, a comment on its task, a conflict or a failed sync in its projects. With unreadOnly, only those not yet acknowledged.",
      inputSchema: { unreadOnly: z.boolean().optional() },
    },
    async ({ unreadOnly }) => {
      try {
        const all = await ctx.notificationsService.findAllForActor(ctx.actorId);
        return textResult(
          unreadOnly ? all.filter((n) => n.readAt === null) : all,
        );
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    'mark_notifications_read',
    {
      description:
        "Acknowledge every unread notification of the caller (nobody else's). Idempotent.",
      inputSchema: {},
    },
    async () => {
      try {
        return textResult(
          await ctx.notificationsService.markAllRead(ctx.actorId),
        );
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    'get_context',
    {
      description:
        "One call for the state of a project: its figures, the caller's own open tasks, what is blocked and how many conflicts are open.",
      inputSchema: { projectId: z.string() },
    },
    ({ projectId }) =>
      guarded(ctx, projectId, async () => {
        const [project, cards, conflicts] = await Promise.all([
          ctx.projectsService.findById(projectId),
          ctx.tasksService.findAllForProject(projectId, {}),
          ctx.conflictsService.findAllForProject(projectId, false),
        ]);
        return buildProjectContext(
          project,
          cards as unknown as ContextCard[],
          ctx.actorId,
          conflicts.length,
        );
      }),
  );

  server.registerTool(
    'claim_task',
    {
      description:
        'Take a task: assign it to the caller, and with start=true also move it to EN_DESARROLLO. Refused when the task is locked to someone else or the caller may not.',
      inputSchema: {
        projectId: z.string(),
        taskId: z.string(),
        start: z.boolean().optional(),
      },
    },
    ({ projectId, taskId, start }) =>
      guarded(ctx, projectId, async () => {
        const assigned = await ctx.tasksService.assign(
          projectId,
          taskId,
          ctx.actorId,
          ctx.actorId,
          'API',
        );
        if (!start) {
          return assigned;
        }
        return ctx.tasksService.transition(
          projectId,
          taskId,
          TaskStatus.EN_DESARROLLO,
          ctx.actorId,
          'API',
        );
      }),
  );

  server.registerTool(
    'handoff_task',
    {
      description:
        "Hand a task you are developing over to review: the task moves from EN_DESARROLLO to QA, the optional reviewer is asked, and the note is kept as a comment (and written into the project ledger when the project records the QA handoff). Only the task's assignee can hand it over.",
      inputSchema: {
        projectId: z.string(),
        taskId: z.string(),
        note: z.string().min(1).max(LIMITS.NOTE).optional(),
        reviewerActorId: z.string().optional(),
      },
    },
    ({ projectId, taskId, note, reviewerActorId }) =>
      guarded(ctx, projectId, async () => {
        const task = await ctx.tasksService.findById(projectId, taskId);
        if (task.assigneeActorId !== ctx.actorId) {
          throw new ForbiddenException(
            'Only the assignee can hand a task over to review',
          );
        }
        const moved = await ctx.tasksService.transition(
          projectId,
          taskId,
          TaskStatus.QA,
          ctx.actorId,
          'API',
          reviewerActorId,
          note,
        );
        const comment = note
          ? await ctx.taskCommentsService.add(
              projectId,
              taskId,
              { body: `Handed to review: ${note}` },
              ctx.actorId,
              'API',
            )
          : null;
        return { task: moved, comment };
      }),
  );

  server.registerTool(
    'review_task',
    {
      description:
        'Answer the handoff of a task in QA. PASS approves it (the task becomes TERMINADA, and needs the permission to approve QA); FAIL returns it to development (needs the permission to reject QA). The note is required, kept as a comment, and written into the project ledger when the project records the QA handoff.',
      inputSchema: {
        projectId: z.string(),
        taskId: z.string(),
        result: z.enum(['PASS', 'FAIL']),
        note: z.string().min(1).max(LIMITS.NOTE),
      },
    },
    ({ projectId, taskId, result, note }) =>
      guarded(ctx, projectId, async () => {
        const moved = await ctx.tasksService.transition(
          projectId,
          taskId,
          result === 'PASS' ? TaskStatus.TERMINADA : TaskStatus.EN_DESARROLLO,
          ctx.actorId,
          'API',
          undefined,
          note,
        );
        const comment = await ctx.taskCommentsService.add(
          projectId,
          taskId,
          { body: `Review ${result}: ${note}` },
          ctx.actorId,
          'API',
        );
        return { task: moved, comment };
      }),
  );

  server.registerTool(
    'list_review_queue',
    {
      description:
        'The tasks waiting in QA across the projects the caller is a member of, the longest waiting first. With reviewer = "me" only those that asked the caller to review them; with an actor id, those asked of that actor.',
      inputSchema: { reviewer: z.string().optional() },
    },
    async ({ reviewer }) => {
      try {
        const projects = await ctx.projectsService.findAllForActor(ctx.actorId);
        const entries = await Promise.all(
          projects.map(
            async (project) =>
              [
                project.id,
                (await ctx.tasksService.findAllForProject(project.id, {
                  status: TaskStatus.QA,
                })) as unknown as ReviewQueueCard[],
              ] as const,
          ),
        );
        return textResult(
          buildReviewQueue(projects, new Map(entries), ctx.actorId, reviewer),
        );
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    'create_task',
    {
      description:
        'Create a task (or a subtask with parentTaskId). Title and acceptance criteria are required. Send the same idempotencyKey when retrying so a request that timed out cannot create two.',
      inputSchema: {
        projectId: z.string(),
        title: z.string().min(1).max(300),
        acceptanceCriteria: z.string().min(1).max(5000),
        description: z.string().max(10000).optional(),
        priority: z.enum(TaskPriority).optional(),
        parentTaskId: z.string().optional(),
        dueDate: z.string().optional(),
        idempotencyKey: z.string().min(1).max(128).optional(),
      },
    },
    ({ projectId, idempotencyKey, ...task }) =>
      guarded(ctx, projectId, () =>
        ctx.tasksService.create(
          projectId,
          task as never,
          ctx.actorId,
          'API',
          idempotencyKey,
        ),
      ),
  );

  server.registerTool(
    'list_conflicts',
    {
      description:
        "List a project's conflicts between its documents and PM Hub (open ones by default). Resolving one needs a person with the permission.",
      inputSchema: { projectId: z.string(), resolved: z.boolean().optional() },
    },
    ({ projectId, resolved }) =>
      guarded(ctx, projectId, () =>
        ctx.conflictsService.findAllForProject(projectId, resolved ?? false),
      ),
  );

  server.registerTool(
    'read_document',
    {
      description:
        "Read one of a project's documents as text (the Roadmap, the Agentslog, the rules, ...).",
      inputSchema: { projectId: z.string(), kind: z.enum(DOCUMENT_KINDS) },
    },
    ({ projectId, kind }) =>
      guarded(ctx, projectId, async () => {
        const docsPath = await ctx.docsPathOf(projectId);
        if (kind === 'agents-rules') {
          return (await readRulesDocument(ctx.repositoryProvider, docsPath))
            .content;
        }
        return ctx.repositoryProvider.readFile(
          docsPath,
          resolveDocumentFilename(kind),
        );
      }),
  );
}
