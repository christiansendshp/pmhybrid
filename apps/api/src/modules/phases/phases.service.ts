import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CreatePhaseDto } from './dto/create-phase.dto.js';
import { UpdatePhaseDto } from './dto/update-phase.dto.js';

/** Optional hierarchy rung (brief §5) — no level is mandatory. */
@Injectable()
export class PhasesService {
  constructor(private readonly prisma: PrismaService) {}

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

  create(projectId: string, dto: CreatePhaseDto) {
    return this.prisma.phase.create({ data: { ...dto, projectId } });
  }

  async update(projectId: string, id: string, dto: UpdatePhaseDto) {
    await this.findById(projectId, id);
    return this.prisma.phase.update({ where: { id }, data: dto });
  }
}
