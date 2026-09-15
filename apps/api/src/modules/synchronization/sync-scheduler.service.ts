import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { EnvConfig } from '../../config/env.validation.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { SynchronizationService } from './synchronization.service.js';

/**
 * Scheduled trigger (docs/synchronization.md "Trigger"): every minute,
 * sync any active project where now - lastSyncedAt >= syncIntervalMinutes.
 * "lastSyncedAt" has no dedicated Project column — derived from the most
 * recent SyncRun per project (never-synced = always due). Turned off with
 * SYNC_SCHEDULER_ENABLED=false; manual sync is unaffected.
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
      const lastRun = await this.prisma.syncRun.findFirst({
        where: { projectId: project.id },
        orderBy: { startedAt: 'desc' },
        select: { startedAt: true },
      });

      const dueAt = lastRun
        ? new Date(
            lastRun.startedAt.getTime() + project.syncIntervalMinutes * 60_000,
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
