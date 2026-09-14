import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { DocumentKind, Prisma, SyncTrigger, TaskStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  ParsedRoadmapRow,
  RoadmapParserService,
} from '../roadmap/roadmap-parser.service.js';
import { PROJECT_REPOSITORY_PROVIDER } from '../git-providers/project-repository-provider.interface.js';
import type { ProjectRepositoryProvider } from '../git-providers/project-repository-provider.interface.js';
import { AgentslogIngestionService } from './agentslog-ingestion.service.js';

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
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PROJECT_REPOSITORY_PROVIDER)
    private readonly repositoryProvider: ProjectRepositoryProvider,
    private readonly roadmapParser: RoadmapParserService,
    private readonly agentslogIngestion: AgentslogIngestionService,
  ) {}

  async runSync(projectId: string, trigger: SyncTrigger) {
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${projectId}))`;
        return this.runLocked(tx, projectId, trigger);
      },
      { timeout: 20000, maxWait: 10000 },
    );
  }

  private async runLocked(
    tx: Prisma.TransactionClient,
    projectId: string,
    trigger: SyncTrigger,
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

    try {
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

      await tx.syncRun.update({
        where: { id: syncRun.id },
        data: {
          status: summary.conflictsRaised > 0 ? 'PARTIAL' : 'SUCCESS',
          finishedAt: new Date(),
          summary: summary as unknown as Prisma.InputJsonValue,
        },
      });
      return tx.syncRun.findUniqueOrThrow({ where: { id: syncRun.id } });
    } catch (error) {
      await tx.syncRun.update({
        where: { id: syncRun.id },
        data: {
          status: 'FAILED',
          finishedAt: new Date(),
          summary: {
            ...summary,
            error: String(error),
          } as unknown as Prisma.InputJsonValue,
        },
      });
      throw error;
    }
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
        await tx.auditEvent.create({
          data: {
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
        });
        summary.completedViaRemoval += 1;
      } else {
        await tx.conflict.create({
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
        summary.conflictsRaised += 1;
      }
    }
  }

  private async createFromRoadmapRow(
    tx: Prisma.TransactionClient,
    projectId: string,
    row: ParsedRoadmapRow,
  ) {
    await tx.task.create({
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
  }

  /** Step 5. Returns whether anything was actually written. */
  private async reconcileExistingRow(
    tx: Prisma.TransactionClient,
    task: Prisma.TaskGetPayload<object>,
    row: ParsedRoadmapRow,
    summary: SyncSummary,
  ): Promise<boolean> {
    const updates: Record<string, unknown> = {};

    if (task.roadmapTable !== row.table) {
      updates.roadmapTable = row.table;
      await tx.auditEvent.create({
        data: {
          entityType: 'Task',
          entityId: task.id,
          operation: 'ROADMAP_TABLE_CHANGE',
          origin: 'SYNC',
          previousValue: { roadmapTable: task.roadmapTable },
          newValue: { roadmapTable: row.table },
        },
      });
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
          await tx.conflict.create({
            data: {
              projectId: task.projectId,
              kind: 'CONCURRENT_FIELD_EDIT',
              entityType: 'Task',
              entityId: task.id,
              localVersion: localVersion as Prisma.InputJsonValue,
              externalVersion: externalVersion as Prisma.InputJsonValue,
            },
          });
          summary.conflictsRaised += 1;
        }
        for (const field of clean) {
          updates[field] = candidates[field];
        }
      }
    }

    if (Object.keys(updates).length === 0) {
      return false;
    }
    updates.lastSyncedContentHash = rowContentHash(row);
    updates.lastSyncedAt = new Date();
    await tx.task.update({ where: { id: task.id }, data: updates });
    return true;
  }
}

function rowContentHash(row: ParsedRoadmapRow): string {
  return createHash('sha256')
    .update(
      JSON.stringify([
        row.externalId,
        row.table,
        row.outcome,
        row.acceptanceCheck,
        row.statusRaw,
        row.rawOwner,
        row.dependsOnRaw,
        row.blocker,
        row.neededDecision,
      ]),
    )
    .digest('hex');
}
