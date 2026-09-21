import { Injectable } from '@nestjs/common';
import { TaskStatus } from '@pmhybrid/shared-types';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ProgressRollupService } from '../tasks/progress-rollup.service.js';

export interface DashboardSummary {
  activeProjects: number;
  totalTasks: number;
  pendiente: number;
  asignada: number;
  enDesarrollo: number;
  qa: number;
  terminada: number;
  blocked: number;
  globalProgress: number | null;
}

/**
 * Cross-project aggregate for the actor's own membership set (brief §14).
 * Not project-scoped like every other controller so far — this is
 * deliberately the one view that spans "my projects" as a whole.
 */
@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly progressRollup: ProgressRollupService,
  ) {}

  private async myProjectIds(actorId: string): Promise<string[]> {
    const memberships = await this.prisma.projectMember.findMany({
      where: { actorId, isActive: true },
      select: { projectId: true },
    });
    return memberships.map((m) => m.projectId);
  }

  async getSummary(actorId: string): Promise<DashboardSummary> {
    const projectIds = await this.myProjectIds(actorId);
    if (projectIds.length === 0) {
      return {
        activeProjects: 0,
        totalTasks: 0,
        pendiente: 0,
        asignada: 0,
        enDesarrollo: 0,
        qa: 0,
        terminada: 0,
        blocked: 0,
        globalProgress: null,
      };
    }

    const [activeProjects, statusCounts, blocked, totalTasks, progresses] =
      await Promise.all([
        this.prisma.project.count({
          where: { id: { in: projectIds }, status: 'ACTIVE' },
        }),
        this.prisma.task.groupBy({
          by: ['status'],
          where: { projectId: { in: projectIds }, deletedAt: null },
          _count: { _all: true },
        }),
        this.prisma.task.count({
          where: {
            projectId: { in: projectIds },
            roadmapTable: 'BLOCKED',
            deletedAt: null,
          },
        }),
        this.prisma.task.count({
          where: { projectId: { in: projectIds }, deletedAt: null },
        }),
        this.progressRollup.computeProjectsProgress(projectIds),
      ]);

    const countFor = (status: TaskStatus): number =>
      statusCounts.find((row) => row.status === status)?._count._all ?? 0;
    const nonNullProgresses = [...progresses.values()].filter(
      (p): p is number => p !== null,
    );

    return {
      activeProjects,
      totalTasks,
      pendiente: countFor(TaskStatus.PENDIENTE),
      asignada: countFor(TaskStatus.ASIGNADA),
      enDesarrollo: countFor(TaskStatus.EN_DESARROLLO),
      qa: countFor(TaskStatus.QA),
      terminada: countFor(TaskStatus.TERMINADA),
      blocked,
      globalProgress:
        nonNullProgresses.length === 0
          ? null
          : nonNullProgresses.reduce((sum, p) => sum + p, 0) /
            nonNullProgresses.length,
    };
  }

  async getActivity(actorId: string) {
    const projectIds = await this.myProjectIds(actorId);
    if (projectIds.length === 0) {
      return {
        recentlyModifiedTasks: [],
        recentStatusChanges: [],
        recentAssignments: [],
        recentAgentEvents: [],
        recentDocumentChanges: [],
      };
    }

    const recentlyModifiedTasks = await this.prisma.task.findMany({
      where: { projectId: { in: projectIds }, deletedAt: null },
      orderBy: { updatedAt: 'desc' },
      take: 10,
    });

    const [
      recentStatusChanges,
      recentAssignments,
      recentAgentEvents,
      recentDocumentChanges,
    ] = await Promise.all([
      // More than ten, because the ones about a removed task are dropped below.
      this.prisma.auditEvent.findMany({
        where: {
          projectId: { in: projectIds },
          entityType: 'Task',
          operation: 'STATUS_CHANGE',
        },
        orderBy: { occurredAt: 'desc' },
        take: 30,
      }),
      this.prisma.taskAssignment.findMany({
        where: { task: { projectId: { in: projectIds } } },
        orderBy: { assignedAt: 'desc' },
        take: 10,
        include: {
          task: {
            select: {
              id: true,
              title: true,
              projectId: true,
              externalId: true,
            },
          },
          actor: { select: { displayName: true } },
        },
      }),
      this.prisma.agentLogEvent.findMany({
        where: { projectId: { in: projectIds } },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      this.prisma.documentRevision.findMany({
        where: { document: { projectId: { in: projectIds } } },
        orderBy: { capturedAt: 'desc' },
        take: 10,
        include: { document: { select: { kind: true, projectId: true } } },
      }),
    ]);

    // Which task each status change is about, so the feed can say and link to it
    // (Roadmap UX-03c2); a removed task's changes are not shown.
    const changedTasks = await this.prisma.task.findMany({
      where: {
        id: { in: recentStatusChanges.map((event) => event.entityId) },
        deletedAt: null,
      },
      select: { id: true, title: true, projectId: true, externalId: true },
    });
    const taskById = new Map(changedTasks.map((task) => [task.id, task]));

    return {
      recentlyModifiedTasks,
      recentStatusChanges: recentStatusChanges
        .filter((event) => taskById.has(event.entityId))
        .slice(0, 10)
        .map((event) => ({ ...event, task: taskById.get(event.entityId)! })),
      recentAssignments,
      recentAgentEvents,
      recentDocumentChanges,
    };
  }
}
