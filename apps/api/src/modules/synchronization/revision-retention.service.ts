import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import type { EnvConfig } from '../../config/env.validation.js';
import { PrismaService } from '../../prisma/prisma.service.js';

/** Revisions read and deleted per round, so a large backlog never becomes one huge query or statement. */
const BATCH_SIZE = 500;

export interface RetentionResult {
  documents: number;
  deleted: number;
}

/**
 * Every write-back and every changed sync stores a full copy of the document
 * as a DocumentRevision, forever (Roadmap BUG-07c). This keeps the newest
 * `DOCUMENT_REVISION_RETENTION` of each document and deletes the rest — by
 * count, not age, so a document that rarely changes never loses its only
 * history. Nothing holds a foreign key to a revision (the ledger's
 * `sourceDocumentRevisionId` is a plain string nothing reads back, and the
 * dashboard and the revision list only ask for the newest), so trimming the
 * old ones breaks no pointer. Runs daily, off the request path and outside
 * the write-back lock; `0` keeps everything.
 */
@Injectable()
export class RevisionRetentionService {
  private readonly logger = new Logger(RevisionRetentionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  @Cron('0 3 * * *')
  async scheduled(): Promise<void> {
    try {
      const { documents, deleted } = await this.prune();
      if (deleted > 0) {
        this.logger.log(
          `Deleted ${deleted} old document revision(s) across ${documents} document(s)`,
        );
      }
    } catch (error) {
      this.logger.error(`Revision retention failed: ${String(error)}`);
    }
  }

  /**
   * `keep` overrides the configured count and `projectId` limits the run to
   * one project's documents (for tests and one-off runs).
   */
  async prune(
    options: { keep?: number; projectId?: string } = {},
  ): Promise<RetentionResult> {
    const keep: number =
      options.keep ??
      this.config.getOrThrow('DOCUMENT_REVISION_RETENTION', { infer: true });
    if (keep <= 0) {
      return { documents: 0, deleted: 0 };
    }
    const documents = await this.prisma.document.findMany({
      where: options.projectId ? { projectId: options.projectId } : {},
      select: { id: true },
    });
    let deleted = 0;
    let touched = 0;
    for (const { id: documentId } of documents) {
      const removed = await this.pruneDocument(documentId, keep);
      deleted += removed;
      if (removed > 0) {
        touched += 1;
      }
    }
    return { documents: touched, deleted };
  }

  private async pruneDocument(
    documentId: string,
    keep: number,
  ): Promise<number> {
    let deleted = 0;
    for (;;) {
      // Everything past the newest `keep`; deleting a batch moves the next
      // stale ones up to the same offset, so the loop ends when none are left.
      const stale = await this.prisma.documentRevision.findMany({
        where: { documentId },
        orderBy: [{ capturedAt: 'desc' }, { id: 'desc' }],
        skip: keep,
        take: BATCH_SIZE,
        select: { id: true },
      });
      if (stale.length === 0) {
        return deleted;
      }
      const result = await this.prisma.documentRevision.deleteMany({
        where: { id: { in: stale.map((revision) => revision.id) } },
      });
      deleted += result.count;
    }
  }
}
