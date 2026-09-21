import { createHash } from 'node:crypto';
import {
  Inject,
  Injectable,
  Logger,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DocumentKind, Prisma, SyncTrigger, TaskStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  ParsedRoadmapRow,
  RoadmapParserService,
  rowCarriesDependsOn,
} from '../roadmap/roadmap-parser.service.js';
import { PROJECT_REPOSITORY_PROVIDER } from '../git-providers/project-repository-provider.interface.js';
import type { ProjectRepositoryProvider } from '../git-providers/project-repository-provider.interface.js';
import { AuditService, diffFields } from '../audit/audit.service.js';
import {
  normalizeOwnerName,
  ownerNameFromRaw,
  resolveOwner,
  type OwnerCandidate,
} from '../roadmap/roadmap-owner.util.js';
import { RoadmapFormatError } from '../roadmap/roadmap-yaml-entry.util.js';
import {
  addDependencyEdge,
  buildDependencyGraph,
  removeDependencyEdge,
  wouldCloseCycle,
  type DependencyGraph,
} from '../tasks/dependency-graph.js';
import { AgentslogIngestionService } from './agentslog-ingestion.service.js';
import { rowContentHash } from './row-content-hash.util.js';
import { describeSyncFailure } from './sync-failure.util.js';

const DOCUMENT_FILENAMES: Record<DocumentKind, string> = {
  ROADMAP: 'Roadmap.md',
  AGENTSLOG: 'Agentslog.md',
  PRODUCT_DESCRIPTION: 'ProductDescription.md',
  STACK_TECH: 'Stack_Tecnologies.md',
  FEATURES: 'Features.md',
  AGENTS_RULES: 'Agents.md',
};

/** A Roadmap entry sync could not read (Roadmap BUG-05): named, located and explained, so the run says which entry to fix. */
export interface SyncEntryError {
  id: string;
  line: number;
  reason: string;
}

/** A dependency the document declares that sync did not link because it would close a cycle (Roadmap BUG-06c): the row that declares it, and the reference it names. */
export interface SyncSkippedCycle {
  from: string;
  to: string;
}

/** Bounds the run's Json summary against a document with hundreds of broken entries. */
const MAX_ENTRY_ERRORS_RECORDED = 50;

/** Stable identity of a set of entry errors: same entries failing for the same reasons, wherever they sit in the file. */
export function entryErrorsFingerprint(
  errors: readonly { id: string; reason: string }[],
): string {
  return errors
    .map((error) => JSON.stringify([error.id, error.reason]))
    .sort()
    .join('\n');
}

type OpenConflict = Prisma.ConflictGetPayload<object>;

interface SyncSummary {
  /** Entries that could not be read this run; their tasks were left untouched. */
  entryErrors: SyncEntryError[];
  /** Dependencies left unlinked because they would close a cycle; the document has a loop to fix. */
  skippedCycles: SyncSkippedCycle[];
  documentsChanged: number;
  tasksCreated: number;
  tasksUpdated: number;
  tableChanged: number;
  completedViaRemoval: number;
  conflictsRaised: number;
  /** Open conflicts closed by themselves because the row is back or the two sides agree again (Roadmap BUG-06a). */
  conflictsClosed: number;
  /** Tasks whose assignee was set or changed because the document names a different member (Roadmap GAP-35a). */
  assigneesUpdated: number;
  /** Dependencies the document listed and then dropped, removed here (Roadmap GAP-35e). */
  dependenciesRemoved: number;
  /** New TaskDependency rows linked from a row's "Depends on" cell (Roadmap GAP-14) — resolved or still dangling on a raw external ref. */
  dependenciesLinked: number;
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
      const failure = describeSyncFailure(error);
      const message = failure.message;
      // A failure identical to the previous run's is the same news: the
      // history still records it, but members are not told again (a project
      // that fails every scheduled tick used to bury them in notifications).
      const previous = await this.prisma.syncRun.findFirst({
        where: { projectId },
        orderBy: { startedAt: 'desc' },
        select: { status: true, summary: true },
      });
      const repeated =
        previous?.status === 'FAILED' &&
        (previous.summary as { error?: unknown } | null)?.error === message;
      const failedRun = await this.prisma.syncRun.create({
        data: {
          projectId,
          trigger,
          status: 'FAILED',
          finishedAt: new Date(),
          summary: { error: message } as unknown as Prisma.InputJsonValue,
        },
      });
      if (!repeated || trigger === 'MANUAL') {
        await this.audit.record({
          projectId,
          actorId: requesterActorId ?? null,
          entityType: 'SyncRun',
          entityId: failedRun.id,
          operation: 'SYNC_RUN',
          origin: 'SYNC',
          newValue: { trigger, status: 'FAILED', error: message },
        });
      }
      if (!repeated) {
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
      }
      // A problem in the project's own documents is the caller's to fix (422
      // with the readable message); anything else keeps its own status.
      throw failure.fixable ? new UnprocessableEntityException(message) : error;
    }

    await this.emitNotificationEvent('sync.completed', {
      projectId,
      syncRunId: outcome.syncRun.id,
      conflictsRaised: outcome.summary.conflictsRaised,
      // Only when the set of unreadable entries differs from the previous
      // run's — the same broken entry is not news every interval.
      entryErrors: outcome.entryErrorsChanged
        ? outcome.summary.entryErrors
        : [],
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
    // Read before this run's own row exists. Failed runs carry no entry
    // list, so the comparison is against the last run that got as far as
    // reading the Roadmap.
    const previousRun = await tx.syncRun.findFirst({
      where: { projectId, status: { in: ['SUCCESS', 'PARTIAL'] } },
      orderBy: { startedAt: 'desc' },
      select: { summary: true },
    });
    const syncRun = await tx.syncRun.create({
      data: { projectId, trigger, status: 'RUNNING' },
    });

    const summary: SyncSummary = {
      entryErrors: [],
      skippedCycles: [],
      documentsChanged: 0,
      tasksCreated: 0,
      tasksUpdated: 0,
      tableChanged: 0,
      completedViaRemoval: 0,
      conflictsRaised: 0,
      conflictsClosed: 0,
      assigneesUpdated: 0,
      dependenciesLinked: 0,
      dependenciesRemoved: 0,
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
    // A Roadmap.md that is empty is not a Roadmap that drained: a drained one
    // keeps its structure. Read as "every row disappeared" it raised one
    // conflict per task (Roadmap BUG-06a), so a project that has tasks from
    // the document refuses it instead — inside the transaction, so nothing
    // of this run, the document's own revision included, is kept.
    if (roadmapContent.trim() === '') {
      const documentTasks = await tx.task.count({
        where: { projectId, externalId: { not: null }, deletedAt: null },
      });
      if (documentTasks > 0) {
        throw new RoadmapFormatError(
          `Roadmap.md is empty, but ${documentTasks} task(s) of this project come from it — refusing to read that as removing all of them`,
        );
      }
    }
    // Tolerant (Roadmap BUG-05): one unreadable entry no longer fails the
    // whole run. It is reported, and its task is left exactly as it was.
    const { rows, errors } = this.roadmapParser.parseTolerant(roadmapContent);
    summary.entryErrors = errors
      .slice(0, MAX_ENTRY_ERRORS_RECORDED)
      .map(({ id, line, reason }) => ({ id, line, reason }));
    await this.reconcileRoadmap(
      tx,
      projectId,
      rows,
      new Set(errors.map((error) => error.id)),
      summary,
    );

    const previousErrors = (
      previousRun?.summary as { entryErrors?: SyncEntryError[] } | null
    )?.entryErrors;
    const entryErrorsChanged =
      summary.entryErrors.length > 0 &&
      entryErrorsFingerprint(summary.entryErrors) !==
        entryErrorsFingerprint(previousErrors ?? []);

    const status =
      summary.conflictsRaised > 0 ||
      summary.entryErrors.length > 0 ||
      summary.skippedCycles.length > 0
        ? 'PARTIAL'
        : 'SUCCESS';
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
    // A standing entry error is not a change — it would otherwise put every
    // idle scheduled tick into the audit log for as long as the entry is broken.
    const changedSomething = Object.values(summary).some(
      (count) => typeof count === 'number' && count > 0,
    );
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
    return { syncRun: finalRun, summary, entryErrorsChanged };
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
    unreadableIds: ReadonlySet<string>,
    summary: SyncSummary,
  ) {
    const existingTasks = await tx.task.findMany({
      where: { projectId, externalId: { not: null } },
    });
    const existingByExternalId = new Map(
      existingTasks.map((task) => [task.externalId!, task]),
    );
    // An unreadable entry is present in the document, only not understood:
    // counting it as seen keeps its task out of the disappeared-row sweep
    // (which would otherwise complete it or raise a conflict for it).
    const seenExternalIds = new Set<string>(unreadableIds);
    const ownerCandidates = await this.loadOwnerCandidates(tx, projectId);
    // The project's dependency edges, loaded once: cycle checks run against
    // this graph, which every link and removal below keeps current, instead
    // of one query per hop (Roadmap IMPROVEMENT-01a).
    const dependencyGraph = buildDependencyGraph(
      await tx.taskDependency.findMany({
        where: { task: { projectId } },
        select: { taskId: true, dependsOnTaskId: true },
      }),
    );
    // What is already open, per task, so a conflict is raised once and closes
    // itself when it stops being true (Roadmap BUG-06a).
    const openByTask = new Map<string, OpenConflict[]>();
    for (const conflict of await tx.conflict.findMany({
      where: {
        projectId,
        resolvedAt: null,
        entityType: 'Task',
        kind: {
          in: [
            'ROADMAP_ROW_DISAPPEARED_NO_TERMINAL_LOG',
            'CONCURRENT_FIELD_EDIT',
          ],
        },
      },
    })) {
      openByTask.set(conflict.entityId, [
        ...(openByTask.get(conflict.entityId) ?? []),
        conflict,
      ]);
    }

    for (const row of rows) {
      seenExternalIds.add(row.externalId);
      const existing = existingByExternalId.get(row.externalId);
      if (existing?.deletedAt) {
        // Removed in PM Hub: a row that still names it neither recreates nor
        // updates it (docs/synchronization.md "Removal").
        continue;
      }
      let taskId: string;
      if (!existing) {
        const owner = row.ownerName
          ? resolveOwner(ownerCandidates, row.ownerName, row.ownerKind)
          : null;
        const created = await this.createFromRoadmapRow(
          tx,
          projectId,
          row,
          owner?.status === 'MATCHED' ? owner.actorId : undefined,
        );
        existingByExternalId.set(row.externalId, created);
        summary.tasksCreated += 1;
        if (created.assigneeActorId) {
          summary.assigneesUpdated += 1;
        }
        taskId = created.id;
      } else {
        // Before the row is reconciled: it compares the document's owner with
        // the one recorded at the last sync (`rawOwner`), which
        // reconcileExistingRow is about to overwrite.
        const openForTask = openByTask.get(existing.id) ?? [];
        // A task that has no table has no row as far as PM Hub knows (removed,
        // or kept without it after a conflict, or its row was written by
        // PM Hub and never read back). Seeing its row again gives it its table
        // — whether or not the row's content changed, which the hash check
        // below would otherwise decide — so that losing the row later is noticed.
        if (existing.roadmapTable === null) {
          await tx.task.update({
            where: { id: existing.id },
            data: { roadmapTable: row.table },
          });
          await this.audit.record(
            {
              projectId,
              entityType: 'Task',
              entityId: existing.id,
              operation: 'ROADMAP_TABLE_CHANGE',
              origin: 'SYNC',
              previousValue: { roadmapTable: null },
              newValue: { roadmapTable: row.table },
            },
            tx,
          );
          existing.roadmapTable = row.table;
          summary.tableChanged += 1;
        }
        // A row that is back closes the "disappeared" conflicts it had raised.
        // Filtered, so it is a copy: closing a conflict removes it from the list.
        const disappeared = openForTask.filter(
          (conflict) =>
            conflict.kind === 'ROADMAP_ROW_DISAPPEARED_NO_TERMINAL_LOG',
        );
        for (const conflict of disappeared) {
          await this.closeConflictAutomatically(
            tx,
            conflict,
            openForTask,
            'the row is back in the document',
            summary,
          );
        }
        await this.reconcileAssignee(
          tx,
          existing,
          row,
          ownerCandidates,
          openForTask,
          summary,
        );
        const changed = await this.reconcileExistingRow(
          tx,
          existing,
          row,
          openForTask,
          summary,
        );
        if (changed) {
          summary.tasksUpdated += 1;
        }
        taskId = existing.id;
      }

      const current = existingByExternalId.get(row.externalId);
      if (current && row.statusUnrecognized && row.statusRaw !== undefined) {
        await this.raiseUnrecognizedStatus(tx, current, row.statusRaw, summary);
      }

      // docs/synchronization.md "Dependencies" (Roadmap GAP-14/22/35e). A
      // Blocked row has no Depends on cell, so its absence removes nothing
      // (a paused row of the skill's tables is "blocked" but does have one).
      await this.reconcileDependencies(
        tx,
        projectId,
        taskId,
        row.externalId,
        row.dependsOnRaw,
        rowCarriesDependsOn(row),
        existingByExternalId,
        dependencyGraph,
        summary,
      );
    }

    // A row processed earlier than the row it depends on (file order) can
    // only record a dangling reference — its target isn't in
    // existingByExternalId yet at that point, even if this very pass goes
    // on to create it a few rows later. One sweep after the whole file has
    // been walked resolves every reference that's now resolvable, so a
    // dependency on a row introduced in this same sync still links in this
    // same sync rather than needing a follow-up run.
    await this.resolveDanglingDependencies(
      tx,
      projectId,
      existingByExternalId,
      dependencyGraph,
      summary,
    );

    for (const [externalId, task] of existingByExternalId) {
      if (seenExternalIds.has(externalId)) {
        continue;
      }
      if (task.deletedAt) {
        continue; // its row was taken out on purpose when the task was removed
      }
      if (task.roadmapTable === null) {
        // No row, and that was already settled: completed by a previous run, or
        // a person kept the task without it (resolving the conflict clears the
        // table). Asking again on every run is what made conflicts pile up.
        // The row coming back sets the table again and re-arms this.
        continue;
      }
      if (
        (openByTask.get(task.id) ?? []).some(
          (conflict) =>
            conflict.kind === 'ROADMAP_ROW_DISAPPEARED_NO_TERMINAL_LOG',
        )
      ) {
        continue; // already asked, and still open
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
    assigneeActorId?: string,
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
        assigneeActorId,
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
          ...(assigneeActorId ? { assigneeActorId } : {}),
        },
      },
      tx,
    );
    if (assigneeActorId) {
      await this.recordDocumentAssignment(tx, task.id, assigneeActorId);
    }
    return task;
  }

  /** The people and agents a document's owner can name: the project's active members (Roadmap GAP-35a). */
  private async loadOwnerCandidates(
    tx: Prisma.TransactionClient,
    projectId: string,
  ): Promise<OwnerCandidate[]> {
    const members = await tx.projectMember.findMany({
      where: { projectId, isActive: true, actor: { isActive: true } },
      select: {
        actor: { select: { id: true, displayName: true, kind: true } },
      },
    });
    return members.map(({ actor }) => ({
      actorId: actor.id,
      displayName: actor.displayName,
      kind: actor.kind,
    }));
  }

  /**
   * Makes the document's owner the task's assignee (Roadmap GAP-35a).
   * Independent of the row's content hash on purpose: whether a name
   * resolves also depends on who is a member *now*, so an owner that named
   * nobody at the last sync must be picked up once that member is added,
   * even though the row itself did not change.
   *
   * - The document names nobody, or a name that matches no member or more
   *   than one: the assignee is left alone (never an arbitrary pick, never
   *   an unassignment).
   * - The task has no assignee: the document's owner is assigned.
   * - The task has a different assignee: if the document's owner is what it
   *   was at the last sync (`rawOwner`), the difference is an assignment
   *   made here, and it stands. If the document's owner changed, it applies
   *   — unless someone also changed the assignee here since the last sync,
   *   which is a conflict. The EN_DESARROLLO lock restricts who may
   *   reassign in PM Hub; it does not stop the document, which is what an
   *   agent claiming a task edits.
   */
  private async reconcileAssignee(
    tx: Prisma.TransactionClient,
    task: Prisma.TaskGetPayload<object>,
    row: ParsedRoadmapRow,
    candidates: readonly OwnerCandidate[],
    open: OpenConflict[],
    summary: SyncSummary,
  ): Promise<void> {
    if (!row.ownerName) {
      return;
    }
    const resolution = resolveOwner(candidates, row.ownerName, row.ownerKind);
    if (resolution.status !== 'MATCHED') {
      return;
    }
    const actorId = resolution.actorId;
    if (task.assigneeActorId === actorId) {
      return;
    }

    if (task.assigneeActorId) {
      const documentChanged =
        normalizeOwnerName(row.ownerName) !==
        normalizeOwnerName(ownerNameFromRaw(task.rawOwner) ?? '');
      if (!documentChanged) {
        return;
      }
      if (await this.assigneeEditedLocally(tx, task)) {
        await this.raiseFieldConflict(
          tx,
          task,
          open,
          { assigneeActorId: task.assigneeActorId },
          { assigneeActorId: actorId },
          summary,
        );
        return;
      }
    }

    // Guarded on the assignee as it was read: a PM Hub assignment that
    // committed in between wins, and the next run looks at it again.
    const { count } = await tx.task.updateMany({
      where: {
        id: task.id,
        deletedAt: null,
        assigneeActorId: task.assigneeActorId,
      },
      data: { assigneeActorId: actorId },
    });
    if (count !== 1) {
      return;
    }
    await this.recordDocumentAssignment(tx, task.id, actorId);
    await this.audit.record(
      {
        projectId: task.projectId,
        entityType: 'Task',
        entityId: task.id,
        operation: task.assigneeActorId ? 'REASSIGN' : 'ASSIGN',
        origin: 'ROADMAP',
        previousValue: { assigneeActorId: task.assigneeActorId },
        newValue: { assigneeActorId: actorId },
      },
      tx,
    );
    summary.assigneesUpdated += 1;
  }

  /**
   * Whether this task's assignee was changed here and the document does not
   * know: the assignee's name is not what the document's owner was at the last
   * sync (write-back had nothing to write into, or deferred), and a person or
   * an API client changed it since. An assignment the document already
   * reflects is not a competing edit — an agent taking over afterwards is
   * just a later change to the document.
   */
  private async assigneeEditedLocally(
    tx: Prisma.TransactionClient,
    task: Prisma.TaskGetPayload<object>,
  ): Promise<boolean> {
    const assignee = task.assigneeActorId
      ? await tx.actor.findUnique({
          where: { id: task.assigneeActorId },
          select: { displayName: true },
        })
      : null;
    if (
      assignee &&
      normalizeOwnerName(assignee.displayName) ===
        normalizeOwnerName(ownerNameFromRaw(task.rawOwner) ?? '')
    ) {
      return false;
    }
    const events = await tx.auditEvent.findMany({
      where: {
        entityType: 'Task',
        entityId: task.id,
        origin: { in: ['UI', 'API'] },
        occurredAt: { gt: task.lastSyncedAt ?? new Date(0) },
      },
      select: { newValue: true },
    });
    return events.some(
      (event) =>
        !!event.newValue &&
        typeof event.newValue === 'object' &&
        'assigneeActorId' in event.newValue,
    );
  }

  /**
   * The assignment history a document-side assignment leaves. `assignedBy`
   * is required by the model and the document has no actor of its own, so
   * the assignee stands in — a claim, like an agent taking a task — and the
   * reason says where it came from.
   */
  private async recordDocumentAssignment(
    tx: Prisma.TransactionClient,
    taskId: string,
    actorId: string,
  ): Promise<void> {
    await tx.taskAssignment.updateMany({
      where: { taskId, unassignedAt: null },
      data: { unassignedAt: new Date() },
    });
    await tx.taskAssignment.create({
      data: {
        taskId,
        actorId,
        assignedByActorId: actorId,
        reason: 'Assigned by the Roadmap document',
      },
    });
  }

  /**
   * A status in none of the document's vocabularies is a mistake in the
   * document, not a state to guess at (Roadmap GAP-35b): the task keeps the
   * status it has (a task first seen with one is PENDIENTE) and one
   * UNRECOGNIZED_STATUS conflict asks a person to pick a status or dismiss
   * it. Checked on every row, not only a changed one, so a row synced before
   * this existed is still flagged; and once per distinct token per task —
   * open or already answered — so an unrelated edit of the row does not ask
   * again.
   */
  private async raiseUnrecognizedStatus(
    tx: Prisma.TransactionClient,
    task: Prisma.TaskGetPayload<object>,
    statusRaw: string,
    summary: SyncSummary,
  ): Promise<void> {
    const token = statusRaw.trim();
    const earlier = await tx.conflict.findMany({
      where: {
        projectId: task.projectId,
        kind: 'UNRECOGNIZED_STATUS',
        entityType: 'Task',
        entityId: task.id,
      },
      select: { externalVersion: true },
    });
    if (
      earlier.some(
        (conflict) =>
          (conflict.externalVersion as { statusRaw?: unknown } | null)
            ?.statusRaw === token,
      )
    ) {
      return;
    }
    const conflict = await tx.conflict.create({
      data: {
        projectId: task.projectId,
        kind: 'UNRECOGNIZED_STATUS',
        entityType: 'Task',
        entityId: task.id,
        localVersion: { status: task.status },
        externalVersion: { statusRaw: token },
      },
    });
    await this.audit.recordConflictDetected(conflict, 'SYNC', tx);
    summary.conflictsRaised += 1;
  }

  /**
   * One open conflict per task and field (Roadmap BUG-06a). A field that is
   * already contested in an open CONCURRENT_FIELD_EDIT conflict updates that
   * conflict to the latest local and document values instead of stacking a
   * second one (seven had piled up on one task); only the fields no open
   * conflict covers get a new one, which is the only case that counts as
   * "raised" — and so the only one members are notified about.
   */
  private async raiseFieldConflict(
    tx: Prisma.TransactionClient,
    task: Prisma.TaskGetPayload<object>,
    open: OpenConflict[],
    local: Record<string, unknown>,
    external: Record<string, unknown>,
    summary: SyncSummary,
  ): Promise<void> {
    const remaining = new Set(Object.keys(external));
    for (const conflict of open) {
      if (conflict.kind !== 'CONCURRENT_FIELD_EDIT') {
        continue;
      }
      const localVersion = {
        ...(conflict.localVersion as Record<string, unknown>),
      };
      const externalVersion = {
        ...(conflict.externalVersion as Record<string, unknown> | null),
      };
      let covered = false;
      for (const field of remaining) {
        if (field in localVersion || field in externalVersion) {
          localVersion[field] = local[field];
          externalVersion[field] = external[field];
          remaining.delete(field);
          covered = true;
        }
      }
      if (covered) {
        await tx.conflict.update({
          where: { id: conflict.id },
          data: {
            localVersion: localVersion as Prisma.InputJsonValue,
            externalVersion: externalVersion as Prisma.InputJsonValue,
          },
        });
        // Kept current in memory: a later call in this run works from it.
        conflict.localVersion = localVersion as Prisma.JsonValue;
        conflict.externalVersion = externalVersion as Prisma.JsonValue;
      }
    }
    if (remaining.size === 0) {
      return;
    }
    const created = await tx.conflict.create({
      data: {
        projectId: task.projectId,
        kind: 'CONCURRENT_FIELD_EDIT',
        entityType: 'Task',
        entityId: task.id,
        localVersion: Object.fromEntries(
          [...remaining].map((field) => [field, local[field]]),
        ) as Prisma.InputJsonValue,
        externalVersion: Object.fromEntries(
          [...remaining].map((field) => [field, external[field]]),
        ) as Prisma.InputJsonValue,
      },
    });
    await this.audit.recordConflictDetected(created, 'SYNC', tx);
    open.push(created);
    summary.conflictsRaised += 1;
  }

  /**
   * Closes a conflict nobody needs to decide any more — the row is back, or
   * the two sides agree again (Roadmap BUG-06a). Recorded as DISMISSED with
   * no resolving actor and an audit event that says it was automatic.
   */
  private async closeConflictAutomatically(
    tx: Prisma.TransactionClient,
    conflict: OpenConflict,
    open: OpenConflict[],
    reason: string,
    summary: SyncSummary,
  ): Promise<void> {
    await tx.conflict.update({
      where: { id: conflict.id },
      data: { resolvedAt: new Date(), resolutionStrategy: 'DISMISSED' },
    });
    await this.audit.record(
      {
        projectId: conflict.projectId,
        entityType: conflict.entityType,
        entityId: conflict.entityId,
        operation: 'CONFLICT_RESOLVED',
        origin: 'SYNC',
        previousValue: conflict.localVersion as Record<string, unknown>,
        newValue: {
          conflictId: conflict.id,
          strategy: 'DISMISSED',
          automatic: true,
          reason,
        },
      },
      tx,
    );
    open.splice(open.indexOf(conflict), 1);
    summary.conflictsClosed += 1;
  }

  /** Closes the open field conflicts whose every contested field now holds the same value in the document and in PM Hub. */
  private async closeAgreedFieldConflicts(
    tx: Prisma.TransactionClient,
    task: Prisma.TaskGetPayload<object>,
    row: ParsedRoadmapRow,
    open: OpenConflict[],
    summary: SyncSummary,
  ): Promise<void> {
    // undefined: the row does not carry the field, which says nothing.
    const agrees: Record<string, boolean | undefined> = {
      status: row.statusMapped ? row.statusMapped === task.status : undefined,
      title: row.outcome !== undefined ? row.outcome === task.title : undefined,
      acceptanceCriteria:
        row.acceptanceCheck !== undefined
          ? row.acceptanceCheck === task.acceptanceCriteria
          : undefined,
      rawOwner:
        row.rawOwner !== undefined ? row.rawOwner === task.rawOwner : undefined,
    };
    // Filtered, so it is a copy: closing a conflict removes it from `open`.
    const fieldConflicts = open.filter(
      (conflict) => conflict.kind === 'CONCURRENT_FIELD_EDIT',
    );
    for (const conflict of fieldConflicts) {
      const fields = Object.keys(
        (conflict.externalVersion as Record<string, unknown> | null) ?? {},
      );
      if (
        fields.length > 0 &&
        fields.every((field) => agrees[field] === true)
      ) {
        await this.closeConflictAutomatically(
          tx,
          conflict,
          open,
          'the document and PM Hub agree again',
          summary,
        );
      }
    }
  }

  /** Step 5. Returns whether anything was actually written. */
  private async reconcileExistingRow(
    tx: Prisma.TransactionClient,
    task: Prisma.TaskGetPayload<object>,
    row: ParsedRoadmapRow,
    open: OpenConflict[],
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

    await this.closeAgreedFieldConflicts(tx, task, row, open, summary);

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
    } else if (movingOutOfBlocked) {
      updates.blockedReason = null;
      updates.neededDecision = null;
    }

    // Every row, blocked or not, reconciles the fields it carries: a blocked
    // entry still has a title and an owner (Roadmap GAP-35b). The columns it
    // lacks (status, acceptance check) are undefined on the row and so never
    // become candidates, which is what keeps them as last known.
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
      // against epoch rather than skipping the check on null. Both UI and
      // API (Roadmap GAP-24) count as "local" here — an agent's API-key
      // edit must contest a document change exactly like a person's.
      const since = task.lastSyncedAt ?? new Date(0);
      const uiEdits = await tx.auditEvent.findMany({
        where: {
          entityType: 'Task',
          entityId: task.id,
          origin: { in: ['UI', 'API'] },
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
        await this.raiseFieldConflict(
          tx,
          task,
          open,
          localVersion,
          externalVersion,
          summary,
        );
        conflictRaised = true;
      }
      for (const field of clean) {
        updates[field] = candidates[field];
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

  /** Records one skipped edge once per run, however many places notice it, bounded like the entry errors. */
  private noteSkippedCycle(
    summary: SyncSummary,
    from: string,
    to: string,
  ): void {
    if (
      summary.skippedCycles.length < MAX_ENTRY_ERRORS_RECORDED &&
      !summary.skippedCycles.some(
        (skip) => skip.from === from && skip.to === to,
      )
    ) {
      summary.skippedCycles.push({ from, to });
    }
  }
  /**
   * Step 6 (Roadmap GAP-14/GAP-35e, docs/domain-model.md "Depends on"): makes
   * a task's dependencies match its row's "Depends on" cell. Called on every
   * reconciled row, hash-match skip or not — the very first run against a
   * project synced before this feature existed still needs to backfill every
   * row's dependencies once.
   *
   * Adding: each comma-separated external ID becomes a TaskDependency (an
   * ID already linked, resolved or dangling, is only marked as listed).
   * An unresolvable ID (a row not seen *yet* in this same pass, or never) is
   * stored via `rawExternalRef` with a null `dependsOnTaskId` — upgrading
   * that once the target is known is `resolveDanglingDependencies`'s job,
   * since a row can be reconciled before the row it depends on even when
   * both are in the very same document.
   *
   * Removing: a dependency the document has listed (`inDocument`: seen here,
   * or written by the add-dependency write-back) and no longer lists is
   * removed — the document is where it was declared, and PM Hub has no way of
   * removing one itself. One the document never listed is never touched, and
   * neither is a row that carries no such cell (`carriesDependsOn` is false
   * for Blocked rows, where an absent cell says nothing).
   */
  private async reconcileDependencies(
    tx: Prisma.TransactionClient,
    projectId: string,
    taskId: string,
    externalId: string,
    dependsOnRaw: string | undefined,
    carriesDependsOn: boolean,
    existingByExternalId: Map<string, { id: string }>,
    graph: DependencyGraph,
    summary: SyncSummary,
  ): Promise<void> {
    const referencedIds = dependsOnRaw
      ? [
          ...new Set(
            dependsOnRaw
              .split(',')
              .map((s) => s.trim())
              .filter((s) => s.length > 0 && s !== externalId), // a row never depends on itself
          ),
        ]
      : [];
    if (referencedIds.length === 0 && !carriesDependsOn) {
      return;
    }

    const existingDeps = await tx.taskDependency.findMany({
      where: { taskId },
      select: {
        id: true,
        dependsOnTaskId: true,
        rawExternalRef: true,
        inDocument: true,
        dependsOnTask: { select: { externalId: true } },
      },
    });

    if (carriesDependsOn) {
      for (const dep of existingDeps) {
        if (!dep.inDocument) {
          continue;
        }
        const stillListed = [dep.dependsOnTask?.externalId, dep.rawExternalRef]
          .filter((ref): ref is string => !!ref)
          .some((ref) => referencedIds.includes(ref));
        if (stillListed) {
          continue;
        }
        await tx.taskDependency.delete({ where: { id: dep.id } });
        if (dep.dependsOnTaskId) {
          removeDependencyEdge(graph, taskId, dep.dependsOnTaskId);
        }
        await this.audit.record(
          {
            projectId,
            entityType: 'Task',
            entityId: taskId,
            operation: 'DEPENDENCY_REMOVE',
            origin: 'ROADMAP',
            previousValue: {
              dependsOnTaskId: dep.dependsOnTaskId,
              rawExternalRef: dep.rawExternalRef,
            },
          },
          tx,
        );
        summary.dependenciesRemoved += 1;
      }
    }

    for (const referencedId of referencedIds) {
      const target = existingByExternalId.get(referencedId);
      const recorded = existingDeps.find(
        (d) =>
          d.rawExternalRef === referencedId ||
          // Same target already linked by a different route (e.g. added
          // through the UI with no rawExternalRef) — don't create a second
          // row for one logical dependency just because this row's cell
          // names it too.
          (target && d.dependsOnTaskId === target.id),
      );
      if (recorded) {
        if (!recorded.inDocument) {
          await tx.taskDependency.update({
            where: { id: recorded.id },
            data: { inDocument: true },
          });
        }
        continue;
      }
      if (target && wouldCloseCycle(graph, taskId, target.id)) {
        // A document-authoring mistake: skip rather than corrupt the graph, and
        // say so, so the loop can be found (Roadmap BUG-06c).
        this.noteSkippedCycle(summary, externalId, referencedId);
        continue;
      }
      const created = await tx.taskDependency.create({
        data: {
          taskId,
          dependsOnTaskId: target?.id ?? null,
          rawExternalRef: referencedId,
          inDocument: true,
        },
      });
      if (created.dependsOnTaskId) {
        addDependencyEdge(graph, taskId, created.dependsOnTaskId);
      }
      await this.audit.record(
        {
          projectId,
          entityType: 'Task',
          entityId: taskId,
          operation: 'DEPENDENCY_ADD',
          origin: 'ROADMAP',
          newValue: diffFields(
            {},
            {
              dependsOnTaskId: created.dependsOnTaskId,
              rawExternalRef: created.rawExternalRef,
            },
          )?.newValue,
        },
        tx,
      );
      summary.dependenciesLinked += 1;
    }
  }

  /**
   * One sweep per sync, after every row has been walked: upgrades any
   * dangling TaskDependency whose `rawExternalRef` now resolves against
   * `existingByExternalId` — including a target created a few rows later in
   * this very pass, which `reconcileDependencies` above cannot see yet when
   * it first records the reference. Re-checks for a cycle before each
   * upgrade, same as a fresh link would.
   */
  private async resolveDanglingDependencies(
    tx: Prisma.TransactionClient,
    projectId: string,
    existingByExternalId: Map<string, { id: string }>,
    graph: DependencyGraph,
    summary: SyncSummary,
  ): Promise<void> {
    const dangling = await tx.taskDependency.findMany({
      where: {
        dependsOnTaskId: null,
        rawExternalRef: { not: null },
        task: { projectId },
      },
    });
    const externalIdOf = new Map(
      [...existingByExternalId].map(([external, task]) => [task.id, external]),
    );
    for (const dep of dangling) {
      const target = existingByExternalId.get(dep.rawExternalRef!);
      if (!target || target.id === dep.taskId) {
        continue; // still unresolved, or would now be a self-reference
      }
      if (wouldCloseCycle(graph, dep.taskId, target.id)) {
        // Left dangling rather than close a cycle — and reported.
        this.noteSkippedCycle(
          summary,
          externalIdOf.get(dep.taskId) ?? dep.taskId,
          dep.rawExternalRef!,
        );
        continue;
      }
      await tx.taskDependency.update({
        where: { id: dep.id },
        data: { dependsOnTaskId: target.id },
      });
      addDependencyEdge(graph, dep.taskId, target.id);
      await this.audit.record(
        {
          projectId,
          entityType: 'Task',
          entityId: dep.taskId,
          operation: 'DEPENDENCY_ADD',
          origin: 'ROADMAP',
          newValue: diffFields(
            { dependsOnTaskId: null },
            { dependsOnTaskId: target.id },
          )?.newValue,
        },
        tx,
      );
      summary.dependenciesLinked += 1;
    }
  }
}
