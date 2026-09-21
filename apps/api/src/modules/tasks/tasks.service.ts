import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { TaskStatus } from '@pmhybrid/shared-types';
import type { AuditOrigin, Prisma } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PermissionsResolverService } from '../../common/permissions-resolver.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService, diffFields } from '../audit/audit.service.js';
import {
  type RoadmapFieldEdit,
  WriteBackService,
} from '../synchronization/write-back.service.js';
import { completedAtFor } from './completion-date.util.js';
import { buildDependencyGraph, wouldCloseCycle } from './dependency-graph.js';
import { AddDependencyDto } from './dto/add-dependency.dto.js';
import { CreateTaskDto } from './dto/create-task.dto.js';
import {
  IDEMPOTENCY_WINDOW_MS,
  requestFingerprint,
} from './idempotency.util.js';
import { UpdateTaskDto } from './dto/update-task.dto.js';
import { ProgressRollupService } from './progress-rollup.service.js';
import {
  findTransitionRule,
  isAssigneeLocked,
  REASSIGN_LOCKED_PERMISSION,
  STALE_TASK_MESSAGE,
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
  private readonly logger = new Logger(TasksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly progressRollup: ProgressRollupService,
    private readonly permissionsResolver: PermissionsResolverService,
    private readonly writeBack: WriteBackService,
    private readonly audit: AuditService,
    private readonly events: EventEmitter2,
  ) {}

  /**
   * Board cards (brief §15): every task field plus what a card shows at a
   * glance — the assignee and their kind, rolled-up progress, and subtask
   * and dependency counts. A dependency is "open" until the task it points
   * to is TERMINADA; an unresolved external reference counts as open.
   */
  async findAllForProject(projectId: string, filters: TaskListFilters) {
    const tasks = await this.prisma.task.findMany({
      where: { projectId, deletedAt: null, ...filters },
      orderBy: { createdAt: 'asc' },
      include: {
        assignee: { select: { id: true, displayName: true, kind: true } },
        subtasks: { where: { deletedAt: null }, select: { status: true } },
        dependencies: {
          select: { dependsOnTask: { select: { status: true } } },
        },
      },
    });
    // Progress for the whole list from one batch of reads, not a query per task.
    const progress = await this.progressRollup.computeTasksProgress(tasks);
    return Promise.all(
      tasks.map(async ({ subtasks, dependencies, ...task }) => ({
        ...task,
        computedProgress: progress.get(task.id) ?? 0,
        subtaskCounts: {
          total: subtasks.length,
          done: subtasks.filter(
            (subtask) => subtask.status === TaskStatus.TERMINADA,
          ).length,
        },
        dependencyCounts: {
          total: dependencies.length,
          open: dependencies.filter(
            (dependency) =>
              dependency.dependsOnTask?.status !== TaskStatus.TERMINADA,
          ).length,
        },
      })),
    );
  }

  async findById(projectId: string, taskId: string) {
    await this.getOwned(projectId, taskId);
    const [full, computedProgress] = await Promise.all([
      this.prisma.task.findUniqueOrThrow({
        where: { id: taskId },
        include: {
          subtasks: { where: { deletedAt: null } },
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
   * Creating and editing a task's own fields, and declaring its
   * dependencies, need `task.write` (Roadmap SECURITY-02) — checked here,
   * not on the controller, so the MCP tools that call this service
   * directly are held to the same rule as REST. Moving and assigning keep
   * their own dynamic permissions (`transition`, `assign`).
   */
  private async assertCanWrite(projectId: string, actorId: string) {
    const allowed = await this.permissionsResolver.hasPermission(
      actorId,
      PERMISSIONS.TASK_WRITE,
      projectId,
    );
    if (!allowed) {
      throw new ForbiddenException(
        `Missing permission: ${PERMISSIONS.TASK_WRITE}`,
      );
    }
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
    origin: AuditOrigin = 'UI',
    idempotencyKey?: string,
  ) {
    await this.assertCanWrite(projectId, requesterActorId);
    await this.assertHierarchy(projectId, dto);
    assertDateOrder(dto);
    const fields = toTaskFields(dto);
    return this.writeBack.inTransaction(projectId, async (tx) => {
      // Under the project's lock, so two requests with one key cannot both
      // miss each other's row (Roadmap BUG-07b).
      if (idempotencyKey) {
        const earlier = await this.earlierCreation(
          tx,
          projectId,
          requesterActorId,
          idempotencyKey,
          requestFingerprint(dto),
        );
        if (earlier) {
          return earlier;
        }
      }
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
          origin,
          newValue: diffFields({}, fields)?.newValue,
        },
        tx,
      );
      // The document is written in the same transaction: a failure to write it
      // undoes the task too, so there is nothing to duplicate on a retry.
      const result = await this.writeBack.recordTaskEvent(
        projectId,
        created.id,
        'CREATED',
        requesterActorId,
        tx,
      );
      if (idempotencyKey) {
        await tx.idempotencyKey.create({
          data: {
            projectId,
            actorId: requesterActorId,
            key: idempotencyKey,
            requestHash: requestFingerprint(dto),
            taskId: created.id,
          },
        });
      }
      return result;
    });
  }

  /**
   * The task a request with this key already created, if the key is still
   * remembered (Roadmap BUG-07b). Expired keys of the project are dropped on
   * the way, so the table needs no separate job. The same key for a different
   * request is a client bug and is refused; a key whose task has since been
   * removed no longer stands for anything, so it is released for a new task.
   */
  private async earlierCreation(
    tx: Prisma.TransactionClient,
    projectId: string,
    actorId: string,
    key: string,
    requestHash: string,
  ) {
    await tx.idempotencyKey.deleteMany({
      where: {
        projectId,
        createdAt: { lt: new Date(Date.now() - IDEMPOTENCY_WINDOW_MS) },
      },
    });
    const remembered = await tx.idempotencyKey.findUnique({
      where: { projectId_actorId_key: { projectId, actorId, key } },
      include: { task: true },
    });
    if (!remembered) {
      return null;
    }
    if (remembered.requestHash !== requestHash) {
      throw new UnprocessableEntityException(
        'This Idempotency-Key was already used for a different request',
      );
    }
    if (remembered.task.deletedAt) {
      await tx.idempotencyKey.delete({ where: { id: remembered.id } });
      return null;
    }
    return remembered.task;
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
    origin: AuditOrigin = 'UI',
  ) {
    await this.assertCanWrite(projectId, requesterActorId);
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
        where: { parentTaskId: taskId, deletedAt: null },
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
    const previous: RoadmapFieldEdit = {};
    if ('title' in diff.newValue) {
      previous.title = diff.previousValue.title as string;
    }
    if ('acceptanceCriteria' in diff.newValue) {
      previous.acceptanceCriteria = diff.previousValue.acceptanceCriteria as
        string | null;
    }
    // Where the task sits is written into a YAML entry as its `parent` (Roadmap
    // GAP-35d).
    if (
      'parentTaskId' in diff.newValue ||
      'epicId' in diff.newValue ||
      'phaseId' in diff.newValue
    ) {
      previous.hierarchy = {
        parentTaskId: task.parentTaskId,
        epicId: task.epicId,
        phaseId: task.phaseId,
      };
    }
    // Written into a YAML entry, which alone has such fields (Roadmap GAP-35c).
    if ('priority' in diff.newValue) {
      previous.priority = diff.previousValue.priority as string | null;
    }
    if ('progressPercent' in diff.newValue) {
      previous.progressPercent = diff.previousValue.progressPercent as
        number | null;
    }
    return this.writeBack.inTransaction(projectId, async (tx) => {
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
          origin,
          ...diff,
        },
        tx,
      );
      if (Object.keys(previous).length > 0 && result.externalId) {
        return this.writeBack.recordFieldEdit(
          projectId,
          taskId,
          previous,
          requesterActorId,
          tx,
        );
      }
      return result;
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
    origin: AuditOrigin = 'UI',
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

    const previousAssigneeName = task.assigneeActorId
      ? ((
          await this.prisma.actor.findUnique({
            where: { id: task.assigneeActorId },
            select: { displayName: true },
          })
        )?.displayName ?? null)
      : null;

    const written = await this.writeBack.inTransaction(
      projectId,
      async (tx) => {
        // Everything above (the lock check, the permission it chose, the next
        // status) was decided from the task as it was read. The write only
        // lands if the task is still exactly that: otherwise a concurrent
        // transition or assignment already changed it, and writing on would
        // sneak past the EN_DESARROLLO lock or restore a stale status
        // (Roadmap BUG-04). Done first, so a lost race leaves nothing behind.
        const { count } = await tx.task.updateMany({
          where: {
            id: taskId,
            deletedAt: null,
            status: task.status,
            assigneeActorId: task.assigneeActorId,
          },
          data: { assigneeActorId: actorId, status: nextStatus },
        });
        if (count !== 1) {
          throw new ConflictException(STALE_TASK_MESSAGE);
        }
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
            origin,
          },
          tx,
        );

        // A locked reassignment is a lifecycle write-back trigger (Agentslog entry
        // + row). Any other assignment is an in-place edit of who the entry names
        // (docs/synchronization.md "Field edits", Roadmap GAP-35a): no Agentslog
        // entry, but the document must not keep naming the previous assignee.
        // Either way it is written in this same transaction (Roadmap BUG-07).
        if (wasLocked) {
          return this.writeBack.recordTaskEvent(
            projectId,
            taskId,
            'LOCKED_REASSIGN',
            requesterActorId,
            tx,
          );
        }
        if (task.externalId) {
          await this.writeBack.recordFieldEdit(
            projectId,
            taskId,
            { assignee: previousAssigneeName },
            requesterActorId,
            tx,
          );
        }
        return null;
      },
    );
    const result = written ?? (await this.getOwned(projectId, taskId));
    // After the commit, so a notification never describes an assignment that
    // rolled back; a listener that fails must not fail the assignment.
    try {
      await this.events.emitAsync('task.assigned', {
        projectId,
        taskId,
        title: task.title,
        externalId: task.externalId,
        assigneeActorId: actorId,
        previousAssigneeActorId: task.assigneeActorId,
        byActorId: requesterActorId,
      });
    } catch (error) {
      this.logger.warn(`task.assigned listeners failed: ${String(error)}`);
    }
    return result;
  }

  /** Kanban transition (docs/domain-model.md, task-status-policy.ts) — the one legal way to change Task.status. */
  async transition(
    projectId: string,
    taskId: string,
    toStatus: TaskStatus,
    requesterActorId: string,
    origin: AuditOrigin = 'UI',
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

    const written = await this.writeBack.inTransaction(
      projectId,
      async (tx) => {
        // Only if the task is still in the status the rule and permission
        // above were checked against (Roadmap BUG-04): two concurrent moves,
        // or a move racing an assignment, must not both apply on stale state.
        const { count } = await tx.task.updateMany({
          where: { id: taskId, deletedAt: null, status: task.status },
          data: {
            status: toStatus,
            assigneeLockedAt: isAssigneeLocked(toStatus) ? new Date() : null,
            completedAt: completedAtFor(task.status, toStatus),
          },
        });
        if (count !== 1) {
          throw new ConflictException(STALE_TASK_MESSAGE);
        }
        await this.audit.record(
          {
            projectId,
            actorId: requesterActorId,
            entityType: 'Task',
            entityId: taskId,
            operation: 'STATUS_CHANGE',
            previousValue: { status: task.status },
            newValue: { status: toStatus },
            origin,
          },
          tx,
        );

        // Only these two transitions are write-back triggers
        // (docs/synchronization.md step 3) — every other status change stays
        // UI-only. The document is written in the same transaction.
        if (toStatus === TaskStatus.EN_DESARROLLO) {
          return this.writeBack.recordTaskEvent(
            projectId,
            taskId,
            'STATUS_EN_DESARROLLO',
            requesterActorId,
            tx,
          );
        }
        if (toStatus === TaskStatus.TERMINADA) {
          return this.writeBack.recordTaskEvent(
            projectId,
            taskId,
            'STATUS_TERMINADA',
            requesterActorId,
            tx,
          );
        }
        return null;
      },
    );
    return written ?? this.getOwned(projectId, taskId);
  }

  async addDependency(
    projectId: string,
    taskId: string,
    dto: AddDependencyDto,
    requesterActorId: string,
    origin: AuditOrigin = 'UI',
  ) {
    await this.assertCanWrite(projectId, requesterActorId);
    await this.getOwned(projectId, taskId);

    if (dto.dependsOnTaskId) {
      if (dto.dependsOnTaskId === taskId) {
        throw new BadRequestException('A task cannot depend on itself');
      }
      await this.getOwned(projectId, dto.dependsOnTaskId);
      await this.assertNoDependencyCycle(
        projectId,
        taskId,
        dto.dependsOnTaskId,
      );
    }

    return this.writeBack.inTransaction(projectId, async (tx) => {
      await tx.taskDependency.create({
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
          origin,
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
      return this.writeBack.recordDependencyAdded(
        projectId,
        taskId,
        requesterActorId,
        tx,
      );
    });
  }

  /**
   * Brief §25 "eliminación", §31 CRUD. A soft delete (docs/domain-model.md):
   * the task leaves every view but keeps its audit trail and externalId, and
   * its Roadmap row is taken out after a REMOVED Agentslog entry
   * (docs/synchronization.md "Removal"). A task with live subtasks is refused,
   * so no subtask is left under a parent nobody can see.
   */
  async remove(
    projectId: string,
    taskId: string,
    requesterActorId: string,
    origin: AuditOrigin = 'UI',
  ) {
    const task = await this.getOwned(projectId, taskId);
    const subtaskCount = await this.prisma.task.count({
      where: { parentTaskId: taskId, deletedAt: null },
    });
    if (subtaskCount > 0) {
      throw new BadRequestException('Remove or move its subtasks first');
    }

    return this.writeBack.inTransaction(projectId, async (tx) => {
      const deletedAt = new Date();
      // Dependency links are structure, not history: they go with the task.
      await tx.taskDependency.deleteMany({
        where: { OR: [{ taskId }, { dependsOnTaskId: taskId }] },
      });
      await tx.taskAssignment.updateMany({
        where: { taskId, unassignedAt: null },
        data: { unassignedAt: deletedAt },
      });
      const result = await tx.task.update({
        where: { id: taskId },
        data: { deletedAt },
      });
      await this.audit.record(
        {
          projectId,
          actorId: requesterActorId,
          entityType: 'Task',
          entityId: taskId,
          operation: 'DELETE',
          origin,
          previousValue: {
            externalId: task.externalId,
            title: task.title,
            status: task.status,
            roadmapTable: task.roadmapTable,
          },
          newValue: { deletedAt: deletedAt.toISOString() },
        },
        tx,
      );
      if (!result.externalId) {
        return result;
      }
      return this.writeBack.recordTaskRemoval(
        projectId,
        taskId,
        requesterActorId,
        tx,
      );
    });
  }

  /** A task that belongs to this project and has not been removed. */
  private async getOwned(projectId: string, taskId: string) {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, projectId, deletedAt: null },
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
            where: { id: refs.parentTaskId, projectId, deletedAt: null },
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

  /** Adding taskId -> dependsOnTaskId is a cycle iff dependsOnTaskId can already reach taskId — checked against the project's edges read once, not a query per hop (Roadmap IMPROVEMENT-01a). */
  private async assertNoDependencyCycle(
    projectId: string,
    taskId: string,
    dependsOnTaskId: string,
  ) {
    const graph = buildDependencyGraph(
      await this.prisma.taskDependency.findMany({
        where: { task: { projectId } },
        select: { taskId: true, dependsOnTaskId: true },
      }),
    );
    if (wouldCloseCycle(graph, taskId, dependsOnTaskId)) {
      throw new BadRequestException('This dependency would create a cycle');
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
