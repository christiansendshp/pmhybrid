import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService, diffFields } from '../audit/audit.service.js';
import { CreateProjectDto } from './dto/create-project.dto.js';
import { UpdateProjectDto } from './dto/update-project.dto.js';

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

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
      await this.audit.record(
        {
          projectId: project.id,
          actorId: creatorActorId,
          entityType: 'Project',
          entityId: project.id,
          operation: 'CREATE',
          origin: 'UI',
          newValue: diffFields(
            {},
            {
              name: project.name,
              description: project.description,
              repoUrl: project.repoUrl,
              docsPath: project.docsPath,
              syncIntervalMinutes: project.syncIntervalMinutes,
              progressRollupStrategy: project.progressRollupStrategy,
            },
          )?.newValue,
        },
        tx,
      );
      return project;
    });
  }

  /** Audits only the settings that actually changed; a no-op PATCH writes nothing. */
  async update(id: string, dto: UpdateProjectDto, requesterActorId: string) {
    const project = await this.findById(id);
    const diff = diffFields(project as unknown as Record<string, unknown>, {
      ...dto,
    });
    if (!diff) {
      return project;
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.project.update({ where: { id }, data: dto });
      await this.audit.record(
        {
          projectId: id,
          actorId: requesterActorId,
          entityType: 'Project',
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
}
