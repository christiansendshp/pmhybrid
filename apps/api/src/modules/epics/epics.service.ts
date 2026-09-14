import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';

/** FASE-03 shell. Optional hierarchy rung (brief §5) — no level mandatory. */
@Injectable()
export class EpicsService {
  constructor(private readonly prisma: PrismaService) {}

  findAllForProject(projectId: string) {
    return this.prisma.epic.findMany({ where: { projectId } });
  }
}
