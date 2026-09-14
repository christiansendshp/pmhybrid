import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TaskStatus } from '@pmhybrid/shared-types';
import { PermissionsResolverService } from '../../common/permissions-resolver.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { WriteBackService } from '../synchronization/write-back.service.js';
import { AddDependencyDto } from './dto/add-dependency.dto.js';
import { CreateTaskDto } from './dto/create-task.dto.js';
import { UpdateTaskDto } from './dto/update-task.dto.js';
import { ProgressRollupService } from './progress-rollup.service.js';
import {
  findTransitionRule,
  isAssigneeLocked,
  REASSIGN_LOCKED_PERMISSION,
} from './task-status-policy.js';
import { PERMISSIONS } from '@pmhybrid/shared-types';

export interface TaskListFilters {
  phaseId?: string;
  epicId?: string;
  status?: TaskStatus;
  assigneeActorId?: string;
}

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly progressRollup: ProgressRollupService,
    private readonly permissionsResolver: PermissionsResolverService,
    private readonly writeBack: WriteBackService,
  ) {}

  findAllForProject(projectId: string, filters: TaskListFilters) {
    return this.prisma.task.findMany({
      where: { projectId, ...filters },
      orderBy: { createdAt: 'asc' },
    });
  }

  async findById(projectId: string, taskId: string) {
    await this.getOwned(projectId, taskId);
    const [full, computedProgress] = await Promise.all([
      this.prisma.task.findUniqueOrThrow({
        where: { id: taskId },
        include: {
          subtasks: true,
          dependencies: {
            include: {
              dependsOnTask: {
                select: { id: true, title: true, status: true },
              },
            },
          },
          assignments: {
            orderBy: { assignedAt: 'desc' },
            include: { actor: { select: { id: true, displayName: true } } },
          },
          assignee: { select: { id: true, displayName: true, kind: true } },
        },
      }),
      this.progressRollup.computeTaskProgress(taskId),
    ]);
    return { ...full, computedProgress };
  }

  /** Task creation is a write-back trigger (docs/synchronization.md) — mints an externalId and appends an Agentslog entry. */
  async create(
    projectId: string,
    dto: CreateTaskDto,
    requesterActorId: string,
  ) {
    await this.assertHierarchyRefs(projectId, dto);
    const task = await this.prisma.task.create({
      data: {
        projectId,
        sourceOrigin: 'UI',
        title: dto.title,
        description: dto.description,
        phaseId: dto.phaseId,
        epicId: dto.epicId,
        templateId: dto.templateId,
        parentTaskId: dto.parentTaskId,
        priority: dto.priority,
        acceptanceCriteria: dto.acceptanceCriteria,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        estimatedDate: dto.estimatedDate
          ? new Date(dto.estimatedDate)
          : undefined,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        progressPercent: dto.progressPercent,
      },
    });
    return this.writeBack.recordTaskEvent(
      projectId,
      task.id,
      'CREATED',
      requesterActorId,
    );
  }

  async update(projectId: string, taskId: string, dto: UpdateTaskDto) {
    await this.getOwned(projectId, taskId);
    await this.assertHierarchyRefs(projectId, dto);
    if (dto.parentTaskId) {
      await this.assertNoParentCycle(taskId, dto.parentTaskId);
    }
    return this.prisma.task.update({
      where: { id: taskId },
      data: {
        title: dto.title,
        description: dto.description,
        phaseId: dto.phaseId,
        epicId: dto.epicId,
        templateId: dto.templateId,
        parentTaskId: dto.parentTaskId,
        priority: dto.priority,
        acceptanceCriteria: dto.acceptanceCriteria,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        estimatedDate: dto.estimatedDate
          ? new Date(dto.estimatedDate)
          : undefined,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        progressPercent: dto.progressPercent,
      },
    });
  }

  /**
   * Dynamic permission (task.assign normally, task.reassign.locked while
   * EN_DESARROLLO — brief §7) can't be expressed by a static
   * @RequirePermission decorator, so it's resolved here instead.
   */
  async assign(
    projectId: string,
    taskId: string,
    actorId: string,
    requesterActorId: string,
  ) {
    const task = await this.getOwned(projectId, taskId);

    const wasLocked = isAssigneeLocked(toSharedStatus(task.status));
    const requiredPermission = wasLocked
      ? REASSIGN_LOCKED_PERMISSION
      : PERMISSIONS.TASK_ASSIGN;
    const allowed = await this.permissionsResolver.hasPermission(
      requesterActorId,
      requiredPermission,
      projectId,
    );
    if (!allowed) {
      throw new ForbiddenException(`Missing permission: ${requiredPermission}`);
    }

    const member = await this.prisma.projectMember.findUnique({
      where: { projectId_actorId: { projectId, actorId } },
    });
    if (!member || !member.isActive) {
      throw new BadRequestException('Assignee must be a project member');
    }

    // ASIGNADA literally means "has an assignee" — a PENDIENTE task that
    // gets assigned moves there too, using the same task.assign permission
    // already checked above (matches the PENDIENTE->ASIGNADA transition rule).
    const nextStatus =
      task.status === TaskStatus.PENDIENTE ? TaskStatus.ASIGNADA : task.status;

    await this.prisma.$transaction(async (tx) => {
      await tx.taskAssignment.updateMany({
        where: { taskId, unassignedAt: null },
        data: { unassignedAt: new Date() },
      });
      await tx.taskAssignment.create({
        data: { taskId, actorId, assignedByActorId: requesterActorId },
      });
      await tx.auditEvent.create({
        data: {
          actorId: requesterActorId,
          entityType: 'Task',
          entityId: taskId,
          operation: 'REASSIGN',
          // Includes `status` too when the PENDIENTE->ASIGNADA side effect
          // fires — sync's per-field conflict check (docs/synchronization.md
          // step 5) reads this newValue to know which fields the UI touched.
          previousValue: {
            assigneeActorId: task.assigneeActorId,
            status: task.status,
          },
          newValue: { assigneeActorId: actorId, status: nextStatus },
          origin: 'UI',
        },
      });
      return tx.task.update({
        where: { id: taskId },
        data: { assigneeActorId: actorId, status: nextStatus },
      });
    });

    // Locked reassignment is a write-back trigger (docs/synchronization.md);
    // an ordinary PENDIENTE/ASIGNADA assignment is UI-only.
    if (wasLocked) {
      return this.writeBack.recordTaskEvent(
        projectId,
        taskId,
        'LOCKED_REASSIGN',
        requesterActorId,
      );
    }
    return this.getOwned(projectId, taskId);
  }

  /** Kanban transition (docs/domain-model.md, task-status-policy.ts) — the one legal way to change Task.status. */
  async transition(
    projectId: string,
    taskId: string,
    toStatus: TaskStatus,
    requesterActorId: string,
  ) {
    const task = await this.getOwned(projectId, taskId);

    const rule = findTransitionRule(toSharedStatus(task.status), toStatus);
    if (!rule) {
      throw new BadRequestException(
        `Cannot transition from ${task.status} to ${toStatus}`,
      );
    }
    const allowed = await this.permissionsResolver.hasPermission(
      requesterActorId,
      rule.requiredPermission,
      projectId,
    );
    if (!allowed) {
      throw new ForbiddenException(
        `Missing permission: ${rule.requiredPermission}`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.task.update({
        where: { id: taskId },
        data: {
          status: toStatus,
          assigneeLockedAt: isAssigneeLocked(toStatus) ? new Date() : null,
        },
      });
      await tx.auditEvent.create({
        data: {
          actorId: requesterActorId,
          entityType: 'Task',
          entityId: taskId,
          operation: 'STATUS_CHANGE',
          previousValue: { status: task.status },
          newValue: { status: toStatus },
          origin: 'UI',
        },
      });
      return updated;
    });

    // Only these two transitions are write-back triggers
    // (docs/synchronization.md step 3) — every other status change stays UI-only.
    if (toStatus === TaskStatus.EN_DESARROLLO) {
      return this.writeBack.recordTaskEvent(
        projectId,
        taskId,
        'STATUS_EN_DESARROLLO',
        requesterActorId,
      );
    }
    if (toStatus === TaskStatus.TERMINADA) {
      return this.writeBack.recordTaskEvent(
        projectId,
        taskId,
        'STATUS_TERMINADA',
        requesterActorId,
      );
    }
    return this.getOwned(projectId, taskId);
  }

  async addDependency(
    projectId: string,
    taskId: string,
    dto: AddDependencyDto,
  ) {
    await this.getOwned(projectId, taskId);

    if (dto.dependsOnTaskId) {
      if (dto.dependsOnTaskId === taskId) {
        throw new BadRequestException('A task cannot depend on itself');
      }
      await this.getOwned(projectId, dto.dependsOnTaskId);
      await this.assertNoDependencyCycle(taskId, dto.dependsOnTaskId);
    }

    return this.prisma.taskDependency.create({
      data: {
        taskId,
        dependsOnTaskId: dto.dependsOnTaskId,
        rawExternalRef: dto.rawExternalRef,
      },
    });
  }

  private async getOwned(projectId: string, taskId: string) {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, projectId },
    });
    if (!task) {
      throw new NotFoundException('Task not found');
    }
    return task;
  }

  private async assertHierarchyRefs(
    projectId: string,
    dto: Pick<
      CreateTaskDto,
      'phaseId' | 'epicId' | 'templateId' | 'parentTaskId'
    >,
  ) {
    if (
      dto.phaseId &&
      !(await this.prisma.phase.findFirst({
        where: { id: dto.phaseId, projectId },
      }))
    ) {
      throw new BadRequestException('phaseId does not belong to this project');
    }
    if (
      dto.epicId &&
      !(await this.prisma.epic.findFirst({
        where: { id: dto.epicId, projectId },
      }))
    ) {
      throw new BadRequestException('epicId does not belong to this project');
    }
    if (
      dto.templateId &&
      !(await this.prisma.template.findFirst({
        where: { id: dto.templateId, projectId },
      }))
    ) {
      throw new BadRequestException(
        'templateId does not belong to this project',
      );
    }
    if (
      dto.parentTaskId &&
      !(await this.prisma.task.findFirst({
        where: { id: dto.parentTaskId, projectId },
      }))
    ) {
      throw new BadRequestException(
        'parentTaskId does not belong to this project',
      );
    }
  }

  /** A re-parented subtask can't become an ancestor of its own new parent — would deadlock progress rollup's recursion. */
  private async assertNoParentCycle(taskId: string, newParentId: string) {
    if (taskId === newParentId) {
      throw new BadRequestException('A task cannot be its own parent');
    }
    let current: string | null = newParentId;
    const seen = new Set<string>();
    while (current) {
      if (current === taskId) {
        throw new BadRequestException('parentTaskId would create a cycle');
      }
      if (seen.has(current)) {
        break;
      }
      seen.add(current);
      const parent: { parentTaskId: string | null } | null =
        await this.prisma.task.findUnique({
          where: { id: current },
          select: { parentTaskId: true },
        });
      current = parent?.parentTaskId ?? null;
    }
  }

  /** Bounded DFS: adding taskId -> dependsOnTaskId is a cycle iff dependsOnTaskId can already reach taskId. */
  private async assertNoDependencyCycle(
    taskId: string,
    dependsOnTaskId: string,
  ) {
    const visited = new Set<string>();
    const stack = [dependsOnTaskId];
    while (stack.length > 0) {
      const current = stack.pop()!;
      if (current === taskId) {
        throw new BadRequestException('This dependency would create a cycle');
      }
      if (visited.has(current)) {
        continue;
      }
      visited.add(current);
      const deps = await this.prisma.taskDependency.findMany({
        where: { taskId: current },
        select: { dependsOnTaskId: true },
      });
      for (const dep of deps) {
        if (dep.dependsOnTaskId) {
          stack.push(dep.dependsOnTaskId);
        }
      }
    }
  }
}

/** Prisma's generated TaskStatus and shared-types' hand-authored one are structurally identical string unions but nominally distinct types. */
function toSharedStatus(status: string): TaskStatus {
  return status as TaskStatus;
}
