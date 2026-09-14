import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';

/**
 * FASE-03 shell. This is the brief's hierarchy rung between Epic and Task
 * (§5-6) — unrelated to the project-documentation skill's own unrelated use
 * of "template" for its starter .md files (docs/domain-model.md).
 */
@Injectable()
export class TemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  findAllForProject(projectId: string) {
    return this.prisma.template.findMany({ where: { projectId } });
  }
}
