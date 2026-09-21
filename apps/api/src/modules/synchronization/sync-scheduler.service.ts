import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { EnvConfig } from '../../config/env.validation.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { SynchronizationService } from './synchronization.service.js';

/** Longest a failing project waits between attempts, as a multiple of its interval. */
const MAX_BACKOFF_FACTOR = 16;
/** Enough history to see a streak up to the cap (2^4 = 16). */
const FAILURE_STREAK_WINDOW = 5;

/**
 * Scheduled trigger (docs/synchronization.md "Trigger"): every minute,
 * sync any active project where now - lastSyncedAt >= syncIntervalMinutes.
 * "lastSyncedAt" has no dedicated Project column — derived from the most
 * recent SyncRun per project (never-synced = always due). Turned off with
 * SYNC_SCHEDULER_ENABLED=false; manual sync is unaffected.
 *
 * A project whose sync keeps failing backs off (Roadmap BUG-05): each
 * consecutive failure doubles the wait, up to `MAX_BACKOFF_FACTOR` x the
 * interval, so a project that fails the same way every time is retried
 * less and less rather than every interval forever. A success or a manual
 * run resets it; the first run after the cause is fixed is at most that
 * long away.
 */
@Injectable()
export class SyncSchedulerService {
  private readonly logger = new Logger(SyncSchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly synchronizationService: SynchronizationService,
    private readonly configService: ConfigService<EnvConfig, true>,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async tick(): Promise<void> {
    if (!this.configService.get('SYNC_SCHEDULER_ENABLED', { infer: true })) {
      return;
    }

    const projects = await this.prisma.project.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, syncIntervalMinutes: true },
    });

    for (const project of projects) {
      const recentRuns = await this.prisma.syncRun.findMany({
        where: { projectId: project.id },
        orderBy: { startedAt: 'desc' },
        take: FAILURE_STREAK_WINDOW,
        select: { startedAt: true, status: true },
      });
      const lastRun = recentRuns[0];
      let failureStreak = 0;
      while (
        failureStreak < recentRuns.length &&
        recentRuns[failureStreak].status === 'FAILED'
      ) {
        failureStreak += 1;
      }
      const backoffFactor = Math.min(2 ** failureStreak, MAX_BACKOFF_FACTOR);

      const dueAt = lastRun
        ? new Date(
            lastRun.startedAt.getTime() +
              project.syncIntervalMinutes * backoffFactor * 60_000,
          )
        : new Date(0);
      if (dueAt > new Date()) {
        continue;
      }

      try {
        await this.synchronizationService.runSync(project.id, 'SCHEDULED');
      } catch (error) {
        this.logger.error(
          `Scheduled sync failed for project ${project.id}: ${String(error)}`,
        );
      }
    }
  }
}
