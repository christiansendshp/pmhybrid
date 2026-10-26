import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { TASKS_WRITTEN_EVENT } from '../../common/events.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { COUNTS_TOWARDS_PROGRESS } from '../tasks/progress-rollup.service.js';
import { NotificationsService } from './notifications.service.js';
import { phaseVerdict, tallyPhases } from './phase-completion.util.js';

interface ProjectEventPayload {
  projectId: string;
}

/**
 * Tells the members when the last open work task of a phase is done (Roadmap TASK-41), whether a sync or a write
 * in the app did it. After either, it counts the work tasks of each phase: a complete phase that was not announced
 * is announced once, and one that has an open task again forgets it was, so finishing it again is announced again.
 * The marker is claimed with a conditional update, so two checks at once announce once.
 */
@Injectable()
export class PhaseCompletionService {
  private readonly logger = new Logger(PhaseCompletionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  @OnEvent(TASKS_WRITTEN_EVENT)
  @OnEvent('sync.completed')
  async onProjectChanged({ projectId }: ProjectEventPayload): Promise<void> {
    try {
      await this.check(projectId);
    } catch (error) {
      // Never lets the announcement change what the write or the sync itself answers.
      this.logger.error(
        `Could not check the phases of project ${projectId}: ${String(error)}`,
      );
    }
  }

  async check(projectId: string): Promise<void> {
    const phases = await this.prisma.phase.findMany({
      where: { projectId },
      select: { id: true, name: true, completionNotifiedAt: true },
    });
    if (phases.length === 0) {
      return;
    }
    const groups = await this.prisma.task.groupBy({
      by: ['phaseId', 'status'],
      where: {
        projectId,
        phaseId: { not: null },
        ...COUNTS_TOWARDS_PROGRESS,
      },
      _count: { _all: true },
    });
    const tallies = tallyPhases(
      groups.map((group) => ({
        phaseId: group.phaseId,
        status: group.status,
        count: group._count._all,
      })),
    );

    for (const phase of phases) {
      const verdict = phaseVerdict(
        tallies.get(phase.id),
        phase.completionNotifiedAt !== null,
      );
      if (verdict === 'REOPEN') {
        await this.prisma.phase.updateMany({
          where: { id: phase.id, completionNotifiedAt: { not: null } },
          data: { completionNotifiedAt: null },
        });
      } else if (verdict === 'ANNOUNCE') {
        const claimed = await this.prisma.phase.updateMany({
          where: { id: phase.id, completionNotifiedAt: null },
          data: { completionNotifiedAt: new Date() },
        });
        if (claimed.count === 1) {
          await this.notifications.notifyProjectMembers(
            projectId,
            'PHASE_COMPLETED',
            { phaseId: phase.id, name: phase.name },
          );
        }
      }
    }
  }
}
