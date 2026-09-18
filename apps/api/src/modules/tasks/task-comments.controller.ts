import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import type { AuditOrigin } from '@prisma/client';
import { CurrentActorId } from '../../common/decorators/current-actor-id.decorator.js';
import { CurrentAuditOrigin } from '../../common/decorators/current-audit-origin.decorator.js';
import { ProjectMemberGuard } from '../../common/guards/project-member.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CreateTaskCommentDto } from './dto/create-task-comment.dto.js';
import { TaskCommentsService } from './task-comments.service.js';

/**
 * Roadmap GAP-31: no permission beyond project membership — "any
 * authenticated member can read them" (the ticket's own wording), and
 * writing follows the same "any member can edit" call `TasksController`
 * already makes for create/update/dependency declaration.
 */
@UseGuards(JwtAuthGuard, ProjectMemberGuard)
@Controller('projects/:projectId/tasks/:taskId/comments')
export class TaskCommentsController {
  constructor(private readonly taskComments: TaskCommentsService) {}

  @Get()
  list(@Param('projectId') projectId: string, @Param('taskId') taskId: string) {
    return this.taskComments.list(projectId, taskId);
  }

  @Post()
  add(
    @Param('projectId') projectId: string,
    @Param('taskId') taskId: string,
    @Body() dto: CreateTaskCommentDto,
    @CurrentActorId() requesterActorId: string,
    @CurrentAuditOrigin() origin: AuditOrigin,
  ) {
    return this.taskComments.add(
      projectId,
      taskId,
      dto,
      requesterActorId,
      origin,
    );
  }
}
