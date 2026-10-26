import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { COUNTS_TOWARDS_PROGRESS } from '../tasks/progress-rollup.service.js';
import { DEFAULT_WEEKS } from './dto/pace-query.dto.js';
import {
  paceOf,
  type Forecast,
  type PhaseBurnUp,
  type WeekPoint,
} from './pace.util.js';

export interface PhasePace extends PhaseBurnUp {
  /** Null for the tasks that belong to no phase. */
  name: string | null;
}

export interface ProjectPace {
  /** The moment the figures were read: the week in progress is partial up to it. */
  generatedAt: string;
  weeks: WeekPoint[];
  byPhase: PhasePace[];
  forecast: Forecast;
}

/**
 * The pace of a project (Roadmap TASK-36): the weekly figures, the burn-up and the forecast of
 * `paceOf` over the tasks that count towards the progress, with the phases' names. It only reads.
 */
@Injectable()
export class PaceService {
  constructor(private readonly prisma: PrismaService) {}

  async forProject(
    projectId: string,
    weeks: number = DEFAULT_WEEKS,
    now: Date = new Date(),
  ): Promise<ProjectPace> {
    const [tasks, phases] = await Promise.all([
      this.prisma.task.findMany({
        where: { projectId, ...COUNTS_TOWARDS_PROGRESS },
        select: { createdAt: true, completedAt: true, phaseId: true },
      }),
      this.prisma.phase.findMany({
        where: { projectId },
        select: { id: true, name: true, order: true },
      }),
    ]);
    const phaseOf = new Map(phases.map((phase) => [phase.id, phase]));
    const pace = paceOf(tasks, weeks, now);
    // The phases in their own order, as the board shows them, and the tasks of none last.
    const rank = (phaseId: string | null) =>
      phaseId === null
        ? Number.MAX_SAFE_INTEGER
        : (phaseOf.get(phaseId)?.order ?? Number.MAX_SAFE_INTEGER - 1);
    return {
      generatedAt: now.toISOString(),
      weeks: pace.weeks,
      byPhase: pace.byPhase
        .map((line) => ({
          ...line,
          name:
            line.phaseId === null
              ? null
              : (phaseOf.get(line.phaseId)?.name ?? null),
        }))
        .sort((a, b) => rank(a.phaseId) - rank(b.phaseId)),
      forecast: pace.forecast,
    };
  }
}
