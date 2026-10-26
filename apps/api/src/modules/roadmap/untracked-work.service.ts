import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { untrackedWork, type UntrackedWork } from './untracked-work.util.js';

/** What the service needs of the database: the client, or the transaction an import already holds. */
type Db = Pick<Prisma.TransactionClient, 'agentLogEvent' | 'task'>;

/**
 * The work the ledger carries that is no task of the project (Roadmap TASK-33): each ID with entries and no
 * Task of that externalId. Read from the entries the sync stored, and not by their `taskId`, which an entry
 * read before its task existed keeps null; a deleted task is still a task, so its ID is not listed.
 */
@Injectable()
export class UntrackedWorkService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    projectId: string,
    db: Db = this.prisma,
  ): Promise<UntrackedWork[]> {
    const ids = (
      await db.agentLogEvent.groupBy({
        by: ['taskExternalId'],
        where: { projectId, taskExternalId: { not: null } },
      })
    ).flatMap((group) =>
      group.taskExternalId === null ? [] : [group.taskExternalId],
    );
    const tasks = await db.task.findMany({
      where: { projectId, externalId: { in: ids } },
      select: { externalId: true },
    });
    const known = new Set(tasks.map((task) => task.externalId));
    const events = await db.agentLogEvent.findMany({
      where: {
        projectId,
        taskExternalId: { in: ids.filter((id) => !known.has(id)) },
      },
      select: {
        taskExternalId: true,
        agentName: true,
        statusWord: true,
        canonicalStatus: true,
        timestampFromLog: true,
        createdAt: true,
      },
    });
    return untrackedWork(
      events.flatMap((event) =>
        event.taskExternalId === null
          ? []
          : [{ ...event, taskExternalId: event.taskExternalId }],
      ),
      new Set(),
    );
  }
}
