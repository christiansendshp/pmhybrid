import { createHash } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DocumentKind, Prisma, SyncTrigger, TaskStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  ParsedRoadmapRow,
  RoadmapParserService,
} from '../roadmap/roadmap-parser.service.js';
import { PROJECT_REPOSITORY_PROVIDER } from '../git-providers/project-repository-provider.interface.js';
import type { ProjectRepositoryProvider } from '../git-providers/project-repository-provider.interface.js';
import { AuditService, diffFields } from '../audit/audit.service.js';
import { AgentslogIngestionService } from './agentslog-ingestion.service.js';
import { rowContentHash } from './row-content-hash.util.js';

const DOCUMENT_FILENAMES: Record<DocumentKind, string> = {
  ROADMAP: 'Roadmap.md',
  AGENTSLOG: 'Agentslog.md',
  PRODUCT_DESCRIPTION: 'ProductDescription.md',
  STACK_TECH: 'Stack_Tecnologies.md',
  FEATURES: 'Features.md',
  AGENTS_RULES: 'Agents.md',
};

interface SyncSummary {
  documentsChanged: number;
  tasksCreated: number;
  tasksUpdated: number;
  tableChanged: number;
  completedViaRemoval: number;
  conflictsRaised: number;
}

/** Fields reconciliation is allowed to touch outside the Blocked table's own columns — the per-field conflict check operates over this set. */
const RECONCILABLE_FIELDS = [
  'status',
  'title',
  'acceptanceCriteria',
  'rawOwner',
] as const;
type ReconcilableField = (typeof RECONCILABLE_FIELDS)[number];

/**
 * Documents -> Postgres reconciliation (docs/synchronization.md). The whole
 * run holds `pg_advisory_xact_lock(hashtext(projectId))` for its entire
 * transaction, so a concurrent write-back for the same project blocks
 * rather than racing it.
 */
@Injectable()
export class SynchronizationService {
  private readonly logger = new Logger(SynchronizationService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(PROJECT_REPOSITORY_PROVIDER)
    private readonly repositoryProvider: ProjectRepositoryProvider,
    private readonly roadmapParser: RoadmapParserService,
    private readonly agentslogIngestion: AgentslogIngestionService,
    private readonly audit: AuditService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Runs the whole reconciliation transaction; on failure, that transaction
   * — including the SyncRun row it created — rolls back in full, so nothing
   * above this point is ever persisted (brief §29 "failed sync persisted").
   * The catch here writes the failure with its own, separate query instead.
   *
   * Emits `sync.completed`/`sync.failed` (NotificationsService listens —
   * docs/architecture.md "side effects that may lag" hang off events, not
   * business logic) only after the transaction has actually resolved, so a
   * notification never outlives the row it describes. Uses `emitAsync` and
   * awaits it — `emit` doesn't wait for async listeners, which otherwise
   * left the notification write racing this method's own return.
   */
  async runSync(
    projectId: string,
    trigger: SyncTrigger,
    requesterActorId?: string,
  ) {
    let outcome: Awaited<ReturnType<typeof this.runLocked>>;
    try {
      outcome = await this.prisma.$transaction(
        async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${projectId}))`;
          return this.runLocked(tx, projectId, trigger, requesterActorId);
        },
        { timeout: 20000, maxWait: 10000 },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      const failedRun = await this.prisma.syncRun.create({
        data: {
          projectId,
          trigger,
          status: 'FAILED',
          finishedAt: new Date(),
          summary: { error: message } as unknown as Prisma.InputJsonValue,
        },
      });
      await this.audit.record({
        projectId,
        actorId: requesterActorId ?? null,
        entityType: 'SyncRun',
        entityId: failedRun.id,
        operation: 'SYNC_RUN',
        origin: 'SYNC',
        newValue: { trigger, status: 'FAILED', error: message },
      });
      // emitAsync (not emit) so the notification write finishes before this
      // resolves — emit() doesn't wait for async listeners, which left the
      // notification creation racing the HTTP response. Guarded so that
      // even an emitter-level failure (not just a listener's own error,
      // which NotificationsService already swallows) can never replace the
      // real sync error with a notification one.
      await this.emitNotificationEvent('sync.failed', {
        projectId,
        syncRunId: failedRun.id,
        trigger,
        requesterActorId,
        error: message,
      });
      throw error;
    }

    await this.emitNotificationEvent('sync.completed', {
      projectId,
      syncRunId: outcome.syncRun.id,
      conflictsRaised: outcome.summary.conflictsRaised,
      requesterActorId,
    });
    return outcome.syncRun;
  }

  /** Best-effort by construction: never lets a notification-side failure change what runSync itself resolves or throws. */
  private async emitNotificationEvent(
    event: string,
    payload: object,
  ): Promise<void> {
    try {
      await this.eventEmitter.emitAsync(event, payload);
    } catch (error) {
      // NotificationsService already catches its own errors; reaching here
      // would mean the emitter itself broke, which still must not surface
      // as (or replace) the sync's own outcome.
      this.logger.error(`Failed to emit ${event}: ${String(error)}`);
    }
  }

  private async runLocked(
    tx: Prisma.TransactionClient,
    projectId: string,
    trigger: SyncTrigger,
    requesterActorId?: string,
  ) {
    const project = await tx.project.findUniqueOrThrow({
      where: { id: projectId },
    });
    const syncRun = await tx.syncRun.create({
      data: { projectId, trigger, status: 'RUNNING' },
    });

    const summary: SyncSummary = {
      documentsChanged: 0,
      tasksCreated: 0,
      tasksUpdated: 0,
      tableChanged: 0,
      completedViaRemoval: 0,
      conflictsRaised: 0,
    };

    // No try/catch here: on a mid-step failure this simply throws out of the
    // transaction, which rolls the whole thing back (including `syncRun`
    // itself) — runSync's own catch is what persists a failed attempt, with
    // a write that isn't inside the transaction being rolled back.
    const revisionIdByKind = new Map<DocumentKind, string | null>();
    for (const kind of Object.keys(DOCUMENT_FILENAMES) as DocumentKind[]) {
      const revisionId = await this.syncDocument(
        tx,
        projectId,
        project.docsPath,
        kind,
        summary,
      );
      revisionIdByKind.set(kind, revisionId);
    }

    const agentslogContent = await this.repositoryProvider.readFile(
      project.docsPath,
      DOCUMENT_FILENAMES.AGENTSLOG,
    );
    const entries = await this.agentslogIngestion.parseWithArchive(
      project.docsPath,
      agentslogContent,
    );
    const agentslogRevisionId = revisionIdByKind.get('AGENTSLOG');
    if (agentslogRevisionId) {
      await this.agentslogIngestion.ingest(
        tx,
        projectId,
        entries,
        agentslogRevisionId,
      );
    }

    const roadmapContent = await this.repositoryProvider.readFile(
      project.docsPath,
      DOCUMENT_FILENAMES.ROADMAP,
    );
    const rows = this.roadmapParser.parse(roadmapContent);
    await this.reconcileRoadmap(tx, projectId, rows, summary);

    const status = summary.conflictsRaised > 0 ? 'PARTIAL' : 'SUCCESS';
    await tx.syncRun.update({
      where: { id: syncRun.id },
      data: {
        status,
        finishedAt: new Date(),
        summary: summary as unknown as Prisma.InputJsonValue,
      },
    });

    // Brief §25 "sincronizaciones": every manual run, plus any scheduled
    // run that actually changed something — an idle scheduled tick every
    // few minutes would only bury real history (SyncRun keeps them all).
    const changedSomething = Object.values(summary).some((count) => count > 0);
    if (trigger === 'MANUAL' || changedSomething) {
      await this.audit.record(
        {
          projectId,
          actorId: requesterActorId ?? null,
          entityType: 'SyncRun',
          entityId: syncRun.id,
          operation: 'SYNC_RUN',
          origin: 'SYNC',
          newValue: { trigger, status, ...summary },
        },
        tx,
      );
    }
    const finalRun = await tx.syncRun.findUniqueOrThrow({
      where: { id: syncRun.id },
    });
    return { syncRun: finalRun, summary };
  }

  /** Step 2: read, hash, and record a revision only if the content actually changed. Returns the new revision id, or null if unchanged/unreadable. */
  private async syncDocument(
    tx: Prisma.TransactionClient,
    projectId: string,
    docsPath: string,
    kind: DocumentKind,
    summary: SyncSummary,
  ): Promise<string | null> {
    let content: string;
    try {
      content = await this.repositoryProvider.readFile(
        docsPath,
        DOCUMENT_FILENAMES[kind],
      );
    } catch {
      return null;
    }

    const hash = createHash('sha256').update(content).digest('hex');
    const document = await tx.document.upsert({
      where: { projectId_kind: { projectId, kind } },
      update: {},
      create: { projectId, kind, filePath: DOCUMENT_FILENAMES[kind] },
    });

    if (document.lastKnownHash === hash) {
      return null;
    }

    const revision = await tx.documentRevision.create({
      data: {
        documentId: document.id,
        contentHash: hash,
        rawContent: content,
        source: 'SYNC',
      },
    });
    await tx.document.update({
      where: { id: document.id },
      data: { lastKnownHash: hash, lastSyncedAt: new Date() },
    });
    summary.documentsChanged += 1;
    return revision.id;
  }

  private async reconcileRoadmap(
    tx: Prisma.TransactionClient,
    projectId: string,
    rows: ParsedRoadmapRow[],
    summary: SyncSummary,
  ) {
    const existingTasks = await tx.task.findMany({
      where: { projectId, externalId: { not: null } },
    });
    const existingByExternalId = new Map(
      existingTasks.map((task) => [task.externalId!, task]),
    );
    const seenExternalIds = new Set<string>();

    for (const row of rows) {
      seenExternalIds.add(row.externalId);
      const existing = existingByExternalId.get(row.externalId);
      if (existing?.deletedAt) {
        // Removed in PM Hub: a row that still names it neither recreates nor
        // updates it (docs/synchronization.md "Removal").
        continue;
      }
      if (!existing) {
        await this.createFromRoadmapRow(tx, projectId, row);
        summary.tasksCreated += 1;
      } else {
        const changed = await this.reconcileExistingRow(
          tx,
          existing,
          row,
          summary,
        );
        if (changed) {
          summary.tasksUpdated += 1;
        }
      }
    }

    for (const [externalId, task] of existingByExternalId) {
      if (seenExternalIds.has(externalId)) {
        continue;
      }
      if (task.deletedAt) {
        continue; // its row was taken out on purpose when the task was removed
      }
      if (task.status === TaskStatus.TERMINADA && task.roadmapTable === null) {
        continue; // already resolved by a previous run
      }

      const hasTerminal = await this.agentslogIngestion.hasTerminalEntry(
        tx,
        projectId,
        externalId,
      );
      if (hasTerminal) {
        await tx.task.update({
          where: { id: task.id },
          data: { status: TaskStatus.TERMINADA, roadmapTable: null },
        });
        await this.audit.record(
          {
            projectId,
            entityType: 'Task',
            entityId: task.id,
            operation: 'COMPLETE_VIA_ROADMAP_REMOVAL',
            origin: 'SYNC',
            previousValue: {
              status: task.status,
              roadmapTable: task.roadmapTable,
            },
            newValue: { status: TaskStatus.TERMINADA, roadmapTable: null },
          },
          tx,
        );
        summary.completedViaRemoval += 1;
      } else {
        const conflict = await tx.conflict.create({
          data: {
            projectId,
            kind: 'ROADMAP_ROW_DISAPPEARED_NO_TERMINAL_LOG',
            entityType: 'Task',
            entityId: task.id,
            localVersion: {
              externalId,
              status: task.status,
              roadmapTable: task.roadmapTable,
            } as Prisma.InputJsonValue,
          },
        });
        await this.audit.recordConflictDetected(conflict, 'SYNC', tx);
        summary.conflictsRaised += 1;
      }
    }
  }

  private async createFromRoadmapRow(
    tx: Prisma.TransactionClient,
    projectId: string,
    row: ParsedRoadmapRow,
  ) {
    const task = await tx.task.create({
      data: {
        projectId,
        externalId: row.externalId,
        sourceOrigin: 'ROADMAP',
        roadmapTable: row.table,
        title: row.outcome ?? row.externalId,
        status: row.statusMapped ?? TaskStatus.PENDIENTE,
        acceptanceCriteria: row.acceptanceCheck,
        rawOwner: row.rawOwner,
        ownerClaimedAt: row.ownerClaimedAt
          ? new Date(row.ownerClaimedAt)
          : undefined,
        blockedReason: row.blocker,
        neededDecision: row.neededDecision,
        lastSyncedContentHash: rowContentHash(row),
        lastSyncedAt: new Date(),
      },
    });
    await this.audit.record(
      {
        projectId,
        entityType: 'Task',
        entityId: task.id,
        operation: 'CREATE',
        origin: 'ROADMAP',
        newValue: {
          externalId: task.externalId,
          title: task.title,
          status: task.status,
          roadmapTable: task.roadmapTable,
        },
      },
      tx,
    );
  }

  /** Step 5. Returns whether anything was actually written. */
  private async reconcileExistingRow(
    tx: Prisma.TransactionClient,
    task: Prisma.TaskGetPayload<object>,
    row: ParsedRoadmapRow,
    summary: SyncSummary,
  ): Promise<boolean> {
    // The row is exactly what was last reconciled (or last written back):
    // the document side did not change, so any difference from the task is
    // a local edit that must stand — never "reconciled" away (brief §12).
    const incomingHash = rowContentHash(row);
    if (task.lastSyncedContentHash === incomingHash) {
      return false;
    }

    const updates: Record<string, unknown> = {};
    let conflictRaised = false;

    if (task.roadmapTable !== row.table) {
      updates.roadmapTable = row.table;
      await this.audit.record(
        {
          projectId: task.projectId,
          entityType: 'Task',
          entityId: task.id,
          operation: 'ROADMAP_TABLE_CHANGE',
          origin: 'SYNC',
          previousValue: { roadmapTable: task.roadmapTable },
          newValue: { roadmapTable: row.table },
        },
        tx,
      );
      summary.tableChanged += 1;
    }

    const movingIntoBlocked = row.table === 'BLOCKED';
    const movingOutOfBlocked =
      task.roadmapTable === 'BLOCKED' && row.table !== 'BLOCKED';

    if (movingIntoBlocked) {
      // Blocked's column set carries neither status/dependencies/acceptance —
      // leave them exactly as last known (docs/synchronization.md).
      updates.blockedReason = row.blocker ?? null;
      updates.neededDecision = row.neededDecision ?? null;
    } else {
      if (movingOutOfBlocked) {
        updates.blockedReason = null;
        updates.neededDecision = null;
      }

      const candidates: Partial<Record<ReconcilableField, unknown>> = {};
      if (row.statusMapped && row.statusMapped !== task.status) {
        candidates.status = row.statusMapped;
      }
      if (row.outcome !== undefined && row.outcome !== task.title) {
        candidates.title = row.outcome;
      }
      if (
        row.acceptanceCheck !== undefined &&
        row.acceptanceCheck !== task.acceptanceCriteria
      ) {
        candidates.acceptanceCriteria = row.acceptanceCheck;
      }
      if (row.rawOwner !== undefined && row.rawOwner !== task.rawOwner) {
        candidates.rawOwner = row.rawOwner;
      }

      const incomingFields = Object.keys(candidates) as ReconcilableField[];
      if (incomingFields.length > 0) {
        // A null lastSyncedAt (a UI-origin task never synced before) means
        // every prior local edit is in play, not none of them — comparing
        // against epoch rather than skipping the check on null.
        const since = task.lastSyncedAt ?? new Date(0);
        const uiEdits = await tx.auditEvent.findMany({
          where: {
            entityType: 'Task',
            entityId: task.id,
            origin: 'UI',
            occurredAt: { gt: since },
          },
        });
        const contestedFields = new Set<string>();
        for (const event of uiEdits) {
          if (event.newValue && typeof event.newValue === 'object') {
            for (const key of Object.keys(
              event.newValue as Record<string, unknown>,
            )) {
              contestedFields.add(key);
            }
          }
        }

        const contested = incomingFields.filter((field) =>
          contestedFields.has(field),
        );
        const clean = incomingFields.filter(
          (field) => !contestedFields.has(field),
        );

        if (contested.length > 0) {
          const localVersion: Record<string, unknown> = {};
          const externalVersion: Record<string, unknown> = {};
          for (const field of contested) {
            localVersion[field] = (task as unknown as Record<string, unknown>)[
              field
            ];
            externalVersion[field] = candidates[field];
          }
          const conflict = await tx.conflict.create({
            data: {
              projectId: task.projectId,
              kind: 'CONCURRENT_FIELD_EDIT',
              entityType: 'Task',
              entityId: task.id,
              localVersion: localVersion as Prisma.InputJsonValue,
              externalVersion: externalVersion as Prisma.InputJsonValue,
            },
          });
          await this.audit.recordConflictDetected(conflict, 'SYNC', tx);
          conflictRaised = true;
          summary.conflictsRaised += 1;
        }
        for (const field of clean) {
          updates[field] = candidates[field];
        }
      }
    }

    // Table membership is already audited above; this records every other
    // field the document changed (brief §25 "cambios provenientes de documentos").
    const documentDiff = diffFields(
      task as unknown as Record<string, unknown>,
      Object.fromEntries(
        Object.entries(updates).filter(([field]) => field !== 'roadmapTable'),
      ),
    );
    if (documentDiff) {
      await this.audit.record(
        {
          projectId: task.projectId,
          entityType: 'Task',
          entityId: task.id,
          operation: 'ROADMAP_FIELD_UPDATE',
          origin: 'ROADMAP',
          ...documentDiff,
        },
        tx,
      );
    }

    // The fingerprint always advances — even a fully contested row has now
    // been seen (its external side lives in the Conflict), so the next run
    // must not raise the same conflict again. The UI-edit window
    // (lastSyncedAt) only moves when nothing was contested: otherwise a later
    // document edit to a still-contested field would be applied silently.
    const changed = Object.keys(updates).length > 0;
    await tx.task.update({
      where: { id: task.id },
      data: {
        ...updates,
        lastSyncedContentHash: incomingHash,
        ...(conflictRaised ? {} : { lastSyncedAt: new Date() }),
      },
    });
    return changed;
  }
}
