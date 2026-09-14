import { Injectable } from '@nestjs/common';
import { TaskStatus } from '@pmhybrid/shared-types';
import { PrismaService } from '../../prisma/prisma.service.js';

export interface ProgressTaskNode {
  kind: 'TASK';
  id: string;
  name: string;
  progress: number;
}

export interface ProgressEpicNode {
  kind: 'EPIC';
  id: string;
  name: string;
  progress: number | null;
  tasks: ProgressTaskNode[];
}

export interface ProgressPhaseNode {
  kind: 'PHASE';
  id: string;
  name: string;
  progress: number | null;
  epics: ProgressEpicNode[];
  tasks: ProgressTaskNode[];
}

export interface ProjectProgressTree {
  project: number | null;
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
      include: { subtasks: { select: { id: true } } },
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
      where: { epicId, parentTaskId: null },
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
        where: { phaseId, epicId: null, parentTaskId: null },
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
        where: { projectId, phaseId: null, epicId: null, parentTaskId: null },
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

  /** Display tree for the Progress view — stops at top-level tasks; a task's own `progress` already reflects its subtask rollup. */
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
        where: { projectId, parentTaskId: null },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    const taskNode = async (task: {
      id: string;
      title: string;
    }): Promise<ProgressTaskNode> => ({
      kind: 'TASK',
      id: task.id,
      name: task.title,
      progress: await this.computeTaskProgress(task.id),
    });

    const epicNode = async (epic: {
      id: string;
      name: string;
    }): Promise<ProgressEpicNode> => ({
      kind: 'EPIC',
      id: epic.id,
      name: epic.name,
      progress: await this.computeEpicProgress(epic.id),
      tasks: await Promise.all(
        topLevelTasks.filter((task) => task.epicId === epic.id).map(taskNode),
      ),
    });

    const phaseNodes = await Promise.all(
      phases.map(async (phase) => ({
        kind: 'PHASE' as const,
        id: phase.id,
        name: phase.name,
        progress: await this.computePhaseProgress(phase.id),
        epics: await Promise.all(
          epics.filter((epic) => epic.phaseId === phase.id).map(epicNode),
        ),
        tasks: await Promise.all(
          topLevelTasks
            .filter((task) => task.phaseId === phase.id && !task.epicId)
            .map(taskNode),
        ),
      })),
    );

    const orphanEpics = await Promise.all(
      epics.filter((epic) => !epic.phaseId).map(epicNode),
    );
    const orphanTasks = await Promise.all(
      topLevelTasks
        .filter((task) => !task.phaseId && !task.epicId)
        .map(taskNode),
    );

    return {
      project: await this.computeProjectProgress(projectId),
      phases: phaseNodes,
      epics: orphanEpics,
      tasks: orphanTasks,
    };
  }
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
