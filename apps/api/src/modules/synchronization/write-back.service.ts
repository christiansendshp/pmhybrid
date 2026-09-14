import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { DocumentKind, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { RoadmapParserService } from '../roadmap/roadmap-parser.service.js';
import { appendAgentslogEntry } from '../roadmap/agentslog-writer.util.js';
import { upsertActiveRoadmapRow } from '../roadmap/roadmap-row-writer.util.js';
import { PROJECT_REPOSITORY_PROVIDER } from '../git-providers/project-repository-provider.interface.js';
import type { ProjectRepositoryProvider } from '../git-providers/project-repository-provider.interface.js';

export type WriteBackTrigger =
  'CREATED' | 'STATUS_EN_DESARROLLO' | 'STATUS_TERMINADA' | 'LOCKED_REASSIGN';

const DOCUMENT_FILENAMES: Record<'ROADMAP' | 'AGENTSLOG', string> = {
  ROADMAP: 'Roadmap.md',
  AGENTSLOG: 'Agentslog.md',
};

/**
 * Postgres -> Documents write-back (docs/synchronization.md). Only a
 * curated subset of task lifecycle events triggers it — everything else
 * (title edits, hierarchy moves) stays UI-only, to avoid ledger-rotation
 * churn from fine-grained activity. Runs under the same
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

    // Steps 4-6: Roadmap row (Active table only — see module docstring).
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
        await tx.conflict.create({
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
        await tx.auditEvent.create({
          data: {
            actorId: requesterActorId,
            entityType: 'Task',
            entityId: task.id,
            operation: 'WRITE_BACK_AGENTSLOG_ONLY',
            origin: 'UI',
            newValue: { trigger } as Prisma.InputJsonValue,
          },
        });
        return task;
      }
    }

    const ownerCell =
      actor?.kind === 'AI_AGENT'
        ? `${actor.displayName}@${new Date().toISOString()}`
        : (actor?.displayName ?? '');
    const updatedRoadmap = upsertActiveRoadmapRow(roadmapContent, externalId, {
      outcome: task.title,
      acceptanceCheck: task.acceptanceCriteria ?? '',
      status: task.status, // verbatim Kanban state (ADR-002) — never mapped back to TODO/DONE
      owner: ownerCell,
      dependsOn: '—',
    });
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

    await tx.auditEvent.create({
      data: {
        actorId: requesterActorId,
        entityType: 'Task',
        entityId: task.id,
        operation: 'WRITE_BACK',
        origin: 'UI',
        newValue: { trigger } as Prisma.InputJsonValue,
      },
    });

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
