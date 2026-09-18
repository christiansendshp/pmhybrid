import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { PERMISSIONS, TaskStatus } from '@pmhybrid/shared-types';
import { CurrentActorId } from '../../common/decorators/current-actor-id.decorator.js';
import { CurrentAuditOrigin } from '../../common/decorators/current-audit-origin.decorator.js';
import type { AuditOrigin } from '@prisma/client';
import { RequirePermission } from '../../common/decorators/require-permission.decorator.js';
import { PermissionGuard } from '../../common/guards/permission.guard.js';
import { ProjectMemberGuard } from '../../common/guards/project-member.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { AddDependencyDto } from './dto/add-dependency.dto.js';
import { AssignTaskDto } from './dto/assign-task.dto.js';
import { CreateTaskDto } from './dto/create-task.dto.js';
import { TransitionTaskDto } from './dto/transition-task.dto.js';
import { UpdateTaskDto } from './dto/update-task.dto.js';
import { TasksService } from './tasks.service.js';

/**
 * Base gate is project membership only — the seeded permission catalog
 * (task.assign, task.status.transition, ...) targets transitions and
 * assignment specifically, so create/update/dependency declaration are left
 * to "any member can edit" (pragmatic FASE-07 scope call). Removal is the
 * exception: it takes a row out of the project's documents, so it needs
 * task.delete. /assign and /transition resolve their own dynamic permission
 * inside TasksService (see its docstring).
 */
@UseGuards(JwtAuthGuard, ProjectMemberGuard)
@Controller('projects/:projectId/tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Get()
  findAll(
    @Param('projectId') projectId: string,
    @Query('phaseId') phaseId?: string,
    @Query('epicId') epicId?: string,
    @Query('status') status?: TaskStatus,
    @Query('assigneeActorId') assigneeActorId?: string,
  ) {
    return this.tasksService.findAllForProject(projectId, {
      phaseId,
      epicId,
      status,
      assigneeActorId,
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
  ) {
    return this.tasksService.create(projectId, dto, requesterActorId, origin);
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
