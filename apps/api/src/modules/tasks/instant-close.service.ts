import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  DEFAULT_INSTANT_CLOSE_MINUTES,
  InstantCloseMetrics,
  instantCloseMetrics,
  isInstantClose,
  TaskLifeSpan,
} from './instant-close.util.js';

/**
 * Instant closes from the Agentslog (Roadmap TASK-12): a task's first IN_PROGRESS entry and its
 * last DONE entry, as the agent wrote them (`timestampFromLog`, the agent's own clock: the same
 * figure the plan's appendix computes). Read-only; it changes nothing and blocks nothing.
 */
@Injectable()
export class InstantCloseService {
  constructor(private readonly prisma: PrismaService) {}

  private async thresholdOf(projectId: string): Promise<number> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { instantCloseMinutes: true },
    });
    return project?.instantCloseMinutes ?? DEFAULT_INSTANT_CLOSE_MINUTES;
  }

  /** First start and last close per Roadmap ID, for the given IDs or for every one the ledger has. */
  private async spansOf(
    projectId: string,
    externalIds?: string[],
  ): Promise<Map<string, TaskLifeSpan>> {
    const where = {
      projectId,
      taskExternalId: externalIds ? { in: externalIds } : { not: null },
    };
    const [starts, closes] = await Promise.all([
      this.prisma.agentLogEvent.groupBy({
        by: ['taskExternalId'],
        where: { ...where, statusWord: { startsWith: 'IN_PROGRESS' } },
        _min: { timestampFromLog: true },
      }),
      this.prisma.agentLogEvent.groupBy({
        by: ['taskExternalId'],
        where: { ...where, statusWord: 'DONE' },
        _max: { timestampFromLog: true },
      }),
    ]);
    const spans = new Map<string, TaskLifeSpan>();
    const span = (id: string) => {
      const found = spans.get(id) ?? { startedAt: null, doneAt: null };
      spans.set(id, found);
      return found;
    };
    for (const row of starts) {
      if (row.taskExternalId) {
        span(row.taskExternalId).startedAt = row._min.timestampFromLog;
      }
    }
    for (const row of closes) {
      if (row.taskExternalId) {
        span(row.taskExternalId).doneAt = row._max.timestampFromLog;
      }
    }
    return spans;
  }

  /** The Roadmap IDs among `externalIds` that were closed instantly. */
  async flagged(
    projectId: string,
    externalIds: (string | null)[],
  ): Promise<Set<string>> {
    const ids = [...new Set(externalIds.filter((id): id is string => !!id))];
    if (ids.length === 0) {
      return new Set();
    }
    const [threshold, spans] = await Promise.all([
      this.thresholdOf(projectId),
      this.spansOf(projectId, ids),
    ]);
    return new Set(
      [...spans]
        .filter(([, span]) => isInstantClose(span, threshold))
        .map(([id]) => id),
    );
  }

  /** The project's figures: how many tasks the ledger shows closed, how many of them instantly, and the share. */
  async metrics(
    projectId: string,
  ): Promise<{ instantClose: InstantCloseMetrics }> {
    const [threshold, spans] = await Promise.all([
      this.thresholdOf(projectId),
      this.spansOf(projectId),
    ]);
    return { instantClose: instantCloseMetrics(spans.values(), threshold) };
  }
}
