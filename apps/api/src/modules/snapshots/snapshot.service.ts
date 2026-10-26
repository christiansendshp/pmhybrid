import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma, TaskStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { startOfUtcDay } from '../dashboard/period-summary.util.js';
import { NON_WORK_ENTRY_TYPES } from '../roadmap/roadmap-attributes.util.js';
import {
  COUNTS_TOWARDS_PROGRESS,
  ProgressRollupService,
} from '../tasks/progress-rollup.service.js';
import {
  dayKey,
  daysToReconstruct,
  tallyStatuses,
  totalsAtEndOf,
  type StatusCounts,
} from './snapshot.util.js';

const DAY = 24 * 60 * 60 * 1000;

/** The days of history asked for when the request says none (Roadmap TASK-46). */
export const DEFAULT_SNAPSHOT_DAYS = 30;
export const MAX_SNAPSHOT_DAYS = 365;

export interface SnapshotDay {
  /** The UTC day, `YYYY-MM-DD`. */
  day: string;
  /** RECORDED the day it was, or RECONSTRUCTED later from the tasks' dates: approximate. */
  source: 'RECORDED' | 'RECONSTRUCTED';
  total: number;
  done: number;
  /** Null for a reconstructed day: it cannot be known. */
  byStatus: StatusCounts | null;
  blocked: number | null;
  openConflicts: number | null;
  progress: number | null;
}

/**
 * The state of each active project, one row a day (Roadmap TASK-46): the counts of the tasks that count towards the
 * progress, the open conflicts and the progress, so how a project was two weeks ago is a number and not a
 * reconstruction. A job records it at 00:10 UTC; a day already recorded is never written twice.
 */
@Injectable()
export class SnapshotService {
  private readonly logger = new Logger(SnapshotService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly progress: ProgressRollupService,
  ) {}

  @Cron('10 0 * * *', { timeZone: 'UTC' })
  async scheduled(): Promise<void> {
    try {
      const { recorded } = await this.recordDay(new Date());
      if (recorded > 0) {
        this.logger.log(`Recorded the snapshot of ${recorded} project(s)`);
      }
    } catch (error) {
      this.logger.error(`The daily snapshot failed: ${String(error)}`);
    }
  }

  /**
   * Records the day of `now` for the active projects, or only for the ones named. One project's failure is logged
   * and does not stop the others; a project that already has its row for the day keeps it.
   */
  async recordDay(
    now: Date,
    onlyProjectIds?: readonly string[],
  ): Promise<{ recorded: number }> {
    const projects = await this.prisma.project.findMany({
      where: {
        status: 'ACTIVE',
        ...(onlyProjectIds ? { id: { in: [...onlyProjectIds] } } : {}),
      },
      select: { id: true },
    });
    const day = startOfUtcDay(now);
    const progress = await this.progress.computeProjectsProgress(
      projects.map((project) => project.id),
    );
    let recorded = 0;
    for (const { id } of projects) {
      try {
        const row = await this.rowOf(id, day, progress.get(id) ?? null);
        const written = await this.prisma.projectSnapshot.createMany({
          data: [row],
          skipDuplicates: true,
        });
        recorded += written.count;
      } catch (error) {
        this.logger.error(
          `The snapshot of project ${id} failed: ${String(error)}`,
        );
      }
    }
    return { recorded };
  }

  /** The last `days` days a project has a snapshot for, oldest first. */
  async history(
    projectId: string,
    days: number = DEFAULT_SNAPSHOT_DAYS,
    now: Date = new Date(),
  ): Promise<SnapshotDay[]> {
    const from = new Date(startOfUtcDay(now).getTime() - (days - 1) * DAY);
    const rows = await this.prisma.projectSnapshot.findMany({
      where: { projectId, day: { gte: from } },
      orderBy: { day: 'asc' },
    });
    return rows.map((row) => ({
      day: dayKey(row.day),
      source: row.source,
      total: row.total,
      done: row.done,
      byStatus: row.byStatus as StatusCounts | null,
      blocked: row.blocked,
      openConflicts: row.openConflicts,
      progress: row.progress,
    }));
  }

  /**
   * Rebuilds the past days a project has no snapshot for, from the dates of its tasks (Roadmap TASK-47): total and
   * done at the end of each day, and nothing else, because nothing else can be known. The rows say they are
   * RECONSTRUCTED. A day that has a snapshot, recorded or rebuilt, is never touched, and neither is today, which is the
   * job's.
   */
  async reconstruct(
    projectId: string,
    days: number = DEFAULT_SNAPSHOT_DAYS,
    now: Date = new Date(),
  ): Promise<{ written: number; days: string[] }> {
    const today = startOfUtcDay(now);
    const [project, tasks, existing] = await Promise.all([
      this.prisma.project.findUniqueOrThrow({
        where: { id: projectId },
        select: { createdAt: true },
      }),
      this.prisma.task.findMany({
        where: {
          projectId,
          OR: [
            { entryType: null },
            { entryType: { notIn: [...NON_WORK_ENTRY_TYPES] } },
          ],
        },
        select: { createdAt: true, completedAt: true, deletedAt: true },
      }),
      this.prisma.projectSnapshot.findMany({
        where: {
          projectId,
          day: { gte: new Date(today.getTime() - days * DAY) },
        },
        select: { day: true },
      }),
    ]);
    const missing = daysToReconstruct(
      today,
      days,
      new Set(existing.map((row) => dayKey(row.day))),
      project.createdAt,
    );
    const written = await this.prisma.projectSnapshot.createMany({
      data: missing.map((day) => ({
        projectId,
        day,
        source: 'RECONSTRUCTED' as const,
        ...totalsAtEndOf(tasks, day),
      })),
      skipDuplicates: true,
    });
    return { written: written.count, days: missing.map(dayKey) };
  }

  private async rowOf(
    projectId: string,
    day: Date,
    progress: number | null,
  ): Promise<Prisma.ProjectSnapshotCreateManyInput> {
    const work = { projectId, ...COUNTS_TOWARDS_PROGRESS };
    const [groups, blocked, openConflicts] = await Promise.all([
      this.prisma.task.groupBy({
        by: ['status'],
        where: work,
        _count: { _all: true },
      }),
      this.prisma.task.count({
        where: {
          ...work,
          status: { not: TaskStatus.TERMINADA },
          roadmapTable: 'BLOCKED',
        },
      }),
      this.prisma.conflict.count({ where: { projectId, resolvedAt: null } }),
    ]);
    const tally = tallyStatuses(
      groups.map((group) => ({
        status: group.status,
        count: group._count._all,
      })),
    );
    return {
      projectId,
      day,
      source: 'RECORDED',
      total: tally.total,
      done: tally.done,
      byStatus: tally.byStatus,
      blocked,
      openConflicts,
      progress: progress === null ? null : Math.round(progress),
    };
  }
}
