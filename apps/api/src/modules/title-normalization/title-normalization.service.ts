import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { LlmRuntimeConfig } from '../llm/llm.types.js';
import {
  LLM_SETTINGS_READY_EVENT,
  LlmSettingsService,
} from '../settings/llm-settings.service.js';
import { TitleNormalizer } from './title-normalizer.service.js';
import { needsNormalization } from './word-count.util.js';

/** Tasks read per round, and rounds per run: a run is bounded, the rest waits for the next one. */
const BATCH_SIZE = 20;
const MAX_ROUNDS = 10;

/**
 * Calls in flight at once within a project (Roadmap BUG-14). A free model takes
 * 10 to 50 seconds per answer, so one at a time left a Roadmap unadapted for
 * hours after a sync; a few at a time stay far from any provider's rate limit.
 */
export const NORMALIZATION_CONCURRENCY = 4;

/**
 * How many failures in a row a task may have for the syncs that follow to try it
 * again by themselves (Roadmap BUG-14): a failure is rarely about the task, and
 * a bound keeps one that always fails from being paid for at every sync. A
 * person's retry and a new configuration start the count again.
 */
export const MAX_AUTOMATIC_ATTEMPTS = 3;

/**
 * Failures that say something about the key or the quota, not about the task
 * (Roadmap BUG-13): the rest of the queue would fail the same way, so a pass stops
 * at the first one and what is left waits, rather than spending a request and a
 * `FAILED` mark on every task.
 */
const STOPS_THE_PASS: ReadonlySet<string> = new Set(['AUTH', 'RATE_LIMIT']);

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
  private everyProject: Promise<void> | null = null;
  private everyProjectAgain = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: LlmSettingsService,
    private readonly normalizer: TitleNormalizer,
    private readonly audit: AuditService,
  ) {}

  /** Returns at once: the sync that emitted this never waits for the LLM. */
  @OnEvent('sync.completed')
  onSyncCompleted(payload: { projectId: string }): void {
    void this.afterSync(payload.projectId);
  }

  /**
   * What a finished sync does (Roadmap BUG-14): the tasks that failed, and have
   * not failed too many times, are tried again with the ones the sync queued, so
   * a Roadmap ends adapted without anyone asking. Never rejects.
   */
  async afterSync(projectId: string): Promise<void> {
    try {
      if ((await this.settings.getRuntimeConfig()) !== null) {
        await this.prisma.task.updateMany({
          where: {
            projectId,
            deletedAt: null,
            titleNormalization: 'FAILED',
            titleNormalizationAttempts: { lt: MAX_AUTOMATIC_ATTEMPTS },
          },
          data: {
            titleNormalization: 'PENDING',
            titleNormalizationError: null,
          },
        });
      }
    } catch (error) {
      this.logger.error(
        `Requeueing the failed titles of project ${projectId} stopped: ${error instanceof Error ? error.name : 'unknown error'}`,
      );
    }
    await this.drain(projectId);
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

  /**
   * The configuration has just become ready (Roadmap BUG-13): every project's
   * failed ones and long titles never queued — the ones read before this was
   * switched on included — are queued and worked, with nobody asking again. One
   * project after another, so a long list does not become a burst of calls; a
   * second signal during a run makes it go round once more.
   */
  @OnEvent(LLM_SETTINGS_READY_EVENT)
  onSettingsReady(): void {
    void this.queueEveryProject();
  }

  queueEveryProject(): Promise<void> {
    if (this.everyProject) {
      this.everyProjectAgain = true;
      return this.everyProject;
    }
    const run = (async () => {
      try {
        do {
          this.everyProjectAgain = false;
          const projects = await this.prisma.project.findMany({
            where: { status: { not: 'ARCHIVED' } },
            select: { id: true },
          });
          for (const project of projects) {
            await this.queueTasks(project.id);
            await this.drain(project.id);
          }
        } while (this.everyProjectAgain);
      } catch (error) {
        this.logger.error(
          `Queueing the long titles stopped: ${error instanceof Error ? error.name : 'unknown error'}`,
        );
      } finally {
        this.everyProject = null;
      }
    })();
    this.everyProject = run;
    return run;
  }

  /** Puts the failed ones and the long titles never queued back in the queue, and works it if the LLM is ready. */
  async queueProject(projectId: string): Promise<QueueResult> {
    const queued = await this.queueTasks(projectId);
    const processing = (await this.settings.getRuntimeConfig()) !== null;
    if (processing) {
      void this.drain(projectId);
    }
    return { ...queued, processing };
  }

  /** What `queueProject` does to the tasks, without working the queue. */
  private async queueTasks(
    projectId: string,
  ): Promise<{ retried: number; queued: number }> {
    const retried = (
      await this.prisma.task.updateMany({
        where: { projectId, deletedAt: null, titleNormalization: 'FAILED' },
        data: {
          titleNormalization: 'PENDING',
          titleNormalizationError: null,
          titleNormalizationAttempts: 0,
        },
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

    return { retried, queued: ids.length };
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
      data: {
        titleNormalization: 'PENDING',
        titleNormalizationError: null,
        titleNormalizationAttempts: 0,
      },
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
      // The first call of a pass goes alone (Roadmap BUG-14): a wrong key or a
      // spent quota costs one call, not one per task in flight. The rest of the
      // batch goes a few at a time, and stops being started once one is refused.
      const state = { paused: false };
      const queue = [...tasks];
      const work = async (task: (typeof tasks)[number]): Promise<void> => {
        seen.add(task.id);
        if (await this.normalizeOne(config, task)) {
          state.paused = true;
        }
      };
      if (round === 0) {
        await work(queue.shift()!);
      }
      const worker = async (): Promise<void> => {
        while (!state.paused) {
          const task = queue.shift();
          if (!task) {
            return;
          }
          await work(task);
        }
      };
      await Promise.all(
        Array.from(
          { length: Math.min(NORMALIZATION_CONCURRENCY, queue.length) },
          worker,
        ),
      );
      if (state.paused) {
        this.logger.warn(
          `Title normalization of project ${projectId} paused: the provider refused the key or the quota; the rest of the queue waits`,
        );
        return;
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
  ): Promise<boolean> {
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
      return false;
    }
    if (outcome.status === 'FAILED') {
      await this.prisma.task.updateMany({
        where: stillThis,
        data: {
          titleNormalization: 'FAILED',
          titleNormalizationError: outcome.message,
          titleNormalizationAttempts: { increment: 1 },
        },
      });
      this.logger.warn(
        `Could not normalize the title of ${task.externalId ?? task.id} (${outcome.kind})`,
      );
      return STOPS_THE_PASS.has(outcome.kind);
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
        titleNormalizationAttempts: 0,
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
    return false;
  }
}
