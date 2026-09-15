import { Injectable } from '@nestjs/common';
import { TaskStatus } from '@pmhybrid/shared-types';
import { PrismaService } from '../../prisma/prisma.service.js';

export type StatusCounts = Record<TaskStatus, number>;

export interface ProgressTaskNode {
  kind: 'TASK';
  id: string;
  name: string;
  status: TaskStatus;
  progress: number;
  /** This task plus every descendant subtask, by status — same meaning as the container-level field below. */
  statusCounts: StatusCounts;
  /** Brief §16 "subtareas en el árbol" — nested arbitrarily deep, mirroring parentTaskId chains. */
  subtasks: ProgressTaskNode[];
}

export interface ProgressEpicNode {
  kind: 'EPIC';
  id: string;
  name: string;
  progress: number | null;
  /** This epic's own tasks and every one of their subtasks, by status (brief §16 "conteos por estado"). */
  statusCounts: StatusCounts;
  tasks: ProgressTaskNode[];
}

export interface ProgressPhaseNode {
  kind: 'PHASE';
  id: string;
  name: string;
  progress: number | null;
  statusCounts: StatusCounts;
  epics: ProgressEpicNode[];
  tasks: ProgressTaskNode[];
}

export interface ProjectProgressTree {
  project: number | null;
  statusCounts: StatusCounts;
  phases: ProgressPhaseNode[];
  epics: ProgressEpicNode[];
  tasks: ProgressTaskNode[];
}

/**
 * EQUAL_WEIGHT_AVERAGE rollup (docs/domain-model.md, Project.progressRollupStrategy
 * default). A leaf task's progress is its explicit progressPercent, falling
 * back to a status-implied value; a parent's progress is the unweighted
 * average of its immediate children, computed recursively up the tree.
 */
@Injectable()
export class ProgressRollupService {
  constructor(private readonly prisma: PrismaService) {}

  async computeTaskProgress(taskId: string): Promise<number> {
    const task = await this.prisma.task.findUniqueOrThrow({
      where: { id: taskId },
      include: {
        subtasks: { where: { deletedAt: null }, select: { id: true } },
      },
    });
    if (task.subtasks.length === 0) {
      // Prisma's generated TaskStatus and shared-types' hand-authored one are
      // structurally identical string unions but nominally distinct types.
      return (
        task.progressPercent ??
        statusFallback(task.status as unknown as TaskStatus)
      );
    }
    const childValues = await Promise.all(
      task.subtasks.map((subtask) => this.computeTaskProgress(subtask.id)),
    );
    return average(childValues);
  }

  async computeEpicProgress(epicId: string): Promise<number | null> {
    const topLevelTasks = await this.prisma.task.findMany({
      where: { epicId, parentTaskId: null, deletedAt: null },
      select: { id: true },
    });
    if (topLevelTasks.length === 0) {
      return null;
    }
    const values = await Promise.all(
      topLevelTasks.map((task) => this.computeTaskProgress(task.id)),
    );
    return average(values);
  }

  async computePhaseProgress(phaseId: string): Promise<number | null> {
    const [epics, directTasks] = await Promise.all([
      this.prisma.epic.findMany({ where: { phaseId }, select: { id: true } }),
      this.prisma.task.findMany({
        where: { phaseId, epicId: null, parentTaskId: null, deletedAt: null },
        select: { id: true },
      }),
    ]);
    const epicValues = await Promise.all(
      epics.map((epic) => this.computeEpicProgress(epic.id)),
    );
    const taskValues = await Promise.all(
      directTasks.map((task) => this.computeTaskProgress(task.id)),
    );
    const all = [...epicValues.filter(isNumber), ...taskValues];
    return all.length === 0 ? null : average(all);
  }

  async computeProjectProgress(projectId: string): Promise<number | null> {
    const [phases, orphanEpics, orphanTasks] = await Promise.all([
      this.prisma.phase.findMany({
        where: { projectId },
        select: { id: true },
      }),
      this.prisma.epic.findMany({
        where: { projectId, phaseId: null },
        select: { id: true },
      }),
      this.prisma.task.findMany({
        where: {
          projectId,
          phaseId: null,
          epicId: null,
          parentTaskId: null,
          deletedAt: null,
        },
        select: { id: true },
      }),
    ]);
    const phaseValues = await Promise.all(
      phases.map((phase) => this.computePhaseProgress(phase.id)),
    );
    const epicValues = await Promise.all(
      orphanEpics.map((epic) => this.computeEpicProgress(epic.id)),
    );
    const taskValues = await Promise.all(
      orphanTasks.map((task) => this.computeTaskProgress(task.id)),
    );
    const all = [
      ...phaseValues.filter(isNumber),
      ...epicValues.filter(isNumber),
      ...taskValues,
    ];
    return all.length === 0 ? null : average(all);
  }

  /**
   * Display tree for the Progress view (brief §16): every phase and epic
   * with its own rolled-up `progress` (unchanged, via the compute* methods
   * above — other callers depend on those exact semantics) plus a
   * `statusCounts` breakdown and a full subtask tree, both new for GAP-08.
   * A task's subtree is walked once for counts+subtasks here and once more
   * inside `computeTaskProgress` for its rollup number — the same shape of
   * redundancy `computeEpicProgress`/`computePhaseProgress` already had
   * against this method before GAP-08, not a new regression.
   */
  async getProjectProgressTree(
    projectId: string,
  ): Promise<ProjectProgressTree> {
    const [phases, epics, topLevelTasks] = await Promise.all([
      this.prisma.phase.findMany({
        where: { projectId },
        orderBy: { order: 'asc' },
      }),
      this.prisma.epic.findMany({
        where: { projectId },
        orderBy: { order: 'asc' },
      }),
      this.prisma.task.findMany({
        where: { projectId, parentTaskId: null, deletedAt: null },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    const taskNode = async (task: {
      id: string;
      title: string;
      status: string;
    }): Promise<{ node: ProgressTaskNode; counts: StatusCounts }> => {
      const subtasks = await this.prisma.task.findMany({
        where: { parentTaskId: task.id, deletedAt: null },
        orderBy: { createdAt: 'asc' },
      });
      const children = await Promise.all(subtasks.map(taskNode));
      const counts = emptyCounts();
      counts[task.status as TaskStatus] += 1;
      for (const child of children) {
        mergeCounts(counts, child.counts);
      }
      return {
        node: {
          kind: 'TASK',
          id: task.id,
          name: task.title,
          status: task.status as TaskStatus,
          progress: await this.computeTaskProgress(task.id),
          statusCounts: counts,
          subtasks: children.map((child) => child.node),
        },
        counts,
      };
    };

    const epicNode = async (epic: {
      id: string;
      name: string;
    }): Promise<{ node: ProgressEpicNode; counts: StatusCounts }> => {
      const results = await Promise.all(
        topLevelTasks.filter((task) => task.epicId === epic.id).map(taskNode),
      );
      const counts = combineCounts(results.map((result) => result.counts));
      return {
        node: {
          kind: 'EPIC',
          id: epic.id,
          name: epic.name,
          progress: await this.computeEpicProgress(epic.id),
          statusCounts: counts,
          tasks: results.map((result) => result.node),
        },
        counts,
      };
    };

    const phaseResults = await Promise.all(
      phases.map(async (phase) => {
        const epicResults = await Promise.all(
          epics.filter((epic) => epic.phaseId === phase.id).map(epicNode),
        );
        const directTaskResults = await Promise.all(
          topLevelTasks
            .filter((task) => task.phaseId === phase.id && !task.epicId)
            .map(taskNode),
        );
        const counts = combineCounts([
          ...epicResults.map((result) => result.counts),
          ...directTaskResults.map((result) => result.counts),
        ]);
        return {
          node: {
            kind: 'PHASE' as const,
            id: phase.id,
            name: phase.name,
            progress: await this.computePhaseProgress(phase.id),
            statusCounts: counts,
            epics: epicResults.map((result) => result.node),
            tasks: directTaskResults.map((result) => result.node),
          },
          counts,
        };
      }),
    );

    const orphanEpicResults = await Promise.all(
      epics.filter((epic) => !epic.phaseId).map(epicNode),
    );
    const orphanTaskResults = await Promise.all(
      topLevelTasks
        .filter((task) => !task.phaseId && !task.epicId)
        .map(taskNode),
    );

    return {
      project: await this.computeProjectProgress(projectId),
      statusCounts: combineCounts([
        ...phaseResults.map((result) => result.counts),
        ...orphanEpicResults.map((result) => result.counts),
        ...orphanTaskResults.map((result) => result.counts),
      ]),
      phases: phaseResults.map((result) => result.node),
      epics: orphanEpicResults.map((result) => result.node),
      tasks: orphanTaskResults.map((result) => result.node),
    };
  }
}

function emptyCounts(): StatusCounts {
  return {
    [TaskStatus.PENDIENTE]: 0,
    [TaskStatus.ASIGNADA]: 0,
    [TaskStatus.EN_DESARROLLO]: 0,
    [TaskStatus.QA]: 0,
    [TaskStatus.TERMINADA]: 0,
  };
}

function mergeCounts(target: StatusCounts, source: StatusCounts): void {
  for (const status of Object.keys(source) as TaskStatus[]) {
    target[status] += source[status];
  }
}

function combineCounts(all: StatusCounts[]): StatusCounts {
  const counts = emptyCounts();
  for (const source of all) {
    mergeCounts(counts, source);
  }
  return counts;
}

function statusFallback(status: TaskStatus): number {
  switch (status) {
    case TaskStatus.PENDIENTE:
    case TaskStatus.ASIGNADA:
      return 0;
    case TaskStatus.EN_DESARROLLO:
      return 50;
    case TaskStatus.QA:
      return 80;
    case TaskStatus.TERMINADA:
      return 100;
  }
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function isNumber(value: number | null): value is number {
  return value !== null;
}
