import { createHash } from 'node:crypto';
import {
  Inject,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import { DocumentKind, Prisma, TaskStatus } from '@prisma/client';
import type { Task, TaskDependency } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { AgentslogParserService } from '../roadmap/agentslog-parser.service.js';
import { isSkillRoadmap } from '../roadmap/markdown-table.util.js';
import { RoadmapParserService } from '../roadmap/roadmap-parser.service.js';
import { looksLikeNewFormatRoadmap } from '../roadmap/roadmap-yaml-entry.util.js';
import { rowContentHash } from './row-content-hash.util.js';
import { appendAgentslogEntry } from '../roadmap/agentslog-writer.util.js';
import { skillLedgerEntries } from '../roadmap/skill-ledger.util.js';
import { rowStatusDiffers } from '../roadmap/status-vocabulary.util.js';
import {
  normalizeOwnerName,
  type RoadmapOwner,
} from '../roadmap/roadmap-owner.util.js';
import {
  removeRoadmapRow,
  replaceRoadmapOwner,
  replaceRoadmapRowCells,
  sanitizeField,
  upsertLifecycleRoadmapRow,
} from '../roadmap/roadmap-row-writer.util.js';
import { describeNotSaved } from './sync-failure.util.js';
import { PROJECT_REPOSITORY_PROVIDER } from '../git-providers/project-repository-provider.interface.js';
import type { ProjectRepositoryProvider } from '../git-providers/project-repository-provider.interface.js';

/** Task fields a conflict can carry and a resolution can put into the document (Roadmap BUG-06b). */
export interface ResolvedTaskFields {
  title?: string;
  acceptanceCriteria?: string | null;
  status?: TaskStatus;
  assigneeActorId?: string;
  priority?: string | null;
  progressPercent?: number | null;
}

export type WriteBackTrigger =
  'CREATED' | 'STATUS_EN_DESARROLLO' | 'STATUS_TERMINADA' | 'LOCKED_REASSIGN';

/** Pre-edit values of the Roadmap-backed fields a UI edit just changed; absent keys were not changed. */
export interface RoadmapFieldEdit {
  title?: string;
  acceptanceCriteria?: string | null;
  /** Display name of the assignee before the edit, or null if there was none (Roadmap GAP-35a). */
  assignee?: string | null;
  /** Written only into a YAML entry, the one format with such a field (Roadmap GAP-35c). */
  priority?: string | null;
  progressPercent?: number | null;
  /** Where the task sat before the edit, when the edit moved it: written into a YAML entry as its `parent` (Roadmap GAP-35d). */
  hierarchy?: {
    parentTaskId: string | null;
    epicId: string | null;
    phaseId: string | null;
  };
}

const DOCUMENT_FILENAMES: Record<'ROADMAP' | 'AGENTSLOG', string> = {
  ROADMAP: 'Roadmap.md',
  AGENTSLOG: 'Agentslog.md',
};

/**
 * Postgres -> Documents write-back (docs/synchronization.md). A curated
 * subset of task lifecycle events rewrites the row and appends an Agentslog
 * entry; edits to the Roadmap-backed fields (title, acceptance criteria)
 * rewrite just those cells with no ledger entry (`recordFieldEdit`); every
 * other edit (priority, dates, hierarchy) stays UI-only, to avoid
 * ledger-rotation churn from fine-grained activity. Runs under the same
 * pg_advisory_xact_lock as SynchronizationService.runSync, in its own
 * transaction, so the two naturally serialize against each other.
 *
 * FASE-08 scope trim: on document drift (step 6), this does a *targeted*
 * collision check against the specific task's row rather than running the
 * full read-path reconciliation inline — avoids nesting a second
 * transaction/advisory-lock cycle inside this one. A real drift still
 * raises WRITE_BACK_COLLISION and skips the blind write; it just doesn't
 * also reconcile every other row on the page while doing so. The next
 * scheduled/manual sync catches the rest.
 */
@Injectable()
export class WriteBackService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PROJECT_REPOSITORY_PROVIDER)
    private readonly repositoryProvider: ProjectRepositoryProvider,
    private readonly roadmapParser: RoadmapParserService,
    private readonly agentslogParser: AgentslogParserService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Runs a change to a task and the write of its document as ONE transaction
   * under the project's advisory lock (Roadmap BUG-07): either the database
   * change and the document write both happen or neither does. A document
   * that cannot be written now fails the request cleanly — nothing saved,
   * nothing to duplicate on a retry — instead of leaving a saved change
   * behind a 500. The lock is taken before the change touches any row, so
   * this cannot deadlock against sync or another write-back, which take it
   * first as well.
   */
  async inTransaction<T>(
    projectId: string,
    work: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${projectId}))`;
          return work(tx);
        },
        { timeout: 20000, maxWait: 10000 },
      );
    } catch (error) {
      const notSaved = describeNotSaved(error);
      if (notSaved) {
        throw new UnprocessableEntityException(notSaved);
      }
      throw error;
    }
  }

  /** The caller's transaction when it has one (its change and this write are one unit), else this write's own. */
  private within<T>(
    projectId: string,
    tx: Prisma.TransactionClient | undefined,
    work: (client: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return tx ? work(tx) : this.inTransaction(projectId, work);
  }

  async recordTaskEvent(
    projectId: string,
    taskId: string,
    trigger: WriteBackTrigger,
    requesterActorId: string,
    tx?: Prisma.TransactionClient,
  ) {
    return this.within(projectId, tx, (client) =>
      this.writeBackLocked(
        client,
        projectId,
        taskId,
        trigger,
        requesterActorId,
      ),
    );
  }

  /**
   * A UI edit to a Roadmap-backed field (title -> Outcome, acceptanceCriteria
   * -> Acceptance check) rewrites just those cells of the task's existing
   * row, wherever it sits. No Agentslog entry: an in-place edit never makes a
   * row vanish, so the ledger-first ordering has nothing to protect
   * (docs/synchronization.md "Field edits").
   */
  async recordFieldEdit(
    projectId: string,
    taskId: string,
    previous: RoadmapFieldEdit,
    requesterActorId: string,
    tx?: Prisma.TransactionClient,
  ) {
    return this.within(projectId, tx, (client) =>
      this.fieldEditLocked(
        client,
        projectId,
        taskId,
        previous,
        requesterActorId,
      ),
    );
  }

  /**
   * A conflict resolution that chose PM Hub's value (KEEP_LOCAL, or a
   * MANUAL_EDIT) writes it to the document, so the side that lost is not left
   * holding the old value with a stored hash that says everything is in sync
   * (Roadmap BUG-06b). KEEP_EXTERNAL needs no write.
   *
   * Field by field, and only over what the conflict showed: a field is
   * written only if the document still holds the value the conflict recorded
   * as its side. If it moved on since, that is a newer document edit the
   * person has not seen — it is left, `WRITE_BACK_DEFERRED`, and the next
   * sync raises it as a conflict of its own.
   */
  async recordConflictResolution(
    projectId: string,
    taskId: string,
    chosen: ResolvedTaskFields,
    documentSide: ResolvedTaskFields,
    requesterActorId: string,
    tx?: Prisma.TransactionClient,
  ) {
    return this.within(projectId, tx, (client) =>
      this.resolutionLocked(
        client,
        projectId,
        taskId,
        chosen,
        documentSide,
        requesterActorId,
      ),
    );
  }

  private async resolutionLocked(
    tx: Prisma.TransactionClient,
    projectId: string,
    taskId: string,
    chosen: ResolvedTaskFields,
    documentSide: ResolvedTaskFields,
    requesterActorId: string,
  ): Promise<void> {
    const project = await tx.project.findUniqueOrThrow({
      where: { id: projectId },
    });
    const task = await tx.task.findUniqueOrThrow({ where: { id: taskId } });
    if (!task.externalId) {
      return;
    }
    const externalId = task.externalId;
    const roadmapContent = await this.repositoryProvider.readFile(
      project.docsPath,
      DOCUMENT_FILENAMES.ROADMAP,
    );
    const currentRow = this.roadmapParser
      .parseTolerant(roadmapContent)
      .rows.find((row) => row.externalId === externalId);
    if (!currentRow) {
      return; // no row to write into: the document dropped it, which sync owns
    }

    const cells: Record<string, string> = {};
    const deferred: string[] = [];
    if ('title' in chosen) {
      if ((currentRow.outcome ?? '') === (documentSide.title ?? '')) {
        cells.Outcome = chosen.title ?? '';
      } else {
        deferred.push('title');
      }
    }
    if ('acceptanceCriteria' in chosen) {
      if (
        (currentRow.acceptanceCheck ?? '') ===
        (documentSide.acceptanceCriteria ?? '')
      ) {
        cells['Acceptance check'] = chosen.acceptanceCriteria ?? '';
      } else {
        deferred.push('acceptanceCriteria');
      }
    }
    if ('status' in chosen) {
      if (currentRow.statusMapped === documentSide.status) {
        cells.Status = chosen.status ?? '';
      } else {
        deferred.push('status');
      }
    }

    if ('priority' in chosen) {
      if ((currentRow.priority ?? null) === (documentSide.priority ?? null)) {
        cells.Priority = chosen.priority ?? '';
      } else {
        deferred.push('priority');
      }
    }
    if ('progressPercent' in chosen) {
      if (
        (currentRow.progress ?? null) === (documentSide.progressPercent ?? null)
      ) {
        cells.Progress = String(chosen.progressPercent ?? '');
      } else {
        deferred.push('progressPercent');
      }
    }

    let owner: RoadmapOwner | null = null;
    if ('assigneeActorId' in chosen) {
      const ids = [chosen.assigneeActorId, documentSide.assigneeActorId].filter(
        (id): id is string => !!id,
      );
      const actors = await tx.actor.findMany({ where: { id: { in: ids } } });
      const winner = actors.find(
        (actor) => actor.id === chosen.assigneeActorId,
      );
      const loser = actors.find(
        (actor) => actor.id === documentSide.assigneeActorId,
      );
      if (
        winner &&
        normalizeOwnerName(currentRow.ownerName ?? '') ===
          normalizeOwnerName(loser?.displayName ?? '')
      ) {
        owner = { name: winner.displayName, kind: winner.kind };
      } else {
        deferred.push('assigneeActorId');
      }
    }

    let updatedMarkdown = roadmapContent;
    const writtenFields: string[] = [];
    if (Object.keys(cells).length > 0) {
      const replaced = replaceRoadmapRowCells(
        roadmapContent,
        externalId,
        cells,
      );
      if (replaced && replaced.replaced.length > 0) {
        updatedMarkdown = replaced.markdown;
        const byHeader: Record<string, string> = {
          Outcome: 'title',
          'Acceptance check': 'acceptanceCriteria',
          Status: 'status',
          Priority: 'priority',
          Progress: 'progressPercent',
        };
        writtenFields.push(
          ...replaced.replaced.map((header) => byHeader[header] ?? header),
        );
      }
    }
    if (owner) {
      const withOwner = replaceRoadmapOwner(
        updatedMarkdown,
        externalId,
        owner,
        new Date().toISOString(),
      );
      if (withOwner !== null) {
        updatedMarkdown = withOwner;
        writtenFields.push('assigneeActorId');
      }
    }

    if (writtenFields.length === 0) {
      if (deferred.length > 0) {
        await this.audit.record(
          {
            projectId,
            actorId: requesterActorId,
            entityType: 'Task',
            entityId: task.id,
            operation: 'WRITE_BACK_DEFERRED',
            origin: 'UI',
            newValue: { trigger: 'CONFLICT_RESOLUTION', deferred },
          },
          tx,
        );
      }
      return;
    }

    await this.repositoryProvider.writeFile(
      project.docsPath,
      DOCUMENT_FILENAMES.ROADMAP,
      updatedMarkdown,
    );
    await this.recordDocumentRevision(
      tx,
      projectId,
      'ROADMAP',
      DOCUMENT_FILENAMES.ROADMAP,
      updatedMarkdown,
    );

    // The written row is the new baseline only if nothing else in it changed
    // on the document side since the conflict was raised.
    const writtenRow = this.roadmapParser
      .parseTolerant(updatedMarkdown)
      .rows.find((row) => row.externalId === externalId);
    if (
      writtenRow &&
      deferred.length === 0 &&
      task.lastSyncedContentHash === rowContentHash(currentRow)
    ) {
      await tx.task.update({
        where: { id: task.id },
        data: {
          lastSyncedContentHash: rowContentHash(writtenRow),
          lastSyncedAt: new Date(),
          rawOwner: writtenRow.rawOwner ?? null,
        },
      });
    }

    await this.audit.record(
      {
        projectId,
        actorId: requesterActorId,
        entityType: 'Task',
        entityId: task.id,
        operation: 'WRITE_BACK',
        origin: 'UI',
        newValue: {
          trigger: 'CONFLICT_RESOLUTION',
          fields: writtenFields,
          ...(deferred.length > 0 ? { deferred } : {}),
        },
      },
      tx,
    );
  }

  /**
   * Removal (docs/synchronization.md "Removal"): the REMOVED Agentslog entry
   * goes first, then the row is taken out of whichever table holds it — the
   * same ledger-first order as the lifecycle triggers, so a row never
   * vanishes without an entry saying why.
   */
  async recordTaskRemoval(
    projectId: string,
    taskId: string,
    requesterActorId: string,
    tx?: Prisma.TransactionClient,
  ) {
    return this.within(projectId, tx, (client) =>
      this.removalLocked(client, projectId, taskId, requesterActorId),
    );
  }

  /**
   * Dependency write-back (Roadmap GAP-22, docs/synchronization.md
   * "Dependencies"): renders the task's full current dependency set into its
   * Roadmap row's "Depends on" cell — the read direction (document ->
   * TaskDependency, additive-only) already existed; this is the missing
   * write direction. No Agentslog entry: like a field edit, adding a
   * dependency never makes a row vanish, so the ledger-first ordering has
   * nothing to protect. A task with no externalId yet (never write-back'd)
   * or whose row has disappeared from the document is left alone — its
   * dependencies will render on its next real write-back or the next time a
   * row exists for it.
   */
  async recordDependencyAdded(
    projectId: string,
    taskId: string,
    requesterActorId: string,
    tx?: Prisma.TransactionClient,
  ) {
    return this.within(projectId, tx, (client) =>
      this.dependencyAddedLocked(client, projectId, taskId, requesterActorId),
    );
  }

  private async dependencyAddedLocked(
    tx: Prisma.TransactionClient,
    projectId: string,
    taskId: string,
    requesterActorId: string,
  ): Promise<Task> {
    const project = await tx.project.findUniqueOrThrow({
      where: { id: projectId },
    });
    const task = await tx.task.findUniqueOrThrow({
      where: { id: taskId },
      include: {
        dependencies: {
          include: { dependsOnTask: { select: { externalId: true } } },
        },
      },
    });
    if (!task.externalId) {
      return task;
    }

    const roadmapContent = await this.repositoryProvider.readFile(
      project.docsPath,
      DOCUMENT_FILENAMES.ROADMAP,
    );
    const written = replaceRoadmapRowCells(roadmapContent, task.externalId, {
      'Depends on': renderDependsOnCell(task.dependencies),
    });
    if (!written || written.replaced.length === 0) {
      // No table holds this row (removed, or it's a Blocked row, which has
      // no "Depends on" column) — nothing to write.
      return task;
    }

    await this.repositoryProvider.writeFile(
      project.docsPath,
      DOCUMENT_FILENAMES.ROADMAP,
      written.markdown,
    );
    await this.recordDocumentRevision(
      tx,
      projectId,
      'ROADMAP',
      DOCUMENT_FILENAMES.ROADMAP,
      written.markdown,
    );

    const writtenRow = this.roadmapParser
      .parseTolerant(written.markdown)
      .rows.find((row) => row.externalId === task.externalId);
    let result: Task = task;
    if (writtenRow) {
      result = await tx.task.update({
        where: { id: task.id },
        data: {
          lastSyncedContentHash: rowContentHash(writtenRow),
          lastSyncedAt: new Date(),
        },
      });
    }
    // The cell now lists every dependency of the task, so the document has
    // seen them all — which is what lets sync later tell a dependency it
    // dropped from one it never had (Roadmap GAP-35e).
    await tx.taskDependency.updateMany({
      where: { taskId: task.id },
      data: { inDocument: true },
    });

    await this.audit.record(
      {
        projectId,
        actorId: requesterActorId,
        entityType: 'Task',
        entityId: task.id,
        operation: 'WRITE_BACK',
        origin: 'UI',
        newValue: { trigger: 'DEPENDENCY_ADD' },
      },
      tx,
    );

    return result;
  }

  private async removalLocked(
    tx: Prisma.TransactionClient,
    projectId: string,
    taskId: string,
    requesterActorId: string,
  ) {
    const project = await tx.project.findUniqueOrThrow({
      where: { id: projectId },
    });
    const task = await tx.task.findUniqueOrThrow({ where: { id: taskId } });
    if (!task.externalId) {
      return task;
    }
    const actor = await tx.actor.findUnique({
      where: { id: requesterActorId },
    });

    const roadmapContent = await this.repositoryProvider.readFile(
      project.docsPath,
      DOCUMENT_FILENAMES.ROADMAP,
    );

    // The latest skill has no state for a removed task, and its `check`
    // refuses a ledger ID that is in neither Roadmap.md nor Features.md, so a
    // project documented with it gets no entry (Roadmap GAP-37b); the audit
    // trail below still records the removal.
    if (!isSkillRoadmap(roadmapContent)) {
      const agentslogContent = await this.repositoryProvider.readFile(
        project.docsPath,
        DOCUMENT_FILENAMES.AGENTSLOG,
      );
      const updatedAgentslog = appendAgentslogEntry(agentslogContent, {
        timestampIso: new Date().toISOString(),
        agentName: actor?.displayName ?? 'system',
        taskExternalId: task.externalId,
        statusWord: 'REMOVED',
        summary: `Removed: ${task.title}`,
        files: '—',
        verify: '—',
        followUp: '—',
      });
      await this.repositoryProvider.writeFile(
        project.docsPath,
        DOCUMENT_FILENAMES.AGENTSLOG,
        updatedAgentslog,
      );
      await this.recordDocumentRevision(
        tx,
        projectId,
        'AGENTSLOG',
        DOCUMENT_FILENAMES.AGENTSLOG,
        updatedAgentslog,
      );
    }

    const updatedRoadmap = removeRoadmapRow(roadmapContent, task.externalId);
    if (updatedRoadmap !== null) {
      await this.repositoryProvider.writeFile(
        project.docsPath,
        DOCUMENT_FILENAMES.ROADMAP,
        updatedRoadmap,
      );
      await this.recordDocumentRevision(
        tx,
        projectId,
        'ROADMAP',
        DOCUMENT_FILENAMES.ROADMAP,
        updatedRoadmap,
      );
    }

    await this.audit.record(
      {
        projectId,
        actorId: requesterActorId,
        entityType: 'Task',
        entityId: task.id,
        operation: 'WRITE_BACK',
        origin: 'UI',
        newValue: { trigger: 'REMOVED', rowRemoved: updatedRoadmap !== null },
      },
      tx,
    );
    return task;
  }

  /**
   * How a YAML document names where a task sits (its `parent`): its parent
   * task, else its epic, else its phase (Roadmap GAP-35d). `ref` is null for a
   * task that sits nowhere; the whole result is undefined when the place is
   * something the document has no id for — an epic or phase made in the app.
   */
  private async hierarchyRef(
    tx: Prisma.TransactionClient,
    placement: {
      parentTaskId: string | null;
      epicId: string | null;
      phaseId: string | null;
    },
  ): Promise<{ ref: string | null; underTask: boolean } | undefined> {
    if (placement.parentTaskId) {
      const parent = await tx.task.findUnique({
        where: { id: placement.parentTaskId },
        select: { externalId: true },
      });
      return parent?.externalId
        ? { ref: parent.externalId, underTask: true }
        : undefined;
    }
    if (placement.epicId) {
      const epic = await tx.epic.findUnique({
        where: { id: placement.epicId },
        select: { externalId: true },
      });
      return epic?.externalId
        ? { ref: epic.externalId, underTask: false }
        : undefined;
    }
    if (placement.phaseId) {
      const phase = await tx.phase.findUnique({
        where: { id: placement.phaseId },
        select: { externalId: true },
      });
      return phase?.externalId
        ? { ref: phase.externalId, underTask: false }
        : undefined;
    }
    return { ref: null, underTask: false };
  }

  private async fieldEditLocked(
    tx: Prisma.TransactionClient,
    projectId: string,
    taskId: string,
    previous: RoadmapFieldEdit,
    requesterActorId: string,
  ) {
    const project = await tx.project.findUniqueOrThrow({
      where: { id: projectId },
    });
    const task = await tx.task.findUniqueOrThrow({ where: { id: taskId } });
    if (!task.externalId) {
      return task;
    }
    const externalId = task.externalId;

    const roadmapContent = await this.repositoryProvider.readFile(
      project.docsPath,
      DOCUMENT_FILENAMES.ROADMAP,
    );
    const currentRow = this.roadmapParser
      .parseTolerant(roadmapContent)
      .rows.find((row) => row.externalId === externalId);
    if (!currentRow) {
      // No row to edit: the document dropped it, which sync owns (step 6).
      return task;
    }

    const roadmapDocument = await tx.document.findUnique({
      where: { projectId_kind: { projectId, kind: 'ROADMAP' } },
    });
    const drifted =
      roadmapDocument?.lastKnownHash !==
      createHash('sha256').update(roadmapContent).digest('hex');

    const yamlDocument = looksLikeNewFormatRoadmap(roadmapContent);
    // Where the task sits, as the document names it, before and after the edit
    // (Roadmap GAP-35d). Left out when the target has no id in the document
    // (an epic made in the app): there is nothing to write.
    const before: Record<string, unknown> = { ...previous };
    let hierarchyNext: string | undefined;
    if (yamlDocument && previous.hierarchy) {
      const now = await this.hierarchyRef(tx, task);
      if (now) {
        hierarchyNext = now.ref ?? '';
        before.hierarchy =
          (await this.hierarchyRef(tx, previous.hierarchy))?.ref ?? '';
      }
    }
    const edits = [
      {
        field: 'title',
        header: 'Outcome',
        current: currentRow.outcome,
        next: task.title,
      },
      {
        field: 'acceptanceCriteria',
        header: 'Acceptance check',
        current: currentRow.acceptanceCheck,
        next: task.acceptanceCriteria ?? '',
      },
      // Only an entry of the YAML format has a priority and a progress; for a
      // table there is nowhere to write them, and comparing against a cell
      // that cannot exist would only look like a drift (Roadmap GAP-35c).
      ...(hierarchyNext !== undefined
        ? ([
            {
              field: 'hierarchy',
              header: 'Parent',
              current: currentRow.parentRef ?? '',
              next: hierarchyNext,
            },
          ] as const)
        : []),
      ...(yamlDocument
        ? ([
            {
              field: 'priority',
              header: 'Priority',
              current: currentRow.priority ?? '',
              next: task.priority ?? '',
            },
            {
              field: 'progressPercent',
              header: 'Progress',
              current: String(currentRow.progress ?? ''),
              next: String(task.progressPercent ?? ''),
            },
          ] as const)
        : []),
    ] as const;
    const cells: Record<string, string> = {};
    const deferred: string[] = [];
    for (const edit of edits) {
      if (!(edit.field in previous)) {
        continue;
      }
      // Once the document changed since PM Hub last saw it, a cell that no
      // longer holds the pre-edit value was edited on the document side too:
      // never overwrite it — sync raises it as CONCURRENT_FIELD_EDIT (step 5).
      const preEdit = sanitizeField(String(before[edit.field] ?? ''));
      if (drifted && (edit.current ?? '') !== preEdit) {
        deferred.push(edit.field);
        continue;
      }
      cells[edit.header] = edit.next;
    }

    let updatedMarkdown = roadmapContent;
    const writtenFields: string[] = [];
    if (Object.keys(cells).length > 0) {
      const replaced = replaceRoadmapRowCells(
        roadmapContent,
        externalId,
        cells,
      );
      if (replaced && replaced.replaced.length > 0) {
        updatedMarkdown = replaced.markdown;
        writtenFields.push(
          ...edits
            .filter((edit) => replaced.replaced.includes(edit.header))
            .map((edit) => edit.field),
        );
      }
    }

    // The assignee (Roadmap GAP-35a): same drift rule as the cells above — if
    // the document changed since PM Hub last saw it and its owner is no longer
    // the pre-edit assignee, it was reassigned there too, so it is left for
    // sync to contest instead of being overwritten.
    if ('assignee' in previous && task.assigneeActorId) {
      const assignee = await tx.actor.findUnique({
        where: { id: task.assigneeActorId },
      });
      const documentOwner = normalizeOwnerName(currentRow.ownerName ?? '');
      const preEditOwner = normalizeOwnerName(previous.assignee ?? '');
      if (assignee && drifted && documentOwner !== preEditOwner) {
        deferred.push('assignee');
      } else if (assignee) {
        const withOwner = replaceRoadmapOwner(
          updatedMarkdown,
          externalId,
          { name: assignee.displayName, kind: assignee.kind },
          new Date().toISOString(),
        );
        if (withOwner !== null) {
          updatedMarkdown = withOwner;
          writtenFields.push('assignee');
        }
      }
    }

    if (writtenFields.length === 0) {
      if (deferred.length > 0) {
        await this.audit.record(
          {
            projectId,
            actorId: requesterActorId,
            entityType: 'Task',
            entityId: task.id,
            operation: 'WRITE_BACK_DEFERRED',
            origin: 'UI',
            newValue: { trigger: 'FIELD_EDIT', deferred },
          },
          tx,
        );
      }
      return task;
    }

    await this.repositoryProvider.writeFile(
      project.docsPath,
      DOCUMENT_FILENAMES.ROADMAP,
      updatedMarkdown,
    );
    await this.recordDocumentRevision(
      tx,
      projectId,
      'ROADMAP',
      DOCUMENT_FILENAMES.ROADMAP,
      updatedMarkdown,
    );

    // The written row becomes the baseline only if the row carried no
    // unreconciled document-side change: otherwise sync must still see — and
    // apply or contest — what the document changed in the row's other cells.
    let result = task;
    const writtenRow = this.roadmapParser
      .parseTolerant(updatedMarkdown)
      .rows.find((row) => row.externalId === externalId);
    if (
      writtenRow &&
      deferred.length === 0 &&
      task.lastSyncedContentHash === rowContentHash(currentRow)
    ) {
      result = await tx.task.update({
        where: { id: task.id },
        data: {
          lastSyncedContentHash: rowContentHash(writtenRow),
          // An assignment also moves PENDIENTE to ASIGNADA, which the document
          // does not record, so the row is not fully reflected: the window in
          // which local edits count as unsynced stays open for that status.
          ...(writtenFields.includes('assignee')
            ? {}
            : { lastSyncedAt: new Date() }),
          // The owner as the document now names it: sync tells a document-side
          // reassignment from a local one by comparing against this.
          rawOwner: writtenRow.rawOwner ?? null,
        },
      });
    }

    await this.audit.record(
      {
        projectId,
        actorId: requesterActorId,
        entityType: 'Task',
        entityId: task.id,
        operation: 'WRITE_BACK',
        origin: 'UI',
        newValue: {
          trigger: 'FIELD_EDIT',
          fields: writtenFields,
          ...(deferred.length > 0 ? { deferred } : {}),
        },
      },
      tx,
    );

    return result;
  }

  private async writeBackLocked(
    tx: Prisma.TransactionClient,
    projectId: string,
    taskId: string,
    trigger: WriteBackTrigger,
    requesterActorId: string,
  ) {
    const project = await tx.project.findUniqueOrThrow({
      where: { id: projectId },
    });
    let task = await tx.task.findUniqueOrThrow({ where: { id: taskId } });

    if (!task.externalId) {
      const externalId = `PMH-${project.nextTaskSeq}`;
      await tx.project.update({
        where: { id: projectId },
        data: { nextTaskSeq: { increment: 1 } },
      });
      task = await tx.task.update({
        where: { id: taskId },
        data: { externalId },
      });
    }
    const externalId = task.externalId!;

    const actor = await tx.actor.findUnique({
      where: { id: requesterActorId },
    });

    // Read first: which format the document is in decides what the ledger
    // entry may say.
    const roadmapContent = await this.repositoryProvider.readFile(
      project.docsPath,
      DOCUMENT_FILENAMES.ROADMAP,
    );

    // Step 3: Agentslog entry appended first — preserves "a terminal log
    // entry exists before a row can vanish" even across a mid-write crash.
    const agentslogContent = await this.repositoryProvider.readFile(
      project.docsPath,
      DOCUMENT_FILENAMES.AGENTSLOG,
    );
    const timestampIso = new Date().toISOString();
    const requesterName = actor?.displayName ?? 'system';
    let updatedAgentslog: string | null;
    if (isSkillRoadmap(roadmapContent)) {
      // The latest skill's ledger knows three states and its `check` rejects
      // anything else (Roadmap GAP-37b); an event with no state writes none.
      const assignee = task.assigneeActorId
        ? await tx.actor.findUnique({ where: { id: task.assigneeActorId } })
        : null;
      const entries = skillLedgerEntries({
        trigger,
        timestampIso,
        taskExternalId: externalId,
        title: task.title,
        requesterName,
        assigneeName: assignee?.displayName ?? null,
        history: this.agentslogParser
          .parse(agentslogContent)
          .entries.filter((entry) => entry.taskExternalId === externalId),
      });
      updatedAgentslog = entries.length
        ? entries.reduce(
            (content, entry) => appendAgentslogEntry(content, entry),
            agentslogContent,
          )
        : null;
    } else {
      updatedAgentslog = appendAgentslogEntry(agentslogContent, {
        timestampIso,
        agentName: requesterName,
        taskExternalId: externalId,
        statusWord: statusWordFor(trigger),
        summary: summaryFor(trigger, task.title),
        files: '—',
        verify: '—',
        followUp: '—',
      });
    }
    if (updatedAgentslog !== null) {
      await this.repositoryProvider.writeFile(
        project.docsPath,
        DOCUMENT_FILENAMES.AGENTSLOG,
        updatedAgentslog,
      );
      await this.recordDocumentRevision(
        tx,
        projectId,
        'AGENTSLOG',
        DOCUMENT_FILENAMES.AGENTSLOG,
        updatedAgentslog,
      );
    }

    // Steps 4-6: Roadmap row, in whichever table already holds it (Roadmap
    // GAP-19) — falling back to Active only for a brand-new row.
    const roadmapDocument = await tx.document.findUnique({
      where: { projectId_kind: { projectId, kind: 'ROADMAP' } },
    });
    const currentHash = createHash('sha256')
      .update(roadmapContent)
      .digest('hex');

    if (
      roadmapDocument?.lastKnownHash &&
      roadmapDocument.lastKnownHash !== currentHash
    ) {
      const { rows } = this.roadmapParser.parseTolerant(roadmapContent);
      const currentRow = rows.find((row) => row.externalId === externalId);
      if (currentRow && rowStatusDiffers(currentRow, task.status)) {
        const conflict = await tx.conflict.create({
          data: {
            projectId,
            kind: 'WRITE_BACK_COLLISION',
            entityType: 'Task',
            entityId: task.id,
            localVersion: { status: task.status } as Prisma.InputJsonValue,
            externalVersion: {
              status: currentRow.statusMapped,
            } as Prisma.InputJsonValue,
          },
        });
        await this.audit.recordConflictDetected(conflict, 'SYSTEM', tx);
        await this.audit.record(
          {
            projectId,
            actorId: requesterActorId,
            entityType: 'Task',
            entityId: task.id,
            operation: 'WRITE_BACK_AGENTSLOG_ONLY',
            origin: 'UI',
            newValue: { trigger },
          },
          tx,
        );
        return task;
      }
    }

    // The Owner cell reflects the task's assignee, not whoever triggered
    // this write-back (docs/synchronization.md step 4) — those are often
    // different actors (e.g. an OWNER reassigning locked work to someone
    // else writes the new assignee's name, not their own).
    const assignee = task.assigneeActorId
      ? await tx.actor.findUnique({ where: { id: task.assigneeActorId } })
      : null;
    const owner: RoadmapOwner | null = assignee
      ? { name: assignee.displayName, kind: assignee.kind }
      : null;
    // Fetched fresh rather than carried on `task` (Roadmap GAP-22): a
    // lifecycle write-back must render the task's actual current
    // dependencies, not blank the cell — this row already exists, so the
    // document may well have a "Depends on" value a status change etc.
    // must not silently erase.
    const dependencies = await tx.taskDependency.findMany({
      where: { taskId: task.id },
      include: { dependsOnTask: { select: { externalId: true } } },
    });
    const hierarchy = await this.hierarchyRef(tx, task);
    const updatedRoadmap = upsertLifecycleRoadmapRow(
      roadmapContent,
      externalId,
      {
        outcome: task.title,
        acceptanceCheck: task.acceptanceCriteria ?? '',
        status: task.status, // verbatim Kanban state (ADR-002) — never mapped back to TODO/DONE
        owner,
        dependsOn: renderDependsOnCell(dependencies),
        priority: task.priority,
        progress: task.progressPercent,
        parent: hierarchy?.ref ?? null,
        subtask: hierarchy?.underTask ?? false,
      },
    );
    await this.repositoryProvider.writeFile(
      project.docsPath,
      DOCUMENT_FILENAMES.ROADMAP,
      updatedRoadmap,
    );
    await this.recordDocumentRevision(
      tx,
      projectId,
      'ROADMAP',
      DOCUMENT_FILENAMES.ROADMAP,
      updatedRoadmap,
    );

    // The row now on disk is exactly what PM Hub just rendered, so it becomes
    // the task's last known external version: sync must not mistake our own
    // write for a document-side change, nor this task's earlier UI edits
    // (already reflected in the row) for still-contested ones.
    const writtenRow = this.roadmapParser
      .parseTolerant(updatedRoadmap)
      .rows.find((row) => row.externalId === externalId);
    if (writtenRow) {
      task = await tx.task.update({
        where: { id: task.id },
        data: {
          lastSyncedContentHash: rowContentHash(writtenRow),
          lastSyncedAt: new Date(),
          rawOwner: writtenRow.rawOwner ?? null,
        },
      });
    }

    await this.audit.record(
      {
        projectId,
        actorId: requesterActorId,
        entityType: 'Task',
        entityId: task.id,
        operation: 'WRITE_BACK',
        origin: 'UI',
        newValue: { trigger },
      },
      tx,
    );

    return task;
  }

  private async recordDocumentRevision(
    tx: Prisma.TransactionClient,
    projectId: string,
    kind: DocumentKind,
    filePath: string,
    content: string,
  ) {
    const hash = createHash('sha256').update(content).digest('hex');
    const document = await tx.document.upsert({
      where: { projectId_kind: { projectId, kind } },
      update: {},
      create: { projectId, kind, filePath },
    });
    await tx.documentRevision.create({
      data: {
        documentId: document.id,
        contentHash: hash,
        rawContent: content,
        source: 'UI',
      },
    });
    await tx.document.update({
      where: { id: document.id },
      data: { lastKnownHash: hash, lastSyncedAt: new Date() },
    });
  }
}

function statusWordFor(trigger: WriteBackTrigger): string {
  switch (trigger) {
    case 'CREATED':
      return 'CREATED';
    case 'STATUS_EN_DESARROLLO':
      return 'IN_PROGRESS';
    case 'STATUS_TERMINADA':
      return 'DONE';
    case 'LOCKED_REASSIGN':
      return 'REASSIGNED';
  }
}

function summaryFor(trigger: WriteBackTrigger, title: string): string {
  switch (trigger) {
    case 'CREATED':
      return `Created: ${title}`;
    case 'STATUS_EN_DESARROLLO':
      return `Started: ${title}`;
    case 'STATUS_TERMINADA':
      return `Completed: ${title}`;
    case 'LOCKED_REASSIGN':
      return `Reassigned while in progress: ${title}`;
  }
}

/**
 * A task's full dependency set as a "Depends on" cell value — each
 * dependency by its resolved target's externalId, or its rawExternalRef when
 * unresolved. Sorted so the cell is stable across writes regardless of the
 * order dependencies were added in (avoids a spurious diff on every add).
 */
function renderDependsOnCell(
  dependencies: (TaskDependency & {
    dependsOnTask: { externalId: string | null } | null;
  })[],
): string {
  const ids = dependencies
    .map((d) => d.dependsOnTask?.externalId ?? d.rawExternalRef)
    .filter((id): id is string => Boolean(id))
    .sort();
  return ids.length > 0 ? ids.join(', ') : '—';
}
