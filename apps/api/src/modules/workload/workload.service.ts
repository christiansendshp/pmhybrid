import { ForbiddenException, Injectable } from '@nestjs/common';
import { TaskStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ProgressRollupService } from '../tasks/progress-rollup.service.js';
import { WorkloadQueryDto } from './dto/workload-query.dto.js';

export interface WorkloadRow {
  actor: { id: string; displayName: string; kind: string };
  task: {
    id: string;
    title: string;
    phaseId: string | null;
    epicId: string | null;
  };
  project: { id: string; name: string };
  status: string;
  progress: number;
}

/**
 * "¿Quién está haciendo qué?" (brief §18) — cross-project by default, like
 * Dashboard, with `projectId` as one of several optional filters rather
 * than the view's scope. Rows are one per (actor, currently-assigned
 * task) — only tasks with an assignee show up, across the projects the
 * requesting actor is themselves a member of.
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
        assigneeActorId: query.actorId ?? { not: null },
        status: query.status ? (query.status as TaskStatus) : undefined,
        phaseId: query.phaseId ?? undefined,
        epicId: query.epicId ?? undefined,
      },
      include: {
        assignee: { select: { id: true, displayName: true, kind: true } },
        project: { select: { id: true, name: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });

    const rows = await Promise.all(
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
    return rows;
  }
}
