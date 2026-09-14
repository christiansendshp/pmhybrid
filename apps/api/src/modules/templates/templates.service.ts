import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CreateTemplateDto } from './dto/create-template.dto.js';
import { UpdateTemplateDto } from './dto/update-template.dto.js';

@Injectable()
export class TemplatesService {
  constructor(private readonly prisma: PrismaService) {}

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

  async create(projectId: string, dto: CreateTemplateDto) {
    if (dto.epicId) {
      await this.assertEpicInProject(projectId, dto.epicId);
    }
    return this.prisma.template.create({ data: { ...dto, projectId } });
  }

  async update(projectId: string, id: string, dto: UpdateTemplateDto) {
    await this.findById(projectId, id);
    if (dto.epicId) {
      await this.assertEpicInProject(projectId, dto.epicId);
    }
    return this.prisma.template.update({ where: { id }, data: dto });
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
