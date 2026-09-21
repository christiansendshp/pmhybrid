import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../prisma/prisma.service.js';
import { ProgressRollupService } from './progress-rollup.service.js';

describe('ProgressRollupService batching (Roadmap IMPROVEMENT-01c)', () => {
  function setup(
    tasksByProject: Record<string, { id: string; status: string }[]>,
  ) {
    const idsPerQuery: number[] = [];
    const findTasks = vi.fn(
      ({ where }: { where: { projectId: { in: string[] } } }) => {
        idsPerQuery.push(where.projectId.in.length);
        return Promise.resolve(
          where.projectId.in.flatMap((projectId) =>
            (tasksByProject[projectId] ?? []).map((task) => ({
              ...task,
              projectId,
              parentTaskId: null,
              phaseId: null,
              epicId: null,
              progressPercent: null,
            })),
          ),
        );
      },
    );
    const prisma = {
      task: { findMany: findTasks },
      epic: { findMany: vi.fn().mockResolvedValue([]) },
      phase: { findMany: vi.fn().mockResolvedValue([]) },
    };
    return {
      service: new ProgressRollupService(prisma as unknown as PrismaService),
      idsPerQuery,
      prisma,
    };
  }

  it('never puts more than 5000 ids in one query, however many projects there are', async () => {
    const ids = Array.from({ length: 12_000 }, (_, index) => `p${index}`);
    const { service, idsPerQuery } = setup({
      p0: [{ id: 't0', status: 'TERMINADA' }],
    });

    const progress = await service.computeProjectsProgress(ids);

    expect(idsPerQuery).toEqual([5000, 5000, 2000]);
    expect(progress.size).toBe(12_000);
    expect(progress.get('p0')).toBe(100);
    // A project with nothing to average is null, not 0.
    expect(progress.get('p1')).toBeNull();
  });

  it('reads once for a whole list of tasks of one project', async () => {
    const { service, prisma } = setup({
      p1: [
        { id: 'a', status: 'TERMINADA' },
        { id: 'b', status: 'EN_DESARROLLO' },
        { id: 'c', status: 'PENDIENTE' },
      ],
    });

    const progress = await service.computeTasksProgress([
      { id: 'a', projectId: 'p1' },
      { id: 'b', projectId: 'p1' },
      { id: 'c', projectId: 'p1' },
      { id: 'gone', projectId: 'p1' },
    ]);

    expect(prisma.task.findMany).toHaveBeenCalledTimes(1);
    expect([...progress]).toEqual([
      ['a', 100],
      ['b', 50],
      ['c', 0],
    ]);
  });

  it('answers nothing, and reads nothing, for no projects', async () => {
    const { service, prisma } = setup({});

    expect((await service.computeProjectsProgress([])).size).toBe(0);
    expect(prisma.task.findMany).not.toHaveBeenCalled();
  });
});
