import { Injectable, NotFoundException } from '@nestjs/common';
import type { AuditOrigin } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { CreateTaskCommentDto } from './dto/create-task-comment.dto.js';

/**
 * Roadmap GAP-31: a live, interactive comment thread — human via REST,
 * agent via MCP (`mcp-tools.ts`) — with no document counterpart. Never
 * touches Roadmap.md/Agentslog.md: there is no comment concept in either
 * schema, and this model is not doc-sourced (see docs/domain-model.md).
 */
@Injectable()
export class TaskCommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly events: EventEmitter2,
  ) {}

  async list(projectId: string, taskId: string) {
    await this.getOwnedTask(projectId, taskId);
    return this.prisma.taskComment.findMany({
      where: { taskId },
      orderBy: { createdAt: 'asc' },
      include: {
        author: { select: { id: true, displayName: true, kind: true } },
      },
    });
  }

  async add(
    projectId: string,
    taskId: string,
    dto: CreateTaskCommentDto,
    requesterActorId: string,
    origin: AuditOrigin = 'UI',
  ) {
    const task = await this.getOwnedTask(projectId, taskId);
    const comment = await this.prisma.$transaction(async (tx) => {
      const comment = await tx.taskComment.create({
        data: {
          taskId,
          authorActorId: requesterActorId,
          body: dto.body,
        },
        include: {
          author: { select: { id: true, displayName: true, kind: true } },
        },
      });
      await this.audit.record(
        {
          projectId,
          actorId: requesterActorId,
          entityType: 'TaskComment',
          entityId: comment.id,
          operation: 'CREATE',
          origin,
          newValue: { body: dto.body },
        },
        tx,
      );
      return comment;
    });
    // After the commit; a listener that fails must not fail the comment.
    try {
      await this.events.emitAsync('task.commented', {
        projectId,
        taskId,
        title: task.title,
        assigneeActorId: task.assigneeActorId,
        authorActorId: requesterActorId,
        commentId: comment.id,
      });
    } catch {
      // Notifying is best effort.
    }
    return comment;
  }

  private async getOwnedTask(projectId: string, taskId: string) {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, projectId, deletedAt: null },
    });
    if (!task) {
      throw new NotFoundException('Task not found');
    }
    return task;
  }
}
