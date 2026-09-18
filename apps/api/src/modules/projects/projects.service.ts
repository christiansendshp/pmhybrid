import { Injectable, NotFoundException } from '@nestjs/common';
import { AuditOrigin, TaskStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService, diffFields } from '../audit/audit.service.js';
import { ProgressRollupService } from '../tasks/progress-rollup.service.js';
import { CreateProjectDto } from './dto/create-project.dto.js';
import { UpdateProjectDto } from './dto/update-project.dto.js';

/** Work someone has picked up and not finished. */
const ACTIVE_TASK_STATUSES: TaskStatus[] = ['ASIGNADA', 'EN_DESARROLLO', 'QA'];

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly progressRollup: ProgressRollupService,
  ) {}

  /** "My Projects" (brief §19): the projects the actor is an active member of, each with its summary. */
  async findAllForActor(actorId: string) {
    const projects = await this.prisma.project.findMany({
      where: { members: { some: { actorId, isActive: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return Promise.all(
      projects.map(async (project) => ({
        ...project,
        summary: await this.summarize(project.id),
      })),
    );
  }

  /**
   * Brief §19 per-project figures: progress; active tasks (ASIGNADA,
   * EN_DESARROLLO or QA); overdue tasks (past their due date and not
   * TERMINADA); active agents (active AI agents assigned to active tasks);
   * unresolved conflicts; and the latest sync run.
   */
  private async summarize(projectId: string) {
    const live = { projectId, deletedAt: null };
    const [
      progress,
      activeTasks,
      overdueTasks,
      agentAssignees,
      openConflicts,
      lastSyncRun,
    ] = await Promise.all([
      this.progressRollup.computeProjectProgress(projectId),
      this.prisma.task.count({
        where: { ...live, status: { in: ACTIVE_TASK_STATUSES } },
      }),
      this.prisma.task.count({
        where: {
          ...live,
          status: { not: 'TERMINADA' },
          dueDate: { lt: new Date() },
        },
      }),
      this.prisma.task.findMany({
        where: {
          ...live,
          status: { in: ACTIVE_TASK_STATUSES },
          assignee: { kind: 'AI_AGENT', isActive: true },
        },
        distinct: ['assigneeActorId'],
        select: { assigneeActorId: true },
      }),
      this.prisma.conflict.count({ where: { projectId, resolvedAt: null } }),
      this.prisma.syncRun.findFirst({
        where: { projectId },
        orderBy: { startedAt: 'desc' },
        select: { status: true, startedAt: true, finishedAt: true },
      }),
    ]);
    return {
      progress,
      activeTasks,
      overdueTasks,
      activeAgents: agentAssignees.length,
      openConflicts,
      lastSyncRun,
    };
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
  async create(
    dto: CreateProjectDto,
    creatorActorId: string,
    origin: AuditOrigin = 'UI',
  ) {
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
          origin,
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
  async update(
    id: string,
    dto: UpdateProjectDto,
    requesterActorId: string,
    origin: AuditOrigin = 'UI',
  ) {
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
          origin,
          ...diff,
        },
        tx,
      );
      return updated;
    });
  }
}
