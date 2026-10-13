import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ListTaskTableQueryDto } from './dto/list-task-table-query.dto.js';
import { InstantCloseService } from './instant-close.service.js';
import { sortTaskRows } from './task-table.util.js';
import { CARD_INCLUDE, TasksService } from './tasks.service.js';

/** The filter value that selects the tasks nobody holds, as the board's address spells it. */
const UNASSIGNED = '__unassigned__';
const DEFAULT_TABLE_PAGE = 50;

/** Only what the order needs: the table is ordered on this, then the full cards of one page are read. */
const SORT_SELECT = {
  id: true,
  externalId: true,
  title: true,
  status: true,
  priority: true,
  statusChangedAt: true,
  dueDate: true,
  updatedAt: true,
  createdAt: true,
  assignee: { select: { displayName: true } },
  reviewer: { select: { displayName: true } },
} satisfies Prisma.TaskSelect;

/**
 * The table of tasks (Roadmap TASK-18). The filters mean what they mean on the board (TASK-16), so a
 * link between the two views shows the same tasks; the order is decided on the server over the whole
 * filtered set, then one page of full cards is read, so a page is right whatever the column.
 */
@Injectable()
export class TaskTableService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tasks: TasksService,
    private readonly instantCloses: InstantCloseService,
  ) {}

  async list(projectId: string, query: ListTaskTableQueryDto) {
    const sort = query.sort ?? 'createdAt';
    const dir = query.dir ?? 'asc';
    const limit = query.limit ?? DEFAULT_TABLE_PAGE;
    const offset = query.offset ?? 0;

    const rows = await this.prisma.task.findMany({
      where: await this.where(projectId, query),
      select: SORT_SELECT,
    });
    const ordered = sortTaskRows(rows, sort, dir);
    const pageIds = ordered.slice(offset, offset + limit).map((row) => row.id);

    const cards = await this.prisma.task.findMany({
      where: { id: { in: pageIds } },
      include: CARD_INCLUDE,
    });
    const byId = new Map(cards.map((card) => [card.id, card]));
    const items = await this.tasks.cardsOf(pageIds.map((id) => byId.get(id)!));
    return { total: ordered.length, offset, limit, sort, dir, items };
  }

  private async where(
    projectId: string,
    query: ListTaskTableQueryDto,
    now: Date = new Date(),
  ): Promise<Prisma.TaskWhereInput> {
    const and: Prisma.TaskWhereInput[] = [];
    const search = query.q?.trim();
    if (search) {
      and.push({
        OR: [
          { title: { contains: search, mode: 'insensitive' } },
          { externalId: { contains: search, mode: 'insensitive' } },
        ],
      });
    }
    if (query.assignee === UNASSIGNED) {
      and.push({ assigneeActorId: null });
    } else if (query.assignee) {
      and.push({ assigneeActorId: query.assignee });
    }
    if (query.priority) {
      and.push({ priority: query.priority });
    }
    if (query.phase) {
      and.push({ phaseId: query.phase });
    }
    if (query.epic) {
      and.push({ epicId: query.epic });
    }
    if (query.kind) {
      and.push({ assignee: { kind: query.kind } });
    }
    if (query.reviewer) {
      and.push({ reviewerActorId: query.reviewer });
    }
    if (query.blocked) {
      // Blocked in the Roadmap, or waiting on work that is not finished (an outside reference counts as open).
      and.push({
        OR: [
          { roadmapTable: 'BLOCKED' },
          {
            dependencies: {
              some: {
                OR: [
                  { dependsOnTaskId: null },
                  { dependsOnTask: { status: { not: 'TERMINADA' } } },
                ],
              },
            },
          },
        ],
      });
    }
    if (query.stale !== undefined) {
      // A finished task waits for nothing; one that moved exactly that long ago is not yet stale.
      and.push({
        status: { not: 'TERMINADA' },
        statusChangedAt: {
          lt: new Date(now.getTime() - query.stale * 3_600_000),
        },
      });
    }
    if (query.divergent) {
      and.push({ id: { in: await this.divergentIds(projectId) } });
    }
    if (query.instant) {
      and.push({
        externalId: {
          in: await this.instantCloses.flaggedExternalIds(projectId),
        },
      });
    }
    return { projectId, deletedAt: null, AND: and };
  }

  /**
   * The tasks whose ledger and board disagree (Roadmap TASK-14): the stage the ledger gives differs from the
   * status, except that a start in the ledger agrees with QA. Two columns of one row, so it is SQL, not a filter.
   */
  private async divergentIds(projectId: string): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "Task"
      WHERE "projectId" = ${projectId}
        AND "deletedAt" IS NULL
        AND "ledgerStage" IS NOT NULL
        AND "ledgerStage"::text <> "status"::text
        AND NOT ("ledgerStage" = 'EN_DESARROLLO' AND "status" = 'QA')
    `;
    return rows.map((row) => row.id);
  }
}
