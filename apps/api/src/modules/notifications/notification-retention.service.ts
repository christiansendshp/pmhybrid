import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import type { EnvConfig } from '../../config/env.validation.js';
import { PrismaService } from '../../prisma/prisma.service.js';

const DAY = 24 * 60 * 60 * 1000;

/**
 * A notification stays in the table after it is read, and the list asks only for the newest 50 (Roadmap TASK-51).
 * This deletes the ones that were **read** more than `NOTIFICATION_RETENTION_DAYS` days ago (counted from `readAt`,
 * not from when they were made) and **never an unread one**, however old: nobody has seen it yet. Daily at 03:40
 * UTC, off the request path; `0` keeps everything.
 */
@Injectable()
export class NotificationRetentionService {
  private readonly logger = new Logger(NotificationRetentionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  @Cron('40 3 * * *', { timeZone: 'UTC' })
  async scheduled(): Promise<void> {
    try {
      const { deleted } = await this.prune(new Date());
      if (deleted > 0) {
        this.logger.log(`Deleted ${deleted} old read notification(s)`);
      }
    } catch (error) {
      this.logger.error(`Notification retention failed: ${String(error)}`);
    }
  }

  /** `days` overrides the configured limit, and `actorIds` limits the run to those people's notifications (for tests and one-off runs). */
  async prune(
    now: Date,
    options: { days?: number; actorIds?: readonly string[] } = {},
  ): Promise<{ deleted: number }> {
    const days: number =
      options.days ??
      this.config.getOrThrow('NOTIFICATION_RETENTION_DAYS', { infer: true });
    if (days <= 0) {
      return { deleted: 0 };
    }
    const result = await this.prisma.notification.deleteMany({
      where: {
        readAt: { lt: new Date(now.getTime() - days * DAY) },
        ...(options.actorIds ? { actorId: { in: [...options.actorIds] } } : {}),
      },
    });
    return { deleted: result.count };
  }
}
