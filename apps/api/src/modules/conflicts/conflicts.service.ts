import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PERMISSIONS } from '@pmhybrid/shared-types';
import {
  AuditOrigin,
  ConflictResolutionKind,
  Prisma,
  TaskStatus,
} from '@prisma/client';
import { PermissionsResolverService } from '../../common/permissions-resolver.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { NOT_BLANK } from '../tasks/dto/create-task.dto.js';
import {
  permissionForAssigneeChange,
  permissionForStatusChange,
  STALE_TASK_MESSAGE,
} from '../tasks/task-status-policy.js';
import { ResolveConflictDto } from './dto/resolve-conflict.dto.js';

const TASK_STATUSES = new Set<string>(Object.values(TaskStatus));

/**
 * Fields a MANUAL_EDIT may set on the Task, and how to validate each one —
 * the same fields the reconciler ever puts in a conflict's localVersion/
 * externalVersion (ReconcilableField in synchronization.service.ts), plus
 * the ROADMAP_ROW_DISAPPEARED_NO_TERMINAL_LOG-only `roadmapTable`. Anything
 * else (e.g. `externalId`) is shown for context but is never user-editable.
 */
const EDITABLE_FIELD_VALIDATORS: Record<
  string,
  (value: unknown) => string | null
> = {
  title: (value) =>
    typeof value === 'string' && NOT_BLANK.test(value)
      ? null
      : 'title must be a non-blank string',
  acceptanceCriteria: (value) =>
    value === null || typeof value === 'string'
      ? null
      : 'acceptanceCriteria must be a string or null',
  status: (value) =>
    typeof value === 'string' && TASK_STATUSES.has(value)
      ? null
      : `status must be one of: ${[...TASK_STATUSES].join(', ')}`,
  assigneeActorId: (value) =>
    typeof value === 'string' && value.length > 0
      ? null
      : 'assigneeActorId must be an actor id',
  rawOwner: (value) =>
    value === null || typeof value === 'string'
      ? null
      : 'rawOwner must be a string or null',
  roadmapTable: (value) =>
    value === null ||
    value === 'ACTIVE' ||
    value === 'NEAR_TERM' ||
    value === 'BLOCKED'
      ? null
      : 'roadmapTable must be ACTIVE, NEAR_TERM, BLOCKED, or null',
};

/**
 * Conflict is a first-class entity (brief §26), not just an audit log
 * line — an authorized user sees local vs. external versions and picks a
 * resolution (docs/synchronization.md "Conflicts"). Never auto-resolved.
 *
 * FASE-08 scope trim: resolving a conflict never triggers a follow-up
 * write-back on its own ("may trigger a normal write-back" per spec is
 * optional) — a subsequent task edit or the next sync run covers that.
 */
@Injectable()
export class ConflictsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly permissionsResolver: PermissionsResolverService,
  ) {}

  findAllForProject(projectId: string, resolved?: boolean) {
    return this.prisma.conflict.findMany({
      where: {
        projectId,
        ...(resolved === undefined
          ? {}
          : resolved
            ? { resolvedAt: { not: null } }
            : { resolvedAt: null }),
      },
      orderBy: { detectedAt: 'desc' },
    });
  }

  async findById(projectId: string, id: string) {
    const conflict = await this.prisma.conflict.findFirst({
      where: { id, projectId },
    });
    if (!conflict) {
      throw new NotFoundException('Conflict not found');
    }
    return conflict;
  }

  async resolve(
    projectId: string,
    id: string,
    dto: ResolveConflictDto,
    requesterActorId: string,
    origin: AuditOrigin = 'UI',
  ) {
    const conflict = await this.findById(projectId, id);
    if (conflict.resolvedAt) {
      throw new BadRequestException('Conflict already resolved');
    }
    if (
      dto.strategy === ConflictResolutionKind.MANUAL_EDIT &&
      !dto.manualValue
    ) {
      throw new BadRequestException('manualValue is required for MANUAL_EDIT');
    }

    return this.prisma.$transaction(async (tx) => {
      const fieldsToApply = this.resolveTaskFields(conflict, dto);
      if (fieldsToApply && conflict.entityType === 'Task') {
        const task = await tx.task.findUniqueOrThrow({
          where: { id: conflict.entityId },
          select: { status: true, assigneeActorId: true },
        });
        const nextAssignee = fieldsToApply.assigneeActorId;
        if (typeof nextAssignee === 'string') {
          await this.assertAssignable(tx, projectId, nextAssignee);
        }
        await this.assertCanApply(
          projectId,
          requesterActorId,
          task.status,
          fieldsToApply,
        );
        // Applied only if the task is still in the status the permission
        // check above was made against (Roadmap BUG-04) — otherwise a
        // concurrent move would be silently overwritten by this resolution.
        const { count } = await tx.task.updateMany({
          where: {
            id: conflict.entityId,
            deletedAt: null,
            status: task.status,
            // An assignment applies only over the assignee it was decided against.
            ...(typeof nextAssignee === 'string'
              ? { assigneeActorId: task.assigneeActorId }
              : {}),
          },
          data: fieldsToApply,
        });
        if (count !== 1) {
          throw new ConflictException(STALE_TASK_MESSAGE);
        }
        // Likewise an assignment: history and audit like any reassignment,
        // so the reconciler sees this side just touched `assigneeActorId`.
        if (
          typeof nextAssignee === 'string' &&
          nextAssignee !== task.assigneeActorId
        ) {
          await tx.taskAssignment.updateMany({
            where: { taskId: conflict.entityId, unassignedAt: null },
            data: { unassignedAt: new Date() },
          });
          await tx.taskAssignment.create({
            data: {
              taskId: conflict.entityId,
              actorId: nextAssignee,
              assignedByActorId: requesterActorId,
              reason: 'Conflict resolution',
            },
          });
          await this.audit.record(
            {
              projectId,
              actorId: requesterActorId,
              entityType: 'Task',
              entityId: conflict.entityId,
              operation: task.assigneeActorId ? 'REASSIGN' : 'ASSIGN',
              previousValue: { assigneeActorId: task.assigneeActorId },
              newValue: { assigneeActorId: nextAssignee },
              origin,
            },
            tx,
          );
        }
        // A resolution that moves the task is a status change like any
        // other: recorded as one, so the reconciler's per-field check sees
        // that this side just touched `status`.
        const nextStatus = fieldsToApply.status;
        if (typeof nextStatus === 'string' && nextStatus !== task.status) {
          await this.audit.record(
            {
              projectId,
              actorId: requesterActorId,
              entityType: 'Task',
              entityId: conflict.entityId,
              operation: 'STATUS_CHANGE',
              previousValue: { status: task.status },
              newValue: { status: nextStatus },
              origin,
            },
            tx,
          );
        }
      }

      await this.audit.record(
        {
          projectId,
          actorId: requesterActorId,
          entityType: conflict.entityType,
          entityId: conflict.entityId,
          operation: 'CONFLICT_RESOLVED',
          origin,
          previousValue: conflict.localVersion as Record<string, unknown>,
          newValue: {
            conflictId: conflict.id,
            strategy: dto.strategy,
            applied: fieldsToApply ?? null,
          },
        },
        tx,
      );

      return tx.conflict.update({
        where: { id },
        data: {
          resolvedAt: new Date(),
          resolvedByActorId: requesterActorId,
          resolutionStrategy: dto.strategy,
        },
      });
    });
  }

  /**
   * Resolving a conflict needs `conflict.resolve` (checked on the route),
   * but that must not become a way around the rules of the change it
   * applies: a status change needs the permission the same move would need
   * as a transition (a jump takes the strongest key it crosses), and any
   * other field needs `task.write` (Roadmap SECURITY-02).
   */
  private async assertCanApply(
    projectId: string,
    actorId: string,
    currentStatus: TaskStatus,
    fields: Record<string, unknown>,
  ) {
    const needed = new Set<string>();
    for (const [key, value] of Object.entries(fields)) {
      if (key === 'status') {
        if (value !== currentStatus) {
          needed.add(
            permissionForStatusChange(currentStatus as never, value as never),
          );
        }
      } else if (key === 'assigneeActorId') {
        needed.add(permissionForAssigneeChange(currentStatus));
      } else {
        needed.add(PERMISSIONS.TASK_WRITE);
      }
    }
    for (const permission of needed) {
      const allowed = await this.permissionsResolver.hasPermission(
        actorId,
        permission,
        projectId,
      );
      if (!allowed) {
        throw new ForbiddenException(`Missing permission: ${permission}`);
      }
    }
  }

  /** Only an active member of the project, and an active actor, can be put on a task. */
  private async assertAssignable(
    tx: Prisma.TransactionClient,
    projectId: string,
    actorId: string,
  ) {
    const member = await tx.projectMember.findUnique({
      where: { projectId_actorId: { projectId, actorId } },
      include: { actor: { select: { isActive: true } } },
    });
    if (!member || !member.isActive || !member.actor.isActive) {
      throw new BadRequestException(
        'Assignee must be an active member of the project',
      );
    }
  }

  /** null = no Task write needed for this strategy/kind combination. */
  private resolveTaskFields(
    conflict: {
      kind: string;
      localVersion: unknown;
      externalVersion: unknown;
    },
    dto: ResolveConflictDto,
  ): Record<string, unknown> | null {
    switch (dto.strategy) {
      case ConflictResolutionKind.MANUAL_EDIT:
        return this.validateManualValue(conflict, dto.manualValue!);
      case ConflictResolutionKind.KEEP_EXTERNAL:
        if (conflict.kind === 'ROADMAP_ROW_DISAPPEARED_NO_TERMINAL_LOG') {
          // Trusting the external side here means "yes, it's really gone".
          return { status: 'TERMINADA', roadmapTable: null };
        }
        return (
          (conflict.externalVersion as Record<string, unknown> | null) ?? null
        );
      case ConflictResolutionKind.KEEP_LOCAL:
      case ConflictResolutionKind.DISMISSED:
      default:
        return null;
    }
  }

  /**
   * A MANUAL_EDIT may only touch fields this specific conflict actually
   * contests (the union of its localVersion/externalVersion keys) — never an
   * arbitrary Task column. Without this, an unknown key reaches
   * `tx.task.update` unchecked and Prisma throws a raw 500 instead of a 400,
   * and a client could edit fields the conflict was never about.
   */
  private validateManualValue(
    conflict: { localVersion: unknown; externalVersion: unknown },
    manualValue: Record<string, unknown>,
  ): Record<string, unknown> {
    const contestedKeys = new Set([
      ...Object.keys((conflict.localVersion as Record<string, unknown>) ?? {}),
      ...Object.keys(
        (conflict.externalVersion as Record<string, unknown> | null) ?? {},
      ),
    ]);
    const keys = Object.keys(manualValue);
    if (keys.length === 0) {
      throw new BadRequestException(
        'manualValue must include at least one field',
      );
    }
    for (const key of keys) {
      if (!contestedKeys.has(key)) {
        throw new BadRequestException(
          `'${key}' is not a field this conflict contests`,
        );
      }
      const validate = EDITABLE_FIELD_VALIDATORS[key];
      if (!validate) {
        throw new BadRequestException(`'${key}' cannot be manually edited`);
      }
      const error = validate(manualValue[key]);
      if (error) {
        throw new BadRequestException(error);
      }
    }
    return manualValue;
  }
}
