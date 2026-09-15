import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TaskStatus } from '@pmhybrid/shared-types';
import { PermissionsResolverService } from '../../common/permissions-resolver.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService, diffFields } from '../audit/audit.service.js';
import {
  type RoadmapFieldEdit,
  WriteBackService,
} from '../synchronization/write-back.service.js';
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

interface HierarchyRefs {
  phaseId?: string | null;
  epicId?: string | null;
  templateId?: string | null;
  parentTaskId?: string | null;
}

/** A PATCH body as it arrives: `undefined` leaves a field alone, `null` clears it. */
type TaskPatch = { [K in keyof UpdateTaskDto]?: UpdateTaskDto[K] | null };

const HIERARCHY_FIELDS = [
  'phaseId',
  'epicId',
  'templateId',
  'parentTaskId',
] as const;
const DATE_FIELDS = ['startDate', 'estimatedDate', 'dueDate'] as const;

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly progressRollup: ProgressRollupService,
    private readonly permissionsResolver: PermissionsResolverService,
    private readonly writeBack: WriteBackService,
    private readonly audit: AuditService,
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
          // Brief §17 "actividad de agentes" — ordered by ingestion, never by
          // the agent-authored (untrusted) timestampFromLog.
          agentLogEvents: {
            orderBy: { createdAt: 'desc' },
            take: 20,
            select: {
              id: true,
              agentName: true,
              statusWord: true,
              summary: true,
              timestampFromLog: true,
              createdAt: true,
            },
          },
        },
      }),
      this.progressRollup.computeTaskProgress(taskId),
    ]);
    return { ...full, computedProgress };
  }

  /**
   * Task creation is a write-back trigger (docs/synchronization.md) — mints an
   * externalId and appends an Agentslog entry. The DTO already refuses an
   * incomplete task (brief §9); this validates the structure it hangs from.
   */
  async create(
    projectId: string,
    dto: CreateTaskDto,
    requesterActorId: string,
  ) {
    await this.assertHierarchy(projectId, dto);
    assertDateOrder(dto);
    const fields = toTaskFields(dto);
    const task = await this.prisma.$transaction(async (tx) => {
      const created = await tx.task.create({
        data: {
          projectId,
          sourceOrigin: 'UI',
          ...fields,
          title: dto.title,
          acceptanceCriteria: dto.acceptanceCriteria,
        },
      });
      await this.audit.record(
        {
          projectId,
          actorId: requesterActorId,
          entityType: 'Task',
          entityId: created.id,
          operation: 'CREATE',
          origin: 'UI',
          newValue: diffFields({}, fields)?.newValue,
        },
        tx,
      );
      return created;
    });
    return this.writeBack.recordTaskEvent(
      projectId,
      task.id,
      'CREATED',
      requesterActorId,
    );
  }

  /**
   * Audits exactly the fields that changed — sync's per-field conflict
   * check reads them (docs/synchronization.md step 5), so a UI edit to a
   * Roadmap-backed field is never silently overwritten. A no-op PATCH
   * writes nothing. A changed title or acceptance criteria is then written
   * into the task's Roadmap row ("Field edits").
   */
  async update(
    projectId: string,
    taskId: string,
    dto: UpdateTaskDto,
    requesterActorId: string,
  ) {
    const task = await this.getOwned(projectId, taskId);
    const patch = dto as TaskPatch;

    // Checked against what the task will hold after the PATCH, so moving one
    // link (or date) can't leave it disagreeing with a stored one.
    if (HIERARCHY_FIELDS.some((field) => patch[field] !== undefined)) {
      await this.assertHierarchy(projectId, {
        phaseId: afterPatch(patch.phaseId, task.phaseId),
        epicId: afterPatch(patch.epicId, task.epicId),
        templateId: afterPatch(patch.templateId, task.templateId),
        parentTaskId: afterPatch(patch.parentTaskId, task.parentTaskId),
      });
    }
    if (patch.parentTaskId) {
      await this.assertNoParentCycle(taskId, patch.parentTaskId);
    }
    if (DATE_FIELDS.some((field) => patch[field] !== undefined)) {
      assertDateOrder({
        startDate: afterPatch(patch.startDate, task.startDate),
        estimatedDate: afterPatch(patch.estimatedDate, task.estimatedDate),
        dueDate: afterPatch(patch.dueDate, task.dueDate),
      });
    }
    if (patch.progressPercent !== undefined && patch.progressPercent !== null) {
      const subtaskCount = await this.prisma.task.count({
        where: { parentTaskId: taskId },
      });
      if (subtaskCount > 0) {
        // Brief §17, docs/domain-model.md rollup rule 2: read-only once derived.
        throw new BadRequestException(
          'progressPercent is derived from subtasks once a task has them',
        );
      }
    }

    const fields = toTaskFields(dto);
    const diff = diffFields(task as unknown as Record<string, unknown>, fields);
    if (!diff) {
      return task;
    }
    const onlyProgress = Object.keys(diff.newValue).every(
      (field) => field === 'progressPercent',
    );
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.task.update({
        where: { id: taskId },
        data: fields,
      });
      await this.audit.record(
        {
          projectId,
          actorId: requesterActorId,
          entityType: 'Task',
          entityId: taskId,
          operation: onlyProgress ? 'PROGRESS_CHANGE' : 'UPDATE',
          origin: 'UI',
          ...diff,
        },
        tx,
      );
      return result;
    });

    const previous: RoadmapFieldEdit = {};
    if ('title' in diff.newValue) {
      previous.title = diff.previousValue.title as string;
    }
    if ('acceptanceCriteria' in diff.newValue) {
      previous.acceptanceCriteria = diff.previousValue.acceptanceCriteria as
        string | null;
    }
    if (Object.keys(previous).length > 0 && updated.externalId) {
      return this.writeBack.recordFieldEdit(
        projectId,
        taskId,
        previous,
        requesterActorId,
      );
    }
    return updated;
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
      include: { actor: { select: { isActive: true } } },
    });
    if (!member || !member.isActive) {
      throw new BadRequestException('Assignee must be a project member');
    }
    if (!member.actor.isActive) {
      throw new BadRequestException('Assignee is inactive');
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
      await this.audit.record(
        {
          projectId,
          actorId: requesterActorId,
          entityType: 'Task',
          entityId: taskId,
          operation: task.assigneeActorId ? 'REASSIGN' : 'ASSIGN',
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
        tx,
      );
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
      await this.audit.record(
        {
          projectId,
          actorId: requesterActorId,
          entityType: 'Task',
          entityId: taskId,
          operation: 'STATUS_CHANGE',
          previousValue: { status: task.status },
          newValue: { status: toStatus },
          origin: 'UI',
        },
        tx,
      );
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
    requesterActorId: string,
  ) {
    await this.getOwned(projectId, taskId);

    if (dto.dependsOnTaskId) {
      if (dto.dependsOnTaskId === taskId) {
        throw new BadRequestException('A task cannot depend on itself');
      }
      await this.getOwned(projectId, dto.dependsOnTaskId);
      await this.assertNoDependencyCycle(taskId, dto.dependsOnTaskId);
    }

    return this.prisma.$transaction(async (tx) => {
      const dependency = await tx.taskDependency.create({
        data: {
          taskId,
          dependsOnTaskId: dto.dependsOnTaskId,
          rawExternalRef: dto.rawExternalRef,
        },
      });
      await this.audit.record(
        {
          projectId,
          actorId: requesterActorId,
          entityType: 'Task',
          entityId: taskId,
          operation: 'DEPENDENCY_ADD',
          origin: 'UI',
          newValue: diffFields(
            {},
            {
              dependsOnTaskId: dto.dependsOnTaskId,
              rawExternalRef: dto.rawExternalRef,
            },
          )?.newValue,
        },
        tx,
      );
      return dependency;
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

  /**
   * Brief §9 "validar la estructura": every link belongs to this project, and
   * the links agree with each other — an epic that sits in a phase can only
   * be combined with that phase, a template with its own epic.
   */
  private async assertHierarchy(projectId: string, refs: HierarchyRefs) {
    const [phase, epic, template, parentTask] = await Promise.all([
      refs.phaseId
        ? this.prisma.phase.findFirst({
            where: { id: refs.phaseId, projectId },
          })
        : null,
      refs.epicId
        ? this.prisma.epic.findFirst({ where: { id: refs.epicId, projectId } })
        : null,
      refs.templateId
        ? this.prisma.template.findFirst({
            where: { id: refs.templateId, projectId },
          })
        : null,
      refs.parentTaskId
        ? this.prisma.task.findFirst({
            where: { id: refs.parentTaskId, projectId },
            select: { id: true },
          })
        : null,
    ]);
    if (refs.phaseId && !phase) {
      throw new BadRequestException('phaseId does not belong to this project');
    }
    if (refs.epicId && !epic) {
      throw new BadRequestException('epicId does not belong to this project');
    }
    if (refs.templateId && !template) {
      throw new BadRequestException(
        'templateId does not belong to this project',
      );
    }
    if (refs.parentTaskId && !parentTask) {
      throw new BadRequestException(
        'parentTaskId does not belong to this project',
      );
    }
    if (epic?.phaseId && refs.phaseId && epic.phaseId !== refs.phaseId) {
      throw new BadRequestException('epicId belongs to a different phase');
    }
    if (template?.epicId && refs.epicId && template.epicId !== refs.epicId) {
      throw new BadRequestException('templateId belongs to a different epic');
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

/** The persisted shape of a create/update payload; `undefined` means "not provided", `null` clears. */
function toTaskFields(dto: UpdateTaskDto) {
  const patch = dto as TaskPatch;
  return {
    title: dto.title,
    description: patch.description,
    phaseId: patch.phaseId,
    epicId: patch.epicId,
    templateId: patch.templateId,
    parentTaskId: patch.parentTaskId,
    priority: patch.priority,
    acceptanceCriteria: dto.acceptanceCriteria,
    startDate: toDate(patch.startDate),
    estimatedDate: toDate(patch.estimatedDate),
    dueDate: toDate(patch.dueDate),
    progressPercent: patch.progressPercent,
  };
}

function toDate(value: string | null | undefined): Date | null | undefined {
  return value === undefined || value === null ? value : new Date(value);
}

/** The value a field holds once a PATCH is applied. */
function afterPatch<P, S>(
  patched: P | null | undefined,
  stored: S | null,
): P | S | null {
  return patched === undefined ? stored : patched;
}

/** Brief §6 dates: a task can be neither estimated nor due before it starts. */
function assertDateOrder(dates: {
  startDate?: Date | string | null;
  estimatedDate?: Date | string | null;
  dueDate?: Date | string | null;
}) {
  const start = toTime(dates.startDate);
  if (start === null) {
    return;
  }
  const estimated = toTime(dates.estimatedDate);
  if (estimated !== null && estimated < start) {
    throw new BadRequestException('estimatedDate cannot be before startDate');
  }
  const due = toTime(dates.dueDate);
  if (due !== null && due < start) {
    throw new BadRequestException('dueDate cannot be before startDate');
  }
}

function toTime(value: Date | string | null | undefined): number | null {
  return value ? new Date(value).getTime() : null;
}

/** Prisma's generated TaskStatus and shared-types' hand-authored one are structurally identical string unions but nominally distinct types. */
function toSharedStatus(status: string): TaskStatus {
  return status as TaskStatus;
}
