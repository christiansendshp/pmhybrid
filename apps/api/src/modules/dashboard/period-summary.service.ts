import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import {
  periodStart,
  startOfUtcDay,
  summaryDueOn,
} from './period-summary.util.js';
import { SinceVisitService } from './since-visit.service.js';
import { hasNews } from './since-visit.util.js';

/**
 * The summary of what changed in each of a person's projects, in the app only (Roadmap TASK-42, DEC-004 D3): one
 * `PERIOD_SUMMARY` notification per project with news, made at 07:00 UTC from the same builder as "Desde tu última
 * visita", over the last day or the last 7 days. Only a person is sent one, never an agent; `summaryLastSentAt`
 * keeps a restart, or a second run on the same day, from sending it twice.
 */
@Injectable()
export class PeriodSummaryService {
  private readonly logger = new Logger(PeriodSummaryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sinceVisit: SinceVisitService,
    private readonly notifications: NotificationsService,
  ) {}

  @Cron('0 7 * * *', { timeZone: 'UTC' })
  async scheduled(): Promise<void> {
    try {
      const { summaries } = await this.sendDue(new Date());
      if (summaries > 0) {
        this.logger.log(`Made ${summaries} summary notification(s)`);
      }
    } catch (error) {
      this.logger.error(`The periodic summary failed: ${String(error)}`);
    }
  }

  /** Makes the summaries due on the day of `now`, for the people named or for everyone. */
  async sendDue(
    now: Date,
    onlyActorIds?: readonly string[],
  ): Promise<{ summaries: number }> {
    const actors = await this.prisma.actor.findMany({
      where: {
        kind: 'HUMAN',
        isActive: true,
        summaryFrequency: { not: 'NONE' },
        ...(onlyActorIds ? { id: { in: [...onlyActorIds] } } : {}),
      },
      select: { id: true, summaryFrequency: true },
    });
    const today = startOfUtcDay(now);
    let summaries = 0;
    for (const actor of actors) {
      const period = summaryDueOn(actor.summaryFrequency, now);
      if (!period) {
        continue;
      }
      try {
        // Claimed before it is made: of two runs at once only one finds the marker behind today.
        const claimed = await this.prisma.actor.updateMany({
          where: {
            id: actor.id,
            OR: [
              { summaryLastSentAt: null },
              { summaryLastSentAt: { lt: today } },
            ],
          },
          data: { summaryLastSentAt: now },
        });
        if (claimed.count !== 1) {
          continue;
        }
        summaries += await this.sendTo(
          actor.id,
          period,
          periodStart(period, now),
        );
      } catch (error) {
        this.logger.error(
          `The summary of actor ${actor.id} failed: ${String(error)}`,
        );
      }
    }
    return { summaries };
  }

  private async sendTo(
    actorId: string,
    period: 'DAILY' | 'WEEKLY',
    since: Date,
  ): Promise<number> {
    const memberships = await this.prisma.projectMember.findMany({
      where: { actorId, isActive: true, project: { status: 'ACTIVE' } },
      select: { project: { select: { id: true, name: true } } },
    });
    const news = (
      await Promise.all(
        memberships.map(({ project }) =>
          this.sinceVisit.newsOf(project.id, project.name, since),
        ),
      )
    ).filter(hasNews);
    for (const project of news) {
      await this.notifications.notifyActors(
        [actorId],
        project.projectId,
        'PERIOD_SUMMARY',
        {
          period,
          since: project.since,
          projectName: project.name,
          done: project.done.count,
          blocked: project.blocked.count,
          unblocked: project.unblocked.count,
          newScope: project.newScope.count,
          conflicts: project.conflicts,
        },
      );
    }
    return news.length;
  }
}
