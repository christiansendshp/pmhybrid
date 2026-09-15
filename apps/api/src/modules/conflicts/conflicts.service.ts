import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConflictResolutionKind } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { ResolveConflictDto } from './dto/resolve-conflict.dto.js';

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
    conflict: { kind: string; externalVersion: unknown },
    dto: ResolveConflictDto,
  ): Record<string, unknown> | null {
    switch (dto.strategy) {
      case ConflictResolutionKind.MANUAL_EDIT:
        return dto.manualValue!;
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
}
