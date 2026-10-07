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
import {
  TitleNormalizer,
  type NormalizationOutcome,
} from './title-normalizer.service.js';
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

/** A task with what the prompt needs about where it sits. */
type QueuedTask = Prisma.TaskGetPayload<{
  include: {
    phase: { select: { name: true } };
    epic: { select: { name: true } };
  };
}>;

/** How a pass is going: how many calls it may have in flight, how many are, and whether it stopped. */
interface PassFlow {
  limit: number;
  running: number;
  /** Calls started so far: tells whether another one began during a call. */
  started: number;
  paused: boolean;
}

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
    const flow: PassFlow = {
      limit: NORMALIZATION_CONCURRENCY,
      running: 0,
      started: 0,
      paused: false,
    };
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
      await this.workBatch(config, tasks, seen, flow, round === 0);
      if (flow.paused) {
        this.logger.warn(
          `Title normalization of project ${projectId} paused: the provider refused the key or the quota; the rest of the queue waits`,
        );
        return;
      }
    }
  }

  /**
   * Works one batch a few calls at a time (Roadmap BUG-14). The first call of a
   * pass goes alone, so a wrong key or a spent quota costs one call, not one per
   * task in flight.
   *
   * A refusal of the quota or the balance that arrives while other calls were in
   * flight may be their doing — OpenRouter reserves credits for every request in
   * flight and answers 402 "retry after in-flight requests settle" — so it does
   * not fail the task: the pass goes one call at a time from then on and the task
   * takes its turn again. Only a refusal that reaches a call that was alone
   * pauses the pass.
   */
  private async workBatch(
    config: LlmRuntimeConfig,
    tasks: QueuedTask[],
    seen: Set<string>,
    flow: PassFlow,
    probeFirst: boolean,
  ): Promise<void> {
    const queue = [...tasks];
    const work = async (task: QueuedTask): Promise<void> => {
      // One at a time means one: the calls still in flight from before settle first.
      while (flow.limit === 1 && flow.running > 0) {
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      seen.add(task.id);
      const startedWith = flow.running;
      const marker = flow.started;
      flow.running += 1;
      flow.started += 1;
      let outcome: NormalizationOutcome;
      try {
        outcome = await this.normalizer.normalize(config, {
          externalId: task.externalId,
          entryType: task.entryType,
          title: task.title,
          description: task.description,
          acceptanceCriteria: task.acceptanceCriteria,
          phase: task.phase?.name,
          epic: task.epic?.name,
        });
      } finally {
        flow.running -= 1;
      }
      if (outcome.status === 'FAILED' && STOPS_THE_PASS.has(outcome.kind)) {
        const overlapped = startedWith > 0 || flow.started - marker > 1;
        if (overlapped) {
          if (flow.limit > 1) {
            this.logger.warn(
              'The provider refused while several calls were in flight; going one call at a time',
            );
          }
          flow.limit = 1;
          seen.delete(task.id);
          queue.unshift(task);
          return;
        }
        flow.paused = true;
      }
      await this.record(task, outcome);
    };

    if (probeFirst && queue.length > 0) {
      await work(queue.shift()!);
    }
    const worker = async (index: number): Promise<void> => {
      while (!flow.paused && index < flow.limit) {
        const task = queue.shift();
        if (!task) {
          return;
        }
        await work(task);
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(flow.limit, queue.length) }, (_, index) =>
        worker(index),
      ),
    );
  }

  /** Writes what normalizing a task came to. */
  private async record(
    task: QueuedTask,
    outcome: NormalizationOutcome,
  ): Promise<void> {
    const sourceTitle = task.title;
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
          // A refusal about the key, the quota or the balance is not about this
          // task: it does not spend one of its automatic attempts (Roadmap BUG-16).
          titleNormalizationAttempts: {
            increment: STOPS_THE_PASS.has(outcome.kind) ? 0 : 1,
          },
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
  }
}
