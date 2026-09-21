import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  AgentslogParserService,
  ParsedAgentLogEntry,
} from '../roadmap/agentslog-parser.service.js';
import { PROJECT_REPOSITORY_PROVIDER } from '../git-providers/project-repository-provider.interface.js';
import type { ProjectRepositoryProvider } from '../git-providers/project-repository-provider.interface.js';

/** Extensible, not hardcoded forever (docs/synchronization.md step 6). */
export const TERMINAL_STATUS_WORDS = ['DONE'];

/**
 * The places a `## Previous segment` pointer can name its archive (Roadmap
 * BUG-09): as written, and without a leading `docs/`. The latest skill's rotate
 * writes the path from the repository root (`docs/history/Agentslog-...md`),
 * while the project's files are read relative to its docs folder, where that
 * archive is `history/Agentslog-...md`.
 */
export function archiveCandidates(archivePath: string): string[] {
  const written = archivePath.trim().replaceAll('\\', '/').replace(/^\.\//, '');
  const fromDocs = written.replace(/^docs\//, '');
  return fromDocs === written ? [written] : [written, fromDocs];
}

/**
 * Parses Agentslog.md, following a `## Previous segment` rotation pointer
 * exactly once and verifying its SHA-256 before trusting it (the
 * disappeared-row hazard in docs/synchronization.md step 6 depends on this
 * — a DONE entry that rotated out before its Roadmap row vanished must
 * still be found). Deferred in FASE-06 by design; this is where it lands.
 */
@Injectable()
export class AgentslogIngestionService {
  constructor(
    private readonly parser: AgentslogParserService,
    @Inject(PROJECT_REPOSITORY_PROVIDER)
    private readonly repositoryProvider: ProjectRepositoryProvider,
  ) {}

  async parseWithArchive(
    docsPath: string,
    hotContent: string,
  ): Promise<ParsedAgentLogEntry[]> {
    const hot = this.parser.parse(hotContent);
    if (!hot.previousSegment) {
      return hot.entries;
    }

    const archiveContent = await this.readArchive(
      docsPath,
      hot.previousSegment.archivePath,
    );
    if (archiveContent === null) {
      // Archive referenced but unreadable — proceed with the hot log only
      // rather than failing the whole sync over a missing history file.
      return hot.entries;
    }

    const actualHash = createHash('sha256')
      .update(archiveContent)
      .digest('hex');
    if (actualHash !== hot.previousSegment.sha256) {
      // "verifying its hash before trusting its content" — a mismatch means
      // don't trust it; fall back to hot-log-only rather than ingest
      // possibly-tampered-with or corrupted history.
      return hot.entries;
    }

    const archived = this.parser.parse(archiveContent);
    return [...hot.entries, ...archived.entries];
  }

  /** The archive under whichever of its possible paths is readable, or null. */
  private async readArchive(
    docsPath: string,
    archivePath: string,
  ): Promise<string | null> {
    for (const candidate of archiveCandidates(archivePath)) {
      try {
        return await this.repositoryProvider.readFile(docsPath, candidate);
      } catch {
        // Try the next place it can be.
      }
    }
    return null;
  }

  /** Idempotent via the rawEntryHash unique constraint. */
  async ingest(
    tx: Prisma.TransactionClient,
    projectId: string,
    entries: ParsedAgentLogEntry[],
    sourceDocumentRevisionId: string,
  ): Promise<void> {
    for (const entry of entries) {
      const existing = await tx.agentLogEvent.findUnique({
        where: {
          projectId_rawEntryHash: {
            projectId,
            rawEntryHash: entry.rawEntryHash,
          },
        },
      });
      if (existing) {
        continue;
      }

      const task = await tx.task.findFirst({
        where: { projectId, externalId: entry.taskExternalId },
        select: { id: true },
      });

      await tx.agentLogEvent.create({
        data: {
          projectId,
          taskExternalId: entry.taskExternalId,
          taskId: task?.id,
          agentName: entry.agentName,
          timestampFromLog: new Date(entry.timestampFromLog),
          statusWord: entry.statusWord,
          summary: entry.summary,
          files: entry.files,
          verify: entry.verify,
          followUp: entry.followUp,
          rawEntryHash: entry.rawEntryHash,
          sourceDocumentRevisionId,
        },
      });
    }
  }

  async hasTerminalEntry(
    tx: Prisma.TransactionClient,
    projectId: string,
    taskExternalId: string,
  ): Promise<boolean> {
    const count = await tx.agentLogEvent.count({
      where: {
        projectId,
        taskExternalId,
        statusWord: { in: TERMINAL_STATUS_WORDS },
      },
    });
    return count > 0;
  }
}
