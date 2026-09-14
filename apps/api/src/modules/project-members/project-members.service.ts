import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';

/** FASE-03 shell. Membership independent of role grants (docs/domain-model.md). */
@Injectable()
export class ProjectMembersService {
  constructor(private readonly prisma: PrismaService) {}

  findAllForProject(projectId: string) {
    return this.prisma.projectMember.findMany({ where: { projectId } });
  }
}
