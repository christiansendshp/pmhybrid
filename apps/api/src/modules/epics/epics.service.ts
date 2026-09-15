import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService, diffFields } from '../audit/audit.service.js';
import { CreateEpicDto } from './dto/create-epic.dto.js';
import { UpdateEpicDto } from './dto/update-epic.dto.js';

@Injectable()
export class EpicsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  findAllForProject(projectId: string) {
    return this.prisma.epic.findMany({
      where: { projectId },
      orderBy: { order: 'asc' },
    });
  }

  async findById(projectId: string, id: string) {
    const epic = await this.prisma.epic.findFirst({ where: { id, projectId } });
    if (!epic) {
      throw new NotFoundException('Epic not found');
    }
    return epic;
  }

  async create(
    projectId: string,
    dto: CreateEpicDto,
    requesterActorId: string,
  ) {
    if (dto.phaseId) {
      await this.assertPhaseInProject(projectId, dto.phaseId);
    }
    return this.prisma.$transaction(async (tx) => {
      const epic = await tx.epic.create({ data: { ...dto, projectId } });
      await this.audit.record(
        {
          projectId,
          actorId: requesterActorId,
          entityType: 'Epic',
          entityId: epic.id,
          operation: 'CREATE',
          origin: 'UI',
          newValue: diffFields({}, { ...dto })?.newValue,
        },
        tx,
      );
      return epic;
    });
  }

  async update(
    projectId: string,
    id: string,
    dto: UpdateEpicDto,
    requesterActorId: string,
  ) {
    const epic = await this.findById(projectId, id);
    if (dto.phaseId) {
      await this.assertPhaseInProject(projectId, dto.phaseId);
    }
    const diff = diffFields(epic as unknown as Record<string, unknown>, {
      ...dto,
    });
    if (!diff) {
      return epic;
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.epic.update({ where: { id }, data: dto });
      await this.audit.record(
        {
          projectId,
          actorId: requesterActorId,
          entityType: 'Epic',
          entityId: id,
          operation: 'UPDATE',
          origin: 'UI',
          ...diff,
        },
        tx,
      );
      return updated;
    });
  }

  private async assertPhaseInProject(projectId: string, phaseId: string) {
    const phase = await this.prisma.phase.findFirst({
      where: { id: phaseId, projectId },
    });
    if (!phase) {
      throw new BadRequestException('phaseId does not belong to this project');
    }
  }
}
