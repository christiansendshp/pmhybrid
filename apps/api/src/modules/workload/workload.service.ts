import { ForbiddenException, Injectable } from '@nestjs/common';
import { TaskStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ProgressRollupService } from '../tasks/progress-rollup.service.js';
import { WorkloadQueryDto } from './dto/workload-query.dto.js';

export interface WorkloadRow {
  actor: { id: string; displayName: string; kind: string; isActive: boolean };
  /** Null on an idle row: an active member with nothing assigned. */
  task: {
    id: string;
    title: string;
    phaseId: string | null;
    epicId: string | null;
  } | null;
  project: { id: string; name: string } | null;
  status: string | null;
  progress: number | null;
}

const ACTOR_SELECT = {
  id: true,
  displayName: true,
  kind: true,
  isActive: true,
} as const;

/**
 * "¿Quién está haciendo qué?" (brief §18) — cross-project by default, like
 * Dashboard, with `projectId` as one of several optional filters rather
 * than the view's scope. One row per (actor, assigned task) across the
 * projects the requester belongs to, plus — while no status, phase or epic
 * filter narrows the view to tasks — one idle row for every active member
 * with nothing assigned, so every active actor shows up. Rows are ordered by
 * actor name, most recently updated task first.
 */
@Injectable()
export class WorkloadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly progressRollup: ProgressRollupService,
  ) {}

  async getWorkload(
    requesterActorId: string,
    query: WorkloadQueryDto,
  ): Promise<WorkloadRow[]> {
    const memberships = await this.prisma.projectMember.findMany({
      where: { actorId: requesterActorId, isActive: true },
      select: { projectId: true },
    });
    const myProjectIds = memberships.map((m) => m.projectId);

    if (query.projectId && !myProjectIds.includes(query.projectId)) {
      throw new ForbiddenException('Not a member of this project');
    }
    const projectIds = query.projectId ? [query.projectId] : myProjectIds;
    if (projectIds.length === 0) {
      return [];
    }

    const tasks = await this.prisma.task.findMany({
      where: {
        projectId: { in: projectIds },
        deletedAt: null,
        assigneeActorId: query.actorId ?? { not: null },
        assignee: query.kind ? { kind: query.kind } : undefined,
        status: query.status ? (query.status as TaskStatus) : undefined,
        phaseId: query.phaseId ?? undefined,
        epicId: query.epicId ?? undefined,
      },
      include: {
        assignee: { select: ACTOR_SELECT },
        project: { select: { id: true, name: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });

    const taskRows: WorkloadRow[] = await Promise.all(
      tasks
        .filter((task) => task.assignee !== null)
        .map(async (task) => ({
          actor: task.assignee!,
          task: {
            id: task.id,
            title: task.title,
            phaseId: task.phaseId,
            epicId: task.epicId,
          },
          project: task.project,
          status: task.status,
          progress: await this.progressRollup.computeTaskProgress(task.id),
        })),
    );

    const narrowedToTasks = Boolean(
      query.status || query.phaseId || query.epicId,
    );
    const idleRows = narrowedToTasks
      ? []
      : await this.idleRows(
          projectIds,
          query,
          new Set(taskRows.map((row) => row.actor.id)),
        );

    // Array#sort is stable: within an actor, tasks keep their recency order.
    return [...taskRows, ...idleRows].sort((a, b) =>
      a.actor.displayName.localeCompare(b.actor.displayName),
    );
  }

  private async idleRows(
    projectIds: string[],
    query: WorkloadQueryDto,
    busyActorIds: Set<string>,
  ): Promise<WorkloadRow[]> {
    const members = await this.prisma.projectMember.findMany({
      where: {
        projectId: { in: projectIds },
        isActive: true,
        actorId: query.actorId ?? undefined,
        actor: { isActive: true, kind: query.kind ?? undefined },
      },
      distinct: ['actorId'],
      select: { actor: { select: ACTOR_SELECT } },
    });
    return members
      .filter((member) => !busyActorIds.has(member.actor.id))
      .map((member) => ({
        actor: member.actor,
        task: null,
        project: null,
        status: null,
        progress: null,
      }));
  }
}
