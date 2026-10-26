import { Injectable } from '@nestjs/common';
import type { AuditOrigin } from '@prisma/client';
import { AuditService } from '../audit/audit.service.js';
import { UntrackedWorkService } from '../roadmap/untracked-work.service.js';
import { latestEntryOf } from '../roadmap/untracked-work.util.js';
import { WriteBackService } from '../synchronization/write-back.service.js';
import { titleOfClosedWork } from './untracked-title.util.js';

/** Why an ID asked for was not imported. */
export type SkippedReason =
  /** The ledger has no work of that ID without a task: it is a task already, or it is not in the ledger. */
  | 'NOT_LISTED'
  /** Its latest entry is not the exact DONE: it would become open work nobody asked for. */
  | 'OPEN';

export interface ImportResult {
  imported: { externalId: string; taskId: string; title: string }[];
  skipped: { externalId: string; reason: SkippedReason }[];
}

/**
 * Turns the work the ledger closed and the Roadmap does not carry into done tasks, when a person asks for it
 * (Roadmap TASK-34, DEC-004 D1: shown first, counted after being seen). A task comes of each ID whose latest
 * entry is the exact DONE: titled with what that entry says it did, done when it says, created when the ledger
 * first mentioned it, with no Roadmap row (the ledger is where it lives) and its entries linked to it. Open
 * work is never imported. Under the project's lock, so a sync that reads the same ID as a row cannot make
 * two tasks of it.
 */
@Injectable()
export class UntrackedImportService {
  constructor(
    private readonly untracked: UntrackedWorkService,
    private readonly writeBack: WriteBackService,
    private readonly audit: AuditService,
  ) {}

  import(
    projectId: string,
    ids: readonly string[],
    requesterActorId: string,
    origin: AuditOrigin = 'UI',
  ): Promise<ImportResult> {
    const wanted = [...new Set(ids)];
    return this.writeBack.inTransaction(projectId, async (tx) => {
      const listed = new Map(
        (await this.untracked.list(projectId, tx)).map((work) => [
          work.externalId,
          work,
        ]),
      );
      const closedIds = wanted.filter((id) => listed.get(id)?.closed);
      const entries = await tx.agentLogEvent.findMany({
        where: { projectId, taskExternalId: { in: closedIds } },
        select: {
          taskExternalId: true,
          summary: true,
          timestampFromLog: true,
          createdAt: true,
        },
      });

      const result: ImportResult = { imported: [], skipped: [] };
      for (const externalId of wanted) {
        const work = listed.get(externalId);
        if (!work) {
          result.skipped.push({ externalId, reason: 'NOT_LISTED' });
          continue;
        }
        if (!work.closed) {
          result.skipped.push({ externalId, reason: 'OPEN' });
          continue;
        }
        const closing = latestEntryOf(
          entries.filter((entry) => entry.taskExternalId === externalId),
        );
        const task = await tx.task.create({
          data: {
            projectId,
            externalId,
            title: titleOfClosedWork(externalId, closing.summary),
            status: 'TERMINADA',
            sourceOrigin: 'AGENTSLOG',
            completedAt: closing.timestampFromLog,
            statusChangedAt: closing.timestampFromLog,
            createdAt: work.firstSeen,
          },
        });
        await tx.agentLogEvent.updateMany({
          where: { projectId, taskExternalId: externalId, taskId: null },
          data: { taskId: task.id },
        });
        await this.audit.record(
          {
            projectId,
            actorId: requesterActorId,
            entityType: 'Task',
            entityId: task.id,
            operation: 'CREATE',
            origin,
            newValue: {
              externalId,
              title: task.title,
              status: task.status,
              sourceOrigin: 'AGENTSLOG',
              importedFromLedger: true,
            },
          },
          tx,
        );
        result.imported.push({
          externalId,
          taskId: task.id,
          title: task.title,
        });
      }
      return result;
    });
  }
}
