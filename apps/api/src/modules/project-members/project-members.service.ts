import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';

/**
 * Adding an AI_AGENT actor as a member works identically to a HUMAN one
 * (brief §3/§18) — this service only cares that the Actor id exists, not
 * its kind.
 */
@Injectable()
export class ProjectMembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  findAllForProject(projectId: string) {
    return this.prisma.projectMember.findMany({
      where: { projectId, isActive: true },
      include: {
        actor: {
          select: { id: true, displayName: true, kind: true, email: true },
        },
      },
      orderBy: { joinedAt: 'asc' },
    });
  }

  /** Idempotent: an already active member is returned as-is, with no audit entry. */
  async addMember(
    projectId: string,
    actorId: string,
    requesterActorId: string,
  ) {
    const actor = await this.prisma.actor.findUnique({
      where: { id: actorId },
    });
    if (!actor) {
      throw new BadRequestException('No such actor');
    }

    const existing = await this.prisma.projectMember.findUnique({
      where: { projectId_actorId: { projectId, actorId } },
    });
    if (existing?.isActive) {
      return existing;
    }

    return this.prisma.$transaction(async (tx) => {
      // Re-activate rather than duplicate, if they'd been removed before.
      const member = existing
        ? await tx.projectMember.update({
            where: { id: existing.id },
            data: { isActive: true },
          })
        : await tx.projectMember.create({ data: { projectId, actorId } });
      await this.audit.record(
        {
          projectId,
          actorId: requesterActorId,
          entityType: 'ProjectMember',
          entityId: member.id,
          operation: 'MEMBER_ADD',
          origin: 'UI',
          newValue: {
            actorId,
            displayName: actor.displayName,
            kind: actor.kind,
          },
        },
        tx,
      );
      return member;
    });
  }

  /** Soft-delete (isActive=false), matching Project/Task's no-hard-delete convention (docs/domain-model.md). */
  async removeMember(
    projectId: string,
    actorId: string,
    requesterActorId: string,
  ) {
    const existing = await this.prisma.projectMember.findUnique({
      where: { projectId_actorId: { projectId, actorId } },
      include: { actor: { select: { displayName: true } } },
    });
    if (!existing) {
      throw new NotFoundException('Not a member of this project');
    }
    if (!existing.isActive) {
      return existing;
    }
    return this.prisma.$transaction(async (tx) => {
      const member = await tx.projectMember.update({
        where: { id: existing.id },
        data: { isActive: false },
      });
      await this.audit.record(
        {
          projectId,
          actorId: requesterActorId,
          entityType: 'ProjectMember',
          entityId: member.id,
          operation: 'MEMBER_REMOVE',
          origin: 'UI',
          previousValue: {
            actorId,
            displayName: existing.actor.displayName,
            isActive: true,
          },
          newValue: { isActive: false },
        },
        tx,
      );
      return member;
    });
  }
}
