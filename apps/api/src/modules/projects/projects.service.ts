import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CreateProjectDto } from './dto/create-project.dto.js';
import { UpdateProjectDto } from './dto/update-project.dto.js';

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  /** "My Projects" (brief §19): only projects the actor is an active member of. */
  findAllForActor(actorId: string) {
    return this.prisma.project.findMany({
      where: { members: { some: { actorId, isActive: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(id: string) {
    const project = await this.prisma.project.findUnique({ where: { id } });
    if (!project) {
      throw new NotFoundException('Project not found');
    }
    return project;
  }

  /**
   * The creating actor becomes OWNER (brief §4) via a project-scoped
   * ActorRole, and a ProjectMember row, both created in the same
   * transaction as the project itself.
   */
  async create(dto: CreateProjectDto, creatorActorId: string) {
    const ownerRole = await this.prisma.role.findUniqueOrThrow({
      where: { name_scope: { name: 'OWNER', scope: 'PROJECT' } },
    });

    return this.prisma.$transaction(async (tx) => {
      const project = await tx.project.create({
        data: {
          name: dto.name,
          description: dto.description,
          repoUrl: dto.repoUrl,
          docsPath: dto.docsPath,
          syncIntervalMinutes: dto.syncIntervalMinutes,
          progressRollupStrategy: dto.progressRollupStrategy,
        },
      });
      await tx.projectMember.create({
        data: { projectId: project.id, actorId: creatorActorId },
      });
      await tx.actorRole.create({
        data: {
          projectId: project.id,
          actorId: creatorActorId,
          roleId: ownerRole.id,
        },
      });
      return project;
    });
  }

  async update(id: string, dto: UpdateProjectDto) {
    await this.findById(id);
    return this.prisma.project.update({ where: { id }, data: dto });
  }
}
