import { Injectable, NotFoundException } from '@nestjs/common';
import type { AuditOrigin } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService, diffFields } from '../audit/audit.service.js';
import { CreatePhaseDto } from './dto/create-phase.dto.js';
import { UpdatePhaseDto } from './dto/update-phase.dto.js';

/** Optional hierarchy rung (brief §5) — no level is mandatory. */
@Injectable()
export class PhasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  findAllForProject(projectId: string) {
    return this.prisma.phase.findMany({
      where: { projectId },
      orderBy: { order: 'asc' },
    });
  }

  async findById(projectId: string, id: string) {
    const phase = await this.prisma.phase.findFirst({
      where: { id, projectId },
    });
    if (!phase) {
      throw new NotFoundException('Phase not found');
    }
    return phase;
  }

  create(
    projectId: string,
    dto: CreatePhaseDto,
    requesterActorId: string,
    origin: AuditOrigin = 'UI',
  ) {
    return this.prisma.$transaction(async (tx) => {
      const phase = await tx.phase.create({ data: { ...dto, projectId } });
      await this.audit.record(
        {
          projectId,
          actorId: requesterActorId,
          entityType: 'Phase',
          entityId: phase.id,
          operation: 'CREATE',
          origin,
          newValue: diffFields({}, { ...dto })?.newValue,
        },
        tx,
      );
      return phase;
    });
  }

  async update(
    projectId: string,
    id: string,
    dto: UpdatePhaseDto,
    requesterActorId: string,
    origin: AuditOrigin = 'UI',
  ) {
    const phase = await this.findById(projectId, id);
    const diff = diffFields(phase as unknown as Record<string, unknown>, {
      ...dto,
    });
    if (!diff) {
      return phase;
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.phase.update({ where: { id }, data: dto });
      await this.audit.record(
        {
          projectId,
          actorId: requesterActorId,
          entityType: 'Phase',
          entityId: id,
          operation: 'UPDATE',
          origin,
          ...diff,
        },
        tx,
      );
      return updated;
    });
  }
}
