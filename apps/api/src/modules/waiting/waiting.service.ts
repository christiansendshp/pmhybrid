import { Inject, Injectable, Logger } from '@nestjs/common';
import { TaskStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { PROJECT_REPOSITORY_PROVIDER } from '../git-providers/project-repository-provider.interface.js';
import type { ProjectRepositoryProvider } from '../git-providers/project-repository-provider.interface.js';
import { AgentslogParserService } from '../roadmap/agentslog-parser.service.js';
import {
  classifyLedgerWord,
  latestEntryByTask,
} from '../roadmap/ledger-status.util.js';
import {
  buildWaiting,
  type LedgerBlock,
  type Waiting,
} from './build-waiting.util.js';

export interface WaitingResult extends Waiting {
  /** The ledger could not be read, so the tasks it says wait on someone are missing from `items`. */
  ledgerUnreadable: boolean;
}

/**
 * What a project is waiting for (Roadmap TASK-32): the blocked tasks, the decisions the ledger says wait on
 * someone, and the conflicts open, in one list with the age of each. It only reads: the Blocked table,
 * the ledger and the conflicts are where they were.
 */
@Injectable()
export class WaitingService {
  private readonly logger = new Logger(WaitingService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(PROJECT_REPOSITORY_PROVIDER)
    private readonly repositoryProvider: ProjectRepositoryProvider,
    private readonly agentslogParser: AgentslogParserService,
  ) {}

  async forProject(projectId: string): Promise<WaitingResult> {
    const open = {
      projectId,
      deletedAt: null,
      status: { not: TaskStatus.TERMINADA },
    };
    const [blocked, conflicts, phases, epics] = await Promise.all([
      this.prisma.task.findMany({
        where: { ...open, roadmapTable: 'BLOCKED' },
        select: {
          id: true,
          externalId: true,
          title: true,
          blockedReason: true,
          neededDecision: true,
          blockedSince: true,
          createdAt: true,
          phaseId: true,
          epicId: true,
        },
      }),
      this.prisma.conflict.findMany({
        where: { projectId, resolvedAt: null },
        select: {
          id: true,
          kind: true,
          entityType: true,
          entityId: true,
          detectedAt: true,
        },
      }),
      this.prisma.phase.findMany({
        where: { projectId },
        select: { id: true, name: true },
      }),
      this.prisma.epic.findMany({
        where: { projectId },
        select: { id: true, name: true },
      }),
    ]);

    const behind = await this.prisma.taskDependency.groupBy({
      by: ['dependsOnTaskId'],
      where: {
        dependsOnTaskId: { in: blocked.map((task) => task.id) },
        task: { deletedAt: null, status: { not: TaskStatus.TERMINADA } },
      },
      _count: { _all: true },
    });
    const conflictTasks = await this.prisma.task.findMany({
      where: {
        projectId,
        id: {
          in: conflicts
            .filter((conflict) => conflict.entityType === 'Task')
            .map((conflict) => conflict.entityId),
        },
      },
      select: { id: true, externalId: true, title: true },
    });
    const taskById = new Map(conflictTasks.map((task) => [task.id, task]));

    const { blocks, unreadable } = await this.ledgerBlocks(projectId);

    return {
      ...buildWaiting({
        blocked,
        holds: new Map(
          behind.flatMap((group) =>
            group.dependsOnTaskId
              ? [[group.dependsOnTaskId, group._count._all] as const]
              : [],
          ),
        ),
        ledgerBlocks: blocks,
        conflicts: conflicts.map((conflict) => ({
          id: conflict.id,
          kind: conflict.kind,
          detectedAt: conflict.detectedAt,
          task:
            conflict.entityType === 'Task'
              ? (taskById.get(conflict.entityId) ?? null)
              : null,
        })),
        phases,
        epics,
      }),
      ledgerUnreadable: unreadable,
    };
  }

  /**
   * The tasks whose latest ledger entry is a block, with the open ones among the project's tasks. The
   * latest is the last one in the file, never the one with the latest clock (Roadmap TASK-07).
   */
  private async ledgerBlocks(
    projectId: string,
  ): Promise<{ blocks: LedgerBlock[]; unreadable: boolean }> {
    const project = await this.prisma.project.findUniqueOrThrow({
      where: { id: projectId },
      select: { docsPath: true },
    });
    let content: string;
    try {
      content = await this.repositoryProvider.readFile(
        project.docsPath,
        'Agentslog.md',
      );
    } catch (error) {
      this.logger.warn(
        `The ledger of project ${projectId} could not be read for the waiting list: ${error instanceof Error ? error.name : 'unknown error'}`,
      );
      return { blocks: [], unreadable: true };
    }
    const blocking = [
      ...latestEntryByTask(
        this.agentslogParser.parse(content).entries,
      ).values(),
    ].filter(
      (entry) =>
        classifyLedgerWord(entry.statusWord).canonicalStatus === 'BLOCKED',
    );
    if (blocking.length === 0) {
      return { blocks: [], unreadable: false };
    }
    const tasks = await this.prisma.task.findMany({
      where: {
        projectId,
        deletedAt: null,
        status: { not: TaskStatus.TERMINADA },
        externalId: { in: blocking.map((entry) => entry.taskExternalId) },
      },
      select: { id: true, externalId: true, title: true },
    });
    const byExternalId = new Map(tasks.map((task) => [task.externalId, task]));
    return {
      blocks: blocking.flatMap((entry) => {
        const task = byExternalId.get(entry.taskExternalId);
        return task
          ? [
              {
                taskId: task.id,
                externalId: task.externalId,
                title: task.title,
                from: classifyLedgerWord(entry.statusWord).qualifier,
                since: new Date(entry.timestampFromLog),
              },
            ]
          : [];
      }),
      unreadable: false,
    };
  }
}
