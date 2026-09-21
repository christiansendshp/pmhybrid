import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { PERMISSIONS } from '@pmhybrid/shared-types';
import { CurrentActorId } from '../../common/decorators/current-actor-id.decorator.js';
import { CurrentAuditOrigin } from '../../common/decorators/current-audit-origin.decorator.js';
import type { AuditOrigin } from '@prisma/client';
import { RequirePermission } from '../../common/decorators/require-permission.decorator.js';
import { PermissionGuard } from '../../common/guards/permission.guard.js';
import { ProjectMemberGuard } from '../../common/guards/project-member.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { ListTasksQueryDto } from './dto/list-tasks-query.dto.js';
import { AddDependencyDto } from './dto/add-dependency.dto.js';
import { AssignTaskDto } from './dto/assign-task.dto.js';
import { CreateTaskDto } from './dto/create-task.dto.js';
import { TransitionTaskDto } from './dto/transition-task.dto.js';
import { UpdateTaskDto } from './dto/update-task.dto.js';
import { parseIdempotencyKey } from './idempotency.util.js';
import { TasksService } from './tasks.service.js';

/**
 * Base gate is project membership. Reading is open to every member; writing
 * is not (Roadmap SECURITY-02, superseding the original "any member can
 * edit" FASE-07 scope call, which left the read-only VIEWER role — and a
 * member holding no role at all — able to create and edit tasks):
 * create/update/dependency declaration need `task.write`, checked inside
 * TasksService so the MCP tools that call it directly are held to the same
 * rule; removal needs task.delete via PermissionGuard here; /assign and
 * /transition resolve their own dynamic permission inside TasksService (see
 * its docstring). Commenting is deliberately left to any member (the
 * comments ticket, GAP-31, specifies it).
 */
@UseGuards(JwtAuthGuard, ProjectMemberGuard)
@Controller('projects/:projectId/tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Get()
  findAll(
    @Param('projectId') projectId: string,
    @Query() query: ListTasksQueryDto,
  ) {
    return this.tasksService.findAllForProject(projectId, {
      phaseId: query.phaseId,
      epicId: query.epicId,
      status: query.status,
      assigneeActorId: query.assigneeActorId,
    });
  }

  @Get(':taskId')
  findOne(
    @Param('projectId') projectId: string,
    @Param('taskId') taskId: string,
  ) {
    return this.tasksService.findById(projectId, taskId);
  }

  @Post()
  create(
    @Param('projectId') projectId: string,
    @Body() dto: CreateTaskDto,
    @CurrentActorId() requesterActorId: string,
    @CurrentAuditOrigin() origin: AuditOrigin,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.tasksService.create(
      projectId,
      dto,
      requesterActorId,
      origin,
      parseIdempotencyKey(idempotencyKey),
    );
  }

  @Patch(':taskId')
  update(
    @Param('projectId') projectId: string,
    @Param('taskId') taskId: string,
    @Body() dto: UpdateTaskDto,
    @CurrentActorId() requesterActorId: string,
    @CurrentAuditOrigin() origin: AuditOrigin,
  ) {
    return this.tasksService.update(
      projectId,
      taskId,
      dto,
      requesterActorId,
      origin,
    );
  }

  @Delete(':taskId')
  @UseGuards(PermissionGuard)
  @RequirePermission(PERMISSIONS.TASK_DELETE)
  remove(
    @Param('projectId') projectId: string,
    @Param('taskId') taskId: string,
    @CurrentActorId() requesterActorId: string,
    @CurrentAuditOrigin() origin: AuditOrigin,
  ) {
    return this.tasksService.remove(
      projectId,
      taskId,
      requesterActorId,
      origin,
    );
  }

  @Post(':taskId/assign')
  assign(
    @Param('projectId') projectId: string,
    @Param('taskId') taskId: string,
    @Body() dto: AssignTaskDto,
    @CurrentActorId() requesterActorId: string,
    @CurrentAuditOrigin() origin: AuditOrigin,
  ) {
    return this.tasksService.assign(
      projectId,
      taskId,
      dto.actorId,
      requesterActorId,
      origin,
    );
  }

  @Post(':taskId/transition')
  transition(
    @Param('projectId') projectId: string,
    @Param('taskId') taskId: string,
    @Body() dto: TransitionTaskDto,
    @CurrentActorId() requesterActorId: string,
    @CurrentAuditOrigin() origin: AuditOrigin,
  ) {
    return this.tasksService.transition(
      projectId,
      taskId,
      dto.status,
      requesterActorId,
      origin,
    );
  }

  @Post(':taskId/dependencies')
  addDependency(
    @Param('projectId') projectId: string,
    @Param('taskId') taskId: string,
    @Body() dto: AddDependencyDto,
    @CurrentActorId() requesterActorId: string,
    @CurrentAuditOrigin() origin: AuditOrigin,
  ) {
    return this.tasksService.addDependency(
      projectId,
      taskId,
      dto,
      requesterActorId,
      origin,
    );
  }
}
