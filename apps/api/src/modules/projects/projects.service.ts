import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuditOrigin, TaskStatus } from '@prisma/client';
import type { EnvConfig } from '../../config/env.validation.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService, diffFields } from '../audit/audit.service.js';
import {
  assertSafeRemoteDocsPath,
  docsPathKey,
  parseAllowedRoots,
  resolveAllowedLocalDocsPath,
} from '../git-providers/docs-path-policy.js';
import { PROJECT_REPOSITORY_PROVIDER } from '../git-providers/project-repository-provider.interface.js';
import type { ProjectRepositoryProvider } from '../git-providers/project-repository-provider.interface.js';
import { ProgressRollupService } from '../tasks/progress-rollup.service.js';
import { DOCUMENT_SKELETONS } from './document-skeletons.js';
import { CreateProjectDto } from './dto/create-project.dto.js';
import { UpdateProjectDto } from './dto/update-project.dto.js';

/** Work someone has picked up and not finished. */
const ACTIVE_TASK_STATUSES: TaskStatus[] = ['ASIGNADA', 'EN_DESARROLLO', 'QA'];

/** One project's figures in "My Projects" (brief §19). */
export interface ProjectSummary {
  progress: number | null;
  activeTasks: number;
  overdueTasks: number;
  activeAgents: number;
  openConflicts: number;
  lastSyncRun: {
    status: string;
    startedAt: Date;
    finishedAt: Date | null;
  } | null;
}

/** `findById`/`findAllForActor` (Roadmap GAP-32): the lead's identity, same shape Task's assignee already returns. */
const LEAD_SELECT = {
  select: { id: true, displayName: true, kind: true },
} as const;

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly progressRollup: ProgressRollupService,
    private readonly config: ConfigService<EnvConfig, true>,
    @Inject(PROJECT_REPOSITORY_PROVIDER)
    private readonly repositoryProvider: ProjectRepositoryProvider,
  ) {}

  /**
   * Validates and normalizes a `docsPath` before it is stored (Roadmap
   * SECURITY-01). Local provider: it must sit inside an allowed root and
   * must not be the folder of a project the requester does not belong to
   * (otherwise anyone could alias another team's documents and read or
   * overwrite them). A project may still reuse a folder that only projects
   * the requester belongs to already use. `excludeProjectId` skips the
   * project being edited.
   */
  private async checkedDocsPath(
    raw: string,
    requesterActorId: string,
    excludeProjectId?: string,
  ): Promise<string> {
    if (this.config.get('GIT_PROVIDER_TYPE', { infer: true }) !== 'local') {
      assertSafeRemoteDocsPath(raw);
      return raw;
    }
    const roots = parseAllowedRoots(
      this.config.get('PROJECT_DOCS_BROWSE_ROOT', { infer: true }),
    );
    const resolved = await resolveAllowedLocalDocsPath(raw, roots);
    const key = docsPathKey(resolved);
    const others = await this.prisma.project.findMany({
      where: excludeProjectId ? { id: { not: excludeProjectId } } : {},
      select: { id: true, docsPath: true },
    });
    const sharing = others
      .filter((project) => docsPathKey(project.docsPath) === key)
      .map((project) => project.id);
    if (sharing.length > 0) {
      const memberOf = await this.prisma.projectMember.count({
        where: {
          actorId: requesterActorId,
          isActive: true,
          projectId: { in: sharing },
        },
      });
      if (memberOf < sharing.length) {
        throw new ConflictException('docsPath is not available');
      }
    }
    return resolved;
  }

  /** "My Projects" (brief §19): the projects the actor is an active member of, each with its summary. */
  async findAllForActor(actorId: string) {
    const projects = await this.prisma.project.findMany({
      where: { members: { some: { actorId, isActive: true } } },
      orderBy: { createdAt: 'desc' },
      include: { lead: LEAD_SELECT },
    });
    const summaries = await this.summarize(
      projects.map((project) => project.id),
    );
    return projects.map((project) => ({
      ...project,
      summary: summaries.get(project.id)!,
    }));
  }

  /**
   * Brief §19 per-project figures: progress; active tasks (ASIGNADA,
   * EN_DESARROLLO or QA); overdue tasks (past their due date and not
   * TERMINADA); active agents (active AI agents assigned to active tasks);
   * unresolved conflicts; and the latest sync run — for all the projects at
   * once, with a fixed number of queries whatever their number (Roadmap
   * IMPROVEMENT-01c). It ran six queries per project, all projects at the
   * same time, so an account with a few thousand projects exhausted the
   * connection pool and the list answered 500.
   */
  private async summarize(projectIds: string[]) {
    if (projectIds.length === 0) {
      return new Map<string, ProjectSummary>();
    }
    const live = { projectId: { in: projectIds }, deletedAt: null };
    const [
      progress,
      activeTasks,
      overdueTasks,
      agentAssignees,
      openConflicts,
      lastRuns,
    ] = await Promise.all([
      this.progressRollup.computeProjectsProgress(projectIds),
      this.prisma.task.groupBy({
        by: ['projectId'],
        where: { ...live, status: { in: ACTIVE_TASK_STATUSES } },
        _count: { _all: true },
      }),
      this.prisma.task.groupBy({
        by: ['projectId'],
        where: {
          ...live,
          status: { not: 'TERMINADA' },
          dueDate: { lt: new Date() },
        },
        _count: { _all: true },
      }),
      this.prisma.task.findMany({
        where: {
          ...live,
          status: { in: ACTIVE_TASK_STATUSES },
          assignee: { kind: 'AI_AGENT', isActive: true },
        },
        distinct: ['projectId', 'assigneeActorId'],
        select: { projectId: true },
      }),
      this.prisma.conflict.groupBy({
        by: ['projectId'],
        where: { projectId: { in: projectIds }, resolvedAt: null },
        _count: { _all: true },
      }),
      this.prisma.syncRun.findMany({
        where: { projectId: { in: projectIds } },
        orderBy: { startedAt: 'desc' },
        distinct: ['projectId'],
        select: {
          projectId: true,
          status: true,
          startedAt: true,
          finishedAt: true,
        },
      }),
    ]);
    const counts = (rows: { projectId: string; _count: { _all: number } }[]) =>
      new Map(rows.map((row) => [row.projectId, row._count._all]));
    const active = counts(activeTasks);
    const overdue = counts(overdueTasks);
    const conflicts = counts(openConflicts);
    const agents = new Map<string, number>();
    for (const row of agentAssignees) {
      agents.set(row.projectId, (agents.get(row.projectId) ?? 0) + 1);
    }
    const lastRunOf = new Map(lastRuns.map((run) => [run.projectId, run]));
    return new Map<string, ProjectSummary>(
      projectIds.map((id) => {
        const run = lastRunOf.get(id);
        return [
          id,
          {
            progress: progress.get(id) ?? null,
            activeTasks: active.get(id) ?? 0,
            overdueTasks: overdue.get(id) ?? 0,
            activeAgents: agents.get(id) ?? 0,
            openConflicts: conflicts.get(id) ?? 0,
            lastSyncRun: run
              ? {
                  status: run.status,
                  startedAt: run.startedAt,
                  finishedAt: run.finishedAt,
                }
              : null,
          },
        ];
      }),
    );
  }
  async findById(id: string) {
    const project = await this.prisma.project.findUnique({
      where: { id },
      include: { lead: LEAD_SELECT },
    });
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
    const docsPath = await this.checkedDocsPath(dto.docsPath, creatorActorId);
    // A new project on an empty or missing folder gets the two documents PM Hub
    // reads and writes, so its first sync and its first task work instead of
    // failing on a file that is not there (Roadmap GAP-36a). Files that exist
    // are never touched, and a remote provider creates nothing.
    const scaffolded = await this.repositoryProvider.ensureDocuments(
      docsPath,
      DOCUMENT_SKELETONS,
    );
    const ownerRole = await this.prisma.role.findUniqueOrThrow({
      where: { name_scope: { name: 'OWNER', scope: 'PROJECT' } },
    });

    return this.prisma.$transaction(async (tx) => {
      const project = await tx.project.create({
        data: {
          name: dto.name,
          description: dto.description,
          repoUrl: dto.repoUrl,
          docsPath,
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
      return { ...project, scaffolded };
    });
  }

  /**
   * Audits only the settings that actually changed; a no-op PATCH writes
   * nothing. `leadActorId` (Roadmap GAP-32) must name an active member of
   * this project with an active Actor — same rule TasksService.assign()
   * already enforces for a task's assignee — unless it's `null`, which
   * always clears the lead without needing to be a member of anything.
   */
  async update(
    id: string,
    dto: UpdateProjectDto,
    requesterActorId: string,
    origin: AuditOrigin = 'UI',
  ) {
    if (dto.leadActorId) {
      const member = await this.prisma.projectMember.findUnique({
        where: {
          projectId_actorId: { projectId: id, actorId: dto.leadActorId },
        },
        include: { actor: { select: { isActive: true } } },
      });
      if (!member || !member.isActive) {
        throw new BadRequestException('Lead must be a project member');
      }
      if (!member.actor.isActive) {
        throw new BadRequestException('Lead is inactive');
      }
    }

    const project = await this.findById(id);
    const data: UpdateProjectDto = { ...dto };
    if (dto.docsPath !== undefined) {
      // Only a real change is validated: the settings form resubmits the
      // stored value on every save, and a project stored before the
      // confinement existed must stay editable for its other settings.
      data.docsPath =
        docsPathKey(dto.docsPath) === docsPathKey(project.docsPath)
          ? project.docsPath
          : await this.checkedDocsPath(dto.docsPath, requesterActorId, id);
    }
    const diff = diffFields(project as unknown as Record<string, unknown>, {
      ...data,
    });
    if (!diff) {
      return project;
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.project.update({
        where: { id },
        data,
        include: { lead: LEAD_SELECT },
      });
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
