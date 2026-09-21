import { Injectable } from '@nestjs/common';
import { TaskStatus } from '@pmhybrid/shared-types';
import { PrismaService } from '../../prisma/prisma.service.js';
import { NON_WORK_ENTRY_TYPES } from '../roadmap/roadmap-attributes.util.js';
import {
  ProgressCalculator,
  type RollupEpic,
  type RollupPhase,
  type RollupStrategy,
  type RollupTask,
} from './progress-calc.js';

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
 * Ids per query, well under Postgres' 32,767 bind parameters — a database
 * with thousands of projects otherwise fails the whole request (Roadmap
 * IMPROVEMENT-01c).
 */
const ID_CHUNK = 5000;

/**
 * The tasks that count towards progress: alive, and work to be done. A card
 * for a decision, an obstacle or a level above the tasks stays on the board but
 * is not a share of the project (Roadmap GAP-35c). Written as an OR because
 * `notIn` alone drops the tasks with no entry type, which is most of them.
 */
const COUNTS_TOWARDS_PROGRESS = {
  deletedAt: null,
  OR: [
    { entryType: null },
    { entryType: { notIn: [...NON_WORK_ENTRY_TYPES] } },
  ],
};

const TASK_ROLLUP_SELECT = {
  id: true,
  projectId: true,
  parentTaskId: true,
  phaseId: true,
  epicId: true,
  status: true,
  progressPercent: true,
} as const;

/**
 * EQUAL_WEIGHT_AVERAGE rollup (docs/domain-model.md, Project.progressRollupStrategy
 * default), computed by `ProgressCalculator` from three reads per batch of
 * projects rather than a query per node of the tree (Roadmap IMPROVEMENT-01c):
 * a project list, a task list and the workload view used to run one query per
 * task, per epic and per phase, for every project.
 */
@Injectable()
export class ProgressRollupService {
  constructor(private readonly prisma: PrismaService) {}

  /** One calculator per project, whatever the number of projects: the live tasks, epics and phases of all of them. */
  private async calculators(
    projectIds: readonly string[],
  ): Promise<Map<string, ProgressCalculator>> {
    const tasks = new Map<string, RollupTask[]>();
    const epics = new Map<string, RollupEpic[]>();
    const phases = new Map<string, RollupPhase[]>();
    const strategies = new Map<string, RollupStrategy>();
    const unique = [...new Set(projectIds)];
    for (let start = 0; start < unique.length; start += ID_CHUNK) {
      const ids = unique.slice(start, start + ID_CHUNK);
      const [taskRows, epicRows, phaseRows, projectRows] = await Promise.all([
        this.prisma.task.findMany({
          where: { projectId: { in: ids }, ...COUNTS_TOWARDS_PROGRESS },
          select: TASK_ROLLUP_SELECT,
        }),
        this.prisma.epic.findMany({
          where: { projectId: { in: ids } },
          select: { id: true, projectId: true, phaseId: true },
        }),
        this.prisma.phase.findMany({
          where: { projectId: { in: ids } },
          select: { id: true, projectId: true },
        }),
        this.prisma.project.findMany({
          where: { id: { in: ids } },
          select: { id: true, progressRollupStrategy: true },
        }),
      ]);
      for (const row of projectRows) {
        strategies.set(row.id, row.progressRollupStrategy);
      }
      for (const row of taskRows) {
        push(tasks, row.projectId, row);
      }
      for (const row of epicRows) {
        push(epics, row.projectId, row);
      }
      for (const row of phaseRows) {
        push(phases, row.projectId, row);
      }
    }
    return new Map(
      unique.map((id) => [
        id,
        new ProgressCalculator(
          tasks.get(id) ?? [],
          epics.get(id) ?? [],
          phases.get(id) ?? [],
          strategies.get(id),
        ),
      ]),
    );
  }

  /** The progress of each project (null for one with nothing to average), in one batch. */
  async computeProjectsProgress(
    projectIds: readonly string[],
  ): Promise<Map<string, number | null>> {
    const calculators = await this.calculators(projectIds);
    return new Map(
      [...calculators].map(([id, calculator]) => [id, calculator.project()]),
    );
  }

  async computeProjectProgress(projectId: string): Promise<number | null> {
    return (await this.computeProjectsProgress([projectId])).get(projectId)!;
  }

  /** The rolled-up progress of each of these tasks, from one batch of reads for all their projects. */
  async computeTasksProgress(
    tasks: readonly { id: string; projectId: string }[],
  ): Promise<Map<string, number>> {
    const calculators = await this.calculators(
      tasks.map((task) => task.projectId),
    );
    const result = new Map<string, number>();
    for (const task of tasks) {
      const progress = calculators.get(task.projectId)?.taskProgress(task.id);
      if (progress !== undefined) {
        result.set(task.id, progress);
      }
    }
    return result;
  }

  async computeTaskProgress(taskId: string): Promise<number> {
    const task = await this.prisma.task.findUniqueOrThrow({
      where: { id: taskId },
      select: { id: true, projectId: true },
    });
    return (await this.computeTasksProgress([task])).get(taskId)!;
  }

  /**
   * Display tree for the Progress view (brief §16): every phase and epic
   * with its own rolled-up `progress`, a `statusCounts` breakdown and a full
   * subtask tree — all from one read of the project's phases, epics and
   * tasks.
   */
  async getProjectProgressTree(
    projectId: string,
  ): Promise<ProjectProgressTree> {
    const [phases, epics, tasks, project] = await Promise.all([
      this.prisma.phase.findMany({
        where: { projectId },
        orderBy: { order: 'asc' },
      }),
      this.prisma.epic.findMany({
        where: { projectId },
        orderBy: { order: 'asc' },
      }),
      this.prisma.task.findMany({
        where: { projectId, ...COUNTS_TOWARDS_PROGRESS },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.project.findUnique({
        where: { id: projectId },
        select: { progressRollupStrategy: true },
      }),
    ]);
    const calculator = new ProgressCalculator(
      tasks,
      epics,
      phases,
      project?.progressRollupStrategy,
    );

    const subtasksOf = new Map<string, typeof tasks>();
    for (const task of tasks) {
      if (task.parentTaskId) {
        push(subtasksOf, task.parentTaskId, task);
      }
    }
    const topLevelTasks = tasks.filter((task) => !task.parentTaskId);

    const taskNode = (
      task: (typeof tasks)[number],
    ): { node: ProgressTaskNode; counts: StatusCounts } => {
      const children = (subtasksOf.get(task.id) ?? []).map(taskNode);
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
          progress: calculator.task(task),
          statusCounts: counts,
          subtasks: children.map((child) => child.node),
        },
        counts,
      };
    };

    const epicNode = (epic: {
      id: string;
      name: string;
    }): { node: ProgressEpicNode; counts: StatusCounts } => {
      const results = topLevelTasks
        .filter((task) => task.epicId === epic.id)
        .map(taskNode);
      const counts = combineCounts(results.map((result) => result.counts));
      return {
        node: {
          kind: 'EPIC',
          id: epic.id,
          name: epic.name,
          progress: calculator.epic(epic.id),
          statusCounts: counts,
          tasks: results.map((result) => result.node),
        },
        counts,
      };
    };

    const phaseResults = phases.map((phase) => {
      const epicResults = epics
        .filter((epic) => epic.phaseId === phase.id)
        .map(epicNode);
      const directTaskResults = topLevelTasks
        .filter((task) => task.phaseId === phase.id && !task.epicId)
        .map(taskNode);
      const counts = combineCounts([
        ...epicResults.map((result) => result.counts),
        ...directTaskResults.map((result) => result.counts),
      ]);
      return {
        node: {
          kind: 'PHASE' as const,
          id: phase.id,
          name: phase.name,
          progress: calculator.phase(phase.id),
          statusCounts: counts,
          epics: epicResults.map((result) => result.node),
          tasks: directTaskResults.map((result) => result.node),
        },
        counts,
      };
    });

    const orphanEpicResults = epics
      .filter((epic) => !epic.phaseId)
      .map(epicNode);
    const orphanTaskResults = topLevelTasks
      .filter((task) => !task.phaseId && !task.epicId)
      .map(taskNode);

    return {
      project: calculator.project(),
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

function push<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key);
  if (list) {
    list.push(value);
  } else {
    map.set(key, [value]);
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
