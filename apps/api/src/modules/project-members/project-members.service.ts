import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';

/**
 * Adding an AI_AGENT actor as a member works identically to a HUMAN one
 * (brief §3/§18) — this service only cares that the Actor id exists, not
 * its kind.
 */
@Injectable()
export class ProjectMembersService {
  constructor(private readonly prisma: PrismaService) {}

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

  async addMember(projectId: string, actorId: string) {
    const actor = await this.prisma.actor.findUnique({
      where: { id: actorId },
    });
    if (!actor) {
      throw new BadRequestException('No such actor');
    }

    const existing = await this.prisma.projectMember.findUnique({
      where: { projectId_actorId: { projectId, actorId } },
    });
    if (existing) {
      // Re-activate rather than duplicate, if they'd been removed before.
      return this.prisma.projectMember.update({
        where: { id: existing.id },
        data: { isActive: true },
      });
    }

    return this.prisma.projectMember.create({ data: { projectId, actorId } });
  }

  /** Soft-delete (isActive=false), matching Project/Task's no-hard-delete convention (docs/domain-model.md). */
  async removeMember(projectId: string, actorId: string) {
    const existing = await this.prisma.projectMember.findUnique({
      where: { projectId_actorId: { projectId, actorId } },
    });
    if (!existing) {
      throw new NotFoundException('Not a member of this project');
    }
    return this.prisma.projectMember.update({
      where: { id: existing.id },
      data: { isActive: false },
    });
  }
}
