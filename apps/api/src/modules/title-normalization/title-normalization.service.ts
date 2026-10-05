import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { LlmRuntimeConfig } from '../llm/llm.types.js';
import { LlmSettingsService } from '../settings/llm-settings.service.js';
import { TitleNormalizer } from './title-normalizer.service.js';
import { needsNormalization } from './word-count.util.js';

/** Tasks read per round, and rounds per run: a run is bounded, the rest waits for the next one. */
const BATCH_SIZE = 20;
const MAX_ROUNDS = 10;

export interface QueueResult {
  /** Failed ones put back in the queue. */
  retried: number;
  /** Long titles that had never been queued (read before this feature, or never normalized). */
  queued: number;
  /** Whether the LLM is configured and enabled, so the queue is being worked now; false leaves it waiting. */
  processing: boolean;
}

/**
 * Works the queue of long Roadmap titles (Roadmap GAP-39d). Sync only marks a
 * task `PENDING` — it holds the project's lock for its whole transaction, so no
 * network call can happen there — and this service takes over once the sync has
 * committed. The database is the queue: a restart loses nothing, and a task
 * that is still `PENDING` is simply worked on the next run.
 *
 * Whatever happens here is invisible to the sync: it runs after the sync's own
 * result is settled, on its own, and never throws into it. One run per project
 * at a time; a request that arrives during a run makes it go round once more.
 */
@Injectable()
export class TitleNormalizationService {
  private readonly logger = new Logger(TitleNormalizationService.name);
  private readonly inFlight = new Map<string, Promise<void>>();
  private readonly requeued = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: LlmSettingsService,
    private readonly normalizer: TitleNormalizer,
    private readonly audit: AuditService,
  ) {}

  /** Returns at once: the sync that emitted this never waits for the LLM. */
  @OnEvent('sync.completed')
  onSyncCompleted(payload: { projectId: string }): void {
    void this.drain(payload.projectId);
  }

  /**
   * Works the project's queue until it is empty (or the run's bound is hit).
   * Never rejects. A call during a run joins it and asks for another round.
   */
  drain(projectId: string): Promise<void> {
    const running = this.inFlight.get(projectId);
    if (running) {
      this.requeued.add(projectId);
      return running;
    }
    const run = (async () => {
      try {
        do {
          this.requeued.delete(projectId);
          await this.drainOnce(projectId);
        } while (this.requeued.has(projectId));
      } catch (error) {
        // Nothing here can carry the API key: errors from a provider are
        // sanitized where they are made, and the rest does not touch it.
        this.logger.error(
          `Title normalization of project ${projectId} stopped: ${error instanceof Error ? error.name : 'unknown error'}`,
        );
      } finally {
        this.inFlight.delete(projectId);
      }
    })();
    this.inFlight.set(projectId, run);
    return run;
  }

  /** Puts the failed ones and the long titles never queued back in the queue, and works it if the LLM is ready. */
  async queueProject(projectId: string): Promise<QueueResult> {
    const retried = (
      await this.prisma.task.updateMany({
        where: { projectId, deletedAt: null, titleNormalization: 'FAILED' },
        data: { titleNormalization: 'PENDING', titleNormalizationError: null },
      })
    ).count;

    const unqueued = await this.prisma.task.findMany({
      where: {
        projectId,
        deletedAt: null,
        sourceOrigin: 'ROADMAP',
        titleNormalization: null,
        originalTitle: null,
      },
      select: { id: true, title: true },
    });
    const ids = unqueued
      .filter((task) => needsNormalization(task.title))
      .map((task) => task.id);
    if (ids.length > 0) {
      await this.prisma.task.updateMany({
        where: { id: { in: ids }, titleNormalization: null },
        data: { titleNormalization: 'PENDING' },
      });
    }

    const processing = (await this.settings.getRuntimeConfig()) !== null;
    if (processing) {
      void this.drain(projectId);
    }
    return { retried, queued: ids.length, processing };
  }

  /** Asks for one task's normalization again (a failed one, or a long title never queued). A normalized task is left as it is. */
  async retryTask(
    projectId: string,
    taskId: string,
  ): Promise<{ queued: boolean; processing: boolean }> {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, projectId, deletedAt: null },
      select: {
        id: true,
        title: true,
        sourceOrigin: true,
        originalTitle: true,
        titleNormalization: true,
      },
    });
    if (!task) {
      throw new NotFoundException('Task not found');
    }
    const eligible =
      task.titleNormalization === 'FAILED' ||
      task.titleNormalization === 'PENDING' ||
      (task.titleNormalization === null &&
        task.originalTitle === null &&
        task.sourceOrigin === 'ROADMAP' &&
        needsNormalization(task.title));
    if (!eligible) {
      return { queued: false, processing: false };
    }
    await this.prisma.task.updateMany({
      where: { id: task.id, originalTitle: null },
      data: { titleNormalization: 'PENDING', titleNormalizationError: null },
    });
    const processing = (await this.settings.getRuntimeConfig()) !== null;
    if (processing) {
      void this.drain(projectId);
    }
    return { queued: true, processing };
  }

  private async drainOnce(projectId: string): Promise<void> {
    const config = await this.settings.getRuntimeConfig();
    if (!config) {
      // Not configured, not enabled or unreadable: the queue waits.
      return;
    }
    const seen = new Set<string>();
    for (let round = 0; round < MAX_ROUNDS; round += 1) {
      const tasks = await this.prisma.task.findMany({
        where: {
          projectId,
          deletedAt: null,
          titleNormalization: 'PENDING',
          id: { notIn: [...seen] },
        },
        orderBy: { createdAt: 'asc' },
        take: BATCH_SIZE,
        include: {
          phase: { select: { name: true } },
          epic: { select: { name: true } },
        },
      });
      if (tasks.length === 0) {
        return;
      }
      for (const task of tasks) {
        seen.add(task.id);
        await this.normalizeOne(config, task);
      }
    }
  }

  private async normalizeOne(
    config: LlmRuntimeConfig,
    task: Prisma.TaskGetPayload<{
      include: {
        phase: { select: { name: true } };
        epic: { select: { name: true } };
      };
    }>,
  ): Promise<void> {
    const sourceTitle = task.title;
    const outcome = await this.normalizer.normalize(config, {
      externalId: task.externalId,
      entryType: task.entryType,
      title: sourceTitle,
      description: task.description,
      acceptanceCriteria: task.acceptanceCriteria,
      phase: task.phase?.name,
      epic: task.epic?.name,
    });
    // Applied only over the very title that was normalized and only while it is
    // still queued: if the document changed it meanwhile, this answer is for a
    // title that no longer exists and is dropped.
    const stillThis: Prisma.TaskWhereInput = {
      id: task.id,
      deletedAt: null,
      title: sourceTitle,
      originalTitle: null,
      titleNormalization: 'PENDING',
    };

    if (outcome.status === 'SKIPPED') {
      await this.prisma.task.updateMany({
        where: stillThis,
        data: { titleNormalization: null },
      });
      return;
    }
    if (outcome.status === 'FAILED') {
      await this.prisma.task.updateMany({
        where: stillThis,
        data: {
          titleNormalization: 'FAILED',
          titleNormalizationError: outcome.message,
        },
      });
      this.logger.warn(
        `Could not normalize the title of ${task.externalId ?? task.id} (${outcome.kind})`,
      );
      return;
    }

    // A description a person wrote is never replaced; the system's own is.
    const descriptionIsFree =
      !task.description?.trim() ||
      task.description === task.generatedDescription;
    const { count } = await this.prisma.task.updateMany({
      where: stillThis,
      data: {
        originalTitle: sourceTitle,
        title: outcome.title,
        titleNormalization: 'DONE',
        titleNormalizedAt: new Date(),
        titleNormalizationError: null,
        ...(descriptionIsFree
          ? {
              description: outcome.description,
              generatedDescription: outcome.description,
            }
          : {}),
      },
    });
    if (count === 1) {
      await this.audit.record({
        projectId: task.projectId,
        entityType: 'Task',
        entityId: task.id,
        operation: 'TITLE_NORMALIZE',
        // Never UI or API: the reconciler counts those as a person's edit.
        origin: 'SYSTEM',
        previousValue: { title: sourceTitle },
        newValue: {
          title: outcome.title,
          ...(outcome.truncatedLocally ? { truncatedLocally: true } : {}),
        },
      });
    }
  }
}
