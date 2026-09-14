import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CreateEpicDto } from './dto/create-epic.dto.js';
import { UpdateEpicDto } from './dto/update-epic.dto.js';

@Injectable()
export class EpicsService {
  constructor(private readonly prisma: PrismaService) {}

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

  async create(projectId: string, dto: CreateEpicDto) {
    if (dto.phaseId) {
      await this.assertPhaseInProject(projectId, dto.phaseId);
    }
    return this.prisma.epic.create({ data: { ...dto, projectId } });
  }

  async update(projectId: string, id: string, dto: UpdateEpicDto) {
    await this.findById(projectId, id);
    if (dto.phaseId) {
      await this.assertPhaseInProject(projectId, dto.phaseId);
    }
    return this.prisma.epic.update({ where: { id }, data: dto });
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
