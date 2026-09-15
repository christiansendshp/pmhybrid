import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConflictResolutionKind, TaskStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { NOT_BLANK } from '../tasks/dto/create-task.dto.js';
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
        await tx.task.update({
          where: { id: conflict.entityId },
          data: fieldsToApply,
        });
      }

      await this.audit.record(
        {
          projectId,
          actorId: requesterActorId,
          entityType: conflict.entityType,
          entityId: conflict.entityId,
          operation: 'CONFLICT_RESOLVED',
          origin: 'UI',
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
