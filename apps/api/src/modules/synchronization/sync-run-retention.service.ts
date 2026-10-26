import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import type { EnvConfig } from '../../config/env.validation.js';
import { PrismaService } from '../../prisma/prisma.service.js';

export interface SyncRunRetentionResult {
  /** The projects that lost at least one run. */
  projects: number;
  deleted: number;
}

/**
 * Every synchronization writes a `SyncRun`, about 230 a project a day with the scheduler on (Roadmap TASK-50). This
 * keeps the newest `SYNC_RUN_RETENTION` runs of each project and deletes the older ones, **except the runs that
 * failed**, which stay however old: they are the ones worth reading later. The count is per project, so a busy one
 * never costs a quiet one its history. Nothing holds a foreign key to a run (a notification carries its id as plain
 * JSON), so trimming old ones breaks no pointer. Runs daily at 03:30 UTC, off the request path; `0` keeps everything.
 */
@Injectable()
export class SyncRunRetentionService {
  private readonly logger = new Logger(SyncRunRetentionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  @Cron('30 3 * * *', { timeZone: 'UTC' })
  async scheduled(): Promise<void> {
    try {
      const { projects, deleted } = await this.prune();
      if (deleted > 0) {
        this.logger.log(
          `Deleted ${deleted} old sync run(s) across ${projects} project(s)`,
        );
      }
    } catch (error) {
      this.logger.error(`Sync run retention failed: ${String(error)}`);
    }
  }

  /**
   * `keep` overrides the configured count and `projectIds` limits the run to those projects (for tests and one-off
   * runs).
   */
  async prune(
    options: { keep?: number; projectIds?: readonly string[] } = {},
  ): Promise<SyncRunRetentionResult> {
    const keep: number =
      options.keep ??
      this.config.getOrThrow('SYNC_RUN_RETENTION', { infer: true });
    if (keep <= 0) {
      return { projects: 0, deleted: 0 };
    }
    const projects = await this.prisma.project.findMany({
      where: options.projectIds ? { id: { in: [...options.projectIds] } } : {},
      select: { id: true },
    });
    let deleted = 0;
    let touched = 0;
    for (const { id: projectId } of projects) {
      try {
        const removed = await this.pruneProject(projectId, keep);
        deleted += removed;
        if (removed > 0) {
          touched += 1;
        }
      } catch (error) {
        // One project's failure never stops the others.
        this.logger.error(
          `Sync run retention failed for project ${projectId}: ${String(error)}`,
        );
      }
    }
    return { projects: touched, deleted };
  }

  /**
   * The newest `keep` runs stay whatever they are; of the older ones, a failed run stays and the rest go. The
   * boundary is the start time of the `keep`-th newest run, so runs that share it are kept rather than cut in two.
   */
  private async pruneProject(projectId: string, keep: number): Promise<number> {
    const boundary = await this.prisma.syncRun.findFirst({
      where: { projectId },
      orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
      skip: keep - 1,
      select: { startedAt: true },
    });
    if (!boundary) {
      return 0;
    }
    const result = await this.prisma.syncRun.deleteMany({
      where: {
        projectId,
        startedAt: { lt: boundary.startedAt },
        status: { not: 'FAILED' },
      },
    });
    return result.count;
  }
}
