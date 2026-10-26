import { Injectable } from '@nestjs/common';
import { TaskStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { startOfUtcDay } from '../dashboard/period-summary.util.js';
import { PaceService } from '../metrics/pace.service.js';
import { RisksService } from '../risks/risks.service.js';
import { tallyStatuses } from '../snapshots/snapshot.util.js';
import {
  COUNTS_TOWARDS_PROGRESS,
  ProgressRollupService,
} from '../tasks/progress-rollup.service.js';
import { WaitingService } from '../waiting/waiting.service.js';
import { riskReasons, signalDetail } from './report-text.util.js';
import { buildReport, MAX_LISTED, type ReportInput } from './report.util.js';

const DAY = 24 * 60 * 60 * 1000;
const WEEK = 7 * DAY;
/** How many of the last complete weeks the pace section lists. */
const PACE_WEEKS = 4;

export interface StatusReport {
  generatedAt: string;
  /** The week the report covers, from `from` to `to`, as ISO times. */
  from: string;
  to: string;
  markdown: string;
}

const TASK_NAME = { externalId: true, title: true } as const;

/**
 * The weekly status report of a project, in Markdown (Roadmap TASK-48). It gathers what the app already computes (the
 * progress and the snapshot of a week ago, the pace and its forecast, the waits, the risks) and puts it in words with
 * `buildReport`; nothing is worked out here that another endpoint does not already give.
 */
@Injectable()
export class ReportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly progress: ProgressRollupService,
    private readonly pace: PaceService,
    private readonly risks: RisksService,
    private readonly waiting: WaitingService,
  ) {}

  async forProject(
    projectId: string,
    now: Date = new Date(),
  ): Promise<StatusReport> {
    const from = new Date(now.getTime() - WEEK);
    const work = { projectId, ...COUNTS_TOWARDS_PROGRESS };
    const listed = (status: TaskStatus) => ({
      where: { ...work, status },
      orderBy: { statusChangedAt: 'desc' as const },
      take: MAX_LISTED,
      select: TASK_NAME,
    });

    const [
      project,
      groups,
      percent,
      weekAgo,
      finishedCount,
      finished,
      created,
      pace,
      waiting,
      risks,
      development,
      assigned,
    ] = await Promise.all([
      this.prisma.project.findUniqueOrThrow({
        where: { id: projectId },
        select: { name: true },
      }),
      this.prisma.task.groupBy({
        by: ['status'],
        where: work,
        _count: { _all: true },
      }),
      this.progress.computeProjectProgress(projectId),
      this.prisma.projectSnapshot.findUnique({
        where: {
          projectId_day: {
            projectId,
            day: startOfUtcDay(new Date(now.getTime() - WEEK)),
          },
        },
      }),
      this.prisma.task.count({
        where: { ...work, completedAt: { gt: from, lte: now } },
      }),
      this.prisma.task.findMany({
        where: { ...work, completedAt: { gt: from, lte: now } },
        orderBy: { completedAt: 'desc' },
        take: MAX_LISTED,
        select: { ...TASK_NAME, completedAt: true },
      }),
      this.prisma.task.count({
        where: { ...work, createdAt: { gt: from, lte: now } },
      }),
      this.pace.forProject(projectId, PACE_WEEKS + 1, now),
      this.waiting.forProject(projectId),
      this.risks.forProject(projectId, now),
      Promise.all([
        this.prisma.task.count({
          where: { ...work, status: TaskStatus.EN_DESARROLLO },
        }),
        this.prisma.task.findMany(listed(TaskStatus.EN_DESARROLLO)),
      ]),
      Promise.all([
        this.prisma.task.count({
          where: { ...work, status: TaskStatus.ASIGNADA },
        }),
        this.prisma.task.findMany(listed(TaskStatus.ASIGNADA)),
      ]),
    ]);

    const tally = tallyStatuses(
      groups.map((group) => ({
        status: group.status,
        count: group._count._all,
      })),
    );
    const input: ReportInput = {
      projectName: project.name,
      from,
      to: now,
      progress: {
        percent: percent === null ? null : Math.round(percent),
        total: tally.total,
        done: tally.done,
        weekAgo: weekAgo
          ? {
              day: weekAgo.day.toISOString().slice(0, 10),
              total: weekAgo.total,
              done: weekAgo.done,
              percent: weekAgo.progress,
              approximate: weekAgo.source === 'RECONSTRUCTED',
            }
          : null,
      },
      finished: {
        count: finishedCount,
        tasks: finished.flatMap((task) =>
          task.completedAt ? [{ ...task, completedAt: task.completedAt }] : [],
        ),
      },
      created,
      pace: {
        weeks: pace.weeks
          .filter((week) => !week.partial)
          .slice(-PACE_WEEKS)
          .map(({ weekStart, completed, created: made }) => ({
            weekStart,
            completed,
            created: made,
          })),
        forecast: {
          status: pace.forecast.status,
          openTasks: pace.forecast.openTasks,
          range: pace.forecast.range,
        },
      },
      waiting: {
        blocked: waiting.items.filter((item) => item.kind === 'BLOCKED').length,
        decisions: waiting.items.filter((item) => item.kind === 'DECISION')
          .length,
        conflicts: waiting.items.filter((item) => item.kind === 'CONFLICT')
          .length,
        ledgerUnreadable: waiting.ledgerUnreadable,
        oldest: waiting.items.slice(0, MAX_LISTED).map((item) => ({
          kind: item.kind,
          label:
            [item.externalId, item.title].filter(Boolean).join(' ') ||
            'Un documento del proyecto',
          since: item.since,
        })),
      },
      risks: {
        light: risks.project.light,
        open: risks.project.open,
        reasons: riskReasons(risks.project.counts, risks.project.blocked),
        signals: risks.signals.slice(0, MAX_LISTED).map((signal) => ({
          kind: signal.kind,
          task: signal.task,
          detail: signalDetail(signal),
        })),
        signalsTotal: risks.signals.length,
        criticalPath: risks.criticalPath.map((step) => step.task),
      },
      inDevelopment: { count: development[0], tasks: development[1] },
      next: { count: assigned[0], tasks: assigned[1] },
    };

    return {
      generatedAt: now.toISOString(),
      from: from.toISOString(),
      to: now.toISOString(),
      markdown: buildReport(input),
    };
  }
}
