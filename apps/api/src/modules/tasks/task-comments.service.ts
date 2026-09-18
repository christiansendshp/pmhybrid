import { Injectable, NotFoundException } from '@nestjs/common';
import type { AuditOrigin } from '@prisma/client';
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
    await this.getOwnedTask(projectId, taskId);
    return this.prisma.$transaction(async (tx) => {
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
