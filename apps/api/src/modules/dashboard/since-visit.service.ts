import { Injectable } from '@nestjs/common';
import { Prisma, TaskStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { COUNTS_TOWARDS_PROGRESS } from '../tasks/progress-rollup.service.js';
import {
  hasNews,
  MAX_TASKS_LISTED,
  newsKind,
  sinceOf,
  unblockedIds,
  type NewsKind,
  type ProjectNews,
} from './since-visit.util.js';

export interface SinceLastVisit {
  generatedAt: string;
  /** The projects of the person that have something new, by name. */
  projects: ProjectNews[];
}

const TASK_REF = { id: true, externalId: true, title: true } as const;

/**
 * What happened in each of a person's projects since they last marked it as seen (Roadmap TASK-38). The marker is
 * the person's own and moves only when they say so, so nothing disappears from the list unseen. It reads the tasks
 * that count towards the progress, as the figures of the rest of the app do.
 */
@Injectable()
export class SinceVisitService {
  constructor(private readonly prisma: PrismaService) {}

  async forActor(
    actorId: string,
    now: Date = new Date(),
  ): Promise<SinceLastVisit> {
    const memberships = await this.prisma.projectMember.findMany({
      where: { actorId, isActive: true, project: { status: 'ACTIVE' } },
      select: { project: { select: { id: true, name: true } } },
    });
    const projects = memberships.map((membership) => membership.project);
    const markers = await this.prisma.projectSeen.findMany({
      where: {
        actorId,
        projectId: { in: projects.map((project) => project.id) },
      },
    });
    const seenAt = new Map(
      markers.map((marker) => [marker.projectId, marker.seenAt]),
    );

    const news = await Promise.all(
      projects.map((project) =>
        this.newsOf(
          project.id,
          project.name,
          sinceOf(seenAt.get(project.id) ?? null, now),
        ),
      ),
    );
    return {
      generatedAt: now.toISOString(),
      projects: news
        .filter(hasNews)
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  }

  /**
   * Moves the person's marker to now for the projects they belong to: the ones asked for, or all of theirs.
   * A project they do not belong to is left alone, whatever was asked.
   */
  async markSeen(
    actorId: string,
    projectIds: readonly string[] | undefined,
    now: Date = new Date(),
  ): Promise<{ projectIds: string[] }> {
    const memberships = await this.prisma.projectMember.findMany({
      where: {
        actorId,
        isActive: true,
        ...(projectIds ? { projectId: { in: [...projectIds] } } : {}),
      },
      select: { projectId: true },
    });
    const marked = memberships.map((membership) => membership.projectId);
    await this.prisma.$transaction(
      marked.map((projectId) =>
        this.prisma.projectSeen.upsert({
          where: { actorId_projectId: { actorId, projectId } },
          create: { actorId, projectId, seenAt: now },
          update: { seenAt: now },
        }),
      ),
    );
    return { projectIds: marked };
  }

  private async newsOf(
    projectId: string,
    name: string,
    since: Date,
  ): Promise<ProjectNews> {
    const work = { projectId, ...COUNTS_TOWARDS_PROGRESS };
    const [done, blocked, newScope, conflicts, unblocked] = await Promise.all([
      this.kind(
        { ...work, completedAt: { gt: since } },
        { completedAt: 'desc' },
      ),
      this.kind(
        { ...work, roadmapTable: 'BLOCKED', blockedSince: { gt: since } },
        { blockedSince: 'desc' },
      ),
      this.kind({ ...work, createdAt: { gt: since } }, { createdAt: 'desc' }),
      this.prisma.conflict.count({
        where: { projectId, resolvedAt: null, detectedAt: { gt: since } },
      }),
      this.unblocked(projectId, since),
    ]);
    return {
      projectId,
      name,
      since: since.toISOString(),
      done,
      blocked,
      unblocked,
      newScope,
      conflicts,
    };
  }

  private async kind(
    where: Prisma.TaskWhereInput,
    orderBy: Prisma.TaskOrderByWithRelationInput,
  ): Promise<NewsKind> {
    const [count, tasks] = await Promise.all([
      this.prisma.task.count({ where }),
      this.prisma.task.findMany({
        where,
        orderBy,
        take: MAX_TASKS_LISTED,
        select: TASK_REF,
      }),
    ]);
    return newsKind(tasks, count);
  }

  /** The audit trail is where a move out of the Blocked table is kept: the tasks it names, if they are neither blocked nor done now. */
  private async unblocked(projectId: string, since: Date): Promise<NewsKind> {
    const changes = await this.prisma.auditEvent.findMany({
      where: {
        projectId,
        entityType: 'Task',
        occurredAt: { gt: since },
        previousValue: { path: ['roadmapTable'], equals: 'BLOCKED' },
      },
      select: { entityId: true, newValue: true },
    });
    const ids = unblockedIds(changes);
    if (ids.length === 0) {
      return newsKind([]);
    }
    return this.kind(
      {
        projectId,
        id: { in: ids },
        status: { not: TaskStatus.TERMINADA },
        // `not` alone drops the tasks that are in no table, which is most of them once unblocked.
        AND: [
          COUNTS_TOWARDS_PROGRESS,
          {
            OR: [{ roadmapTable: null }, { roadmapTable: { not: 'BLOCKED' } }],
          },
        ],
      },
      { statusChangedAt: 'desc' },
    );
  }
}
