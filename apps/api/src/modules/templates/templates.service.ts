import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService, diffFields } from '../audit/audit.service.js';
import { CreateTemplateDto } from './dto/create-template.dto.js';
import { UpdateTemplateDto } from './dto/update-template.dto.js';

@Injectable()
export class TemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  findAllForProject(projectId: string) {
    return this.prisma.template.findMany({
      where: { projectId },
      orderBy: { order: 'asc' },
    });
  }

  async findById(projectId: string, id: string) {
    const template = await this.prisma.template.findFirst({
      where: { id, projectId },
    });
    if (!template) {
      throw new NotFoundException('Template not found');
    }
    return template;
  }

  async create(
    projectId: string,
    dto: CreateTemplateDto,
    requesterActorId: string,
  ) {
    if (dto.epicId) {
      await this.assertEpicInProject(projectId, dto.epicId);
    }
    return this.prisma.$transaction(async (tx) => {
      const template = await tx.template.create({
        data: { ...dto, projectId },
      });
      await this.audit.record(
        {
          projectId,
          actorId: requesterActorId,
          entityType: 'Template',
          entityId: template.id,
          operation: 'CREATE',
          origin: 'UI',
          newValue: diffFields({}, { ...dto })?.newValue,
        },
        tx,
      );
      return template;
    });
  }

  async update(
    projectId: string,
    id: string,
    dto: UpdateTemplateDto,
    requesterActorId: string,
  ) {
    const template = await this.findById(projectId, id);
    if (dto.epicId) {
      await this.assertEpicInProject(projectId, dto.epicId);
    }
    const diff = diffFields(template as unknown as Record<string, unknown>, {
      ...dto,
    });
    if (!diff) {
      return template;
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.template.update({ where: { id }, data: dto });
      await this.audit.record(
        {
          projectId,
          actorId: requesterActorId,
          entityType: 'Template',
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

  private async assertEpicInProject(projectId: string, epicId: string) {
    const epic = await this.prisma.epic.findFirst({
      where: { id: epicId, projectId },
    });
    if (!epic) {
      throw new BadRequestException('epicId does not belong to this project');
    }
  }
}
