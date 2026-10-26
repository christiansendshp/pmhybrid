import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { AgentLedgerLinkService } from '../agents/agent-ledger-link.service.js';
import { classifyLedgerWord } from '../roadmap/ledger-status.util.js';
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
    private readonly agentLinks: AgentLedgerLinkService,
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
    // Marked, so a reader of "the latest entry of a task" knows the hot ledger's come after these.
    return [
      ...hot.entries,
      ...archived.entries.map((entry) => ({
        ...entry,
        archived: true as const,
      })),
    ];
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
    // Which agent each name is (Roadmap TASK-02), decided once for the run.
    const agents = await this.agentLinks.resolve(
      entries.map((entry) => entry.agentName),
      tx,
    );
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

      const word = classifyLedgerWord(entry.statusWord);
      await tx.agentLogEvent.create({
        data: {
          projectId,
          taskExternalId: entry.taskExternalId,
          taskId: task?.id,
          agentName: entry.agentName,
          agentActorId: agents.get(entry.agentName) ?? null,
          timestampFromLog: new Date(entry.timestampFromLog),
          statusWord: entry.statusWord,
          canonicalStatus: word.canonicalStatus,
          statusQualifier: word.qualifier,
          handoffTo: entry.handoff ?? null,
          reviewResult: entry.review ?? null,
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

  /**
   * Takes the Name off the status word of the entries stored with it (Roadmap BUG-18). Until the parser read
   * `DONE | Name` as the word `DONE` (TASK-26) such an entry was stored whole, so BR-003's terminal check,
   * which is the exact word, never saw a task closed with the latest skill's `done`. It looks at each
   * distinct word once and a second run changes nothing. Returns how many entries it set.
   */
  async normalizeStatusWords(
    tx: Prisma.TransactionClient,
    projectId: string,
  ): Promise<number> {
    const named = await tx.agentLogEvent.groupBy({
      by: ['statusWord'],
      where: { projectId, statusWord: { contains: ' | ' } },
    });
    let set = 0;
    for (const { statusWord } of named) {
      const word = statusWord.split(' | ')[0].trim();
      const classified = classifyLedgerWord(word);
      const { count } = await tx.agentLogEvent.updateMany({
        where: { projectId, statusWord },
        data: {
          statusWord: word,
          canonicalStatus: classified.canonicalStatus,
          statusQualifier: classified.qualifier,
        },
      });
      set += count;
    }
    return set;
  }

  /**
   * Gives the entries that were read before their word was classified, or whose word was not known
   * then, the canonical status and qualifier of their word (Roadmap TASK-06). It looks at each
   * distinct word once, so it costs a handful of statements however long the ledger is, and a
   * second run changes nothing; a word that is still unknown stays null. Returns how many it set.
   */
  async classifyUnclassified(
    tx: Prisma.TransactionClient,
    projectId: string,
  ): Promise<number> {
    const unclassified = await tx.agentLogEvent.groupBy({
      by: ['statusWord'],
      where: { projectId, canonicalStatus: null },
    });
    let set = 0;
    for (const { statusWord } of unclassified) {
      const word = classifyLedgerWord(statusWord);
      if (word.canonicalStatus === null) {
        continue;
      }
      const { count } = await tx.agentLogEvent.updateMany({
        where: { projectId, statusWord, canonicalStatus: null },
        data: {
          canonicalStatus: word.canonicalStatus,
          statusQualifier: word.qualifier,
        },
      });
      set += count;
    }
    return set;
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
