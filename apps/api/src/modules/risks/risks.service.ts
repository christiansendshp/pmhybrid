import { Injectable } from '@nestjs/common';
import { TaskStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { COUNTS_TOWARDS_PROGRESS } from '../tasks/progress-rollup.service.js';
import {
  holdsTask,
  risksOf,
  type CriticalStep,
  type RiskSignal,
  type Risks,
  type Semaphore,
  type WaitingTask,
} from './risks.util.js';

export interface PhaseRisk {
  phaseId: string;
  name: string;
  semaphore: Semaphore;
}

export interface EpicRisk {
  epicId: string;
  name: string;
  semaphore: Semaphore;
}

export interface ProjectRisks {
  generatedAt: string;
  /** The hours without activity that make a task in development stale, from the project's settings. */
  staleAfterHours: number;
  signals: RiskSignal[];
  criticalPath: CriticalStep[];
  /** What blocks what: every open task that waits for another open one (Roadmap TASK-22). */
  waiting: WaitingTask[];
  project: Semaphore;
  /** Every phase of the project, in its own order: one with nothing open has no light. */
  phases: PhaseRisk[];
  epics: EpicRisk[];
}

/** The semaphore of a group with nothing open. */
const NOTHING_OPEN: Semaphore = {
  light: null,
  open: 0,
  blocked: 0,
  counts: {
    UNOWNED_IN_DEVELOPMENT: 0,
    BLOCKED_BY_BLOCKED: 0,
    STALE_IN_DEVELOPMENT: 0,
    OVERDUE: 0,
  },
};

/**
 * The risks of a project (Roadmap TASK-44): TASK-43's signals, critical path and semaphores over its open tasks.
 * It only reads. The tasks are the ones that count towards the progress, and a task's last activity is the latest of
 * its status change, the ledger entries about it and its comments: the other timestamps of the row move whenever a
 * sync touches it, which says nothing about whether anyone worked on it.
 */
@Injectable()
export class RisksService {
  constructor(private readonly prisma: PrismaService) {}

  async forProject(
    projectId: string,
    now: Date = new Date(),
  ): Promise<ProjectRisks> {
    const [project, tasks, phases, epics] = await Promise.all([
      this.prisma.project.findUniqueOrThrow({
        where: { id: projectId },
        select: { staleAfterHours: true },
      }),
      this.prisma.task.findMany({
        where: {
          projectId,
          ...COUNTS_TOWARDS_PROGRESS,
          status: { not: TaskStatus.TERMINADA },
        },
        select: {
          id: true,
          externalId: true,
          title: true,
          status: true,
          assigneeActorId: true,
          rawOwner: true,
          roadmapTable: true,
          dueDate: true,
          statusChangedAt: true,
          phaseId: true,
          epicId: true,
        },
      }),
      this.prisma.phase.findMany({
        where: { projectId },
        orderBy: { order: 'asc' },
        select: { id: true, name: true },
      }),
      this.prisma.epic.findMany({
        where: { projectId },
        select: { id: true, name: true },
      }),
    ]);
    const ids = tasks.map((task) => task.id);

    const [dependencies, ledger, comments] = await Promise.all([
      this.prisma.taskDependency.findMany({
        where: { taskId: { in: ids }, dependsOnTaskId: { in: ids } },
        select: { taskId: true, dependsOnTaskId: true },
      }),
      this.prisma.agentLogEvent.groupBy({
        by: ['taskId'],
        where: { taskId: { in: ids } },
        _max: { timestampFromLog: true },
      }),
      this.prisma.taskComment.groupBy({
        by: ['taskId'],
        where: { taskId: { in: ids } },
        _max: { createdAt: true },
      }),
    ]);
    const latestLedger = new Map(
      ledger.map((row) => [row.taskId, row._max.timestampFromLog]),
    );
    const latestComment = new Map(
      comments.map((row) => [row.taskId, row._max.createdAt]),
    );

    const risks: Risks = risksOf({
      tasks: tasks.map((task) => ({
        id: task.id,
        externalId: task.externalId,
        title: task.title,
        status: task.status,
        hasOwner: holdsTask(task.assigneeActorId, task.rawOwner),
        blocked: task.roadmapTable === 'BLOCKED',
        dueDate: task.dueDate,
        lastActivityAt: new Date(
          Math.max(
            task.statusChangedAt.getTime(),
            latestLedger.get(task.id)?.getTime() ?? 0,
            latestComment.get(task.id)?.getTime() ?? 0,
          ),
        ),
        phaseId: task.phaseId,
        epicId: task.epicId,
      })),
      dependencies: dependencies.flatMap((dependency) =>
        dependency.dependsOnTaskId
          ? [
              {
                taskId: dependency.taskId,
                dependsOnTaskId: dependency.dependsOnTaskId,
              },
            ]
          : [],
      ),
      now,
      staleAfterHours: project.staleAfterHours,
    });

    const phaseLight = new Map(
      risks.byPhase.map(({ phaseId, ...semaphore }) => [phaseId, semaphore]),
    );
    const epicLight = new Map(
      risks.byEpic.map(({ epicId, ...semaphore }) => [epicId, semaphore]),
    );
    return {
      generatedAt: now.toISOString(),
      staleAfterHours: project.staleAfterHours,
      signals: risks.signals,
      criticalPath: risks.criticalPath,
      waiting: risks.waiting,
      project: risks.project,
      phases: phases.map((phase) => ({
        phaseId: phase.id,
        name: phase.name,
        semaphore: phaseLight.get(phase.id) ?? NOTHING_OPEN,
      })),
      epics: epics
        .map((epic) => ({
          epicId: epic.id,
          name: epic.name,
          semaphore: epicLight.get(epic.id) ?? NOTHING_OPEN,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  }
}
