import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { AuditService } from '../audit/audit.service.js';
import type { ProgressRollupService } from '../tasks/progress-rollup.service.js';
import { ProjectsService } from './projects.service.js';

/**
 * "My Projects" ran six queries per project, all projects at once, so an
 * account with a few thousand projects exhausted the connection pool and the
 * list answered 500 (Roadmap IMPROVEMENT-01c). The count of queries must not
 * depend on the number of projects.
 */
function setup(projectCount: number) {
  const projects = Array.from({ length: projectCount }, (_, index) => ({
    id: `p${index}`,
    name: `Project ${index}`,
    lead: null,
  }));
  const calls: Record<string, number> = {};
  const counted = <T>(name: string, result: T) =>
    vi.fn(() => {
      calls[name] = (calls[name] ?? 0) + 1;
      return Promise.resolve(result);
    });
  const prisma = {
    project: { findMany: counted('project.findMany', projects) },
    task: {
      groupBy: vi
        .fn()
        // First call: active tasks; second: overdue tasks.
        .mockResolvedValueOnce([{ projectId: 'p1', _count: { _all: 4 } }])
        .mockResolvedValueOnce([{ projectId: 'p1', _count: { _all: 1 } }]),
      findMany: counted('task.findMany', [
        { projectId: 'p1' },
        { projectId: 'p1' },
        { projectId: 'p2' },
      ]),
    },
    conflict: {
      groupBy: counted('conflict.groupBy', [
        { projectId: 'p2', _count: { _all: 3 } },
      ]),
    },
    syncRun: {
      findMany: counted('syncRun.findMany', [
        {
          projectId: 'p1',
          status: 'PARTIAL',
          startedAt: new Date('2026-09-21T10:00:00Z'),
          finishedAt: new Date('2026-09-21T10:00:02Z'),
        },
      ]),
    },
  };
  const computeProjectsProgress = counted(
    'progress',
    new Map<string, number | null>([['p1', 40]]),
  );
  const service = new ProjectsService(
    prisma as unknown as PrismaService,
    {} as AuditService,
    { computeProjectsProgress } as unknown as ProgressRollupService,
    {} as never,
  );
  return { service, prisma, calls };
}

describe('ProjectsService.findAllForActor summaries (Roadmap IMPROVEMENT-01c)', () => {
  it('runs the same number of queries for 3 projects as for 3000', async () => {
    const few = setup(3);
    const many = setup(3000);

    await few.service.findAllForActor('actor');
    await many.service.findAllForActor('actor');

    // project list + progress + 2 task groupBy + agents findMany + conflicts + last runs.
    for (const run of [few, many]) {
      expect(run.prisma.task.groupBy).toHaveBeenCalledTimes(2);
      expect(run.calls).toEqual({
        'project.findMany': 1,
        progress: 1,
        'task.findMany': 1,
        'conflict.groupBy': 1,
        'syncRun.findMany': 1,
      });
    }
  });

  it('assigns each figure to its own project, and zeros or null to the rest', async () => {
    const { service } = setup(3);

    const [first, second, third] = await service.findAllForActor('actor');

    expect(first.summary).toEqual({
      progress: null,
      activeTasks: 0,
      overdueTasks: 0,
      activeAgents: 0,
      openConflicts: 0,
      lastSyncRun: null,
    });
    expect(second.summary).toMatchObject({
      progress: 40,
      activeTasks: 4,
      overdueTasks: 1,
      activeAgents: 2, // two distinct active agents on p1
      openConflicts: 0,
      lastSyncRun: { status: 'PARTIAL' },
    });
    expect(third.summary).toMatchObject({ activeAgents: 1, openConflicts: 3 });
  });

  it('answers an account with no projects without touching the summary queries', async () => {
    const { service, prisma } = setup(0);

    expect(await service.findAllForActor('actor')).toEqual([]);
    expect(prisma.task.groupBy).not.toHaveBeenCalled();
  });
});
