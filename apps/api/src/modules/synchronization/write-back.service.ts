import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { DocumentKind, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { RoadmapParserService } from '../roadmap/roadmap-parser.service.js';
import { rowContentHash } from './row-content-hash.util.js';
import { appendAgentslogEntry } from '../roadmap/agentslog-writer.util.js';
import {
  removeRoadmapRow,
  replaceRoadmapRowCells,
  sanitizeField,
  upsertLifecycleRoadmapRow,
} from '../roadmap/roadmap-row-writer.util.js';
import { PROJECT_REPOSITORY_PROVIDER } from '../git-providers/project-repository-provider.interface.js';
import type { ProjectRepositoryProvider } from '../git-providers/project-repository-provider.interface.js';

export type WriteBackTrigger =
  'CREATED' | 'STATUS_EN_DESARROLLO' | 'STATUS_TERMINADA' | 'LOCKED_REASSIGN';

/** Pre-edit values of the Roadmap-backed fields a UI edit just changed; absent keys were not changed. */
export interface RoadmapFieldEdit {
  title?: string;
  acceptanceCriteria?: string | null;
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
    private readonly audit: AuditService,
  ) {}

  async recordTaskEvent(
    projectId: string,
    taskId: string,
    trigger: WriteBackTrigger,
    requesterActorId: string,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${projectId}))`;
        return this.writeBackLocked(
          tx,
          projectId,
          taskId,
          trigger,
          requesterActorId,
        );
      },
      { timeout: 20000, maxWait: 10000 },
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
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${projectId}))`;
        return this.fieldEditLocked(
          tx,
          projectId,
          taskId,
          previous,
          requesterActorId,
        );
      },
      { timeout: 20000, maxWait: 10000 },
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
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${projectId}))`;
        return this.removalLocked(tx, projectId, taskId, requesterActorId);
      },
      { timeout: 20000, maxWait: 10000 },
    );
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

    const roadmapContent = await this.repositoryProvider.readFile(
      project.docsPath,
      DOCUMENT_FILENAMES.ROADMAP,
    );
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
      .parse(roadmapContent)
      .find((row) => row.externalId === externalId);
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
      const before = sanitizeField(previous[edit.field] ?? '');
      if (drifted && (edit.current ?? '') !== before) {
        deferred.push(edit.field);
        continue;
      }
      cells[edit.header] = edit.next;
    }

    const written =
      Object.keys(cells).length > 0
        ? replaceRoadmapRowCells(roadmapContent, externalId, cells)
        : null;
    if (!written || written.replaced.length === 0) {
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
      written.markdown,
    );
    await this.recordDocumentRevision(
      tx,
      projectId,
      'ROADMAP',
      DOCUMENT_FILENAMES.ROADMAP,
      written.markdown,
    );

    // The written row becomes the baseline only if the row carried no
    // unreconciled document-side change: otherwise sync must still see — and
    // apply or contest — what the document changed in the row's other cells.
    let result = task;
    const writtenRow = this.roadmapParser
      .parse(written.markdown)
      .find((row) => row.externalId === externalId);
    if (
      writtenRow &&
      deferred.length === 0 &&
      task.lastSyncedContentHash === rowContentHash(currentRow)
    ) {
      result = await tx.task.update({
        where: { id: task.id },
        data: {
          lastSyncedContentHash: rowContentHash(writtenRow),
          lastSyncedAt: new Date(),
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
          fields: edits
            .filter((edit) => written.replaced.includes(edit.header))
            .map((edit) => edit.field),
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

    // Step 3: Agentslog entry appended first — preserves "a terminal log
    // entry exists before a row can vanish" even across a mid-write crash.
    const agentslogContent = await this.repositoryProvider.readFile(
      project.docsPath,
      DOCUMENT_FILENAMES.AGENTSLOG,
    );
    const updatedAgentslog = appendAgentslogEntry(agentslogContent, {
      timestampIso: new Date().toISOString(),
      agentName: actor?.displayName ?? 'system',
      taskExternalId: externalId,
      statusWord: statusWordFor(trigger),
      summary: summaryFor(trigger, task.title),
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

    // Steps 4-6: Roadmap row, in whichever table already holds it (Roadmap
    // GAP-19) — falling back to Active only for a brand-new row.
    const roadmapContent = await this.repositoryProvider.readFile(
      project.docsPath,
      DOCUMENT_FILENAMES.ROADMAP,
    );
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
      const rows = this.roadmapParser.parse(roadmapContent);
      const currentRow = rows.find((row) => row.externalId === externalId);
      if (
        currentRow?.statusMapped &&
        String(currentRow.statusMapped) !== String(task.status)
      ) {
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
    const ownerCell =
      assignee?.kind === 'AI_AGENT'
        ? `${assignee.displayName}@${new Date().toISOString()}`
        : (assignee?.displayName ?? '');
    const updatedRoadmap = upsertLifecycleRoadmapRow(
      roadmapContent,
      externalId,
      {
        outcome: task.title,
        acceptanceCheck: task.acceptanceCriteria ?? '',
        status: task.status, // verbatim Kanban state (ADR-002) — never mapped back to TODO/DONE
        owner: ownerCell,
        dependsOn: '—',
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
      .parse(updatedRoadmap)
      .find((row) => row.externalId === externalId);
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
